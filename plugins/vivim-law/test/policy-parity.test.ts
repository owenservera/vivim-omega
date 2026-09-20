// D-351 — the risk parity net.
// Two sources of risk truth exist: the manifest (`Contribution.risk`, collected
// host-side by `riskyOps()`) decides WHETHER law.check@1 fires; the policy
// (`LAW_POLICY_V1.riskTable`, via `classifyRisk()`) decides WHAT the gate says
// once it fires. Nothing in the runtime reconciles them — this net does, at the
// gate layer (the same place composition truth is already enforced), fail-closed.
//
// Domain: every routed contract op with DECLARED non-READ risk, across every
// shipped composition. (READ-declared ops never reach the gate — riskyOps()
// filters them out; engine/provider ops are out of the net's domain by
// D-351's stated scope, which also demands each carries its own deliberate
// answer eventually — see upload/L1-DUAL-RISK-SOURCE.md §5.)
// Fixture rows (`risky.op@1`, `risky.read@1`) are in-domain when a shipped
// composition routes them (law.json, spine.json) — they must keep agreeing.
import { describe, test, expect } from "bun:test";
import { readdirSync, readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { LAW_POLICY_V1, classifyRisk } from "../src/policy.ts";
import type { PluginManifest } from "@vivim/omega-contracts";

const ROOT = join(import.meta.dir, "../../..");
const COMPOSITIONS = join(ROOT, "compositions");

interface GatedRef { composition: string; entry: string; op: string; manifestRisk: string }

function loadGatedRefs(): GatedRef[] {
  const refs: GatedRef[] = [];
  for (const file of readdirSync(COMPOSITIONS)) {
    if (!file.endsWith(".json")) continue;
    const spec = JSON.parse(readFileSync(join(COMPOSITIONS, file), "utf-8"));
    for (const entry of spec.entries ?? []) {
      const manifestPath = join(ROOT, entry.source.replace(/^\.\.\//, ""), "plugin.json");
      if (!existsSync(manifestPath)) {
        throw new Error(`parity net: ${file} entry ${entry.id} points at ${entry.source} with no plugin.json (B1 manifest-or-nothing)`);
      }
      const manifest = JSON.parse(readFileSync(manifestPath, "utf-8")) as PluginManifest;
      const granted: string[] = entry.grant?.contracts ?? [];
      for (const c of manifest.contributions?.contract ?? []) {
        if (!c.risk || c.risk === "READ") continue; // never gate-triggering — outside the net's domain
        const op = `${c.id}@${c.version}`;
        if (!granted.includes(op)) continue; // routed only if the composition grants it
        refs.push({ composition: file.replace(/\.json$/, ""), entry: entry.id, op, manifestRisk: c.risk });
      }
    }
  }
  return refs;
}

describe("D-351 — risk parity net: manifest-declared risk === policy classification", () => {
  const refs = loadGatedRefs();

  test("the net actually sees the gate-visible domain (guards against silent no-op)", () => {
    const distinct = new Set(refs.map((r) => r.op));
    expect(distinct.size).toBeGreaterThanOrEqual(6); // vault.append/compact/roundtrip, providers.session.start, risky.op, note.write
    expect(refs.some((r) => r.op === "vault.roundtrip@1")).toBe(true);
    expect(refs.some((r) => r.op === "providers.session.start@1")).toBe(true);
  });

  test("every routed op with declared risk classifies identically in LAW_POLICY_V1", () => {
    const mismatches = refs
      .map((r) => ({ ...r, policyRisk: classifyRisk(LAW_POLICY_V1, r.op) }))
      .filter((r) => r.policyRisk !== r.manifestRisk);
    const table = mismatches
      .map((m) => `  ${m.composition}/${m.entry}: ${m.op} — manifest says ${m.manifestRisk}, policy classifies ${m.policyRisk}`)
      .join("\n");
    expect(mismatches, `D-351 parity violated — the manifest gate-trigger and the policy gate-truth disagree:\n${table}\nFix the policy table (exact rows outrank prefixes) or the manifest declaration; never let the two sources drift silently.`).toEqual([]);
  });

  test("policy version carries the parity amendments (1.8.0, D-351 + D-356 + D-358 + D-374 + Wave 0 + D-411 + D-412 + D-416)", () => {
    expect(LAW_POLICY_V1.version).toBe("1.8.0");
    // D-416 (S3): law.audit.drain@1 — the manifest declares MUTATION, the policy
    // carries the exact row (never default-riding; the parity net's whole point).
    expect(classifyRisk(LAW_POLICY_V1, "law.audit.drain@1")).toBe("MUTATION");
  });

  test("the three repaired rows classify as declared, standalone of any composition", () => {
    expect(classifyRisk(LAW_POLICY_V1, "vault.roundtrip@1")).toBe("EXTERNAL_MUTATION"); // exact row outranks vault.*
    expect(classifyRisk(LAW_POLICY_V1, "providers.session.start@1")).toBe("MUTATION");  // exact row outranks defaultRisk
    expect(classifyRisk(LAW_POLICY_V1, "note.write@1")).toBe("MUTATION");               // repaired prefix row
  });

  test("D-356: credential.put@1 is vault-internal MUTATION with a deliberate consent bar", () => {
    // The class is vault-internal (not default-riding): the exact row decides.
    expect(classifyRisk(LAW_POLICY_V1, "credential.put@1")).toBe("MUTATION");
    // The consent bar is POLICY DATA (a rule), not a class misstatement —
    // storing a credential requires consent even though the class is MUTATION.
    const rule = LAW_POLICY_V1.rules.find((r) => r.match.op === "credential.put@1");
    expect(rule?.decision).toBe("require-consent");
  });

  test("D-358: the chat pilot's MUTATION ops classify as declared (exact rows, never default-riding)", () => {
    expect(classifyRisk(LAW_POLICY_V1, "chat.open@1")).toBe("MUTATION");
    expect(classifyRisk(LAW_POLICY_V1, "chat.append@1")).toBe("MUTATION");
  });

  test("Wave 0: the forge bootstrap op classifies as catalog-declared (exact row, never default-riding)", () => {
    expect(classifyRisk(LAW_POLICY_V1, "forge.author.init@1")).toBe("MUTATION");
  });
});
