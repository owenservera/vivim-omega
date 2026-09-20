// Ω gate runner: host-loc (B5) + fresh-tree (legacy untouched) + tests + attest → build/status.json
// A wave ends only when this is green (D-205 existence law).
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { cpus } from "node:os";
import { parseStageFilter, renderFailureLine } from "./failures.ts";

const ROOT = join(import.meta.dir, "../..");

// D-422 (A14): output + targeting discipline. --failures-only suppresses the
// per-check pass/skip lines and renders every failure as ONE line with its
// STAGE_DOCS rule pointer (failures.ts) — exit codes and status semantics
// unchanged. --stage <substrings> targets the TESTS stage at matching test
// files (comma-separated substrings) — a targeted VERIFICATION run: attest is
// skipped and status.json is NOT written (a partial run must never overwrite
// the carried full-run status). No flags → byte-identical to the pre-D-422
// gate (F-3 of the efficiency-tooling tests pins the default path untouched).
const FAILURES_ONLY = process.argv.includes("--failures-only");
const _stageIdx = process.argv.indexOf("--stage");
const STAGE_FILTER = _stageIdx !== -1 ? parseStageFilter(process.argv[_stageIdx + 1]) : [];
const TARGETED = STAGE_FILTER.length > 0;

function countLoc(dir: string): number {
  let total = 0;
  for (const f of readdirSync(dir)) {
    const p = join(dir, f);
    if (statSync(p).isDirectory()) continue;
    if (!f.endsWith(".ts")) continue;
    total += readFileSync(p, "utf-8").split("\n").length;
  }
  return total;
}

async function sh(cmd: string[]): Promise<{ code: number; out: string }> {
  // Hermetic runtime: exercise the running Bun, never whatever PATH resolves —
  // same version by construction, no lookup involved.
  const argv = cmd[0] === "bun" ? [process.execPath, ...cmd.slice(1)] : cmd;
  const p = Bun.spawn(argv, { cwd: ROOT, stdout: "pipe", stderr: "pipe" });
  const out = await new Response(p.stdout).text() + await new Response(p.stderr).text();
  const code = await p.exited;
  return { code, out };
}

const gate: Record<string, unknown> = { startedAt: new Date().toISOString(), checks: {} as Record<string, unknown> };
const checks = gate.checks as Record<string, any>;

// E-8: --explain is the gate's UI (what each stage scans, its allowlist, its
// rule). Handled before any check runs; never writes status.
if (process.argv.includes("--explain")) {
  const { explainStage } = await import("./explain.ts");
  const at = process.argv.indexOf("--explain");
  const which = process.argv[at + 1]?.startsWith("--") ? undefined : process.argv[at + 1];
  console.log(explainStage(which));
  process.exit(0);
}
let failed = 0;
const fail = (name: string, detail: string) => { checks[name] = { ok: false, detail }; failed++; console.error(FAILURES_ONLY ? renderFailureLine(name, detail) : `✗ ${name}: ${detail}`); };
const pass = (name: string, detail: unknown) => { checks[name] = { ok: true, detail }; if (!FAILURES_ONLY) console.log(`✓ ${name}`); };
// Skipped is NEITHER pass nor fail: recorded loudly in status.json, never rendered
// as green. Only for checks that are definitionally inapplicable in this layout
// (never for making a red check go away).
const skip = (name: string, detail: unknown) => { checks[name] = { ok: true, skipped: true, detail }; if (!FAILURES_ONLY) console.log(`○ ${name}: skipped`); };

// 1 · host-loc (B5 — the boredom budget is law; D-365 froze 1100; D-391 re-amended
// once and loudly to 1500 for the D-340 genesis kernel's host-critical subset, then
// re-froze with the same no-exceptions rule: no new host surface without equal-or-
// greater removal in the same commit. Creep still moves into plugins.)
const hostLoc = countLoc(join(ROOT, "host/src"));
if (hostLoc <= 1500) pass("host-loc", { loc: hostLoc, budget: 1500 });
else fail("host-loc", `µhost is ${hostLoc} LOC (budget 1500, frozen D-391) — move the creep into a plugin`);

