// omega.notes — the Ω4 existence proof.
// An in-memory notes store: note.write@1 (MUTATION) + note.list@1 (READ) + the
// `note@1` SCHEMA contribution. The manifest requests NO capabilities (self-
// contained demo) — but when a composition GRANTS host.journal.append, writes
// journal through the port (gracefully skipped otherwise).
//
// This file exports the def explicitly (unlike plugin-echo/counter): FakeHost and
// the conformance runner import the def in-process — startPlugin() no-ops safely
// outside a worker (shim), so the same module serves both transports.
import { definePlugin, startPlugin, type PluginContext } from "@vivim/omega-shim";
import type { PortResult } from "@vivim/omega-contracts";

interface Note { id: string; title: string; body: string; createdAt: number }

const store: Note[] = [];
let nextId = 1;

/** Best-effort journal append through the host op — ONLY when the composition granted the cap. */
async function journalWrite(ctx: PluginContext, entry: Record<string, unknown>): Promise<void> {
  if (!ctx.capabilities.includes("host.journal.append")) return; // gracefully skip when not granted
  try {
    const r: PortResult = await ctx.port.call("host.journal.append@1", entry);
    if (!r.ok) ctx.log(`notes: journal append ${r.error} (${r.detail ?? ""}) — write stands, journaling skipped`);
  } catch (e) {
    ctx.log(`notes: journal append failed: ${String(e)} — write stands, journaling skipped`);
  }
}

export const def = definePlugin({
  ops: {
    "note.write@1": async (payload: unknown, ctx: PluginContext, meta: { causationId: string; from: string }) => {
      const p = (payload ?? {}) as { title?: unknown; body?: unknown };
      const title = typeof p.title === "string" ? p.title : "";
      const body = typeof p.body === "string" ? p.body : "";
      if (!title) throw new Error("note.write: title is required"); // → DEGRADED register
      const note: Note = { id: `note_${nextId++}`, title, body, createdAt: Date.now() };
      store.push(note);
      await journalWrite(ctx, { principal: meta.from, op: "note.write@1", noteId: note.id, title, causationId: meta.causationId });
      return { note };
    },
    "note.list@1": () => ({ notes: [...store] }),
  },
});

startPlugin(def);
