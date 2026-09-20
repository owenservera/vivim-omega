# D-416 — S3 — the evidence-store fold: the law journal rides the vault chain (Core Phase closes)

## Status

RATIFIED

## Context

- S3 is the last open Core Phase item (D-410's milestone row; the fork file
  `docs/forge/annex/S3-EVIDENCE-STORE-FORK.md` is the lift-ready analysis).
  Unlike S1/S2 it was reserved for the owner as a genuine architectural
  choice; the owner's standing directive ("upgrade omega to core omega
  ready") is the call, and this record is the scaffold's first owner-call
  record.
- Three evidence stores with mismatched strengths (verified on this tree):
  the **vault changelog** (hash-chained, CAS, boot-verified — but object
  state, not governance narrative); the **law journal** (the governance
  narrative: gate decisions, consents, refusals, principal events since
  D-412, intent citations since D-411 — but a plain unsigned best-effort
  FILE `law-journal.jsonl` via `HOST_OPS.journalAppend` that vault
  verification explicitly does not cover); the **kernel audit chain**
  (signed ed25519, hash-chained — but in-memory only, exported through
  `HOST_OPS.auditChain`, persisted nowhere; it evaporates on shutdown).
- **Volume clock, re-measured at lift** (D-410's falsifier requires the
  number at call time): 7,145 law-journal rows across 65 scratch journals
  in ONE full-gate corpus run on THIS tree (2026-09-20, 1115/0 gate) —
  IDENTICAL to the D-413 measurement: D-414/D-415 added zero
  journal-writing tests. The clock has not moved; the window is as wide
  as it was. All rows remain ephemeral test/demo volume (scratch dirs,
  nothing deployed, zero persistent rows anywhere).
- The structural tension (the analysis §4.3): the evidence atoms (CON-14,
  CON-16, CON-18) want governance evidence as tamper-evident and replayable
  as everything else — and today the most important narrative lives in the
  weakest store while the strongest signature machinery evaporates.
- B5 is frozen at host 1500/1500 FLAT, zero headroom (D-391/D-415): the
  fold must land with **zero host LOC** — the host's own transport gate
  rows keep their file write path, and the audit-chain drain consumes the
  EXISTING `HOST_OPS.auditChain` export.

Blocks: Core Phase

## Options

| Criterion | (a) Fold law-journal rows into the vault | (b) Sidecar keeps the narrative; gains its own chain + signature | (c) Defer |
|---|---|---|---|
| C1 tamper-evidence (governance rows under a verifiable chain) | yes — under the changelog chain + CAS | yes — its own chain | no |
| C2 replayability (narrative folds like object state) | yes — the governed event is a fold like any other | no — two replay disciplines, two verification stories, forever | no |
| C3 blast radius now | medium — the plugin write path moves from the host port to the vault port (caps already held in agent); FILE stays readable for transition | small — one file's format | zero now |
| C4 the audit chain (persistence point either way) | unaffected — needs its own persistence point regardless | partially — same signing machinery persists, but as the sidecar's | unaddressed |
| C5 volume-clock honesty | closes the clock for the narrative rows | the narrative clock keeps running per row | the window closes silently |

## Decision

**Decision:** **(a) fold-into-vault** — the owner's call, per the standing
directive, taking the fork's recommendation argued against the named
criteria: one chain, one verification story, one replay discipline; the
governed event was already generalized (D-408) precisely so narrative and
state share a substrate; ns `law` already exists with the right owner; and
the vault's append path is the only write path the program trusts
end-to-end today. The audit chain's persistence point (C4) is common to
both options and lands with this record: `law.audit.drain@1` drains
`HOST_OPS.auditChain` into vault ns `audit` — zero host LOC (the export
already exists), which keeps B5 flat.

## Consequences

- **The fold:** law's `journal()` helper writes ns `law` vault appends
  (id family `journal:<boot>-<seq>`, per-boot stamp + per-process
  sequence — a collision would fold two events into one object lineage,
  the shape the stamp kills) whenever the compartment holds
  `port:vault.append@1`; the D-411 intent citations and D-412 principal
  events ride the same chain (they are journal rows). Compositions
  WITHOUT the vault grant (spine, chat, the law test rig) keep the legacy
  `HOST_OPS.journalAppend` sidecar path — the transition discipline,
  unchanged behavior, documented in namespace law.
