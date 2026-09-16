// gate --explain (E-8): the gate's UI. Every stage names what it scans, its
// allowlist, and where its rule lives — the newcomer who trips os-surface or
// import-surface gets an explanation, not just a red line. Separate module
// (not in gate.ts) so unit tests can import it without running the gate
// (gate.ts has no import guard — importing it executes).
export const STAGE_DOCS: Record<string, { scans: string; allowlist: string; rule: string }> = {
  "host-loc": {
    scans: "line count over host/src (*.ts)",
    allowlist: "≤ 1100 LOC total (D-365 freeze — no new host surface without same-commit removal)",
    rule: "tooling/gates/gate.ts §1",
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
