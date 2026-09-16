# Runbook — Daily Loop (migration waves)

1. Read `STATUS.md` (this folder) + `clone-omega/docs/decisions/OPEN-QUESTIONS.md`. Lowest open wave wins.
2. Read that wave's spec in `20-WAVES/` + its triage rows in `30-TRIAGE/`.
3. `bun install` → `bun run omega:quick` (seconds). Fix structural breaks before anything else.
4. Build smallest falsifier-first slice (one op + one real-boot test + one bench line).
5. `bun test --timeout 60000` (serial on Windows) → `bun run omega:gate` → `bun run omega:bench`.
6. Append the six evidence files to `40-EVIDENCE/W<n>/`. Update `STATUS.md`.
7. D-record: PROPOSED with code → RATIFIED only on green + citations (D-364 cooling-off for B1–B4 evidence rows; D-367 fast-path for directives). Board regenerated same-branch.
8. Stop at the wave boundary. Do not start the next wave's code in the same branch.
