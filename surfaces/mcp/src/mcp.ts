#!/usr/bin/env bun
// surfaces/mcp/src/mcp.ts — the Ω6 MCP surface: a hand-rolled Model Context
// Protocol stdio server (JSON-RPC 2.0 over newline-delimited stdin/stdout — no
// SDK dependency).
//
//   bun run surfaces/mcp/src/mcp.ts --vault <dir> [--composition <file>] [--recipe <file>]
//
// v1 honesty (docs/SURFACES.md): like the CLI, this is an OUTSIDE-compartment
// root-principal script. It boots a composition through the µhost's PUBLIC API
// (compileComposition → bootWithRecovery) and serves MCP clients by issuing
// router.callAsRoot calls. NO private executors and NO surface-side policy.
//
// THE TOOL-GENERATION RULE (the whole point of this surface): the tool list is
// generated FROM THE BOOTED COMPOSITION'S ROUTED OPS — nothing else. Tool name =
// op with "." and "@" mapped to "_" (echo.ping@1 → echo_ping_1); inputSchema is
// a generic object shape whose `arguments` are passed verbatim as the op
// payload. tools/call maps the name back to the op and runs it as the root
// principal. If the composition didn't grant it, it isn't a tool — an external
// client can only ever operate the system using granted ops.
//
// Consent-required refusals surface as MCP tool errors: isError: true with the
// consentId (and how to grant it) in the text content.
import { join } from "node:path";
import { surfaceOpMeta } from "@vivim/omega-contracts";
import type { PluginManifest, PortResult, SurfaceOpMeta } from "@vivim/omega-contracts";
import { bootSurface, SurfaceBootError } from "./boot.ts";
import type { SurfaceBoot } from "./boot.ts";

const REPO_ROOT = join(import.meta.dir, "..", "..", "..");
const DEFAULT_COMPOSITION = join(REPO_ROOT, "compositions", "spine.json");
const PROTOCOL_VERSION = "2025-06-18";
const SERVER_INFO = { name: "vivim-mcp", version: "0.1.0" } as const;
const CALL_DEADLINE_MS = 10_000;
const CONSENT_RE = /consent required:?\s*(consent_[0-9a-f]{16})/i;

// ---- the surface owns its stdio -------------------------------------------------
// stdout IS the protocol stream: nothing else may ever write to it. Host and
// compartment log lines are diagnostics → stderr (routed BEFORE any host code).
const writeProtocol = (obj: unknown): void => { process.stdout.write(JSON.stringify(obj) + "\n"); };
console.log = (...args: unknown[]) => { console.error("[vivim-mcp]", ...args); };

// ---- JSON-RPC 2.0 shapes ----------------------------------------------------------

interface JsonRpcRequest { jsonrpc?: string; id?: string | number | null; method: string; params?: unknown }
type JsonRpcResponse =
  | { jsonrpc: "2.0"; id: string | number | null; result: unknown }
  | { jsonrpc: "2.0"; id: string | number | null; error: { code: number; message: string } };

const rpcResult = (id: string | number | null, result: unknown): JsonRpcResponse => ({ jsonrpc: "2.0", id, result });
const rpcError = (id: string | number | null, code: number, message: string): JsonRpcResponse => ({ jsonrpc: "2.0", id, error: { code, message } });

// ---- tool naming: op ↔ tool ------------------------------------------------------

/** op "echo.ping@1" → tool "echo_ping_1" (MCP tool names are [a-zA-Z0-9_-]). */
function opToToolName(op: string): string {
  return op.replaceAll(".", "_").replaceAll("@", "_");
}

// D-359: the op → {owner plugin, declared risk} derivation moved to contracts
// (`surfaceOpMeta`, type `SurfaceOpMeta`) when chat resolution became the third
// consumer of the same derivation (A2: one source, N consumers — never a third
// binding). This module imports both; the local duplicate is gone.

function toolDescription(op: string, meta: SurfaceOpMeta | undefined): string {
  return `VIVIM routed op ${op} — owner ${meta?.pluginId ?? "?"}, declared risk ${meta?.risk ?? "READ"}. ` +
    "Calling it runs router.callAsRoot; the tool arguments are the op payload verbatim.";
}

