# STRATEGY: Rebuild a Better Vivim Purely on the Plugin Architecture

**Directive:** build the new core first, shape the end state on Omega — never shape it
with old Vivim code. Legacy (`vivim-old-repos/`) is a **frozen mine** (read-only,
SHA-pinned per `FACT-BASE-2026-09-16.md`). Omega (`clone-omega`) is the **sole target
and the canvas**: everything is editable below the laws, but nothing lands as host code
and nothing lands as a fork. Every legacy capability re-enters as a **plugin**, a
**pack**, or an **orchestrator plugin** (a plugin holding `port:<op>@<v>` caps to child
ops, sequenced through the router under the law gate — no shared heap, B2 holds
between parent and child exactly as between any two plugins).

## 1. Why plugin-pure wins (code-grounded, not ideological)

- Legacy coupling has **no destination** in Omega: `CapabilityEventBus` + `service-
  container` DI + `module-registry` + `ProviderRegistry` singleton + dual-Prisma runtime
  (201 models) + `command-language` branches. Omega enforces capability boundaries
  (one op = one plugin surface, Recipe grants, host-side token checks). Harvesting by
  legacy subsystem drags the transport along; harvesting by **capability stratum**
  proves one authority/storage/streaming question per wave cleanly.
- Enhanced's `plugin-kernel/` proves the negative: wrapping the same in-heap registry
  with a certifier + SHA-256 (`TrustedPluginManager` delegating to `PluginManagerImpl`
  + `CapabilityEventBus`) is still same-process coupling. The takeaway is precise:
  harvest its **manifest shapes, certifier vectors, and adapter impls** — never its wiring.
- Omega's 911/1100 host LOC + 17-file zero-runtime contracts + shim + platform seam are
  the leverage: a boring loader, five boot laws, and everything else (constitution,
  storage, runtime) as plugins. The freeze (B5 + 16-spec freeze + import/bun/os surfaces)
  is what keeps the rebuild better instead of bigger.

## 2. The canvas (out-of-the-box, everything editable except the laws)

**Fixed:** B1 (signed manifest+hash before exec), B2 (no shared heap — Port Protocol
only), B3 (host-side capability verification), B4 (fail-closed + pinned-recipe fallback),
B5 (host ≤1100 LOC, remove-to-add), Decision Contract (append-only, PROPOSED→RATIFIED
with falsifier + gate evidence, supersede-never-edit), fail-closed everywhere (unknown
ops REFUSED, budget exceeded BUDGET, handler throws → DEGRADED, oversized captures
refused never truncated), streaming discipline (terminating PortResult authoritative,
strict-seq chunks).

**Canvas (Wave0 may reshape all of it):** plugin boundaries and grants; contracts
(add only with writer+reader+test same commit, opportunistic `Outcome<T>`); shim and
platform (the only OS-aware module — extend it for Chrome lifecycle/tunnel/p2p/FS rather
than branching `process.platform` anywhere else); vault namespaces (one row per ns
same-commit); compositions (via the W0-1 generator, never hand-edits once it lands);
packs (one per domain); surfaces + SDK (the typed edge); discovery pipeline (the
admission runtime — every provider/capability through verify PROMOTE, never around it);
tooling (free out-of-tree: gates, bench, watchdog, triage automation); the Next.js
frontend as an HTTP client (pointer default); even the 16-spec freeze itself (replaced by
generator + conformance net, not by exception).

**Anti-shapes (refused no matter how convenient):** cross-plugin relative imports
(vendor with provenance header instead); host-token minting outside host; `ctx.invoke`-
style side channels (only `ctx.port.call`/`port.stream`); direct Prisma/EventBus/
ModuleRegistry/ProviderRegistry imports inside harvested code (strip first, then harvest);
parsers as routable code hooks (data + pins only); bulk stealth import (file-by-file
admit/refuse); Prisma runtime in any plugin (shapes as ns rows); sharing smuggled inside
session bookkeeping (attributed rows until the sharing decision reopens).

## 3. Strata order (why this sequence — each wave's falsifier needs the prior wave's proof)

