// surfaces/daemon/src/cache.ts — the content-hash compile cache (D-330).
//
// The daemon's per-reboot CPU is dominated by compile (contentHashDir rehash
// of every plugin source + resign + manifest rewrite) and by boot verify
// (which rehashes AGAIN). This cache removes the compile half on verified
// hits: a map from spec identity → verified per-entry content hashes (+ the
// mtime snapshot they were verified against) → the compiled buildDir.
//
// Lookup chain (cheapest first):
//   miss (unknown spec) → compile, store.
//   spec known + mtime restat matches → HIT, no rehash: reuse buildDir.
//   spec known + restat differs → rehash entries: all match → HIT (touch
//     without change); some match → PARTIAL (matched entries named in stats
//     for the future pool-backed partial boot); none → MISS. Recompile, store.
//
// What a hit SKIPS: compileComposition (rehash + resign + rewrite).
// What a hit NEVER skips: boot verify (fail-closed rehash inside
// bootWithRecovery) and worker spawn (fresh isolates — reusing workers across
// boots would break B2 compartments-never-share-a-heap and bake stale
// capability tokens). "Mint tokens only" is the per-hit fresh crypto; the
// falsifier is behavioral: cache-hit and cold boots are unobservable to a
// correct caller (identical routed ops + call semantics), with reboot timings
// reported in BENCHMARKS.md.
//
// Staleness model: inherited from the daemon (mtimeMs+size restat, not a
// rehash). A same-mtime same-size content swap would read stale — the same
// caveat as the daemon's own drift check, documented there, out of scope
// here; verify-on-boot remains the fail-closed backstop either way.
import { createHash } from "node:crypto";
import type { CompositionSpec } from "@vivim/omega-contracts";

export interface CacheEntryHashes { [entryId: string]: string }

export interface CompileCacheRecord {
  specKey: string;
  /** Owning vault (resolved): a record never serves a different vault — build
   *  dirs live under vault/build/<name> and recipes pin vault keys. */
  vaultDir: string;
  hashes: CacheEntryHashes;
  mtime: Record<string, { mtimeMs: number; size: number }>;
  recipeSha: string;
  buildDir: string;
  hits: number;
}

export interface CacheStats {
  hits: number;
  partials: number;
  misses: number;
  evictions: number;
  entries: number;
}

/** Spec identity: sha256 over entry (id/source/grant/bootPhase/config) —
 *  build artifacts excluded (they are the cache VALUE, never the key). */
export function specCacheKey(spec: CompositionSpec): string {
  const normalized = {
    name: spec.name,
    entries: spec.entries.map((e) => ({
      id: e.id,
      source: e.source,
      grant: { capabilities: [...e.grant.capabilities].sort(), contracts: [...e.grant.contracts].sort() },
      bootPhase: e.bootPhase,
      ...(e.config !== undefined ? { config: e.config } : {}),
    })),
  };
  return createHash("sha256").update(JSON.stringify(normalized)).digest("hex");
}

export type LookupVerdict =
  | { kind: "hit"; record: CompileCacheRecord }
  | { kind: "partial"; record: CompileCacheRecord; matched: string[] }
  | { kind: "miss" };

/** LRU-bounded map: specKey → verified compile record. Eviction drops the
 *  RECORD only — build dirs under vault/build/<name> are reused by recompile,
 *  so eviction leaks nothing beyond pre-existing layout. */
export class CompileCache {
  private records = new Map<string, CompileCacheRecord>();
  private stats: CacheStats = { hits: 0, partials: 0, misses: 0, evictions: 0, entries: 0 };

  constructor(private bound = 8) {}

  /** Non-counting peek for the daemon's two-step lookup (restat compare first,
   *  then a counting lookup). Returns the live record — callers may refresh
   *  its mtime baseline on hash-verified hits. */
  peek(specKey: string): CompileCacheRecord | undefined {
    return this.records.get(specKey);
  }

  /** Lookup by spec key. mtimeMatch: fresh restat equals the stored snapshot
   *  (no rehash needed). freshHashes: per-entry contentHashDir values, computed
   *  ONLY when the restat differed (null when uncomputed). */
  lookup(specKey: string, mtimeMatch: boolean, freshHashes: CacheEntryHashes | null): LookupVerdict {    const record = this.records.get(specKey);
    if (!record) {
      this.stats.misses++;
      return { kind: "miss" };
    }
    // Refresh LRU position on every observed use (hit, partial, or miss-for-
    // this-key still counts as interest in the key's neighbors — no: only
    // refresh on actual record contact).
    this.records.delete(specKey);
    this.records.set(specKey, record);
    if (mtimeMatch) {
      record.hits++;
      this.stats.hits++;
      return { kind: "hit", record };
    }
    if (freshHashes === null) {
      this.stats.misses++;
      return { kind: "miss" };
    }
    const matched = Object.keys(record.hashes).filter((id) => freshHashes[id] !== undefined && freshHashes[id] === record.hashes[id]);
    const total = Object.keys(record.hashes).length;
    if (matched.length === total && total > 0) {
      record.hits++;
      this.stats.hits++;
      return { kind: "hit", record };
    }
    if (matched.length > 0) {
      this.stats.partials++;
      return { kind: "partial", record, matched };
    }
    this.stats.misses++;
    return { kind: "miss" };
  }

  store(record: Omit<CompileCacheRecord, "hits">): void {
    this.records.delete(record.specKey);
    this.records.set(record.specKey, { ...record, hits: 0 });
    while (this.records.size > this.bound) {
      const oldest = this.records.keys().next();
      if (oldest.done) break;
      this.records.delete(oldest.value);
      this.stats.evictions++;
    }
    this.stats.entries = this.records.size;
  }

  snapshotStats(): CacheStats {
    return { ...this.stats, entries: this.records.size };
  }

  clear(): void {
    this.records.clear();
    this.stats = { hits: 0, partials: 0, misses: 0, evictions: 0, entries: 0 };
  }
}
