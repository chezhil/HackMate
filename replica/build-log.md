# Build log

No `replica/architecture.md` exists (replica-architect was not run), so screens are built in the order asked:
Discover, then the hackathon page. The data layer is the real one (existing API routes, SQLite); nothing is faked.
Screenshots for replica-diff are in `replica/clone-screens/` at 1440 and 390 wide.

| ID | screen | date | status | missing | harder than expected |
| --- | --- | --- | --- | --- | --- |
| S01 | Discover | 2026-10-27 | done | prize-on-pin (needs clustering), eligibility filter (no feed-level data), city-tile landing (could) | The map re-fitted its view on every card click; markers had to become a keyed set restyled in place. At 390px the split grid let cards grow past the viewport (needed an explicit `grid-cols-1`). Headless Chrome won't go below ~500px wide, so phone shots use DevTools device emulation. |
