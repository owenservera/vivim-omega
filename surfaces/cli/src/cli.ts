#!/usr/bin/env bun
// surfaces/cli/src/cli.ts — the Ω6 CLI surface.
//
// A real command line over a booted composition:
//
//   bun run surfaces/cli/src/cli.ts <command> [args] --vault <dir> [--composition <file>]
//
// v1 honesty (docs/SURFACES.md): this is an OUTSIDE-compartment script — the
// "root principal" pattern the demo and the host tests use. It boots the
// composition through the µhost's PUBLIC API (compileComposition →
// bootWithRecovery) and issues every call through the host router
// (router.callAsRoot). No private executors, no surface-side policy: an external
// trigger (a shell command) becomes the SAME Action flow every compartment
// sees — risky ops still hit the law gate, unknown ops still REFUSE, a
// consent-required refusal still names its consentId.
//
// A surface compartment (a plugin granted stdio) is post-v1; until then surfaces
// are workspace scripts trusted like the demo.
import { join, resolve } from "node:path";
import type { PortResult, PluginManifest } from "@vivim/omega-contracts";
import { bootSurface, SurfaceBootError } from "./boot.ts";
import type { SurfaceBoot } from "./boot.ts";
import {
  callDaemon, daemonStatus, ensureDaemon, stopDaemon,
  type DaemonInfo,
} from "@vivim/daemon-client";

const REPO_ROOT = join(import.meta.dir, "..", "..", "..");
const DEFAULT_COMPOSITION = join(REPO_ROOT, "compositions", "spine.json");
const DEFAULT_VAULT = "dev-vault";

// ---- the surface owns its stdio -------------------------------------------------
// Every byte on stdout belongs to the surface contract (pretty text or JSON).
// Host/compartment log lines are diagnostics and must never corrupt the output —
// route console.log to stderr BEFORE any host code can write.
const writeOut = (s: string): void => { process.stdout.write(s.endsWith("\n") ? s : s + "\n"); };
console.log = (...args: unknown[]) => { console.error("[vivim]", ...args); };

const CONSENT_RE = /consent required:?\s*(consent_[0-9a-f]{16})/i;
const DEFAULT_DEADLINE_MS = 5000;

// ---- argv parsing ---------------------------------------------------------------

const VALUE_FLAGS = new Set(["--vault", "--composition", "--recipe", "--deadline", "--to", "--subject", "--body", "--query", "--consent"]);

interface ParsedArgs {
  positionals: string[];
  flags: Record<string, string>;
  json: boolean;
  help: boolean;
}

function parseArgs(argv: string[]): ParsedArgs {
  const positionals: string[] = [];
  const flags: Record<string, string> = {};
  let json = false;
  let help = false;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i] as string;
  if (a === "--json") { json = true; continue; }
  if (a === "-h" || a === "--help") { help = true; continue; }
  if (a === "--no-daemon") { flags["no-daemon"] = "1"; continue; }
    if (VALUE_FLAGS.has(a)) {
      const v = argv[i + 1];
      if (v === undefined || v.startsWith("--")) usageError(`flag ${a} requires a value`);
      flags[a.slice(2)] = v as string;
      i++;
      continue;
    }
    positionals.push(a);
  }
  return { positionals, flags, json, help };
}

function usageError(msg: string): never {
  process.stderr.write(`error: ${msg}\n\n`);
  printHelp(process.stderr);
  process.exit(2);
}

