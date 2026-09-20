# Handoff — Round 10 (D-416: S3, the evidence-store fold — THE CORE PHASE CLOSES)

Written per the round protocol. Branch `wave0-omega-forge`. Entry commit:
`c59f170` (the board refresh at the ratified tip — bundle `_9`'s frontier,
carried forward). The owner's standing directive ("upgrade omega to core
omega ready") **was the S3 call the fork file reserved** — the scaffold's
first owner-call record — and this round executed it to its exact boundary:
S3 called AND landed, the Core Phase's last item, **core-omega-ready
achieved per D-410's ratified milestone row**.

## What landed

| D-item | Artifacts |
|---|---|
| D-416 (ratified, evidence-class) | **The fold** — law's `journal()` writes ns `law` vault appends (id family `journal:<boot>-<seq>`, padded base36 = chronological lexicographic) wherever `port:vault.append@1` is granted; the legacy host sidecar port stays the write path without the grant (the transition discipline — spine/chat/test rigs byte-for-byte unchanged); best-effort EITHER way. **The recursion guard** — the journal never narrates its own writes: the gate row for vivim.law's own `vault.append@1` is skipped because the changelog row for that append IS the record (the pre-fold host-op path was gate-free BY CONSTRUCTION; the fold preserves that property on the routed path). **The drain** — `law.audit.drain@1` (MUTATION, `host.kernel.lens` + `port:vault.append@1`, fail-closed) persists the kernel's signed audit chain whole into ns `audit` (one row per drain, never superseding); the console's close sequence drains before host shutdown. **The read side** — `law.registry@1` absorbs vault journal rows live (query + paged getmany of new ids only); the console relay + connect-time history read the vault (pure `RootCall` readers; the D-387 bounded discipline carried over and COUNTED). **Policy 1.8.0** — `law.audit.drain@1` exact row (the D-351 parity net updated). **Namespace law** — ns `law` gains the journal family; ns `audit` row; the sidecar rewritten as the transition artifact. |
| Compositions | agent + console grant shapes regenerated from `_matrix.json`: law gains `port:vault.getmany@1` + `host.kernel.lens` + the drain contract — the fold and drain postures; manifest +12th contract + requested `host.kernel.lens`. |
| The clock | Re-measured at lift: **7,145 rows / 65 journals / one full-gate run — byte-identical to the D-413 number** (D-414/D-415 added zero journal-writing tests; the window never moved; the fold closes it). |

## Gate standing

Full gate **1121/0 green ×2** on the PROPOSED tree (10:36:01Z, 10:37:31Z —
1115 + 6 new); post-ratification full green 1121/0 (10:43:49Z); host flat
**1500/1500** — **zero host files touched** (B5 preserved, the drain consumed
the pre-existing `HOST_OPS.auditChain` export); anvil untouched; compositions
18; board **0 open**.

## The bites (pre-commit, both caught as designed)

The fold's first draft **self-recursed**: every fold append is a gated
MUTATION whose `law.check` row would itself fold — an infinite gate
self-recursion that burned the 500ms gate deadline with BUDGET cascades,
caught by the falsifier before the gate ever ran green, fixed as the
journal-never-narrates-its-own-writes guard. And the D-351 default-riding
bite in its natural habitat: `law.audit.drain@1` silently default-rode
EXTERNAL_MUTATION → require-consent refused the drain before the handler ever
ran — the exact row (policy 1.8.0) fixed it, the parity test now carries
D-416.

## Where the program actually stands

**core-omega-ready.** The Core Phase: S1 ✓ (D-411), S2 ✓ (D-412), C ✓
(D-410 item C), the tooling stack ✓ (D-413/414/415), **S3 ✓ (D-416 — called
and landed)**. The milestone D-410's ratified row defined is reached: the
governance narrative rides the vault chain, the kernel audit chain has its
persistence point, the weakest store is no longer where the most important
evidence lives. What remains is D-410's own post-core sequence.

## Next round's exact entry point

1. **The plugin-identification pass** (D-410's post-core gate — the next
   open D-id, D-417): ONE record enumerating the plugins the core actually
   needs — the tactical map + the frozen 24-op catalog + the parked register
   (`docs/forge/annex/OMEGA-CORE-FIRST-RESEQUENCE.md` §3) reconciled
   against the built core. **Identify, never design** — the D-409
   split-plugin partition stays decided-parked; design un-parks only as
   parallel work opens AFTER the identification record ratifies.

First command either way (falsifier baseline must still be green):
`bun test plugins/forge-author/test/happy/self-host.test.ts --timeout 60000`
then `bun run omega:quick`.

**Round close:** `bun run omega:round-close --note … --evidence …` (rehearse
with `--dry-run` first). The close sequence: PROPOSED → gates ×2 → ratify →
board refresh at the ratified tip → close-out → round-close.

**Parked and un-parked ONLY by the identification record (D-410 register):**
unchanged — `docs/forge/annex/OMEGA-CORE-FIRST-RESEQUENCE.md` §3.
