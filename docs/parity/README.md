# Parity reference (D-340 evidence chain)

The analysis chain that produced the kernel wave, committed so the records that
cite it are self-contained. These docs describe the PRE-LANDING state (host at
976/1,000 LOC, `opRoute` a flat Map, no graph/genesis/state/audit/contract
modules) — read them as history, not as the current tree:

- `RUST-CORE-PARITY.md` — the nine-requirement gap map, layer by layer, each
  mapped to the `vivim_omega_core` Rust module it came from.
- `SCALABILITY-CEILINGS.md` — the six measured ceilings beyond the nine
  kernel requirements (worker limits, boot rehash, law-gate throughput,
  vault single-writer, op namespace, host LOC).
- `LOC-BUDGET-RESOLUTION.md` — the three-option fork the host-LOC budget
  forced; scored by D-340 (Option C won 735/1000).

Resolution state:

| Doc concern | Resolved by |
|---|---|
| Nine kernel requirements (#1–#9) | D-340 — landed: `host/src/{graph,genesis,state,audit,contract}.ts` + `plugins/vivim-kernel-lens`, tests in `host/test/{kernel,ghost}.test.ts` |
| Law-gate throughput ceiling | Measured: 4,331 ops/s sustained (`tooling/bench/kernel-bench.ts`, `BENCHMARKS.md`) |
| Vault single-writer ceiling | Measured: 1,777 writes/s sustained |
| Host LOC fork | D-340 ratified — B5 amended once, 1,000 → 1,400, landed at exactly 1,400 |
| Boot rehash at scale | D-341 (PROPOSED) — D-330 coverage answered; async/parallel re-hash vs B5 zero slack is the open call |
| Flat op-namespace | Partially resolved by the kernel (multi-offeror generations + declared-range resolution); exact-op conflicts within one recipe still refused (correct) |
| Live-compartment resource limits | D-321's tracked follow-up (RATIFIED honesty gap; watchdog design recorded there) |

`vivim_omega_core-reference/` — the Rust genesis kernel verbatim (the
`vivim_omega_core` crate: seven modules, six tests, pinned deps for rustc 1.75).
It is REFERENCE ONLY — nothing in this repo builds or imports it; the TS kernel
in `host/src` is the live implementation, and the parity test suite ports its
six scenarios 1:1. Keep it in sync only by deliberate replacement, never by
partial edits — it is the immutable reference the records point at.
