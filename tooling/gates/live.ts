// tooling/gates/live.ts — D-444 (Ω-14 port of paper D-446): Realization Liveness & Health.
//
// The pipe, not the poetry: TTFT, token rate, schema adherence measured
// passively on live turns plus governed shadow probes; pulses are vault rows
// citing W5 evidence; breaches flag degraded/critical with persistent warnings
// (never silent swaps); sustained signals hand to Ω-7 for demotion proposals.
// Pure library (no Bun/OS/DOM imports — headless).
// Falsifier: F-LIVENESS (`tooling/gates/test/f-liveness.test.ts`). Zero host LOC.

export interface LivenessContract { maxTTFTms: number; maxTokenRateMs: number; schemaStrictness: string; heartbeatIntervalS: number; }
export interface Pulse {
  realizationRef: string;
  measuredAt: number;
  ttftMs: number;
  tokenRateMs: number;
  schemaPassRate: number;
  state: "healthy" | "degraded" | "critical";
  evidenceRefs: string[];
}
export interface Refusal { ok: false; code: string; sentence: string; }
export type LiveResult<T> = { ok: true; value: T } | Refusal;

/** health.pulse — passive measurement folded into a state; evidence mandatory. */
export function pulse(input: {
  realizationRef: string;
  measuredAt: number;
  ttftMs: number;
  tokenRateMs: number;
  schemaPasses: number;
  schemaTotal: number;
  evidenceRefs: string[];
  contract: LivenessContract;
}): LiveResult<Pulse> {
  if (input.evidenceRefs.length === 0) {
    return { ok: false, code: "LIVENESS_PHANTOM_METRIC", sentence: "A liveness pulse was generated without citing evidenceRefs from actual W5 turns. Refused. Health must be proven, not estimated." };
  }
  const passRate = input.schemaTotal === 0 ? 1 : input.schemaPasses / input.schemaTotal;
  const breach =
    input.ttftMs > input.contract.maxTTFTms ||
    input.tokenRateMs > input.contract.maxTokenRateMs ||
    passRate < 1;
  const critical = input.ttftMs > input.contract.maxTTFTms * 5 && passRate < 0.5;
  return {
    ok: true,
    value: {
      realizationRef: input.realizationRef,
      measuredAt: input.measuredAt,
      ttftMs: input.ttftMs,
      tokenRateMs: input.tokenRateMs,
      schemaPassRate: passRate,
      state: critical ? "critical" : breach ? "degraded" : "healthy",
      evidenceRefs: input.evidenceRefs,
    },
  };
}

/** health.probe — governed shadow probe of a dormant realization. */
export function probe(input: {
  lastInvokedAt: number;
  nowMs: number;
  heartbeatIntervalS: number;
  budgetGranted: boolean;
  responds: boolean;
}): LiveResult<{ state: "healthy" | "critical"; detail: string }> {
  if (input.nowMs - input.lastInvokedAt < input.heartbeatIntervalS * 1000) {
    return { ok: true, value: { state: "healthy", detail: "within heartbeat; passive signal suffices" } };
  }
  if (!input.budgetGranted) {
    return { ok: false, code: "LIVENESS_BUDGET", sentence: "The probe waits for governor budget. Health checks never spend unclaimed." };
  }
  if (!input.responds) return { ok: true, value: { state: "critical", detail: "shadow probe timed out per contract" } };
  return { ok: true, value: { state: "healthy", detail: "probe answered" } };
}

/** Schema drift sentences for consecutive failures. */
export function schemaDrift(realizationRef: string, consecutiveFailures: number): LiveResult<string> {
  if (consecutiveFailures >= 3) {
    return { ok: true, value: `Realization ${realizationRef} failed strict schema validation on 3 consecutive turns. It is flagged as degraded. The surface has been warned.` };
  }
  return { ok: false, code: "LIVENESS_HEALTHY", sentence: "Within tolerance; watching continues." };
}

/** Silent fallback attempt — always refused. */
export function silentFallback(): Refusal {
  return { ok: false, code: "LIVENESS_SILENT_FALLBACK", sentence: "The system attempted to silently route a request away from a degraded realization without user consent. Refused. The user must choose to swap." };
}

/** Sustained degradation → Ω-7 demotion signal. */
export function demotionSignal(pulses: Pulse[], windowMs: number, nowMs: number): { signal: boolean; reason: string } {
  const window = pulses.filter((p) => nowMs - p.measuredAt <= windowMs);
  const bad = window.filter((p) => p.state !== "healthy");
  if (window.length > 0 && bad.length === window.length && bad.length >= 2) {
    return { signal: true, reason: `sustained degradation: ${bad.length}/${window.length} pulses non-healthy in window` };
  }
  return { signal: false, reason: "within tolerance" };
}

/** Ledger query: time-series fold over ns liveness rows. */
export function history(pulses: Pulse[]): Array<{ at: number; ttftMs: number; state: string }> {
  return pulses.slice().sort((a, b) => a.measuredAt - b.measuredAt).map((p) => ({ at: p.measuredAt, ttftMs: p.ttftMs, state: p.state }));
}