- **Best-effort discipline preserved either way:** a law decision is
  never blocked by a journal failure — the failure is logged, the row is
  lost loudly, never silently. F-2 pins this for the fold path.
- **The audit-chain persistence point:** `law.audit.drain@1` (MUTATION,
  requires `host.kernel.lens` + `port:vault.append@1`) exports the signed
  chain and appends it whole into ns `audit` (id
  `audit-chain:<boot>-<seq>`; each row carries the full export —
  verified, signerKeyId, publicKey, length, headHash, entries). The chain
  itself is untouched (the drain is read-only on the kernel); fail-closed
  on the vault append. The console's close sequence drains before host
  shutdown, best-effort (close must complete). The kernel is attached at
  EVERY boot (D-340: boot attaches the genesis kernel unconditionally) —
  the drain is available wherever the caps are granted.
- **The sidecar file:** becomes the transition artifact — law's own rows
  no longer land in it where the fold is active; its remaining writer is
  the µhost's own transport gate rows (the B5-frozen host write path —
  one allow/deny/require-consent row per risky routed op, near-duplicate
  of law's own richer check row, which now rides the vault); the registry
  replays it at boot for legacy rows; the deprecation note lands in
  `docs/VAULT-NAMESPACES.md` ("Not vault namespaces" section).
- **The read side:** `law.registry@1` absorbs vault journal rows live
  (query + paged getmany of NEW ids only — the events count stays
  truthful under the fold; best-effort, degrades to the file+observed
  view); the web console's socket relay and connect-time history read
  the vault (query + getmany) instead of tailing the file — bounded cost
  tracks what is shown, the D-387 discipline carried over.
- **Compositions:** agent + console grant law the fold caps
  (`port:vault.append@1`/`query@1`/`getmany@1`, `host.kernel.lens`,
  `law.audit.drain@1` in the contract list); spine/chat/law rigs stay
  transition postures. The manifest's requested-capabilities list gains
  `host.kernel.lens` (granted per-composition by the user-signed recipe,
  never by the manifest — the D-325 grant shape).
- **What gets harder:** the journal read path costs a vault query where
  it used to cost a file read (light columns + paged bodies — strictly
  bounded; the registry's per-call file re-read was already the heavier
  half at volume); the two-store transition is a documented state, not
  an instant — compositions opt in per grant.
