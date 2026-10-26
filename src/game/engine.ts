import type { ActionId, Faction, MatchState, Player, Resources, RoundResolution, ResourceKey, FactionProgress, MatchResults, Crisis } from './types.js';
import { ACTION_BASE, ACTION_PRIMARY_FACTION, ACTION_IDS, CRISES, CRITICAL_THRESHOLDS, FACTION_WEIGHTS, MANDATE_PROGRESS_THRESHOLD, MILESTONES, MIN_CASH_TARGET, MIN_TRUST_TARGET, NEUTRAL_POLICY, POLICIES, REQUIRED_ALIGNED_ACTIONS, REQUIRED_MILESTONES, RESOURCE_CAP, ROLE_ACTION_BONUS, RULESET_VERSION, STARTING_RESOURCES } from './content.js';

const FACTIONS: Faction[] = ['HUMAN', 'AI'];
const RESOURCES: ResourceKey[] = ['cash', 'trust', 'stability'];
const clamp = (n: number, min = 0, max = 100): number => Math.max(min, Math.min(max, n));
const round2 = (n: number): number => Math.round(n * 100) / 100;
const clone = <T>(v: T): T => structuredClone(v);
const emptyProgress = (): FactionProgress => ({ score: 0, resourceComponent: 0, actionComponent: 0, milestoneComponent: 0, completedMilestones: [], alignedActionCount: 0, oversightAchieved: false, automationAchieved: false, recoveryUsed: false, unmetConditionStreak: 0, decayPoints: 0 });

export function createMatch(input: { id: string; players: Array<Omit<Player, 'score'|'completedObjective'|'missedDeadlines'|'consecutiveMisses'|'actionHistory'>>; seed?: number; maxRounds?: number }): MatchState {
  if (input.players.length < 3 || input.players.length > 6) throw new Error('A match requires 3–6 players.');
  if (new Set(input.players.map(p => p.id)).size !== input.players.length) throw new Error('Player IDs must be unique.');
  const factions = input.players.reduce((acc, p) => (acc[p.faction]++, acc), { HUMAN: 0, AI: 0 });
  if (Math.abs(factions.HUMAN - factions.AI) > 1) throw new Error('Faction sizes must be as even as possible.');
  const players: Record<string, Player> = {};
  for (const p of input.players) players[p.id] = { ...p, score: 0, completedObjective: false, missedDeadlines: 0, consecutiveMisses: 0, actionHistory: [] };
  return { id: input.id, rulesetVersion: RULESET_VERSION, round: 0, maxRounds: input.maxRounds ?? 6, phase: 'BRIEFING', resources: { ...STARTING_RESOURCES }, players, currentCrisisId: 'BUDGET_FREEZE', currentPolicyId: NEUTRAL_POLICY.id, acceptedActions: {}, votes: {}, history: [], factionProgress: { HUMAN: emptyProgress(), AI: emptyProgress() }, completedMilestoneIds: [], rescueUsed: false, companyOutcome: 'UNDECIDED', randomState: (input.seed ?? 123456789) >>> 0 };
}

