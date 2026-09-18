// vivim-omega polyglot shim — Node process tier (D-374)
// The Node twin of vivim_omega_shim.py: same ndjson frames, same ops table,
// same fail-closed discipline. Proves the polyglot claim without Python on the
// box (a Bun host ↔ Node child IS a cross-runtime compartment boundary).
// shims/ is out-of-tree (like tooling/) — node: imports here are gate-legal.
import { createInterface } from "node:readline";
import process from "node:process";

const MALFORMED_LIMIT = 5;

function opEchoSay(payload) {
  if (payload === null || typeof payload !== "object") {
    return { ok: false, error: "REFUSED", detail: "echo.say expects an object payload" };
  }
  const say = payload.say;
  if (typeof say !== "string") return { ok: false, error: "REFUSED", detail: "echo.say expects a string 'say'" };
  return { ok: true, data: { said: say, tier: "process", runtime: "node" } };
}

const OPS = { "echo.say": opEchoSay };

function emit(obj) {
  process.stdout.write(JSON.stringify(obj) + "\n");
}

emit({ type: "ready", shim: "vivim-omega-polyglot/1", runtime: `node ${process.versions.node}` });

let malformed = 0;
const rl = createInterface({ input: process.stdin, crlfDelay: Infinity });
rl.on("line", (line) => {
  const trimmed = line.trim();
  if (trimmed.length === 0) return;
  let frame;
  try { frame = JSON.parse(trimmed); } catch {
    malformed += 1;
    emit({ type: "malformed", count: malformed });
    if (malformed > MALFORMED_LIMIT) {
      process.stderr.write("shim: malformed limit exceeded — self-bounding exit\n");
      process.exit(3);
    }
    return;
  }
  if (frame === null || typeof frame !== "object") { malformed += 1; emit({ type: "malformed", count: malformed }); return; }
  if (frame.type === "shutdown") process.exit(0);
  if (frame.type !== "call") { malformed += 1; emit({ type: "malformed", count: malformed }); return; }
  const handler = typeof frame.op === "string" ? OPS[frame.op] : undefined;
  if (!handler) {
    emit({ type: "return", id: frame.id, result: { ok: false, error: "REFUSED", detail: `unknown op: ${JSON.stringify(frame.op)}` } });
    return;
  }
  try {
    emit({ type: "return", id: frame.id, result: handler(frame.payload) });
  } catch (e) {
    emit({ type: "return", id: frame.id, result: { ok: false, error: "DEGRADED", detail: String(e) } });
  }
});
