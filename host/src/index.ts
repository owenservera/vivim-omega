// @vivim/omega-host — public API. The µhost is the only non-plugin: it verifies manifests
// (B1), wires ports (B2), checks tokens host-side (B3), and boots fail-closed (B4).
// D-340: it also carries the genesis kernel — graph, chained audit, state arbitration,
// tool generations — the host-critical subset of vivim_omega_core parity.
export * from "./canon.ts";
export * from "./recipe.ts";
export * from "./worker.ts";
export * from "./audit.ts";
export * from "./graph.ts";
export * from "./state.ts";
export * from "./contract.ts";
export * from "./genesis.ts";
export * from "./ports.ts";
export * from "./boot.ts";
export * from "./recovery.ts";