```
W0  RULES+TOOLING .... 9 needs (§WAVE0-NEEDS-FROM-CODE) — authoring path, conformance net,
                        index probe+retention rule, sharing fence, provider/launch/stealth bar,
                        parser bar, observability spine, surface contract, mine pins
W1  HARVEST PIPELINE . parsers/fixtures/pack#2 — one SSE stream + one import fixture through
                        pins with provenance surviving the vault round trip
W2  PROVIDERS ........ 13+8 manifests → realization rows+handlers (API_NATIVE first, Ollama-class
                        pilot: local, no auth quirks, exercises streaming; BROWSER_MEDIATED where
                        automation IS the product) + launch scope + stealth admission + governor
                        restructure — per provider: one fixture-recorded message through its
                        realization, law-gated, streamed, ledgered, mind-queryable + one forbidden
                        action refused+ledgered per browser provider
W3  MEMORY ........... conversations/sessions/workspaces/keys → chat+credentials spine (conv:*/msg:*
                        + full per-conversation index + retention enforced + second-principal refusal
                        pinned + cap refusal fail-closed + retention/compaction drill)
W4  INTELLIGENCE ..... NLCL split (deterministic → ns nlcl/automation data; llm-slave/semantic →
                        PROBABILISTIC tail only) + capability taxonomy seed + director data-only
                        reprogramming proof + calibration corpus seeded (deterministic resolves need
                        no provider consult; ambiguous consults attach confidence, never silently)
W5  SURFACES ......... Next.js→Omega HTTP pointer, CLI/MCP parity via shared surfaceOpMeta, Tauri
                        decision on proven mismatch, multi-user auth over user:<id>+credentials+consent
                        (person types → real streamed response through law gate, ledgered+queryable)
W6  OPS .............. observability/resilience/scheduler/tunnel/p2p/onboarding as plugins via
                        platform/+budgets (patterns only, no code lifted) + SLO objectives published
                        from W0–W5 walls + serial-lane soak green
W7  CUTOVER .......... parity matrix ≥ legacy product behavior + full gate + full bench +
                        verify-status on clean clone → archive mines read-only (never delete)
```

Dependency spine: W0 rules+net+probe → W1 fixtures/pins/pack-checklist → W2 realizations
(needs W1 fixtures) → W3 memory (needs W2 realizationRefs) → W4 intelligence (needs W3
resolve rows) → W5 surfaces → W6 ops/SLOs → W7 parity+archive. No parallel waves across
strata; parallel tasks within a wave are fine. No wave starts until the prior falsifier is
green on a real boot.

## 4. Better-than-legacy bets (what "better version" means concretely)

1. **Realization-graded providers, not registry singletons.** Every provider is a
   `ProviderClass` realization behind one registry, verified (proof, not confidence) before
   promotion, with `realizationRef` provenance on every output row and multi-variation
   co-PROMOTION with routing preference as law policy. Legacy's DB-seeded singleton +
   mux becomes competing, comparable, revocable realizations.
2. **Deterministic-first language.** `vivim-nlcl`(+`-pure`, zero-import, browser/server
   shared) owns the parse path; LLM never parses (N1/N2). Legacy's ~70 NLCL files across
   two trees collapse to rules/lexicon data + one shared classifier + director
   `resolve.classify/report` + `strategy.scorecard` with exact arithmetic.
3. **Data-only reprogramming.** Director rules/teachings/consents are vault rows
   (ns `automation`/`nlcl`), tick-ledgered — legacy `command-language` branches and
   confirmation/dialogue code become consent data + resolve trails.
4. **Vault as the only memory.** 201 Prisma models re-expressed as ~13+ ns shapes with
   owner/writers/retention rows same-commit; per-conversation index + retention windows +
   compaction honoring refs; changelog append-only forever. No sidecar DB without a ruling.
5. **Credentials as spine, not sprinkles.** Per-user keys + browser profiles ride
   `credential.{put,use,redact}@1` + REDACTION_POLICY (sim-synthetic REFERENCES only,
   material refused fail-closed) — never ad-hoc vault rows.
6. **Discovery as the admission runtime.** Perceive→observe→infer→map→verify→heal with
   proof-gated PROMOTE/DEGRADED/TESTING verdicts, parser pins, field-confidence ranking-
   only. Every migrated provider/capability passes through it.
7. **Surfaces from one derivation.** CLI/daemon/MCP/web + SDK from shared
   `surfaceOpMeta` — one derivation, N consumers. The Next.js product becomes a client;
   Tauri a thin shell decision, not a second platform.
8. **Measured, not claimed.** Gate + bench + watchdog + verify-status + node-canary per
   wave; `40-EVIDENCE/` append-only; parity matrix on capabilities, not files.

## 5. Operating discipline (holds for every wave)

- Read-only mines; harvest commits cite mine SHAs + counts + manifest slugs.
- One provider / one capability proves the pattern before scale-out repeats it.
- New vocabulary ships with producer + reader + test in the same commit.
- Same-commit ns rows, policy rows, and composition grants (via generator after W0-1).
- Falsifier + gate + bench per wave on a real boot; `build/status.json` refreshes only
  from green runs with citations; board regenerated in the same wave.
- Host LOC unchanged every wave (remove-to-add if the design ever truly needs host —
  which means the design is wrong until proven otherwise to the owner).

## 6. Where to work next (concrete)

1. `omega:quick` green on a clean `clone-omega`, pin base SHA (W0-9a).
2. Land W0-2 conformance net first (cheapest, serves every later decision).
3. Land W0-3 index probe + bench + W0-5 byte-identical definition (doc-only OK).
4. Specify the remaining W0 needs as decision records with matrices + criteria.
5. Kick W1 with the parser landing zone + fixture pipeline + pack#2 checklist.
6. Evidence in `40-EVIDENCE/` per wave; tracker in `STATUS.md` (single line per wave).
