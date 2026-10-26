import test from 'node:test';
import assert from 'node:assert/strict';
import { createMatch, submitAction, resolveRound, castPolicyVote, closePolicyVote, getPublicState, getPrivatePlayerState } from '../dist/game/engine.js';
import { STARTING_RESOURCES, RESOURCE_CAP, CRITICAL_THRESHOLDS } from '../dist/game/content.js';

function players(n = 4) {
  const roles = ['ANALYST', 'OPERATOR', 'PEOPLE_LEAD', 'AUTOMATION_ARCHITECT'];
  return Array.from({ length: n }, (_, i) => ({
    id: `p${i + 1}`, nickname: `Player ${i + 1}`, faction: i < Math.ceil(n / 2) ? 'HUMAN' : 'AI', role: roles[i % roles.length], secretObjectiveId: `OBJ_${i + 1}`
  }));
}
function readyMatch(n = 4) { const s = createMatch({ id: 'TEST01', players: players(n), seed: 7 }); s.phase = 'COMMIT'; return s; }
function resolveAll(state, action = 'RECOVER') { return resolveRound(state, Object.fromEntries(Object.keys(state.players).map(id => [id, action]))); }

test('creates a match with provisional starting resources and valid player count', () => {
  const s = createMatch({ id: 'A', players: players(3), seed: 1 });
  assert.deepEqual(s.resources, STARTING_RESOURCES);
  assert.equal(s.round, 0);
  assert.equal(s.phase, 'BRIEFING');
  assert.throws(() => createMatch({ id: 'B', players: players(2) }), /3–6/);
  assert.throws(() => createMatch({ id: 'C', players: players(7) }), /3–6/);
});

test('rejects faction imbalance and duplicate player IDs', () => {
  const unbalanced = players(4).map((p, i) => ({ ...p, faction: i === 3 ? 'AI' : 'HUMAN' }));
  assert.throws(() => createMatch({ id: 'A', players: unbalanced }), /even as possible/);
  const duplicate = players(4); duplicate[1].id = duplicate[0].id;
  assert.throws(() => createMatch({ id: 'B', players: duplicate }), /unique/);
});

test('action submission requires COMMIT and a valid player/action', () => {
  const s = readyMatch();
  assert.equal(submitAction(s, 'p1', 'INVEST', 100).acceptedActions.p1.action, 'INVEST');
  assert.throws(() => submitAction(s, 'unknown', 'INVEST', 100), /Unknown player/);
  assert.throws(() => submitAction(s, 'p1', 'NOPE', 100), /Invalid action/);
  s.phase = 'BRIEFING';
  assert.throws(() => submitAction(s, 'p1', 'INVEST', 100), /COMMIT/);
});

test('resolves actions simultaneously, caps resources, and advances round exactly once', () => {
  const s = readyMatch();
  s.resources.cash = 99;
  const result = resolveRound(s, { p1: 'AUTOMATE', p2: 'AUTOMATE', p3: 'INVEST', p4: 'INVEST' });
  assert.ok(result.state.resources.cash <= RESOURCE_CAP);
  assert.equal(result.state.round, 1);
  assert.equal(result.resolution.before.cash, 99);
  assert.equal(result.resolution.after.cash, result.state.resources.cash);
  assert.equal(result.state.players.p1.actionHistory.length, 1);
  assert.equal(result.state.phase, 'BRIEFING');
});

test('missing/invalid actions use the deterministic RECOVER fallback', () => {
  const s = readyMatch();
  const result = resolveRound(s, { p1: 'INVEST', p2: 'BAD', p3: 'PROTECT' });
  assert.equal(result.state.players.p2.actionHistory[0], 'RECOVER');
  assert.equal(result.state.players.p4.actionHistory[0], 'RECOVER');
});

test('role passive abilities affect only their matching core action', () => {
  const s = readyMatch();
  const result = resolveRound(s, { p1: 'INVEST', p2: 'INVEST', p3: 'INVEST', p4: 'INVEST' });
  assert.equal(result.resolution.perPlayer.p1.cash, -7); // Analyst: -6 + 2, crisis: -3
  assert.equal(result.resolution.perPlayer.p2.cash, -9); // Operator has no Invest bonus; crisis applies -3
});

test('policy voting preserves current policy on tie and requires strict majority of valid votes', () => {
  const s = readyMatch(); s.phase = 'VOTE';
  let v = castPolicyVote(s, 'p1', 'HUMAN_OVERSIGHT');
  v = castPolicyVote(v, 'p2', 'AUTOMATION_FIRST');
  v = closePolicyVote(v);
  assert.equal(v.currentPolicyId, 'NEUTRAL');
  assert.equal(v.phase, 'BRIEFING');
  let v2 = readyMatch(); v2.phase = 'VOTE';
  for (const id of ['p1', 'p2', 'p3']) v2 = castPolicyVote(v2, id, 'HUMAN_OVERSIGHT');
  v2 = closePolicyVote(v2);
  assert.equal(v2.currentPolicyId, 'HUMAN_OVERSIGHT');
});

