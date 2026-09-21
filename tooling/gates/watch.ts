// tooling/gates/watch.ts — D-431 (Ω-1 port of paper D-425): the Watch Substrate.
//
// A watch may NOTICE and MINT an event. A watch may NEVER act. Action always
// routes through Law → Capability → Execution. No privileged path for the watcher.
//
// Shape: pure library (no Bun/OS/DOM imports — headless by construction).
// The substrate is the SOLE writer of `ns watch` / `watch.event` rows; every
// other writer is a named refusal. `onFire` is a canonical intent, never a
// direct action. Every row carries both badge axes + a named retention rule
// from row one. Falsifier: F-WATCH (`tooling/gates/test/f-watch.test.ts`).
// Zero host LOC; tooling/ + docs/ only.

export type WatchSource = "vault" | "time" | "device" | "fs" | "stream";
export type WatchState = "armed" | "paused" | "demoted";
export type Dedup = "none" | { windowMs: number } | "once";

export interface WatchRow {
  id: string;
  predicate: { kind: string; params: Record<string, number | string> };
  source: WatchSource;
  grants: string[];
  onFire: { intent: string; params?: Record<string, unknown> };
  dedup: Dedup;
  retention: string;
  badge: { tier: string; generality: string };
  state: WatchState;
  createdBy: string;
}

export interface WatchEventRow {
  watchRef: string;
  firedAt: number;
  evidenceRef: string;
  canonicalIntent: WatchRow["onFire"];
  idempotencyKey: string;
  badge: { tier: string; generality: string };
}

export interface Refusal {
  ok: false;
  code: string;
  sentence: string;
}

export type WatchResult<T> = { ok: true; value: T } | Refusal;

