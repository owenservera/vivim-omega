// vivim.providers — test/providers.test.ts (D-319, Ω14.1 gate evidence)
// Pure derivation tables (deriveRegistry/asRealization) + the manifest check +
// the end-to-end realization loop: map → verify (real vault writes) → registry
// reads back PROMOTED rows sourced from the vault, through the real µhost.
import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { mkdirSync, rmSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { bootWithRecovery, compileComposition, ensureVault } from "@vivim/omega-host";
import type { BootedHost } from "@vivim/omega-host";
import type { CompositionSpec, PortResult } from "@vivim/omega-contracts";
import { parseManifest, validateManifest } from "@vivim/omega-sdk";
import { asRealization, deriveRegistry } from "../src/registry.ts";
import { omegaTmp } from "@vivim/omega-platform"; // D-372 Phase 3: scratch through the seam

const OMEGA_ROOT = join(import.meta.dir, "../../..");
const hosts: BootedHost[] = [];
afterAll(async () => { await Promise.all(hosts.map((h) => h.shutdown().catch(() => {}))); }, 20_000);

// ---- pure tables ----

function realization(over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    archetypeSlug: "message.send",
    providerId: "provider.email.file",
    providerClass: "SIMULATOR",
    status: "PROMOTED",
    discoverySessionRef: null,
    opMapRef: null,
    entityMapRef: null,
    streamRefs: [],
    evidenceRefs: [{ ns: "discovery", id: "promotion:r1", rev: 1 }],
    supersedes: null,
    createdAt: 1735689600000,
    ...over,
  };
}

describe("vivim.providers pure — deriveRegistry/asRealization tables", () => {
  test("entries derive from realizations (not manifests); sorted; refs carry vault revs", () => {
    const entries = deriveRegistry({
      realizations: [
        { ...realization({ archetypeSlug: "message.search", status: "DRAFT" }), rev: 1 } as never,
        { ...realization(), rev: 2 } as never,
      ],
      activePluginIds: new Set(["provider.email.file"]),
    });
    expect(entries).toHaveLength(2);
    // deterministic order: providerId asc, then archetype asc
    expect(entries.map((e) => e.archetypeSlug)).toEqual(["message.search", "message.send"]);
    const send = entries.find((e) => e.archetypeSlug === "message.send")!;
    expect(send.status).toBe("PROMOTED");
    expect(send.activeInComposition).toBe(true); // provider compartment live
    expect(send.realizationRef).toEqual({ ns: "providers", id: "realization:message.send:provider.email.file", rev: 2 });
    expect(send.aggregateScore).toBe(0); // placeholder until verify scores integrate
    const draft = entries.find((e) => e.archetypeSlug === "message.search")!;
    expect(draft.status).toBe("DRAFT");
  });

  test("inactive provider reads inactive; manifest+ops fallback when no plugin ids", () => {
    const recs = [{ ...realization(), rev: 1 } as never];
    expect(deriveRegistry({ realizations: recs, activePluginIds: new Set() })[0]!.activeInComposition).toBe(false);
    expect(deriveRegistry({ realizations: recs }).map((e) => e.activeInComposition)).toEqual([false]);
  });

  test("asRealization rejects malformed rows (missing fields, bad status, bad rev)", () => {
    expect(asRealization(realization(), 1)).not.toBeNull();
    expect(asRealization({ ...realization(), status: "MAYBE" }, 1)).toBeNull();
    expect(asRealization({ ...realization(), archetypeSlug: "" }, 1)).toBeNull();
    expect(asRealization(realization(), 0)).toBeNull();
    expect(asRealization(realization(), "1")).toBeNull();
    expect(asRealization(null, 1)).toBeNull();
    // unknown provider class coerces to SIMULATOR (forward-compatible read)
    expect(asRealization({ ...realization(), providerClass: "FUTURE" }, 1)?.providerClass).toBe("SIMULATOR");
  });
});

// ---- manifest ----

describe("vivim.providers manifest — parses + validates through @vivim/omega-sdk", () => {
  test("plugin.json: 3 contract ops, exact caps, zero validator issues", () => {
    const raw = JSON.parse(readFileSync(join(import.meta.dir, "../plugin.json"), "utf-8"));
    const parsed = parseManifest(raw);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) throw new Error(parsed.errors.join("; "));
    expect(parsed.value.id).toBe("vivim.providers");
    expect(parsed.value.contributions.contract?.map((e) => `${e.id}@${e.version}`).sort()).toEqual([
      "providers.realization.get@1", "providers.registry@1", "providers.session.start@1",
    ]);
    expect(parsed.value.capabilities.requested).toEqual([
      "port:vault.append@1", "port:vault.get@1", "port:vault.query@1", "port:law.registry@1",
    ]);
    expect(validateManifest(parsed.value)).toEqual([]);
  });
});

