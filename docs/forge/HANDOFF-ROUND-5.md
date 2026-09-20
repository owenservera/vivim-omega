# Handoff — Round 5 (Core Phase S1: the canonical-intent seam cut)

Written per the round protocol. Branch `wave0-omega-forge`. Entry commit:
`3f1b194` (bundle `_4`'s tip). This round lands **the first core seam as
code** — D-411, evidence-class, falsifiers in the record before ratification
per D-364.

## What landed

| D-item | Artifacts |
|---|---|
| D-411 (ratified) | **S1 cut**: `intent.submit@1` real sha256 payloadHash + interpretation summary on the row (the UNDERSTOOD artifact, additive `Intent.interpretation?` contract field); `intent.cancel` defect fixed (stepId derived from payload, compensation write REPORTED); new `intent.resolution@1` — four-state rows (AMBIGUOUS/REFUSED/EXECUTED) in ns `intent`; `law.check@1` accepts + journals `{intentRef, payloadHash}` citations (grandfathered callers byte-identical); console live path routes interpret → persist → gate-with-citation → execute → resolve; `vivim.intent` in the console composition (matrix path, count 18); LAW_POLICY_V1 **1.6.0** (intent family exact rows — was default-riding EXTERNAL_MUTATION, caught by the D-351 parity net when the plugin first entered a composition); `ExecuteOutcome` gains `intentRef`/`payloadHash`/`resolution`/`resolutionRecorded` |
| Tests | intent-seam 7/7 (F-1 regression fails on pre-D-411 code; F-2 hash reality; F-4 rows), d411-citation 3/3 (F-3, FakeHost journal), web 14/14 (F-4/F-5 live path + the F-3 live journal citation over socket.io) |

Design note worth carrying: the surface's canonical pre-gate is
**risk-conditioned to mirror the host's gating condition** (catalog risk
MUTATION / EXTERNAL_MUTATION / unknown-only) — ENGINE and READ ops are not
host-gated and must not be pre-gated, or the surface refuses commands the host
would run. One gating condition, two enforcement points: defense in depth, not
divergence.

## Gate standing

Full gate **1069/0 green ×2** on the record's tree (`9d142fa`, 05:02:00Z and
05:03:50Z — the evidence-class bar); post-ratification green + status refresh
(`a118c34`); host flat **1500/1500**; anvil untouched (856/860, 45 exports);
composition count unchanged at 18; board regenerated — **0 open**.

## Ambiguities recorded, defaults used

1. **The pre-gate's gating condition** — initially every confident command;
   the teach/rule/search regressions (ENGINE/READ ops refused by a policy
   default the host never applies) forced the mirror-the-host condition.
   Default recorded in the code comment and the D-411 consequences.
2. **AMBIGUOUS row scope** — genuinely-unparseable commands only (the
   `surface.assist` family / null IR, non-empty input). `surface.help` /
   `surface.entity` are console queries, not governed events — no rows.
   Ambiguous-with-primary-pick (two Peters) stays the established
   execute-with-suggestions-as-data behavior (the W5 semantics, unchanged).

## Next round's exact entry point

**Core Phase S2 — the principal-identity seam** (D-410's milestone, second
row; the structural analysis §4.2: MEDIUM-HARD, R1/R3 avoidance).

1. First command (falsifier baseline must still be green):
   `bun test plugins/forge-author/test/happy/self-host.test.ts --timeout 60000`
   then `bun run omega:quick`.
2. Read the assets: `plugins/vivim-law/src/` (consent.ts — the ConsentTable;
   forbidden.ts — the vault-persisted overlay pattern to mirror; index.ts —
   law.describe@1's per-principal walk), `contracts/src/port.ts`
   (`principalKind`), `docs/VAULT-NAMESPACES.md` (the ns discipline — a new ns
   `principal` row declares owner/writers/retention in the same commit).
3. Design per the structural analysis: principal **identity rows** (ns
   `principal`, vivim.law writer) with the **non-reuse invariant** (register →
   active record; retire → permanent; re-register a retired id REFUSES with a
   named refusal — the id string can never become a different record); the
   consent ceremony (law.consent.grant naming a principal — the D-384
   root-delegation path) resolves through the record when law holds vault
   caps; existing keyed history is NOT re-typed; no crypto, no pairing, no
   forced registration — the indirection only.
4. Then **S3** — the evidence-store fork file in the annex (owner call: fold
   the law-journal into the vault chain vs sidecar with its own chain +
   signature; either way the audit chain gains a persistence point), with the
   measured law-journal volume number at call time.

**Parked and not to be touched until core-omega-ready (D-410 register):**
unchanged — `docs/forge/annex/OMEGA-CORE-FIRST-RESEQUENCE.md` §3.
