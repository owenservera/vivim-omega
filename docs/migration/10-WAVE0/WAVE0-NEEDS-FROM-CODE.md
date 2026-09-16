# Wave0 Needs From Code — What Must Exist Before Any Harvest

**Wave0 question (code-grounded):** can today's `clone-omega` (@`61d1a41`, host 911/1100,
16 compositions, 13 vault ns, 21 plugin dirs) absorb the measured legacy (954/1051 src
files, 201 Prisma models, 13+8 provider manifests, ~70 NLCL files, 19 stealth engines,
40+ server routers, Next.js+Tauri frontend) as **plugins/packs/orchestrator-plugins with
zero host growth** — or does the core need tooling/rules first so harvests don't smuggle
the monolith back in?

**Answer: 9 needs, all below the host, each with falsifier + owner wave.** The 7-item
stale list is superseded; overlap is noted but the authority is the code gaps below.
Nothing here is host code. Everything is plugin/pack/contract/tooling/composition-level.
Wave0 closes when all 9 are PROPOSED-or-better with the two mechanical pieces green and
`omega:quick` + `omega:gate` green with host LOC unchanged.

## W0-1 — Plugin/pack authoring path (the highest-leverage gap)

**Gap in code:** adding a plugin today is manual: write `plugins/<name>/plugin.json`
(id/version/entry/contributions/capabilities/runtime/contentHash — see
`plugins/provider-llm/plugin.json`), add a `workspace:*` dep edge where needed, wire
`package.json` workspaces (already `plugins/*`), then **hand-edit a `compositions/*.json`**
to grant it contracts/capabilities (see `compositions/chat.json` 5-entry shape with
`grant{capabilities[],contracts[]}` + `config{dataDir:"${TMP}/..."}`). With 16 specs
frozen and no generator, every harvest re-litigates placement by hand.
**Need:** `omega plugin new <name>` scaffolds manifest+src+test+ns-row checklist;
`omega pack new <domain>` scaffolds SCHEMA+CONTRACT+POLICY+TEST; `omega composition
generate` emits specs from (plugin set + grant matrix + dataDir spelling) instead of
hand-edits. Second pack (chat-adjacent or provider-adjacent) is the proof the path
generalizes — retro-pass `packs/domain-email` against the checklist first.
**Falsifier:** generator reproduces `chat.json` + `browser.json` byte-identical modulo
signatures; a drifted hand-edit fails the gate; a fresh `plugin-echo`-class plugin boots
in a generated composition on first try.
**If skipped:** each later wave invents its own placement; the 16-spec freeze becomes 16
snowflakes. **Owner:** Wave0 rule + generator; Waves 1+ use it.

## W0-2 — Conformance net (one mechanical gate stage, zero blast radius)

**Gap in code:** three partial nets exist but no single stage ties them: grant-vs-manifest
drift across 16 compositions (forgetting a grant fails closed today only by accident of
a refused call, not by a gate diagnostic), new exported contract types with zero call
sites (`contracts/src/` 17 files, D-332-style risk), manifest risk vs LAW_POLICY parity.
**Need:** one read-only gate stage: every shipped composition's granted
contracts/ports resolve against manifests; cross-composition grant drift flagged
(allowlist for intentional scope differences, e.g. `chat.json` vs `browser.json` law
grants); new exported contract types with zero call sites flagged; manifest risk vs
policy classification parity checked. Land **before** Wave1 touches compositions.
**Falsifier:** stage green on current tree; a seeded drift (remove one grant / add one
undeclared risk) fails with a named diagnostic.
**If skipped:** Wave2's 15 provider realizations drift silently. **Owner:** Wave0 (land first).

## W0-3 — Vault index + retention with numbers (before years of rows exist)

**Gap in code:** `docs/VAULT-NAMESPACES.md` ns `chat` row says retention OPEN with trigger
"message latency or compaction pressure in benchmarks" and relies on `CHAT_HISTORY_CAP`
scan bound (total-ns scan, cap enforced post-filter). No per-conversation index object
exists (`conv:*` latest-wins + `msg:*` append-only `{id,conversationId,role,seq,…}` but
no `conv:<id>:idx`). Legacy brings conversations/messages/collections/attachments/
checkpoints/stream-blocks at multi-thousand-message scale per vault.
**Need:** (a) per-conversation index design (writer-maintained index row or equivalent —
design in record, not here); (b) retention windows per ns with numbers (at least
`chat/email/automation/discovery/agent/behavior/decision/providers/law/resolve/control`);
(c) compaction interaction stated (refs honored, changelog forever, cold fallback).
Probe + append-latency bench (1K/10K/100K messages, bounded history-read) lands in Wave0;
full index ships with the rows it indexes in Wave3.
**Falsifier:** bench shows bounded history-read at 100K msgs; cap refusal stays
fail-closed on the indexed path.
**If skipped:** Wave3 writes years of history into a full-scan store — then the index is
a migration, not a feature. **Owner:** Wave0 probe+rule; Wave3 full build.

