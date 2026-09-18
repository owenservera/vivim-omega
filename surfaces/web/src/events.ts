// surfaces/web/src/events.ts — the live stream (Ω13): journal tail + world version pushes.
// The journal is the host's append-only evidence (vaultDir/law-journal.jsonl); the world
// version comes from mind.snapshot@1 (deterministic v = events + entities + rules + lexicon).
//
// D-387 (2026-09-18 external performance review #1/#5/#6):
//   · startWorldPoll skips its tick entirely when no socket is connected, checks the
//     version through a BODILESS snapshot (includeBodies:false — v is count-derived),
//     and only pays for the full payload when the version actually changed.
//   · pump() uses fs.promises (no synchronous filesystem work on the event loop);
//     an in-flight guard prevents tick overlap.
//   · journalHistory reads BACKWARD in bounded chunks — cost tracks what is shown
//     (last N lines), not the lifetime size of the append-only journal.
import { existsSync, statSync, openSync, readSync, closeSync, type Stats } from "node:fs";
import { stat, open } from "node:fs/promises";
import { join } from "node:path";
import type { Server } from "socket.io";
import type { ConsoleService } from "./api.ts";

export type JournalLine = { ts: number } & Record<string, unknown>;

export interface LiveStreams {
  /** tail the journal file and emit 'journal' events; returns a stop() */
  startJournalTail(io: Server, vaultDir: string): () => void;
  /** poll the world version; on change broadcast 'world' with the fresh snapshot */
  startWorldPoll(io: Server, service: ConsoleService, intervalMs: number): () => void;
}

export function createLiveStreams(): LiveStreams {
  let journalStopped = false;

  const startJournalTail = (io: Server, vaultDir: string): (() => void) => {
    const journalPath = join(vaultDir, "law-journal.jsonl");
    let offset = 0;
    if (existsSync(journalPath)) {
      const st: Stats = statSync(journalPath);
      offset = Math.max(0, st.size - 8192); // start from the last ~8KB so the console has history
    }
    let timer: ReturnType<typeof setInterval> | null = null;
    let pumping = false;
    const pump = async (): Promise<void> => {
      if (journalStopped || pumping) return;
      pumping = true;
      try {
        let st: Stats;
        try { st = await stat(journalPath); } catch { return; } // no journal yet — nothing to tail
        if (st.size <= offset) { if (st.size < offset) offset = 0; return; }
        const fh = await open(journalPath, "r");
        try {
          const len = st.size - offset;
          const buf = Buffer.alloc(len);
          await fh.read(buf, 0, len, offset);
          offset += len;
          const text = buf.toString("utf-8");
          // only complete lines; a trailing partial stays for the next pump
          const lines = text.split("\n").filter(Boolean);
          const complete = text.endsWith("\n");
          const usable = complete ? lines : lines.slice(0, -1);
          if (!complete) offset -= Buffer.byteLength(lines[lines.length - 1] ?? "", "utf-8") + 1;
          const events: JournalLine[] = [];
          for (const line of usable) {
            try { events.push(JSON.parse(line) as JournalLine); } catch { /* malformed tail byte: skip */ }
          }
          if (events.length > 0) io.emit("journal", { events });
        } finally { await fh.close(); }
      } catch { /* tail is best-effort; never crash the surface */ }
      finally { pumping = false; }
    };
    // initial history batch for late joiners is sent per-connection in server.ts
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

/** The recent journal history (bounded) — sent to each new socket.
 *  D-387 (perf review #5): reads BACKWARD in bounded chunks instead of loading the
 *  whole append-only journal (never rotated, so the old readFileSync scaled with the
 *  journal's LIFETIME size on every socket connect). Cost now tracks the last
 *  `maxLines` complete lines plus one boundary chunk. */
export function journalHistory(vaultDir: string, maxLines = 60): JournalLine[] {
  const journalPath = join(vaultDir, "law-journal.jsonl");
  try {
    if (!existsSync(journalPath)) return [];
    const st = statSync(journalPath);
    if (st.size === 0) return [];
    const CHUNK = 16384;
    let pos = st.size;
    let tail = Buffer.alloc(0);
    // walk backward until the accumulated tail holds more than maxLines newlines
    while (pos > 0) {
      const len = Math.min(CHUNK, pos);
      pos -= len;
      const buf = Buffer.alloc(len);
      const fd = openSync(journalPath, "r");
      try { readSync(fd, buf, 0, len, pos); } finally { closeSync(fd); }
      tail = Buffer.concat([buf, tail]); // buffer concat (not string) — a chunk boundary must never split a UTF-8 char
      let nl = 0;
      for (let i = tail.length - 1; i >= 0 && nl <= maxLines; i--) if (tail[i] === 0x0a) nl++;
      if (nl > maxLines) break;
    }
    let lines = tail.toString("utf-8").split("\n");
    // not at BOF → the first element is a (possibly partial) boundary fragment: drop it
    if (pos > 0 && lines.length > 0) lines = lines.slice(1);
    return lines.filter((l) => l.length > 0).slice(-maxLines).map((l) => {
      try { return JSON.parse(l) as JournalLine; } catch { return null; }
    }).filter(Boolean) as JournalLine[];
  } catch { return []; }
}
