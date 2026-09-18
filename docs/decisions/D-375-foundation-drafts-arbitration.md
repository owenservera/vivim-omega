# D-375 — Foundation drafts arbitration: DRAFT-002 lands, DRAFT-003 selective, MASTER deferred

## Status

RATIFIED

## Context

The owner delivered three foundation documents on 2026-09-16 (recorded verbatim in
`docs/migration/10-WAVE0/received/`): DRAFT-002 (arbitrated DB-agnostic data plane +
polyglot process tier), DRAFT-003 (supersedes 002 with wasm tier, OS-enforced limits,
S3 cold tier, streaming ops, telemetry, warm pools), and a FOUNDATION MASTER (local
autonomic data layer: predictive control, TEE attestation, capability synthesis,
local durable log). DRAFT-002 §0 already rejected bundling TEE/self-deploying-agent
class features ("it doesn't fit a project whose µhost is capped and whose only
sanctioned trust primitive is the signed Recipe + capability token"), and the MASTER's
own §8 marks the same items non-goals at this scope. The INTENT principles decide:
core first, plugin-pure, one proves before many, no vocabulary without writers,
fail closed. The owner directive for this wave delegated ratification authority to
the implementing agent ("ratify your proposal override any internals").

## Options

| Criterion | (a) DRAFT-002 base + selective DRAFT-003 + MASTER deferred (this row) | (b) DRAFT-003 wholesale | (c) MASTER wholesale |
|---|---|---|---|
| Lands this wave with falsifiers | Yes — every landed piece has a live falsifier | No — wasmtime dependency, per-OS limit probes and S3 need their own evidence first | No — TEE/synthesis lack falsifiers and a trust ruling |
| Law fit | All additive, gate-passable, zero host LOC | wasm tier collides with D-354 reserve; new runtime dep needs own record | D-325 durability adjacency; trust expansion without a bar |
| Complexity budget | One slice, two records (D-373/D-374) | Six subsystems | Nine sections incl. hardware deps |
| Honest scoping | Deferred items named with revisit triggers | Implicit | Implicit |

## Decision

**Decision:** (a) DRAFT-002 base + selective DRAFT-003 + MASTER deferred — DRAFT-002
is the landing spec (its §6 falsifier set governs D-373/D-374 ratification); from
DRAFT-003 this wave adopts ONLY the driver `health()` probe and the warm-pool SHAPE
note (vivim-run already owns bounded pools), while wasm (D-354 reserve + its own
record), S3 cold tier, streaming ops, telemetry capability, and OS-enforced spawn
limits are named deferrals with triggers; the MASTER is deferred in full — its
autonomic monitor, TEE enclave, and capability synthesizer each require their own
INTENT-anchored proposal, decision record, and falsifier set before any code exists,
and the local durable log is re-derivable later without this slice (single-writer
SQLite WAL + D-325 forbidden-durability law already bound the durability story).
Nothing is dropped silently: all three drafts stay verbatim in `received/` as the
audit trail, and this record is the pointer the next wave reads first.

## Consequences

- D-373/D-374 scope is fixed by DRAFT-002's landing order steps 1–6 (contracts,
  spawn/broker, seam, drivers, postgres, python shim) minus the generator-dependent
  steps, which wait for W0-1 — the D-370 16-spec freeze holds.
- Revisit triggers: wasm tier — the isolation-taxonomy ruling plus a real
  third-party-sandbox need; OS-enforced limits — the first composition whose process
  budget is observably exceeded before watchdog detection; S3/cold tier — the first
  vault whose compaction pressure shows in bench numbers; telemetry — Wave6 SLO work;
  durable log — any multi-writer or cross-store durability need (each arrives as its
  own record, never as drift).
- The MASTER document is the record of a proposal considered and deferred — reading
  it later starts here, not inside the document.

## Evidence

- Received drafts verbatim: `docs/migration/10-WAVE0/received/` (three files, dated
  2026-09-16, uploaded by the owner for this wave).
- DRAFT-002 §0 (out-of-scope bundling rejection) and MASTER §8 (explicit non-goals)
  — the two documents agree on the boundary this record adopts.
- Owner directive 2026-09-16: extract, plan best-of-all-worlds, ratify the proposal,
  override internals, implement (delegated ratification authority, applied here).
- Landing: 377c4ed — gate GREEN (776/776, host flat); the arbitrated scope shipped inside one commit with every landed piece carrying its live falsifier (D-373 parity digest, D-374 broker suite); deferred items carry named triggers in this record.

Re-cited per D-390 (history-reset evidence reconciliation): the landing SHA(s) above
belong to the pre-reset history superseded by the adoption of vivim-omega-latest
(f780d06 -> 6d6a3ad, 2026-09-18); adoption commit f780d06 attests the landing state in the
current history. Substance of this record unchanged; original SHA(s) preserved.