// 1b · anvil-loc + anvil-surface (D-404, Omega Forge Wave 0): the frozen pre-boot
// edge. sdk/src gets the same wall treatment as the host — a hard LOC budget
// (remove-to-add after Wave 0) plus a frozen export surface (a new or removed
// export needs a decision record in the same commit). The anvil holds the five
// frozen functions (parseManifest, validateManifest, signPluginDir, contentHashDir,
// createPortClient) and their support surface; it is not a Forge and it does not
// grow. Importing the sdk here also proves the anvil still loads on every gate run.
try {
  const { checkAnvilLoc, checkAnvilSurface, ANVIL_EXPORT_SURFACE } = await import("./anvil.ts");
  const loc = checkAnvilLoc(join(ROOT, "sdk/src"));
  if (loc.ok) pass("anvil-loc", { loc: loc.loc, budget: loc.budget, frozenBy: "D-404" });
  else fail("anvil-loc", loc.issues.join("; "));
  const sdk = await import(join(ROOT, "sdk/src/index.ts"));
  const surface = checkAnvilSurface(Object.keys(sdk));
  if (surface.ok) pass("anvil-surface", { exports: ANVIL_EXPORT_SURFACE.length, frozenBy: "D-404" });
  else fail("anvil-surface", surface.issues.join("; "));
} catch (e) { fail("anvil-loc", String(e)); }

// 2 · fresh-tree: legacy repos untouched + no legacy imports anywhere in the fresh tree
// Clean-clone/CI honesty (D-320): with NO sibling repos present there is nothing to
// verify untouched — skip loudly (○, recorded in status.json) rather than failing a
// tree that cannot satisfy the check or, worse, passing vacuously. The import scan
// below still runs in every layout. One sibling present and the other absent is
// layout drift → fail, not skip.
try {
  const legacy = [
    { name: "vivim-final-enhanced", pin: "afebe00" },
    { name: "vivim-final-program", pin: "4a5eb84" },
  ];
  const located = legacy.map((repo) => ({
    ...repo,
    dir: [join(ROOT, "..", repo.name), join(ROOT, "..", "..", repo.name)]
      .find((d) => existsSync(join(d, ".git"))),
  }));
  // scan for actual import statements from the legacy trees (string literals alone are fine)
  let legacyImports = 0;
  const IMPORT_RE = /(from\s+["'].*vivim-final-|import\(\s*["'].*vivim-final-|require\(\s*["'].*vivim-final-)/;
  const walk = (dir: string) => {
    for (const f of readdirSync(dir)) {
      if (f === "node_modules" || f === ".git" || f === "dev-vault" || f === "build") continue;
      const p = join(dir, f);
      if (statSync(p).isDirectory()) { walk(p); continue; }
      if (!f.endsWith(".ts")) continue;
      if (IMPORT_RE.test(readFileSync(p, "utf-8"))) legacyImports++;
    }
  };
  walk(ROOT);
  if (located.every((r) => !r.dir)) {
    skip("fresh-tree", { reason: "no sibling legacy repos present (clean clone / CI) — nothing to verify untouched", legacyImports });
  } else {
    let legacyOk = true; const detail: Record<string, unknown> = {};
    for (const repo of located) {
      if (!repo.dir) { legacyOk = false; detail[repo.name] = { missing: true }; continue; }
      const head = (await sh(["git", "-C", repo.dir, "rev-parse", "--short", "HEAD"])).out.trim();
      const status = (await sh(["git", "-C", repo.dir, "status", "--porcelain"])).out.trim();
      // The pin is enforceable only where that object exists (the sandbox lineage).
      // Elsewhere the legacies are read-only snapshots — "untouched" = clean status.
      const pinKnown = (await sh(["git", "-C", repo.dir, "cat-file", "-t", repo.pin])).out.trim() === "commit";
      const pinOk = pinKnown ? head === repo.pin : true;
      if (!pinOk || status !== "") { legacyOk = false; detail[repo.name] = { head, status, pin: pinKnown ? repo.pin : "(foreign lineage — clean-only)" }; }
      else detail[repo.name] = { head, clean: true };
    }
    if (legacyOk && legacyImports === 0) pass("fresh-tree", { ...detail, legacyImports });
    else fail("fresh-tree", `legacy touched or imported (imports: ${legacyImports}) ${JSON.stringify(detail)}`);
  }
} catch (e) { fail("fresh-tree", String(e)); }

// 3 · decisions: D-register ↔ detail-record contract (docs/decisions/README.md)
try {
  const { checkDecisions } = await import("./decisions.ts");
  const d = await checkDecisions(ROOT);
  if (d.ok) pass("decisions", d.detail);
  else fail("decisions", d.issues.join("; "));
} catch (e) { fail("decisions", String(e)); }

