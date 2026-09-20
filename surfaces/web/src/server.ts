// surfaces/web/src/server.ts — the Ω13 console service: HTTP API + socket.io (path "/", the
// sandbox gateway law) + first-boot seeding so the demo world is instantly alive.
//
//   GET  /api/health     → { ok, composition, uptime, plugins, routedOps }
//   GET  /api/snapshot   → { world, nlclVersion, uptime }
//   POST /api/interpret  { text }      → { interpretation }   (authoritative parse)
//   POST /api/execute    { text }      → ExecuteOutcome (consent refusals as data)
//   POST /api/consent    { consentId }            → { granted }  (D-384: principal is never client-supplied)
//   POST /api/assist     { text }      → { suggestion, sim }  (the opt-in LLM edge)
//
//   WS (socket.io, path "/"): 'journal' (live law-journal events), 'world' (version bumps
//   with the fresh snapshot), 'result' (each execute outcome), 'snapshot' on connect.
import { createServer } from "node:http";
import { basename, join } from "node:path";
import { Server } from "socket.io";
import { bootSurface } from "./boot.ts";
import { createConsoleService, type ExecuteOutcome } from "./api.ts";
import { createLiveStreams } from "./events.ts";
import { NCLL_VERSION } from "@vivim/omega-nlcl-pure";

export interface ConsoleServiceOptions {
  port: number;
  vaultDir: string;
  composition?: string;
  defaultComposition: string;
  seedOnEmpty?: boolean;
  worldPollMs?: number;
}

export interface RunningService {
  port: number;
  close(): Promise<void>;
}

const SEED_MESSAGES: Array<{ from: string; subject: string; body: string }> = [
  { from: "peter.miller@omega.local", subject: "Quarterly report", body: "The numbers are attached. Let me know if the merkle chain checks out." },
  { from: "peter.zhang@omega.local", subject: "Re: infrastructure review", body: "I walked the racks again — the archive tier is running hot." },
  { from: "sarah.chen@omega.local", subject: "Design sync", body: "Drafted the language-layer notes. The symbol families table looks right." },
  { from: "maria.garcia@omega.local", subject: "Welcome", body: "Great to have you on the omega build." },
];

