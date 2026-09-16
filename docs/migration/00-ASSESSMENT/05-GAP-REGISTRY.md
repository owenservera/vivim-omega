# Gap Registry — Core Ingredients Missing (live tracker)

**Rule:** a gap leaves this page only by being fixed (falsifier + D-record) or superseded (D-record pointer). New gaps land here in the same commit that introduces them (KNOWN-LIMITS discipline, mirrored for migration).

## Core gaps (Wave0 must rule; waves must close)

| # | Gap | Layer | Why it blocks migration | Owner wave | Falsifier |
|---|---|---|---|---|---|
| GAP-M1 | No composition generator (16-spec freeze is social) | L8 compositions / tooling | Every wave needs compositions; hand-edits re-litigate placement + drift | W0 rule, W1+ use | Generator reproduces `chat`+`browser`; drift fails gate |
| GAP-M2 | No per-conversation index; retention OPEN/unmeasured | L3 vault / L4 chat | Years of chat history → total-ns scan (L-4); compaction policy unguessable | W0 probe, W3 full | Bounded history-read bench at 100K msgs; cap fail-closed |
| GAP-M3 | No sharing model (single-principal only, L-11) | L3 law / L4 credentials+chat | Legacy is multi-user (workspaces/sessions/keys); smuggled sharing = unruly authority | W0 ruling, post-GAP-4 build | Second-principal read REFUSED + ledgered (pinned code) |
| GAP-M4 | Launch mode deferred (D-301); stealth admission open (T-07); byte-identical undefined (G5/C0) | L6 providers / L2 platform | 16 providers can't all attach; stealth bulk-import = trust expansion without a bar | W0 bar+definition, W2 code | Substitution test + forbidden-nav refusal on real boot |
| GAP-M5 | One pack (no authoring workflow) | L6 packs | 15+ domains each invent a shape → snowflakes, not a cake | W0 checklist, W1 second pack | Retro-pass on `domain-email` + clean pass on pack #2 |
| GAP-M6 | Conformance net is three partial nets (G9/W1 + D-332 + D-351) | Tooling gates | Grant drift + zero-callsite types + risk mismatch scale with composition count | W0 (land first) | Seeded drift fails the one stage with a named diagnostic |
| GAP-M7 | No prod observability plugin (bench/demo/status only) | L7 tooling / L4 mind | "Ledgered and queryable" means something different per wave; 16-provider traffic unqueryable | W0 spine spec, W6 SLOs | Mind-query round trip over seeded multi-provider vault |

## Scale gaps (waves close; Wave0 does not rule beyond noting)

| # | Gap | Note |
|---|---|---|
| GAP-S1 | SSE/import parser harvest (T-04/T-05) as governed data | D-355 landing zone exists; W1 fills it |
| GAP-S2 | 15 provider realizations + API-vs-browser per-provider call | T-01/T-02/T-03 data-driven registration favors recipe entries; W2 |
| GAP-S3 | 30-file NLCL split + capability taxonomy seed | T-09/T-10; deterministic-first already wired (D-359); W4 |
| GAP-S4 | Next.js/Tauri pointer + multi-user auth hardening | M-plan Phase 5 default stands; W5 decides rebuild only on proven mismatch |
| GAP-S5 | Scheduler/tunnel/p2p/onboarding/resilience as plugins | T-18 patterns-only; via `platform/` + budgets; W6 |
| GAP-S6 | Calibration corpus (GAP-1) + SLO envelopes (GAP-2) | Blocked behind PRINCIPLES+M10 per map order (L-12/L-13); W4 seeds corpus, W6 publishes SLOs |

## Non-gaps (claimed missing, actually present — do not build)

| Claimed | Reality | Pointer |
|---|---|---|
| "No streaming" | Landed (D-352) | `sdk/src/stream.ts`, `echo.stream@1` |
| "No browser realization" | Landed (D-357) | `provider-browser/src/`, `browser.json` |
| "No chat storage" | Landed (D-358) | `vivim-chat`, ns `chat` |
| "No human principal" | Landed (D-353) | `law.describe@1`, `PrincipalKind` |
| "No resolution wiring" | Landed (D-359) | `chat.resolve@1` + shared classifier |
| "No credentials story" | Landed (D-356) | `credential.{put,use,redact}@1` |
| "No parser governance" | Landed (D-354/D-355) | Isolation tier + pins, NOT routable |
| "No containment" | Landed (D-360 watchdog 13/14) | `tooling/watchdog`, 2.9s/3.7s walls |
| "No reproducibility" | Landed (D-362) | `verify-status.ts` + required jobs |

## Triage carry (M-TRIAGE-01 T-01–T-18 — still the harvest index)

T-01 provider metadata HARVEST · T-02 manifests HARVEST (Ollama pilot candidate) · T-03 DB taxonomy HARVEST-shape · T-04 SSE parser HARVEST · T-05 import fixtures HARVEST · T-06 CDP mechanics HARVEST · T-07 stealth SELECTIVE · T-08 governor RESTRUCTURE · T-09 NLCL SPLIT · T-10 capability bootstrap HARVEST · T-11 conversations/sessions HARVEST-shape · T-12 EventBus REMOVE · T-13 ModuleRegistry/plugin-router REMOVE · T-14 Prisma runtime REMOVE · T-15 ProviderRegistry singleton REMOVE · T-16 command-language HARVEST-confirm-semantics · T-17 frontend KEEP-not-yet-migrated · T-18 observability etc. REMOVE-patterns-only. Full rows + wave assignment in `30-TRIAGE/TRIAGE-LEDGER.md`.
