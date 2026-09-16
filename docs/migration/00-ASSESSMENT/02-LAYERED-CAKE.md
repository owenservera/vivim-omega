# The Layered Cake — Omega as Migration Substrate

How Omega is actually layered on the turn-015 base, where each legacy stratum lands, and what "plugin of plugins" means mechanically. Read this before arguing about any wave.

## Layer 0 — µhost: transport, not policy (911/1100 LOC, frozen)

`host/src/{boot,canon,ports,recipe,recovery,worker,main,index}.ts`. Does four things: verify (recipe sig → manifest sigs → content hashes), spawn (one `worker_threads` compartment per plugin, shared-nothing), route (`PortRouter` + `callAsRootStream` chunk relay + `waitActive` readiness), enforce (host-side token check, `host.compartment.terminate@1`, journal append). Embeds **no policy** (risk lives in manifests + LAW_POLICY data). **Migration rule:** nothing lands here. If a harvest "needs" host code, the design is wrong — push it to a surface package (D-329 pool precedent) or out-of-tree tooling (D-360 watchdog precedent).

## Layer 1 — Contracts: the pinned vocabulary (17 files, zero runtime)

`contracts/src/{port,manifest,recipe,lifecycle,lang,vocabulary,computation,control,provider,variation,agent,outcome,parser,chat,surface,consent,index}.ts`. Types only. The migration-relevant vocabulary already exists: `ProviderClass` (SIMULATOR/API_NATIVE/BROWSER_MEDIATED + reserved 4th), `RealizationStatus` (PROMOTED/DEGRADED/TESTING/…), `ComputationKind` (DETERMINISTIC/PROBABILISTIC/HUMAN), `Variation` (multi-channel co-PROMOTION), `Outcome<T>` (expected negatives, never throws), `ParserPin` (governed data, NOT routable), `ChatConversation/ChatMessage/ChatStreamRef`, `surfaceOpMeta` (one derivation, N consumers). **Migration rule:** new types follow G7 opportunistic policy (new ops use `Outcome<T>`; old ops convert on touch) and D-332 (new exported type with zero call sites is flagged — every name ships with a writer).

## Layer 2 — Shim + Platform: the only two things compartments and OSes may touch

- **Shim** (`shim/src/index.ts`): `definePlugin` + port client + `meta.emit` (strict-seq streaming) + `probe`/`probeStat` (watchdog) + `sleepSync` (Atomics). The compartment runtime. Nothing else in a compartment is allowed to know about the outside.
- **Platform** (`platform/src/{platform,index}.ts`, D-372): the ONLY OS-aware module (`omegaTmp`/`resolveDataDir`/`ownerOnly`). Gate `os-surface` enforces it. **Migration rule:** every legacy OS touch (Chrome launch, FS paths, chmod, tunnel, p2p sockets) goes through `platform/`. Raw `/tmp`, `process.platform` branches, and `Bun.*` outside the one sqlite adapter fail the gate.

## Layer 3 — Spine: law, vault, run (authority, memory, time)

| Plugin | Owns | Migration role |
|---|---|---|
| `vivim-law` (0.2.0) | `law.check` (the one gate), consent, tokens, registry, forbidden overlay (memory + vault ns `law` + reload), amendment, `law.describe` | Every migrated op passes here. Forbidden day-one for browser (D-357). Risk parity (D-351) enforced here. |
| `vivim-vault` (0.1.0) | ns-keyed Merkle-chained KV + sqlite adapter (the ONE `bun:sqlite` importer) + FTS + changelog + compaction | Every migrated row lives in a registered ns (`VAULT-NAMESPACES.md` row same-commit). No direct Prisma, no sidecar DB without a ruling. |
| `vivim-run` | scheduling / task submit | Legacy scheduler/onboarding ticks re-express here, not as cron sidecars. |

Boot order: law is `bootPhase 0` (refused otherwise). Everything else is phase ≥ 1, lazy-activatable (D-331: eager-0, dormant-rest, `dormant` vs `degraded` distinct).

## Layer 4 — Intelligence: mind, nlcl, director, agent, providers, credentials, chat

| Plugin | Owns | Migration role |
|---|---|---|
| `vivim-mind` | WorldModel derivation (law.registry + vault + composition projections) + `mind.portrait@1` | "Ledgered and queryable" endpoint for migrated traffic. Writes nothing (falsifiable). |
| `vivim-nlcl` + `vivim-nlcl-pure` | deterministic parse engine + zero-import pure package (`@vivim/omega-nlcl-pure`) | Legacy 30-file NLCL corpus lands here **split**: deterministic resolvers as rules/lexicon data (ns `nlcl`), probabilistic tail via shared classifier only. LLM never in parse path (N1/N2). |
| `vivim-director` | data-only reprogramming (rules ns `automation`, teachings ns `nlcl`, consents) + `resolve.classify/report` + `strategy.scorecard` + 500ms tick | Legacy command-language/confirmation/dialogue semantics land as **data rows**, never as code branches. Tick-step-7 ledger discipline is load-bearing — do not touch without director+web suites. |
| `vivim-agent` | identities + behavior contracts + decision records + delegation/evolution + `agent.exec` ledger (ns `agent`/`behavior`/`decision`/`control`) | Legacy capability-bootstrap seed data lands here. B1a (one agent acts once) is the liveness proof; quarantine semantics (D-315) block wider loops. |
| `vivim-providers` | registry reads ns `providers` realization rows | Legacy provider metadata/manifests/DB taxonomy land as **realization rows**, not as registry singletons. |
| `vivim-credentials` | `credential.put/use/redact` + REDACTION_POLICY_V1 | Legacy per-user keys + browser profiles land here. Sim-synthetic REFERENCES only; material refused fail-closed. |
| `vivim-chat` (0.1.0) | ns `chat` first writer (`conv:*`, `msg:*` + seq + realizationRef/streamRef) + `chat.resolve` (deterministic half) + `chat.complete` line-chunk hook | Legacy conversations/messages/sessions/checkpoints/stream-blocks land here **shaped**, never as Prisma imports. L-4 index + D-335 retention are the scale remainder. |