// 4 · compositions (W1 seed — read-only net over shipped compositions: grant vs
// manifest, bootPhase-0 law, D-325 law+vault invariant, grant drift allowlist)
try {
  const { checkCompositions } = await import("./compositions.ts");
  const c = await checkCompositions(ROOT, { shippableFence: true }); // D-420: the stage enforces the shippable fence
  if (c.ok) pass("compositions", c.detail);
  else fail("compositions", c.issues.join("; "));
} catch (e) { fail("compositions", String(e)); }

// Production source dirs (host + every plugin/surface + shared libs) — shared by
// the bun-surface (D-361) and os-surface (D-372) inventory stages.
const PROD_DIRS_BASE = ["host/src", "shim/src", "contracts/src", "platform/src", "sdk/src", "testkit/src", "surfaces/cli/src", "surfaces/mcp/src", "surfaces/web/src", "surfaces/daemon/src", "surfaces/daemon-client/src"];
function prodDirs(): string[] {
  const dirs = [...PROD_DIRS_BASE];
  for (const e of readdirSync(join(ROOT, "plugins"), { withFileTypes: true })) {
    if (e.isDirectory()) dirs.push(`plugins/${e.name}/src`);
  }
  return dirs;
}

// 5 · bun-surface (D-361 as rewritten by D-373): the production tree stays
// runtime-neutral — zero `Bun.*` calls and zero `bun` imports except the vault
// DRIVER LANE (`plugins/vivim-vault/src/drivers/` — any storage driver there may
// import `bun:sqlite`; still zero Bun.* calls anywhere). Dev tooling (this gate
// runs `bun test`) and tests are out of scope by policy.
try {
  const PROD_DIRS = prodDirs();
  const ADAPTERS: Record<string, string> = {
    "plugins/vivim-vault/src/drivers/bun-sqlite.ts": "D-373: the vault driver lane — bun:sqlite lives in the declared driver lane (was: the single db.ts file, D-361)",
  };
  const BUN_RE = /Bun\.|from\s+["']bun|import\s*\(\s*["']bun|require\(\s*["']bun/;
  const hits: string[] = [];
  for (const dir of PROD_DIRS) {
    const abs = join(ROOT, dir);
    if (!existsSync(abs)) continue;
    for (const f of readdirSync(abs)) {
      if (!f.endsWith(".ts")) continue;
      const rel = `${dir}/${f}`;
      const text = readFileSync(abs + "/" + f, "utf-8");
      for (const [i, line] of text.split("\n").entries()) {
        if (BUN_RE.test(line) && !(ADAPTERS[rel] && /bun:sqlite/.test(line) && !/Bun\./.test(line))) {
          hits.push(`${rel}:${i + 1}: ${line.trim().slice(0, 120)}`);
        }
      }
    }
  }
  if (hits.length === 0) pass("bun-surface", { adapters: Object.keys(ADAPTERS), scan: PROD_DIRS.length + " prod dirs (incl. every plugins/*/src)" });
  else fail("bun-surface", `Bun-specific code outside the declared adapters — ${hits.length} hits: ${hits.slice(0, 10).join(" | ")}`);
} catch (e) { fail("bun-surface", String(e)); }

