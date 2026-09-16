# Wave Map — W0 through W7 (falsifier per wave)

Each wave: objective, triage IDs consumed, compositions touched (via generator after W0), falsifier (the sentence that must become true on a real boot), non-goals. Waves gate sequentially — no parallel waves across strata (parallel tasks within a wave are fine).

## W0 — Arbitration (this assessment → 7 D-records + 2 mechanical pieces)

- **Objective:** rule the 7 upgrades in `03-WAVE0-ARBITRATION.md`. Work lives in `10-WAVE0/`.
- **Triage:** none consumed (rules only).
- **Falsifier:** gate green + host LOC unchanged + conformance net green + index probe bench published.

## W1 — Harvest infrastructure (the pipeline that harvests everything else)

- **Objective:** parser landing zone live for legacy inputs (T-04 SSE framing, T-05 import fixtures as governed parser data per D-355, T-06 CDP mechanics identified), fixture pipeline (recorded sessions, never live network), triage automation (subsystem → capability-boundary splitter) as tooling, second pack checklist applied.
- **Compositions:** none new (tooling + `discovery-mind` extension only, per D-318 placement).
- **Falsifier:** one legacy SSE stream + one import fixture parsed through governed pins on a real boot, provenance (`realizationRef`/`parserPins`) surviving the vault round trip.
- **Non-goals:** no provider beyond fixtures, no chat writes beyond probe rows.

## W2 — Provider stratum (16 providers as realizations)

- **Objective:** every legacy provider (T-01/T-02/T-03) as a realization row + handler: API_NATIVE wherever a real API exists (Ollama pilot-first per M-TRIAGE-01 §3 — local, no auth quirks, SSE streaming exercises M1), BROWSER_MEDIATED where automation is the product (ChatGPT/Claude/Gemini + remainder), launch mode (Upgrade 4) + stealth admission (T-07 file-by-file) + governor restructure (T-08) behind the D-338 bar.
- **Compositions:** `browser.json` extended via generator; `llm.json` graduates from simulator to multi-realization.
- **Falsifier:** per provider: one fixture-recorded message through its realization, gated by `law.check@1`, streamed (M1 shape), ledgered, `vivim.mind`-queryable — plus one forbidden action refused + ledgered per BROWSER_MEDIATED provider.
- **Non-goals:** no chat UX, no multi-user, no auto-routing (scoreboards inform — D-323).

## W3 — Conversation / memory stratum (sessions, workspaces, keys)

- **Objective:** legacy T-11 shapes (Conversation/Message/Collection/Attachment/StateTransition/SessionCheckpoint/StreamBlock + session family) on the chat+credentials spine: `conv:*`/`msg:*` + per-conversation index (Upgrade 2 full build), retention windows enforced, workspace/session/key rows attributed to `user:<id>` (Upgrade 3 boundary), command-language confirm semantics (T-16) as consent data.
- **Compositions:** `chat.json` + `credentials.json` extended via generator.
- **Falsifier:** multi-conversation, multi-thousand-message vault: bounded history-read bench green, cap refusal fail-closed, second-principal read refused + ledgered, retention/compaction drill green (no cited rev collected).
- **Non-goals:** no sharing implementation (GAP-4), no NLCL port.

## W4 — Intelligence stratum (NLCL, capabilities, director)

- **Objective:** legacy T-09 (30 NLCL resolvers, split: deterministic → rules/lexicon data in ns `nlcl`+`automation`; `llm-slave`/`semantic` → PROBABILISTIC tail only) + T-10 (capability bootstrap seed: taxonomy/binding/intent/program shapes) + director rules proving data-only reprogramming on migrated intents; calibration corpus GAP-1 seeded.
- **Compositions:** `discovery-mind.json` + `agent.json` + `chat.json` (resolution wiring, no parallel logic — D-359).
- **Falsifier:** deterministic intents resolve without provider consult (ledgered DETERMINISTIC); genuinely ambiguous intents consult PROBABILISTIC with confidence attached, never silently; scorecard arithmetic exact over seeded decisions.
- **Non-goals:** no acting loop beyond B1a, no auto-routing, no CONTRADICTED status (no conflict detector yet).

## W5 — Surfaces (web console, CLI, MCP, desktop — decided last, not first)

- **Objective:** existing Next.js frontend pointed at Omega surfaces over HTTP (default — no rebuild preemptively); CLI/MCP parity via shared `surfaceOpMeta`; Tauri shell decision (reuse vs thin wrapper) on proven shape mismatch only; multi-user auth over `user:<id>` + credentials spine + consent; console's cooperative-local-user assumption hardened to authenticated-user.
- **Compositions:** `console.json` (+ generated surface variants).
- **Falsifier:** a person types into the existing frontend (or CLI-as-stand-in until then) and gets a real streamed response from one real provider through the law gate, ledgered + mind-queryable (M-plan pilot falsifier, unchanged).
- **Non-goals:** no UI rebuild for aesthetics, no new auth model outside law/consent machinery.

## W6 — Ops stratum (observability, resilience, scheduler, tunnel, p2p, onboarding)

- **Objective:** legacy T-18 as Omega-native plugins (patterns only — no code lifted): observability on the Upgrade-7 spine, resilience behind watchdog budgets, scheduler as `vivim-run`/director ticks, tunnel/p2p via `platform/` + explicit forbidden policy, onboarding as director rules + NLCL teachings. SLO objectives published (GAP-2 — objectives follow the walls measured in W0–W5).
- **Falsifier:** SLO set (boot/RTT/spawn/append/eviction) published in BENCHMARKS with envelopes; soak (serial lanes, clean slate) green; Windows MCP flake disposition recorded (L-5/L-6 revisit triggers evaluated).
- **Non-goals:** no new host isolation tier (process-per-compartment stays flagged, not built — D-360).

## W7 — Cutover (coverage parity → archive)

- **Objective:** capability coverage on Omega ≥ legacy product behavior; per-stratum falsifiers re-run as one suite; retention/compaction steady-state demonstrated; legacy repos archived (not deleted — frozen mines become read-only history).
- **Falsifier:** parity matrix (every T-series HARVEST row: landed + tested + benchmarked, or explicitly deferred with a D-record) + full gate + full bench + `verify-status` reproduction on a clean clone.
- **Non-goals:** no legacy deletion, no post-cutover feature work in this wave.

---

## Dependency graph (what blocks what)

```
W0 (rules + net + probe)
 └─ W1 (parsers/fixtures/pack-checklist) ─┬─ W2 (providers) ─┬─ W3 (memory) ─ W4 (intelligence) ─ W5 (surfaces) ─ W6 (ops) ─ W7 (cutover)
                                          │                   │
                                          └─ (W2 needs W1 fixtures; W3 needs W2 realizationRefs; W4 needs W3 resolve rows)
W0-Upgrades map: U1-generator→all │ U2-index→W3 │ U3-sharing→W3/W5 │ U4-launch→W2 │ U5-pack→W1+ │ U6-net→all │ U7-spine→all
```