function printHelp(stream: NodeJS.WriteStream): void {
  stream.write(`vivim surface CLI (Ω6) — a root-principal script over the µhost public API

usage:
  bun run surfaces/cli/src/cli.ts <command> [args] [flags]

commands:
  plugins                          list compartments + routed ops of the booted composition
  call <op> [json-args]            invoke a routed op as the root principal; prints the PortResult
  consent <consentId>              grant a pending consent through law.consent.grant@1
  msg send [json | --to --subject --body]
                                   sugar for message.send@1 (needs the email provider in the composition)
  msg list [json-args]             sugar for message.list@1
  msg search <query>               sugar for message.search@1
  status                           router status JSON
  daemon start|stop|status         warm-path daemon for this vault (start reuses a live one)

flags:
  --vault <dir>            vault directory (default: ${DEFAULT_VAULT})
  --composition <file>     composition spec to compile + boot (default: compositions/spine.json)
  --recipe <file>          boot an already-compiled recipe instead of a spec
  --no-daemon              always cold-boot in this process (skip the warm daemon path)
  --deadline <ms>          per-call port deadline (default: ${DEFAULT_DEADLINE_MS})
  --consent <consentId>    (call) grant the consent first, then perform the call — one process
  --json                   machine-readable single JSON document on stdout
  -h, --help               this help

exit codes: 0 ok · 1 refused/failed/boot failed · 2 usage error

The CLI is a v1 root-principal surface: it boots a composition, runs ONE command,
and shuts down (see docs/SURFACES.md).
`);
}

// ---- invocation hints (must be runnable exactly as printed) ----------------------

function invocation0(): string {
  return `bun run ${process.argv[1] ?? "surfaces/cli/src/cli.ts"}`;
}

/** Surface context for printing runnable follow-up commands with the user's own flags. */
interface RunCtx { vault: string; flags: Record<string, string> }

function withSurfaceFlags(ctx: RunCtx, parts: string[]): string {
  const out = [invocation0(), ...parts, "--vault", ctx.vault];
  if (ctx.flags["composition"]) out.push("--composition", ctx.flags["composition"]);
  if (ctx.flags["recipe"]) out.push("--recipe", ctx.flags["recipe"]);
  return out.join(" ");
}

function consentCommand(ctx: RunCtx, consentId: string): string {
  return withSurfaceFlags(ctx, ["consent", consentId]);
}

function consentCallCommand(ctx: RunCtx, consentId: string, op: string, argsRaw?: string): string {
  // JSON.stringify quotes + escapes the args so the printed command is copy-paste runnable
  return withSurfaceFlags(ctx, ["call", op, ...(argsRaw !== undefined ? [JSON.stringify(argsRaw)] : []), "--consent", consentId]);
}

// ---- pretty printers --------------------------------------------------------------

function prettyResult(r: PortResult): string {
  return JSON.stringify(r, null, 2).split("\n").map((l) => "  " + l).join("\n");
}

/** Print one op result (call/msg sugar). Returns the process exit code. */
function printCallResult(ctx: RunCtx, op: string, r: PortResult, ms: number, json: boolean, extra?: Record<string, unknown>): number {
  const consentMatch = !r.ok ? CONSENT_RE.exec(r.detail ?? "") : null;
  if (json) {
    writeOut(JSON.stringify({ op, ms, result: r, ...(consentMatch ? { consentId: consentMatch[1] } : {}), ...(extra ?? {}) }));
  } else if (r.ok) {
    writeOut(`ok ${op} (root principal, ${ms}ms)\n${prettyResult(r)}\n`);
  } else {
    writeOut(`fail ${op} → ${r.error} (${ms}ms)\n  ${r.detail ?? ""}\n`);
  }
  if (consentMatch && !json) {
    const id = consentMatch[1] as string;
    const argsRaw = ctx.flags["__argsRaw"];
    writeOut(`
CONSENT REQUIRED — the law gate wants an explicit user grant for this op.
  consentId: ${id}

  grant it with:
    ${consentCommand(ctx, id)}

  (v1: consent state lives with the booted composition instance. To grant and
   retry in ONE process — recommended for scripts:)
    ${consentCallCommand(ctx, id, op, argsRaw)}
`);
  }
  return r.ok ? 0 : 1;
}

// ---- per-command argument parsing (ALL validation happens before boot) ------------

