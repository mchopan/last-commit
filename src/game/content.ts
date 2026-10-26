import type { ActionId, Crisis, Milestone, Policy, RoleId, Resources } from './types.js';

export const RULESET_VERSION = '0.1.0-provisional';
export const STARTING_RESOURCES: Resources = { cash: 70, trust: 65, stability: 65 };
export const RESOURCE_CAP = 100;
export const CRITICAL_THRESHOLDS: Resources = { cash: 25, trust: 20, stability: 25 };
export const FACTION_WEIGHTS = {
  HUMAN: { resource: 0.45, action: 0.25, milestone: 0.30 },
  AI: { resource: 0.40, action: 0.35, milestone: 0.25 }
} as const;
export const MANDATE_PROGRESS_THRESHOLD = 60;
export const REQUIRED_MILESTONES = 2;
export const REQUIRED_ALIGNED_ACTIONS = 3;
export const MIN_TRUST_TARGET = 60;
export const MIN_CASH_TARGET = 50;
export const MAX_MILESTONE_COMPONENT_POINTS = 100;
export const MAX_ACTION_COMPONENT_POINTS = 100;
export const MAX_RESOURCE_COMPONENT_POINTS = 100;
export const MAX_DECAY_PER_ROUND = 3;

export const ACTION_IDS: ActionId[] = ['INVEST', 'AUTOMATE', 'PROTECT', 'INFLUENCE', 'RECOVER'];
export const ACTION_BASE: Record<ActionId, Partial<Resources>> = {
  INVEST: { cash: -6, stability: 3 },
  AUTOMATE: { cash: 10, trust: -5, stability: -4 },
  PROTECT: { cash: -4, stability: 8 },
  INFLUENCE: { cash: -2, trust: 6, stability: -1 },
  RECOVER: { cash: -4, trust: 2, stability: 4 }
};
export const ACTION_PRIMARY_FACTION: Record<ActionId, 'HUMAN' | 'AI' | 'NEUTRAL'> = {
  INVEST: 'AI', AUTOMATE: 'AI', PROTECT: 'HUMAN', INFLUENCE: 'HUMAN', RECOVER: 'NEUTRAL'
};
export const ROLE_IDS: RoleId[] = ['ANALYST', 'OPERATOR', 'PEOPLE_LEAD', 'AUTOMATION_ARCHITECT'];
export const ROLE_ACTION_BONUS: Record<RoleId, { action: ActionId; effects: Partial<Resources> }> = {
  ANALYST: { action: 'INVEST', effects: { cash: 2 } },
  OPERATOR: { action: 'PROTECT', effects: { stability: 2 } },
  PEOPLE_LEAD: { action: 'INFLUENCE', effects: { trust: 2 } },
  AUTOMATION_ARCHITECT: { action: 'AUTOMATE', effects: { cash: 2 } }
};
export const ROLE_CONTENT = [
  { id: 'ANALYST', name: 'Financial Analyst', ability: 'Invest adds 2 Cash.' },
  { id: 'OPERATOR', name: 'Operations Lead', ability: 'Protect adds 2 Stability.' },
  { id: 'PEOPLE_LEAD', name: 'People Lead', ability: 'Influence adds 2 Trust.' },
  { id: 'AUTOMATION_ARCHITECT', name: 'Automation Architect', ability: 'Automate adds 2 Cash.' }
] as const;

export const NEUTRAL_POLICY: Policy = { id: 'NEUTRAL', name: 'Status Quo', description: 'No policy modifiers.', effects: {} };
export const POLICIES: Policy[] = [
  NEUTRAL_POLICY,
  { id: 'HUMAN_OVERSIGHT', name: 'Human Oversight', description: 'Influence adds 2 Trust; Automate costs 2 additional Cash.', effects: { INFLUENCE: { trust: 2 }, AUTOMATE: { cash: -2 } } },
  { id: 'AUTOMATION_FIRST', name: 'Automation First', description: 'Automate adds 2 Cash but loses 2 additional Trust.', effects: { AUTOMATE: { cash: 2, trust: -2 } } },
  { id: 'RESILIENCE', name: 'Resilience Mandate', description: 'Protect adds 2 Stability; Invest costs 2 additional Cash.', effects: { PROTECT: { stability: 2 }, INVEST: { cash: -2 } } }
];

