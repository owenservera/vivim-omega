# D-424 — The process.publish@1 seam: signed vault-durable process facts, visible to vivim.mind

## Status

PROPOSED

## Context

- `D-423` landed the honest, in-boundary half: the toolchain's own self-description
  (`tooling/gates/process.ts`, the report-only `process` gate stage, `omega:process`).
  It deliberately did NOT make the development genome visible to `vivim.mind`:
  a compartment sees evidence only through ports (`import-surface`, B-2), so it
  cannot read `docs/decisions/*.md`, `build/status.json`, the board, or git.
- The owner's original ask was that self-knowledge be natively embedded so the
  system self-describes and governs, rather than an agent inspecting manually.
  After `D-423` the runtime and the development genome are still two evidence
  classes. Closing that gap needs the only legitimate crossing: a signed write
  that carries a SUMMARY of the process model into the vault, after which it is
  ordinary vault evidence that `mind.query@1` / `mind.portrait@1` may read.
- This record is DESIGN ONLY. It names the seam and the questions that must be
  answered first; it builds nothing and changes no grant.

Blocks: none

## Options

| Criterion | (a) `process.publish@1`: a signed write op that publishes a bounded summary of the `D-423` model into a reserved vault namespace, invoked from the round-close ceremony | (b) Publish continuously from a host watcher on every git/status change | (c) Stay host-side only (`D-423` is the end state) |
|---|---|---|---|
| Makes the genome runtime-visible to `vivim.mind` | Yes, as vault evidence once published | Yes | No |
| Staleness honesty | Explicit: each snapshot carries its tip sha and generation time; readers compare against the live tip and report a stale snapshot as stale, never as current | Smaller staleness window but a permanent writer with its own failure modes | N/A |
| New surface and risk | One op, one reserved namespace, composition-grant change for one publisher; the write is signed and journaled like every other write | Larger: an always-on writer, cadence and back-pressure questions, more grants | None |
| Preserves the mind's no-write, no-veto law | Yes: `vivim.mind` still only reads; enforcement stays in the gate | Yes | Yes |
| Falsifiable before ratification | Yes: F-1..F-5 below | Harder: timing-dependent | N/A |

## Decision

**Decision:** TBD — (a) `process.publish@1` invoked at round-close, with the snapshot carrying its tip sha and generation time; still the owner's call while TBD. Questions the ratifying record must answer before any code lands:

- **Who publishes:** one named plugin with a write capability, or a step in the round-close tool acting through a granted op; never a compartment writing on its own initiative.
- **How often:** on demand at round-close (recommended) versus on every gate green; the cadence decides what a stale snapshot means.
- **What a stale snapshot means:** a reader must be able to tell that the snapshot's tip differs from the live tip, and `mind.portrait@1` must surface that rather than present old data as current.
- **What is published:** the `D-423` model's summary fields only (gate color, board counts, docscan count, program-size count), bounded, never raw record bodies.

## Consequences

- If ratified, the development genome becomes vault-durable, journaled and hash-chained the moment it is published; a wrong publish is a permanent, auditable entry, so the publisher must be narrow and its inputs the same pure derivation `D-423` already tests.
- `vivim.mind` stays read-only; the gate stays the only enforcer. Nothing here gives the mind veto power over ratification.
- Composition grants change for exactly one publisher; that diff is the review surface.
- If declined, `D-423` remains the complete answer and the seam stays documented for the next person instead of being rediscovered.

## Evidence

- Falsifiers named BEFORE ratification (per `D-364`), none built by this record:
  - F-1 the published summary is a pure function of the `D-423` model (same model in, byte-identical summary out).
  - F-2 a snapshot whose tip differs from the live tip is reported stale by the reader, never as current.
  - F-3 a compartment without the publish grant cannot write the reserved namespace (fail-closed).
  - F-4 `vivim.mind` cannot write or veto: the read ops stay read-only after the change.
  - F-5 the round-close path publishes exactly once per close and is idempotent on retry.
- Precedent for the boundary argument: `D-423` (the host-side half) and `D-215` (the falsifiability guarantee that depends on port-only evidence).

## Index

summary: Design-only follow-on to D-423: a signed process.publish@1 write op that would publish a summary of the process self-model into a reserved vault namespace so mind.query and mind.portrait can see the development genome as real vault evidence, with the staleness and cadence questions answered before any code
rationale: D-423 stayed on the host side of the compartment evidence boundary; making the development genome runtime-visible needs a new write path, composition-grant changes and its own falsifiers, so it gets its own record and stays open until the owner decides
class: evidence
