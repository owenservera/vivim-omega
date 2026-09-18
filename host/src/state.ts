// µhost — state.ts: state arbitration (kernel requirement #3) — the one non-negotiable
// non-plugin. Two plugins racing on the same declared state key is the exact corruption
// the whole capability-graph design exists to prevent, so the arbiter cannot live a
// compartment round-trip away from correctness during a race window. Host-side per
// D-340. vivim.vault keeps its own single-writer queue (a correct, cheap optimization
// for vault records specifically); this primitive gives everything OUTSIDE the vault
// the same guarantee the vault already gives itself. Reachable as ordinary capability-
// gated host ops (host.state.acquire@1 / host.state.release@1) so plugins arbitrate
// through the one arbiter instead of each rolling their own lock.
export type LockMode = "shared" | "exclusive";

interface Holder { principal: string; mode: LockMode }

export class StateArbitrator {
  private keys = new Map<string, Holder[]>();

  /** Fail-closed: a conflicting acquisition is REFUSED with the current holders named,
   *  never queued (the caller retries or backpressures — policy stays outside the host). */
  tryAcquire(key: string, principal: string, mode: LockMode): { ok: true } | { ok: false; error: string } {
    const holders = this.keys.get(key) ?? [];
    const conflict = holders.some((h) => h.mode === "exclusive") || (mode === "exclusive" && holders.length > 0);
    if (conflict) {
      return { ok: false, error: `state key '${key}' held (${holders.map((h) => `${h.principal}/${h.mode}`).join(", ")}); '${principal}' must wait` };
    }
    this.keys.set(key, [...holders, { principal, mode }]);
    return { ok: true };
  }

  release(key: string, principal: string): void {
    const holders = this.keys.get(key);
    if (holders) this.keys.set(key, holders.filter((h) => h.principal !== principal));
  }

  /** Audit/debug view only — never a bypass path for acquiring without tryAcquire. */
  holdersOf(key: string): Holder[] { return [...(this.keys.get(key) ?? [])]; }
}