interface CallCmd { kind: "call"; op: string; payload: unknown; consentId?: string; argsRaw?: string }
interface ConsentCmd { kind: "consent"; consentId: string }
interface MsgCmd { kind: "msg"; sub: "send" | "list" | "search"; payload: unknown; query?: string; consentId?: string }
interface DaemonCmd { kind: "daemon"; sub: "start" | "stop" | "status" }
type Command = CallCmd | ConsentCmd | MsgCmd | DaemonCmd | { kind: "plugins" } | { kind: "status" };

function parseDeadline(f: Record<string, string>): number {
  const raw = f["deadline"];
  if (raw === undefined) return DEFAULT_DEADLINE_MS;
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) usageError(`--deadline must be a positive number (got '${raw}')`);
  return Math.floor(n);
}

function parseJsonArg(raw: string, what: string): unknown {
  try { return JSON.parse(raw); }
  catch (e) { usageError(`${what} does not parse as JSON: ${String(e)}`); }
}

function parseCommand(positionals: string[], flags: Record<string, string>): Command {
  const command = positionals[0] as string;
  const rest = positionals.slice(1);
  // --consent is the one-shot ceremony flag: valid on `call` and `msg send` only
  if (flags["consent"] !== undefined) {
    if (command !== "call" && !(command === "msg" && rest[0] === "send")) {
      usageError("--consent applies to `call <op>` and `msg send` (the one-shot grant + retry ceremony)");
    }
    if (!CONSENT_RE_ID.test(flags["consent"])) {
      usageError(`--consent expects a consent id like consent_<16 hex> (got '${flags["consent"]}')`);
    }
  }
  switch (command) {
    case "plugins":
      if (rest.length > 0) usageError("plugins takes no arguments");
      return { kind: "plugins" };
    case "status":
      if (rest.length > 0) usageError("status takes no arguments");
      return { kind: "status" };
    case "daemon": {
      const sub = rest[0];
      if (sub !== "start" && sub !== "stop" && sub !== "status") usageError("daemon requires a subcommand: daemon start|stop|status");
      if (rest.length > 1) usageError("daemon takes exactly one subcommand");
      return { kind: "daemon", sub };
    }
    case "call": {
      const op = rest[0];
      if (!op) usageError("call requires an op: call <op> [json-args]");
      if (rest.length > 2) usageError("call takes at most: call <op> [json-args]");
      const argsRaw = rest[1];
      const payload = argsRaw !== undefined ? parseJsonArg(argsRaw as string, "json-args") : null;
      return { kind: "call", op, payload, ...(flags["consent"] !== undefined ? { consentId: flags["consent"] } : {}), ...(argsRaw !== undefined ? { argsRaw: argsRaw as string } : {}) };
    }
    case "consent": {
      const consentId = rest[0];
      if (!consentId) usageError("consent requires an id: consent <consentId>");
      if (rest.length > 1) usageError("consent takes exactly one id");
      return { kind: "consent", consentId };
    }
    case "msg": {
      const sub = rest[0];
      if (sub !== "send" && sub !== "list" && sub !== "search") usageError("msg requires a subcommand: msg send|list|search");
      const argRest = rest.slice(1);
      const consentId = flags["consent"] !== undefined ? flags["consent"] : undefined;
      if (sub === "send") {
        if (argRest.length > 1) usageError("msg send takes [json-args] or --to/--subject/--body flags");
        if (argRest[0] !== undefined) return { kind: "msg", sub, payload: parseJsonArg(argRest[0] as string, "msg send json-args"), ...(consentId ? { consentId } : {}) };
        const p: Record<string, string> = {};
        for (const k of ["to", "subject", "body"]) if (flags[k]) p[k] = flags[k] as string;
        if (Object.keys(p).length === 0) usageError("msg send requires json-args or at least one of --to/--subject/--body");
        return { kind: "msg", sub, payload: p, ...(consentId ? { consentId } : {}) };
      }
      if (sub === "list") {
        if (argRest.length > 1) usageError("msg list takes at most [json-args]");
        return { kind: "msg", sub, payload: argRest[0] !== undefined ? parseJsonArg(argRest[0] as string, "msg list json-args") : {} };
      }
      const query = flags["query"] ?? argRest.join(" ");
      if (!query) usageError("msg search requires a query: msg search <query>");
      return { kind: "msg", sub, payload: { q: query }, query };
    }
    default:
      usageError(`unknown command: ${command}`);
  }
}

