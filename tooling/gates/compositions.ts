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
//   6. D-351/D-376 risk parity: every routed op whose manifest declares non-READ
//      risk must classify IDENTICALLY in LAW_POLICY_V1 — the two risk sources
//      (manifest decides WHETHER the gate fires, policy decides WHAT it says)
//      may never disagree. Formerly test-only (policy-parity.test.ts); now a
//      gate-stage check so a seeded undeclared risk fails with a named diagnostic.
//   7. D-377 matrix conformance: compositions/_matrix.json is the source of
//      truth — every shipped spec must regenerate byte-identical from it.
//      A drifted hand-edit fails here with a named first-diff line.
//   8. D-420 shippability fence: the shippable-v1 composition is NAMED by its
//      `SHIPPABLE-V1 (D-420)` note marker (matrix note → regenerate, D-377),
//      and no composition carrying the marker may boot an AI-API realization
//      (provider.llm today) — the mechanical analog of FORGE_IN_PRODUCT for
//      the AI-API drift class (D-418's prose drift, made structurally
//      impossible). Three named refusals: SHIPPABLE_V1_MISSING,
//      SHIPPABLE_V1_UNTAGGED, AI_API_IN_SHIPPABLE. Runs when the caller opts
//      in (opts.shippableFence — the gate stage and the standalone stage CLI
//      pass true; fixture rigs omit it so their assertions stay about their
//      own checks — the fence is falsifier-tested in shippable-fence.test.ts).
// Pure file reads + manifest parses; never boots anything. Wired as the
// `compositions` stage of omega:gate; D-332 extends this net in V2.5.
import { readdirSync, readFileSync, existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { routableOps, HOST_OPS, type PluginManifest } from "@vivim/omega-contracts";
import { HOST_OP_TO_CAP } from "@vivim/omega-contracts";
import { LAW_POLICY_V1, classifyRisk } from "@vivim/plugin-vivim-law/src/policy.ts";
import { emitCompositions } from "../generate/generate.ts";

interface SpecEntry {
  id: string;
  source: string;
  bootPhase: number;
  grant: { capabilities: string[]; contracts: string[] };
}

// ---- Check 8 · the D-420 shippability fence (pure — hand-built in tests) ----

/** The note marker that NAMES a composition shippable-v1 (D-420). Lives in
 *  _matrix.json's note for the spec (the D-377 source of truth) and renders
 *  into the spec's `_note` on regeneration. */
export const SHIPPABLE_MARKER = "SHIPPABLE-V1 (D-420)";

/** The composition D-420 names shippable-v1 (browser.json, D-357's M0 GATE).
 *  Succeeding it is an amendment to D-420, not a note edit. */
export const SHIPPABLE_V1_NAME = "browser";

/** AI-API realizations (D-420 data): a shippable-tagged composition refuses
 *  them — no AI-API realization ships in v1 (D-418). provider.browser is
 *  BROWSER_MEDIATED, not an AI-API — it is what the shippable composition
 *  EXISTS to boot. A new AI-API realization joins this set by amendment. */
export const AI_API_REALIZATIONS: readonly string[] = ["provider.llm"];

export interface ShippableSpecInput {
  name: string;
  note: string;
  entryIds: string[];
}

export interface ShippableFenceIssue {
  check: string;
  subject: string;
  reason: string;
  fix: string;
}

export function checkShippableFence(specs: ShippableSpecInput[]): ShippableFenceIssue[] {
  const issues: ShippableFenceIssue[] = [];
  const tagged = specs.filter((s) => s.note.includes(SHIPPABLE_MARKER));
  if (tagged.length === 0) {
    issues.push({
      check: "SHIPPABLE_V1_MISSING",
      subject: "compositions/*.json",
      reason: `no composition carries the ${SHIPPABLE_MARKER} marker — the shippable-v1 boundary is unnamed`,
      fix: `restore the marker to ${SHIPPABLE_V1_NAME}'s note in _matrix.json and regenerate (D-377), or amend D-420 to name a successor`,
    });
  }
  if (!tagged.some((s) => s.name === SHIPPABLE_V1_NAME)) {
    issues.push({
      check: "SHIPPABLE_V1_UNTAGGED",
      subject: `${SHIPPABLE_V1_NAME}.json`,
      reason: `the shippable-v1 composition named by D-420 (${SHIPPABLE_V1_NAME}) does not carry the ${SHIPPABLE_MARKER} marker`,
      fix: `restore the marker in _matrix.json's ${SHIPPABLE_V1_NAME} note and regenerate, or amend D-420 to name a successor`,
    });
  }
  for (const s of tagged) {
    for (const id of s.entryIds) {
      if (AI_API_REALIZATIONS.includes(id)) {
        issues.push({
          check: "AI_API_IN_SHIPPABLE",
          subject: `${s.name}.json/${id}`,
          reason: `shippable-tagged composition boots AI-API realization ${id} — no AI-API realization ships in v1 (D-418/D-420)`,
          fix: `drop the entry from the shippable composition, or untag it if it is internal proving (amend D-420 if the shippable-v1 name changed)`,
        });
      }
    }
  }
  return issues;
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
  // W1 (D-385): provider.llm + vivim.chat ride along in discovery-mind.json as
  // PARSER-contribution carriers — the W1 falsifier's compile ceremony must
  // SIGN the manifests that declare the governed parsers (D-355). Grants are
  // deliberately EMPTY there (parser contributions register no op — D-355
  // governance data, never routable), while chat/console/llm.json grant their
  // contract ops. The variance IS the design: same manifests, different roles.
  "provider.llm": "D-385: discovery-mind.json carries the parser contribution with empty grants (signed manifest, never spawned); chat/console/llm.json grant the contract ops",
  "vivim.chat": "D-385: discovery-mind.json carries the parser contribution with empty grants (signed manifest, never spawned); chat.json grants the chat ops",
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

export async function checkCompositions(
  ROOT: string,
  opts: { compositionsDir?: string; shippableFence?: boolean } = {},
): Promise<CompositionsResult> {
  const issues: string[] = [];
  const dir = opts.compositionsDir ?? join(ROOT, "compositions");
  let matrixOk = false; // check 7 result (read in detail below)
  // `_`-prefixed files are not specs (_matrix.json is the D-377 source of truth).
  const files = readdirSync(dir).filter((f) => f.endsWith(".json") && !f.startsWith("_")).sort();
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

  // Check 6 · D-351/D-376 risk parity: manifest-declared risk === policy
  // classification, for every ROUTED op with declared non-READ risk across
  // every shipped composition (the same domain policy-parity.test.ts pins;
  // here it fails the GATE, not just a test file).
  let parityChecked = 0;
  for (const f of files) {
    let spec: { entries?: SpecEntry[] };
    try {
      spec = JSON.parse(readFileSync(join(dir, f), "utf-8")) as { entries?: SpecEntry[] };
    } catch { continue; } // unreadable specs already flagged in the main loop
    for (const e of spec.entries ?? []) {
      const manifestPath = resolve(dir, e.source, "plugin.json");
      if (!existsSync(manifestPath)) continue; // manifest missing already flagged
      let m: PluginManifest;
      try { m = JSON.parse(readFileSync(manifestPath, "utf-8")) as PluginManifest; } catch { continue; }
      const granted = new Set(e.grant?.contracts ?? []);
      for (const c of m.contributions?.contract ?? []) {
        if (!c.risk || c.risk === "READ") continue; // never gate-triggering — outside the net's domain
        const op = `${c.id}@${c.version}`;
        if (!granted.has(op)) continue; // routed only if the composition grants it
        parityChecked++;
        const policyRisk = classifyRisk(LAW_POLICY_V1, op);
        if (policyRisk !== c.risk) {
          issues.push(
            `${f}: ${e.id}: ${op} manifest declares ${c.risk} but LAW_POLICY_V1 classifies ${policyRisk} ` +
            `(D-351 parity — fix the policy table (exact rows outrank prefixes) or the manifest; never let the two sources drift)`,
          );
        }
      }
    }
  }

  // Check 7 · D-377 matrix conformance: every shipped spec regenerates
  // byte-identical from _matrix.json. A hand-edited spec is drift — the named
  // first-diff line is the diagnostic. Scaffolds without a matrix skip loudly.
  const hasMatrix = existsSync(join(dir, "_matrix.json"));
  if (hasMatrix) {
    try {
      const { ok, reports } = emitCompositions(dir, { write: false });
      for (const r of reports) {
        if (r.status === "identical") continue;
        issues.push(
          `_matrix.json ↔ ${r.name}.json ${r.status === "missing" ? "spec missing" : "drift"}` +
          `${r.firstDiffLine ? ` (first diff line ${r.firstDiffLine})` : ""} — regenerate via omega:generate composition or fix the matrix (D-377)`,
        );
      }
      if (ok) matrixOk = true;
    } catch (e) {
      issues.push(`matrix conformance check failed to run: ${String(e)}`);
    }
  }

  // Check 8 · D-420 shippability fence: the shippable-v1 composition is named
  // by its note marker; AI-API realizations refuse to boot in tagged specs.
  // Pure check over the shipped specs (tests hand-build red/green inputs).
  // Opt-in: production callers (the gate stage, the standalone CLI) pass
  // shippableFence: true — fixture rigs skip it so their assertions stay
  // scoped to their own checks.
  let fenceTagged: string[] = [];
  if (opts.shippableFence === true) {
    try {
      const shipSpecs: ShippableSpecInput[] = [];
      for (const f of files) {
        try {
          const raw = JSON.parse(readFileSync(join(dir, f), "utf-8")) as {
            _note?: string;
            entries?: Array<{ id?: string }>;
          };
          shipSpecs.push({
            name: f.replace(/\.json$/, ""),
            note: raw._note ?? "",
            entryIds: (raw.entries ?? []).map((e) => e.id ?? "").filter(Boolean),
          });
        } catch { continue; } // unreadable spec already flagged in the main loop
      }
      for (const fi of checkShippableFence(shipSpecs)) {
        issues.push(`[${fi.check}] ${fi.subject}: ${fi.reason} (fix: ${fi.fix})`);
      }
      fenceTagged = shipSpecs.filter((s) => s.note.includes(SHIPPABLE_MARKER)).map((s) => s.name);
    } catch (e) {
      issues.push(`shippable fence check failed to run: ${String(e)}`);
    }
  }

  // Check 5 · D-332: exported contracts/ vocabulary with zero tree-wide
  // call sites (vocabulary without a writer/reader). Merged into this net's
  // issues so the gate's `compositions` stage backstops the plan's top risk.
  const detail: Record<string, unknown> = {
    specs: files.length,
    entries,
    driftAllowlisted: drifted,
    riskParityOps: parityChecked,
    matrixConformance: hasMatrix ? (matrixOk ? "green" : "red") : "absent (scaffold)",
    shippableFence: { marker: SHIPPABLE_MARKER, tagged: fenceTagged, aiApiRealizations: AI_API_REALIZATIONS },
  };
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
  checkCompositions(ROOT, { shippableFence: true }).then((r) => {
    console.log(JSON.stringify(r.ok ? { ok: true, ...r.detail } : { ok: false, issues: r.issues }, null, 2));
    process.exit(r.ok ? 0 : 1);
  });
}
