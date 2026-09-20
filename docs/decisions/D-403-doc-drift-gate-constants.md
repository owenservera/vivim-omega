# D-403 — Documentation drift: gate constants vs prose (Omega Forge Wave 0)

## Status

RATIFIED

## Context

Wave 0's first audit compared the two architecture packets (`docs/forge/OMEGA-FORGE-ARCHITECTURE.md`, `docs/forge/OMEGA-FORGE-ARCHITECTURE_plus.md`) against the live tree. The packets describe the house they were written for; three numbers had drifted since: (1) `AGENTS.md` still stated the B5 host budget as 1100 LOC although D-391 re-amended it to 1500 with the kernel merge; (2) `AGENTS.md` stated the composition count as a 16-spec freeze although D-391 moved it to 17 via the D-377 matrix path; (3) `tooling/gates/explain.ts` carried the same 1100 in the host-loc stage text. The packets themselves claim ~13 lines of slack under the freeze — the real number at Wave 0 start was exactly 1500/1500, zero slack. Drift between prose and gate constants is the D-205 existence-law problem in miniature: the gate is the arbiter, the docs claim to describe it, and any gap is a lie one of them tells.

## Options

| Criterion | (a) Fix prose to the gate, record the deltas (recommended) | (b) Amend the gates to the prose | (c) Leave docs, note drift in evidence |
|---|---|---|---|
| Truth direction | Gate constants are the truth; prose follows | Re-litigates ratified decisions by accident | Known-false docs ship |
| Auditability | Each delta named where it was fixed | Silent semantic changes | Drift compounds |
| Cost | Small text edits + this record | Gate churn + re-ratification | Zero now, paid later |

## Decision

**Decision:** (a) — prose follows the gate; every delta is fixed and this record names them.

## Consequences

- `AGENTS.md` B5 line: 1100 → 1500 (D-391's amendment, previously unreflected).
- `AGENTS.md` composition count: "16 specs (D-370 freeze)" → 18 specs (D-391 → 17, D-406 adds `forge-author.json` the same matrix way); the rule is restated as "new specs go through `_matrix.json` + `omega:generate composition`".
- `tooling/gates/explain.ts` host-loc allowlist text: 1100 → 1500 (fixed with the D2 landing).
- The real Wave 0 starting point — host 1500/1500, zero slack — is now stated where the packets' "13 lines of slack" claim used to mislead; Wave 0 touched zero host lines, keeping that true.
- Future drift of the same shape (prose vs gate constant) fails the doc-numbers check in the wave evidence discipline; the fix template is this record.

## Evidence

- `git diff` on `AGENTS.md` (B5 line, composition-count trap 5) and `tooling/gates/explain.ts` (host-loc text) — same-commit fix.
- `bun run omega:quick` green after the edits (doc changes are gate-visible only through decisions + compositions stages, both green).

- Ratified: landed in `0763556` (same-commit prose fixes + this record); quick gate green post-landing; second full gate green (1056/0).