export function deterministicRandom(state: MatchState): number {
  // Mulberry32 step; state is mutated only on the server's private working copy.
  let t = state.randomState = (state.randomState + 0x6D2B79F5) >>> 0;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

export function submitAction(state: MatchState, playerId: string, action: ActionId, acceptedAt: number): MatchState {
  if (state.phase !== 'COMMIT') throw new Error('Actions are only accepted during COMMIT.');
  if (!state.players[playerId]) throw new Error('Unknown player.');
  if (!ACTION_IDS.includes(action)) throw new Error('Invalid action.');
  const next = clone(state);
  next.acceptedActions[playerId] = { playerId, action, acceptedAt };
  return next;
}

function addEffects(target: Resources, effects: Partial<Resources>): void {
  for (const key of RESOURCES) target[key] = clamp(target[key] + (effects[key] ?? 0), 0, RESOURCE_CAP);
}
function sumEffects(...effects: Array<Partial<Resources> | undefined>): Partial<Resources> {
  const out: Partial<Resources> = {};
  for (const e of effects) if (e) for (const k of RESOURCES) out[k] = (out[k] ?? 0) + (e[k] ?? 0);
  return out;
}
function getCrisis(state: MatchState): Crisis {
  const crisis = CRISES.find(c => c.id === state.currentCrisisId);
  if (!crisis) throw new Error(`Unknown crisis ${state.currentCrisisId}`);
  return crisis;
}
function selectNextCrisis(state: MatchState): string {
  const prior = new Set(state.history.slice(-2).map(h => h.crisisId));
  let eligible = CRISES.filter(c => c.id !== 'RESCUE_CRISIS' && c.id !== state.currentCrisisId && !prior.has(c.id));
  if (!eligible.length) eligible = CRISES.filter(c => c.id !== 'RESCUE_CRISIS' && c.id !== state.currentCrisisId);
  return eligible[Math.floor(deterministicRandom(state) * eligible.length)]?.id ?? 'BUDGET_FREEZE';
}
function awardMilestones(state: MatchState, crisis: Crisis, actions: Record<string, ActionId>, policyId: string): void {
  const chosen = Object.values(actions);
  for (const m of MILESTONES) {
    if (state.completedMilestoneIds.includes(m.id)) continue;
    let done = false;
    switch (m.condition) {
      case 'TRUST_TARGET': done = state.resources.trust >= MIN_TRUST_TARGET; break;
      case 'CASH_TARGET': done = state.resources.cash >= MIN_CASH_TARGET; break;
      case 'OVERSIGHT_POLICY': done = policyId === 'HUMAN_OVERSIGHT' || (crisis.milestoneTags?.includes('OVERSIGHT') === true && Object.entries(actions).some(([id, a]) => state.players[id]?.faction === 'HUMAN' && ['INFLUENCE', 'PROTECT'].includes(a))) || Object.entries(actions).filter(([id, a]) => state.players[id]?.faction === 'HUMAN' && ['INFLUENCE', 'PROTECT'].includes(a)).length >= 2; break;
      case 'AUTOMATION_POLICY': done = policyId === 'AUTOMATION_FIRST' || (crisis.milestoneTags?.includes('EFFICIENCY') === true && Object.entries(actions).some(([id, a]) => state.players[id]?.faction === 'AI' && a === 'AUTOMATE')) || Object.entries(actions).filter(([id, a]) => state.players[id]?.faction === 'AI' && a === 'AUTOMATE').length >= 2; break;
      case 'PROTECT_COORDINATION': done = Object.values(state.players).filter(p => p.faction === m.faction).reduce((n, p) => n + p.actionHistory.filter(a => a === 'PROTECT').length, 0) >= 2; break;
      case 'AUTOMATE_COORDINATION': done = Object.values(state.players).filter(p => p.faction === m.faction).reduce((n, p) => n + p.actionHistory.filter(a => a === 'AUTOMATE').length, 0) >= 2; break;
      case 'CRISIS_RECOVERY': done = crisis.milestoneTags?.includes('RECOVERY') === true && Object.entries(actions).some(([id, a]) => state.players[id]?.faction === m.faction && (m.faction === 'HUMAN' ? a === 'RECOVER' : a === 'INVEST')); break;
    }
    if (done) {
      state.completedMilestoneIds.push(m.id);
      state.factionProgress[m.faction].completedMilestones.push(m.id);
    }
  }
}
function computeResourceComponent(state: MatchState, faction: Faction): number {
  const history = state.history;
  if (!history.length) return 0;
  const targetKey: ResourceKey = faction === 'HUMAN' ? 'trust' : 'cash';
  const target = faction === 'HUMAN' ? MIN_TRUST_TARGET : MIN_CASH_TARGET;
  const values = history.map(h => h.resources[targetKey]);
  const frequency = values.filter(v => v >= target).length / values.length;
  const average = values.reduce((a, b) => a + b, 0) / values.length / 100;
  const starting = STARTING_RESOURCES[targetKey];
  const improvement = clamp((values[values.length - 1] - starting + 50) / 100, 0, 1);
  return round2(clamp(100 * (0.5 * frequency + 0.3 * average + 0.2 * improvement) - state.factionProgress[faction].decayPoints));
}
function computeActionComponent(state: MatchState, faction: Faction): number {
  const players = Object.values(state.players).filter(p => p.faction === faction);
  const totalTurns = players.length * Math.max(1, state.round);
  const credits = state.history.reduce((sum, h) => sum + h.actionCredits[faction], 0);
  const count = players.reduce((sum, p) => sum + p.actionHistory.filter(a => ACTION_PRIMARY_FACTION[a] === faction).length, 0);
  // Credits reward outcomes/relevance; aligned count is separately required by the mandate.
  return round2(clamp(100 * (0.65 * Math.min(1, credits / Math.max(1, totalTurns * 0.65)) + 0.35 * Math.min(1, count / Math.max(1, totalTurns * 0.5)))));
}
function computeMilestoneComponent(state: MatchState, faction: Faction): number {
  const available = MILESTONES.filter(m => m.faction === faction);
  const completed = available.filter(m => state.completedMilestoneIds.includes(m.id));
  const total = available.reduce((s, m) => s + m.reward, 0);
  const earned = completed.reduce((s, m) => s + m.reward, 0);
  return round2(clamp(100 * earned / Math.max(1, total), 0, 100));
}
function recalculateFactionProgress(state: MatchState): void {
  for (const faction of FACTIONS) {
    const progress = state.factionProgress[faction];
    progress.resourceComponent = computeResourceComponent(state, faction);
    progress.actionComponent = computeActionComponent(state, faction);
    progress.milestoneComponent = computeMilestoneComponent(state, faction);
    const weights = FACTION_WEIGHTS[faction];
    progress.score = round2(clamp(weights.resource * progress.resourceComponent + weights.action * progress.actionComponent + weights.milestone * progress.milestoneComponent));
    progress.alignedActionCount = Object.values(state.players).filter(p => p.faction === faction).reduce((sum, p) => sum + p.actionHistory.filter(a => ACTION_PRIMARY_FACTION[a] === faction).length, 0);
    progress.oversightAchieved = progress.completedMilestones.includes('HUMAN_OVERSIGHT');
    progress.automationAchieved = progress.completedMilestones.includes('AI_AUTOMATION');
  }
}
function isCritical(resources: Resources): boolean {
  return RESOURCES.some(k => resources[k] <= CRITICAL_THRESHOLDS[k]);
}
function factionMandate(state: MatchState, faction: Faction): boolean {
  const p = state.factionProgress[faction];
  const targetMet = faction === 'HUMAN' ? state.resources.trust >= MIN_TRUST_TARGET : state.resources.cash >= MIN_CASH_TARGET;
  const specialMilestone = faction === 'HUMAN' ? p.oversightAchieved : p.automationAchieved;
  const progressThreshold = faction === 'HUMAN' ? 65 : 55;
  return p.score >= progressThreshold && p.completedMilestones.length >= 2 && specialMilestone && p.alignedActionCount >= REQUIRED_ALIGNED_ACTIONS && targetMet;
}
function finalizeResults(state: MatchState): MatchResults {
  const mandates = { HUMAN: factionMandate(state, 'HUMAN'), AI: factionMandate(state, 'AI') };
  const h = state.factionProgress.HUMAN.score;
  const a = state.factionProgress.AI.score;
  const strongerFaction: Faction | 'DRAW' = h === a ? 'DRAW' : h > a ? 'HUMAN' : 'AI';
  const scores: Record<string, number> = {};
  for (const p of Object.values(state.players)) {
    // Provisional individual formula: objective 10, faction success 3, company survival 2, action contribution 1 per action that improves at least one resource.
    const contribution = p.actionHistory.reduce((sum, action) => {
      const effects = ACTION_BASE[action];
      return sum + (Object.values(effects).some(v => (v ?? 0) > 0) ? 1 : 0);
    }, 0);
    scores[p.id] = contribution + (p.completedObjective ? 10 : 0) + (mandates[p.faction] ? 3 : 0) + (state.companyOutcome === 'SURVIVED' ? 2 : 0) - (state.companyOutcome === 'COLLAPSED' ? 3 : 0);
  }
  const ranked = Object.entries(scores).sort((x, y) => y[1] - x[1]);
  const champion = ranked.length > 1 && ranked[0][1] === ranked[1][1] ? 'DRAW' : ranked[0]?.[0] ?? 'DRAW';
  return { companyOutcome: state.companyOutcome as 'SURVIVED' | 'COLLAPSED', factionMandates: mandates, factionProgress: { HUMAN: h, AI: a }, strongerFaction, individualChampion: champion, individualScores: scores, roundsPlayed: state.round };
}

export function resolveRound(input: MatchState, actionsInput: Record<string, ActionId>, options: { forceFinal?: boolean } = {}): { state: MatchState; resolution: RoundResolution } {
  if (!['COMMIT', 'RESCUE'].includes(input.phase)) throw new Error('Round can only resolve from COMMIT or RESCUE.');
  const state = clone(input);
  const crisis = getCrisis(state);
  const before = { ...state.resources };
  const actions: Record<string, ActionId> = {};
  for (const p of Object.values(state.players)) {
    const submitted = actionsInput[p.id];
    const action = ACTION_IDS.includes(submitted) ? submitted : 'RECOVER';
    actions[p.id] = action;
    p.actionHistory.push(action);
  }
  const policy = POLICIES.find(p => p.id === state.currentPolicyId) ?? NEUTRAL_POLICY;
  const perPlayer: Record<string, Partial<Resources>> = {};
  const actionCredits: Record<Faction, number> = { HUMAN: 0, AI: 0 };
  for (const p of Object.values(state.players)) {
    const action = actions[p.id];
    const roleBonus = ROLE_ACTION_BONUS[p.role];
    const crisisEffects = crisis.effects[action];
    const policyEffects = policy.effects[action];
    const base = sumEffects(ACTION_BASE[action], roleBonus.action === action ? roleBonus.effects : undefined, crisisEffects, policyEffects);
    perPlayer[p.id] = base;
    const positiveNet = RESOURCES.some(k => (base[k] ?? 0) > 0);
    const primary = ACTION_PRIMARY_FACTION[action];
    if (positiveNet && primary !== 'NEUTRAL' && primary === p.faction) actionCredits[p.faction] += 1;
    // Secondary credit is only allowed when an off-alignment action advances the acting faction's defining resource goal.
    if (primary !== p.faction && p.faction === 'HUMAN' && (base.trust ?? 0) > 0 && (base.stability ?? 0) > 0) actionCredits.HUMAN += 0.25;
    if (primary !== p.faction && p.faction === 'AI' && (base.cash ?? 0) > 0 && (base.stability ?? 0) > 0) actionCredits.AI += 0.25;
  }
  // Simultaneous resolution: sum all effects before applying resource caps.
  const aggregate: Partial<Resources> = {};
  for (const effects of Object.values(perPlayer)) for (const k of RESOURCES) aggregate[k] = (aggregate[k] ?? 0) + (effects[k] ?? 0);
  addEffects(state.resources, aggregate);
  if (crisis.modifier) addEffects(state.resources, crisis.modifier);
  state.round += 1;
  const activeActions = actions;
  awardMilestones(state, crisis, activeActions, policy.id);
  state.history.push({ round: state.round, crisisId: crisis.id, resources: { ...state.resources }, actionCredits });
  // Two consecutive completed rounds with the faction's target unmet cause bounded dynamic-component decay.
  for (const f of FACTIONS) {
    const met = f === 'HUMAN' ? state.resources.trust >= MIN_TRUST_TARGET : state.resources.cash >= MIN_CASH_TARGET;
    const fp = state.factionProgress[f];
    fp.unmetConditionStreak = met ? 0 : fp.unmetConditionStreak + 1;
    if (fp.unmetConditionStreak >= 2) { fp.decayPoints = Math.min(15, fp.decayPoints + 1); fp.unmetConditionStreak = 0; }
  }
  recalculateFactionProgress(state);
  let collapsed = false;
  let rescueTriggered = false;
  let result: MatchResults | undefined;
  if (state.phase === 'RESCUE') {
    if (isCritical(state.resources)) {
      state.companyOutcome = 'COLLAPSED'; collapsed = true; state.phase = 'RESULTS'; result = finalizeResults(state); state.results = result;
    } else {
      state.companyOutcome = 'SURVIVED';
      if (options.forceFinal || state.round >= state.maxRounds) { state.phase = 'RESULTS'; result = finalizeResults(state); state.results = result; }
      else { state.phase = 'BRIEFING'; state.currentCrisisId = selectNextCrisis(state); }
    }
  } else if (isCritical(state.resources) && !state.rescueUsed) {
    state.rescueUsed = true; state.phase = 'RESCUE'; state.currentCrisisId = 'RESCUE_CRISIS'; rescueTriggered = true;
  } else if (isCritical(state.resources)) {
    state.companyOutcome = 'COLLAPSED'; collapsed = true; state.phase = 'RESULTS'; result = finalizeResults(state); state.results = result;
  } else if (options.forceFinal || state.round >= state.maxRounds) {
    state.companyOutcome = 'SURVIVED'; state.phase = 'RESULTS'; result = finalizeResults(state); state.results = result;
  } else {
    state.phase = 'BRIEFING'; state.currentCrisisId = selectNextCrisis(state);
  }
  state.acceptedActions = {};
  state.votes = {};
  return { state, resolution: { before, after: { ...state.resources }, perPlayer, notes: [`Crisis: ${crisis.title}`, `Policy: ${policy.name}`, 'All actions resolved simultaneously.'], collapsed, rescueTriggered, results: result } };
}

export function castPolicyVote(state: MatchState, playerId: string, policyId: string): MatchState {
  if (state.phase !== 'VOTE') throw new Error('Voting is not open.');
  if (!state.players[playerId]) throw new Error('Unknown player.');
  if (!POLICIES.some(p => p.id === policyId)) throw new Error('Unknown policy.');
  const next = clone(state); next.votes[playerId] = policyId; return next;
}
export function closePolicyVote(input: MatchState): MatchState {
  if (input.phase !== 'VOTE') throw new Error('Voting is not open.');
  const state = clone(input);
  const counts = new Map<string, number>();
  Object.values(state.votes).forEach(v => counts.set(v, (counts.get(v) ?? 0) + 1));
  const max = Math.max(0, ...counts.values());
  const winners = [...counts.entries()].filter(([, n]) => n === max && n > 0);
  if (winners.length === 1 && max > Object.keys(state.votes).length / 2) state.currentPolicyId = winners[0][0];
  state.phase = 'BRIEFING'; state.votes = {};
  return state;
}

export function getPublicState(state: MatchState) {
  return { id: state.id, rulesetVersion: state.rulesetVersion, round: state.round, maxRounds: state.maxRounds, phase: state.phase, resources: { ...state.resources }, players: Object.values(state.players).map(p => ({ id: p.id, nickname: p.nickname, faction: p.faction, role: p.role, connected: true })), currentCrisisId: state.currentCrisisId, currentPolicyId: state.currentPolicyId, factionProgress: clone(state.factionProgress), history: clone(state.history), rescueUsed: state.rescueUsed, companyOutcome: state.companyOutcome };
}
export function getPrivatePlayerState(state: MatchState, playerId: string) {
  const player = state.players[playerId];
  if (!player) throw new Error('Unknown player.');
  return { playerId, role: player.role, faction: player.faction, secretObjectiveId: player.secretObjectiveId, completedObjective: player.completedObjective, acceptedAction: state.acceptedActions[playerId]?.action ?? null, missedDeadlines: player.missedDeadlines };
}
