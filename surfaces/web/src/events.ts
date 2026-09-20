// surfaces/web/src/events.ts — the live stream (Ω13): journal tail + world version pushes.
// D-416 (S3, the fold): law's narrative journal rows live in vault ns "law" — the
// console relay reads the VAULT now, not the sidecar file. One query per tick over
// the journal id family (id + rev + cid — light columns), getmany for ONLY the new
// bodies; cost tracks what is shown, the D-387 discipline carried over. The world
// version still comes from mind.snapshot@1 (deterministic v = events + entities + rules + lexicon).
//
// D-387 (2026-09-18 external performance review #1/#5/#6), still in force:
//   · startWorldPoll skips its tick entirely when no socket is connected, checks the
//     version through a BODILESS snapshot (includeBodies:false — v is count-derived),
//     and only pays for the full payload when the version actually changed.
//   · pump() never overlaps ticks (in-flight guard); every read is async (no
//     synchronous filesystem work on the event loop).
//   · journalHistory fetches ONLY the last `maxLines` bodies (one query for the id
//     family + one bounded getmany) — never the journal's lifetime bytes.
import type { PortResult } from "@vivim/omega-contracts";
import type { Server } from "socket.io";
import type { ConsoleService } from "./api.ts";

export type JournalLine = { ts: number } & Record<string, unknown>;

/** The root-principal call adapter (router.callAsRoot shaped) — the pure readers
 *  below are testable with a fake over seeded data, no live host required. */
export type RootCall = (op: string, payload?: unknown) => Promise<PortResult>;

/** Vault ns owning law's narrative journal rows since the D-416 fold (the ns
 *  exists: the forbidden overlay D-325 lives here too). */
const JOURNAL_NS = "law";
/** The fold's id family — ids are <prefix><boot36-padded>-<seq36-padded>, so
 *  lexicographic order IS chronological order (within and across boots). */
const JOURNAL_ID_PREFIX = "journal:";
/** getmany page — the vault's own bound is 512 (D-387); page at it, never over. */
const GETMANY_PAGE = 512;

interface QueryRow { id?: unknown }
interface GetRow { id?: unknown; found?: unknown; data?: unknown }

/** The journal id family, sorted chronologically (id sort — padded by construction). */
export async function journalIds(call: RootCall): Promise<string[]> {
  const r = await call("vault.query@1", { ns: JOURNAL_NS, filter: { idPrefix: JOURNAL_ID_PREFIX } });
  if (!r.ok) throw new Error(`vault.query@1 ${r.error}: ${r.detail ?? ""}`);
  const rows = Array.isArray(r.value) ? (r.value as QueryRow[]) : [];
  const ids = rows.map((row) => row.id).filter((id): id is string => typeof id === "string");
  ids.sort(); // padded boot-seq: lexicographic == chronological
  return ids;
}

/** Fetch the bodies for the given journal ids, paged under the getmany bound.
 *  Rows come back in request order; missing ids are skipped honestly. */
async function journalBodies(call: RootCall, ids: string[]): Promise<JournalLine[]> {
  const out: JournalLine[] = [];
  for (let i = 0; i < ids.length; i += GETMANY_PAGE) {
    const page = ids.slice(i, i + GETMANY_PAGE);
    const r = await call("vault.getmany@1", { ns: JOURNAL_NS, ids: page });
    if (!r.ok) throw new Error(`vault.getmany@1 ${r.error}: ${r.detail ?? ""}`);
    for (const row of (Array.isArray(r.value) ? (r.value as GetRow[]) : [])) {
      if (row.found === true && typeof row.data === "object" && row.data !== null) {
        out.push(row.data as JournalLine);
      }
    }
  }
  return out;
}

/** The tail's one tick: new journal rows since `seen` (ids added to the set on
 *  success — a failed fetch retries the same rows next tick, never drops them). */
export async function journalTail(call: RootCall, seen: Set<string>): Promise<JournalLine[]> {
  const ids = (await journalIds(call)).filter((id) => !seen.has(id));
  if (ids.length === 0) return [];
  const rows = await journalBodies(call, ids);
  for (const id of ids) seen.add(id);
  return rows;
}

/** The recent journal history (bounded): the last `maxLines` rows — one query
 *  for the id family + getmany for ONLY those ids' bodies. */
export async function journalHistory(call: RootCall, maxLines = 60): Promise<JournalLine[]> {
  const ids = await journalIds(call);
  if (ids.length === 0) return [];
  return journalBodies(call, ids.slice(-maxLines));
}

export interface LiveStreams {
  /** tail the vault's ns-law journal rows and emit 'journal' events; returns a stop() */
  startJournalTail(io: Server, service: ConsoleService): () => void;
  /** poll the world version; on change broadcast 'world' with the fresh snapshot */
  startWorldPoll(io: Server, service: ConsoleService, intervalMs: number): () => void;
}

export function createLiveStreams(): LiveStreams {
  let journalStopped = false;

  const startJournalTail = (io: Server, service: ConsoleService): (() => void) => {
    // D-416 (S3): the fold's read side — one light query per tick (the journal
    // id family), getmany only for NEW bodies, emit them as 'journal' events.
    // Best-effort per tick: a vault hiccup (mid-boot, gone) skips the tick,
    // never crashes the surface; the unseen ids retry next tick.
    const seen = new Set<string>();
    let timer: ReturnType<typeof setInterval> | null = null;
    let pumping = false;
    const pump = async (): Promise<void> => {
      if (journalStopped || pumping) return;
      pumping = true;
      try {
        const events = await service.journalTail(seen);
        if (events.length > 0) io.emit("journal", { events });
      } catch { /* vault unavailable this tick — skip, retry next tick */ }
      finally { pumping = false; }
    };
    void pump();
    timer = setInterval(() => { void pump(); }, 250);
    return () => { journalStopped = true; if (timer) clearInterval(timer); };
  };

  const startWorldPoll = (io: Server, service: ConsoleService, intervalMs: number): (() => void) => {
    let lastV = -1;
    let stopped = false;
    const timer = setInterval(() => {
      if (stopped) return;
      // D-387: nobody watching → no vault reads at all. The poll previously ran an
      // uncapped N+1 read pattern every tick for the lifetime of the server.
      if (io.sockets.sockets.size === 0) return;
      void (async () => {
        try {
          // version check WITHOUT bodies (v is evidence-count-derived — same bumps detected)
          const light = await service.worldLight();
          if (light.v === lastV) return;
          const prev = lastV;
          lastV = light.v;
          if (prev >= 0) {
            // changed → fetch the full payload for the emit (bodies included)
            const w = await service.world();
            io.emit("world", { world: w });
          }
        } catch { /* mind unavailable mid-boot: skip this tick */ }
      })();
    }, intervalMs);
    return () => { stopped = true; clearInterval(timer); };
  };

  return { startJournalTail, startWorldPoll };
}