const genericInputSchema = (op: string) => ({
  type: "object" as const,
  properties: {},
  additionalProperties: true,
  description: `Arguments are the raw JSON payload for ${op} (the op's own contract defines the fields).`,
});

// ---- the server -------------------------------------------------------------------

interface McpServerDeps { boot: SurfaceBoot; opMeta: Map<string, SurfaceOpMeta>; toolToOp: Map<string, string> }

async function handleLine(deps: McpServerDeps, line: string): Promise<void> {
  let msg: JsonRpcRequest;
  try {
    msg = JSON.parse(line) as JsonRpcRequest;
  } catch (e) {
    writeProtocol(rpcError(null, -32700, `parse error: ${String(e)}`));
    return;
  }
  if (typeof msg !== "object" || msg === null || typeof msg.method !== "string") {
    writeProtocol(rpcError(null, -32600, "invalid request: expected {jsonrpc, method, params?}"));
    return;
  }
  // JSON-RPC 2.0: a message without an id is a notification — NEVER answer it.
  const isNotification = msg.id === undefined || msg.id === null;
  let resp: JsonRpcResponse | null;
  try {
    resp = await dispatch(deps, msg);
  } catch (e) {
    resp = rpcError(msg.id ?? null, -32603, `internal error: ${String(e)}`);
  }
  if (resp !== null && !isNotification) writeProtocol(resp);
}

async function dispatch(deps: McpServerDeps, msg: JsonRpcRequest): Promise<JsonRpcResponse | null> {
  switch (msg.method) {
    case "initialize":
      return rpcResult(msg.id ?? null, {
        protocolVersion: PROTOCOL_VERSION,
        capabilities: { tools: { listChanged: false } },
        serverInfo: SERVER_INFO,
        instructions:
          `VIVIM Ω6 MCP surface. Tools are generated from the booted composition ` +
          `'${deps.boot.host.recipe.name}' routed ops (boot source: ${deps.boot.report.source}). ` +
          "Nothing outside the composition's grants is callable through this server.",
      });
    case "ping":
      return rpcResult(msg.id ?? null, {});
    case "tools/list":
      return rpcResult(msg.id ?? null, { tools: buildTools(deps) });
    case "tools/call":
      return rpcResult(msg.id ?? null, await callTool(deps, msg.params));
    case "notifications/initialized":
    case "notifications/cancelled":
      return null; // notifications are never answered
    default:
      if (msg.method.startsWith("notifications/")) return null;
      return rpcError(msg.id ?? null, -32601, `method not found: ${msg.method}`);
  }
}