## W0-4 — Sharing boundary ruling (single-principal fence before multi-user rows)

**Gap in code:** contracts have `PrincipalKind`/`principalKind` and `law.describe@1`;
`vivim-credentials` has `credential.{put,use,redact}@1` + REDACTION_POLICY; `vivim-chat`
attributes rows to `user:<id>`. Nothing in code accepts a second principal — but nothing
pins the refusal shape either. Legacy is multi-user (sessions/workspaces/per-user keys
across ~17 harvestable shapes in `seeds/user/` + session/checkpoint engines).
**Need:** Wave0 does NOT build sharing. It rules the Phase-1 boundary: single
`user:<id>` attribution + credentials spine + no cross-principal reads, with the exact
refusal shape (REFUSED, not DEGRADED) + the trigger that reopens sharing. Workspace/
session/key shapes land as **attributed rows**, never as shared objects.
**Falsifier:** second-principal read against a `user:<id>` conversation is refused +
ledgered; test pins the code.
**If skipped:** Wave3 smuggles a sharing model inside "session bookkeeping". **Owner:**
Wave0 ruling; post-cutover build.

## W0-5 — Provider realization contract + launch/stealth bar (the only trust expansion)

**Gap in code:** Omega has `ProviderClass` + `RealizationStatus` + realization rows
(`realization:<archetype>:<provider>` in ns `providers`, verify/healing writers) +
`provider-browser` (attach) + `provider-llm` (sim+live, live owner-machine-only behind
`credential.use`). Legacy has 13+8 manifests mixing `browser` auth (chatgpt/claude/gemini/
deepseek/facebook/qwen/telegram/whatsapp/…) and API auth (openai-api/anthropic-api/
openrouter/…) + `chrome-governor.ts` 30 KB + fleet + `intel/executor` CDP profiles +
19 stealth engines + `provider-protocol-generator.ts` 22 KB DB→file flow. Three things are
undefined in code: "byte-identical" fixture rule (canonical form + volatile allowlist),
launch-mode lifecycle (today attach-only; Chrome launch/packaging/budgets live in legacy,
must move through `platform/`), and per-file stealth admission.
**Need:** (a) define byte-identical FIRST (doc-only acceptable in Wave0); (b) scope launch
mode as a Wave2 wave (bar now: fence/attached/PROMOTED/pin extended to launched processes
+ day-one forbidden entries; lifecycle code later via `platform/`); (c) T-07-style
file-by-file admission list for the 19 stealth files (each: admit with law reason or
refuse with reason — no bulk import); (d) API_NATIVE-first rule (real API where one
exists; BROWSER_MEDIATED only where automation is the product) with per-provider call.
**Falsifier:** substitution test (live capture substitutable for a recorded page fixture
modulo allowlist, zero classifier changes) + forbidden-domain navigation refused +
ledgered through the browser realization.
**If skipped:** the pilot fakes its own trust mechanism. **Owner:** Wave0 bar+definition;
Wave2 code.

## W0-6 — Parser landing zone as data (governed, NOT routable)

**Gap in code:** Omega `contracts/src/parser.ts` + `ParserPin` shape exist; legacy brings
SSE framing (`engines/stream-parser.ts` 22 KB, `stream-align`, `streaming-*`,
`plugin-kernel/adapter/.../stream-parser.ts`), import fixtures (`seeds/parsers/`,
`engines/parsers/`), CDP mechanics, selector healers. Legacy `plugin-system.onParse`
shows the trap: parsers as **code hooks** in the hot path.
**Need:** parsers land as **data** (pins + fixtures + version-pinned signed blobs),
executed in the parser isolation tier with deadline-BUDGET, never as routable ops.
Wave1 proves it with one legacy SSE stream + one import fixture parsed through pins on a
real boot with `realizationRef`/`parserPins` surviving the vault round trip.
**Falsifier:** same as Wave1's falsifier (Wave0 writes the bar; Wave1 runs it).
**If skipped:** `onParse`-style code hooks re-enter the hot path. **Owner:** Wave0 bar;
Wave1 proof.

## W0-7 — Observability spine spec (what "ledgered and queryable" means at scale)

**Gap in code:** Omega has bench/demo/status/watchdog evidence + `vivim-mind`
WorldModel derivation + journal stream, but no prod observability plugin and no stated
query set for migrated traffic (16 providers × streaming × multi-user). Legacy has the
opposite: sprawling `observability/telemetry-*/otel-sink/metrics/health-*` engines that
must NOT be lifted (patterns only).
**Need:** specify the spine as `vivim.mind` + vault query + journal stream (no new
metrics sidecar): query set = per-conversation history, per-realization status,
per-decision resolve trail, per-eviction watchdog journal. Name the walls to watch
(boot, RTT, spawn, append-latency, eviction) — objectives (SLOs) follow measurement in
Wave6, but the walls are named now so every wave's falsifier means the same thing by
"ledgered and queryable".
**Falsifier:** mind-query round trip over a seeded multi-provider vault (history +
status + resolve trail + evictions) green on a real boot; BENCHMARKS extended with
append-latency vs ns-size.
**If skipped:** every wave proves observability differently and none compose. **Owner:**
Wave0 spec; Wave6 SLOs.

