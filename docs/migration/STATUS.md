# STATUS — migration wave tracker (single line per wave + current focus)

| Wave | State | Falsifier green? | Landing SHA |
|---|---|---|---|
| W0 arbitration | **CLOSED** (2026-09-16: foundation tier W0-10 D-373/D-374/D-375 + close-out set D-376..D-383 — conformance net, authoring generator, vault conversation index + probe, single-principal fence, W0-5..8 bars; all 9 W0 needs PROPOSED-or-better, mechanical pieces green, board 1 open (D-316, own trigger)) | YES (see 40-EVIDENCE/W0/: driver-parity digest, broker suite, drift-seed, byte-identity + first-try boot, index probe 111× flat, fence falsifier) | 193dc61 (PROPOSED) → 4e14d1d (RATIFIED) |
| W1 harvest infra | **CLOSED** (2026-09-17: T-04/T-05 parsers as D-355 governed pins + recorded-fixture pipeline + triage splitter + pack #2 domain-import (W0 checklist clean pass) + domain-email retro debt + T-06 identification (14 boundaries / 22 files at the pin) + D-385 parser carriers & governed-pin fence; falsifier green on the real discovery-mind boot) | YES (see 40-EVIDENCE/W1/: W1-close.md, T-06 descriptor + PROPOSED ledger patch; omega:fixtures:check 4/4 recorded rows; gate GREEN ×2 at eb1c573 → 1249955, suite 830/830, host 1039/1100 flat) | eb1c573 (PROPOSED) → 1249955 (RATIFIED) |
| W2 provider stratum | NOT STARTED | — | — |
| W3 conversation/memory | NOT STARTED (inherits D-378's index; owes retention enforcement + backfill + repair) | — | — |
| W4 intelligence | NOT STARTED | — | — |
| W5 surfaces | NOT STARTED (falsifier text fixed by D-383; CLI is the stand-in) | — | — |
| W6 ops | NOT STARTED (walls named by D-382; objectives follow measurement) | — | — |
| W7 cutover | NOT STARTED | — | — |

**Current focus (2026-09-17 W1 CLOSE):** the W1 gate criteria are all green —
`omega:gate` green ×2 at the landing (830/830, host 1039/1100 flat, zero host
diff across the entire wave), the W1 falsifier green on the REAL
discovery-mind boot (recorded fixtures as vault evidence → promotions carrying
the governed pins → harvest-evidence row surviving the consent-ceremony
roundtrip → mind-queryable realizations → the D-385 fence refusing an
ungoverned pin pre-write), fixture pipeline honest (4 recorded rows verified
hash+shape+determinism; recorded-only, never live network), T-06 identified
mechanically from the pinned mine (14 boundaries / 22 files → PROPOSED ledger
patch, verdicts unchanged), pack #2 domain-import passes the W0 checklist,
matrix byte-identity 16/16, D-385 RATIFIED with landing SHAs.
**Current focus (2026-09-18 owner-directed remediation — independent recommendation report implemented):**
the four recommendations are landed between W1 and W2. §5 the two stale planning docs are
archived (`docs/archive/` + supersede banners, records untouched). §6 D-316 closed —
(b) N first-class compositions, no flagship (substance `e7de299`, flip `fe4453a`); the
open-questions board reached ZERO. §7 the OS-enforced containment probe is landed and
RATIFIED as D-386 (evidence-class; landing `9ae6662`, gate 847/847): `omega:containment`
measures kernel-side whether a child is actually bounded, and B1b / Wave2-LAUNCHED now
carry the gate condition (verdict `enforced` on the target OS or a recorded owner
acceptance); this container is honestly `unavailable` (cgroup v1, read-only). §8 the
budget watch (host LOC headroom, test-count recheck, L-11 fence, L-12/L-13 sequencing)
is a standing section in `docs/decisions/CURRENT-INVARIANTS.md`. W2 authority below is
unchanged and now reads against a zero-open board.
**Current focus (2026-09-18 perf remediation — external performance review implemented as D-387):**
all nine findings verified against the tree, then the priority list implemented:
#1 the console world-poll is socket-gated (zero watchers → zero vault reads), version-checks
through a bodiless snapshot, and pays for full payloads only on change — backed by the new
`vault.getmany@1` READ batch op (one hop per namespace window, was ≤201 sequential) and the
mind's parallelized evidence reads; #2 compaction FTS delete batched (measured 782→18 ms at
2k candidates, D-378's discipline applied to the delete path); #4 verify set-based; #5
journal history bounded backward read (flat vs the journal's lifetime size); #6 async tail
pump; #9 precomputed policy index (differential-proven). The #3 liveRefs prefilter was
landed, MEASURED slower, and reverted; #7 (batch-append fsync) and #8 (test-only compile
cache) are deferred with named triggers in the record. Evidence:
`40-EVIDENCE/OWNER/2026-09-18-perf-review.md` + `tooling/perf/perf-remediation.ts`.
Landing `e2f756b` (PROPOSED) → `af771ac` (RATIFIED, evidence-class, gate GREEN ×2 871/871,
host 1039/1100 FLAT — zero host LOC).
**Current focus (2026-09-18 perf remediation round 2 — second external performance review implemented as D-388):**
the review's priorities implemented with the same evidence law: §2.1 the director tick's
read phase batched (ONE `vault.getmany@1` for all candidate bodies + ONE for the fired
ledger — was up to 2×200 sequential gets per 500 ms tick; measured 403 → 5 read hops at
the 200-row cap; all row-level semantics preserved, rule loading stays lazy per-row by
design); §2.2 pool burst observability (`omega:bench` burst case + `daemon start
--pool-size` knob + tuning rule of thumb) with the review's degradation narrative
MEASURED-CORRECTED (sync refill serves every burst checkout; the real burst cost is the
inline thread spawn per checkout); §2.3 the interim L-1 measure (`runtime.budget.intervalMs`
per-compartment watchdog cadence, additive SDK field, global 250 ms default untouched) with
the D-386 containment gate line held unchanged. Dispositions without code: the L-4 chat
index backfill stays W3-owned (wave boundary law), L-13 SLOs stay F-3-owned, L-8's deadline
trigger stands (exposure window narrowed by batching). Falsifiers 15 new (tick 8, pool 2,
watchdog 5); suite 886/886; landing `3ccfe07` (PROPOSED) → `7a2aa8b` (RATIFIED, evidence-
class, gate GREEN ×2, host 1039/1100 FLAT). Evidence:
`40-EVIDENCE/OWNER/2026-09-18-perf-review-2.md` + `tooling/perf/perf-remediation.ts` case F.
**Base pin:** `clone-omega` @ `eb1c573`→`1249955` (main) · host 1039/1100 ·
16 compositions (matrix-managed) · 13 vault ns · 21 plugin dirs.
**W2 entry:** mines stay pinned (`vivim-final-program@4a5eb84`,
`vivim-final-enhanced@afebe00`); authority for W2 is
`20-WAVES/WAVE2-PROVIDER-STRATUM.md` + the T-06 patch (apply rows with
reviewer reasons) + the D-380 provider bar (per-file stealth admission,
API_NATIVE-first, byte-identical fixture rule) — mechanics land in
provider-browser, governor restructure is T-08; every wave appends
`40-EVIDENCE/W2/`.

> **Correction note, 2026-09-20 (the doc-logic pass):** the Base pin and W2
> entry above are 2026-09-17-era snapshots. Present law: host **1500/1500
> flat** (B5, D-391), **18** compositions (D-391/D-406 matrix era),
> **19** vault-ns rows in `docs/VAULT-NAMESPACES.md` (incl. `canvas`
> RESERVED). The W2 "API_NATIVE-first" mechanics ordering is void — v1 ships
> Chrome master/slave, no AI-API realization (D-418); the live CDP lane is
> D-419 + `docs/forge/BACKLOG.md`.