- **What must be revisited:** the host's own transport gate rows (file
  sidecar, B5-frozen) fold the day a host LOC budget round reopens them;
  the drain cadence (close-time today) is the floor, not the ceiling —
  a periodic or event-driven drainer is a post-core decision; crypto on
  identity rows (D-412's note) still attaches later without re-typing
  keyed history.
- **The Core Phase closes:** S1 ✓ (D-411) S2 ✓ (D-412) C ✓ (D-410 item
  C) S3 ✓ (this record, called AND landed) — **core-omega-ready** per
  D-410's ratified milestone row. The next gate is D-410's own:
  the plugin-identification pass (identify, never design — the D-409
  partition stays parked until then), then parallel work opens.

## Evidence

- Landed in `b3a936a`: falsifiers F-1..F-7 green in the record's tree BEFORE the flip per D-364 (6 new tests, `plugins/vivim-law/test/d416-evidence-store.test.ts`, plus the d387 #5/#6 rewrite carrying F-6; F-3 pinned by the existing GATE-Ω1 suite, green before and after); full gate green 1121/0 ×2 on the PROPOSED tree (2026-09-20T10:36:01Z and 10:37:31Z — 1115 + 6 new; host flat 1500/1500, zero host files touched, anvil untouched); the recursion guard's own bite: the fold's first draft self-recursed (every fold append gated → its check row folded → …) and burned the 500ms gate deadline — caught by the falsifier BEFORE the gate ever ran green, fixed as the record's guard; the row flips to RATIFIED by `omega:questions --write` (1 regenerated, 0 appended).

- **Falsifiers (all in this record's tree BEFORE the flip, per D-364):**
  - **F-1 the fold (failing on old code):**
    `plugins/vivim-law/test/d416-evidence-store.test.ts` — the agent
    composition boots (fold caps granted), a gated risky op runs, and the
    vault's ns `law` carries `journal:*` rows with the law-check fields
    (source vivim.law, targetOp, decision, causationId) while the sidecar
    file carries NO `source: vivim.law` rows — old code writes only the
    file, so both assertions fail on it.
  - **F-2 best-effort under the fold:** a composition granting law
    `port:vault.append@1` but shipping NO vivim.vault (the dangling-cap
    rig) — every fold append refuses (no routed implementation), and the
    gated op STILL returns its decision; the row is lost loudly (logged),
    never silently, never blocking. Old code journals to the file here,
    so the no-file-rows assertion fails on it.
  - **F-3 the transition fallback:** the existing GATE-Ω1 integration
    suite (no vault caps) keeps asserting journal rows IN THE FILE —
    green before and after, the no-regression pin.
  - **F-4 the drain:** the drain rig (law + vault + kernelLens) calls
    `law.audit.drain@1` twice — ns `audit` carries two
    `audit-chain:*` rows, each with the full export shape (verified,
    signerKeyId, publicKey, length, headHash, entries — the signed
    grants), ids unique per drain; the return names drained/headHash.
    Old code has no such op — refused unrouted, fails on it.
  - **F-5 the drain refuses without caps:** the same rig minus
    `host.kernel.lens` — REFUSED with the named capability error, never
    a silent no-op.
  - **F-6 the relay reads the vault:** `surfaces/web` tests — a fake
    service over a seeded vault ns `law`: connect-time history returns
    exactly the last-N rows (bounded: only the last-N bodies fetched);
    the tail emits ONLY new rows on the next tick (seen-id diff), in
    batch order. Old code tails the file — no file exists, fails on it.
  - **F-7 the registry absorbs the fold:** in F-1's rig,
    `law.registry@1`'s snapshot counts the vault journal rows in
    `events` (file host-rows + vault law-rows) and harvests the
    principals the vault rows name — old code counts file rows only,
    fails on it.
- **Measurements:** volume clock re-measured at lift — 7,145 rows / 65
  scratch journals / one full-gate run on this tree (2026-09-20), byte-
  identical to the D-413 number; host LOC 1500 before AND after (B5
  flat, zero headroom preserved — zero host files touched); the drain's
  first landed export on the drain rig: kernel length 7 (the genesis
  grants) — small, signed, whole.
- **Analysis citations:** the fork file (this record's lifted source —
  its §Options matrix is reproduced above verbatim); the structural
  analysis §4.3 + §6's closing-window falsifier; D-410's milestone row S3
  and its volume-clock falsifier; D-408 (the governed-event
  generalization — narrative and state share a substrate by design);
  D-325 (the forbidden-durability precedent: ns-law appends, fail-closed,
  boot reload); D-412 (principal rows in ns `principal` — the law plugin
  already writes the vault through ports); D-387 (bounded read
  discipline the relay carries over); D-340 (kernel at every boot — the
  drain's availability substrate); D-391/D-415 (B5 flat at 1500/1500).
- **Code anchors (this tree):** `plugins/vivim-law/src/index.ts` — the
  `journal()` helper (the fold), `law.audit.drain@1`, the registry
  absorb; `plugins/vivim-law/src/registry.ts` — `absorbVaultRow`;
  `surfaces/web/src/{api,events,server}.ts` — the vault-backed relay +
  the drain-at-close; `compositions/_matrix.json` (agent + console grant
  shapes); `docs/VAULT-NAMESPACES.md` (ns `law` journal family, ns
  `audit`, the sidecar transition note); `host/src/ports.ts` — the
  UNCHANGED `journal()` host path and the pre-existing `HOST_OPS.auditChain`
  export (zero host LOC).

## Index

summary: S3 called and landed: law's narrative journal rows fold into vault ns law (id family journal:<boot>-<seq>), the kernel audit chain gains its persistence point (law.audit.drain@1 into ns audit), the console relay reads the vault, and the sidecar file becomes the transition artifact
rationale: the owner's standing directive called S3 with the fork's recommended (a) fold-into-vault — one chain, one verification story, one replay discipline; volume clock re-measured at lift: 7145 rows / 65 journals, unchanged from the D-413 measurement
class: evidence
