// Ω1 unit evidence: attenuation subset property (seeded, 200 random scope chains),
// consent grant/revocation semantics, policy-table decisions, shadow divergence.
import { describe, test, expect } from "bun:test";
import { mintCap, attenuate, isSubset, parseScope, canonicalScope } from "../src/tokens.ts";
import { ConsentTable, consentIdFor } from "../src/consent.ts";
import { ForbiddenTable, FORBIDDEN_NS, FORBIDDEN_ID_PREFIX, forbiddenVaultId, toRecord, fromRecord } from "../src/forbidden.ts";
import { LAW_POLICY_V1, evalPolicy, classifyRisk, normalizeShadowSpec, type PolicyDoc } from "../src/policy.ts";
import { ShadowAmendment } from "../src/amendment.ts";
import { principalKind } from "@vivim/omega-contracts";

// ---- seeded deterministic PRNG (mulberry32) — the property test is reproducible ----
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const PATH_POOL = ["vault", "notes", "append", "read", "batch", "sealed"];
const CONSTRAINT_POOL = ["ns=email", "ns=cal", "rev=1", "rev=2", "mode=strict"];

function randomScope(rand: () => number): string {
  const nPath = 1 + Math.floor(rand() * 3);
  const path: string[] = [];
  while (path.length < nPath) path.push(PATH_POOL[Math.floor(rand() * PATH_POOL.length)]!);
  const nCon = Math.floor(rand() * 4);
  const cons = [...new Set(Array.from({ length: nCon }, () => CONSTRAINT_POOL[Math.floor(rand() * CONSTRAINT_POOL.length)]!))];
  return [path.join("."), ...cons].join(":");
}

describe("Ω1 tokens — attenuation algebra (property test)", () => {
  test("200 seeded random chains: subset invariant holds at every step; broadening throws", () => {
    const rand = mulberry32(0xc0ffee);
    let attenuations = 0;
    let rejections = 0;
    for (let chain = 0; chain < 200; chain++) {
      const rootScope = randomScope(rand);
      let current = mintCap(rootScope);
      expect(isSubset(current.scope, rootScope)).toBe(true);
      // random attenuation chain: 1..8 steps
      const steps = 1 + Math.floor(rand() * 8);
      for (let s = 0; s < steps; s++) {
        const candidate = randomScope(rand);
        if (isSubset(candidate, current.scope)) {
          // must attenuate cleanly and preserve the invariant vs the previous AND the root
          const child = attenuate(current, candidate);
          attenuations++;
          expect(child.scope).toBe(candidate);
          expect(child.generation).toBe(current.generation);
          expect(isSubset(child.scope, current.scope)).toBe(true);
          expect(isSubset(child.scope, rootScope)).toBe(true); // transitivity
          current = child;
        } else {
          // broadening/foreign scope must THROW — the algebra is fail-closed
          expect(() => attenuate(current, candidate)).toThrow(/attenuation violation/);
          rejections++;
        }
      }
    }
    expect(attenuations).toBeGreaterThan(0);
    expect(rejections).toBeGreaterThan(0);
  });

  test("known cases: constraint narrowing ok, constraint dropping throws, path escape throws", () => {
    const root = mintCap("vault.append:ns=email");
    expect(isSubset("vault.append:ns=email:rev=3", "vault.append:ns=email")).toBe(true);
    expect(attenuate(root, "vault.append:ns=email:rev=3").scope).toBe("vault.append:ns=email:rev=3");
    expect(attenuate(root, "vault.append.batch:ns=email").parent).toBe("vault.append:ns=email");
    expect(() => attenuate(root, "vault.append")).toThrow();              // drops the ns constraint
    expect(() => attenuate(root, "vault.read:ns=email")).toThrow();       // foreign path
    expect(() => attenuate(root, "vault")).toThrow();                    // broadens the path
    expect(() => mintCap("")).toThrow();                                  // malformed
    expect(() => parseScope("a..b")).toThrow();
    expect(() => parseScope("x:not-a-constraint")).toThrow();
  });

  test("constraint clauses are an order-free set; canonicalScope is stable", () => {
    expect(isSubset("vault.append:rev=1:ns=email", "vault.append:ns=email:rev=1")).toBe(true);
    expect(canonicalScope("vault.append:rev=1:ns=email")).toBe(canonicalScope("vault.append:ns=email:rev=1"));
    expect(canonicalScope("vault.append")).toBe("vault.append");
  });
});

