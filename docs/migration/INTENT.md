# INTENT — Rebuild Vivim Purely on the Plugin Architecture (Omega)

**Status:** durable intent. Details live in `FACT-BASE-2026-09-16.md` (ground truth),
`STRATEGY-OMEGA-PLUGIN-REBUILD.md` (how), `10-WAVE0/WAVE0-NEEDS-FROM-CODE.md` (what first).
This file states **why and what**, not how. If a later decision conflicts with this file,
the decision must supersede it explicitly — never drift silently.

## 1. Intent in one paragraph

Rebuild a **better Vivim** on **Omega** — a boring loader plus everything-else-as-plugins —
so every capability the old Vivims have (providers, conversation/memory, intelligence,
surfaces, ops) re-enters as a **plugin, a pack, or an orchestrator plugin**, with zero host
growth and proof on every wave. Legacy repos are frozen mines to learn from, never code
to port. Wave0 exists to make the core ready to absorb that future without smuggling the
monolith back in.

## 2. Problem we are solving

Old Vivims work but cannot grow: a Bun+TypeScript monolith (~954/1051 src files, 201
Prisma models, 40+ server routers, EventBus/DI/ProviderRegistry singletons) where
browsers, stealth, NLCL, scheduler, tunnel/p2p, observability, and a full Next.js+Tauri
frontend are coupled in-process. The `enhanced` branch proves wrappers don't fix it —
a certifier around the same heap is still the same heap. Growth adds coupling, not capability.

## 3. Vision of the end state

- **One µhost that stays boring:** verify → spawn isolated compartments → route ports →
  enforce capabilities. No policy, no growth.
- **Capabilities with boundaries:** one op = one plugin surface, granted by signed Recipe,
  checked host-side, failed closed, ledgered and queryable.
- **Memory as vault, not database sprawl:** namespaces with owners, writers, and retention —
  conversations, credentials, rules, realizations, resolve trails as shaped rows.
- **Providers as graded realizations:** API-first where APIs exist, browser-mediated where
  automation *is* the product — verified before promotion, revocable after.
- **Language that is deterministic first:** parse without LLM in the path; probabilistic
  help only where genuinely ambiguous, always labeled.
- **Surfaces from one derivation:** CLI/daemon/MCP/web + SDK from the same contract —
  the existing frontend becomes a client, not a second platform.
- **Discovery as admission:** every provider/capability earns promotion through proof.

Better means: **smaller core, stronger guarantees, cheaper to add the next provider,
pack, or surface than the last.**

## 4. Principles (load-bearing)

1. **Core first, backfill later.** Shape the end state on Omega; never shape it with old code.
2. **Plugin-pure.** If it needs host code, the design is wrong.
3. **Harvest, don't port.** Data and algorithms come over; EventBus/DI/Prisma wiring never does.
4. **One proves before many.** One provider / one capability / one pack proves the pattern.
5. **No vocabulary without writers.** New contracts ship with producer + reader + test.
6. **Fail closed.** Unknown = REFUSED, over-budget = BUDGET, broken handler = DEGRADED,
   oversized capture = refused (never truncated).
7. **Existence = booted proof.** Claims carry no weight; green gate + bench + falsifier do.
8. **Canvas below the laws.** Everything except B1–B4 + append-only history is editable —
   plugin bounds, contracts, platform seam, compositions (via generator), packs, surfaces,
   tooling. Bold reshapes welcome if they keep the core smaller.

## 5. Scope

**In:** Wave0 rules+tooling → harvest pipeline → providers → memory → intelligence →
surfaces → ops → cutover parity + archive. Conformance, index/retention, sharing fence,
launch/stealth bar, parser discipline, observability spine, surface contract, mine pins.

**Out:** host features, bulk imports, sharing implementation (fenced now, built later),
UI rebuild for aesthetics, legacy rewrites, second platform, sidecar databases, new auth
model outside law/consent.

## 6. Wave0 intent (why it is critical)

Wave0 builds nothing product-facing. It buys the right to build everything after it
without regret: the authoring path (so adding is mechanical), the conformance net (so
drift is caught), the index/retention rule (before years of rows), the sharing fence
(before multi-user rows), the provider/launch/stealth bar (before trust expands), the
parser bar (before code hooks return), the observability spine (so every wave means the
same thing by "queryable"), the surface contract (so UI points once), and the mine pins
(so harvests measure from truth). Skip any one and a later wave fakes its own mechanism.

## 7. How we know we succeeded

- Any legacy capability can be rebuilt as a plugin/pack in days, not weeks, by following
  the authoring path — no host change, no monolith import.
- Coverage parity on capabilities (not files), with every row landed+tested+benchmarked
  or explicitly deferred with a pointer.
- Gate green, host LOC flat, bench walls published, evidence append-only, mines archived
  read-only.
- The team trusts adding more — providers, packs, surfaces — because each addition makes
  the system more legible, not larger.

## 8. Standing orders

- Mines stay read-only and SHA-pinned.
- Old migration docs are history; this intent + fact-base + strategy + Wave0 needs are authority.
- When in doubt: smaller core, clearer boundary, stronger proof.
