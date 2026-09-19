// D-398 signals: pure diff over snapshots — no transport, no authority.
export interface Bearing { id: string; fanIn: number; blastRadius: number }
export function crossed(prev: Bearing[], next: Bearing[]): Bearing[] {
  const before = new Set(prev.map((b) => b.id));
  return next.filter((b) => !before.has(b.id));
}
export interface Breach { compartment: string; measuredMB: number; thresholdMB: number; at: number }
export function breachEvent(compartment: string, measuredMB: number, thresholdMB: number): Breach {
  return { compartment, measuredMB, thresholdMB, at: Date.now() };
}
export function chainBroken(verified: boolean): boolean { return !verified; }
export const SWEEP_INTERVAL_MS = 5000; // justified: sweep p50 1.17ms → 0.02 percent overhead