function buildTools(deps: McpServerDeps): Array<Record<string, unknown>> {
  const tools: Array<Record<string, unknown>> = [];
  for (const [name, op] of [...deps.toolToOp.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    tools.push({
      name,
      description: toolDescription(op, deps.opMeta.get(op)),
      inputSchema: genericInputSchema(op),
    });
  }
  return tools;
}

async function callTool(deps: McpServerDeps, params: unknown): Promise<Record<string, unknown>> {
  const p = (typeof params === "object" && params !== null ? params : {}) as { name?: unknown; arguments?: unknown };
  if (typeof p.name !== "string") {
    return contentError(`tools/call requires {name: string, arguments?: object} (got name: ${JSON.stringify(p.name)})`);
  }
  if (p.arguments !== undefined && (typeof p.arguments !== "object" || p.arguments === null)) {
    return contentError(`tools/call arguments must be a JSON object (got ${typeof p.arguments})`);
  }
  const op = deps.toolToOp.get(p.name);
  if (!op) {
    return contentError(`unknown tool '${p.name}' — tools are generated from this composition's routed ops (see tools/list)`);
  }
  const r: PortResult = await deps.boot.host.router.callAsRoot(op, p.arguments ?? {}, CALL_DEADLINE_MS);
  const text = toolResultText(deps, op, r);
  return { content: [{ type: "text", text }], isError: !r.ok };
}

function contentError(text: string): Record<string, unknown> {
  return { content: [{ type: "text", text }], isError: true };
}

function toolResultText(deps: McpServerDeps, op: string, r: PortResult): string {
  const consentMatch = !r.ok ? CONSENT_RE.exec(r.detail ?? "") : null;
  if (consentMatch) {
    const id = consentMatch[1] as string;
    const grantTool = deps.toolToOp.get("law_consent_grant_1");
    const grantHint = grantTool
      ? `tools/call law_consent_grant_1 with {"consentId":"${id}"} (this server holds the booted composition, so the grant is live here)`
      : `grant consent ${id} through this composition's law plugin`;
    const ruleLine = !r.ok && r.refusal?.rule ? `\nrule: ${r.refusal.rule}` : "";
    return (
      `CONSENT REQUIRED — the law gate refused ${op}.\n` +
      `consentId: ${id}${ruleLine}\n\n` +
      `Grant it: ${grantHint}\n\n` +
      `PortResult:\n${JSON.stringify(r, null, 2)}`
    );
  }
  return JSON.stringify(r, null, 2);
}

// ---- stdin line pump (serialized FIFO request handling) ---------------------------

async function serveLines(deps: McpServerDeps, onEnd: () => void): Promise<void> {
  return new Promise<void>((resolve) => {
    let buf = "";
    // serialize handling: responses are written in request arrival order
    let queue: Promise<void> = Promise.resolve();
    const enqueue = (line: string) => {
      // a failed handler must never poison the queue — keep serving
      queue = queue.then(() => handleLine(deps, line)).catch((e) => console.error("[vivim-mcp] handler failed:", e));
    };
    const onChunk = (chunk: unknown) => {
      const text = typeof chunk === "string" ? chunk : new TextDecoder().decode(chunk as Uint8Array);
      buf += text;
      let i: number;
      while ((i = buf.indexOf("\n")) >= 0) {
        const line = buf.slice(0, i).trim();
        buf = buf.slice(i + 1);
        if (line) enqueue(line);
      }
    };
    process.stdin.setEncoding?.("utf8");
    process.stdin.on("data", onChunk);
    process.stdin.on("end", () => { onEnd(); resolve(); });
    process.stdin.on("error", () => { onEnd(); resolve(); });
    process.stdin.resume?.();
  });
}

// ---- main -------------------------------------------------------------------------

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  const arg = (name: string): string | undefined => {
    const i = argv.indexOf(`--${name}`);
    if (i === -1) return undefined;
    const v = argv[i + 1];
    return v && !v.startsWith("--") ? v : undefined;
  };
  const vault = arg("vault") ?? "dev-vault";
  const composition = arg("composition");
  const recipe = arg("recipe");

  let boot: SurfaceBoot;
  try {
    boot = await bootSurface(vault, {
      ...(composition ? { composition } : {}),
      ...(recipe ? { recipe } : {}),
      defaultComposition: DEFAULT_COMPOSITION,
    });
  } catch (e) {
    const reason = e instanceof SurfaceBootError ? e.report.reason : String(e);
    process.stderr.write(JSON.stringify({ booted: false, vault, reason }) + "\n");
    process.exit(1);
  }

  // tools = routed ops of the booted composition (THE rule; build once).
  // The op-meta derivation is the SHARED contracts one (D-359/A2).
  const opMeta = surfaceOpMeta(boot.host.manifests);
  const toolToOp = new Map<string, string>();
  for (const op of boot.host.router.status().routedOps) toolToOp.set(opToToolName(op), op);
  const deps: McpServerDeps = { boot, opMeta, toolToOp };

  let exiting = false;
  const shutdown = async (): Promise<void> => {
    if (exiting) return;
    exiting = true;
    try { await boot.host.shutdown(); } catch { /* best-effort */ }
    process.exit(0);
  };
  process.on("SIGINT", () => void shutdown());
  process.on("SIGTERM", () => void shutdown());

  // stdin EOF = client disconnected: shut the composition down cleanly, exit 0.
  await serveLines(deps, () => { void shutdown(); });
  await shutdown();
}

main().catch((e) => {
  process.stderr.write(`fatal: ${String(e)}\n`);
  process.exit(1);
});
