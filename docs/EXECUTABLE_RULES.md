# LAST COMMIT — Executable Rules Specification

**Ruleset:** `0.1.0-provisional`  
**Status:** Initial engine baseline; balance values are provisional.  
**Scope:** Deterministic engine and acceptance contract for a 3–6 player, six-round match.

## Match setup
- 3–6 human players; no bots.
- Faction sizes differ by at most one player.
- Four initial role definitions: Financial Analyst, Operations Lead, People Lead, Automation Architect. Roles repeat when the lobby exceeds four players; duplicate-role balance must be evaluated in simulations.
- Each player has a faction, role, secret objective ID, individual score, and action history.
- Resources start at Cash 70, Trust 65, Stability 65. Each resource is clamped to 0–100.
- Neutral policy is `Status Quo` with no modifiers.
- Six normal rounds maximum. A rescue round may extend the match by one round if triggered at the round boundary.

## Core actions (provisional point effects)
Effects from all player actions are summed against the same pre-resolution state and applied together; each resource is capped once after aggregation.

| Action | Base effects | Primary faction | Purpose |
|---|---|---|---|
| Invest | Cash −6, Stability +3 | AI | Long-term capacity and financial strategy |
| Automate | Cash +10, Trust −5, Stability −4 | AI | Efficiency at a trust/resilience trade-off |
| Protect | Cash −4, Stability +8 | Human | Operational resilience |
| Influence | Cash −2, Trust +6, Stability −1 | Human | Build confidence and oversight |
| Recover | Cash −4, Trust +2, Stability +4 | Neutral | General recovery; can provide limited secondary credit when it advances a separately measurable goal |

Role passives apply only to the matching action: Analyst: Invest +2 Cash; Operator: Protect +2 Stability; People Lead: Influence +2 Trust; Automation Architect: Automate +2 Cash. All effects are provisional and require balance tests.

## Phase flow
`LOBBY → BRIEFING → DISCUSSION → COMMIT → RESOLUTION → BRIEFING`, with optional `VOTE`, one `RESCUE`, and terminal `RESULTS` phases. Server timers and phase changes are authoritative. The engine accepts round resolution only from COMMIT or RESCUE. Voting closes on the original deadline.

Provisional timings: briefing 15s; discussion 45s, all-ready early close, hard cap 75s; action commit 20s; presentation 4–5s normal and 6–8s major. Presentation timing never delays phase progression.

## Policies
- Status Quo: no effects.
- Human Oversight: Influence +2 Trust; Automate −2 additional Cash.
- Automation First: Automate +2 Cash and −2 additional Trust.
- Resilience Mandate: Protect +2 Stability; Invest −2 additional Cash.
- Only explicitly flagged crises open a vote. One vote per seated player; strict majority of valid votes cast wins. Tie or zero votes preserves current policy. Policy takes effect next round.

## Resource danger and collapse
Critical thresholds: Cash 25, Trust 20, Stability 25. At or below any threshold after full round commit, trigger the one-time rescue round if unused. Rescue must end with every resource strictly above its threshold or company collapses. Zero alone is not a separate collapse rule; the thresholds govern danger. Collapse ends the match immediately. On the sixth normal round, a triggered rescue round is still allowed.

## Faction progress formula
Each component is normalized to 0–100; faction score is clamped to 0–100:

`score = resourceWeight * resourceComponent + actionWeight * actionComponent + milestoneWeight * milestoneComponent`

Human weights: resource 0.45, action 0.25, milestone 0.30. AI weights: resource 0.40, action 0.35, milestone 0.25. These are initial test weights, not validated balance values.

- Resource component uses final target state, qualifying round frequency, average relevant resource level, and bounded improvement. Current prototype uses 50% qualifying-round frequency, 30% average level, 20% improvement; decay is subtracted and bounded.
- Action component uses faction-primary-aligned action counts (Invest/Automate for AI; Protect/Influence for Humans; Recover is neutral) and action credits from positive net effects of the acting faction's own aligned actions; limited secondary credit is permitted only for a separately measurable faction resource goal. Current prototype formula is a provisional heuristic and must be revisited after simulations.
- Milestone component is the sum of earned one-time milestone reward values divided by the total reward value in the faction's initial pool, multiplied by 100.
- Milestone rewards are one-time, completed milestone IDs persist, and each faction starts with four milestones in the prototype pool.
- If a faction condition remains unmet at two consecutive completed round ends, add one point of bounded decay to that faction's resource component; reset the streak when the condition is restored. The prototype caps accumulated decay at 15.
- A recovery opportunity is limited to one per faction per match. Its explicit costs, reward type, and eligibility must be defined by content; it cannot waive the progress threshold or aligned-action requirement.

## Faction mandates
A faction mandate succeeds only if all conditions are met:
- normalized faction progress ≥ 65 for Human or ≥ 55 for AI (provisional faction-specific thresholds);
- at least two eligible faction milestones completed;
- at least three actions in its primary-aligned action category by members of that faction;
- Human: Trust ≥ 60 and the Human Oversight milestone completed;
- AI: Cash ≥ 50 and the Automation First milestone completed.

These thresholds are provisional and must be calibrated. Both factions can succeed; one can succeed; or neither can succeed. Relative faction performance is reported separately by final normalized progress (tie = draw).

## Individual scoring — provisional baseline
For the engine prototype: +1 per selected action whose base action effects include at least one positive resource effect; +10 for completed secret objective; +3 if player's faction mandate succeeds; +2 for company survival; −3 for company collapse. This is an implementation placeholder because the earlier design did not lock exact individual point values. Objective completion conditions/content must be added before production use. Tie-break details must be finalized before release.

## Content and randomness
Eight normal crises are included in the initial content pool, plus a special rescue crisis. Crisis selection uses a server-side seeded PRNG and avoids recent repeats when alternatives exist. Secure room/session randomness must use a cryptographically secure source in the eventual server module. Seed must never be exposed while the match is active.

## Public/private data
Public projection includes room ID, ruleset version, phase/round, shared resources, player public identity/faction/role, crisis/policy IDs, public faction progress, history, rescue state, and company outcome. Private player projection includes that player's secret objective and own accepted action. Secret objectives and unrevealed actions must never be broadcast.

## Initial simulation result
A 500-match uniform-random-action diagnostic produced 78.2% company survival, 68.6% Human mandate success, 20.0% AI mandate success, and mean progress 74.38 Human vs 57.10 AI. This is a strong provisional balance warning, not proof of imbalance under strategic human play. Do not release before investigating the faction gap with additional strategy profiles and human playtests.

## Known provisional or incomplete items
1. Exact objective pool and completion logic is not yet authored.
2. Milestone replacement and recovery opportunity eligibility are not yet fully represented in the engine.
3. Current action progress and individual scoring are starter formulas requiring review and simulation.
4. Policy vote orchestration exists in the live loop, but the full vote lifecycle needs a dedicated timed integration/browser test.
5. The server uses native HTTP + SSE, not the originally planned Socket.IO transport; React/Vite were not installed because dependency installation timed out. The interface is a dependency-free HTML/CSS/JS prototype. Rate limiting, host kick/lock controls, hardened multi-tab takeover, full browser E2E tests, and deployment remain incomplete.
6. Public round history currently contains faction resource snapshots and action credits; a full privacy-reviewed event log is still required. Secret objective IDs are placeholders and objectives do not yet have completion rules.