const CONSENT_RE_ID = /^consent_[0-9a-f]{16}$/;

// ---- command execution (post-boot) ------------------------------------------------

interface CompartmentRow {
  id: string;
  version: string;
  bootPhase: number;
  state: string;
  description: string;
  capabilities: string[];
  routedOps: string[];
}

function compartmentRows(boot: BootView): CompartmentRow[] {
  const st = boot.host.router.status();
  const compartments = st.compartments as Record<string, { state?: string }>;
  const dormant = Array.isArray((st as { dormant?: unknown }).dormant) ? (st as { dormant: string[] }).dormant : [];
  const rows: CompartmentRow[] = [];
  for (const e of [...boot.host.recipe.composition].sort((a, b) => a.bootPhase - b.bootPhase || a.id.localeCompare(b.id))) {
    const m: PluginManifest | undefined = boot.host.manifests.get(e.id);
    rows.push({
      id: e.id,
      version: m?.version ?? "?",
      bootPhase: e.bootPhase,
      state: compartments[e.id]?.state ?? (dormant.includes(e.id) ? "dormant" : "unknown"),
      description: m?.description ?? "",
      capabilities: e.grant.capabilities,
      routedOps: e.grant.contracts,
    });
  }
  return rows;
}

async function cmdPlugins(boot: BootView, json: boolean): Promise<number> {
  const st = boot.host.router.status();
  const rows = compartmentRows(boot);
  if (json) {
    writeOut(JSON.stringify({
      command: "plugins", composition: boot.host.recipe.name, bootSource: boot.report.source,
      compartments: rows, routedOps: [...st.routedOps].sort(), generation: st.generation,
    }));
    return 0;
  }
  writeOut(`composition: ${boot.host.recipe.name} (booted from ${boot.report.source}; pinned in the vault)\n`);
  for (const r of rows) {
    const desc = r.description.length > 96 ? r.description.slice(0, 93) + "..." : r.description;
    writeOut(`\n  ${r.id}  v${r.version}  phase ${r.bootPhase}  [${r.state}]\n`);
    if (desc) writeOut(`    ${desc}\n`);
    if (r.capabilities.length) writeOut(`    capabilities: ${r.capabilities.join(", ")}\n`);
    writeOut(`    ops: ${r.routedOps.join(", ")}\n`);
  }
  writeOut(`\nrouter: ${st.routedOps.length} routed ops · generation ${st.generation}\n`);
  return 0;
}

async function cmdCall(boot: BootView, cmd: CallCmd, ctx: RunCtx, json: boolean): Promise<number> {
  const deadlineMs = parseDeadline(ctx.flags);
  // optional one-shot consent ceremony (same process): grant first, then call.
  if (cmd.consentId) {
    const g = await boot.host.router.callAsRoot("law.consent.grant@1", { consentId: cmd.consentId }, deadlineMs);
    if (!g.ok) {
      if (json) writeOut(JSON.stringify({ op: cmd.op, consentGrant: g }));
      else writeOut(`consent grant failed → ${g.error}: ${g.detail ?? ""}\n${prettyResult(g)}\n`);
      return 1;
    }
    if (!json) writeOut(`consent ${cmd.consentId} granted — calling ${cmd.op}\n`);
  }
  const t0 = Date.now();
  const r = await boot.host.router.callAsRoot(cmd.op, cmd.payload, deadlineMs);
  const ms = Date.now() - t0;
  const flags = { ...ctx.flags, ...(cmd.argsRaw !== undefined ? { __argsRaw: cmd.argsRaw } : {}) };
  return printCallResult({ ...ctx, flags }, cmd.op, r, ms, json, cmd.consentId ? { consentGranted: cmd.consentId } : undefined);
}