## Layer 5 — Discovery: six engines, one pipeline (evidence-backed, proof-not-confidence)

`discovery-{perception,observation,inference,mapping,verification,healing}`. Perceive → observe → infer → map → verify → heal. Writes: candidates/mappings/promotions (ns `discovery`), realization verdicts (ns `providers`: verify writes PROMOTED/REQUIRES_REDISCOVERY/TESTING, healing writes DEGRADED/TESTING per D-326). **Migration role:** the harvest pipeline's runtime analogue — every provider/capability admission goes through verify (proof), never around it (confidence). Field-level confidence is ranking-only (D-303).

## Layer 6 — Providers + Packs: where legacy product logic actually lands

- **Providers** (`provider-llm`: simulator+live; `provider-email-file` v0.2.0: `message.receive@1`; `provider-browser`: CDP attach, sessions-by-reference, 4 bars). Each is a `ProviderClass` realization behind the same registry. API_NATIVE preferred wherever a real API exists; BROWSER_MEDIATED only where automation is the product (D-338 bar).
- **Packs** (`packs/domain-email` only): SCHEMA+CONTRACT+POLICY+TEST bundles. The pack is the unit of domain migration — one pack per legacy domain, each bringing its own contracts + policy rows + fixtures + tests. Second pack (chat-adjacent or provider-adjacent) is Wave0's proof that packs generalize.

## Layer 7 — Surfaces + SDK + Testkit + Tooling: how the outside touches the cake

- **Surfaces** (`cli`, `daemon` + `daemon-client`, `mcp`, `web`): CLI (cold + daemon warm path ≤5ms falsifier), daemon (per-vault TCP, cold fallback), MCP (tool generation via shared `surfaceOpMeta` — A2, no second derivation), web (WorldModel + interpret/execute/consent + journal stream; browser runs nlcl-pure locally, server parse authoritative). **Migration role:** Next.js frontend points here over HTTP (M-plan Phase 5 default); Tauri shell decided in Wave5, not before.
- **SDK** (`client`, `schema`, `sign`, `stream`/`streamRootCall`, `validate`): the typed edge for surfaces and tests.
- **Testkit**: differential mirrors + fixture harnesses (streaming mirror, budget probes).
- **Tooling** (`builder`, `gates`, `bench`, `demo`, `portrait`, `watchdog`, `ci`): recipe compiler, 7+ gate stages, bench walls, demo transcript, portrait emitter, watchdog (out-of-tree containment), verify-status + node-canary (claim reproduction).

## Layer 8 — Compositions: deployable systems (16 specs, frozen)

`agent, browser, chat, console, credentials, demo, discovery, discovery-mind, email, healing, law, llm, notes, run, spine, vault.json`. Each is a source spec → compiled signed recipe → pinned vault build → booted compartments in `bootPhase` order → minted tokens → wired router. Grants are opt-in per composition (forgetting a grant fails closed — the correct direction). **Migration rule (D-370):** no new spec without deleting or generating one. Wave0 replaces this social discipline with a **generator + conformance net** (see arbitration).

---

## What "plugin of plugins" means (three sanctioned shapes, no others)

1. **Orchestrator plugin** (normal case): a plugin holding `port:<op>@<v>` caps to child ops, sequencing them through the router under the law gate. Example: a migrated "send-message" flow holding `port:resolve.classify`, `port:vault.append`, `port:chat.complete`. No shared heap, no direct import — B2 holds between parent and child exactly as between any two plugins.
2. **Pack** (domain case): a bundle contributing SCHEMA (vault shapes) + CONTRACT (new ops) + POLICY (LAW_POLICY rows + forbidden entries) + TEST (fixtures + falsifiers). Installed by adding a signed manifest entry to a Recipe (never by tar.gz install lifecycle — T-13 REMOVE).
3. **Discovery-graded realization** (provider/capability case): a candidate that becomes callable only after verify PROMOTEs it (proof), with parser pins (D-355) + realizationRef provenance on every output row. Multiple variations co-PROMOTEd with routing preference as law policy (D-308).

**Anti-shapes (refused):** cross-plugin relative imports (B2 violation — vendor with provenance header instead); host-token minting outside the host; `ctx.invoke`-style side channels (only `ctx.port.call`/`port.stream`); direct Prisma/EventBus/ModuleRegistry imports inside a harvested algorithm (not harvested yet — strip first per `30-TRIAGE/HARVEST-PATTERN.md`).