// 5b · os-surface (D-372): no file outside platform/src may know the OS —
// no /tmp/ literals (use ${TMP} or omegaTmp()), no process.platform branches,
// no raw permission calls (use ownerOnly()). Same fail-closed pattern as D-361:
// the seam is declared in code, the inventory is enforced mechanically, and
// supporting a new OS means adding a CI lane, never editing product code.
try {
  const OS_RES: Array<{ re: RegExp; what: string }> = [
    { re: /\/tmp\//, what: "/tmp/ literal (use ${TMP} in specs or omegaTmp() in code)" },
    { re: /process\.platform/, what: "process.platform branch (belongs in platform/src)" },
    { re: /chmodSync|[^a-zA-Z.]chmod\(/, what: "raw permission call (use ownerOnly())" },
  ];
  const osHits: string[] = [];
  for (const dir of prodDirs()) {
    const abs = join(ROOT, dir);
    if (!existsSync(abs)) continue;
    for (const f of readdirSync(abs)) {
      if (!f.endsWith(".ts")) continue;
      const rel = `${dir}/${f}`;
      const text = readFileSync(abs + "/" + f, "utf-8");
      for (const [i, line] of text.split("\n").entries()) {
        for (const { re, what } of OS_RES) {
          if (re.test(line) && !(rel === "platform/src/platform.ts" && /D-372/.test(line))) {
            osHits.push(`${rel}:${i + 1}: ${what}: ${line.trim().slice(0, 100)}`);
          }
        }
      }
    }
  }
  if (osHits.length === 0) pass("os-surface", { seam: ["platform/src/platform.ts"], scan: prodDirs().length + " prod dirs (incl. every plugins/*/src)" });
  else fail("os-surface", `OS knowledge outside the platform seam — ${osHits.length} hits: ${osHits.slice(0, 10).join(" | ")}`);
} catch (e) { fail("os-surface", String(e)); }

// 5c · import-surface (B-2): the layering contract — compartments never
// import the host, surfaces never import plugin source relatively, contracts
// stays workspace-clean, shim/host see only their declared layers. Same
// fail-closed pattern as D-361/D-372: the layering is declared in code, the
// inventory is enforced mechanically.
try {
  const { checkImportSurface } = await import("./import-surface.ts");
  const s = await checkImportSurface(ROOT);
  if (s.ok) pass("import-surface", s.detail);
  else fail("import-surface", s.issues.join("; "));
} catch (e) { fail("import-surface", String(e)); }

// 5d · forge-surface (Omega Forge Wave 0, D5): the Forge boundary — product
// compositions never route forge.* ops; a forge plugin is one risk class, one
// namespace (ns proposal), refuses by name (refusal tests), and matches
// pack.builder's frozen op wire exactly; the generality axis is mandatory.
// Pure checks over a loaded input — red/green falsifiers live in
// tooling/gates/test/forge-surface.test.ts.
try {
  const { loadForgeSurfaceInput, checkForgeSurface } = await import("./forge-surface.ts");
  const input = await loadForgeSurfaceInput(ROOT);
  const r = checkForgeSurface(input);
  if (r.ok) pass("forge-surface", { forgePlugins: input.forgePlugins.length, compositions: input.compositions.length, catalogOps: Object.keys(input.catalog).length, packFixtures: input.packFixtureValidation.length });
  else fail("forge-surface", r.issues.map((i) => `${i.check} [${i.subject}]: ${i.reason} — fix: ${i.fix}`).join("; "));
} catch (e) { fail("forge-surface", String(e)); }

// 5e · invariants-freshness (D-415, A3 — report-only): the digest's staleness
// on TRIGGER, not calendar — the marker's as-of vs ratified rows past it, the
// marker's stage inventory vs this gate's stage registry. REPORT-ONLY by
// design (the D-368→D-402 adopt-observe-enforce pattern): staleness lands in
// the detail and the stage stays green; the flip to failing is a future
// record's call after one green wave of reports. Mechanical breakage
// (unreadable digest, malformed marker) fails — a gate stage, not a suggestion.
try {
  const { checkInvariantsFreshness } = await import("./invariants-freshness.ts");
  const f = checkInvariantsFreshness(ROOT);
  if (f.ok) pass("invariants-freshness", f.detail);
  else fail("invariants-freshness", f.issues.join("; "));
} catch (e) { fail("invariants-freshness", String(e)); }

// 5f · process (D-423 — report-only): the development genome's self-model —
// gate color/staleness, board open/blocking, docscan findings, ledger home —
// consolidated from the EXISTING readers (decisions.ts / docscan.ts /
// round-close.ts), never a second parser. REPORT-ONLY, same split as
// invariants-freshness: an open board or stale status.json is a fact in the
// detail, never a failure; only mechanical breakage (a derivation throw) fails.
try {
  const { checkProcess } = await import("./process.ts");
  const pr = checkProcess(ROOT);
  if (pr.ok) pass("process", pr.detail);
  else fail("process", pr.issues.join("; "));
} catch (e) { fail("process", String(e)); }

// 5g · genome (D-425 — MECHANICAL, unlike its report-only neighbors): the
// system genome's artifact integrity. The committed fold (build/genome.json
// + build/genome.md) must be the byte-exact fold of THIS tree — a hand edit,
// a stale genome after a ledger change, a registry shape lie, a dependency
// cycle, an unresolved falsifier on an implemented layer, or a budget breach
// is breakage the same way an index/record mismatch breaks the decisions
// stage. What stays REPORTED (never failing): the record status of
// implemented layers (the ratify ceremony owns the PROPOSED→RATIFIED flip,
// D-364) and the external-assumed count (the owner's directive, data not
// trust). Re-emit with `bun run omega:genome` in the same commit as any
// decision or registry change — the artifact is content-addressed.
try {
  const { checkGenome } = await import("./genome.ts");
  const g = checkGenome(ROOT);
  if (g.ok) pass("genome", g.detail);
  else fail("genome", g.issues.join("; "));
} catch (e) { fail("genome", String(e)); }

// 6 · tests (gate evidence)
// Concurrency is capped by box size (D-317): past core count, worker-heavy test
// files thrash instead of parallelizing — measured 64s green at 4-wide vs
// 300s+ flaking at default-20 on a loaded 4-core box. Same tests, same
// assertions. D-368: per-test budget raised to 60s (Windows git-spawn slowness
// tripped the 5s default in the decisions self-host test) and concurrency
// honors OMEGA_TEST_CONCURRENCY (soak fallback: 1 on handle-starved boxes;
// MCP stdio uv_spawn EUNKNOWN exhaustion observed on Windows soak runs).
// The cap value is recorded in status.json so any run is interpretable.
// D-368 --quick: host-loc + decisions + compositions + bun-surface +
// os-surface + import-surface only (no tests/attest/status write) for inner loop.
const QUICK = process.argv.includes("--quick");
const testMaxConc = Number(process.env.OMEGA_TEST_CONCURRENCY ?? Math.max(4, Math.min(20, cpus().length)));
const TEST_TIMEOUT_MS = "60000";
if (QUICK) {
  const summary = { ok: failed === 0, failed, hostLoc, quick: true, at: gate.startedAt };
  console.log(JSON.stringify(summary, null, 2));
  process.exit(failed === 0 ? 0 : 1);
}
const tests = await sh(["bun", "test", "--max-concurrency", String(testMaxConc), "--timeout", TEST_TIMEOUT_MS, ...(TARGETED ? STAGE_FILTER : [])]);
const passMatch = tests.out.match(/^\s*(\d+) pass/m);
const failMatch = tests.out.match(/^\s*(\d+) fail/m);
const testPass = parseInt(passMatch?.[1] ?? "0");
const testFail = parseInt(failMatch?.[1] ?? "0");
// failing test names (ANSI-stripped) straight into the gate record — no more
// mystery single-fail runs; the names are what the next action needs.
const failingTests = [...tests.out.replace(/\x1b\[[0-9;]*m/g, "").matchAll(/\(fail\) (.+?) \[\d[\d.,]*m?s\]/g)]
  .map((m) => m[1].trim().slice(0, 160));
if (tests.code === 0 && testFail === 0) pass("tests", TARGETED ? { pass: testPass, fail: testFail, maxConcurrency: testMaxConc, targeted: STAGE_FILTER } : { pass: testPass, fail: testFail, maxConcurrency: testMaxConc });
else fail("tests", `${testPass} pass / ${testFail} fail${TARGETED ? ` (targeted: ${STAGE_FILTER.join(", ")})` : ""} — failing: ${JSON.stringify(failingTests)}`);

// 6 · attest: boot the demo composition, round-trip, recovery drill (existence proof)
// A targeted run (--stage) skips it: the boot drill is EVIDENCE, not
// verification — a partial run never claims it (recorded as a skip, loudly).
if (TARGETED) skip("attest", { reason: "targeted run (--stage): the boot drill is evidence, not verification — the full gate runs it" });
else try {
  const { attest } = await import("./attest.ts");
  const a = await attest();
  if (a.ok) pass("attest", a.detail);
  else fail("attest", a.reason ?? "unknown");
} catch (e) { fail("attest", String(e)); }

// 7 · emit status.json (console feed) + gates.log line — NEVER on a targeted
// run: a partial test set is verification, not build evidence, and must not
// overwrite the carried full-run status (the D-362 reproducibility stance).
if (TARGETED) {
  const summary = { ok: failed === 0, failed, hostLoc, tests: { pass: testPass, fail: testFail }, targeted: STAGE_FILTER, statusWritten: false, at: gate.startedAt };
  console.log(JSON.stringify(summary, null, 2));
  process.exit(failed === 0 ? 0 : 1);
}
const { emitStatus } = await import("./status.ts");
await emitStatus({ gate, hostLoc, tests: { pass: testPass, fail: testFail } });

const summary = { ok: failed === 0, failed, hostLoc, tests: { pass: testPass, fail: testFail }, at: gate.startedAt };
console.log(JSON.stringify(summary, null, 2));
// gates.log line (append BEFORE exit — anything after process.exit never runs)
try {
  const { appendFileSync: _append } = await import("node:fs");
  _append(join(ROOT, "build", "gates.log"), `${JSON.stringify(summary)}\n`);
} catch { /* best-effort audit trail */ }
process.exit(failed === 0 ? 0 : 1);