/** Deterministic 53-bit hash (cyrb53, pure — no imports) for idempotency keys. */
export function hash53(str: string, seed = 0): string {
  let h1 = 0xdeadbeef ^ seed;
  let h2 = 0x41c6ce57 ^ seed;
  for (let i = 0; i < str.length; i++) {
    const ch = str.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(16);
}

/** Quantized fire window for idempotent multi-device mint. */
export function idempotencyKey(watchRef: string, firedAt: number, windowMs: number): string {
  const q = Math.floor(firedAt / windowMs);
  return hash53(`${watchRef}|${q}`);
}

const INTENT_RE = /^(cap|intent):[a-z0-9_.-]+:[a-z0-9_.-]+$/;

export function isCanonicalIntent(onFire: unknown): boolean {
  if (typeof onFire !== "object" || onFire === null) return false;
  const o = onFire as Record<string, unknown>;
  return typeof o.intent === "string" && INTENT_RE.test(o.intent);
}

export interface RegisterCtx {
  isSubstrate: boolean;
  grantedSources: WatchSource[];
}

export function registerWatch(row: WatchRow, ctx: RegisterCtx): WatchResult<WatchRow> {
  if (!row.retention || row.retention.trim() === "") {
    return { ok: false, code: "WATCH_NO_RETENTION", sentence: "I can't create this watch, because it has no rule for when its events are forgotten. Give it a retention rule and I will." };
  }
  if (!ctx.grantedSources.includes(row.source)) {
    return { ok: false, code: "WATCH_UNGRANTED_SOURCE", sentence: `This watch needs to observe \`${row.source}\`, which it isn't granted. Grant the capability or I won't arm it.` };
  }
  if (!isCanonicalIntent(row.onFire)) {
    return { ok: false, code: "WATCH_ONFIRE_NOT_INTENT", sentence: "A watch can only fire a canonical intent for the law to judge — it can't act directly. Rephrase the action as an intent." };
  }
  if (!ctx.isSubstrate) {
    return { ok: false, code: "WATCH_NOT_SOLE_WRITER", sentence: "Only the watch substrate writes watch rows. Your write was refused." };
  }
  if (!row.badge?.tier || !row.badge?.generality) {
    return { ok: false, code: "WATCH_NO_RETENTION", sentence: "I can't create this watch, because it has no rule for when its events are forgotten. Give it a retention rule and I will." };
  }
  return { ok: true, value: { ...row, state: "armed" } };
}

export function armWatch(row: WatchRow, owner: string, caller: string): WatchResult<WatchRow> {
  if (caller !== owner) {
    return { ok: false, code: "WATCH_NOT_OWNER", sentence: "Only the watch owner arms or pauses this watch. Your toggle was refused." };
  }
  if (row.state === "demoted") {
    return { ok: false, code: "WATCH_NOT_OWNER", sentence: "Only the watch owner arms or pauses this watch. Your toggle was refused." };
  }
  return { ok: true, value: { ...row, state: "armed" } };
}

export function pauseWatch(row: WatchRow, owner: string, caller: string): WatchResult<WatchRow> {
  if (caller !== owner) {
    return { ok: false, code: "WATCH_NOT_OWNER", sentence: "Only the watch owner arms or pauses this watch. Your toggle was refused." };
  }
  return { ok: true, value: { ...row, state: "paused" } };
}

export function demoteWatch(row: WatchRow): { row: WatchRow; ledger: string } {
  return {
    row: { ...row, state: "demoted", badge: { tier: "demoted", generality: row.badge.generality } },
    ledger: `watch.demote ${row.id}: state=demoted, badge falls loudly (was ${row.badge.tier})`,
  };
}

export function revokeGrants(row: WatchRow): WatchRow {
  return { ...row, grants: [], state: "paused" };
}

export interface FireCtx {
  isSubstrate: boolean;
  nowMs: number;
  evidenceRef: string;
}

/** watch.fire — internal only. Callable solely by the substrate. */
export function fireWatch(row: WatchRow, ctx: FireCtx): WatchResult<WatchEventRow> {
  if (!ctx.isSubstrate) {
    return { ok: false, code: "WATCH_FIRE_NOT_GRANTABLE", sentence: "`watch.fire` can't be granted to a plugin. It mints events; it doesn't delegate." };
  }
  if (row.state !== "armed") return { ok: false, code: "WATCH_PAUSED", sentence: "This watch is not armed, so it fires nothing. Arm it and I will." };
  const windowMs = row.dedup === "once" ? 2 ** 62 : typeof row.dedup === "object" ? row.dedup.windowMs : 60_000;
  const key = row.dedup === "none" ? hash53(`${row.id}|${ctx.nowMs}|${ctx.evidenceRef}`) : idempotencyKey(row.id, ctx.nowMs, windowMs);
  return {
    ok: true,
    value: {
      watchRef: row.id,
      firedAt: ctx.nowMs,
      evidenceRef: ctx.evidenceRef,
      canonicalIntent: row.onFire,
      idempotencyKey: key,
      badge: { ...row.badge },
    },
  };
}

/** Deterministic predicate evaluation — no language, no model in the firing path. */
export function evaluatePredicate(
  row: WatchRow,
  snapshot: { nowMs: number; vaultValue?: number; fsBytes?: number; lastFireMs?: number },
): { fire: boolean; evidenceRef: string } {
  const p = row.predicate;
  if (p.kind === "time.everyMs") {
    const every = Number(p.params.everyMs);
    const last = snapshot.lastFireMs ?? 0;
    if (snapshot.nowMs - last >= every) return { fire: true, evidenceRef: `time:${snapshot.nowMs}:everyMs=${every}` };
    return { fire: false, evidenceRef: "" };
  }
  if (p.kind === "vault.gte" || p.kind === "fs.grows") {
    const threshold = Number(p.params.threshold ?? p.params.bytes);
    const value = p.kind === "vault.gte" ? (snapshot.vaultValue ?? 0) : (snapshot.fsBytes ?? 0);
    if (value >= threshold) return { fire: true, evidenceRef: `${p.kind}:offset=${value}:threshold=${threshold}` };
    return { fire: false, evidenceRef: "" };
  }
  return { fire: false, evidenceRef: "" };
}

/** CP-1 reconciliation: first event per idempotencyKey wins; dupes get a named merge record. */
export function reconcile(events: WatchEventRow[]): { kept: WatchEventRow[]; merges: string[] } {
  const seen = new Map<string, WatchEventRow>();
  const merges: string[] = [];
  for (const e of events) {
    if (!seen.has(e.idempotencyKey)) seen.set(e.idempotencyKey, e);
    else merges.push(`merge ${e.watchRef}: duplicate idempotencyKey ${e.idempotencyKey} reconciled to first (CP-1, no double-mint)`);
  }
  return { kept: [...seen.values()], merges };
}