async function cmdConsent(boot: BootView, cmd: ConsentCmd, ctx: RunCtx, json: boolean): Promise<number> {
  const deadlineMs = parseDeadline(ctx.flags);
  const r = await boot.host.router.callAsRoot("law.consent.grant@1", { consentId: cmd.consentId }, deadlineMs);
  if (!r.ok && r.detail?.includes("no routed implementation")) {
    writeOut(json
      ? JSON.stringify({ command: "consent", consentId: cmd.consentId, error: "law.consent.grant@1 is not routed in this composition" })
      : `consent: law.consent.grant@1 is not routed in this composition — a vivim.law plugin must own phase 0.\n`);
    return 1;
  }
  if (json) writeOut(JSON.stringify({ command: "consent", consentId: cmd.consentId, result: r }));
  else writeOut(`${r.ok ? "granted" : "REFUSED"} consent ${cmd.consentId} → ${r.error ?? "ok"}\n${prettyResult(r)}\n`);
  return r.ok ? 0 : 1;
}

/** Find the routed op for a base name ("message.send") — @1 preferred, any version otherwise. */
function pickOp(routed: string[], base: string): string | undefined {
  const exact = routed.find((op) => op === `${base}@1`);
  if (exact) return exact;
  return routed.find((op) => op.startsWith(`${base}@`));
}

async function cmdMsg(boot: BootView, cmd: MsgCmd, ctx: RunCtx, json: boolean): Promise<number> {
  const routed = boot.host.router.status().routedOps;
  const messageOps = routed.filter((op) => op.startsWith("message."));
  if (messageOps.length === 0) {
    writeOut(json
      ? JSON.stringify({ command: "msg", sub: cmd.sub, error: "not in composition", detail: "no message.* ops routed — provider.email.file is not in this composition" })
      : `msg: not in composition — no email provider (provider.email.file) is routed here.\n  msg send|list|search need the domain-email pack's message.* contracts in the composition.\n`);
    return 1;
  }
  const base = `message.${cmd.sub}` as const;
  const op = pickOp(routed, base);
  if (!op) {
    writeOut(json
      ? JSON.stringify({ command: "msg", sub: cmd.sub, error: "not routed", detail: `${base}@1 is not routed (routed message ops: ${messageOps.join(", ")})` })
      : `msg ${cmd.sub}: ${base}@1 is not routed (routed message ops: ${messageOps.join(", ")})\n`);
    return 1;
  }
  const deadlineMs = parseDeadline(ctx.flags);
  // one-shot consent ceremony for msg send (same process): grant first, then send
  if (cmd.consentId) {
    const g = await boot.host.router.callAsRoot("law.consent.grant@1", { consentId: cmd.consentId }, deadlineMs);
    if (!g.ok) {
      if (json) writeOut(JSON.stringify({ command: "msg", sub: cmd.sub, op, consentGrant: g }));
      else writeOut(`consent grant failed → ${g.error}: ${g.detail ?? ""}\n${prettyResult(g)}\n`);
      return 1;
    }
    if (!json) writeOut(`consent ${cmd.consentId} granted — sending\n`);
  }
  const t0 = Date.now();
  const r = await boot.host.router.callAsRoot(op, cmd.payload, deadlineMs);
  return printCallResult(ctx, op, r, Date.now() - t0, json, { command: "msg", sub: cmd.sub, ...(cmd.consentId ? { consentGranted: cmd.consentId } : {}) });
}

async function cmdStatus(boot: BootView, json: boolean): Promise<number> {
  // status is JSON by contract (pretty by default, compact with --json)
  const st = boot.host.router.status();
  writeOut(json ? JSON.stringify(st) : JSON.stringify(st, null, 2) + "\n");
  return 0;
}

