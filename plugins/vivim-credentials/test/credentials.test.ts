// vivim.credentials — test/credentials.test.ts (D-356, XC-2 write side)
// Pure tables (record validators + the redaction pass) + the manifest gate +
// the end-to-end spine through the real µhost: put consent ceremony (the
// D-356 policy rule), use by reference, redact through the gate.
import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { mkdirSync, rmSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { bootWithRecovery, compileComposition, ensureVault } from "@vivim/omega-host";
import type { BootedHost } from "@vivim/omega-host";
import type { CompositionSpec, PortResult } from "@vivim/omega-contracts";
import { parseManifest, validateManifest } from "@vivim/omega-sdk";
import { asCredentialRecord, credentialVaultId, fromRecord } from "../src/record.ts";
import { applyRedaction, REDACTION_POLICY_V1, REDACT_MAX_BYTES } from "../src/redact.ts";
import { omegaTmp } from "@vivim/omega-platform"; // D-372 Phase 3: scratch through the seam

const OMEGA_ROOT = join(import.meta.dir, "../../..");
const hosts: BootedHost[] = [];
afterAll(async () => { await Promise.all(hosts.map((h) => h.shutdown().catch(() => {}))); }, 20_000);

// ---- pure: record validators ----

describe("D-356 pure — asCredentialRecord fails closed", () => {
  test("happy path: sim-marked reference row, meta preserved", () => {
    const rec = asCredentialRecord({ credentialId: "llm-main", sim: true, meta: { provider: "provider.llm" } }, 1735689600000);
    expect(rec).toEqual({
      credentialId: "llm-main", kind: "sim-synthetic", sim: true, createdAt: 1735689600000, meta: { provider: "provider.llm" },
    });
    expect(credentialVaultId("llm-main")).toBe("credential:llm-main");
  });

  test("non-sim put refused — live secrets never enter the sandbox (SURFACES.md law 3)", () => {
    expect(() => asCredentialRecord({ credentialId: "x", sim: false }, 0)).toThrow(/sim must be true/);
    expect(() => asCredentialRecord({ credentialId: "x" }, 0)).toThrow(/sim must be true/);
  });

  test("material-shaped fields refused at top level and inside meta (fail-closed)", () => {
    expect(() => asCredentialRecord({ credentialId: "x", sim: true, value: "sk-abcdef1234567890" }, 0)).toThrow(/REFERENCES only/);
    expect(() => asCredentialRecord({ credentialId: "x", sim: true, secret: "hunter2" }, 0)).toThrow(/secret-material-shaped/);
    expect(() => asCredentialRecord({ credentialId: "x", sim: true, meta: { token: "t" } }, 0)).toThrow(/meta\.token/);
  });

  test("credentialId grammar: non-empty, no ':', bounded", () => {
    expect(() => asCredentialRecord({ credentialId: "", sim: true }, 0)).toThrow(/non-empty/);
    expect(() => asCredentialRecord({ credentialId: "a:b", sim: true }, 0)).toThrow(/':'/);
    expect(() => asCredentialRecord({ credentialId: "x".repeat(129), sim: true }, 0)).toThrow(/128/);
  });

  test("fromRecord: roundtrip + malformed rows are null (readers skip, never throw)", () => {
    const rec = asCredentialRecord({ credentialId: "k", sim: true }, 42);
    expect(fromRecord(structuredClone(rec))).toEqual(rec);
    expect(fromRecord({ credentialId: "k", kind: "sim-synthetic", sim: false, createdAt: 1 })).toBeNull();
    expect(fromRecord({ credentialId: "k", kind: "live", sim: true, createdAt: 1 })).toBeNull();
    expect(fromRecord("junk")).toBeNull();
  });
});

// ---- pure: the redaction pass (M12 policy data) ----

describe("D-356 pure — REDACTION_POLICY_V1 (M12: redact-before-append)", () => {
  const CAPTURE = [
    "POST /login HTTP/1.1",
    "x-api-key: sk-live-abcdef0123456789",
    "authorization: Bearer eyJhbGciOi.eyJzdWIi",
    "content-type: application/json",
    "",
    "Set-Cookie: sid=9f8e7d6c5b4a; Path=/; HttpOnly",
    "",
    "HTTP/1.1 302 Found",
    "Location: https://app.example.test/next?token=topsecret123&next=%2Fhome&id=42",
  ].join("\n");

  test("header names, cookie pairs, and URL params are redacted; benign fields survive", () => {
    const r = applyRedaction(CAPTURE);
    expect(r.redacted).toContain("x-api-key: [REDACTED]");
    expect(r.redacted).toContain("authorization: [REDACTED]");
    expect(r.redacted).toContain("Set-Cookie: [REDACTED]; Path=/; HttpOnly");
    expect(r.redacted).toContain("token=[REDACTED]&next=%2Fhome&id=42");
    expect(r.redacted).toContain("content-type: application/json"); // benign survives
    expect(r.redactions).toBeGreaterThanOrEqual(4);
    expect(r.policyVersion).toBe(REDACTION_POLICY_V1.version);
    // the known material is absent from every stored byte
    expect(r.redacted).not.toContain("sk-live-abcdef0123456789");
    expect(r.redacted).not.toContain("topsecret123");
    expect(r.redacted).not.toContain("9f8e7d6c5b4a");
  });

  test("JSON-encoded captures stay valid JSON after redaction (structure preserved)", () => {
    const doc = JSON.stringify({ request: { headers: { "x-api-key": "sk-fixture-0123456789abcdef", "set-cookie": "sid=9f8e7d6c5b4a; Path=/" } } });
    const r = applyRedaction(doc);
    const parsed = JSON.parse(r.redacted) as { request: { headers: Record<string, string> } };
    expect(parsed.request.headers["x-api-key"]).toBe("[REDACTED]");
    expect(parsed.request.headers["set-cookie"]!.startsWith("[REDACTED]")).toBe(true);
    expect(r.redacted).not.toContain("sk-fixture-0123456789abcdef");
    expect(r.redacted).not.toContain("9f8e7d6c5b4a");
  });

  test("deterministic: same bytes + policy ⇒ byte-identical output and count", () => {
    const a = applyRedaction(CAPTURE);
    const b = applyRedaction(CAPTURE);
    expect(a).toEqual(b);
  });

  test("value shapes catch key material without a name (bearer/sk-/ghp_)", () => {
    const r = applyRedaction("cfg: Bearer abc123 and sk-0123456789abcdef but also gh p none");
    expect(r.redacted).toContain("cfg: [REDACTED] and [REDACTED] but also gh p none");
  });

  test("oversized capture refused fail-closed (never silent truncation)", () => {
    const big = "x".repeat(REDACT_MAX_BYTES + 1);
    expect(() => applyRedaction(big)).toThrow(/exceeds|refused fail-closed/);
  });
});

// ---- manifest gate ----

describe("D-356 manifest — the spine declares three contracts with law-compliant risk", () => {
  test("plugin.json parses, validates, and its parity-relevant rows match policy 1.2.0", () => {
    const raw = JSON.parse(readFileSync(join(OMEGA_ROOT, "plugins/vivim-credentials/plugin.json"), "utf-8"));
    const parsed = parseManifest(raw);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) throw new Error(parsed.errors.join("; "));
    const issues = validateManifest(parsed.value);
    expect(issues).toEqual([]);
    expect(parsed.value.contributions.contract?.map((c) => `${c.id}@${c.version}:${c.risk}`)).toEqual([
      "credential.put@1:MUTATION", "credential.use@1:READ", "credential.redact@1:READ",
    ]);
  });
});

