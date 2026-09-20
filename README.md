# VIVIM-Ω — The All-Plugin Architecture (fresh build)

**This is the Ω build tree.** One boring loader, five boot laws, and everything else — including
the constitution, the storage engine, and the runtime — is a plugin.

**Owner directive (verbatim, 2026-09):** *"first fully build the new core system with everything
you outlined in vivim omega - we should not shape the perfect end state with the old vivim code -
we will later backend into the new core."* The legacy repos (`../vivim-final-enhanced`,
`../vivim-final-program`) are **untouched** by this build (see `tooling/gates` fresh-tree guard);
they become backfill sources after the core exists.

**On Windows?** Read `docs/WINDOWS.md` first (setup, `omega:quick`, soak-flake notes). One command to start: `bun install`, then `bun run omega:quick`.

## The Ω laws in ten lines

1. The µhost is boring and may not grow: `host/src` ≤ **1,500 LOC**, hard gate (B5 — raised 1,100→1,500 by D-391, once and loudly: the D-340 genesis kernel graph/chain/arbiter/generations are host-critical per B3/latency and cost 411 lines (1,039 → 1,450) on top of the D-365 freeze; re-frozen at 1,500 with the same no-exceptions rule — no new host surface without removing old surface in the same commit).
2. No code executes unless a signed manifest entry in the Recipe references its content hash (B1).
3. Compartments never share a heap — every message traverses the Port Protocol (B2). Isolation
   is against **coupling, not exhaustion**: `resourceLimits` are not enforced on Bun (D-321,
   re-verified on Linux: 130MB heap inside a 32MB cap) so a compartment can still starve its
   process; the consumption watchdog (D-360, `tooling/watchdog`) bounds *detection* time.
4. Capability tokens are verified **host-side**, outside every compartment (B3).
5. Any verification failure refuses the composition; boot falls back to the pinned recipe (B4).
6. `bootPhase 0` belongs to `vivim.law`. The µhost refuses any other assignment.
7. Manifests are requests; the user-signed Recipe is the only grantor.
8. Data lives in the user's vault, not in any plugin's code.
9. Existence = a booted composition with passing tests. Claims carry no weight.
10. Everything else is a plugin.

## Layout

```
contracts/   @vivim/omega-contracts — the pinned wire types (zero runtime)
host/        @vivim/omega-host     — the µhost (LOC-gated, no manifest: it verifies them) + the D-340 genesis kernel (graph/chain/arbiter/generations)
shim/        @vivim/omega-shim     — compartment runtime (definePlugin + port client)
platform/    @vivim/omega-platform — the ONLY OS-aware module (D-372: tmpRoot/omegaTmp/resolveDataDir/ownerOnly)
plugins/     vivim-law · vivim-vault · vivim-run · vivim-mind (self-knowledge) · vivim-kernel-lens (D-340 read-only kernel lens) · vivim-nlcl (deterministic NLP) · vivim-director (NL reprogramming) · providers · discovery engines · law-stub (Ω0 stand-in)
packs/       domain packs (SCHEMA+CONTRACT+POLICY+TEST bundles)
surfaces/    cli · mcp · web (the Ω console service)
examples/    plugin-echo · plugin-counter (Ω0) · plugin-notes (Ω4)
tooling/     recipe builder · gates · bench · demo · status
compositions/ composition source specs (compiled into signed recipes)
build/       emitted gate/status evidence (committed)
```

## Run

**Runtime requirement: Bun ≥ 1.3.14** (pinned — the test/gate toolchain runs on Bun; this is a
stated constraint, not a silent assumption, D-361). The **production tree** (`host`, `shim`,
`contracts`, `plugins`, `surfaces`) is runtime-neutral and gate-enforced (`bun-surface` stage):
the ONLY Bun-specific adapter is `plugins/vivim-vault/src/db.ts` (`bun:sqlite`) — a Node build
swaps that one module (`node:sqlite` or `better-sqlite3`) and nothing else. The core canon logic
is verified under plain Node in CI (`node --test tooling/ci/canon-canary.test.mjs`).

```bash
bun install
bun test                      # all packages
bun run omega:gate            # host-loc + fresh-tree + decisions + compositions + bun-surface + tests + attest → build/status.json
bun run omega:bench           # boot / RTT / spawn numbers → BENCHMARKS.md
bun run omega:demo            # scripted demo composition transcript (JSON)
bun run host/src/main.ts compose --vault dev-vault --composition compositions/demo.json

# D-360 consumption watchdog — attach to any booted host (policy in manifests, not code):
#   startWatchdog(router, { budgets })  →  see tooling/watchdog/watchdog.ts
# D-321 repro, per runtime/upgrade (resourceLimits enforcement check):
bun run tooling/watchdog/resourcelimits-probe.ts
```

Zero runtime dependencies in the production tree: `node:worker_threads`, the vault's sqlite
adapter (D-361), `node:crypto` (ed25519 + sha256), `node:net`.

## Composition flow

`compositions/*.json` (source spec, no hashes) → **compile** (sign each manifest with the vault's
root-of-trust key, hash content, sign the recipe) → `<vault>/build/<name>/` + `<vault>/recipe.pinned`
→ **boot** (verify recipe sig → manifest sigs → content hashes → spawn worker compartments in
bootPhase order → mint capability tokens → wire the router).

## Documents

- `docs/decisions/CURRENT-INVARIANTS.md` — the one-page law snapshot (read this, not 360 rows — D-364)
- `docs/BUILD-DECISIONS.md` — the build-track decision register (D-210…, append-only)
- `docs/decisions/README.md` — the Decision Contract (records, classes, cooling-off)
- `docs/parity/` — the D-340 evidence chain: nine-requirement gap map, scalability ceilings, LOC fork, and the `vivim_omega_core` Rust reference kernel
- `docs/NCLL-AND-SELF-KNOWLEDGE.md` — Ω10–Ω13: the language waves (self-knowledge, the deterministic NCLL, NL reprogramming, the web console)
- `BENCHMARKS.md` — append-only measured numbers per wave
- `build/status.json` — machine-readable build state (feeds the review console; CI re-derives it, D-362)
- Design of record: sandbox `design/VIVIM-OMEGA-MASTER-ARCHITECTURE.md` (D2) + `OMEGA-IMPLEMENTATION-*` (D3)