describe("Ω1 consent — grants are scoped, revocable, generation-counted", () => {
  test("consent ids are stable hashes: same pair → same id, different pair → different id", () => {
    expect(consentIdFor("root", "risky.op@1")).toBe(consentIdFor("root", "risky.op@1"));
    expect(consentIdFor("root", "risky.op@1")).not.toBe(consentIdFor("omega.risky", "risky.op@1"));
    expect(consentIdFor("root", "risky.op@1")).not.toBe(consentIdFor("root", "risky.read@1"));
    expect(consentIdFor("root", "risky.op@1")).toMatch(/^consent_[0-9a-f]{16}$/);
  });

  test("require → grant → allow → revoke → require again (generation bumps)", () => {
    const t = new ConsentTable();
    const id = t.requireConsent("root", "risky.op@1");
    expect(t.hasMatchingGrant("root", "risky.op@1")).toBeNull();
    const rec = t.grant(id);
    expect(rec.active).toBe(true);
    expect(rec.grantedAt).toBeGreaterThan(0);
    const g1 = t.generation();
    const match = t.hasMatchingGrant("root", "risky.op@1");
    expect(match?.consentId).toBe(id);
    expect(t.activeCount()).toBe(1);
    expect(t.revoke(id)).toBe(true);
    expect(t.generation()).toBeGreaterThan(g1);
    expect(t.hasMatchingGrant("root", "risky.op@1")).toBeNull();
    expect(t.activeCount()).toBe(0);
    expect(t.revoke(id)).toBe(false); // double revoke is a no-op
    // re-grant revives the id with a fresh generation
    const rec2 = t.grant(id);
    expect(rec2.generation).toBeGreaterThan(rec.generation);
    expect(t.hasMatchingGrant("root", "risky.op@1")?.consentId).toBe(id);
  });

  test("grants narrow by principal and scope; malformed ids throw", () => {
    const t = new ConsentTable();
    const id = consentIdFor("root", "risky.op@1");
    t.grant(id, { principal: "someone-else" });
    expect(t.hasMatchingGrant("root", "risky.op@1")).toBeNull(); // principal narrowing
    t.grant(id, { principal: "root", scope: "risky.op@1" });
    expect(t.hasMatchingGrant("root", "risky.op@1")).not.toBeNull();
    t.grant(consentIdFor("root", "other.op@1"), { scope: "risky.op@1" });
    expect(t.hasMatchingGrant("root", "other.op@1")).toBeNull(); // scope narrowing mismatch
    expect(t.activeCount()).toBe(2); // two distinct consent ids live (the id grant was overwritten, not stacked)
    expect(() => t.grant("not-a-consent-id")).toThrow(/malformed consentId/);
  });
});

describe("Ω1 policy — the table decides (data, not switches)", () => {
  test("risk classification: exact row, prefix row, fail-closed default", () => {
    const root = LAW_POLICY_V1;
    expect(evalPolicy(root, "root", "risky.op@1").risk).toBe("EXTERNAL_MUTATION");
    expect(evalPolicy(root, "root", "vault.append@1").risk).toBe("MUTATION");
    expect(evalPolicy(root, "root", "note.write@1").risk).toBe("MUTATION"); // D-351: prefix row repaired notes.* → note.* (the real op family)
    expect(evalPolicy(root, "root", "vault.get@1").risk).toBe("MUTATION");  // prefix mechanism, live row
    expect(evalPolicy(root, "root", "unknown.op@1").risk).toBe("EXTERNAL_MUTATION"); // defaultRisk
  });

  test("D-384: overlapping prefix rows resolve by specificity, not table order", () => {
    const doc: PolicyDoc = {
      ...JSON.parse(JSON.stringify(LAW_POLICY_V1)) as PolicyDoc,
      riskTable: [
        { op: "chat.*", risk: "READ" },
        { op: "chat.append.*", risk: "EXTERNAL_MUTATION" }, // more specific, listed SECOND
      ],
    };
    expect(classifyRisk(doc, "chat.append.v2@1")).toBe("EXTERNAL_MUTATION"); // longest pattern wins
    expect(classifyRisk(doc, "chat.open@1")).toBe("READ");
    // order-independence: flipping the table must not flip the verdict
    const flipped: PolicyDoc = { ...doc, riskTable: [...doc.riskTable].reverse() };
    expect(classifyRisk(flipped, "chat.append.v2@1")).toBe("EXTERNAL_MUTATION");
    expect(classifyRisk(flipped, "chat.open@1")).toBe("READ");
    // exact rows still outrank every prefix (D-351 semantics unchanged)
    const withExact: PolicyDoc = { ...doc, riskTable: [{ op: "chat.append.v2@1", risk: "MUTATION" }, ...doc.riskTable] };
    expect(classifyRisk(withExact, "chat.append.v2@1")).toBe("MUTATION");
  });

  test("risk → decision mapping: MUTATION allow+journal, EXTERNAL_MUTATION require-consent", () => {
    const mut = evalPolicy(LAW_POLICY_V1, "root", "vault.append@1");
    expect(mut.action.decision).toBe("allow");
    expect(mut.action.journal).toBe(true);
    const ext = evalPolicy(LAW_POLICY_V1, "root", "risky.op@1");
    expect(ext.action.decision).toBe("require-consent");
    expect(ext.action.journal).toBe(true);
    const read = evalPolicy(LAW_POLICY_V1, "root", "risky.read@1");
    expect(read.action.decision).toBe("allow");
    expect(read.action.journal).toBe(false);
  });

  test("deny rule table: omega.attacker is denied for every op (deny is sticky)", () => {
    for (const op of ["risky.op@1", "vault.append@1", "echo.ping@1", "unknown.x@9"]) {
      const ev = evalPolicy(LAW_POLICY_V1, "omega.attacker", op);
      expect(ev.action.decision).toBe("deny");
      expect(ev.rule).toBeDefined();
      expect(ev.action.reason).toContain("deny-listed");
    }
  });
});

