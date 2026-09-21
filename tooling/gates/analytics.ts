// tooling/gates/analytics.ts — D-435 (Ω-5 port of paper D-429): Vault Analytics & Projection.
//
// The vault is the single source of truth; analytics are disposable,
// deterministic folds. Every materialization carries a vaultWatermark; surfaces
// render the Staleness Delta. Materializations are insert-only (new versions)
// or deleted for rebuild — never manually edited. No joins against unbadged
// external data. Pure library (no Bun/OS/DOM imports — headless).
// Falsifier: F-ANALYTICS (`tooling/gates/test/f-analytics.test.ts`). Zero host LOC.

import { hash53 } from "./watch.ts";

export interface VaultLogRow { offset: number; ns: string; kind: string; claimant?: string; tokens?: number; intentHash?: string; }
export interface Projection {
  id: string;
  name: string;
  fold: string;
  sourceNamespaces: string[];
  refreshPolicy: string;
  namedBy: string;
}
export interface Materialization {
  projectionRef: string;
  payload: string;
  vaultWatermark: number;
  computedAt: number;
  computeCost: string;
  badge: string;
}
export interface Refusal { ok: false; code: string; sentence: string; }
export type AnalyticsResult<T> = { ok: true; value: T } | Refusal;

/** Deterministic fold: count rows per key over [0, throughOffset]. Pure. */
export function foldCount(
  log: VaultLogRow[],
  throughOffset: number,
  key: (r: VaultLogRow) => string,
): Record<string, number> {
  const out: Record<string, number> = {};
  for (const r of log) {
    if (r.offset > throughOffset) continue;
    const k = key(r);
    out[k] ??= 0;
    out[k] += 1;
  }
  return out;
}

/** analytics.materialize — sole writer: the Projection Engine. Watermark mandatory. */
export function materialize(input: {
  projection: Projection;
  log: VaultLogRow[];
  throughOffset: number;
  computedAt: number;
  isEngine: boolean;
  externalJoin: boolean;
}): AnalyticsResult<Materialization> {
  if (!input.isEngine) {
    return { ok: false, code: "ANALYTICS_SECOND_TRUTH", sentence: "You cannot manually edit a cached metric. The vault is the truth; the chart is just a shadow. I will rebuild it from the vault instead." };
  }
  if (input.externalJoin) {
    return { ok: false, code: "ANALYTICS_UNTRACKED_JOIN", sentence: "This query attempts to join vault data with an external, unbadged CSV file. Refused. Analytics must fold only over sovereign vault rows." };
  }
  if (!Number.isFinite(input.throughOffset)) {
    return { ok: false, code: "ANALYTICS_NO_WATERMARK", sentence: "A projection was computed without recording the vault byte-offset it read from. That materialization is refused — we must know how stale it is." };
  }
  const counts = foldCount(input.log, input.throughOffset, (r) => `${r.ns}:${r.kind}`);
  const payload = JSON.stringify(counts, Object.keys(counts).sort());
  void hash53;
  return {
    ok: true,
    value: {
      projectionRef: input.projection.id,
      payload,
      vaultWatermark: input.throughOffset,
      computedAt: input.computedAt,
      computeCost: `fold:${input.log.length}rows`,
      badge: "first-party · generic",
    },
  };
}

/** Manual edit attempt — always refused. */
export function editMaterialization(): Refusal {
  return { ok: false, code: "ANALYTICS_SECOND_TRUTH", sentence: "You cannot manually edit a cached metric. The vault is the truth; the chart is just a shadow. I will rebuild it from the vault instead." };
}

/** Staleness Delta: tip minus watermark. Surfaces render it, never hide it. */
export function stalenessDelta(tipOffset: number, m: Materialization): number {
  return Math.max(0, tipOffset - m.vaultWatermark);
}

/** analytics.rebuild — from byte 0; deterministic: same log, byte-identical payload. */
export function rebuild(
  projection: Projection,
  log: VaultLogRow[],
  computedAt: number,
): AnalyticsResult<Materialization> {
  const tip = log.reduce((m, r) => Math.max(m, r.offset), 0);
  return materialize({ projection, log, throughOffset: tip, computedAt, isEngine: true, externalJoin: false });
}

/** Costliest tile: joins gov.claim rows with write frequency, cites its byte-range. */
export function costliestTile(
  claims: Array<{ claimant: string; ramMB: number }>,
  writes: Record<string, number>,
  scannedUpTo: number,
): { tile: string; cost: number; byteRange: string } {
  const cost: Record<string, number> = {};
  for (const c of claims) cost[c.claimant] = (cost[c.claimant] ?? 0) + c.ramMB;
  for (const [k, v] of Object.entries(writes)) cost[k] = (cost[k] ?? 0) + v;
  const tile = Object.entries(cost).sort((a, b) => b[1] - a[1])[0];
  return { tile: tile[0], cost: tile[1], byteRange: `vault:0..${scannedUpTo}` };
}
