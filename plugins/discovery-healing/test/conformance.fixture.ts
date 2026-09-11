// discovery.healing — the TEST contribution the conformance runner executes.
// Exports run(def, fake): the healing loop's no-drift and promote paths on the
// FakeHost, in the SELF-CONTAINED world (no vault op installed — the journal
// append is REFUSED and the report must say so honestly: journaling is
// best-effort, the decision stands on its evidence).
import type { PluginDef } from "@vivim/omega-shim";
import type { FakeHost } from "@vivim/omega-testkit";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parseManifest } from "@vivim/omega-sdk";

export async function run(def: PluginDef, fake: FakeHost): Promise<{ pass: boolean; noneAction?: string; promoteAction?: string; journaled?: boolean }> {
  if (!def.ops?.["discovery.heal@1"]) return { pass: false };

  const manifest = parseManifest(readFileSync(join(import.meta.dir, "..", "plugin.json"), "utf-8"));
  if (!manifest.ok) return { pass: false };
  await fake.install(def, manifest.value, { capabilities: manifest.value.capabilities.requested });

  const contract = { op: "compose.click@1", selector: "#compose-btn", actionType: "click", riskHint: "dom", status: "PROMOTED" as const, confidence: 0.97, evidence: [{ capture: "cap-0001" }] };

  // no drift: the observation still matches the promoted evidence signature
  const none = await fake.callAsRoot("discovery.heal@1", {
    contractEvidence: contract,
    freshObservation: { selector: "#compose-btn", actionType: "click" },
    now: 1735689600000,
  });
  if (!none.ok) return { pass: false };
  const noneReport = none.value as { action: string; journal: { appended: boolean } };
  if (noneReport.action !== "none") return { pass: false };
  if (noneReport.journal.appended !== false) return { pass: false }; // no vault routed — honest skip

  // drift → rediscovery → probation (3/3) → promotion
  const promote = await fake.callAsRoot("discovery.heal@1", {
    contractEvidence: contract,
    freshObservation: { selector: "button[data-testid='compose']", actionType: "click" },
    candidate: { id: "cand-1", op: "compose.click@1", selector: "button[data-testid='compose']", actionType: "click", evidence: [{ capture: "cap-0042" }], status: "DRAFT", confidence: 0.93 },
    probes: [
      { candidateId: "cand-1", preState: { clicked: false }, postState: { clicked: true }, passed: true },
      { candidateId: "cand-1", preState: { clicked: false }, postState: { clicked: true }, passed: true },
      { candidateId: "cand-1", preState: { clicked: false }, postState: { clicked: true }, passed: true },
    ],
    now: 1735689600001,
  });
  if (!promote.ok) return { pass: false };
  const promoteReport = promote.value as { action: string; evidenceChain: unknown[]; journal: { appended: boolean } };
  if (promoteReport.action !== "promote") return { pass: false };
  if (!Array.isArray(promoteReport.evidenceChain) || promoteReport.evidenceChain.length !== 4) return { pass: false };
  if (promoteReport.journal.appended !== false) return { pass: false }; // same honest skip

  return { pass: true, noneAction: noneReport.action, promoteAction: promoteReport.action, journaled: false };
}
