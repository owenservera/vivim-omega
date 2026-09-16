// GATE-Ω6 evidence (MCP surface) — the scripted-client proof.
//
// An EXTERNAL client (this test, playing an MCP host like Claude Desktop) spawns
// the real MCP surface as a child process, drives it purely through JSON-RPC 2.0
// lines on its stdin, and reads responses from stdout:
//
//   initialize → notifications/initialized → tools/list → tools/call → ping
//
// The assertions pin the surface's one law: the tool list is generated from the
// BOOTED COMPOSITION'S routed ops, and tools/call maps back to router.callAsRoot
// — so a scripted client can operate the system using ONLY granted ops, and a
// consent-required refusal arrives as an MCP tool error carrying the consentId.
import { describe, test, expect, afterAll } from "bun:test";
import { mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { omegaTmp, retryOsLock } from "@vivim/omega-platform"; // D-372 Phase 3: scratch through the seam

const MCP = join(import.meta.dir, "../src/mcp.ts");
const ECHO_SPEC = join(import.meta.dir, "fixtures/echo.json");
const RISK_SPEC = join(import.meta.dir, "fixtures/risk.json");

function tempVault(name: string): string {
  const v = omegaTmp("omega-mcp-test", `${name}-${Date.now()}-${Math.floor(Math.random() * 1e6)}`);
  rmSync(v, { recursive: true, force: true });
  mkdirSync(v, { recursive: true });
  return v;
}

/**
 * Spawn+boot wait budget. Each test boots a full composition in a child `bun`
 * process — under full-suite parallel load that can exceed Bun's 5s default
 * test timeout. The ceiling rises; no assertion changes (happy path still fast).
 */
const SPAWN_BUDGET_MS = 30_000;

/**
 * Bounded spawn retry (D-368 soak hardening): after hundreds of worker/process
 * spawns in a long suite run, Windows can refuse a spawn (`uv_spawn EUNKNOWN`,
 * handle exhaustion — observed after ~200s soak runs, also on the clean tree).
 * Same precedent as `atomicWrite`'s EPERM retry: back off synchronously and try
 * again; a genuinely broken command still throws after the budget. Test-only.
 */
function spawnServerWithRetry(argv: string[], attempts = 5): ReturnType<typeof Bun.spawn> {
  // Same precedent as `atomicWrite`'s EPERM retry, same shared helper (E-1):
  // back off synchronously and try again; a genuinely broken command still
  // throws after the budget (retryOn always-true: ANY spawn throw retries).
  // Test-only.
  return retryOsLock(() => Bun.spawn(argv, { stdin: "pipe", stdout: "pipe", stderr: "pipe" }), {
    tries: attempts,
    baseMs: 250,
    retryOn: () => true,
  });
}

/** A scripted MCP client over the child process's stdio (line-delimited JSON-RPC). */
class McpClient {
  private buf = "";
  private lines: string[] = [];
  private waiters: Array<(line: string) => void> = [];
  private reqId = 0;
  readonly proc: ReturnType<typeof Bun.spawn>;

  constructor(spec: string, vault: string) {
    this.proc = spawnServerWithRetry(["bun", "run", MCP, "--vault", vault, "--composition", spec]);
    void this.pump();
  }

  private async pump(): Promise<void> {
    const dec = new TextDecoder();
    const reader = (this.proc.stdout as ReadableStream<Uint8Array>).getReader();
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      this.buf += dec.decode(value, { stream: true });
      let i: number;
      while ((i = this.buf.indexOf("\n")) >= 0) {
        const line = this.buf.slice(0, i).trim();
        this.buf = this.buf.slice(i + 1);
        if (!line) continue;
        const w = this.waiters.shift();
        if (w) w(line); else this.lines.push(line);
      }
    }
  }

  private nextLine(): Promise<string> {
    const buffered = this.lines.shift();
    if (buffered !== undefined) return Promise.resolve(buffered);
    return new Promise((resolve) => this.waiters.push(resolve));
  }

  /** Send a request; await and parse ITS response (matched by id). */
  async request(method: string, params?: unknown): Promise<any> {
    const id = ++this.reqId;
    const msg: Record<string, unknown> = { jsonrpc: "2.0", id, method };
    if (params !== undefined) msg.params = params;
    await this.proc.stdin.write(JSON.stringify(msg) + "\n");
    for (;;) {
      const line = await this.nextLine();
      const resp = JSON.parse(line);
      if (resp.id === id) return resp;
      // a response to a different id (e.g. from a prior notification-free call) — keep draining
    }
  }

  /** Send a notification; per JSON-RPC 2.0 it MUST never be answered. */
  async notify(method: string, params?: unknown): Promise<void> {
    const msg: Record<string, unknown> = { jsonrpc: "2.0", method };
    if (params !== undefined) msg.params = params;
    await this.proc.stdin.write(JSON.stringify(msg) + "\n");
  }

  async close(): Promise<number> {
    await this.proc.stdin.end();
    return await this.proc.exited;
  }
}

