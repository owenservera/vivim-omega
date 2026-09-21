# D-433 — Context Assembly is core (Omega-3 port, paper D-427)

## Status

RATIFIED

## Context

- Without a core context layer, assembly hides inside realizations: each provider formats its own prompt from whatever it reaches — provenance, replay, tuning, cost attribution, and sovereignty all die quietly (paper `D-427` §1).
- Requires Ω-1 (tree D-431) + Ω-2 (tree D-432) green: assembly consumes watch-origin intents and spends token budgets the governor granted. Completes the "mind spine" (§11 fresh-build item).
- Invariant: no realization ever reads the vault; realizations receive sealed contexts assembled by core, under the governor, through the law (third face of the Ω-1/Ω-2 sovereignty rule).
- Tree collision noted: tree D-433 here vs paper Ω-9 specId `D-433` — kept distinct per the two-numbering rule (treeId vs specId); registry records both.

Blocks: none

## Options

| Criterion | (a) Core assembler port (tooling + tests, zero host LOC) | (b) Provider-formats-own-prompt | (c) Defer |
|---|---|---|---|
| Sealed inspectable artifact | Yes — `ns ctx` rows with refs, transforms, seals | No — input never a row | No |
| Determinism + replay | Yes — byte-identical seals; replay vs any realization | No — hallucinations unre-examinable | Unknown |
| Tunable spine | Yes — named policies, demotable weights, reversible | No lever — retrieval was accident | Stuck |
| Token accounting | Yes — spend joins ctx × realization × namespace | Unattributable | Blind |
| Sovereignty (no vault reads) | Yes — fetch refused `CTX_REALIZATION_READS_VAULT` | Model door re-opens Ω-1 violation | Open hole |

## Decision

**Decision:** (a) — port paper `D-427` as tree D-433: a core sole-writer assembler emitting sealed, budgeted ctx artifacts; scorers/summarizers participate only as badged grantable realizations; replay re-feeds sealed contexts.

## Consequences

- Harder: every model-serving event must cite a ctx ref; unnamed transforms are gate errors; summarization pays nested-atom cost; indexes must prove regenerability.
- Easier: "what did it know when it said that" becomes a query; replay-with-substitution diffs become evidence; Ω-5 analytics gains real material; Ω-8 gains simulation ground truth.
- Revisit: policy weight schemas per namespace; scorer confidence calibration; recursion bound tuning; embedding-index projection proofs.

## Evidence

- F-CTX.1 (artifact-inspect) — vault-context question yields a W5 event citing a ctx ref; `ctx.inspect` renders refs, transforms, scorer badges, token count, budget claim from CLI.
- F-CTX.2 (determinism) — same intent twice, unchanged vault + policy → byte-identical seals.
- F-CTX.3 (replay-substitution) — replay of a recorded response against a different realization cites the same ctx; diff attributable to realization alone.
- F-CTX.4 (forensics) — any past response resolves to every token the model saw, with vault byte offsets.
- F-CTX.5 (fetch-refusal) — direct vault read by a forged plugin refuses `CTX_REALIZATION_READS_VAULT`, spoken and ledgered.
- F-CTX.6 (honest-forgetting) — shredded row replays as a named `vacated` marker, never silent omission.
- F-CTX.7 (tunable-spine) — policy demotion of a namespace changes subsequent assemblies; change ledgered, badged, reversible.
- F-CTX.8 (token-accounting) — spend per ctx joins realization × namespace; cross-model per-namespace totals answer as one query.
- Spec: paper `D-427` (§0–§10, 1-8 spec lines 775–1019); requires Ω-1 (D-431) + Ω-2 (D-432).
- Gate: owner-directed ratification per owner directive 1 — isolated falsifier greens pre-flip; full-suite crash recorded as pre-existing environmental exception (Windows soak/MCP, baseline-documented); status.json stays last-green-carried.
- Landed in `9e45326` (PROPOSED commit; ratified on owner directive 1).

## Index

summary: Port Omega-3 Mind Spine sealed contexts under governor from paper D-427
rationale: No realization reads vault; core assembles sealed budgeted contexts
class: evidence
