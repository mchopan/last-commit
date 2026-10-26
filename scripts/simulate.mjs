import { createMatch, resolveRound } from '../dist/game/engine.js';
const count = Number(process.argv[2] || 500);
let seed = 20261026;
function rand(max) { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed % max; }
const actions = ['INVEST', 'AUTOMATE', 'PROTECT', 'INFLUENCE', 'RECOVER'];
const roles = ['ANALYST', 'OPERATOR', 'PEOPLE_LEAD', 'AUTOMATION_ARCHITECT'];
const results = { survived: 0, collapsed: 0, humanMandates: 0, aiMandates: 0, bothMandates: 0, neitherMandate: 0, rounds: 0, humanProgress: 0, aiProgress: 0, humanResource: 0, aiResource: 0, humanAction: 0, aiAction: 0, humanMilestone: 0, aiMilestone: 0 };
for (let i = 0; i < count; i++) {
  const n = 3 + rand(4);
  const players = Array.from({ length: n }, (_, j) => ({ id: `p${j}`, nickname: `P${j}`, faction: j < Math.ceil(n / 2) ? 'HUMAN' : 'AI', role: roles[j % roles.length], secretObjectiveId: `OBJ_${j}` }));
  const match = createMatch({ id: `SIM${i}`, players, seed: i + 1 });
  let state = match;
  let guard = 0;
  while (state.phase !== 'RESULTS' && guard++ < 10) {
    if (state.phase === 'BRIEFING' || state.phase === 'DISCUSSION') state.phase = 'COMMIT';
    const chosen = Object.fromEntries(Object.keys(state.players).map(id => [id, actions[rand(actions.length)]]));
    state = resolveRound(state, chosen).state;
  }
  if (!state.results) throw new Error(`Simulation ${i} failed to terminate (phase ${state.phase}, round ${state.round})`);
  const r = state.results;
  results[r.companyOutcome === 'SURVIVED' ? 'survived' : 'collapsed']++;
  results.humanMandates += Number(r.factionMandates.HUMAN);
  results.aiMandates += Number(r.factionMandates.AI);
  results.bothMandates += Number(r.factionMandates.HUMAN && r.factionMandates.AI);
  results.neitherMandate += Number(!r.factionMandates.HUMAN && !r.factionMandates.AI);
  results.rounds += r.roundsPlayed;
  results.humanProgress += r.factionProgress.HUMAN;
  results.aiProgress += r.factionProgress.AI;
  results.humanResource += state.factionProgress.HUMAN.resourceComponent;
  results.aiResource += state.factionProgress.AI.resourceComponent;
  results.humanAction += state.factionProgress.HUMAN.actionComponent;
  results.aiAction += state.factionProgress.AI.actionComponent;
  results.humanMilestone += state.factionProgress.HUMAN.milestoneComponent;
  results.aiMilestone += state.factionProgress.AI.milestoneComponent;
}
console.log(JSON.stringify({ matches: count, strategy: 'uniform random actions; not a balance verdict', survivalRate: +(results.survived / count).toFixed(3), collapseRate: +(results.collapsed / count).toFixed(3), humanMandateRate: +(results.humanMandates / count).toFixed(3), aiMandateRate: +(results.aiMandates / count).toFixed(3), bothMandateRate: +(results.bothMandates / count).toFixed(3), neitherMandateRate: +(results.neitherMandate / count).toFixed(3), averageRoundsPlayed: +(results.rounds / count).toFixed(2), averageHumanProgress: +(results.humanProgress / count).toFixed(2), averageAIProgress: +(results.aiProgress / count).toFixed(2), components: { humanResource: +(results.humanResource/count).toFixed(1), aiResource: +(results.aiResource/count).toFixed(1), humanAction: +(results.humanAction/count).toFixed(1), aiAction: +(results.aiAction/count).toFixed(1), humanMilestone: +(results.humanMilestone/count).toFixed(1), aiMilestone: +(results.aiMilestone/count).toFixed(1) } }, null, 2));