async function cmdDaemon(cmd: DaemonCmd, ctx: RunCtx, json: boolean): Promise<number> {
  const vault = resolve(ctx.vault);
  if (cmd.sub === "stop") {
    const stopped = await stopDaemon(vault);
    if (json) writeOut(JSON.stringify({ command: "daemon", sub: "stop", stopped }));
    else writeOut(stopped ? `daemon stopped for vault ${vault}\n` : `no live daemon for vault ${vault}\n`);
    return stopped ? 0 : 1;
  }
  if (cmd.sub === "status") {
    const st = await daemonStatus(vault);
    if (json) writeOut(JSON.stringify({ command: "daemon", sub: "status", ...st }));
    else if (!st.live) writeOut(`no live daemon for vault ${vault}\n`);
    else writeOut(`daemon live — pid ${st.info!.pid} port ${st.info!.port} calls ${(st.detail as { callsServed?: number }).callsServed ?? "?"} spec ${st.info!.specPath ?? "(recipe)"}\n`);
    return st.live ? 0 : 1;
  }
  // start: ensure (reuses a live daemon when one answers) and report it
  const specPath = ctx.flags["composition"] ? resolve(ctx.flags["composition"]) : undefined;
  const recipePath = ctx.flags["recipe"] ? resolve(ctx.flags["recipe"]) : undefined;
  const info = await ensureDaemon(vault, { ...(specPath ? { specPath } : {}), ...(recipePath ? { recipePath } : {}) });
  if (!info) {
    if (json) writeOut(JSON.stringify({ command: "daemon", sub: "start", started: false }));
    else process.stderr.write("daemon failed to start — use the command without `daemon start` for a cold boot\n");
    return 1;
  }
  if (json) writeOut(JSON.stringify({ command: "daemon", sub: "start", started: true, port: info.port, pid: info.pid }));
  else writeOut(`daemon live — pid ${info.pid} port ${info.port} for vault ${vault}\n`);
  return 0;
}

// ---- warm path: thin client over a daemon, cold-boot fallback ------------------
// The remote facade satisfies the same SurfaceBoot shape the command handlers
// already program against: router.callAsRoot + router.status + recipe +
// manifests + shutdown. Differences, all documented:
// - status() is a snapshot taken once per invocation (no compartment churns
//   mid-command in any CLI flow — all mutations here are single calls whose
//   results print directly, never re-reads of status).
// - shutdown() is a no-op: the daemon outlives the CLI by design (idle timeout
//   owns its lifetime, `daemon stop` ends it explicitly).
//
// Both SurfaceBoot (cold) and RemoteBoot (warm) satisfy BootView — the command
// handlers program against BootView and never know which path served them.
export interface BootView {
  host: {
    router: {
      callAsRoot(op: string, payload?: unknown, deadlineMs?: number): Promise<PortResult>;
      status(): { compartments: unknown; dormant?: string[]; generation: number; routedOps: string[] };
    };
    recipe: { name: string; composition: Array<{ id: string; bootPhase: number; grant: { capabilities: string[]; contracts: string[] } }> };
    manifests: Map<string, PluginManifest>;
    shutdown(): Promise<void>;
  };
  report: { booted: boolean; source: string; cleanedStaleSwap: boolean };
  specPath: string | null;
}
interface RemoteBoot extends BootView {}

