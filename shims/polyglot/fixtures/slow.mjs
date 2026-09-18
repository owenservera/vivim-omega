// polyglot falsifier fixture — SLOW child (D-374)
// Speaks the shim protocol but answers every call after `sleepMs` (payload or
// default 5s). The broker MUST honor the caller's deadline: the call settles
// as BUDGET and the child is killed — never a caller hanging past deadline.
import { createInterface } from "node:readline";
import process from "node:process";
const emit = (o) => process.stdout.write(JSON.stringify(o) + "\n");
emit({ type: "ready", shim: "vivim-omega-polyglot/1", runtime: `node ${process.versions.node}` });
const rl = createInterface({ input: process.stdin, crlfDelay: Infinity });
rl.on("line", (line) => {
  let frame;
  try { frame = JSON.parse(line); } catch { return; }
  if (frame?.type === "shutdown") process.exit(0);
  if (frame?.type !== "call") return;
  const sleepMs = Number(frame.payload?.sleepMs ?? 5000);
  setTimeout(() => emit({ type: "return", id: frame.id, result: { ok: true, data: { woke: sleepMs } } }), sleepMs);
});
