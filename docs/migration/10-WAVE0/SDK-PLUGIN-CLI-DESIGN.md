# SDK + Plugin Architecture + CLI — Unified Design (Wave0 companion)

**Status:** PROPOSED design — implements GAP-M1 (generator inputs), GAP-M5 (pack checklist), GAP-M6 (conformance net), and the migration-devops need that *every new plugin is fully registered, with all capabilities / dependencies / configurability available and natively exposed via the CLI*.
**Constraints honored:** host-zero (no `host/src` change), contracts amendment discipline (additive only, `manifestVersion: "1"` stays), B1–B5, `os-surface` / `bun-surface`, 16-spec freeze until the W0 generator lands, Decision Contract (this becomes 1–2 D-records, not a silent refactor).

---

## 1. What exists today (honest inventory, 2026-09-16 base)

**SDK (`sdk/src/`, 6 files)** — shape validators + thin client, no authoring power:
- `schema.ts` — zod mirror of contracts (manifest/recipe/port/law/consent), `parseManifest`/`parseRecipeShape`. Strict top-level, loose contributions.
- `validate.ts` — semantic law: risk-only-on-contract, lang-data-only-on-lang, routable uniqueness, dep-ref grammar (`contract:<op>@<v>` | `capability:<cap>`), cap grammar (`port:<op>@<v>` | `host.*`), entry-relative, publisher keyId. Plus `validateComposition` (phase-0 law, dup entry, grant grammar, op-ownership, grant-declared, dep-satisfied) and `grantableFromOps`.
- `sign.ts` — manifest signing via host canon (never reimplemented digests), `signPluginDir`.
- `client.ts` — `createPortClient` (fail-fast REFUSED pre-transport) + `describeGrants` (review-UI grouping).
- `stream.ts` — `streamRootCall` consumer generator (ordered, seq-checked, flood-bounded, drain-then-stop).
- Missing: manifest *builders* (hand-write JSON today), config *schema* (config is `Record<string,unknown>` passthrough, unvalidated), capability/dependency *typed helpers*, registration/compose helpers (that's `tooling/builder` + host `compileComposition`, not the SDK), discovery/introspection, CLI generation.

**Plugin (`plugin.json`, `manifestVersion: "1"`)** — request, never grant:
- `id/version/description/entry/publisher/contributions/dependencies/capabilities/runtime/contentHash`. 12 contribution kinds; routable = `contract|engine|provider`; risk only on `contract`; `lang`/`parser` NOT routable by construction; `surface` dormant until a contract appears.
- `dependencies[]` = `{ref: contract:<op>@<v> | capability:<cap>, range}`. `capabilities.requested[]` = `port:<op>@<v>` | `host.*`. `runtime.budget` = `{cpuMs, memMB}` (watchdog + spawn budgets). `config` lives **only** on the composition entry (data passthrough, never authority) — no per-plugin config schema exists anywhere.
- Authoring path: `tooling/builder` scaffolds `contract|provider|engine|surface` echo plugins + FakeHost test + conformance fixture; `testkit/runConformance` proves staged→verified→active. Good — but scaffold covers 4 kinds, no config, no CLI surface, no capability/dependency wizards.

**Shim (`shim/src/index.ts`)** — `definePlugin({ops, onInit, onShutdown})` + `PluginContext {manifest, capabilities, config, port.call, log}` + `CallMeta {causationId, deadlineMs, from, emit}`. Strict-seq `emit`, close-once, BUDGET/DEGRADED discipline. Correct and complete for v1 — needs no change except *typing* upgrades the SDK can provide (typed ctx per plugin).

**CLI (`surfaces/cli/src/cli.ts`, 569 lines)** — root-principal script, honest but hand-built:
- Commands: `plugins` (compartments + grants + routed ops), `call <op> [json]` (any routed op, generic), `consent`, `msg send|list|search` (the ONLY per-domain sugar, hand-coded for `message.*`), `status`, `daemon start|stop|status`. Warm-daemon path with cold fallback, byte-identical output (gated).
- Gaps: no per-plugin command namespaces, no per-op typed args (raw JSON only), no streaming flags (`streamRootCall` exists in SDK but CLI has no `--stream`), no plugin lifecycle (`new/check/compose` live in `tooling/builder`, not the CLI), no capability/dependency/config inspection beyond raw `plugins` dump, no `surfaceOpMeta`-driven generation (MCP has the rule — CLI doesn't consume it).

**MCP (`surfaces/mcp/src/mcp.ts`)** — already has THE generation rule (`surfaceOpMeta` in contracts, D-359/A2): tools generated from booted composition's routed ops, nothing else. CLI must consume the same derivation, not invent a second binding.

---

## 2. Design principles (non-negotiable)

1. **One derivation, N consumers.** `surfaceOpMeta` + `capabilityNamesFromRouted` (contracts) is the single source for "what can be called here." MCP consumes it; CLI will consume it; chat resolution consumes it. No second tool/command list maintained by hand.
2. **Manifest is a request; recipe is the grantor; CLI is a revealer.** The SDK/CLI never grant authority — they reveal, validate, and invoke through the router. `createPortClient.can()` stays fail-fast UX, host stays the boundary (B3).
3. **Additive contracts only.** `manifestVersion: "1"` stays. New manifest fields are optional; new contribution kinds are additive; old validators accept old manifests byte-identical. Anything breaking = amendment-class event with its own D-record.
4. **Config is data with a schema, never authority.** Plugin declares the shape; composition entry supplies the value; SDK validates value⊆shape pre-boot; host passes through untouched.
5. **Host-zero.** All new machinery lives in `sdk/`, `testkit/`, `tooling/`, `surfaces/cli/` (surface package), and `contracts/` additive types. `host/src` diff must be empty.
6. **Every new name ships with producer + reader + test.** D-332 enforced: new SDK export with zero call sites fails the gate; new CLI command without a real-boot test fails the gate.

---

## 3. SDK v2 shape (proposed — additive modules, existing files untouched)

```
sdk/src/
  index.ts      (existing re-exports + new modules below)
  schema.ts     (existing — plus ConfigSchema + CliSpecSchema mirrors, §4)
  validate.ts   (existing — plus validateConfig + validateCliSpec, §4)
  sign.ts       (existing — unchanged)
  client.ts     (existing — plus typed call + stream convenience, §3.4)
  stream.ts     (existing — unchanged)
  manifest.ts   (NEW — builders: defineManifest/contract/provider/engine/config/cli/capability/dependency)
  config.ts     (NEW — config-schema authoring + value validation + docs generation)
  discover.ts   (NEW — booted-composition introspection: ops/caps/deps/config/cli surface)
  compose.ts    (NEW — composition-spec authoring: addPlugin/grant/check, wraps validateComposition)
  cli.ts        (NEW — command-tree generation from discover() output; consumed by surfaces/cli)
```

### 3.1 `manifest.ts` — stop hand-writing JSON

```ts
// Typed builders; output is a plain PluginManifest (signing unchanged).
defineManifest({ id, version, description, entry, runtime }): ManifestBuilder
  .contract(id, version, opts?: { risk?: RiskClass; doc?: string })
  .provider(id, version, opts?: { doc?: string })
  .engine(id, version, opts?: { doc?: string })
  .configSchema(schema: ConfigSchemaDecl)          // §4 — one per plugin, validated
  .cli(spec: CliSpecDecl)                          // §4 — command sugar declarations
  .needs(...caps: CapabilityRef[])                 // typed port:/host. refs
  .dependsOn(...deps: DependencyRef[])             // typed contract:/capability: refs
  .budget({ cpuMs, memMB })
  .build(): PluginManifest
```

Why: eliminates the entire class of shape/grammar errors the validators currently catch *after* writing. Builders emit exactly what `parseManifest` accepts; `validateManifest` stays the arbiter (builders are convenience, never a bypass).

### 3.2 `config.ts` — configurability with a schema

```ts
type ConfigField = { key: string; type: "string"|"number"|"boolean"|"enum"|"credentialRef";
  required?: boolean; default?: unknown; values?: string[]; doc?: string };
type ConfigSchemaDecl = { fields: ConfigField[] };
declareConfig(fields: ConfigField[]): ConfigSchemaDecl
validateConfigValue(schema: ConfigSchemaDecl, value: Record<string,unknown>): { ok: true } | { ok: false; errors: string[] }
configDocs(schema: ConfigSchemaDecl): string   // CLI `plugin config --help` + generated docs
```

Rules: `credentialRef` type carries a `credentialId` *reference* only (SURFACES.md credential law — secrets never ride config). Values validated pre-boot (SDK) and fail-closed at conformance `verified` stage; host passes through uninspected (never authority).

### 3.3 `discover.ts` — what does this booted composition offer?

```ts
interface DiscoveredOp { op: string; owner: string; risk: string; cli?: CliOpSugar }
interface DiscoveredPlugin { id: string; version: string; ops: DiscoveredOp[];
  needs: string[]; grantedCaps: string[]; missingCaps: string[];
  deps: DependencyRef[]; unsatisfiedDeps: DependencyRef[];
  configSchema?: ConfigSchemaDecl; configValue?: Record<string,unknown>; configIssues: string[] }
discoverFromBoot(manifests: Map<string,PluginManifest>, recipe: Recipe): DiscoveredPlugin[]
discoverOps(...): DiscoveredOp[]   // sorted, deduped — wraps capabilityNamesFromRouted + surfaceOpMeta
```

Consumers: CLI command tree (§5), `plugins`-v2 output, MCP parity check, triage splitter (which legacy subsystem maps to which discovered surface).

### 3.4 `client.ts` additions — typed calls without new transport

```ts
typedCall<Payload, Result>(client: PortClient, op: string, payload: Payload, opts?: PortCallOptions): Promise<PortResult>
callAndUnwrap<T>(...): Promise<T>          // throws EngineError(REFUSED|SCOPE|BUDGET|DEGRADED) — for scripts, never for gates
streamCall(router: StreamRouter, op: string, payload: unknown, opts?: StreamCallOptions): StreamCall  // re-export of stream.ts, one import
```

No new wire. Typed wrappers only — the `PortResult` discipline (`Outcome<T>` at the plugin edge, thrown only for unexpected) is unchanged.

### 3.5 `compose.ts` — composition authoring without hand-JSON drift

```ts
composeSpec(name: string): CompositionBuilder
  .addPlugin(id, source, opts: { bootPhase; contracts: string[]; capabilities: string[]; config?: Record<string,unknown> })
  .grantAllFrom(manifest: PluginManifest)   // grant exactly what the manifest declares (review, then narrow)
  .check(manifests): ValidationIssue[]      // wraps validateComposition
  .build(): CompositionSpec
```

Feeds the W0 generator (GAP-M1): generator output is a `CompositionSpec` built this way, never string-concatenated JSON.

### 3.6 `cli.ts` — the generation rule, shared with MCP

```ts
interface CliCommand { path: string[]; op: string; describe: string; risk: string; streaming?: boolean }
buildCommandTree(discovered: DiscoveredPlugin[]): CliCommand[]   // §5 rule
renderHelp(tree: CliCommand[]): string
opToCliPath(op: string, ownerPluginId: string, cliSpec?: CliOpSugar): string[]  // default + override
```

`surfaces/cli` imports this; MCP keeps importing `surfaceOpMeta`. Both derive from the same discovered set — the A2 invariant ("one source, N consumers") extends to a third consumer without a third binding.

---

## 4. Plugin architecture extension (manifest v1.1-additive — all fields optional)

### 4.1 `configSchema` contribution (new kind: `config`)

```jsonc
{ "kind": "config", "id": "chat.config", "version": "1",
  "doc": "namespaces + caps for vivim.chat",
  "fields": [
    { "key": "historyCap", "type": "number", "default": 200, "doc": "per-conversation read bound" },
    { "key": "credentialId", "type": "credentialRef", "required": false }
  ] }
```

- One `config` contribution per plugin max (validator `CONFIG_SINGLETON`).
- Composition entry `config` values validated against it at conformance `verified` + pre-boot (CLI `--check`); mismatch = fail-closed with named field errors.
- Host behavior unchanged (passthrough). `platform/`-owned paths (`dataDir`, socket paths) validated as `${TMP}`-spelled strings when present.

### 4.2 `cli` contribution (new kind: `cli` — sugar metadata, never authority)

```jsonc
{ "kind": "cli", "id": "chat.cli", "version": "1",
  "doc": "human sugar for chat ops",
  "commands": [
    { "op": "chat.open@1", "path": ["chat","open"], "describe": "open a conversation",
      "args": [{ "key": "title", "flag": "--title", "required": false }],
      "streaming": false },
    { "op": "chat.append@1", "path": ["chat","send"], "describe": "append + stream the reply",
      "args": [{ "key": "conversationId", "flag": "--to", "required": true }],
      "streaming": true }
  ] }
```

- `cli` declares NO routable ops (like `surface`/`lang`/`parser`: `routableOps()` ignores it — validator `CLI_NON_ROUTABLE`).
- Every `commands[].op` must be routable-declared by the same manifest (validator `CLI_OP_UNDECLARED`) and use `<id>@<digit>` grammar.
- Paths must be unique within the manifest; cross-manifest collisions resolve by owner-prefix (CLI prints both + the generic `call` fallback — never ambiguous execution).

### 4.3 Capability & dependency surfacing (no grammar change — first-class builders + discovery)

- Grammar stays `port:<op>@<v>` | `host.*` and `contract:<op>@<v>` | `capability:<cap>` (frozen — changing it breaks every manifest).
- What changes: builders (§3.1) + `discover()` missing/unsatisfied reporting (§3.3) + CLI `plugin needs <id>` rendering + conformance `CAP_NOT_GRANTABLE`/`DEP_UNSATISFIED` already enforced (no new law needed — new visibility only).
- Watchdog budgets (`runtime.budget`) gain a builder default per kind (contract 500/128, provider 1000/256, engine 500/128 — recorded, not enforced beyond existing D-360 semantics) + `budgetStatus` audit already specified (D-366).

### 4.4 Validators added (all in `sdk/validate.ts`, all covered by gate)

| Code | Rule |
|---|---|
| `CONFIG_SINGLETON` | ≤1 `config` contribution per manifest |
| `CONFIG_FIELD` | field keys unique, types known, enum has values, defaults match type |
| `CONFIG_VALUE` | composition `config` ⊆ schema (unknown keys refused, required present, types match) |
| `CLI_NON_ROUTABLE` | `cli` contributes no routable ops |
| `CLI_OP_UNDECLARED` | every cli command's `op` declared routable in the same manifest |
| `CLI_PATH_COLLISION` | command paths unique per manifest (cross-manifest → owner-prefix, never silent shadow) |

---

## 5. Advanced CLI command system (native exposure — same derivation as MCP)

### 5.1 Command tree (back-compatible: every v1 command keeps working)

```
vivim [--vault D] [--composition F | --recipe F] [--json] [--no-daemon] [--deadline MS] [--principal P]
  plugins [--json]                          # v2: caps/deps/config/cli per plugin (discover())
  plugin  needs <id>                        # requested vs granted vs missing + unsatisfied deps
  plugin  config <id> [--check]             # schema + value + issues
  plugin  deps [--graph]                    # dependency edges across the composition
  call <op> [json] [--consent ID] [--stream]            # v1 + streaming sink (chunks to stdout frames)
  <ns> <verb> ...                           # GENERATED per-op sugar (see 5.2; e.g. chat open/send, msg send/list/search graduate here)
  consent <id>                              # v1 unchanged
  approve --consent ID -- call ...           # alias spelling of the one-shot ceremony (discoverable)
  status [--json]                           # v1 + dormant/budgets/generation
  daemon start|stop|status                  # v1 unchanged
  check [--composition F]                   # NEW: validate manifests+composition+config+cli without booting
  compose --help                             # NEW: thin wrapper over compose.ts (generate spec, print, --write)
  stream <op> [json]                        # NEW: explicit streaming call (ordered frames + terminating result)
  watch journal [--follow]                  # NEW (spine-gated): law-journal tail for operators
```

### 5.2 Generation rule (the CLI twin of MCP's tool-generation rule)

1. Start from `discoverFromBoot()` (boot reality, not manifest reconstruction).
2. For each discovered op: default path = op split (`chat.open@1` → `chat open`); `@version` selects when several versions route (explicit `--op chat.open@2` escape hatch; default = lowest routed major, printed).
3. Manifest `cli` contribution overrides (path/flags/describe/streaming) where present; hand-sugar (`msg send`) migrates INTO `cli` contributions (no privileged built-ins — the email pack declares its own sugar like every other plugin).
4. Unknown ops still invokable via generic `call` (never hidden); refused ops print the attributable refusal + exact runnable follow-up (consent command, missing-cap note, or `plugin needs` pointer) — the v1 consent-hint behavior generalized to all refusal kinds.
5. `--json` contracts: one JSON document on stdout, diagnostics on stderr (v1 stdout-ownership law holds for every new command).

### 5.3 Streaming, consent, principals, deadlines (uniform flags, all commands)

- `--stream` / `stream` command: chunks as newline-delimited frames `{seq, data, final}` via `streamRootCall`; terminating `PortResult` printed last and authoritative; seq violations fail-closed (never reordered view); `--max-chunks` flood bound (default 1000, D-369).
- `--consent ID`: one-shot grant+retry in one process (v1 ceremony, generalized to generated commands).
- `--principal P`: root default; non-root principals route through the same gate (attribution, `law.describe`-consistent kinds).
- `--deadline MS`: per-call budget; BUDGET failures print the bound (never hang).

### 5.4 Worked example (chat pilot, post-change)

```powershell
bun run surfaces/cli/src/cli.ts check --composition compositions/chat.json
bun run surfaces/cli/src/cli.ts plugins --vault dev-vault --composition compositions/chat.json
bun run surfaces/cli/src/cli.ts chat open --title "migration probe" --json
bun run surfaces/cli/src/cli.ts chat send --to conv_abc --text "hello" --stream --json
bun run surfaces/cli/src/cli.ts plugin needs vivim.chat
bun run surfaces/cli/src/cli.ts call chat.history@1 '{"conversationId":"conv_abc"}' --json
```

Every line above resolves through `discover()` → router `callAsRoot`/`callAsRootStream` → law gate → journal. Nothing bypasses; nothing is privileged.

---

## 6. Conformance + gate impact (mechanical teeth)

- `runConformance` gains: config-value check (when composition context + entry config supplied), cli-spec check (`CLI_*` validators), capability-fit already present. Fixture contract unchanged (`run(def, fake)`).
- Gate gains (W0-1 net, extended): manifest-shape + semantic + composition-fit + config-fit + cli-spec + risk-parity + grant-drift — one read-only stage, seeded-drift red / clean-tree green.
- Builder (`tooling/builder`) gains `--with-config` + `--with-cli` scaffold flags emitting the new contributions + tests; existing 4 kinds unchanged.

## 7. Work plan (host-zero, wave-ordered)

1. **D-record(s):** one directive record (SDK builders + manifest `config`/`cli` + CLI generation rule) — optionally split evidence half for the gate-stage half (W0-1). File in `clone-omega/docs/decisions/`, board regenerated same-branch.
2. **Contracts (additive):** `ConfigField/ConfigSchemaDecl/CliSpecDecl` types + ` belakang` contribution-kind additions (`"config"`, `"cli"`) to `CONTRIBUTION_KINDS` — no change to routable/risk derivation (both non-routable by construction).
3. **SDK:** `manifest.ts` → `config.ts` → `discover.ts` → `compose.ts` → `cli.ts` (that order; each with unit tests; D-332: no export without a caller — CLI wires each as it lands).
4. **Validators + conformance + builder flags.**
5. **CLI:** `check` → generated tree → `stream` → `plugin needs/config/deps` → `watch journal` (that order; each with a real-boot test + `--json` contract test).
6. **Migrate `msg` sugar** into the email pack's `cli` contribution (removes the last privileged built-in; proves the rule generalizes).
7. **Evidence:** gate green + host-diff empty + bench (CLI cold/warm parity for generated commands, mirroring the daemon byte-identical test) in `40-EVIDENCE/`.

## 8. Open questions (for owner, not blockers)

1. Should `plugin needs/config` be root-visible in compositions that don't grant the queried plugin (introspection vs least-privilege display)? Recommended: visible metadata (manifests are signed public requests), secret values never displayed (credential law).
2. One CLI binary vs per-surface CLIs? Recommended: one CLI consuming `discover()`; MCP stays separate transport, same derivation.
3. Version-selection default (lowest routed major vs latest)? Recommended: lowest (matches `pickOp` `@1`-preferred precedent in current CLI).

---

## Appendix — today's → tomorrow's map (no silent renames)

| Today | Tomorrow | Change class |
|---|---|---|
| hand-written `plugin.json` | `defineManifest()` builder emits it | convenience (validators still arbitrate) |
| `config` unvalidated passthrough | `config` contribution + `validateConfigValue` + `check` | additive law |
| `capabilities.requested` strings | same strings via `.needs()` typed builder | convenience |
| `dependencies` strings | same strings via `.dependsOn()` typed builder | convenience |
| `msg` hand-sugar in CLI | email pack `cli` contribution, same paths | generalization (behavior-preserving) |
| `call <op> [json]` | unchanged + `--stream` + typed wrappers | additive flags |
| `plugins` dump | `discover()`-backed detail + `plugin needs/config/deps` | additive commands |
| MCP tool list | unchanged derivation, CLI joins as consumer | no MCP change |
| host/shim wire | unchanged | zero host diff |
