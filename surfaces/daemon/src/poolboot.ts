// surfaces/daemon/src/poolboot.ts — generic parked isolate for the warm pool (D-329).
// Waits for one {type:"assign", entry} message, dynamically imports the plugin
// entry (its startPlugin call binds the shim handlers), acks {type:"assigned"}.
// Single-assignment by construction: the host terminates assigned workers on
// release (never recycled), so a second assign is ignored — the pool's ack
// timeout then fails closed to cold spawn. The isolate is pooled; plugin code
// loads per assignment, never pooled.
import { parentPort } from "node:worker_threads";

const port = parentPort!;
let assigned = false;

port.on("message", async (m: unknown) => {
  const msg = m as { type?: unknown; entry?: unknown };
  if (assigned || msg?.type !== "assign" || typeof msg.entry !== "string") return;
  assigned = true;
  try {
    await import(msg.entry);
    port.postMessage({ type: "assigned" });
  } catch (e) {
    port.postMessage({ type: "assigned", error: String(e) });
  }
});
