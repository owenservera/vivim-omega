// vivim.law — registry.ts
// The lifecycle state map + journal replay. On init the registry reads the journal
// file named by ctx.config.journalPath (line-delimited JSON; the host appends the
// same file the law journals to) and rebuilds the known event history. On every
// law.registry@1 call it re-reads the journal live and merges what it has observed
// in-process. This module is the ONE read-only filesystem touch in the plugin
// (sanctioned by the Ω1 spec: state persists via the law journal, never a side file).
// D-416 (S3, the fold): law's narrative rows ride vault ns "law" wherever the fold
// is active — the op handler feeds them here by id (absorbVaultRow); this module
// stays port-free and pure (the import-safe split the plugin's other modules keep).
import { existsSync, readFileSync } from "node:fs";
import type { LifecycleState } from "@vivim/omega-contracts";

/** Principals that are never composition plugin ids (the µhost itself / the gate / wildcard). */
export const RESERVED_PRINCIPALS = new Set(["root", "µhost-gate", "host", "all", ""]);

export interface PluginObservation {
  id: string;
  state: LifecycleState;
  firstSeen: number;
  lastSeen: number;
  seenVia: string[];
}

export interface ForbiddenOverlayStatus {
  persistence: boolean; // vault caps granted (agent.json) vs memory-only (law.json)
  loaded: boolean;      // overlay reloaded from the vault (or memory-only, trivially true)
  count: number;        // live principals with a non-empty forbidden list
  lastError?: string;   // last reload failure, when present (loud, never silent)
}

export interface RegistrySnapshot {
  plugins: string[]; // sorted composition ids seen (reserved principals excluded)
  events: number;    // journal events in known history (file replay + live absorb + vault journal rows, D-416)
  consents: number;  // active consent grants (injected by the caller)
  generation: number;// law state generation (injected by the caller)
  replayed: number;  // events replayed at init (the transition file)
  observed: number;  // in-process law op events since boot (not journal-derived)
  states: Record<string, PluginObservation>;
  forbidden?: ForbiddenOverlayStatus; // D-325 overlay durability state (present when the caller reports it)
}

type JournalEntry = Record<string, unknown>;

function readJournalLines(path: string): JournalEntry[] {
  try {
    if (!path || !existsSync(path)) return [];
    const text = readFileSync(path, "utf-8");
    const out: JournalEntry[] = [];
    for (const line of text.split("\n")) {
      const t = line.trim();
      if (!t) continue;
      try {
        out.push(JSON.parse(t) as JournalEntry);
      } catch {
        // truncated/partial tail line (crash window) — counted as unreadable, skipped
      }
    }
    return out;
  } catch {
    return []; // journal read is best-effort; the registry degrades to memory-only
  }
}

export class LawRegistry {
  private observations = new Map<string, PluginObservation>();
  private journalPath = "";
  private replayed = 0;
  private absorbed = 0;   // journal events absorbed since boot (live re-reads)
  private cursor = 0;     // lines already absorbed (replay + live)
  private observed = 0;   // in-process law events (ops + decisions seen, not yet journaled)
  private selfId = "";
  // D-416 (S3): the fold's read-side state — vault journal rows absorbed by id
  // (the query returns every journal id every call; the seen-set makes absorb
  // idempotent, the counter feeds the snapshot's events field).
  private vaultSeen = new Set<string>();
  private vaultAbsorbed = 0;

  /** Init: replay the journal (when a path is configured) and register ourselves. */
  init(journalPath: unknown, selfId: string): { replayed: number; journalPath: string } {
    this.selfId = selfId;
    this.journalPath = typeof journalPath === "string" ? journalPath : "";
    this.observe(selfId, "active", "self");
    if (!this.journalPath) return { replayed: 0, journalPath: "" };
    const lines = readJournalLines(this.journalPath);
    this.replayed = lines.length;
    this.cursor = lines.length;
    for (const e of lines) this.absorbEntry(e, "journal-replay");
    return { replayed: this.replayed, journalPath: this.journalPath };
  }

  /** Record a plugin id we have seen (id, state, provenance). Reserved ids ignored. */
  observe(id: unknown, state: LifecycleState, via: string): void {
    if (typeof id !== "string" || RESERVED_PRINCIPALS.has(id)) return;
    const now = Date.now();
    const rec = this.observations.get(id);
    if (rec) {
      rec.lastSeen = now;
      rec.state = state;
      if (!rec.seenVia.includes(via)) rec.seenVia.push(via);
    } else {
      this.observations.set(id, { id, state, firstSeen: now, lastSeen: now, seenVia: [via] });
    }
  }

  /** One journal event: count it and harvest the plugin ids it names. */
  absorbEntry(e: JournalEntry, via: string): void {
    this.observe(e["principal"], "active", via);
    this.observe(e["scope"], "active", via);
    this.observe(e["pluginId"], "active", via);
  }

  /** In-process law event (op served / decision made) — counted even when not journaled. */
  countEvent(): void {
    this.observed++;
  }

  /** D-416 (S3): has this vault journal row id already been absorbed? (The
   *  query returns every journal id on every call — the seen-set is the diff.) */
  vaultRowSeen(id: unknown): boolean {
    return typeof id === "string" && this.vaultSeen.has(id);
  }

  /** D-416 (S3): absorb one vault journal row by id (the fold's read-side
   *  merge). Idempotent: an already-seen id is a no-op. Returns true when the
   *  row was new — the caller's paging uses it only for accounting. */
  absorbVaultRow(id: string, e: JournalEntry): boolean {
    if (this.vaultSeen.has(id)) return false;
    this.vaultSeen.add(id);
    this.vaultAbsorbed++;
    this.absorbEntry(e, "vault-journal");
    return true;
  }

  /** Live re-read: absorb journal lines written since our cursor. Returns journal-derived event total. */
  refresh(): number {
    if (!this.journalPath) return this.replayed + this.absorbed;
    const lines = readJournalLines(this.journalPath);
    if (lines.length < this.cursor) this.cursor = 0; // journal truncated/rotated — re-absorb
    for (let i = this.cursor; i < lines.length; i++) this.absorbEntry(lines[i]!, "journal-live");
    if (lines.length > this.cursor) this.absorbed += lines.length - this.cursor;
    this.cursor = Math.max(this.cursor, lines.length);
    return this.replayed + this.absorbed;
  }

  snapshot(consents: number, generation: number, forbidden?: ForbiddenOverlayStatus): RegistrySnapshot {
    const events = this.refresh() + this.vaultAbsorbed; // file rows + vault rows — both are the journal now (D-416)
    const states: Record<string, PluginObservation> = {};
    for (const [id, o] of this.observations) states[id] = { ...o, seenVia: [...o.seenVia] };
    return {
      plugins: [...this.observations.keys()].sort(),
      events,
      consents,
      generation,
      replayed: this.replayed,
      observed: this.observed,
      states,
      ...(forbidden !== undefined ? { forbidden } : {}),
    };
  }
}
