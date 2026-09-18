// polyglot falsifier fixture — NOISY child (D-374)
// Emits a flood of malformed (non-JSON / wrong-shape) stdout frames without
// ever answering calls. The broker MUST bound this: malformed counter trips
// BUDGET, the child is killed, the caller gets a settled rejection — never a
// hang. (This is DRAFT-002 §7 falsifier 4's adversarial half.)
import process from "node:process";
setInterval(() => {
  process.stdout.write("GARBAGE-NOT-JSON\n");
  process.stdout.write("42\n");
  process.stdout.write("[[[\n");
}, 10);
