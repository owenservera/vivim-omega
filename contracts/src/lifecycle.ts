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

/** Host op -> the capability that guards it (single source of truth for token
 *  aliasing: alias keys and guarding caps resolve to the same effective cap —
 *  insertion order never changes authority, B3). Pure data over HOST_OPS/CAPS. */
export const HOST_OP_TO_CAP: Record<string, string> = {
  [HOST_OPS.compartmentSpawn]: HOST_CAPS.compartmentAdmin,
  [HOST_OPS.compartmentTerminate]: HOST_CAPS.compartmentAdmin,
  [HOST_OPS.compartmentStats]: HOST_CAPS.compartmentAdmin,
  [HOST_OPS.journalAppend]: HOST_CAPS.journal,
  [HOST_OPS.tokensRevoke]: HOST_CAPS.tokensRevoke,
};