describe("Ω1 amendment — shadow mode observes, never swaps", () => {
  test("register shadow → divergences recorded and reported; primary stays authoritative", () => {
    const am = new ShadowAmendment(LAW_POLICY_V1);
    expect(am.report().shadow.registered).toBe(false);
    const status = am.registerShadow({ denyExternalMutations: true });
    expect(status.registered).toBe(true);
    expect(am.doc()?.riskDefaults.EXTERNAL_MUTATION.decision).toBe("deny");

    // primary (with consent) vs shadow: allow vs deny → divergence
    const div1 = am.observe("root", "risky.op@1", { decision: "allow", reason: "consent" }, { decision: "deny", reason: "shadow" }, "c_7");
    expect(div1).not.toBeNull();
    expect(div1?.primary.decision).toBe("allow");
    expect(div1?.shadow.decision).toBe("deny");
    expect(div1?.causationId).toBe("c_7");

    // agreement → no divergence recorded
    expect(am.observe("root", "vault.append@1", { decision: "allow", reason: "x" }, { decision: "allow", reason: "x" }, "c_8")).toBeNull();

    const report = am.report();
    expect(report.count).toBe(1);
    expect(report.divergences[0]?.op).toBe("risky.op@1");
    expect(report.swap).toContain("recipe re-compile");

    // re-register resets the ledger; clear-shadow unregisters
    am.registerShadow({ denyExternalMutations: false });
    expect(am.report().count).toBe(0);
    expect(am.clearShadow().registered).toBe(false);
    expect(am.doc()).toBeNull();
  });

  test("normalizeShadowSpec derives from the primary and validates full docs", () => {
    const doc = normalizeShadowSpec(LAW_POLICY_V1, { policyId: "law.policy.shadow", denyExternalMutations: true });
    expect(doc.policyId).toBe("law.policy.shadow");
    expect(doc.riskDefaults.MUTATION.decision).toBe("allow"); // inherited from primary
    expect(doc.riskDefaults.EXTERNAL_MUTATION.decision).toBe("deny"); // overridden
    expect(() => normalizeShadowSpec(LAW_POLICY_V1, { policy: { policyId: "x", version: "1", riskTable: [], defaultRisk: "MUTATION", riskDefaults: {} as never, rules: [] } })).toThrow(/riskDefaults/);
  });
});

describe("D-325 forbidden durability — pure record mapping (vault ns law)", () => {
  test("forbiddenVaultId prefixes the principal; ns and prefix constants stable", () => {
    expect(FORBIDDEN_NS).toBe("law");
    expect(FORBIDDEN_ID_PREFIX).toBe("forbidden:");
    expect(forbiddenVaultId("agent:x")).toBe("forbidden:agent:x");
    expect(() => forbiddenVaultId("")).toThrow(/principal/);
  });

  test("toRecord stamps and sorts; fromRecord round-trips; malformed records read as null", () => {
    const rec = toRecord({ principal: "agent:x", ops: ["vault.append@1", "message.send@1"] });
    expect(rec.principal).toBe("agent:x");
    expect(rec.ops).toEqual(["message.send@1", "vault.append@1"]); // canonical sort
    expect(rec.updatedAt).toBeGreaterThan(0);
    expect(fromRecord(rec)).toEqual({ principal: "agent:x", ops: ["message.send@1", "vault.append@1"] });
    // empty-ops tombstones (clears) round-trip — restart must reproduce the clear
    expect(fromRecord(toRecord({ principal: "agent:x", ops: [] }))).toEqual({ principal: "agent:x", ops: [] });
    // malformed records are skipped, never thrown (reload is honest, never fabricating)
    expect(fromRecord(null)).toBeNull();
    expect(fromRecord({})).toBeNull();
    expect(fromRecord({ principal: "", ops: [] })).toBeNull();
    expect(fromRecord({ principal: "agent:x", ops: [""] })).toBeNull();
    expect(fromRecord({ principal: "agent:x", ops: "message.send@1" })).toBeNull();
  });
});