export const CRISES: Crisis[] = [
  { id: 'BUDGET_FREEZE', title: 'The Budget Freeze', description: 'Finance has frozen discretionary spending. Investment is harder, but inaction has a price.', effects: { INVEST: { cash: -3 }, AUTOMATE: { trust: -1 } }, milestoneTags: ['FINANCE'] },
  { id: 'WORKFORCE_BACKLASH', title: 'Workforce Backlash', description: 'Employees challenge the company’s automation plans.', effects: { AUTOMATE: { trust: -4 }, INFLUENCE: { trust: 2 } }, milestoneTags: ['TRUST', 'OVERSIGHT'] },
  { id: 'SYSTEM_INSTABILITY', title: 'Systems Under Strain', description: 'A critical service is unstable and needs immediate attention.', effects: { PROTECT: { stability: 4 }, AUTOMATE: { stability: -3 } }, milestoneTags: ['STABILITY'] },
  { id: 'COMPETITOR_LAUNCH', title: 'A Rival Ships First', description: 'A competitor launches an automated service. Speed and reliability are both at stake.', effects: { AUTOMATE: { cash: 3 }, INVEST: { stability: 2 } }, milestoneTags: ['EFFICIENCY'] },
  { id: 'CUSTOMER_LEAK', title: 'Customer Data Leak', description: 'Customers demand answers after a privacy incident.', effects: { PROTECT: { trust: 3 }, INFLUENCE: { trust: 1 }, AUTOMATE: { trust: -2 } }, milestoneTags: ['TRUST', 'PROTECTION'] },
  { id: 'SUPPLY_SHOCK', title: 'Supply Shock', description: 'A supplier failure threatens both runway and delivery.', effects: { INVEST: { cash: 2 }, RECOVER: { stability: 3 } }, milestoneTags: ['RECOVERY'] },
  { id: 'BOARD_DEMAND', title: 'The Board Demands Efficiency', description: 'The board wants measurable savings without a public scandal.', effects: { AUTOMATE: { cash: 3, trust: -1 }, INFLUENCE: { trust: 1 } }, milestoneTags: ['EFFICIENCY'] },
  { id: 'REGULATORY_AUDIT', title: 'Regulatory Audit', description: 'Auditors demand evidence of responsible oversight and reliable systems.', effects: { PROTECT: { stability: 2 }, INFLUENCE: { trust: 2 }, AUTOMATE: { stability: -2 } }, policyVote: true, milestoneTags: ['OVERSIGHT', 'STABILITY'] },
  { id: 'RESCUE_CRISIS', title: 'Emergency: Last Chance', description: 'The company has one round to pull every critical resource back above danger.', effects: { RECOVER: { cash: 2, trust: 3, stability: 5 }, PROTECT: { stability: 3 }, INVEST: { cash: 2 } }, milestoneTags: ['RECOVERY'] }
];

export const MILESTONES: Milestone[] = [
  { id: 'HUMAN_TRUST', faction: 'HUMAN', title: 'Rebuild Trust', description: 'Finish a resolved round with Trust at least 50.', condition: 'TRUST_TARGET', reward: 20, mandatory: true },
  { id: 'HUMAN_OVERSIGHT', faction: 'HUMAN', title: 'Oversight in Force', description: 'Have Human Oversight policy active at a round boundary.', condition: 'OVERSIGHT_POLICY', reward: 25, mandatory: true },
  { id: 'HUMAN_PROTECT_PAIR', faction: 'HUMAN', title: 'Safety in Numbers', description: 'Two or more players choose Protect in one round.', condition: 'PROTECT_COORDINATION', reward: 20, mandatory: false },
  { id: 'HUMAN_RECOVERY', faction: 'HUMAN', title: 'Keep the Lights On', description: 'Use Recover during a crisis tagged RECOVERY.', condition: 'CRISIS_RECOVERY', reward: 20, mandatory: false },
  { id: 'AI_CASH', faction: 'AI', title: 'Runway Secured', description: 'Finish a resolved round with Cash at least 50.', condition: 'CASH_TARGET', reward: 20, mandatory: true },
  { id: 'AI_AUTOMATION', faction: 'AI', title: 'Automation at Scale', description: 'Have Automation First policy active at a round boundary.', condition: 'AUTOMATION_POLICY', reward: 25, mandatory: true },
  { id: 'AI_AUTOMATE_PAIR', faction: 'AI', title: 'Scale Together', description: 'Two or more players choose Automate in one round.', condition: 'AUTOMATE_COORDINATION', reward: 20, mandatory: false },
  { id: 'AI_RECOVERY', faction: 'AI', title: 'Efficient Recovery', description: 'Use Invest during a crisis tagged RECOVERY.', condition: 'CRISIS_RECOVERY', reward: 20, mandatory: false }
];
