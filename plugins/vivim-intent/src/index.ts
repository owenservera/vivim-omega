// vivim-intent — Phase 1 skeleton (D-389)
// Authority/delegation: per-step attenuated grants (§3.2);
// no ambient authority; every step gates through ordinary host port dispatch.
// Implementation: contract wiring + vault read/write for ns 'intent';
// resolution delegated to resolve.classify@1 (§3.6); cancellation non-rollback (§3.9).

export const PLUGIN_ID = "vivim.intent";
export const PHASE = "D-389-Phase-1";

/** Design claims (verified by falsifier in test/):
 * - sourcePrincipal from authenticated caller (§3.3)
 * - step execution under attenuated delegation (§3.2)
 * - resolution delegates to resolve.classify@1 (no parallel logic, D-337)
 * - cancellation = skip pending/gated + record evidence; not rollback (§3.9)
 * - evidence append-only; concurrency guarded by expectedRev + lease (§3.7)
 */