export async function startConsoleService(opts: ConsoleServiceOptions): Promise<RunningService> {
  const boot = await bootSurface(opts.vaultDir, {
    composition: opts.composition,
    defaultComposition: opts.defaultComposition,
  });
  const startedAt = Date.now();
  const service = createConsoleService(boot.host, startedAt);

  // ---- first-boot seeding: an empty world cannot ground "send this to Peter" ----
  if (opts.seedOnEmpty !== false) {
    try {
      const w = await service.world();
      const messageCount = w.entities.filter((e) => e.type === "message").length;
      if (messageCount === 0) {
        for (const seed of SEED_MESSAGES) {
          const r = await boot.host.router.callAsRoot("message.receive@1", seed, 8000);
          if (!r.ok) console.error(`[seed] receive ${seed.from} failed: ${r.error}`);
        }
        console.log(`[seed] ${SEED_MESSAGES.length} demo messages received into the inbox`);
      }
    } catch (e) {
      console.error(`[seed] skipped: ${String(e)}`);
    }
  }

  const httpServer = createServer(async (req, res) => {
    // ---- the platform gateway shim (SYNCHRONOUS, before any await) ----
    // The sandbox law: browser clients connect with io("/?XTransformPort=N") — socket.io
    // handshakes arrive at path "/" with the EIO query. engine.io must live on its own
    // path (path "/" would intercept EVERY route — "Transport unknown"), so we rewrite
    // EIO requests onto the engine path and return early: the engine listener (attached
    // after this one) owns them. Registered BEFORE `new Server(...)` so it runs first.
    const rawUrl = req.url ?? "";
    if (rawUrl.startsWith("/?") && rawUrl.includes("EIO=")) {
      req.url = `/socket.io/${rawUrl.slice(1)}`; // "/?EIO=4…" → "/socket.io/?EIO=4…"
      return; // engine.io (next request listener) responds — never touch this request
    }

    const url = (req.url ?? "").split("?")[0];
    const send = (code: number, body: unknown): void => {
      const text = JSON.stringify(body);
      res.writeHead(code, { "content-type": "application/json", "cache-control": "no-store" });
      res.end(text);
    };
    const readBody = (): Promise<Record<string, unknown>> => new Promise((resolve) => {
      let data = "";
      req.on("data", (chunk) => { data += chunk.toString(); });
      req.on("end", () => {
        try { resolve(data.length === 0 ? {} : JSON.parse(data) as Record<string, unknown>); }
        catch { resolve({}); }
      });
    });

    if (req.method === "GET" && (url === "/api/health" || url === "/health")) {
      const st = boot.host.router.status();
      // Dormant engines are reported, not hidden: "never started" (dormant)
      // reads differently from "started and unwell" (degraded) — D-331.
      const plugins: Record<string, unknown> = { ...(st.compartments as Record<string, unknown>) };
      for (const id of st.dormant) {
        if (!(id in plugins)) plugins[id] = { state: "dormant", delivered: 0, calls: 0, errors: 0, crashes: 0 };
      }
      return send(200, {
        ok: true, composition: boot.specPath ? basename(boot.specPath) : "recipe",
        uptimeMs: service.uptimeMs(), plugins, routedOps: st.routedOps, nlclVersion: NCLL_VERSION,
      });
    }
    if (req.method === "GET" && (url === "/api/snapshot" || url === "/snapshot")) {
      try {
        const world = await service.world();
        return send(200, { world, nlclVersion: NCLL_VERSION, uptimeMs: service.uptimeMs() });
      } catch (e) { return send(503, { ok: false, error: String(e) }); }
    }
    if (req.method === "POST" && (url === "/api/interpret" || url === "/interpret")) {
      const body = await readBody();
      const text = typeof body["text"] === "string" ? body["text"] : "";
      if (text.length === 0) return send(400, { ok: false, error: "text required" });
      try {
        const interpretation = await service.interpretText(text);
        return send(200, { ok: true, interpretation });
      } catch (e) { return send(503, { ok: false, error: String(e) }); }
    }
    if (req.method === "POST" && (url === "/api/execute" || url === "/execute")) {
      const body = await readBody();
      const text = typeof body["text"] === "string" ? body["text"] : "";
      if (text.length === 0) return send(400, { ok: false, error: "text required" });
      try {
        const outcome = await service.execute(text);
        io.emit("result", outcome satisfies ExecuteOutcome);
        broadcastWorld();
        return send(200, { ok: true, outcome });
      } catch (e) { return send(503, { ok: false, error: String(e) }); }
    }
    if (req.method === "POST" && (url === "/api/consent" || url === "/consent")) {
      const body = await readBody();
      const consentId = typeof body["consentId"] === "string" ? body["consentId"] : "";
      if (consentId.length === 0) return send(400, { ok: false, error: "consentId required" });
      try {
        // D-384: the client's `principal` field (if any) is deliberately ignored — a
        // network client must not be able to forge grants naming other principals.
        const r = await service.consent(consentId);
        broadcastWorld();
        return send(200, { ok: r.granted, ...r });
      } catch (e) { return send(503, { ok: false, error: String(e) }); }
    }
    if (req.method === "POST" && (url === "/api/assist" || url === "/assist")) {
      const body = await readBody();
      const text = typeof body["text"] === "string" ? body["text"] : "";
      if (text.length === 0) return send(400, { ok: false, error: "text required" });
      try {
        const r = await service.assist(text);
        return send(200, { ok: true, ...r });
      } catch (e) { return send(503, { ok: false, error: String(e) }); }
    }
    return send(404, { ok: false, error: `no such route: ${req.method} ${url}` });
  });

  // WS upgrades get the same shim — engine.io's upgrade listener is attached AFTER this one.
  httpServer.on("upgrade", (req, socket, head) => {
    const rawUrl = req.url ?? "";
    if (rawUrl.startsWith("/?") && rawUrl.includes("EIO=")) {
      req.url = `/socket.io/${rawUrl.slice(1)}`;
      return; // engine.io takes this upgrade
    }
    socket.destroy();
    void head;
  });

  const io = new Server(httpServer, {
    // engine.io stays on its DEFAULT path ("/socket.io") — see the gateway shim above:
    // the platform's "/" handshakes are rewritten here synchronously. DO NOT set path "/"
    // (it would swallow every HTTP route with "Transport unknown").
    // NO cors option: the browser talks to the GATEWAY (same-origin); engine.io's cors
    // middleware wraps upgrades in an async callback which Bun's native ws implementation
    // cannot survive (the upgrade must complete synchronously). Verified 2026-09.
    pingTimeout: 60000,
    pingInterval: 25000,
  });

  io.on("connection", (socket) => {
    void (async () => {
      try {
        const world = await service.world();
        socket.emit("snapshot", { world, nlclVersion: NCLL_VERSION });
      } catch { /* fresh boot mid-flight */ }
      // D-416 (S3): the connect-time history reads the VAULT (ns law, the
      // fold's read side) — the file tail is retired with the fold.
      try {
        socket.emit("journal", { events: await service.journalHistory(60) });
      } catch { /* vault mid-boot: the tail will stream rows as they land */ }
    })();
    socket.on("interpret", async (payload: { text?: string }, ack?: (r: unknown) => void) => {
      try {
        const text = typeof payload?.text === "string" ? payload.text : "";
        const interpretation = text.length > 0 ? await service.interpretText(text) : null;
        ack?.({ ok: true, interpretation });
      } catch (e) { ack?.({ ok: false, error: String(e) }); }
    });
  });

  const streams = createLiveStreams();
  const stopTail = streams.startJournalTail(io, service);
  const stopPoll = streams.startWorldPoll(io, service, opts.worldPollMs ?? 500);

  /** Immediate world replication after a mutating interaction (the poller stays as the
   *  safety net for asynchronous changes — director ticks, external calls). */
  const broadcastWorld = (): void => {
    void (async () => {
      try { io.emit("world", { world: await service.world() }); } catch { /* mid-boot */ }
    })();
  };

  await new Promise<void>((resolve) => httpServer.listen(opts.port, () => resolve()));
  const boundPort = typeof httpServer.address() === "object" && httpServer.address() !== null
    ? (httpServer.address() as { port: number }).port
    : opts.port;
  console.log(`[Ω13] console service on :${boundPort} — composition ${boot.specPath ? basename(join(boot.specPath, "..")) : "recipe"}, ${boot.host.router.status().routedOps.length} routed ops, nlcl ${NCLL_VERSION}`);

  return {
    port: boundPort,
    close: async () => {
      stopTail();
      stopPoll();
      await new Promise<void>((resolve) => io.close(() => resolve()));
      await new Promise<void>((resolve) => httpServer.close(() => resolve()));
      // keep-alive clients (bun fetch) would otherwise hold the event loop hostage
      httpServer.closeIdleConnections?.();
      httpServer.closeAllConnections?.();
      // D-416 (S3): the audit-chain persistence point — drain the kernel's
      // signed chain into vault ns "audit" BEFORE the host (and its in-memory
      // chain) shuts down. Best-effort: the outcome is logged, close completes.
      const drain = await service.auditDrain();
      if (drain.detail !== undefined) console.error(`[Ω13] audit drain skipped: ${drain.detail}`);
      else console.log(`[Ω13] audit chain drained: ${String(drain.drained ?? 0)} grants → ns audit (head ${String(drain.headHash ?? "?").slice(0, 8)}…)`);
      await boot.host.shutdown().catch(() => {});
    },
  };
}

// CLI entry: bun run surfaces/web/src/server.ts
if (import.meta.main) {
  const args = process.argv.slice(2);
  const portArg = args.find((a) => a.startsWith("--port="));
  const port = portArg ? Number(portArg.split("=")[1]) : 3031;
  const vaultArg = args.find((a) => a.startsWith("--vault="));
  const vaultDir = vaultArg ? vaultArg.split("=")[1] : join(import.meta.dir, "../../../dev-vault/console");
  const compArg = args.find((a) => a.startsWith("--composition="));
  const composition = compArg ? compArg.split("=")[1] : join(import.meta.dir, "../../../compositions/console.json");
  const service = await startConsoleService({ port, vaultDir, composition, defaultComposition: composition });
  const shutdown = (): void => {
    console.log("[Ω13] shutting down");
    void service.close().then(() => process.exit(0));
  };
  process.on("SIGTERM", shutdown);
  process.on("SIGINT", shutdown);
}
