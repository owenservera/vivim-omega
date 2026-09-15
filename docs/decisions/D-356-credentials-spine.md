# D-356 — XC-2 write side + M12: the credentials spine (put / use / redact)

## Status

RATIFIED

## Context

XC-2's fate was split by the 360 review (A1): the READ gate half is live
current-lineage code (`provider-llm` refuses the live tier without the
`credential.use` capability, citing `docs/SURFACES.md` credential law), but
the WRITE side never landed in any lineage — `credential.put` appears
nowhere, and SURFACES.md's own "Post-v1 (recorded, not built)" section lists
the spine as a stated future item. A1's direction: the writer must build
AGAINST `docs/SURFACES.md` §"The credential law" — the existing, live-cited
spec — not re-derive the shape from M-Pilot Part 1. The map's begin order
names the credentials write side the M0 wave's second item (the browser
realization's capture path is its first consumer, via M12's
redaction-before-append). The engineering was landed once (first lineage,
turn-008) and destroyed with the second sandbox reset.

## Options

| Criterion | (a) Spine plugin over vault ns `credentials`, by reference only (recommended) | (b) Secrets in composition config / env | (c) Defer until the live tier ships |
|---|---|---|---|
| Credential law 1 | `config` carries `credentialId` references; material never rides payloads or env — the spine stores REFERENCE rows, nothing else | The exact violation the law names | n/a |
| Law 2 (capability) | `port:credential.use@1` is grantable only by the user-signed Recipe; no in-sandbox composition grants it — dead by construction, fail-closed if provoked | n/a | The browser capture path stays unredacted |
| M12 | Lands here: `credential.redact@1` runs the versioned policy over captured bytes BEFORE the vault sees them | Secrets would enter the vault raw | M5 evidence writes stay blocked |
| Falsifier | Put ceremony (consent rule), use by reference, redact-before-vault with a known-secret scan by hash — all on a real boot | n/a | No falsifier |

## Decision

**Decision:** (a) Land `plugins/vivim-credentials` (0.1.0) — the spine, three
contract ops:

1. **`credential.put@1` (MUTATION, consent-gated).** Payload
   `{credentialId, sim: true, meta?}` → vault.append (ns `credentials`, id
   `credential:<credentialId>`) → the stored row is a **sim-synthetic
   REFERENCE** (`kind: "sim-synthetic"`, `sim: true` — the marker IS the
   type guard). Fail-closed validators refuse: any non-sim put (live
   secrets never enter the sandbox — law 3), and ANY material-named field
   (`value`, `secret`, `key`, `password`, `token`, …) at the top level or
   inside `meta` — even sim-marked, the spine stores references only.
   **The consent bar is policy data, not a class misstatement:** the class
   is vault-internal MUTATION (exact policy row — D-351's lesson: never
   default-ride), and an explicit `require-consent` RULE keeps the
   security-sensitive bar the first lineage put ceremony established.
   `LAW_POLICY_V1` → **1.2.0** (new exact row + new rule; parity test
   updated).
2. **`credential.use@1` (READ, capability-gated at the recipe layer).**
   `{credentialId}` → vault.get → the reference row. The by-reference
   flow: a live owner-machine tier would exchange the reference for secret
   material per-call, inside the spine, post-v1 (recorded, not built). No
   in-sandbox composition grants `port:credential.use@1` — the surface is
   routed, testable, and dead by construction.
3. **`credential.redact@1` (READ) — M12's redaction-before-append.**
   `{bytes}` → `{redacted, redactions, policyVersion}` via
   `REDACTION_POLICY_V1` — versioned, inspectable policy DATA owned by the
   spine (credential-derived patterns are this plugin's domain — header/
   param names + value shapes — not regex spaghetti in a consumer).
   Deterministic (same bytes ⇒ same output + count); pass 1 applies the
   credential-derived value shapes, pass 2 the name shapes (skipping spans
   pass 1 already replaced, so the count is honest); oversized captures are
   refused fail-closed, never silently truncated. **Output-only: the op
   cannot reveal what it never returns.**

## Consequences

- The parity net's domain grows by one op (`credential.put@1`) — parity
  holds by exact row, and the net's fixture-size guard stays satisfied.
- The vault's Merkle chain only ever contains redacted bytes on capture
  paths that route through `credential.redact@1` BEFORE `vault.append` —
  the ordering law M12 names. Byte-span citations (P-B2) index into the
  redacted byte string, which is the only byte string that exists.
- The secret-material storage shape (owner-machine tier) is post-v1:
  SURFACES.md keeps its recorded-not-built line for exactly that, and the
  spine's v0.1.0 record grammar (`sim: true` literal) leaves no ambiguity
  about what is stored today.
- `credential.use@1` remains ungated-by-design at the law layer (READ) —
  its control is the capability grant, exactly as the credential law
  states; the D-351 net does not cover it (never gate-triggering).

## Evidence

- docs/SURFACES.md §"The credential law" (rules 1–3) + §"Post-v1" (the
  spine line this record strikes).
- 360-REVIEW-ADDENDUM A1 (fate split; build against the existing spec).
- M-PILOT-MISSING-CORE-PART4 §M12 (redact-before-append; spans against
  already-redacted bytes; the hash-scan falsifier).
- Landed in this wave: `plugins/vivim-credentials/test/credentials.test.ts`
  (14 tests: material refusals, redaction determinism + shapes, the real
  boot's put ceremony → use → redact, and the vault holding no material
  fields), `plugins/vivim-law/test/policy-parity.test.ts` (policy 1.2.0
  rows).
- Ratification: owner directive 2026-09-15 ("Continue working on the items
  in the 360 MD docs") — gate-proven on the wave SHA before RATIFIED.
- - Gate evidence: full `bun run omega:gate` GREEN on the wave tree (1dc96ee): 691/691 tests, host 997/1000, host-loc/fresh-tree/decisions/compositions/attest all pass; attest commit 6e15aa7.
- Ratification: owner directive 2026-09-15 ("Continue working on the items in the 360 MD docs") — gate-proven on the wave SHA before RATIFIED.