describe("D-310 forbidden-action overlay — exact-match deny table", () => {
  test("set / isForbidden / clear / list; replace semantics; validation fail-closed", () => {
    const t = new ForbiddenTable();
    expect(t.isForbidden("agent:x", "message.send@1")).toBe(false);
    const e = t.set("agent:x", ["message.send@1", "vault.append@1"]);
    expect(e).toEqual({ principal: "agent:x", ops: ["message.send@1", "vault.append@1"] });
    expect(t.isForbidden("agent:x", "message.send@1")).toBe(true);
    expect(t.isForbidden("agent:x", "message.list@1")).toBe(false); // exact match — siblings unaffected
    expect(t.isForbidden("agent:y", "message.send@1")).toBe(false); // other principals unaffected
    // replace (not merge)
    t.set("agent:x", ["message.list@1"]);
    expect(t.isForbidden("agent:x", "message.send@1")).toBe(false);
    expect(t.isForbidden("agent:x", "message.list@1")).toBe(true);
    // empty array clears
    t.set("agent:x", []);
    expect(t.list()).toEqual([]);
    // fail-closed on shape
    expect(() => t.set("", ["a@1"])).toThrow(/principal/);
    expect(() => t.set("agent:x", "a@1" as never)).toThrow(/array/);
    expect(() => t.set("agent:x", [""])).toThrow(/non-empty/);
    expect(t.clear("agent:missing")).toBe(false);
  });
});

// ---- D-353 — the human principal: kind classification + the narrowed describe read ----

describe("D-353 — principalKind (pure, TOTAL: unknown strings stay legal composition principals)", () => {
  test("grammar table", () => {
    expect(principalKind("agent:a1")).toBe("agent");
    expect(principalKind("agent:")).toBe("agent"); // prefix decides, not the id body
    expect(principalKind("user:ada")).toBe("user");
    expect(principalKind("user:42")).toBe("user");
    expect(principalKind("root")).toBe("host");
    expect(principalKind("µhost-gate")).toBe("host");
    expect(principalKind("µhost")).toBe("host");
    expect(principalKind("vivim.director")).toBe("composition");
    expect(principalKind("vivim.law")).toBe("composition");
    expect(principalKind("omega.risky")).toBe("composition");
  });

  test("TOTAL: never throws, unknown shapes stay composition (classification is never rejection)", () => {
    expect(principalKind("")).toBe("composition");
    expect(principalKind("agent")).toBe("composition"); // no colon — not the identity prefix
    expect(principalKind("usernaut")).toBe("composition");
    expect(principalKind("Agent:1")).toBe("composition"); // case-sensitive prefixes
    expect(principalKind("user:ada:extra")).toBe("user"); // prefix law, not shape law
  });
});

describe("D-353 — ConsentTable.listFor (principal-narrowed active grants only)", () => {
  test("narrowed grants list for their owner only; un-narrowed grants are honestly excluded; revoked excluded; global count unaffected", () => {
    const t = new ConsentTable();
    const adaOp = consentIdFor("user:ada", "risky.op@1");
    const bobOp = consentIdFor("user:bob", "risky.op@1");
    const unNarrowed = consentIdFor("root", "vault.append@1");

    t.grant(adaOp, { principal: "user:ada", scope: "risky.op@1" });
    t.grant(bobOp, { principal: "user:bob", scope: "risky.op@1" });
    t.grant(unNarrowed); // hash-keyed, no principal — cannot be attributed

    const ada = t.listFor("user:ada");
    expect(ada.map((r) => r.consentId)).toEqual([adaOp]); // narrowed only
    expect(t.listFor("user:bob").map((r) => r.consentId)).toEqual([bobOp]);
    expect(t.listFor("user:carol")).toEqual([]); // a sibling user sees nothing

    // un-narrowed grant is live (hasMatchingGrant for root still finds it) but
    // honestly ABSENT from every listFor — it belongs to no one
    expect(t.hasMatchingGrant("root", "vault.append@1")).not.toBeNull();
    expect(t.listFor("root")).toEqual([]);

    // revocation removes from listFor (active only) and does not disturb others
    t.revoke(adaOp);
    expect(t.listFor("user:ada")).toEqual([]);
    expect(t.listFor("user:bob")).toHaveLength(1);

    // the global view (list()) is untouched by the narrowing discipline
    expect(t.list()).toHaveLength(3);
    expect(t.activeCount()).toBe(2);
  });
});
