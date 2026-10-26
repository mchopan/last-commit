# LAST COMMIT — Humans vs. AI

An in-progress real-time multiplayer strategy game. The current repository contains the provisional deterministic game engine, its executable rules baseline, a dependency-free Node HTTP/SSE room server, and a responsive browser prototype.

## Requirements
- Node.js 22 or newer
- npm

No third-party packages are currently required. An attempted installation of React/Socket.IO dependencies timed out in this environment, so this working prototype uses native HTTP + Server-Sent Events for server-to-client updates and authenticated POST requests for commands. This is a transport deviation from the planned React + Socket.IO stack and must be revisited before public deployment. It is not represented as the final architecture.

## Run locally

```bash
npm test
npm start
```

Open `http://localhost:3000` in multiple browser profiles or incognito windows. Create a room in one, join using the six-character room code from the other sessions, and start when at least three players have joined. For a local three-player smoke test, use three separate browser sessions.

## Current implementation status

- [x] Provisional executable rules document
- [x] TypeScript game-engine baseline
- [x] Unit/acceptance tests for setup, validation, simultaneous resource resolution, fallback action, role passives, voting helper, privacy projection, rescue and collapse
- [x] Basic lobby and browser dashboard
- [x] In-memory room server, guest seat tokens, room codes, SSE updates, server-controlled phase timers
- [x] Policy vote orchestration in live match loop (basic, not fully browser-tested)
- [ ] Real secret-objective content and objective completion rules
- [ ] Recovery opportunity eligibility, costs, and reward implementation
- [ ] Fully specified scoring and simulation-based balance calibration
- [ ] Browser E2E tests across 3–6 real sessions
- [ ] Hardened reconnect/session takeover, rate limits, host kick/lock controls, and forced-restart notices
- [ ] Full accessible UI, complete objective reveal, detailed public resolution history, and full browser E2E suite
- [ ] Staging/public deployment

## Important prototype limitations
- The four role abilities, action values, thresholds, faction weights, milestone values, and individual score formula are provisional.
- The current secret-objective IDs are placeholders, not actual objectives.
- This prototype is not yet release-ready. In particular, live policy-vote orchestration and full acceptance coverage remain incomplete.
- All active room and match state is in memory. A process restart loses rooms and active matches.
- Guest tokens are stored in `sessionStorage` by the browser prototype. There is no account system.

See `docs/EXECUTABLE_RULES.md` for the current rules baseline and known gaps.

## Initial balance diagnostic (not a balance verdict)

`npm run simulate -- 500` completed 500 uniform-random-action matches. In this provisional ruleset, company survival was 78.2%, Human mandate success was 68.6%, and AI mandate success was 20.0%; average final faction progress was 74.38 Human vs 57.10 AI. This gap is too large to declare the game balanced. The simulation is a diagnostic baseline, not representative player behavior. Adjust weights, thresholds, action effects, and objective opportunities only through documented, repeatable tests and human playtests.
