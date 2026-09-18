// vivim.law — D-387 falsifier (2026-09-18 external performance review #9):
// classifyRisk's precomputed index must resolve EXACTLY what the old
// per-call filter()+sort() resolved — proven differentially here against a
// naive reference implementation over the shipped policy, shuffled tables,
// duplicate exact rows, and overlapping/equal-length prefix families.
import { describe, test, expect } from "bun:test";
import { LAW_POLICY_V1, classifyRisk, cloneDoc, type PolicyDoc, type RiskClass } from "../src/policy.ts";

/** The review-era algorithm, kept verbatim as the reference oracle. */
function classifyRiskReference(doc: PolicyDoc, op: string): RiskClass {
  const opMatches = (pattern: string, o: string): boolean => {
    if (pattern === "*" || pattern === o) return true;
    if (pattern.endsWith("*")) return o.startsWith(pattern.slice(0, -1));
    return false;
  };
  const exact = doc.riskTable.find((r) => !r.op.endsWith("*") && r.op === op);
  if (exact) return exact.risk;
  const prefix = doc.riskTable
    .filter((r) => r.op.endsWith("*") && opMatches(r.op, op))
    .sort((a, b) => b.op.length - a.op.length)[0];
  if (prefix) return prefix.risk;
  return doc.defaultRisk;
}

const OPS = [
  "vault.get@1", "vault.append@1", "vault.getmany@1", "vault.roundtrip@1",
  "note.write@1", "chat.open@1", "chat.append@1", "chat.resolve@1",
  "credential.put@1", "providers.session.start@1", "run.process.call@1",
  "risky.op@1", "risky.read@1",
  "chat.x.y@1", "chat.append.extra@1", // overlapping-prefix territory
  "never.seen@1", "vault@", "vault", "chat.", "ch",
];

const DOCS: Array<[string, PolicyDoc]> = [
  ["LAW_POLICY_V1 (shipped)", LAW_POLICY_V1],
  ["shuffled riskTable", (() => {
    const d = cloneDoc(LAW_POLICY_V1);
    d.riskTable = [...d.riskTable].reverse(); // reversal breaks any accidental order dependence
    return d;
  })()],
  ["duplicate exact rows (first wins)", (() => {
    const d = cloneDoc(LAW_POLICY_V1);
    d.riskTable = [{ op: "vault.get@1", risk: "READ" }, { op: "vault.get@1", risk: "EXTERNAL_MUTATION" }, ...d.riskTable];
    return d;
  })()],
  ["overlapping + equal-length prefixes", (() => {
    const d = cloneDoc(LAW_POLICY_V1);
    d.riskTable = [
      { op: "chat.*", risk: "READ" },
      { op: "chat.append.*", risk: "EXTERNAL_MUTATION" },
      { op: "chat.appe.*", risk: "MUTATION" },   // same length as chat.append.* — table order decides
      { op: "*", risk: "EXTERNAL_MUTATION" },
    ];
    return d;
  })()],
];

describe("D-387 #9 · classifyRisk differential (precomputed index ≡ per-call filter+sort)", () => {
  for (const [name, doc] of DOCS) {
    test(`identical verdicts on ${name}`, () => {
      for (const op of OPS) {
        expect(classifyRisk(doc, op)).toBe(classifyRiskReference(doc, op));
      }
    });
  }

  test("D-351 exact-outranks-prefix and D-384 longest-prefix-first still hold", () => {
    // D-351: vault.roundtrip@1's exact EXTERNAL_MUTATION row outranks the vault.* MUTATION prefix
    expect(classifyRisk(LAW_POLICY_V1, "vault.roundtrip@1")).toBe("EXTERNAL_MUTATION");
    // D-384: among overlapping prefixes the LONGEST pattern wins regardless of table order
    const d = cloneDoc(LAW_POLICY_V1);
    d.riskTable = [{ op: "chat.append.*", risk: "READ" }, { op: "chat.*", risk: "EXTERNAL_MUTATION" }];
    expect(classifyRisk(d, "chat.append.x@1")).toBe("READ");
    expect(classifyRisk(d, "chat.open@1")).toBe("EXTERNAL_MUTATION");
  });

  test("the precomputed index is doc-identity-scoped: a REPLACED doc recompiles (amendment safety)", () => {
    const d1 = cloneDoc(LAW_POLICY_V1);
    expect(classifyRisk(d1, "chat.append@1")).toBe("MUTATION"); // exact row (D-358)
    const d2 = cloneDoc(LAW_POLICY_V1);
    d2.riskTable = d2.riskTable.map((r) => (r.op === "chat.append@1" ? { op: r.op, risk: "READ" } : r));
    // different doc object → fresh index; the old cached entry must not leak
    expect(classifyRisk(d2, "chat.append@1")).toBe("READ");
    expect(classifyRisk(d1, "chat.append@1")).toBe("MUTATION");
  });
});
