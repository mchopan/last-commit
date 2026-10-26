import http from 'node:http';
import { randomBytes, randomInt, timingSafeEqual } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createMatch, submitAction, resolveRound, castPolicyVote, closePolicyVote, getPublicState, getPrivatePlayerState } from './dist/game/engine.js';
import { CRISES, POLICIES, ROLE_IDS } from './dist/game/content.js';

const ROOT = fileURLToPath(new URL('.', import.meta.url));
const PORT = Number(process.env.PORT || 3000);
const rooms = new Map();
const sessions = new Map();
const MAX_BODY = 16_384;
const ROOM_TTL_MS = 60 * 60 * 1000;
const FAST_TIMERS = process.env.LAST_COMMIT_FAST_TIMERS === '1';
const PHASE_MS = FAST_TIMERS ? { BRIEFING: 15, DISCUSSION: 20, COMMIT: 20, RESOLUTION: 10 } : { BRIEFING: 15_000, DISCUSSION: 45_000, COMMIT: 20_000, RESOLUTION: 4_500 };
const VOTE_MS = FAST_TIMERS ? 20 : 15_000;

function code() { const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; return Array.from({ length: 6 }, () => alphabet[randomInt(alphabet.length)]).join(''); }
function token() { return randomBytes(32).toString('base64url'); }
function safeEqual(a, b) { const aa = Buffer.from(String(a || '')); const bb = Buffer.from(String(b || '')); return aa.length === bb.length && timingSafeEqual(aa, bb); }
function send(res, status, body) { res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' }); res.end(JSON.stringify(body)); }
async function body(req) { let raw = ''; for await (const chunk of req) { raw += chunk; if (raw.length > MAX_BODY) throw Object.assign(new Error('Request too large'), { status: 413 }); } try { return raw ? JSON.parse(raw) : {}; } catch { throw Object.assign(new Error('Invalid JSON'), { status: 400 }); } }
function roomPublic(room) { return { code: room.code, hostId: room.hostId, locked: room.locked, players: room.seats.map(s => ({ id: s.id, nickname: s.nickname, faction: s.faction || null, role: s.role || null, connected: s.connected })), match: room.match ? { ...getPublicState(room.match), results: room.match.results ?? null } : null, deadline: room.deadline, readyCount: room.ready.size }; }
function emit(room, event = 'state') { const payload = JSON.stringify({ event, state: roomPublic(room) }); for (const res of room.subscribers) { try { res.write(`data: ${payload}\n\n`); } catch {} } }
function emitPrivate(room, seat) { const payload = JSON.stringify({ event: 'private', player: room.match ? getPrivatePlayerState(room.match, seat.id) : null, session: seat.id }); for (const res of room.subscribers) if (res.__seatId === seat.id) { try { res.write(`data: ${payload}\n\n`); } catch {} } }
function getAuth(req) { const auth = req.headers.authorization || ''; return auth.startsWith('Bearer ') ? auth.slice(7) : ''; }
function getSeat(req, roomCode) { const t = getAuth(req); const s = sessions.get(t); if (!s || s.roomCode !== roomCode) return null; const r = rooms.get(roomCode); const seat = r?.seats.find(p => p.id === s.seatId); return r && seat ? { room: r, seat, sessionToken: t } : null; }
function createRoom(hostName) {
  let c; do { c = code(); } while (rooms.has(c));
  const id = randomBytes(12).toString('hex'); const session = token();
  const seat = { id, nickname: hostName, faction: null, role: null, secretObjectiveId: `OBJ_${randomInt(1, 9)}`, connected: true, token: session };
  const room = { code: c, hostId: id, seats: [seat], locked: false, match: null, subscribers: new Set(), ready: new Set(), deadline: null, timer: null, lastActivity: Date.now() };
  rooms.set(c, room); sessions.set(session, { roomCode: c, seatId: id }); return { room, seat, session };
}
function schedule(room, phase, duration) {
  if (room.timer) clearTimeout(room.timer);
  room.deadline = Date.now() + duration;
  if (room.match) room.match.phase = phase;
  emit(room, 'phase');
  room.timer = setTimeout(() => onDeadline(room), duration);
  room.timer.unref?.();
}
function startMatch(room) {
  if (room.seats.length < 3 || room.seats.length > 6) throw Object.assign(new Error('A match needs 3–6 players.'), { status: 400 });
  room.locked = true;
  const ordered = [...room.seats].sort((a, b) => a.id.localeCompare(b.id));
  ordered.forEach((seat, i) => { seat.faction = i < Math.ceil(ordered.length / 2) ? 'HUMAN' : 'AI'; seat.role = ROLE_IDS[i % ROLE_IDS.length]; });
  room.match = createMatch({ id: room.code, seed: randomInt(1, 0x7fffffff), players: ordered.map(s => ({ id: s.id, nickname: s.nickname, faction: s.faction, role: s.role, secretObjectiveId: s.secretObjectiveId })) });
  room.match.phase = 'BRIEFING';
  schedule(room, 'BRIEFING', PHASE_MS.BRIEFING);
}
function onDeadline(room) {
  if (!room.match || room.match.phase === 'RESULTS') return;
  const phase = room.match.phase;
  if (phase === 'BRIEFING') { room.ready.clear(); schedule(room, 'DISCUSSION', PHASE_MS.DISCUSSION); }
  else if (phase === 'DISCUSSION') schedule(room, 'COMMIT', PHASE_MS.COMMIT);
  else if (phase === 'COMMIT' || phase === 'RESCUE') {
    const resolvingCrisis = CRISES.find(c => c.id === room.match.currentCrisisId);
    const actions = Object.fromEntries(room.seats.map(s => [s.id, room.match.acceptedActions[s.id]?.action || 'RECOVER']));
    const result = resolveRound(room.match, actions);
    room.match = result.state;
    emit(room, 'resolution');
    if (room.match.phase === 'RESULTS') { room.deadline = null; emit(room, 'results'); }
    else if (room.match.phase === 'RESCUE') schedule(room, 'RESCUE', PHASE_MS.DISCUSSION);
    else if (resolvingCrisis?.policyVote && phase !== 'RESCUE') { room.match.phase = 'VOTE'; schedule(room, 'VOTE', VOTE_MS); }
    else schedule(room, 'BRIEFING', PHASE_MS.BRIEFING);
  } else if (phase === 'VOTE') { room.match = closePolicyVote(room.match); schedule(room, 'BRIEFING', PHASE_MS.BRIEFING); }
}
function cleanup() {
  const now = Date.now();
  for (const [c, r] of rooms) if (now - r.lastActivity > ROOM_TTL_MS && r.subscribers.size === 0) { if (r.timer) clearTimeout(r.timer); rooms.delete(c); for (const [t, s] of sessions) if (s.roomCode === c) sessions.delete(t); }
}
setInterval(cleanup, 60_000).unref?.();

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
    if (req.method === 'GET' && url.pathname === '/health') return send(res, 200, { ok: true, rooms: rooms.size });
    if (req.method === 'POST' && url.pathname === '/api/rooms') {
      const data = await body(req); const nickname = String(data.nickname || '').trim().slice(0, 20);
      if (nickname.length < 2) return send(res, 400, { error: 'Nickname must be 2–20 characters.' });
      const { room, seat, session } = createRoom(nickname); emit(room); return send(res, 201, { code: room.code, playerId: seat.id, token: session, state: roomPublic(room) });
    }
    const joinMatch = url.pathname.match(/^\/api\/rooms\/([A-Z0-9]{6})\/join$/);
    if (req.method === 'POST' && joinMatch) {
      const room = rooms.get(joinMatch[1]); if (!room || room.locked) return send(res, 404, { error: 'Room unavailable or already started.' });
      if (room.seats.length >= 6) return send(res, 409, { error: 'Room is full.' });
      const data = await body(req); const nickname = String(data.nickname || '').trim().slice(0, 20);
      if (nickname.length < 2) return send(res, 400, { error: 'Nickname must be 2–20 characters.' });
      const id = randomBytes(12).toString('hex'); const session = token(); const seat = { id, nickname, faction: null, role: null, secretObjectiveId: `OBJ_${randomInt(1, 9)}`, connected: true, token: session };
      room.seats.push(seat); room.lastActivity = Date.now(); sessions.set(session, { roomCode: room.code, seatId: id }); emit(room); return send(res, 201, { code: room.code, playerId: id, token: session, state: roomPublic(room) });
    }
    const roomGetMatch = url.pathname.match(/^\/api\/rooms\/([A-Z0-9]{6})$/);
    if (req.method === 'GET' && roomGetMatch) {
      const auth = getSeat(req, roomGetMatch[1]); if (!auth) return send(res, 401, { error: 'Invalid room session.' });
      return send(res, 200, { state: roomPublic(auth.room) });
    }
    const streamMatch = url.pathname.match(/^\/api\/rooms\/([A-Z0-9]{6})\/events$/);
    if (req.method === 'GET' && streamMatch) {
      const auth = getSeat(req, streamMatch[1]); if (!auth) return send(res, 401, { error: 'Invalid room session.' });
      res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-cache, no-transform', connection: 'keep-alive', 'x-accel-buffering': 'no' });
      const room = auth.room; res.__seatId = auth.seat.id; room.subscribers.add(res); auth.seat.connected = true; room.lastActivity = Date.now();
      res.write(`retry: 1500\ndata: ${JSON.stringify({ event: 'state', state: roomPublic(room) })}\n\n`);
      if (room.match) res.write(`data: ${JSON.stringify({ event: 'private', player: getPrivatePlayerState(room.match, auth.seat.id), session: auth.seat.id })}\n\n`);
      const heartbeat = setInterval(() => { try { res.write(': keepalive\n\n'); } catch {} }, 20_000);
      res.on('close', () => { clearInterval(heartbeat); room.subscribers.delete(res); auth.seat.connected = false; room.lastActivity = Date.now(); emit(room, 'connection'); }); return;
    }
    const actionMatch = url.pathname.match(/^\/api\/rooms\/([A-Z0-9]{6})\/(start|ready|action|vote|rematch)$/);
    if (req.method === 'POST' && actionMatch) {
      const auth = getSeat(req, actionMatch[1]); if (!auth) return send(res, 401, { error: 'Invalid room session.' });
      const { room, seat } = auth; room.lastActivity = Date.now(); const operation = actionMatch[2]; const data = await body(req);
      if (operation === 'rematch') {
        if (seat.id !== room.hostId) return send(res, 403, { error: 'Only the host can start a rematch.' });
        if (!room.match || room.match.phase !== 'RESULTS') return send(res, 409, { error: 'Rematch is only available after results.' });
        if (room.timer) clearTimeout(room.timer);
        room.timer = null; room.deadline = null; room.locked = false; room.ready.clear(); room.match = null;
        for (const player of room.seats) { player.faction = null; player.role = null; player.secretObjectiveId = `OBJ_${randomInt(1, 9)}`; }
        emit(room, 'rematch'); return send(res, 200, { state: roomPublic(room) });
      }
      if (operation === 'start') {
        if (seat.id !== room.hostId) return send(res, 403, { error: 'Only the host can start the match.' });
        if (room.locked) return send(res, 409, { error: 'Match already started.' });
        startMatch(room); emit(room, 'started'); return send(res, 200, { state: roomPublic(room) });
      }
      if (operation === 'ready') {
        if (!room.match || room.match.phase !== 'DISCUSSION') return send(res, 409, { error: 'Ready is only available during discussion.' });
        room.ready.add(seat.id); emit(room, 'ready');
        if (room.ready.size === room.seats.length) { room.ready.clear(); schedule(room, 'COMMIT', PHASE_MS.COMMIT); }
        return send(res, 200, { ok: true });
      }
      if (operation === 'vote') {
        if (!room.match || room.match.phase !== 'VOTE') return send(res, 409, { error: 'Voting is not open.' });
        room.match = castPolicyVote(room.match, seat.id, data.policyId); emit(room, 'vote'); return send(res, 200, { ok: true });
      }
      if (operation === 'action') {
        if (!room.match) return send(res, 409, { error: 'Match has not started.' });
        room.match = submitAction(room.match, seat.id, data.action, Date.now()); emit(room, 'action'); emitPrivate(room, seat); return send(res, 200, { ok: true });
      }
    }
    if (req.method === 'GET') {
      const path = normalize(decodeURIComponent(url.pathname)).replace(/^\.\.(\/|\\|$)/, '');
      const filePath = path === '/' ? join(ROOT, 'public', 'index.html') : join(ROOT, 'public', path.replace(/^\/+/, ''));
      if (!filePath.startsWith(join(ROOT, 'public'))) return send(res, 403, { error: 'Forbidden' });
      try { const data = await readFile(filePath); const types = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.svg': 'image/svg+xml' }; res.writeHead(200, { 'content-type': types[extname(filePath)] || 'application/octet-stream', 'x-content-type-options': 'nosniff' }); return res.end(data); }
      catch { return send(res, 404, { error: 'Not found' }); }
    }
    return send(res, 404, { error: 'Not found' });
  } catch (error) { return send(res, error.status || 500, { error: error.message || 'Internal server error' }); }
});
server.listen(PORT, () => console.log(`LAST COMMIT listening on http://localhost:${PORT}`));
