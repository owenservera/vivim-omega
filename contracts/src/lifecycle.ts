// @vivim/omega-contracts — lifecycle.ts

export type LifecycleState =
  | "staged" | "verified" | "active" | "degraded" | "quarantined" | "retired";

export type ProvenanceTier =
  | "untrusted" | "signed" | "verified" | "first-party" | "system";

/** Host-internal ops (transport, not policy). Each requires its exact capability grant. */
export const HOST_OPS = {
  compartmentSpawn: "host.compartment.spawn@1",
  compartmentTerminate: "host.compartment.terminate@1",
  compartmentStats: "host.compartment.stats@1",
  journalAppend: "host.journal.append@1",
  tokensRevoke: "host.tokens.revoke@1",
} as const;

/** The capability names guarding the host-internal ops. */
export const HOST_CAPS = {
  compartmentAdmin: "host.compartment.admin",
  journal: "host.journal.append",
  tokensRevoke: "host.tokens.revoke",
} as const;
