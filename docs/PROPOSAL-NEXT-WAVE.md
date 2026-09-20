# Proposal: Next Wave — Computation Routing + Provenance Linkage (D-323/D-324)

> **SUPERSEDED 2026-09-18 — archived copy exists at `docs/archive/PROPOSAL-NEXT-WAVE.md`
> (this live duplicate missed the archive banner). D-323 and D-324 are RATIFIED** —
> the status line below is a stale snapshot, not an open ask. Do not re-execute:
> the build spec below already landed as the named records. Live sequencing:
> `docs/forge/BACKLOG.md` + the decision ledger.

**Status:** PROPOSED — awaiting owner greenlight. On approval this becomes the build
spec; D-rows below flip PROPOSED→RATIFIED only on a green gate, per the Decision Contract.
**Baseline:** `omega` @ `9a1e00f` (gate green 542/542). Touches no host, no law, no vault,
no compositions.

## Objective

Close two named gaps with writers, not vocabulary: computation-kind routing (§3.1 of the
V2 roadmap, corrected) and provenance linkage (§3.2 + §3.3). Everything in this wave ships
with its producer and its reader in the *same* commit — no new names without runtime.

## Design corrections applied (vs the V2 roadmap text)

1. **New `ComputationKind` enum, no `ProviderClass` reuse.** Execution modality
   (SIMULATOR/API_NATIVE/BROWSER_MEDIATED) and reasoning kind are different axes —
   an API_NATIVE provider can serve a deterministic lookup. Reuse would bake a category
   error into a shared type.
2. **Scorecard needs one writer addition.** `TaskResult` carries no strategy/kind tag,
   so "reader only" is impossible as specified. The design below records decisions +
   outcomes in vault ns `resolve` (two revs of one object) instead of touching the
   hot `run.submit` path at all.
3. **Epistemic enum ships three values, not five.** `CONTRADICTED` has no producer;
   it arrives with one or not at all.

## Item 1 — Computation routing (D-323)

**New contract** (`contracts/src/agent.ts` adjacent; new file `contracts/src/compute.ts`):

```typescript
export type ComputationKind = "DETERMINISTIC" | "PROBABILISTIC" | "HUMAN";
export interface ResolveDecision {
  decisionId: string;      // "resolve:<hex>" — joins the later outcome report
  intent: string;          // the raw NL / op string classified
  kind: ComputationKind;
  capability: string;      // routed op id to call ("" when kind is HUMAN)
  reason: string;          // which rule fired, human-readable
}
export interface ResolveOutcome {
  decisionId: string;
  status: "ok" | "timeout" | "error";
  execMs: number;
}
```

**Three new engine ops on `vivim.director`** (folded, not a new plugin: director already
holds vault read caps, the rule table consults ns `automation` rules which are its home
turf, and this avoids a manifest + composition-wiring + grant sprawl for v0; charter
stretch documented here explicitly — director becomes "the deterministic control plane"
rather than "the reprogramming loop"):

| Op | Input | Behavior |
|---|---|---|
| `resolve.classify@1` | `{intent, context?}` | Rule table: (1) a matching enabled `automation` rule → `DETERMINISTIC` + its action op; (2) else a PROMOTED `providers` realization for the intent's archetype → that realization's class-mapped kind (`SIMULATOR`→`DETERMINISTIC`, else `PROBABILISTIC`) + its op; (3) else `HUMAN` with empty capability (safe default: escalate, never guess). Appends decision record rev 1 to ns `resolve`. |
| `resolve.report@1` | `{decisionId, status, execMs}` | Appends rev 2 (outcome) onto the decision object. Validates the decision exists (UNKNOWN otherwise). |
| `strategy.scorecard@1` | `{kind?, capability?, limit?}` | Reads ns `resolve` decision objects with outcomes; returns per-`(kind, capability)` rows: `{n, okRate, p50ExecMs}` sorted by n desc. Pure aggregation — no thresholds, no auto-actions (scoreboards inform, they don't decide). |

**Why not a `vivim.resolve` plugin:** it would need identical vault caps, a new manifest, new grants in every composition that wants routing intelligence, and a composition entry — four touch points to buy separation that nothing yet needs. Split it out the day a second consumer needs classification without director's rules (documented as the split trigger, not a TODO).

## Item 2 — Provenance linkage (D-324)

Two additive, independently-shippable contract changes:

1. **`VaultProvenanceRef.epistemicStatus?`**: `"OBSERVED" | "INFERRED" | "ASSUMED"` (+ `"VERIFIED"` reserved for probe-backed writes — adopted first by verification's realization `evidenceRefs`, which it already resolves). Mapping attaches `INFERRED` to variation evidence it carries but did not resolve. Nothing existing breaks (optional everywhere); nothing else is asked to adopt it (G7 opportunistic policy).
2. **`DecisionRecord.buildDecisionRef?`**: optional D-### id string, passed through by `decision.record@1` (validated non-empty when present). First writers: resolver decisions cite the D-row authorizing the pattern (D-323); agent spawns against behavior contracts cite D-309.

## Gate criteria (falsifiers — wave is not built until all hold)

- `bun run omega:gate` green (all six stages, including `decisions`).
- Rule-table branches unit-covered: deterministic-match, PROMOTED-realization, escalate-default, plus stale/missing-input fail-closed paths.
- Integration through a real boot: classify → report → scorecard round trip with seeded decisions; scorecard arithmetic asserted exactly (okRate/p50 over known outcomes).
- Mapping variation evidence carries `INFERRED`; verification realization evidence carries `VERIFIED`; a test asserts the distinction survives the vault round trip.
- `decision.record` accepts + stores `buildDecisionRef`; rejects malformed.
- No new plugin, no composition edits, no host/law/vault changes (asserted by `git diff --stat` review, not by test — reviewer check).

## D-rows

- **D-323** (computation routing: kind enum + 3 director ops + scorecard) — PROPOSED on approval.
- **D-324** (provenance linkage: epistemicStatus + buildDecisionRef) — PROPOSED on approval.
- Both flip only on the gate above. Evidence: wave commit SHA + gate run.

## Sequencing within the wave

Contracts → director ops + tests → mapping/verify evidence adoption → agent passthrough → scorecard tests → gate → ratify. Single wave, single gate cycle; split only if the gate cycle exceeds one working session (cut point: Item 1 then Item 2, never the reverse — linkage needs the resolver's records to reference).

## Non-goals (explicit)

- No B1a acting loop (D-313 stays the design owner for execution; the resolver routes, it does not act).
- No A4 healing writes (specified, separate receiver).
- No `INTELLIGENCE_HARNESS` member, no fourth computation kind, no scoreboard-driven auto-routing (scoreboards inform).
- No `CONTRADICTED` status until a conflict detector exists to write it.