const clients: McpClient[] = [];
afterAll(async () => { for (const c of clients) { try { await c.close(); } catch {} } });

describe("GATE-Ω6 — MCP surface: scripted client over stdio JSON-RPC (law-stub + echo)", () => {
  test("initialize → protocolVersion 2025-06-18 + tools capability", async () => {
    const c = new McpClient(ECHO_SPEC, tempVault("echo"));
    clients.push(c);
    const resp = await c.request("initialize", { protocolVersion: "2025-06-18", clientInfo: { name: "scripted-test", version: "0" } });
    expect(resp.error).toBeUndefined();
    expect(resp.result.protocolVersion).toBe("2025-06-18");
    expect(resp.result.capabilities.tools).toBeTruthy();
    expect(resp.result.serverInfo.name).toBe("vivim-mcp");
  }, SPAWN_BUDGET_MS);

  test("notifications/initialized produces NO response (JSON-RPC law)", async () => {
    const c = new McpClient(ECHO_SPEC, tempVault("notif"));
    clients.push(c);
    await c.request("initialize", {});
    await c.notify("notifications/initialized", {});
    // the next awaited response must be tools/list's — proving the notification was silent
    const resp = await c.request("tools/list", {});
    expect(resp.result.tools).toBeTruthy();
  }, SPAWN_BUDGET_MS);

  test("tools/list: tools generated FROM the routed ops (echo_ping_1 + law ops present)", async () => {
    const c = new McpClient(ECHO_SPEC, tempVault("tools"));
    clients.push(c);
    await c.request("initialize", {});
    const resp = await c.request("tools/list", {});
    const tools: Array<Record<string, any>> = resp.result.tools;
    const names = tools.map((t) => t.name);
    expect(names).toContain("echo_ping_1");           // op echo.ping@1 → tool echo_ping_1
    expect(names).toContain("law_check_1");           // law ops are routed ops too → tools
    expect(names).toContain("law_registry_1");
    expect(names).toContain("law_consent_grant_1");
    // every tool: object inputSchema + a description that names its op
    for (const t of tools) {
      expect(t.inputSchema.type).toBe("object");
      expect(t.inputSchema.additionalProperties).toBe(true);
      expect(t.description).toMatch(/echo\.ping@1|law\.[a-z.]+@1/);
    }
    // nothing outside the composition's grants is exposed
    expect(names).not.toContain("vault_append_1");
    expect(names).not.toContain("chat_complete_1");
  }, SPAWN_BUDGET_MS);

  test("tools/call echo_ping_1 → the op runs as root; result carries the echo payload", async () => {
    const c = new McpClient(ECHO_SPEC, tempVault("call-echo"));
    clients.push(c);
    await c.request("initialize", {});
    const resp = await c.request("tools/call", { name: "echo_ping_1", arguments: { hello: "mcp" } });
    expect(resp.error).toBeUndefined();
    expect(resp.result.isError).toBeFalsy();
    expect(resp.result.content).toBeArrayOfSize(1);
    const block = resp.result.content[0] as { type: string; text: string };
    expect(block.type).toBe("text");
    const portResult = JSON.parse(block.text);
    expect(portResult.ok).toBe(true);
    expect(portResult.value.payload.hello).toBe("mcp"); // the payload reached the compartment
    expect(portResult.freshness).toBe("CURRENT");
  }, SPAWN_BUDGET_MS);

  test("tools/call an unknown tool → isError true with a readable text", async () => {
    const c = new McpClient(ECHO_SPEC, tempVault("unknown-tool"));
    clients.push(c);
    await c.request("initialize", {});
    const resp = await c.request("tools/call", { name: "vault_append_1", arguments: {} });
    expect(resp.result.isError).toBe(true);
    expect(resp.result.content[0].text).toContain("unknown tool 'vault_append_1'");
    expect(resp.result.content[0].text).toContain("routed ops");
  }, SPAWN_BUDGET_MS);

  test("ping → empty result (liveness without touching the composition)", async () => {
    const c = new McpClient(ECHO_SPEC, tempVault("ping"));
    clients.push(c);
    const resp = await c.request("ping");
    expect(resp.error).toBeUndefined();
    expect(resp.result).toEqual({});
  }, SPAWN_BUDGET_MS);

  test("unknown request method → JSON-RPC -32601; unknown notification stays silent", async () => {
    const c = new McpClient(ECHO_SPEC, tempVault("err"));
    clients.push(c);
    await c.request("initialize", {});
    const resp = await c.request("resources/list", {});
    expect(resp.error).toBeTruthy();
    expect(resp.error.code).toBe(-32601);
    await c.notify("notifications/whatever", {});
    const ok = await c.request("ping");
    expect(ok.result).toEqual({}); // still alive and in order
  }, SPAWN_BUDGET_MS);

  test("malformed JSON line → -32700 parse error; the server keeps serving", async () => {
    const c = new McpClient(ECHO_SPEC, tempVault("parse"));
    clients.push(c);
    await c.request("initialize", {});
    await c.proc.stdin.write("{this is not json\n");
    const line = await c.nextLine();
    const parseErr = JSON.parse(line);
    expect(parseErr.error.code).toBe(-32700);
    const ok = await c.request("ping");
    expect(ok.result).toEqual({});
  }, SPAWN_BUDGET_MS);

  test("stdin EOF → the server shuts the composition down and exits 0", async () => {
    const c = new McpClient(ECHO_SPEC, tempVault("eof"));
    await c.request("initialize", {});
    await c.request("ping");
    const code = await c.close();
    expect(code).toBe(0);
  }, SPAWN_BUDGET_MS);
});

