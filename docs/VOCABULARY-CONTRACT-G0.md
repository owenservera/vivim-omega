# VOCABULARY CONTRACT (Gate G0)
**Status:** RATIFIED
**Version:** 1.0.0
**Date:** 2026-09-12

This document serves as the standalone, versioned cross-track vocabulary contract for VIVIM-Ω.
It defines the strict semantic boundaries for provider realizations, risk gating, and evidence provenance.
Any external system (e.g., the DB-track control plane) integrating with Ω MUST conform to these definitions.

## 1. Realization Status Enum (`RealizationStatus`)
Defines the lifecycle state of a provider realization. Status transitions are strictly gated by proof, not confidence.

| Status | Definition | Legal Transitions | Authorized Component |
|---|---|---|---|
| `DRAFT` | Initial state of a newly inferred realization. | → `TESTING` | `discovery-compiler` |
| `TESTING` | Realization is undergoing probe-based verification. | → `PROMOTED`, `REQUIRES_REDISCOVERY` | `discovery-verification` |
| `PROMOTED` | Realization has passed proof-based evaluation. Active and routable. | → `DEGRADED` | `discovery-verification` |
| `DEGRADED` | Realization has drifted beyond policy thresholds. | → `TESTING`, `REQUIRES_REDISCOVERY` | `discovery-healing` |
| `REQUIRES_REDISCOVERY` | Realization failed verification or healing. Needs full re-inference. | → `DRAFT` | `discovery-verification`, `discovery-healing` |

*Note: `vivim.providers` aggregates these statuses into a registry cache but NEVER writes status transitions directly.*

## 2. Risk Class Enum (`RiskClass`)
Defines the mutation boundary for operations, driving the `vivim.law` gate.

| Tier | Definition | Default Law Gate |
|---|---|---|
| `READ` | No state change. Pure observation. | Allow (ungated) |
| `MUTATION` | Internal state change (e.g., vault append, local config). | Allow + Journal |
| `EXTERNAL_MUTATION` | Leaves the local vault world (e.g., network calls, browser actions). | Require-Consent + Journal |

## 3. Confidence vs. Proof (The Promotion Invariant)
**Confidence ranks; Proof promotes.**
- **Confidence** (lexical, structural, contextual fusion scores) is a heuristic used strictly for *candidate ranking* and *ordering verification probes*.
- **Proof** (postcondition probe evaluation) is the *only* mechanism that can transition a candidate to `PROMOTED`.
- A candidate with 0.99 confidence but failing probes stays `DRAFT`. A candidate with 0.30 confidence but passing probes promotes. This invariant is stricter than confidence-threshold promotions and MUST be preserved across all tracks.

## 4. Vault Provenance Contract Shape
Any evidence reference cited by a discovery artifact, realization, or healing event MUST satisfy the minimum `EvidenceRef` shape to be resolvable via `vault.get@1`.

```typescript
interface EvidenceRef {
  ns: string;   // Namespace (e.g., "discovery", "providers")
  id: string;   // Object ID (e.g., "capture:webmail-inbox")
  rev: number;  // Revision number (integer >= 1)
}
```
Vault objects carrying provenance edges MUST store them in the `refs` array of the meta-envelope. Compaction algorithms MUST honor these `refs` and never delete referenced revisions.
