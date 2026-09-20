# D-424 — The process.publish@1 seam: signed vault-durable process facts, visible to vivim.mind

## Status

RATIFIED

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

**Decision:** (a) — `process.publish@1`, a signed write op that publishes a bounded summary of the `D-423` model into a reserved vault namespace, invoked on demand at round-close, each snapshot carrying its tip sha and generation time. Adopted as the DIRECTION and its constraints, as an owner call (directive-class, same-day, honestly labeled); no code lands under this record. In substance:

- **What is published:** the `D-423` model's summary fields only (gate color, board counts, docscan count, program-size count), bounded, never raw record bodies.
- **Cadence:** on demand at round-close, not on every gate green and not from an always-on watcher (option (b) is declined).
- **Stale snapshots:** a reader compares the snapshot's tip sha with the live tip; `mind.portrait@1` surfaces a mismatch as stale, never as current.
- **Publisher:** exactly one narrow write capability. WHICH one (a named plugin, or a round-close step acting through a granted op) is left to the implementation record; it is deliberately not decided here.
- **The mind stays read-only:** `vivim.mind` gains no write or veto power; enforcement stays in the gate.
- **Implementation is separate:** the record that builds this is evidence-class, touches composition grants, and needs F-1..F-5 below built and green BEFORE its own flip (D-364). This record does not satisfy that bar and does not claim to.

## Consequences

- The development genome becomes vault-durable, journaled and hash-chained the moment it is published; a wrong publish is a permanent, auditable entry, so the publisher must be narrow and its inputs the same pure derivation `D-423` already tests.
- `vivim.mind` stays read-only; the gate stays the only enforcer. Nothing here gives the mind veto power over ratification.
- Composition grants change for exactly one publisher; that diff is the review surface.
- Until the implementation record lands, `D-423` remains the complete working answer; this record fixes the direction and its constraints so the next person does not rediscover the seam.

## Evidence

- Falsifiers named for the implementation record (per `D-364`), none built by this record, which is why it ratifies as a directive and not as evidence:
  - F-1 the published summary is a pure function of the `D-423` model (same model in, byte-identical summary out).
  - F-2 a snapshot whose tip differs from the live tip is reported stale by the reader, never as current.
  - F-3 a compartment without the publish grant cannot write the reserved namespace (fail-closed).
  - F-4 `vivim.mind` cannot write or veto: the read ops stay read-only after the change.
  - F-5 the round-close path publishes exactly once per close and is idempotent on retry.
- Precedent for the boundary argument: `D-423` (the host-side half) and `D-215` (the falsifiability guarantee that depends on port-only evidence).

- Ratified as an owner directive (2026-09-20, same-day, directive-class per D-364, labeled honestly: a design commitment with no code and no falsifier evidence): landing commit cf7a8d5 (this record's PROPOSED landing, gate green 1190/0 ×2 with `D-423`); zero host LOC; no grant changed; the implementation record will be evidence-class with F-1..F-5 built first.

## Index

summary: Design-only follow-on to D-423: a signed process.publish@1 write op that would publish a summary of the process self-model into a reserved vault namespace so mind.query and mind.portrait can see the development genome as real vault evidence, with the staleness and cadence questions answered before any code
rationale: The owner adopted the design direction and its constraints the same day as a directive; the build needs its own evidence-class record with the falsifiers green first, because it adds a write path and changes composition grants
class: directive
