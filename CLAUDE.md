# D2-SCP (clyczar fork)

Fork of lozzajp/D2-SCP, the Diablo 2 super chest planner. Live at https://clyczar.github.io/D2-SCP/ (GitHub Pages deploys on push to main).

Before working on the rune-farming automation (capture card, ESP32 controller, bot loop), read `docs/automation-plan.md`. It carries the context from the earlier session: the player's setup, the data analysis, the hardware and the phased plan.

- Dev server: `npm run dev`, pinned to port 5290 (`vite.config.ts`). Tests: `npm test`. Types: `npx tsc --noEmit`.
- Seed search runs on WebGPU when available (`src/search/gpu/`), else CPU workers. `gpu-bench.html` checks GPU against CPU and times a full 2^32 search.
- Talk to the user in Chinese unless they write in English.
