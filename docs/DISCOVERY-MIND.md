# DISCOVERY-MIND.md — Ω8: the discovery mind (inference → mapping → verification)

**The pipeline.** The discovery mind turns a *perceived application* into *provably-bound
surface contracts*. It is four stages, and every stage is an ordinary plugin whose only
outputs are data objects + evidence in the user's vault:

```
perceive (Ω7)          observe (Ω7)              infer (Ω8)              map (Ω8)                  verify (Ω8)
capture the DOM   →    watch causal event   →    label heuristics   →    constraint solving    →    postcondition probes
(page.json)            traces (events.jsonl)     → candidate            against the domain          → PROMOTED or DRAFT
                                                 SurfaceContracts        pack blueprint              (never confidence)
```

| stage | op | input | output (vault ns `discovery`) |
|---|---|---|---|
| perceive/observe (Ω7) | `discovery.perceive@1` / `discovery.observe@1` | captured pages + event traces | `ApplicationGraph` {nodes, edges} with evidence refs to capture spans |
| **infer** | `discovery.infer@1` | the graph (inline JSON payload or a vault ref) | `candidates:<runId>` — DRAFT `discovery.surfacecontract@1` objects |
| **map** | `discovery.map@1` | candidates + the domain pack blueprint (payload, or `config.blueprintPath`) | `mapping:<runId>` — bindings / gaps / surplus |
| **verify** | `discovery.verify@1` | mapping + caller-supplied postcondition probes | `promotion:<runId>` — the promotion event with the full proof chain |

**Candidate shape** (`discovery.surfacecontract@1`, the SCHEMA contribution of the
inference engine): `{id, nodeId, op, selector, actionType: click|type|read,
riskHint: EXTERNAL_MUTATION|MUTATION|READ, evidence: EvidenceRef[], status:
DRAFT|PROMOTED|REJECTED, confidence: 0..1}`. Inference rules: buttons whose labels
match action words → click contracts with label-derived ops (`message.send`,
risk-hinted EXTERNAL_MUTATION for send/delete-like, MUTATION for move-ish, READ for
read-ish; unknown labels fail closed to EXTERNAL_MUTATION, same philosophy as the
law's `defaultRisk`); fields → typing contracts; lists → read contracts.
Confidence is a recorded label-match heuristic (exact domain word 0.9, partial 0.6,
generic 0.4) — **it is never an input to promotion.**

**Constraint solving (mapping).** The domain pack's CONTRACT contributions are the
demand; the candidates are the supply. Each blueprint op must bind to **exactly one**
candidate under three constraints: op-name match, non-empty selector, and *strict*
risk-class compatibility (blueprint `EXTERNAL_MUTATION` needs candidate
`riskHint: EXTERNAL_MUTATION` — a mismatch is a **gap**, never a silent bind). An
unbindable blueprint op makes the mapping UNSAT with a gap report
`{missingOp, reason}`; extra candidates are recorded as **surplus** (supply without
demand — never an error). When several candidates fit one op, the solver picks one
deterministically (confidence desc, evidence count desc, id asc) and records the
rest as alternatives.

## The promotion-gate-with-evidence invariant (the hallucination cure)

> **Promotion is proof, not confidence.** A DRAFT candidate becomes PROMOTED only
> through caller-supplied postcondition probes with recorded evidence:
> `score = passedProbes / total ≥ policy.threshold` AND
> `probeCount ≥ policy.requiredProbes` AND every probe cites vault refs that
> **resolve** (`evidenceRequired`). Anything else stays DRAFT with a gap report.

Why this is the cure: an LLM (or any inference engine) can *claim* "this button is
`message.send`" — confidence 0.99 included. It cannot fake the *consequences* of
clicking it. The probe harness (fixture replay in tests; the Ω10 action loop in
production) actually drives the mapped selector and checks the postcondition —
"click send → a new message node appears in the outbox region" — and every probe
cites the vault capture span it replayed against. The gate composes three laws:

1. **Evidence is mandatory upstream** — the inference engine refuses to emit a
   candidate whose graph node carries no evidence refs (an unevidenced surface is a
   hallucination, and it is refused at birth, not caught later).
2. **Evidence must exist** — the verification engine resolves every probe's refs
   through `vault.get@1`; a ref that is not in the vault fails the proof (fail-closed:
   if the resolution leg itself fails, nothing promotes).
3. **The proof is sealed** — the promotion event is a vault append whose `refs` carry
   the whole proof chain (every probe's evidence + the candidates object + the
   mapping object), Merkle-chained and refs-honored under compaction. A promotion can
   be audited from the vault alone.

The counter-tests are pinned in the suites: a candidate with confidence 0.99 and
score 0.6 **stays DRAFT**; a candidate with confidence 0.3 and 3/3 passing probes
**promotes** (proof beats confidence, in both directions).

## Thresholds are POLICY data

The numbers `0.95 / 3 / true` live in the verification engine's **POLICY
contribution** `discovery.promotion-policy@1` (plugin.json), loaded from the manifest
the host delivered — never from a code constant. Amending the gate = shipping a new
plugin version and re-compiling the Recipe (the composition pins the policy by
content hash); the µhost never re-implements the gate. The unit suite proves it: the
same `evaluatePromotion` code flips its outcome when fed a doctored manifest
(threshold 0.5, requiredProbes 2 → 2/3 promotes), and a malformed or missing policy
refuses to run rather than inventing thresholds (fail-closed).

## How Ω9's healing consumes promotions

The gap reports are the healing mind's work queue:

- **Mapping gaps** (`{missingOp, reason}`) — a blueprint op the perceived surface
  cannot satisfy: the healer can re-perceive (richer capture), ask for a provider
  that implements the op, or surface the gap to the user as "this app cannot send
  mail through any discovered surface."
- **Verification gaps** (`score 0.67 < threshold 0.95`, `evidence incomplete — …`) —
  a surface that binds but does not *work*: the healer can re-probe with fresh
  fixtures, quarantine the candidate, or downgrade the mapping.
- **PROMOTED events** are the only contracts the action loop may drive: a promoted
  `message.send` candidate is a selector that provably sent mail in a replayed
  fixture. Healing never promotes; it consumes `promotion:<runId>` objects (vault ns
  `discovery`, `meta.type: "promotion"`) and their evidence chain, and it can replay
  the probes to re-verify before acting.

## Compositions and evidence topology

`compositions/discovery-mind.json` boots: `vivim.law` (phase 0), `vivim.vault`, and
the three engine plugins (phase 1, each an ordinary plugin). The engines request only
vault port capabilities (`port:vault.append@1` +, where evidence must resolve,
`port:vault.get@1`); their appends pass the law gate as `vault.append@1` (MUTATION →
allow-and-journal) under each engine's own principal — the journal names who
promoted what. Engine ops are ENGINE contributions (risk is contract-kind data per
the pinned manifest grammar, so the engines' semantic READ class is documented on
the contributions and the ops route ungated like provider ops).

All discovery data lives in vault ns `discovery`: capture spans (Ω7),
`candidates:<runId>` (infer), `mapping:<runId>` (map), `promotion:<runId>` (verify)
— each append's `refs` link to the evidence it was derived from, so the whole chain
from DOM capture to promotion is one walkable provenance graph.

**GATE-Ω8 evidence**: `bun test plugins/discovery-inference
plugins/discovery-mapping plugins/discovery-verification` (56 tests) — the
integration suite boots the real composition and runs the full pipeline, including
the Ω7 fixture data when present (`fixtures/webmail-inbox/page.json` read as plain
data) and a broken-probe variant that stays DRAFT.
