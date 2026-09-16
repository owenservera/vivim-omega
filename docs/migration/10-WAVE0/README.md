# Wave0 — Arbitration Work Package

**Entry:** `00-ASSESSMENT/03-WAVE0-ARBITRATION.md` is the spec. This dir is the workbench.
**Exit:** the 6 gate criteria in that doc. No code beyond the conformance net + index probe.

## Task list (in order — each gates the next)

1. **W0-1 Conformance net (land first).** One read-only gate stage: grant resolution + cross-composition drift (allowlisted) + D-332 zero-callsite flag + D-351 risk parity. Falsifier: seeded drift fails with a named diagnostic. Touches `tooling/gates/` + docs only.
2. **W0-2 Index probe + bench.** Append-latency vs ns-size (1K/10K/100K) for ns `chat` + bounded-read assertion + cap fail-closed extension. Touches `plugins/vivim-chat/test/` + `BENCHMARKS.md` lineage (in clone-omega, not here).
3. **W0-3 Byte-identical definition.** Canonicalization vs volatile-allowlist for the G5/C0 substitution test. Doc-only (`docs/` in clone-omega + copy here in `40-EVIDENCE/`).
4. **W0-4 Seven D-records PROPOSED.** One per upgrade (matrices + criteria + evidence plan). Index + board regenerated in the same branch. See `CORE-UPGRADES.md` for stubs.
5. **W0-5 Gate + evidence.** `bun test` + `bun run omega:gate` + `bun run omega:bench` on clone-omega; host LOC diff (must be zero); status citations; append outputs to `40-EVIDENCE/`.

## Constraints

- Zero `host/src` lines added or removed (freeze — removal also needs a same-commit reason; Wave0 has none).
- Zero legacy writes (read-only harvest refs only).
- Zero new compositions (read the 16, generate none yet — generator is specified in W0-4, built in W1 if needed).
- Directive vs evidence discipline (D-364/D-367): process/shape rows may fast-path; any B1–B4-touching row keeps full cooling-off.

## See also

- `CORE-UPGRADES.md` — the 7 D-record stubs (copy into `clone-omega/docs/decisions/`, flesh matrices there).
- `GATE-CRITERIA.md` — the exact commands + expected outputs + evidence checklist.