async function tryDaemonBoot(
  vault: string, opts: { composition?: string; recipe?: string; defaultComposition: string },
): Promise<RemoteBoot | null> {
  const vaultDir = resolve(vault);
  // Mirror the cold path's spec resolution exactly (default composition when
  // none is given) so warm and cold always agree on what "the composition" is.
  const specPath = opts.composition ? resolve(opts.composition) : undefined;
  const recipePath = opts.recipe ? resolve(opts.recipe) : undefined;
  const info = await ensureDaemon(vaultDir, {
    ...(specPath ? { specPath } : !recipePath ? { specPath: resolve(opts.defaultComposition) } : {}),
    ...(recipePath ? { recipePath } : {}),
  });
  if (!info) return null;
  const use = await callDaemon(info, "use", {
    ...(specPath ? { specPath } : !recipePath ? { specPath: resolve(opts.defaultComposition) } : {}),
    ...(recipePath ? { recipePath } : {}),
  }, 30000).catch(() => null);
  if (!use || !use.ok) return null;
  const st = await callDaemon(info, "status", {}, 10000).catch(() => null);
  if (!st || !st.ok) return null;
  const v = st.value as {
    router: { compartments: unknown; dormant?: string[]; generation: number; routedOps: string[] };
    recipe: RemoteBoot["host"]["recipe"];
    manifests: Record<string, { version: string; description: string }>;
  };
  const manifests = new Map<string, PluginManifest>();
  for (const [id, m] of Object.entries(v.manifests)) {
    manifests.set(id, { manifestVersion: "1", id, version: m.version, description: m.description } as PluginManifest);
  }
  const snapshot = v.router;
  return {
    host: {
      router: {
        callAsRoot: async (op: string, payload?: unknown, deadlineMs?: number): Promise<PortResult> => {
          const r = await callDaemon(info, "call", { op, payload: payload ?? null, deadlineMs }, (deadlineMs ?? 5000) + 5000);
          if (!r.ok) throw new Error(`daemon call failed: ${r.error}: ${r.detail ?? ""}`);
          return (r.value as { result: PortResult }).result;
        },
        status: () => snapshot,
      },
      recipe: v.recipe,
      manifests,
      shutdown: async () => {},
    },
    report: { booted: true, source: "daemon", cleanedStaleSwap: false },
    specPath: opts.composition ? resolve(opts.composition) : null,
  };
}

// ---- main -------------------------------------------------------------------------

async function main(): Promise<number> {
  const parsed = parseArgs(process.argv.slice(2));
  const { positionals, flags, json, help } = parsed;
  if (help) { printHelp(process.stdout); return 0; }
  if (positionals.length === 0) { printHelp(process.stderr); return 2; }

  // ALL argument validation happens before the composition boots (fail fast).
  const cmd = parseCommand(positionals, flags);
  const vault = flags["vault"] ?? DEFAULT_VAULT;
  const ctx: RunCtx = { vault, flags };

  // `daemon` manages the warm path itself — it never boots a composition.
  if (cmd.kind === "daemon") return cmdDaemon(cmd, ctx, json);

  let boot: BootView;
  if (flags["no-daemon"] === undefined) {
    const warm = await tryDaemonBoot(vault, {
      ...(flags["composition"] ? { composition: flags["composition"] } : {}),
      ...(flags["recipe"] ? { recipe: flags["recipe"] } : {}),
      defaultComposition: DEFAULT_COMPOSITION,
    }).catch(() => null);
    if (warm) {
      process.stderr.write("[vivim] via warm daemon (cold fallback with --no-daemon)\n");
      boot = warm;
    } else {
      boot = await coldBoot();
    }
  } else {
    boot = await coldBoot();
  }

  async function coldBoot(): Promise<SurfaceBoot> {
    try {
      return await bootSurface(vault, {
        ...(flags["composition"] ? { composition: flags["composition"] } : {}),
        ...(flags["recipe"] ? { recipe: flags["recipe"] } : {}),
        defaultComposition: DEFAULT_COMPOSITION,
      });
    } catch (e) {
      if (e instanceof SurfaceBootError) {
        process.stderr.write(JSON.stringify({ booted: false, vault, report: e.report }) + "\n");
        process.exit(1);
      }
      process.stderr.write(`boot failed: ${String(e)}\n`);
      process.exit(1);
    }
  }

  let code: number;
  switch (cmd.kind) {
    case "plugins": code = await cmdPlugins(boot, json); break;
    case "call": code = await cmdCall(boot, cmd, ctx, json); break;
    case "consent": code = await cmdConsent(boot, cmd, ctx, json); break;
    case "msg": code = await cmdMsg(boot, cmd, ctx, json); break;
    case "status": code = await cmdStatus(boot, json); break;
    case "daemon": code = await cmdDaemon(cmd, ctx, json); break;
  }

  await boot.host.shutdown();
  return code;
}

main().then((code) => process.exit(code)).catch((e) => {
  process.stderr.write(`fatal: ${String(e)}\n`);
  process.exit(1);
});

