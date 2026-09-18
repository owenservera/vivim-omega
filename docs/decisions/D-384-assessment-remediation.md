# D-384 — Assessment remediation: scoped token revocation, canon write hygiene, symlink policy, consent principal binding, daemon secret file permissions

## Status

RATIFIED

## Context

Two independent external code assessments (a static read of `host/src`,
`platform/src`, the vault/law/run/director plugins and the daemon surface;
and a companion pass over `surfaces/*`, the providers, the discovery family
and the remaining plugins) were accepted by the owner as gap findings to
remediate. Six findings held up under verification against the tree; one
more (the fixed-name tmp sweep) fell out of fixing the first. The critical
one: `host.tokens.revoke@1` bumped the global generation unconditionally —
the `pluginId` argument shaped only the journal, so "quarantine one plugin"
silently revoked every capability token in the running composition, and a
second scoped revoke locked law itself out. The codebase already contained
the correct pattern one file-tree over (`ConsentTable`: per-record
revocation state, no blast radius).

## Options

| Criterion | (a) Remediate all findings now, one record (this row) | (b) Defer to wave triage | (c) Patch only the critical finding |
|---|---|---|---|
| Correctness | Every finding is a verified defect with a falsifier-ready shape | Known defects stay reachable from production ops | Leaves the medium findings (tmp race, symlink deref, world-readable secret) live |
| Budget | +40 host LOC (1039/1100, B5 held) | Zero now, unknown later | ~+25 |
| Process | One falsifier batch, one gate pair, one record | Findings scatter across waves, easy to lose | Splits one coherent remediation into two ceremonies |

## Decision

**Decision:** (a) Remediate all findings now —

1. **Scoped token revocation is SCOPED (the critical fix).** `TokenRecord`
   gains per-record `revoked` state; scoped `host.tokens.revoke@1` flips only
   the matching records and leaves the generation untouched; the generation
   bump is reserved for the explicit revoke-all case (no `pluginId`).
   Ownership is checked BEFORE revocation state in `checkToken`, so a token
   belonging to another plugin reports `REFUSED` (what it is), never
   `REVOKED` (what it used to be) — no stale-vs-foreign distinction leaks to
   a caller holding a leaked token. Falsifiers: the runtime symmetry test
   (revoke A → B still `ok:true`; revoke-all → B `REVOKED`) and the law
   integration test (scoped revoke: generation flat).
2. **`atomicWrite` tmp names are unique** (pid + random, the `casPut`
   pattern) — two writers racing on one path can no longer overwrite each
   other's tmp bytes before either rename fires; a failed rename unlinks its
   tmp best-effort. `cleanupStaleSwap` sweeps the whole
   `recipe.pinned.tmp*` family (legacy fixed name included).
3. **`contentHashDir` rejects symlinks (fail-closed).** B1's signed content
   hash must cover exactly the bytes in the plugin tree; `statSync` silently
   dereferenced links and folded the target's bytes into the hash. A symlink
   now aborts hashing with a named error (falsifier: link → throw, unlink →
   deterministic hash).
4. **`classifyRisk` resolves overlapping prefix rows by specificity**
   (longest pattern wins, order-independent; exact rows still outrank every
   prefix per D-351). Table-authoring order can no longer silently swap
   verdicts (falsifier: flipped-table test).
5. **Consent principal binding.** `law.consent.grant@1` refuses a non-root
   caller naming a principal other than itself (cross-principal forgery,
   fail-closed before any state change); root — the surfaces' human proxy —
   retains the delegation that IS the consent ceremony. The web console's
   `/api/consent` stops forwarding a client-supplied `principal`
   (id-only ceremony; the journal audit proves no client-chosen principal
   lands). Combined with D-379's read fence, the single-principal console no
   longer lets an unauthenticated network client act on other principals'
   behalf.
6. **`daemon.json` is owner-only.** The 32-byte bearer secret for full
   root-principal RPC now writes `{mode: 0o600}` + the `ownerOnly()` seam —
   the exact treatment the root signing key already received. The os-surface
   gate enforces HOW permissions are set (no raw chmod); applying them to
   every sensitive file stays a human discipline, now pinned by the daemon
   test suite (every start case asserts the mode).
7. **`provider-llm` live leg contract documented honestly:** the header no
   longer claims "no credentials spine exists" — the in-tree spine (D-356)
   routes `credential.use@1` but stores sim-synthetic reference rows only,
   so `liveComplete` refuses with a message naming the actual shape. The
   mismatch is the designed fail-closed path, not a bug.
8. **`KNOWN-LIMITS` updated:** L-11 records the console's consent-binding
   posture (and that the journal/world socket streams stay part of the
   unauthenticated demo boundary until Wave5's authenticated surface,
   D-383); new L-17 records the director tick scan caps (200 rows / 200
   rules per tick — silent partial coverage past the cap, detector + revisit
   trigger named).

## Consequences

- The host's revocation semantics now match the system's own pitch
  (fine-grained, non-disruptive containment) and the `ConsentTable`
  precedent; `law.tokens.revoke@1` keeps its intent-first journal order
  (still correct for the revoke-all path).
- Post-revoke audit completeness improves: law's own journal token survives
  a scoped revoke, so grants journaled after one now land (the integration
  suite pins the flip from flat to growing).
- B5 budget: host/src moves 999 → 1039 / 1100 — 61 LOC of headroom left.
- The two assessments' remaining scope (checks that came back clean: MCP
  surface, CLI/daemon-client secret handling, provider-browser sim-only
  containment, vendored token algebra, no eval/exec/path-traversal in the
  discovery family) is recorded here as reviewed-and-clear, so the next
  auditor starts from this line.

## Evidence

- Landing: b9590d6 (PROPOSED: code + falsifiers + records; this record + the
  index row flipped in the ratify commit per the house shape). First gate run
  on the PROPOSED state: GREEN — structural stages + full suite 797/797 +
  attest (host-loc 1039/1100).
- Full suite 797 pass / 0 fail (76 files, 7009 expect calls) including the
  10 new D-384 falsifiers (canon tmp hygiene ×3, symlink policy ×2, tmp
  sweep ×1, revoke symmetry ×1, forgery refusal ×1 via the real law
  compartment, classifyRisk specificity ×1, daemon mode ×1 via every start
  case, web principal-ignored ×1 via the journal audit channel).
- `omega:quick` GREEN with host-loc 1039/1100; os-surface GREEN (the
  `ownerOnly()` seam import in the daemon surface is the sanctioned pattern);
  import-surface GREEN.
- Findings sources: the owner-supplied assessment documents (static reads;
  line references re-verified against this tree before fixing).

Re-cited per D-390 (history-reset evidence reconciliation): the landing SHA(s) above
belong to the pre-reset history superseded by the adoption of vivim-omega-latest
(f780d06 -> 6d6a3ad, 2026-09-18); adoption commit f780d06 attests the landing state in the
current history. Substance of this record unchanged; original SHA(s) preserved.
