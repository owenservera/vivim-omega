// surfaces/daemon/src/pool.ts — warm isolate pool (D-329).
//
// The pool holds PARKED generic isolates (running poolboot.ts — no plugin code)
// and hands them to the host's pool-aware checkout. Assignment loads plugin code
// per assignment via dynamic import; consumed workers are TERMINATED by their
// host owner, never returned — pool SLOTS turn over, isolates never do. A
// recycled worker would need the adversarial bleed proof; a fresh isolate needs
// none, so the design removes the recycle path instead of proving it safe.
//
// Bounded by construction: at most `size` parked isolates exist (refill-to-N on
// consume, background); there is no eviction path because there is no unbounded
// growth. Any failure (empty stock, dead parked worker, assign timeout, import
// error) resolves to null — cold fallback, never an error. Correctness never
// depends on the pool.
import { Worker } from "node:worker_threads";
import { join } from "node:path";

const BOOTSTRAP = join(import.meta.dir, "poolboot.ts");
const ASSIGN_TIMEOUT_MS = 5000;

export interface PoolStats {
  size: number;
  parked: number;
  checkouts: number;
  hits: number;
  coldFallbacks: number;
  assignFailures: number;
}

/** Assign one parked worker to a plugin entry (post + bounded ack). */
function assign(worker: Worker, entryAbs: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      worker.off("message", onMessage);
      reject(new Error(`pool assign timeout (${ASSIGN_TIMEOUT_MS}ms)`));
    }, ASSIGN_TIMEOUT_MS);
    const onMessage = (m: unknown) => {
      const msg = m as { type?: unknown; error?: unknown };
      if (msg?.type !== "assigned") return;
      clearTimeout(timer);
      worker.off("message", onMessage);
      if (msg.error !== undefined) reject(new Error(`pool assign import failed: ${String(msg.error)}`));
      else resolve();
    };
    worker.on("message", onMessage);
    try {
      worker.postMessage({ type: "assign", entry: entryAbs });
    } catch (e) {
      clearTimeout(timer);
      worker.off("message", onMessage);
      reject(e);
    }
  });
}

function terminateQuiet(worker: Worker): void {
  try {
    void worker.terminate().catch(() => {});
  } catch { /* already dead */ }
}

export class IsolatePool {
  private parked: Worker[] = [];
  private shut = false;
  private checkouts = 0;
  private hits = 0;
  private coldFallbacks = 0;
  private assignFailures = 0;

  constructor(private size = 4) {}

  /** Prefill parked stock (async — callers never await pool warmth). */
  start(): void {
    this.refill();
  }

  /** Checkout: a parked isolate assigned to entryAbs, or null (cold fallback). */
  async acquire(entryAbs: string): Promise<Worker | null> {
    if (this.shut) return null;
    this.checkouts++;
    const worker = this.parked.pop();
    void this.refill();
    if (!worker) {
      this.coldFallbacks++;
      return null;
    }
    this.hits++;
    try {
      await assign(worker, entryAbs);
      return worker;
    } catch {
      this.assignFailures++;
      terminateQuiet(worker);
      return null;
    }
  }

  /** Terminate parked stock. Assigned workers belong to their host owner. */
  async shutdown(): Promise<void> {
    this.shut = true;
    const stock = this.parked.splice(0);
    await Promise.all(stock.map((w) => w.terminate().catch(() => {})));
  }

  snapshot(): PoolStats {
    return {
      size: this.size, parked: this.parked.length, checkouts: this.checkouts,
      hits: this.hits, coldFallbacks: this.coldFallbacks, assignFailures: this.assignFailures,
    };
  }

  private refill(): void {
    while (!this.shut && this.parked.length < this.size) {
      try {
        this.parked.push(new Worker(BOOTSTRAP));
      } catch {
        break;
      }
    }
  }
}
