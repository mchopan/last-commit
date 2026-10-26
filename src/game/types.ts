export type Faction = 'HUMAN' | 'AI';
export type ActionId = 'INVEST' | 'AUTOMATE' | 'PROTECT' | 'INFLUENCE' | 'RECOVER';
export type ResourceKey = 'cash' | 'trust' | 'stability';
export type Resources = Record<ResourceKey, number>;
export type RoleId = 'ANALYST' | 'OPERATOR' | 'PEOPLE_LEAD' | 'AUTOMATION_ARCHITECT';

export interface Player {
  id: string;
  nickname: string;
  faction: Faction;
  role: RoleId;
  secretObjectiveId: string;
  score: number;
  completedObjective: boolean;
  missedDeadlines: number;
  consecutiveMisses: number;
  actionHistory: ActionId[];
}
export interface AcceptedAction { playerId: string; action: ActionId; acceptedAt: number; }
export interface Crisis {
  id: string;
  title: string;
  description: string;
  effects: Partial<Record<ActionId, Partial<Resources>>>;
  modifier?: Partial<Resources>;
  policyVote?: boolean;
  milestoneTags?: string[];
}
export interface Policy {
  id: string;
  name: string;
  description: string;
  effects: Partial<Record<ActionId, Partial<Resources>>>;
}
export interface Milestone {
  id: string;
  faction: Faction;
  title: string;
  description: string;
  condition: 'TRUST_TARGET' | 'CASH_TARGET' | 'OVERSIGHT_POLICY' | 'AUTOMATION_POLICY' | 'PROTECT_COORDINATION' | 'AUTOMATE_COORDINATION' | 'CRISIS_RECOVERY';
  reward: number;
  mandatory: boolean;
}
export interface FactionHistory {
  round: number;
  crisisId: string;
  resources: Resources;
  actionCredits: Record<Faction, number>;
}
export interface FactionProgress {
  score: number;
  resourceComponent: number;
  actionComponent: number;
  milestoneComponent: number;
  completedMilestones: string[];
  alignedActionCount: number;
  oversightAchieved: boolean;
  automationAchieved: boolean;
  recoveryUsed: boolean;
  unmetConditionStreak: number;
  decayPoints: number;
}
export interface MatchState {
  id: string;
  rulesetVersion: string;
  round: number;
  maxRounds: number;
  phase: 'LOBBY' | 'BRIEFING' | 'DISCUSSION' | 'COMMIT' | 'VOTE' | 'RESOLUTION' | 'RESCUE' | 'RESULTS';
  resources: Resources;
  players: Record<string, Player>;
  currentCrisisId: string;
  currentPolicyId: string;
  acceptedActions: Record<string, AcceptedAction>;
  votes: Record<string, string>;
  history: FactionHistory[];
  factionProgress: Record<Faction, FactionProgress>;
  completedMilestoneIds: string[];
  rescueUsed: boolean;
  companyOutcome: 'UNDECIDED' | 'SURVIVED' | 'COLLAPSED';
  results?: MatchResults;
  randomState: number;
}
export interface MatchResults {
  companyOutcome: 'SURVIVED' | 'COLLAPSED';
  factionMandates: Record<Faction, boolean>;
  factionProgress: Record<Faction, number>;
  strongerFaction: Faction | 'DRAW';
  individualChampion: string | 'DRAW';
  individualScores: Record<string, number>;
  roundsPlayed: number;
}
export interface RoundResolution {
  before: Resources;
  after: Resources;
  perPlayer: Record<string, Partial<Resources>>;
  notes: string[];
  collapsed: boolean;
  rescueTriggered: boolean;
  results?: MatchResults;
}
