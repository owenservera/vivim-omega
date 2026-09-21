// tooling/gates/gov.ts — D-432 (Ω-2 port of paper D-426): the Resource Governor.
//
// Every running thing runs under a named budget the governor alone enforces.
// Pipeline: Law (may it?) → Governor (can it?) → Execution → Evidence citing
// both gates. Lifecycle state is DERIVED from the governor's ledger, never
// stored. Predictions warm (ghost→dormant), never hydrate. Eviction orders by
// coldness, never by badge. No exemption — not first-party, not Forge, not self.
// Pure library (no Bun/OS/DOM imports — headless by construction).
// Falsifier: F-GOV (`tooling/gates/test/f-gov.test.ts`). Zero host LOC.

export interface Caps { ramMB: number; cpuShares: number; gpu: number; procs: number; }
export interface Budget {
  id: string;
  scope: string;
  caps: Caps;
  onPressure: "evict-coldest" | "refuse" | "ask";
  namedBy: string;
}
export type ClaimMode = "firm" | "provisional";
export interface Claim {
  id: string;
  claimant: string;
  request: Caps;
  mode: ClaimMode;
  origin: string;
  deviceId: string;
  gateRef: string;
  evidenceRef: string;
}
export type TileState = "hydrated" | "dormant" | "ghost";
export interface Transition {
  tileRef: string;
  from: TileState;
  to: TileState;
  cause: string;
  at: number;
  deviceId: string;
}
export interface Refusal { ok: false; code: string; sentence: string; }
export type GovResult<T> = { ok: true; value: T } | Refusal;

const ZERO: Caps = { ramMB: 0, cpuShares: 0, gpu: 0, procs: 0 };

/** Spec-literal memory rendering: exact GB where whole, else MB (paper D-426 §9). */
export function fmtMB(mb: number): string {
  return mb % 1024 === 0 ? `${mb / 1024} GB` : `${mb} MB`;
}

export function addCaps(a: Caps, b: Caps): Caps {
  return { ramMB: a.ramMB + b.ramMB, cpuShares: a.cpuShares + b.cpuShares, gpu: a.gpu + b.gpu, procs: a.procs + b.procs };
}

export function fits(request: Caps, caps: Caps): boolean {
  return request.ramMB <= caps.ramMB && request.cpuShares <= caps.cpuShares && request.gpu <= caps.gpu && request.procs <= caps.procs;
}

export function setBudget(b: Budget): GovResult<Budget> {
  if (!b.namedBy || b.namedBy.trim() === "") {
    return { ok: false, code: "GOV_NO_BUDGET", sentence: "This composition has no budget; nothing runs unnamed. Give it a budget and I'll arm it." };
  }
  return { ok: true, value: b };
}

/** Claim decision: grant / refuse. Provisional claims may never target hydrated. */
export function decideClaim(
  budget: Budget | null,
  claim: Claim,
  target: TileState,
  used: Caps = ZERO,
): GovResult<{ decision: "granted" | "refused"; remaining: Caps }> {
  if (!budget) {
    return { ok: false, code: "GOV_NO_BUDGET", sentence: "This composition has no budget; nothing runs unnamed. Give it a budget and I'll arm it." };
  }
  if (!claim.gateRef) {
    return { ok: false, code: "GOV_NO_BUDGET", sentence: "This composition has no budget; nothing runs unnamed. Give it a budget and I'll arm it." };
  }
  if (claim.mode === "provisional" && target === "hydrated") {
    return { ok: false, code: "GOV_PROVISIONAL_CEILING", sentence: "A prediction can warm a tile but never hydrate it. Only a firm claim may hydrate." };
  }
  const fitsAlone = fits(claim.request, budget.caps);
  const fitsWithUsed = fits(addCaps(used, claim.request), budget.caps);
  if (!fitsAlone || !fitsWithUsed) {
    return {
      ok: false,
      code: "GOV_OVER_BUDGET",
      sentence: `This tile asked for ${fmtMB(claim.request.ramMB)}; the cap on this device is ${fmtMB(budget.caps.ramMB)}. I won't run it.`,
    };
  }
  return {
    ok: true,
    value: {
      decision: "granted",
      remaining: {
        ramMB: budget.caps.ramMB - used.ramMB - claim.request.ramMB,
        cpuShares: budget.caps.cpuShares - used.cpuShares - claim.request.cpuShares,
        gpu: budget.caps.gpu - used.gpu - claim.request.gpu,
        procs: budget.caps.procs - used.procs - claim.request.procs,
      },
    },
  };
}

