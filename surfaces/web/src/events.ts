// surfaces/web/src/events.ts — the live stream (Ω13): journal tail + world version pushes.
// The journal is the host's append-only evidence (vaultDir/law-journal.jsonl); the world
// version comes from mind.snapshot@1 (deterministic v = events + entities + rules + lexicon).
import { existsSync, readFileSync, statSync, openSync, readSync, closeSync, type Stats } from "node:fs";
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
    const pump = (): void => {
      if (journalStopped) return;
      try {
        if (!existsSync(journalPath)) return;
        const st = statSync(journalPath);
        if (st.size <= offset) { if (st.size < offset) offset = 0; return; }
        const fd = openSync(journalPath, "r");
        try {
          const len = st.size - offset;
          const buf = Buffer.alloc(len);
          readSync(fd, buf, 0, len, offset);
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
        } finally { closeSync(fd); }
      } catch { /* tail is best-effort; never crash the surface */ }
    };
    // initial history batch for late joiners is sent per-connection in server.ts
    pump();
    timer = setInterval(pump, 250);
    return () => { journalStopped = true; if (timer) clearInterval(timer); };
  };

  const startWorldPoll = (io: Server, service: ConsoleService, intervalMs: number): (() => void) => {
    let lastV = -1;
    let stopped = false;
    const timer = setInterval(() => {
      if (stopped) return;
      void (async () => {
        try {
          const w = await service.world();
          if (w.v !== lastV) {
            const prev = lastV;
            lastV = w.v;
            if (prev >= 0) io.emit("world", { world: w });
          }
        } catch { /* mind unavailable mid-boot: skip this tick */ }
      })();
    }, intervalMs);
    return () => { stopped = true; clearInterval(timer); };
  };

  return { startJournalTail, startWorldPoll };
}

/** The recent journal history (bounded) — sent to each new socket. */
export function journalHistory(vaultDir: string, maxLines = 60): JournalLine[] {
  const journalPath = join(vaultDir, "law-journal.jsonl");
  try {
    if (!existsSync(journalPath)) return [];
    const raw = readFileSync(journalPath, "utf-8");
    const lines = raw.split("\n").filter(Boolean);
    return lines.slice(-maxLines).map((l) => {
      try { return JSON.parse(l) as JournalLine; } catch { return null; }
    }).filter(Boolean) as JournalLine[];
  } catch { return []; }
}
