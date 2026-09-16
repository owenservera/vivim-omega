# Evidence — append-only wave proofs

One subdir per wave (`W0/`, `W1/`, …). Each holds the six files from `10-WAVE0/GATE-CRITERIA.md`:

- `gate.json` · `bench-delta.md` · `boot.log` · `host-diff.txt` · `decisions-diff.txt` · landing-SHA note

**Rules:** append-only (never edit a landed run); green only (red runs go in `rejected/` with a reason); status citations per D-362 (landing SHA + command, never hand-written `status.json`).

Seeded here: Wave0 entry baseline (fill before W0-5).

## Wave0 entry baseline (clone-omega @ 61d1a41, 2026-09-16 inventory)

- `hostLoc`: 911/1100 (`host/src` 8 files, measured this assessment)
- Tests: ~733 (committed lineage; record actual on first W0 run)
- Compositions: 16 (freeze holds)
- Decisions: D-210–D-372 (6 PROPOSED: D-313/314/316/317/366/372)
- Namespaces: 13 (`VAULT-NAMESPACES.md`)
- Known limits: L-1–L-13
- Bench walls carried: boot 10ms (D-363), daemon RTT ~0.3–0.5ms warm vs ~68–102ms cold, watchdog 2.9s wedge / 3.7s bomber, resourceLimits NOT ENFORCED (130MB/32MB Linux)