/** Lifecycle transition — sole writer: governor. Downward rows carry sentences. */
export function transition(
  tileRef: string,
  from: TileState,
  to: TileState,
  cause: string,
  ctx: { isGovernor: boolean; at: number; deviceId: string; mode?: ClaimMode },
): GovResult<{ row: Transition; sentence: string | null }> {
  if (!ctx.isGovernor) {
    return { ok: false, code: "GOV_NOT_SOLE_WRITER", sentence: "Only the governor writes lifecycle rows. Your write was refused." };
  }
  if (ctx.mode === "provisional" && from === "ghost" && to === "hydrated") {
    return { ok: false, code: "GOV_PROVISIONAL_CEILING", sentence: "A prediction can warm a tile but never hydrate it. Only a firm claim may hydrate." };
  }
  const down = (from === "hydrated" && to !== "hydrated") || (from === "dormant" && to === "ghost");
  const sentence = down ? `Tile \`${tileRef}\` moves ${from} → ${to} (${cause}); placement and badge survive in the vault.` : null;
  return { ok: true, value: { row: { tileRef, from, to, cause, at: ctx.at, deviceId: ctx.deviceId }, sentence } };
}

/** Eviction ordering: coldest by vault-access recency, tiebreak cheapest rehydrate. Badges never enter. */
export interface TileCost { tileRef: string; lastAccessMs: number; rehydrateCost: number; }
export function evictColdest(tiles: TileCost[], slots: number): { keep: string[]; ghost: string[] } {
  const ordered = [...tiles].sort((a, b) => a.lastAccessMs - b.lastAccessMs || a.rehydrateCost - b.rehydrateCost);
  const ghost = ordered.slice(0, Math.max(0, ordered.length - slots)).map((t) => t.tileRef);
  const keep = ordered.slice(Math.max(0, ordered.length - slots)).map((t) => t.tileRef);
  return { keep, ghost };
}

/** Badge-weighted ordering attempt — always refused (pre-registered corruption). */
export function evictByBadge(): Refusal {
  return { ok: false, code: "GOV_BADGE_WEIGHTED", sentence: "Eviction orders by coldness, never by badge. That ordering was refused." };
}

/** Self-exemption attempt — always refused (pre-registered corruption). */
export function exemptSelf(): Refusal {
  return { ok: false, code: "GOV_SELF_EXEMPTION", sentence: "The governor cannot exempt itself or any first-party composition. No privileged path." };
}

/** Watchdog enforcement: usage past grant stops the composition; forged tiles get a spoken sentence. */
export function enforceWatchdog(
  tileRef: string,
  usageMB: number,
  grantMB: number,
  ctx: { at: number; deviceId: string; forged: boolean },
): GovResult<{ row: Transition; sentence: string }> {
  if (usageMB <= grantMB) return { ok: false, code: "GOV_WITHIN_GRANT", sentence: "Usage is within grant; the watchdog stays quiet." };
  const sentence = ctx.forged
    ? `Tile \`${tileRef}\` burned ${usageMB} MB past its ${grantMB} MB grant and was stopped. Its work survives in the vault; re-claim to resume.`
    : `Composition \`${tileRef}\` exceeded grant and was stopped (cause=enforcement).`;
  return {
    ok: true,
    value: { row: { tileRef, from: "hydrated", to: "ghost", cause: "enforcement", at: ctx.at, deviceId: ctx.deviceId }, sentence },
  };
}

export interface TileView { tileRef: string; state: TileState; holder: string; ramMB: number; vaultWrites: number; ghosted: boolean; }

/** Headless inspection: answers cost questions in tile terms, from rows only. */
export function inspect(tiles: TileView[]): {
  ghosted: string[];
  browserHolders: Array<{ tileRef: string; ramMB: number }>;
  costliest: string | null;
} {
  const ghosted = tiles.filter((t) => t.ghosted).map((t) => t.tileRef);
  const browserHolders = tiles.filter((t) => t.holder !== "").map((t) => ({ tileRef: t.tileRef, ramMB: t.ramMB }));
  const costliest = tiles.slice().sort((a, b) => b.ramMB + b.vaultWrites - (a.ramMB + a.vaultWrites))[0]?.tileRef ?? null;
  return { ghosted, browserHolders, costliest };
}

/** Locality: budgets (policy) sync as vault facts; claims never sync — device B starts with zero grants. */
export function syncBudgetsToDevice(budgets: Budget[]): Budget[] {
  return budgets.map((b) => ({ ...b }));
}

export function claimsOnDevice(claims: Claim[], deviceId: string): Claim[] {
  return claims.filter((c) => c.deviceId === deviceId);
}