## W0-8 — Surface contract first (frontend pointer, not frontend port)

**Gap in code:** legacy `frontend/` is a full Next.js+Tauri product with its own Prisma
client, routes, and 40+ server routers behind it; Omega `surfaces/{cli,daemon,mcp,web}`
+ `sdk/` + `surfaceOpMeta` (one derivation, N consumers) already exist. The trap is
porting the frontend's data layer (Prisma imports, route handlers) into Omega.
**Need:** rule the pointer default: existing Next.js points at Omega surfaces over HTTP
(MCP tool generation via the shared derivation — no second derivation); Tauri shell
decision deferred to Wave5 on proven shape mismatch only; CLI/MCP parity via the same
`surfaceOpMeta`; console's cooperative-local-user assumption hardened to
authenticated-user over `user:<id>` + credentials + consent. No UI rebuild for
aesthetics in migration scope.
**Falsifier (Wave5, specified now):** a person types into the existing frontend (or
CLI-as-stand-in until then) and gets a real streamed response from one real provider
through the law gate, ledgered + mind-queryable.
**If skipped:** Wave1–4 build against a UI that later demands a different surface shape.
**Owner:** Wave0 rule; Wave5 proof.

## W0-9 — Mine guardrails + parity harness (how we stay honest)

**Gap in code:** both legacies are single-commit snapshots with no history; Omega's
working tree is dirty (D-372 in progress). Without pins, harvests drift from unmeasured
bases.
**Need:** (a) pin the mines: record `4a5eb84`/`afebe00` + file counts + Prisma model
counts + manifest slugs in every harvest commit message; mines stay read-only (fresh-tree
guard pattern); (b) `omega:quick` green on a clean `clone-omega` + pin the base SHA
before Wave1; (c) parity matrix harness: every harvest row (DATA/ALGORITHM/SPLIT/
SELECTIVE/PATTERN/SHAPED/CONTRACT/REMOVE per FACT-BASE §6) lands as landed+tested+
benchmarked or explicitly deferred with a decision pointer — file-coverage is not the
metric, capability-coverage is; (d) `40-EVIDENCE/` append-only per wave (gate JSON +
bench delta + boot log).
**Falsifier (Wave0 close):** `omega:gate` green + `omega:bench` published + host LOC
unchanged (911/1100) + `build/status.json` refreshed with citations + conformance net
green + index probe bench published + byte-identical definition written.
**Owner:** Wave0 setup; every wave appends.

## W0-10 — Foundation tier: multi-runtime + pluggable storage (from owner draft 001)

**Gap in code:** every plugin is a `worker-thread` compartment; storage is one sqlite
adapter inside `vivim-vault`. No sanctioned path for Python/OS-process runtimes or
swappable byte-persistence (Postgres), so "expand foundational needs" would otherwise
mean host growth or a sidecar DB.
**Need:** rule the foundation tier (candidate `FoundationKind`: PROCESS_RUNTIME | STORE |
reserved NETWORK): `process`/`wasm` runtime tiers as **additive manifest fields**;
`storage.kv` capability with vault-as-spine (CAS/Merkle/changelog stay in the vault,
bytes move behind the capability); OS-mediated spawning via `platform/` + a broker plugin
(host-zero, B5 preserved); driver plugins declare network/credential capabilities with
LAW_POLICY rows; secrets only as `credential.use` references. First draft received
2026-09-16 — recorded verbatim with arbitration list + falsifier set in
`FOUNDATION-DRAFT-001-MULTI-RUNTIME-DATA-LAYER.md`.
**Falsifier:** polyglot boot (Python `echo.say` through the process tier, malformed-IPC
deadline-BUDGET'd) + driver swap (identical `vault.append` CAS hashes + verify/roundtrip +
compaction-honors-refs on sqlite then postgres) + budget-kill BUDGET + secret-free
manifest/composition/journal + host LOC unchanged.
**If skipped:** foundations arrive as host growth or silent sidecars — the two failure
modes the whole strategy forbids. **Owner:** Wave0 ruling + contracts; land per the
draft's suggested order (contracts → platform spawn/broker → spine → drivers → shim).

## What Wave0 explicitly does NOT build

Launch-mode lifecycle code (Wave2) · full per-conversation index beyond probe (Wave3) ·
sharing implementation (post-cutover) · full NLCL corpus port (Wave4 split rule now,
files then) · Next.js/Tauri work (Wave5) · SLO envelopes (Wave6 walls→objectives) ·
legacy archive (Wave7, after parity proof) · any host change (never — push to surface
package or out-of-tree tooling per precedent).
