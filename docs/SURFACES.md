# Surfaces (Ω6) — how external triggers become Actions

One page of record for the v1 surface model: the CLI, the MCP stdio server, and
the credential law they obey. Surfaces are the *outside edge* of VIVIM-Ω — they
turn an external trigger (a shell command, an MCP client request) into the SAME
`Action` flow every compartment sees.

## The v1 model: root-principal scripts (the honest version)

In v1, surfaces are **OUTSIDE-compartment workspace scripts** — the "root
principal" pattern already used by `tooling/demo/demo.ts` and the host's own
runtime tests. A surface:

1. loads a composition spec (default `compositions/spine.json`),
2. boots it through the **µhost public API only**:
   `compileComposition` (sign each manifest, stamp content hashes, sign the
   recipe) → `bootWithRecovery` (verify → pin → spawn compartments, fail-closed),
3. issues every call through the host router as `router.callAsRoot`,
4. shuts the composition down when its one command / client session ends.

No private executors, no surface-side policy, no bypass: risky ops still hit the
law gate, unknown ops still REFUSE, a consent-required refusal still names its
consentId. The demo, the tests, and the surfaces all hold the *same* authority —
which is exactly why the surfaces are honest in-sandbox: nothing they can do is
unavailable to the host's own test rig.

**Why not a surface compartment in v1?** A real surface plugin (a compartment
granted stdio transport + a `surface` contribution) needs host-side transport
grants the µhost does not mint yet. That is deliberately post-v1 — shipping it
half-built would violate the boot laws. v1 keeps the boundary honest by making
the surface's authority *equal to*, never *greater than*, the root principal.

**Consent lifetime in v1:** consent grants live in the law compartment's memory
(they are composition-instance state, by Ω1 design). The MCP server holds its
composition for a whole session, so the ceremony is atomic there (refuse → grant
→ retry, all through tools). The CLI is one command per process, so it offers the
one-shot form `call <op> --consent <consentId>` (grant + retry in a single
process) next to the plain `consent <consentId>` command.

## The CLI surface (`surfaces/cli`)

```
bun run surfaces/cli/src/cli.ts <command> [args] --vault <dir> [--composition <file>] [--recipe <file>]
```

| command | what it does |
|---|---|
| `plugins` | lists the booted composition's compartments (phase, state, granted capabilities) and their routed ops |
| `call <op> [json-args]` | invokes any routed op as root; pretty-prints the `PortResult` |
| `consent <consentId>` | grants a pending consent through `law.consent.grant@1` |
| `msg send\|list\|search` | sugar for the `message.*` contracts — only if an email provider (provider.email.file) is routed; otherwise prints `not in composition` |
| `status` | the router status JSON |
| `daemon start\|stop\|status` | warm-path daemon for this vault (start reuses a live one); `--no-daemon` forces cold boot |

Exit codes: `0` ok · `1` refused/failed/boot-failed (JSON report on stderr) ·
`2` usage error (all argument validation happens *before* the composition boots).

When a call REFUSES with a consent-required detail, the CLI prints the
consentId prominently plus the **exact runnable `consent` command** (rebuilt with
the invocation's own `--vault/--composition/--recipe` flags), and the one-shot
`call … --consent …` variant for scripts.

## The MCP surface (`surfaces/mcp`)

A hand-rolled stdio server — JSON-RPC 2.0 over newline-delimited stdin/stdout,
no SDK dependency:

```
bun run surfaces/mcp/src/mcp.ts --vault <dir> [--composition <file>]
```

- `initialize` → `protocolVersion "2025-06-18"`, capabilities `{tools}`,
  serverInfo `vivim-mcp`.
- `notifications/initialized` (and any notification) → never answered, per JSON-RPC 2.0.
- `ping` → `{}`.
- **`tools/list` — THE tool-generation rule:** tools are generated **from the
  booted composition's routed ops, nothing else**. Tool name = op with `.`
  and `@` mapped to `_` (`echo.ping@1` → `echo_ping_1`); `inputSchema` is a
  generic object shape (the op's own contract defines the fields); the
  description carries the owning plugin and the declared risk. If the
  composition didn't grant it, it isn't a tool — an external client can only
  operate the system using granted ops.
- `tools/call {name, arguments}` → maps the name back to the op →
  `router.callAsRoot(op, arguments)` → `content: [{type:"text", text:
  JSON.stringify(PortResult)}]`. Failures are MCP tool errors (`isError: true`).
  A consent-required REFUSED carries the consentId and the exact way to grant it
  (on this server: `tools/call law_consent_grant_1 {"consentId": …}` — the grant
  is live in the server's booted composition).

stdout is the protocol stream and nothing else may ever write to it: the surface
redirects host/compartment log lines to stderr before booting.

## The daemon warm path (`surfaces/daemon`, D-322)

One long-lived host process per vault, spoken to over TCP 127.0.0.1 — the CLI's
expensive half (process start, compile, verify, worker spawn) happens once here
instead of per invocation. Same root-principal authority as the CLI (every call
is `router.callAsRoot` inside the daemon); same gate on every call.

- `daemon start|stop|status` (CLI) manages the daemon for a `--vault`. Start
  reuses a live daemon; the CLI otherwise boots cold automatically unless
  `--no-daemon` is given. Cold fallback is silent on stdout (a stderr note names it).
- Trust: the daemon secret lives in `<vault>/daemon.json` — anyone who can read
  the vault dir already holds its root keys, so no new trust assumption is made.
- Staleness: every request restats the running composition's plugin sources
  (mtime+size, never a content rehash) and reboots on drift; a different spec or
  recipe always reboots. Idle timeout (default 10 min) bounds lifetime.
- CLI output is byte-identical warm vs cold (gated by test) — the warm path is a
  performance layer, never a behavior fork. `status()` is a per-invocation
  snapshot (no compartment churns mid-command in any CLI flow).

## The credential law

Secrets never ride payloads, never ride environments.

1. **No secrets in payload or env.** A composition entry's `config` is data
   passthrough — it may carry a `credentialId` *reference*, never a secret. The
   environment of a compartment is not a credential store.
2. **`credential.use` is a capability.** A live adapter that needs a secret
   requests the `credential.use` capability in its manifest; only the
   user-signed Recipe can grant it (law 7). The secret itself is fetched
   per-call, through the port, from a credentials spine (op `credential.use@1`),
   by reference.
3. **Live legs are owner-machine only.** In the sandbox there are no live keys
   and no composition grants `credential.use`, so live code paths are dead by
   construction and fail closed if provoked. The canonical example is
   `plugins/provider-llm`: `chat.complete@1` runs a deterministic simulator
   (`sim: true` on every completion); the openai-compatible HTTP leg in
   `src/live.ts` is complete, real, documented — and unreachable without the
   credential capability. A future live adapter tier would also declare
   `EXTERNAL_MUTATION` risk for paid API usage (a v2 policy refinement; the
   simulator is local so `chat.complete@1` stays READ).

## Post-v1 (recorded, not built)

- A surface compartment: a plugin with a `surface` contribution + a host-granted
  stdio transport capability, so the surface's authority becomes an attenuated
  token instead of the root principal.
- Consent persistence across boots (journal replay of grants into the law's
  consent table).
- ~~A credentials spine plugin (`credential.use@1`)~~ **landed since this
  list was drawn** (D-356: `plugins/vivim-credentials` — `credential.put@1`,
  `credential.use@1`, `credential.redact@1`). Still post-v1: the *live-tier*
  half — vault-held secret material behind `credential.use` (today the spine
  holds references and the sandbox grants no live secret material, per the
  credential law above).