test('public state excludes secret objectives and private state exposes only the requested player', () => {
  const s = readyMatch();
  const pub = JSON.stringify(getPublicState(s));
  assert.equal(pub.includes('secretObjectiveId'), false);
  assert.equal(pub.includes('OBJ_1'), false);
  assert.equal(getPrivatePlayerState(s, 'p1').secretObjectiveId, 'OBJ_1');
  assert.throws(() => getPrivatePlayerState(s, 'unknown'), /Unknown player/);
});

test('danger triggers one rescue round after round resolution', () => {
  const s = readyMatch();
  s.resources.trust = 21;
  const result = resolveRound(s, { p1: 'AUTOMATE', p2: 'AUTOMATE', p3: 'AUTOMATE', p4: 'AUTOMATE' });
  assert.ok(result.resolution.rescueTriggered || result.state.phase === 'RESULTS');
  if (result.resolution.rescueTriggered) {
    assert.equal(result.state.phase, 'RESCUE');
    assert.equal(result.state.rescueUsed, true);
    assert.equal(result.state.currentCrisisId, 'RESCUE_CRISIS');
  }
});

test('rescue round collapses if any resource remains at or below its critical threshold', () => {
  const s = readyMatch(); s.phase = 'RESCUE'; s.currentCrisisId = 'RESCUE_CRISIS'; s.rescueUsed = true;
  s.resources = { cash: 26, trust: 21, stability: 26 };
  const result = resolveRound(s, { p1: 'AUTOMATE', p2: 'AUTOMATE', p3: 'AUTOMATE', p4: 'AUTOMATE' });
  assert.equal(result.state.companyOutcome, 'COLLAPSED');
  assert.equal(result.state.phase, 'RESULTS');
  assert.equal(result.resolution.collapsed, true);
  assert.ok(Object.keys(result.state.results.individualScores).length === 4);
});

test('forced final round produces results and keeps outcome dimensions separate', () => {
  const s = readyMatch(); s.round = 5;
  const result = resolveRound(s, { p1: 'INVEST', p2: 'PROTECT', p3: 'AUTOMATE', p4: 'INFLUENCE' });
  assert.equal(result.state.phase, 'RESULTS');
  assert.equal(result.state.companyOutcome, 'SURVIVED');
  assert.ok(typeof result.state.results.factionMandates.HUMAN === 'boolean');
  assert.ok(['HUMAN', 'AI', 'DRAW'].includes(result.state.results.strongerFaction));
});

test('critical thresholds are explicit and resource values stay within bounds', () => {
  assert.deepEqual(CRITICAL_THRESHOLDS, { cash: 25, trust: 20, stability: 25 });
  const s = readyMatch(); s.resources = { cash: 1, trust: 1, stability: 1 };
  const result = resolveAll(s, 'RECOVER');
  for (const v of Object.values(result.state.resources)) assert.ok(v >= 0 && v <= 100);
});

test('simultaneous resolution is independent of action object insertion order', () => {
  const s1 = readyMatch();
  const s2 = readyMatch();
  const actions = { p1: 'AUTOMATE', p2: 'PROTECT', p3: 'INVEST', p4: 'INFLUENCE' };
  const reversed = Object.fromEntries(Object.entries(actions).reverse());
  const r1 = resolveRound(s1, actions);
  const r2 = resolveRound(s2, reversed);
  assert.deepEqual(r1.state.resources, r2.state.resources);
  assert.equal(r1.state.factionProgress.HUMAN.score, r2.state.factionProgress.HUMAN.score);
  assert.equal(r1.state.factionProgress.AI.score, r2.state.factionProgress.AI.score);
});

test('milestone credit is faction-scoped and action history can unlock mandate milestones', () => {
  const s = readyMatch();
  s.currentCrisisId = 'WORKFORCE_BACKLASH';
  const result = resolveRound(s, { p1: 'PROTECT', p2: 'PROTECT', p3: 'AUTOMATE', p4: 'AUTOMATE' });
  assert.ok(result.state.completedMilestoneIds.includes('HUMAN_OVERSIGHT'));
  assert.ok(result.state.completedMilestoneIds.includes('AI_AUTOMATION'));
  assert.ok(result.state.completedMilestoneIds.includes('HUMAN_PROTECT_PAIR'));
  assert.ok(result.state.completedMilestoneIds.includes('AI_AUTOMATE_PAIR'));
});
