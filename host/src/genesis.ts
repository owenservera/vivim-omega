// µhost — genesis.ts: the closed bootstrap (kernel requirement #2). Five fixed nodes,
// two self-referential grants that close the "who defines the definer" regress into a
// cycle (Smalltalk-metaclass style) instead of leaving an implicit, undeclared root
// somewhere in the code. This is the ONLY place identities are hardcoded; every later
// plugin, tool and grant is ordinary Recipe data on top of this closed set.
// vivim.law's phase-0 rule stays and is complementary: genesis fixes IDENTITIES, the
// phase-0 rule fixes BOOT ORDER for the gate. Keep both (D-340 §1.2).
import { AuditLog } from "./audit.ts";
import { CapabilityGraph } from "./graph.ts";
import { StateArbitrator } from "./state.ts";
import { ToolRegistry } from "./contract.ts";

export const SCHEMA = "genesis:schema";
export const KERNEL = "genesis:kernel";
export const EVERYONE = "genesis:everyone";
export const STATE_ARBITRATOR = "core:state-arbitrator";
export const CAP_SELF_DESCRIBE = "cap:self-describe";

/** The kernel the router carries: one graph, one chain, the one non-plugin arbiter,
 *  and the generation registry. Attached at boot; optional on bare PortRouters (tests
 *  that never exercise the kernel keep v1 routing behavior). */
export interface Kernel {
  graph: CapabilityGraph;
  audit: AuditLog;
  state: StateArbitrator;
  tools: ToolRegistry;
}

export function bootstrapKernel(keyId: string, privateKeyPem: string, publicKey: string): Kernel {
  const audit = new AuditLog(keyId, privateKeyPem, publicKey);
  const graph = new CapabilityGraph();
  graph.upsertNode({ id: SCHEMA, kind: "capability" });
  graph.upsertNode({ id: KERNEL, kind: "principal", granularity: "atomic" });
  graph.upsertNode({ id: EVERYONE, kind: "principal" });
  // Excluded from extraction BY CONSTRUCTION (never a manifest-settable flag):
  graph.upsertNode({ id: STATE_ARBITRATOR, kind: "principal", granularity: "atomic", extractionCandidate: false });
  graph.upsertNode({ id: CAP_SELF_DESCRIBE, kind: "capability" });
  const closing: Array<[string, string]> = [[KERNEL, KERNEL], [KERNEL, SCHEMA]];
  for (const [from, to] of closing) graph.grant(from, to, CAP_SELF_DESCRIBE, audit.record(from, to, CAP_SELF_DESCRIBE), "hold");
  return { graph, audit, state: new StateArbitrator(), tools: new ToolRegistry() };
}
