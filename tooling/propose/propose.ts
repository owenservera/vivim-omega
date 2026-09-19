// D-400 proposal: draft a Recipe diff for a missing op, never sign or apply.
import { writeFileSync } from "node:fs";

export interface Proposal {
  op: string;
  entry: { id: string; source: string; bootPhase: number; grant: { capabilities: string[]; contracts: string[] } };
  manifestId: string;
  grants: string[];
  justification: string;
  provisionalPath: string;
}

export function draftProposal(op: string, outPath: string): Proposal {
  const p: Proposal = {
    op,
    entry: { id: `proposal.${op.replace(/[^a-z0-9]+/gi, "-")}`, source: "../examples/plugin-echo", bootPhase: 2, grant: { capabilities: [], contracts: [op] } },
    manifestId: `proposal.${op}`,
    grants: [`port:${op}`],
    justification: `Steward observed refused op ${op} with no offeror; proposes echo-class provider. Human must review and sign; this draft confers zero authority.`,
    provisionalPath: outPath,
  };
  writeFileSync(outPath, JSON.stringify({ provisional: true, proposal: p, note: "recovery boot never reads this path" }, null, 2));
  return p;
}
