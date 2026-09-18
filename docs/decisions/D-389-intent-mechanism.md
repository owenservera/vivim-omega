## Status
PROPOSED · evidence · D-389 v0.2 (Phase 1 adopted)

## Context
See `INTENT-MECHANISM-PROPOSAL.md` (full architecture doc) and `contracts/src/intent.ts` (Phase 1 contract). This record covers the ratified direction: new plugin `vivim-intent`, new vault namespaces (`intent`, `intent-plan`), authority/delegation via existing `law.attenuate@1`, zero host changes (B5 preserved).

## Decision
Full Phase 1 implementation (contracts + design + plugin manifest + vault namespace docs + real-world tests). Kernel-side dynamic router explicitly rejected (§2 of proposal). Plan templates deferred to Phase 2; same-payload DAG only for Phase 1.

## Evidence
- Grounding: `contracts/src/intent.ts` created; `manifest.ts` gains optional fields (`idempotent`, `cancellable`, `estimatedCostMs`); `VAULT-NAMESPACES.md` updated with `intent`/`intent-plan` rows.
- Falsifier: real-world test proves (a) submitted intent resolves through `resolve.classify@1` unchanged, (b) sourcePrincipal integrity enforced, (c) idempotency and cancellation behave per spec.
- Remote `main` (github) updated with adopted version.
