# Handoff — Round 6 (Core Phase S2: the principal-identity seam cut + S3 fork file)

Written per the round protocol. Branch `wave0-omega-forge`. Entry commit:
`05b510d` (bundle `_5`'s tip). This round lands **the second core seam as
code** (D-412, evidence-class, falsifiers in the record before ratification)
and pre-analyzes the third — the one item the structural analysis reserved
for the owner.

## What landed

| D-item | Artifacts |
|---|---|
| D-412 (ratified) | **S2 cut**: `plugins/vivim-law/src/principal.ts` + three contracts — `law.principal.register@1` (idempotent while active; **PRINCIPAL_REUSED** on retired ids — the string can never become a different record), `law.principal.retire@1` (retired is forever), `law.principal.get@1` (READ, absence is data); the consent ceremony resolves through the record when law holds vault caps (fail-closed rollback, the D-325 pattern); ns `principal` (retention: forever); agent composition grants the ops; LAW_POLICY_V1 **1.7.0**; existing keyed history NOT re-typed |
| Annex | `S3-EVIDENCE-STORE-FORK.md` — the evidence-store choicepoint pre-analyzed lift-ready: **(a) fold the law-journal into the vault chain (recommended)** vs (b) sidecar with its own chain + signature; the audit-chain persistence point common to both and landable first (zero host LOC — the export exists); the volume-clock paragraph started |
| Namespace law | The stronger compaction invariant (D-410 item C): "compaction never deletes a revision, period" — explicit in `VAULT-NAMESPACES.md`, the F9 prerequisite |
| Backlog | S1/S2/C struck done; S3 open with the fork file; the plugin-identification pass named as the core-ready gate |

## Gate standing

Full gate **1074/0 green ×2** on the record's tree (`af79bb1`, 05:19:10Z and
05:20:37Z — the evidence-class bar); post-ratification green + status refresh;
host flat **1500/1500**; anvil untouched; composition count unchanged at 18;
board regenerated — **0 open**.

## Trap bitten, caught, and recorded this round

`principal.ts`'s `fromRecord` silently shadowed `forbidden.ts`'s same-named
import binding (bun binds the last under loose transpilation) — the forbidden
overlay reload parsed its records through the principal parser and counted
zero. The D-325 restart falsifiers caught it exactly as designed; fixed by
import aliasing; recorded in D-412's Evidence. Lesson: same-named exports
across sibling modules are a shadowing hazard — alias at the import site.

## Ambiguities recorded, defaults used

1. **S3 was NOT decided this round** — the structural analysis reserves the
   evidence-store choicepoint for the owner, and the owner's directive queued
   "upgrade omega to that state" without naming the S3 direction. Default:
   pre-analyze lift-ready (the A5 pattern), recommend (a) fold-into-vault
   with the argument on record, and leave the choice open — D-413 at lift.
   The audit-chain persistence point (common to both options) is called out
   as landable-first, but NOT landed without the owner's call, since its
   natural home depends on the choice.
2. **The FakeHost token-minting race** — law's boot-time forbidden reload
   retries for ~5s when tokens are minted post-install (a FakeHost-only
   artifact; the real host mints pre-init). Default: the d412 test grants
   tokens mid-boot through the retry loop's event-loop yield (60ms in);
   recorded here because the next FakeHost-based law test will hit it too.

## Next round's exact entry point

**One of two paths, the owner's choice:**

1. **Call S3** (close the Core Phase): read
   `docs/forge/annex/S3-EVIDENCE-STORE-FORK.md`, choose (a) or (b) (or call
   the audit-chain persistence point alone), and the next round lifts it as
   D-413 with the falsifiers named in the fork file. After S3 lands:
   **core-omega-ready** — the milestone record runs the plugin-identification
   pass (D-410's post-core gate) and the parked plugin work un-parks.
2. **Anything else the owner wants first** — the Core Phase's remaining item
   is S3 alone; every other backlog row is parked plugin design by D-410.

First command either way (falsifier baseline must still be green):
`bun test plugins/forge-author/test/happy/self-host.test.ts --timeout 60000`
then `bun run omega:quick`.

**Parked and not to be touched until core-omega-ready (D-410 register):**
unchanged — `docs/forge/annex/OMEGA-CORE-FIRST-RESEQUENCE.md` §3.
