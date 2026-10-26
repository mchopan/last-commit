import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';
import { randomInt } from 'node:crypto';

async function waitForServer(base, proc) {
  for (let i = 0; i < 60; i++) {
    if (proc.exitCode !== null) throw new Error('server exited before readiness');
    try { const r = await fetch(`${base}/health`); if (r.ok) return; } catch {}
    await sleep(100);
  }
  throw new Error('server readiness timeout');
}

test('HTTP room flow: health, create, join, host authorization, start, static UI, SSE', async (t) => {
  const port = randomInt(31000, 39000);
  const base = `http://127.0.0.1:${port}`;
  const proc = spawn(process.execPath, ['server.mjs'], { cwd: new URL('..', import.meta.url), env: { ...process.env, PORT: String(port) }, stdio: 'ignore' });
  t.after(() => { proc.kill('SIGTERM'); });
  await waitForServer(base, proc);
  assert.equal((await fetch(`${base}/health`).then(r => r.json())).ok, true);
  const createRes = await fetch(`${base}/api/rooms`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ nickname: 'Host' }) });
  assert.equal(createRes.status, 201);
  const host = await createRes.json();
  assert.match(host.code, /^[A-Z0-9]{6}$/);
  const forbidden = await fetch(`${base}/api/rooms/${host.code}/start`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' });
  assert.equal(forbidden.status, 401);
  const join = async (nickname) => {
    const res = await fetch(`${base}/api/rooms/${host.code}/join`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ nickname }) });
    assert.equal(res.status, 201); return res.json();
  };
  const guest2 = await join('Guest Two');
  const guest3 = await join('Guest Three');
  const startedRes = await fetch(`${base}/api/rooms/${host.code}/start`, { method: 'POST', headers: { authorization: `Bearer ${host.token}`, 'content-type': 'application/json' }, body: '{}' });
  assert.equal(startedRes.status, 200);
  const started = await startedRes.json();
  assert.equal(started.state.match.phase, 'BRIEFING');
  assert.equal(started.state.players.length, 3);
  const sse = await fetch(`${base}/api/rooms/${host.code}/events`, { headers: { authorization: `Bearer ${guest2.token}` } });
  assert.equal(sse.status, 200);
  assert.match(sse.headers.get('content-type'), /text\/event-stream/);
  const reader = sse.body.getReader();
  const first = await reader.read();
  assert.ok(new TextDecoder().decode(first.value).includes('"event":"state"'));
  await reader.cancel();
  const html = await fetch(`${base}/`);
  assert.equal(html.status, 200);
  assert.match(await html.text(), /LAST COMMIT/);
  const joinAfterStart = await fetch(`${base}/api/rooms/${host.code}/join`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ nickname: 'Late Joiner' }) });
  assert.equal(joinAfterStart.status, 404);
  assert.ok(guest3.token);
});

test('fast-timer integration: fallback actions reach results and host can reset a rematch', async (t) => {
  const port = randomInt(39001, 45000);
  const base = `http://127.0.0.1:${port}`;
  const proc = spawn(process.execPath, ['server.mjs'], { cwd: new URL('..', import.meta.url), env: { ...process.env, PORT: String(port), LAST_COMMIT_FAST_TIMERS: '1' }, stdio: 'ignore' });
  t.after(() => { proc.kill('SIGTERM'); });
  await waitForServer(base, proc);
  const host = await fetch(`${base}/api/rooms`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ nickname: 'Host' }) }).then(r => r.json());
  for (const nickname of ['Guest Two', 'Guest Three']) await fetch(`${base}/api/rooms/${host.code}/join`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ nickname }) });
  await fetch(`${base}/api/rooms/${host.code}/start`, { method: 'POST', headers: { authorization: `Bearer ${host.token}`, 'content-type': 'application/json' }, body: '{}' });
  let snapshot;
  for (let i = 0; i < 120; i++) {
    await sleep(30);
    const res = await fetch(`${base}/api/rooms/${host.code}`, { headers: { authorization: `Bearer ${host.token}` } });
    if (!res.ok) throw new Error('room snapshot unavailable');
    snapshot = (await res.json()).state;
    if (snapshot.match?.phase === 'RESULTS') break;
  }
  assert.equal(snapshot.match.phase, 'RESULTS', 'fallback actions should eventually end the match');
  const rematchRes = await fetch(`${base}/api/rooms/${host.code}/rematch`, { method: 'POST', headers: { authorization: `Bearer ${host.token}`, 'content-type': 'application/json' }, body: '{}' });
  assert.equal(rematchRes.status, 200);
  const rematch = await rematchRes.json();
  assert.equal(rematch.state.match, null);
  assert.equal(rematch.state.locked, false);
  assert.equal(rematch.state.players.length, 3);
});
