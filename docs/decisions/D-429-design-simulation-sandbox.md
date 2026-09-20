# D-429 — The design simulation sandbox: omega:simulate falsifier red-case rehearsal

## Status

RATIFIED

## Context

- The constitution demands falsifiers that can go RED, not just green — a
  falsifier that cannot fail is a rubber stamp. Nothing in the tree
  currently rehearses the red path: refusals are named in records and
  tested where tests exist, but "which attack on the artifact does each
  clause actually catch" is answered only in production incidents.
- An agent about to build a layer has no way to try its contracts before
  writing code. The rehearsal engine owns runtime behavioral simulation,
  but it is external-lineage (paper `D-432`, assumed-implemented, no tree
  evidence — the verify queue owns its porting); the DESIGN half — does
  the contract surface even bite? — can be rehearsed NOW, against the
  genome verifier's own machinery.

Blocks: none

## Options

| Criterion | (a) A mutation harness over the genome verifier with advisory receipts | (b) Wait for the rehearsal engine and simulate behaviorally | (c) No sandbox — red paths learned in production |
|---|---|---|---|
| Rehearses red paths before code exists | Yes — mutations attack the registry entry; the receipt says which clauses bite | Only after Ω-8 ports — blocked on external lineage | No |
| Honest scope | Yes — the receipt says plainly it is NOT runtime simulation (no load, latency, attack paths) | Fully honest, unavailable | N/A |
| Never blocks (adaptation stance) | Yes — verdict advisory, always; uncaught mutations are findings, not failures | The engine can gate; this must not | N/A |
| Deterministic + reproducible | Yes — same inputs ⇒ same receipt bytes; inputHash pins them | Engine-dependent | N/A |
| Zero host LOC, contained writes | Yes — writes only build/sim-receipts/ | Yes | Yes |

## Decision

**Decision:** (a) — `tooling/gates/simulate.ts`, in substance:

- **The mutation catalog** (fixed order, deterministic): orphan-record
  (treeId → a ghost), status-lie both directions (implemented without a
  record; external-assumed with one), dep-unknown, dep-cycle,
  falsifier-unresolved (point the falsifier at nothing), budget-blow
  (inflate the note past the genome budget). Each names the refusal code
  it expects (GENOME_ORPHAN, GENOME_STATUS_LIE, GENOME_DEP_UNKNOWN,
  GENOME_CYCLE, GENOME_FALSIFIER_UNRESOLVED, GENOME_BUDGET_EXCEEDED).
- **The run** (`omega:simulate <layer-id>`) clones the registry, applies
  each mutation to the layer, and runs the PURE verifyGenome over the
  mutated inputs — the caller's real inputs are never touched. The
  receipt (`build/sim-receipts/<layer>.json`) records per mutation:
  caught or UNCAUGHT, the issue line that fired, the expected code.
- **Verdicts are ADVISORY, always** (the adaptation-governance stance:
  suggest, never block). An uncaught mutation is a finding to fix — a
  seam the verifier does not guard — reported loudly, gated never.
- **Malformed requests are the one refusal**: SIM_LAYER_UNKNOWN for a
  layer the registry does not carry, with the refusal-as-sentence.
- **The scope header** rides every receipt: design simulation only (which
  clauses bite when the registry is attacked); runtime behavioral
  simulation (load, latency, attack paths) lands with the rehearsal
  engine — paper `D-432` — and is NOT claimed here.

## Consequences

- The red path becomes a first-class rehearsal: before building a layer,
  simulate its registry entry; before trusting a verifier clause, watch it
  bite. Uncaught mutations name the seams to tighten in the NEXT record,
  not a silent pass.
- The sandbox cannot become a gate: receipts are advisory by law, and the
  write scope is build/sim-receipts/ only — no decision input, no genome
  mutation, no gate stage reads receipts to fail anything.
- Determinism makes receipts citable evidence: the same registry + layer +
  committed genome reproduce the same receipt byte-for-byte (inputHash).
- Zero host LOC; pure core over the D-425 verifier; one CLI.

## Evidence

- `tooling/gates/simulate.ts` (new — SIM_MUTATIONS, simulateLayer, renderReceipt, receiptPath), `package.json` gains `omega:simulate`.
- Falsifiers, green in this record's tree BEFORE the flip per D-364:
  - F-PRESIM.1 (determinism) — same registry + layer + committed genome ⇒ byte-identical receipt; the inputHash pins the inputs.
  - F-PRESIM.2 (mutation-coverage) — the catalog exercises the genome refusals; every expected catch either fires or is reported UNCAUGHT — never hidden, never gamed.
  - F-PRESIM.3 (advisory-never-blocking) — the receipt verdict is advisory and the write scope is build/sim-receipts/ only; the tool writes nothing else and gates nothing.
  - F-PRESIM.4 (unknown-layer-refusal) — simulating a layer absent from the registry is refused with the SIM_LAYER_UNKNOWN sentence.
- Self-host, exercised in this record's own round: `bun run omega:simulate Ω-DEV.1` rehearses the genome's own layer through the mutation catalog with the committed fold; the receipt lands in build/sim-receipts/ and cites its inputHash.
- Precedents: D-425 (the verifier it rehearses), D-321 (the
  honest-containment stance — claims only what is measured), the
  adaptation-governance law (suggest, never block).

- Ratified on greens (evidence-class, F-PRESIM.1..4 green in this record's tree BEFORE the flip per D-364): landing commit 083739b; full gate green 1232/0 ×2 on the PROPOSED tree (2026-09-20T22:24:15Z and 22:25:53Z); the self-host receipt live (Ω-DEV.1 through the catalog: 6 applicable mutations, 0 uncaught, advisory, inputHash-pinned); the checker clean, docscan 0 findings; zero host LOC; anvil untouched.

## Index

summary: Try-before-you-build scoped honestly: omega:simulate mutates a layer's registry entry through the genome verifier (orphan, status lie, cycle, unresolved falsifier, budget) and receipts which clauses bite; verdict advisory, never blocking; runtime behavioral simulation stays with the rehearsal engine
rationale: A falsifier that cannot fail is a rubber stamp — the sandbox rehearses the red path against the verifier's own machinery before code exists, and states plainly which half of simulation it is not
class: evidence
