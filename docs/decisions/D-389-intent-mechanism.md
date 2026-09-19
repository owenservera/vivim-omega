# D-389 — The Intent mechanism (durable intents, plan templates, delegated step execution)

## Status

RATIFIED

## Context

The migration waves W0/W1 closed with the conformance net, authoring path, and
harvest pipeline in place, and the owner directive asked for a durable intent
mechanism: an object that survives restarts, resolves to a plan (single op or a
multi-step DAG), executes steps under delegated — never ambient — authority, and
cancels with compensation. The design is recorded in
`INTENT-MECHANISM-PROPOSAL.md` and landed across four phases on `main`
(`6975c4c`…`cb022ad`). Kernel-side changes were rejected from the start: a
dynamic multi-plugin router would break B1/B5, and host-minted per-intent
tokens would spend the frozen B3/B5 budget for no narrowing that
`law.attenuate@1` does not already buy. The namespace rows (`intent`,
`intent-plan`) are in `docs/VAULT-NAMESPACES.md` with separate writer trust.

## Options

| Criterion | (a) Plugin `vivim.intent` over existing law/vault/director ports | (b) Kernel-side dynamic router + host-minted intent tokens | (c) Director absorbs intents as rules |
|---|---|---|---|
| Law fit | Zero host change (B5 held); every step gated by `law.check@1` under a single-use attenuated delegation (B3 semantics reused) | Breaks B1 (code without a signed manifest path) and B5 (host growth) | Stretches the director charter past "deterministic control plane"; tick loop is not a durable-object store |
| Durability | Intents are vault objects in ns `intent`/`intent-plan` with the registry-row discipline | Same, but the router is host policy — the one thing the host may not hold | Rule rows are the wrong shape for multi-step state |
| Cost | One manifest, 5 contracts, workspace pkg, falsifier tests | Host redesign + B3/B5 budget spend | Director rewrite |

## Decision

**Decision:** (a) — full four-phase build as `plugins/vivim.intent`: Phase 1 contracts
(`intent.ts`) + manifest + plugin wiring + falsifier tests; Phase 2 plan
templates (`intent-plan.ts`, `intent-plan` namespace, multi-step resolution,
dependency-graph support); Phase 3 payload projection (`InputMapping`,
JSON-pointer, depth ≤ 4, `PlanTemplateV2`) applied at step execution; Phase 4
cancellation with compensation evidence (`IntentContext`, `CompensationIntent`
— consent-gated; compensation WRITES evidence, it never implies rollback).
Deferred by design, not omission: kernel-side dynamic router (breaks B1/B5);
host-minted per-intent tokens (B3/B5 budget; attenuation achieves the same
narrowing); full saga/rollback engine; `IntentContext` consumer wiring; data-only
input mapping/output chaining beyond the same-payload DAG (projection waits for
`plan:<type>@2` once a real workflow needs it).

## Consequences

- The intent spine exists as governed vocabulary + plugin with zero host diff
  (B5 held at 1039/1100) and no composition edits (16-spec freeze held; the
  plugin's composition entry is the owner's next matrix decision).
- The deferred list above is the honest boundary: compensation is evidence,
  not rollback; sagas do not exist until a consent-carrying consumer lands.
- The four plan/saga wire exports ship before their consumers per the D-332
  reservation discipline (allowlisted in `tooling/gates/contract-sites.ts`
  with this pointer) — the same posture as the D-373 storage.kv wire shapes.
- Record repaired into the six-section shape during workspace setup (the
  landed commits predate it); substance unchanged from the phase commits.

## Evidence

Falsifier tests: `plugins/vivim-intent/test/intent.test.ts` (17 pass — submit/
resolve/step-execute with delegation evidence/cancel-with-compensation/status,
manifest claim) and `intent-phase3-4.test.ts` (projection, depth bound,
compensation consent gate). Landing commits on `main`: `6975c4c`, `094a3e6`,
`c5fd057`, `77d6c28`, `8dafd34`, `99f7fb8`, `cb022ad` (all resolvable).
Workspace wiring repaired during setup: plugin `package.json` added (the
D-377 checklist `bun install` step had been skipped, breaking module
resolution) and the manifest `contentHash` set to the honest pre-compile empty
value per the sdk schema law. Ratified: falsifiers 17/17 green at tip plus two
consecutive full greens (962/0, host 1500/1500, attest green, Linux).
