// gate --explain (E-8): the gate's UI. Every stage names what it scans, its
// allowlist, and where its rule lives — the newcomer who trips os-surface or
// import-surface gets an explanation, not just a red line. Separate module
// (not in gate.ts) so unit tests can import it without running the gate
// (gate.ts has no import guard — importing it executes).
export const STAGE_DOCS: Record<string, { scans: string; allowlist: string; rule: string }> = {
  "host-loc": {
    scans: "line count over host/src (*.ts)",
    allowlist: "≤ 1500 LOC total (D-365 froze 1100; D-391 re-amended once and loudly to 1500, re-frozen — no new host surface without same-commit removal)",
    rule: "tooling/gates/gate.ts §1",
  },
  "anvil-loc": {
    scans: "line count over sdk/src (*.ts) — the frozen pre-boot edge (the five: parseManifest, validateManifest, signPluginDir, contentHashDir, createPortClient + support surface)",
    allowlist: "≤ 860 LOC (D-404: baseline 721 + generality-validator allowance; remove-to-add after Wave 0)",
    rule: "tooling/gates/anvil.ts, gate.ts §1b",
  },
  "anvil-surface": {
    scans: "the exported names of @vivim/omega-sdk vs the frozen ANVIL_EXPORT_SURFACE snapshot",
    allowlist: "exact-match only — a new or removed export requires a decision record + snapshot amendment in the same commit (D-404)",
    rule: "tooling/gates/anvil.ts, gate.ts §1b",
  },
  "fresh-tree": {
    scans: "sibling legacy repos (pins + clean status) + legacy imports tree-wide",
    allowlist: "skips loudly (○, never green) on clean clones with no siblings",
    rule: "tooling/gates/gate.ts §2, D-320",
  },
  "decisions": {
    scans: "docs/BUILD-DECISIONS.md index ↔ docs/decisions/D-*.md records (shape, tags, SHA evidence)",
    allowlist: "pre-D-313 rows are the index-only era (grandfathered)",
    rule: "tooling/gates/decisions.ts, docs/decisions/README.md",
  },
  "compositions": {
    scans: "compositions/*.json (grants, bootPhase-0 law, D-325 vault invariant, drift, contract call sites)",
    allowlist: "DRIFT_ALLOWLIST + CALL_SITE_ALLOWLIST entries, each with a D-record pointer",
    rule: "tooling/gates/compositions.ts, contract-sites.ts",
  },
  "bun-surface": {
    scans: "Bun.* / bun imports in prod */src",
    allowlist: "plugins/vivim-vault/src/db.ts (the one declared sqlite adapter, D-361)",
    rule: "tooling/gates/gate.ts §5",
  },
  "os-surface": {
    scans: "/tmp/ literals, process.platform branches, raw chmod in prod */src",
    allowlist: "platform/src/platform.ts lines marked D-372 (the only OS-aware module)",
    rule: "tooling/gates/gate.ts §5b, docs/MULTI-OS-DESIGN.md",
  },
  "import-surface": {
    scans: "workspace + relative imports in prod */src (layering contract)",
    allowlist: "declared per-layer imports only (contracts∅, shim→contracts, host→contracts+platform)",
    rule: "tooling/gates/import-surface.ts (B-2)",
  },
  "forge-surface": {
    scans: "plugins/forge-*/ (manifests, src ns literals, refusal tests) + compositions/*.json grants + pack.builder catalog & fixtures — the Forge boundary (Wave 0, D5)",
    allowlist: "forge-*.json are builder compositions (forge.* ops route there only); one risk class per forge plugin; ns proposal + scratch only for Class-2 emission; every forge.* op refusal-tested; manifest↔FORGE_OP_CATALOG exact match; generality mandatory (hard) for forge.*/pack.builder",
    rule: "tooling/gates/forge-surface.ts (D-405/D-406), red/green falsifiers in tooling/gates/test/forge-surface.test.ts",
  },
  "invariants-freshness": {
    scans: "docs/decisions/CURRENT-INVARIANTS.md's marker (pass · as-of D-NNN · stage inventory) vs the decisions index and this registry",
    allowlist: "REPORT-ONLY (D-415, A3): staleness (30 ratified rows past as-of; stage drift either direction) reports in the detail and stays green — the flip to failing is a future record's call; mechanical breakage (unreadable digest, malformed marker) fails",
    rule: "tooling/gates/invariants-freshness.ts (D-415), falsifiers in tooling/gates/test/invariants-freshness.test.ts",
  },
  "process": {
    scans: "the process self-model: build/status.json (gate color, staleness vs HEAD), the decisions board (open/blocking), docscan findings, the ledger home — via decisions.ts / docscan.ts / round-close.ts, no second parser",
    allowlist: "REPORT-ONLY (D-423, mirrors D-415/D-368): an open board, a stale status.json, or live docscan findings report in the detail and stay green — the judgment stays with the ratify/round-close ceremony; only mechanical breakage (a derivation throw) fails",
    rule: "tooling/gates/process.ts (D-423), falsifiers in tooling/gates/test/process.test.ts",
  },
  "genome": {
    scans: "genome/layers.json (the authored registry — the only hand-written input) folded against docs/BUILD-DECISIONS.md, docs/decisions/*, and the *.test.ts inventory, vs the committed artifacts build/genome.json + build/genome.md",
    allowlist: "none — the committed genome must be the byte-exact fold of this tree (re-emit with `bun run omega:genome` in the same commit as any decision/registry change); registry shape, DAG validity, budgets, orphan/incomplete decision sets, and falsifier resolution for implemented layers are MECHANICAL failures; record status and the external-assumed directive are reported facts",
    rule: "tooling/gates/genome.ts (D-425, Ω-DEV.1), falsifiers in tooling/gates/test/f-genome.test.ts",
  },
  "tests": {
    scans: "full bun test suite (capped concurrency, 60s per-test budget)",
    allowlist: "none — every test must pass",
    rule: "tooling/gates/gate.ts §6, D-368 lanes",
  },
  "attest": {
    scans: "demo composition boot + op round-trips + recovery drills (existence proof)",
    allowlist: "none — all checks must hold",
    rule: "tooling/gates/attest.ts",
  },
};

/** Render --explain output: all stages, or one named stage (unknown names list the valid ones). */
export function explainStage(name?: string): string {
  const names = Object.keys(STAGE_DOCS);
  if (name === undefined) {
    return names.map((n) => `${n}\n  scans: ${STAGE_DOCS[n].scans}\n  allowlist: ${STAGE_DOCS[n].allowlist}\n  rule: ${STAGE_DOCS[n].rule}`).join("\n");
  }
  const doc = STAGE_DOCS[name];
  if (!doc) return `unknown stage "${name}" — stages: ${names.join(", ")}`;
  return `${name}\n  scans: ${doc.scans}\n  allowlist: ${doc.allowlist}\n  rule: ${doc.rule}`;
}