describe("GATE-Ω6 — MCP consent ceremony through tools (real vivim.law + omega.risky)", () => {
  test("refuse → grant via the LAW TOOL → retry succeeds (all through tools/call)", async () => {
    const c = new McpClient(RISK_SPEC, tempVault("consent"));
    clients.push(c);
    await c.request("initialize", {});
    await c.request("tools/list", {});

    // 1. the risky op is a tool, and calling it REFUSES with the consentId in the text
    const refused = await c.request("tools/call", { name: "risky_op_1", arguments: { hello: "world" } });
    expect(refused.result.isError).toBe(true);
    const text = refused.result.content[0].text as string;
    expect(text).toContain("CONSENT REQUIRED");
    const id = text.match(/consent_[0-9a-f]{16}/)?.[0];
    expect(id).toBeTruthy();
    expect(text).toContain("law_consent_grant_1"); // the grant hint names the exact tool

    // 2. grant the consent THROUGH the law tool — the grant is live in this server's booted composition
    const grant = await c.request("tools/call", { name: "law_consent_grant_1", arguments: { consentId: id } });
    expect(grant.result.isError).toBeFalsy();
    const grantResult = JSON.parse(grant.result.content[0].text);
    expect(grantResult.ok).toBe(true);
    expect(grantResult.value.action).toBe("grant");
    expect(grantResult.value.grant.consentId).toBe(id);

    // 3. retry the risky op → allowed, mutated payload comes back
    const retry = await c.request("tools/call", { name: "risky_op_1", arguments: { hello: "world" } });
    expect(retry.result.isError).toBeFalsy();
    const retryResult = JSON.parse(retry.result.content[0].text);
    expect(retryResult.ok).toBe(true);
    expect(retryResult.value.mutated.hello).toBe("world");

    // the whole ceremony happened through tools only — an external scripted
    // client operated the system using ONLY granted ops.
  }, SPAWN_BUDGET_MS);

  test("READ-risk ops stay ungated through the surface (echo works with no consent)", async () => {
    const c = new McpClient(RISK_SPEC, tempVault("read"));
    clients.push(c);
    await c.request("initialize", {});
    const resp = await c.request("tools/call", { name: "echo_ping_1", arguments: { hello: "read-ok" } });
    const pr = JSON.parse(resp.result.content[0].text);
    expect(pr.ok).toBe(true);
    expect(pr.value.payload.hello).toBe("read-ok");
  }, SPAWN_BUDGET_MS);
});