// ---- end-to-end: the G1 loop closed through the real µhost ----

describe("D-319 — realization loop end-to-end (map → verify → registry reads PROMOTED)", () => {
  let host: BootedHost;

  beforeAll(async () => {
    // shipped discovery-mind.json (now carrying vivim.providers) with a unique vault dataDir
    const SPEC = join(OMEGA_ROOT, "compositions/discovery-mind.json");
    const spec = JSON.parse(readFileSync(SPEC, "utf-8")) as CompositionSpec;
    const root = omegaTmp("omega-providers-test", `loop-${Date.now()}-${Math.floor(Math.random() * 1e6)}`);
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
    const st = host.router.status();
    expect((st.compartments as Record<string, { state: string }>)["vivim.law"]?.state).toBe("active");
    // A1 canary, dormant-aware (D-331): the wired pipeline registers dormant
    // with the full route table — first touch (the map test below) activates.
    expect(st.dormant).toEqual([
      "discovery.inference", "discovery.mapping", "discovery.verification",
      // W1 (D-385): the parser-contribution carriers ride dormant with empty grants
      "provider.llm", "vivim.chat",
      "vivim.providers", "vivim.vault",
    ]);
  }, 60_000);

  async function root<T>(op: string, payload: unknown): Promise<T> {
    const r: PortResult = await host.router.callAsRoot(op, payload);
    expect(r.ok).toBe(true);
    if (!r.ok) throw new Error(`${op} failed: ${r.error} ${r.detail ?? ""}`);
    return r.value as T;
  }

  test("map → verify with provider → registry returns PROMOTED rows sourced from the vault", async () => {
    // seed probe evidence the verifier can resolve (proof substrate must exist first)
    for (const id of ["probe-a", "probe-b"]) {
      const s = await host.router.callAsRoot("vault.append@1", { ns: "probe", id, data: { suite: "realization", pass: true } });
      expect(s.ok).toBe(true);
    }
    const pack = JSON.parse(readFileSync(join(OMEGA_ROOT, "packs/domain-email/plugin.json"), "utf-8"));
    const candidates = [
      { id: "sc-send", op: "message.send", selector: "button.send", riskHint: "EXTERNAL_MUTATION", evidence: [{ ns: "probe", id: "probe-a", rev: 1 }], confidence: 0.9 },
      { id: "sc-search", op: "message.search", selector: "button.search", riskHint: "READ", evidence: [{ ns: "probe", id: "probe-b", rev: 1 }], confidence: 0.9 },
    ];
    const mapped = await root<{ satisfied: boolean; bindings: Array<{ blueprintOp: string; candidateId: string }> }>(
      "discovery.map@1", { candidates, blueprint: pack, runId: "prov-loop" },
    );
    // partial blueprint coverage → unsatisfied overall, but OUR two bindings hold
    expect(mapped.satisfied).toBe(false);
    expect(mapped.bindings.map((b) => `${b.blueprintOp}=${b.candidateId}`).sort()).toEqual([
      "message.search@1=sc-search",
      "message.send@1=sc-send",
    ]);
    const probes = mapped.bindings.map((b, i) => ({
      candidateId: b.candidateId,
      passed: true,
      evidence: [{ ns: "probe", id: i === 0 ? "probe-a" : "probe-b", rev: 1 }],
      note: "e2e passing probe",
    }));
    // NOTE: 2 bindings × default policy (threshold 0.95, requiredProbes 3): one passing
    // probe each is NOT enough to promote — but the bindings WERE evaluated, so they
    // record TESTING (still under evaluation), not DRAFT. Proof failed would be
    // REQUIRES_REDISCOVERY; never-probed would be no record at all.
    const v1 = await root<{ promoted: string[]; realizationsWritten: number; realizations: Array<{ id: string; status: string }> }>("discovery.verify@1", {
      mapping: { bindings: mapped.bindings, satisfied: mapped.satisfied },
      probes, runId: "prov-loop-1", provider: { id: "provider.email.file" },
    });
    expect(v1.promoted).toEqual([]); // probeCount 1 < requiredProbes 3 → not promoted (proof, not confidence)
    expect(v1.realizationsWritten).toBe(2);
    expect(v1.realizations.map((r) => r.status)).toEqual(["TESTING", "TESTING"]);
    // ...then the real promotion: 3 passing probes per binding
    const probes3 = mapped.bindings.flatMap((b, i) => [0, 1, 2].map((k) => ({
      candidateId: b.candidateId, passed: true,
      evidence: [{ ns: "probe", id: i === 0 ? "probe-a" : "probe-b", rev: 1 }],
      note: `e2e probe ${k}`,
    })));
    const v2 = await root<{ promoted: string[]; realizationsWritten: number; realizations: Array<{ id: string; status: string }> }>(
      "discovery.verify@1", {
        mapping: { bindings: mapped.bindings, satisfied: mapped.satisfied },
        probes: probes3, runId: "prov-loop-2", provider: { id: "provider.email.file" },
      },
    );
    expect(v2.promoted.sort()).toEqual(["sc-search", "sc-send"]);
    expect(v2.realizationsWritten).toBe(2);
    // the registry reads them back from the vault — G1 closed
    const reg = await root<{ entries: Array<Record<string, unknown>>; skipped: unknown[] }>("providers.registry@1", {});
    expect(reg.skipped).toEqual([]);
    expect(reg.entries).toHaveLength(2);
    const byArchetype = new Map(reg.entries.map((e) => [e.archetypeSlug, e]));
    expect(byArchetype.get("message.send")).toMatchObject({ providerId: "provider.email.file", status: "PROMOTED" });
    expect(byArchetype.get("message.search")).toMatchObject({ providerId: "provider.email.file", status: "PROMOTED" });
    for (const e of reg.entries) {
      expect((e.realizationRef as { ns: string }).ns).toBe("providers");
      expect((e.realizationRef as { rev: number }).rev).toBeGreaterThanOrEqual(1);
    }
    // direct read agrees with the registry row
    const get = await root<{ realization: Record<string, unknown> | null; rev: number | null }>(
      "providers.realization.get@1", { archetypeSlug: "message.send", providerId: "provider.email.file" },
    );
    expect(get.realization).toMatchObject({ status: "PROMOTED", providerClass: "SIMULATOR" });
    expect(get.rev).toBeGreaterThanOrEqual(1);
    const miss = await root<{ realization: null; rev: null }>(
      "providers.realization.get@1", { archetypeSlug: "message.archive", providerId: "provider.email.file" },
    );
    expect(miss).toEqual({ realization: null, rev: null });
  });

  test("D-326 — registry reads all five statuses from the real vault (DEGRADED/TESTING are healing's)", async () => {
    // Writer-honest shapes (same fields verify/heal append); the target here is
    // the READER — writers are proven by the verify suite above and healing's
    // realization-writes lifecycle test. No registry logic change (D-326), only
    // proof it already handles every status live.
    const healingShaped = [
      { slug: "message.move", status: "DEGRADED" },
      { slug: "message.flag", status: "TESTING" },
      { slug: "message.archive", status: "REQUIRES_REDISCOVERY" },
    ];
    for (const { slug, status } of healingShaped) {
      const w = await host.router.callAsRoot("vault.append@1", {
        ns: "providers",
        id: `realization:${slug}:provider.email.file`,
        data: {
          archetypeSlug: slug, providerId: "provider.email.file", providerClass: "SIMULATOR", status,
          discoverySessionRef: null, opMapRef: null, entityMapRef: null, streamRefs: [],
          evidenceRefs: [{ ns: "discovery", id: "promotion:prov-loop-2", rev: 1 }],
          supersedes: null, createdAt: Date.now(),
        },
      });
      expect(w.ok).toBe(true);
    }
    const reg = await root<{ entries: Array<Record<string, unknown>>; skipped: unknown[] }>("providers.registry@1", {});
    expect(reg.skipped).toEqual([]);
    const byArchetype = new Map(reg.entries.map((e) => [e.archetypeSlug, e]));
    // verify's PROMOTED rows from the previous test still read back …
    expect(byArchetype.get("message.send")).toMatchObject({ status: "PROMOTED" });
    // … alongside every healing-side status, each with a live rev ref.
    expect(byArchetype.get("message.move")).toMatchObject({ providerId: "provider.email.file", status: "DEGRADED" });
    expect(byArchetype.get("message.flag")).toMatchObject({ providerId: "provider.email.file", status: "TESTING" });
    expect(byArchetype.get("message.archive")).toMatchObject({ providerId: "provider.email.file", status: "REQUIRES_REDISCOVERY" });
    for (const slug of ["message.move", "message.flag", "message.archive"]) {
      const ref = byArchetype.get(slug)?.realizationRef as { ns: string; id: string; rev: number };
      expect(ref).toMatchObject({ ns: "providers", id: `realization:${slug}:provider.email.file` });
      expect(ref.rev).toBeGreaterThanOrEqual(1);
    }
  });
});
