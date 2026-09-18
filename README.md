# VIVIM-Ω — The All-Plugin Architecture (fresh build)

**This is the Ω build tree.** One boring loader, five boot laws, and everything else — including
the constitution, the storage engine, and the runtime — is a plugin.

**Owner directive (verbatim, 2026-09):** *"first fully build the new core system with everything
you outlined in vivim omega - we should not shape the perfect end state with the old vivim code -
we will later backend into the new core."* The legacy repos (`../vivim-final-enhanced`,
`../vivim-final-program`) are **untouched** by this build (see `tooling/gates` fresh-tree guard);
they become backfill sources after the core exists.

## The Ω laws in ten lines

1. The µhost is boring and may not grow: `host/src` ≤ **1,400 LOC**, hard gate (B5 — amended once by D-340: the genesis kernel graph/chain/arbiter/generations are host-critical per B3/latency and cost exactly 1,383; everything else stayed a plugin).
2. No code executes unless a signed manifest entry in the Recipe references its content hash (B1).
3. Compartments never share a heap — every message traverses the Port Protocol (B2).
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
plugins/     vivim-law · vivim-vault · vivim-run · vivim-mind (self-knowledge) · vivim-kernel-lens (D-340 read-only kernel lens) · vivim-nlcl (deterministic NLP) · vivim-director (NL reprogramming) · providers · discovery engines · law-stub (Ω0 stand-in)
packs/       domain packs (SCHEMA+CONTRACT+POLICY+TEST bundles)
surfaces/    cli · mcp · web (the Ω console service)
examples/    plugin-echo · plugin-counter (Ω0) · plugin-notes (Ω4)
tooling/     recipe builder · gates · bench · demo · status
compositions/ composition source specs (compiled into signed recipes)
build/       emitted gate/status evidence (committed)
```

## Run

```bash
bun install
bun test                      # all packages
bun run omega:gate            # host-loc + fresh-tree + tests + attest → build/status.json
bun run omega:bench           # boot / RTT / spawn numbers → BENCHMARKS.md
bun run omega:demo            # scripted demo composition transcript (JSON)
bun run host/src/main.ts compose --vault dev-vault --composition compositions/demo.json
```

Zero runtime dependencies: `node:worker_threads`, `bun:sqlite`, `node:crypto` (ed25519 + sha256).

## Composition flow

`compositions/*.json` (source spec, no hashes) → **compile** (sign each manifest with the vault's
root-of-trust key, hash content, sign the recipe) → `<vault>/build/<name>/` + `<vault>/recipe.pinned`
→ **boot** (verify recipe sig → manifest sigs → content hashes → spawn worker compartments in
bootPhase order → mint capability tokens → wire the router).

## Documents

- `docs/BUILD-DECISIONS.md` — the build-track decision register (D-210…D-222)
- `docs/NCLL-AND-SELF-KNOWLEDGE.md` — Ω10–Ω13: the language waves (self-knowledge, the deterministic NCLL, NL reprogramming, the web console)
- `BENCHMARKS.md` — append-only measured numbers per wave
- `build/status.json` — machine-readable build state (feeds the review console)
- Design of record: sandbox `design/VIVIM-OMEGA-MASTER-ARCHITECTURE.md` (D2) + `OMEGA-IMPLEMENTATION-*` (D3)
