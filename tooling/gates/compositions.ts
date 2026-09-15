// W1 composition-conformance net (seed) — tooling/gates/compositions.ts
// Read-only check over all shipped compositions (compositions/*.json):
//   1. grant-vs-manifest: every granted contract is declared routable by the
//      resolving manifest (contract/engine/provider contributions); every
//      granted port:op capability resolves to a granted contract in the same
//      spec or to a host op whose guarding cap is co-granted.
//   2. bootPhase 0 is exactly one vivim.law entry (spec-level mirror of the
//      recipe invariant in host/src/recipe.ts).
//   3. D-325 invariant: a vivim.law entry granting port:vault.* caps must
//      co-boot vivim.vault in the same spec (forbidden persistence needs a
//      vault to persist to — otherwise the overlay boots UNLOADED).
// 4. grant drift: the same plugin id granted different contracts/caps across
//      compositions is flagged, with an allowlist for intentional scope
//      differences (the net serves either flagship answer — D-316 — so no
//      composition gets a free pass; allowlist entries point at D-records).
//   5. D-332: exported contracts/ vocabulary with zero tree-wide call sites
//      is flagged (vocabulary without a writer/reader — the plan's top risk,
//      backstopped mechanically). Intentional reservations are allowlisted
//      with a D-record pointer, never silently.
// Pure file reads + manifest parses; never boots anything. Wired as the
// `compositions` stage of omega:gate; D-332 extends this net in V2.5.
import { readdirSync, readFileSync, existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { routableOps, HOST_OPS, type PluginManifest } from "@vivim/omega-contracts";
import { HOST_OP_TO_CAP } from "@vivim/omega-host";

interface SpecEntry {
  id: string;
  source: string;
  bootPhase: number;
  grant: { capabilities: string[]; contracts: string[] };
}

/** pluginId → why its cross-composition grant variance is intentional. */
const DRIFT_ALLOWLIST: Record<string, string> = {
  // law grants vary per composition by design: test-minimal (law.json omits the
  // forbidden op entirely) vs vault-durable (agent.json adds vault caps + the
  // reload contract, D-325). The variance is watched, not free — any NEW shape
  // of drift still fails until allowlisted with a pointer.
  "vivim.law": "D-325: per-composition law scope (memory-only law.json … vault-durable agent.json); new shapes fail until allowlisted",
  // vivim.director's surface varies by composition role: console/run carry the
  // full director surface (rules/teach/tick + its action ports), chat.json
  // grants ONLY the resolution half (resolve.classify@1 + resolve.report@1 +
  // the vault ports those two use) — the chat pilot is a resolution consumer,
  // not an automation host (D-359). New shapes still fail until allowlisted.
  "vivim.director": "D-358/D-359: chat.json grants the resolution half only (resolve.classify/report + their vault ports); console/run carry the full director surface",
  // run.json lists the host-op aliases explicitly (with a _note about token-table
  // ordering under an older host); spine.json grants only the guard. Effective
  // authority is identical under the current host (mintTokensFor auto-mints the
  // aliases from the guard; register() is order-independent per the B3 invariant
  // in host/src/ports.ts) — but run.json is a GATE composition with a stale
  // note, so convergence (drop the aliases, refresh the note) is a deliberate
  // follow-up, not a drive-by in this wave.
  "vivim.run": "alias-style variance run.json vs spine.json: same effective authority (HOST_OP_TO_CAP auto-mint); convergence deferred, see _note in run.json",
};

const HOST_OPS_SET = new Set<string>(Object.values(HOST_OPS));

export interface CompositionsResult {
  ok: boolean;
  detail: Record<string, unknown>;
  issues: string[];
}

function manifestOps(specDir: string, entry: SpecEntry): { ops: string[]; found: boolean; detail: string } {
  const manifestPath = resolve(specDir, entry.source, "plugin.json");
  if (!existsSync(manifestPath)) return { ops: [], found: false, detail: `manifest missing: ${manifestPath}` };
  try {
    const m = JSON.parse(readFileSync(manifestPath, "utf-8")) as PluginManifest;
    if (m.id !== entry.id) return { ops: [], found: false, detail: `spec id ${entry.id} != manifest id ${m.id}` };
    // Same listing rule as the host router (contracts/src/manifest.ts) — one
    // source of truth, not a parallel listing.
    return { ops: routableOps(m), found: true, detail: "" };
  } catch (e) {
    return { ops: [], found: false, detail: `manifest unreadable: ${String(e)}` };
  }
}

export async function checkCompositions(ROOT: string): Promise<CompositionsResult> {
  const issues: string[] = [];
  const dir = join(ROOT, "compositions");
  const files = readdirSync(dir).filter((f) => f.endsWith(".json")).sort();
  const grants = new Map<string, Set<string>>(); // pluginId → grant fingerprints
  const grantDetail = new Map<string, Map<string, string[]>>(); // pluginId → fingerprint → spec files
  let entries = 0;

  for (const f of files) {
    let spec: { entries?: SpecEntry[] };
    try {
      spec = JSON.parse(readFileSync(join(dir, f), "utf-8")) as { entries?: SpecEntry[] };
    } catch (e) {
      issues.push(`${f}: unreadable composition (${String(e)})`);
      continue;
    }
    if (!Array.isArray(spec.entries) || spec.entries.length === 0) {
      issues.push(`${f}: empty composition`);
      continue;
    }
    // Check 2 · bootPhase 0 belongs to vivim.law (spec-level mirror).
    const phase0 = spec.entries.filter((e) => e.bootPhase === 0);
    if (phase0.length !== 1 || phase0[0].id !== "vivim.law") {
      issues.push(`${f}: bootPhase 0 must be exactly one entry with id 'vivim.law'`);
    }
    const grantedContracts = new Set<string>();
    for (const e of spec.entries) grantedContracts.add(e.id);
    const contractsInSpec = new Set<string>();
    for (const e of spec.entries) for (const c of e.grant?.contracts ?? []) contractsInSpec.add(c);

    for (const e of spec.entries) {
      entries++;
      if (typeof e.id !== "string" || typeof e.source !== "string") {
        issues.push(`${f}: entry with bad id/source`);
        continue;
      }
      // Check 1a · granted contracts ⊆ manifest routable ops.
      const m = manifestOps(dir, e);
      if (!m.found) {
        issues.push(`${f}: ${e.id}: ${m.detail}`);
        continue;
      }
      for (const c of e.grant?.contracts ?? []) {
        if (!m.ops.includes(c)) issues.push(`${f}: ${e.id} granted routed op ${c} but its manifest does not declare it`);
      }
      // Check 1b · granted port:op caps resolve in-spec (or to a guarded host op).
      for (const cap of e.grant?.capabilities ?? []) {
        if (!cap.startsWith("port:")) continue; // bare host caps checked against HOST_OP_TO_CAP below
        const op = cap.slice("port:".length);
        if (HOST_OPS_SET.has(op)) {
          const guard = (HOST_OP_TO_CAP as Record<string, string>)[op] ?? "";
          if (guard !== "" && !(e.grant?.capabilities ?? []).includes(guard)) {
            issues.push(`${f}: ${e.id} grants ${cap} without its guarding capability ${guard}`);
          }
          continue;
        }
        if (!contractsInSpec.has(op)) {
          issues.push(`${f}: ${e.id} grants capability ${cap} with no routed implementation in this composition`);
        }
      }
      for (const cap of e.grant?.capabilities ?? []) {
        if (cap.startsWith("port:") || cap.startsWith("host.")) continue;
        issues.push(`${f}: ${e.id} grants unknown capability '${cap}' (want port:<op>@<v> or host.*)`);
      }
      // Grant fingerprint for drift check 4.
      const fp = JSON.stringify({
        caps: [...(e.grant?.capabilities ?? [])].sort(),
        contracts: [...(e.grant?.contracts ?? [])].sort(),
      });
      if (!grants.has(e.id)) { grants.set(e.id, new Set()); grantDetail.set(e.id, new Map()); }
      grants.get(e.id)!.add(fp);
      const perFile = grantDetail.get(e.id)!;
      perFile.set(fp, [...(perFile.get(fp) ?? []), f]);
    }

    // Check 3 · D-325 invariant: law with vault caps co-boots a vault.
    const law = spec.entries.find((e) => e.id === "vivim.law");
    const lawVaultCaps = (law?.grant?.capabilities ?? []).filter((c) => c.startsWith("port:vault."));
    if (law && lawVaultCaps.length > 0 && !grantedContracts.has("vivim.vault")) {
      issues.push(
        `${f}: vivim.law grants forbidden-persistence caps (${lawVaultCaps.join(", ")}) ` +
        `but boots no vivim.vault — overlay would boot UNLOADED (D-325 invariant)`,
      );
    }
  }

  // Check 4 · drift (flagged, allowlisted loudly — never silently).
  const drifted: Record<string, { files: string[]; reason: string }> = {};
  for (const [id, fps] of grants) {
    if (fps.size <= 1) continue;
    const filesFor = [...new Set([...(grantDetail.get(id)?.values() ?? [])].flat())].sort();
    const reason = DRIFT_ALLOWLIST[id];
    if (reason) {
      drifted[id] = { files: filesFor, reason };
    } else {
      issues.push(
        `${id}: grant drift across compositions (${filesFor.join(", ")}) with no allowlist entry — ` +
        `add DRIFT_ALLOWLIST[${id}] with a D-record pointer if intentional, else converge the grants`,
      );
    }
  }

  // Check 5 · D-332: exported contracts/ vocabulary with zero tree-wide
  // call sites (vocabulary without a writer/reader). Merged into this net's
  // issues so the gate's `compositions` stage backstops the plan's top risk.
  const detail: Record<string, unknown> = { specs: files.length, entries, driftAllowlisted: drifted };
  try {
    const { checkContractCallSites } = await import("./contract-sites.ts");
    const sites = await checkContractCallSites(ROOT);
    issues.push(...sites.issues);
    detail["contractTypes"] = sites.detail.checked;
    detail["callSiteAllowlisted"] = sites.detail.allowlisted;
  } catch (e) {
    issues.push(`contract call-site check failed to run: ${String(e)}`);
  }

  return {
    ok: issues.length === 0,
    detail,
    issues,
  };
}

if (import.meta.main) {
  const ROOT = join(import.meta.dir, "../..");
  checkCompositions(ROOT).then((r) => {
    console.log(JSON.stringify(r.ok ? { ok: true, ...r.detail } : { ok: false, issues: r.issues }, null, 2));
    process.exit(r.ok ? 0 : 1);
  });
}
