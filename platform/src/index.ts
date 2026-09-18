// @vivim/omega-platform — index (D-372): the only OS-aware module in the production tree.
export * from "./platform.ts";
export * from "./spawn.ts"; // D-374: process-tier spawning (the only node:child_process surface)
export * from "./containment.ts"; // D-386: OS-enforced containment probe (L-15 revisit trigger; evidence tooling — no boot path imports it)
