# Triage Ledger — T-series continuation (M-TRIAGE-01 carried forward)

**Source:** M-TRIAGE-01 T-01–T-18 (subsystem cut, still the harvest index). **Rule:** rows change state only with a reason a reviewer can check against the frozen tree + a wave assignment. New rows take the next T-number. Per-file harvest lists are written **per pilot provider only** (M-TRIAGE-01 §4), never as a 2,398-row big bang.

| # | Subsystem (pointer) | Verdict | Wave | State |
|---|---|---|---|---|
| T-01 | Provider plugin metadata (`providers/plugins/*.ts` + interface) | HARVEST → realization rows | W2 | OPEN |
| T-02 | Provider manifests (`ai/manifests/*.json`, ollama pilot candidate) | HARVEST | W2 (Ollama first) | OPEN |
| T-03 | Provider DB taxonomy (7 Prisma models) | HARVEST-shape | W2 | OPEN |
| T-04 | SSE stream parser (65 lines, pure) | HARVEST → governed parser data | W1 | OPEN |
| T-05 | Import parsers (chatgpt/claude/gemini) | HARVEST → fixture pins | W1 | OPEN |
| T-06 | Browser primitives (12 files) + CDP proxy (349) | HARVEST (mechanics only) | W1 identify, W2 use | OPEN |
| T-07 | Stealth/humanization (~12 engines) | SELECTIVE (file-by-file bar) | W0 bar, W2 admission | OPEN — W0-4 writes the list |
| T-08 | ChromeGovernor (+resilience, ~30KB) | RESTRUCTURE vs capability tokens | W2 | OPEN |
| T-09 | NLCL resolvers (~30 files) | HARVEST-split (deterministic data / probabilistic tail) | W4 | OPEN |
| T-10 | Capability bootstrap (default caps/discovery/seed) | HARVEST → agent rows | W4 | OPEN |
| T-11 | Conversations/messages/sessions/checkpoints/stream-blocks (+ session family) | HARVEST-shape | W3 | OPEN |
| T-12 | EventBus + bridges | REMOVE | — (verify absent W7) | CLOSED-as-REMOVE |
| T-13 | ModuleRegistry + plugin-router install | REMOVE | — (verify absent W7) | CLOSED-as-REMOVE |
| T-14 | Prisma runtime (200 models) + migrations + storage impl | REMOVE-runtime (shapes per T-03/T-11) | — (verify absent W7) | CLOSED-as-REMOVE |
| T-15 | ProviderRegistry singleton / manager stubs | REMOVE | — (verify absent W7) | CLOSED-as-REMOVE |
| T-16 | Command-language + dialogue/confirmation stores | HARVEST-confirm-semantics → consent | W3 | OPEN |
| T-17 | Next.js frontend + Tauri shell | KEEP-not-yet-migrated → pointer | W5 | OPEN |
| T-18 | Observability/logger/resilience/scheduler/tunnel/p2p/onboarding | REMOVE-patterns-only | W6 | OPEN |
| T-19 | (reserved) Composition generator inputs (grant matrices per stratum) | NEW — W0/W1 | W0 spec, W1 build | OPEN |
| T-20 | (reserved) Per-provider stream configs (M1 per-class quirks) | NEW — W2 | W2 | OPEN |

## Counts (honest, carried from M-TRIAGE-01 §2)

- Prisma models on disk: 200 (`^model ` count) vs M-plan "196" (stale by 4). ~17 shapes harvestable (T-03/T-10/T-11); rest serve retired transport.
- Provider plugins in code: 3 (chatgpt/claude/gemini); "16 providers" live as data (definition rows/manifests) — scale-out is data-driven registration, favoring recipe entries.
- Retired-plan K-rows: file-pointer index only; verdicts void.