// ---- end-to-end: the spine through the real µhost ----

describe("D-356 end-to-end — put ceremony, use by reference, redact through the gate", () => {
  let host: BootedHost;

  beforeAll(async () => {
    const SPEC = join(OMEGA_ROOT, "compositions/credentials.json");
    const spec = JSON.parse(readFileSync(SPEC, "utf-8")) as CompositionSpec;
    const root = omegaTmp("omega-credentials-test", `spine-${Date.now()}-${Math.floor(Math.random() * 1e6)}`);
    rmSync(root, { recursive: true, force: true });
    const vaultDir = join(root, "vault");
    mkdirSync(vaultDir, { recursive: true });
    const shipped = JSON.parse(JSON.stringify(spec));
    shipped.entries.find((e: { id: string }) => e.id === "vivim.vault").config.dataDir = join(root, "vault-data");
    const { rootKey } = ensureVault(vaultDir);
    const { recipe, buildDir } = compileComposition(shipped, join(SPEC, ".."), vaultDir, rootKey);
    const booted = await bootWithRecovery(vaultDir, join(buildDir, "recipe.json"));
    expect(booted.report.booted).toBe(true);
    if (!booted.host) throw new Error(`boot failed: ${booted.report.reason}`);
    host = booted.host;
    hosts.push(host);
  }, 60_000);

  async function root<T>(op: string, payload: unknown): Promise<T> {
    const r: PortResult = await host.router.callAsRoot(op, payload);
    expect(r.ok).toBe(true);
    if (!r.ok) throw new Error(`${op} failed: ${r.error} ${r.detail ?? ""}`);
    return r.value as T;
  }

  test("put without consent → REFUSED require-consent (the D-356 policy rule) → grant → put ok", async () => {
    const first = await host.router.callAsRoot("credential.put@1", { credentialId: "llm-main", sim: true, meta: { purpose: "falsifier" } });
    expect(first.ok).toBe(false);
    if (first.ok) throw new Error("put should have required consent");
    expect(first.error).toBe("REFUSED");
    expect(first.detail).toContain("consent required");
    const consentId = /consent required: (consent_[0-9a-f]+)/.exec(first.detail ?? "")?.[1];
    expect(consentId).toMatch(/^consent_[0-9a-f]+$/);
    await root("law.consent.grant@1", { consentId });
    const second = await host.router.callAsRoot<{ credentialId: string; rev: number }>("credential.put@1", { credentialId: "llm-main", sim: true, meta: { purpose: "falsifier" } });
    expect(second.ok).toBe(true);
    expect(second.value.credentialId).toBe("llm-main");
  });

  test("use returns the reference row by credentialId — never material", async () => {
    const used = await root<{ credential: { credentialId: string; sim: boolean; kind: string }; rev: number }>(
      "credential.use@1", { credentialId: "llm-main" },
    );
    expect(used.credential.credentialId).toBe("llm-main");
    expect(used.credential.sim).toBe(true);
    expect(used.credential.kind).toBe("sim-synthetic");
  });

  test("redact runs through the real gate (READ: never gated, always journaled-free) and redacts", async () => {
    const r = await root<{ redacted: string; redactions: number; policyVersion: string }>(
      "credential.redact@1", { bytes: "authorization: Bearer xyz.abc.def; next=/a?token=q99" },
    );
    expect(r.redacted).toContain("authorization: [REDACTED]");
    expect(r.redacted).toContain("token=[REDACTED]");
    expect(r.redactions).toBe(2);
    expect(r.policyVersion).toBe(REDACTION_POLICY_V1.version);
  });

  test("vault holds only the reference row — its bytes contain no material field", async () => {
    const got = await root<{ data: Record<string, unknown> }>("vault.get@1", { ns: "credentials", id: "credential:llm-main" });
    expect(got.data.credentialId).toBe("llm-main");
    expect(JSON.stringify(got.data)).not.toMatch(/"(value|secret|key|password|token)"/);
  });
});
