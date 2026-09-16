// Ω gate runner: host-loc (B5) + fresh-tree (legacy untouched) + tests + attest → build/status.json
// A wave ends only when this is green (D-205 existence law).
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { cpus } from "node:os";

const ROOT = join(import.meta.dir, "../..");

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
  const p = Bun.spawn(cmd, { cwd: ROOT, stdout: "pipe", stderr: "pipe" });
  const out = await new Response(p.stdout).text() + await new Response(p.stderr).text();
  const code = await p.exited;
  return { code, out };
}

const gate: Record<string, unknown> = { startedAt: new Date().toISOString(), checks: {} as Record<string, unknown> };
const checks = gate.checks as Record<string, any>;
let failed = 0;
const fail = (name: string, detail: string) => { checks[name] = { ok: false, detail }; failed++; console.error(`✗ ${name}: ${detail}`); };
const pass = (name: string, detail: unknown) => { checks[name] = { ok: true, detail }; console.log(`✓ ${name}`); };
// Skipped is NEITHER pass nor fail: recorded loudly in status.json, never rendered
// as green. Only for checks that are definitionally inapplicable in this layout
// (never for making a red check go away).
const skip = (name: string, detail: unknown) => { checks[name] = { ok: true, skipped: true, detail }; console.log(`○ ${name}: skipped`); };

// 1 · host-loc (B5 — the boredom budget is law; D-365: 1100 + freeze as sole owner)
const hostLoc = countLoc(join(ROOT, "host/src"));
if (hostLoc <= 1100) pass("host-loc", { loc: hostLoc, budget: 1100 });
else fail("host-loc", `µhost is ${hostLoc} LOC (budget 1100, frozen D-365) — move the creep into a plugin`);

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
  const c = await checkCompositions(ROOT);
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

// 5 · bun-surface (D-361): the production tree stays runtime-neutral — zero `Bun.*`
// calls and zero `bun` imports except the ONE declared adapter (the vault's sqlite
// module). Dev tooling (this gate runs `bun test`) and tests are out of scope by policy.
try {
  const PROD_DIRS = prodDirs();
  const ADAPTERS: Record<string, string> = {
    "plugins/vivim-vault/src/db.ts": "D-361: the only bun:sqlite import (a Node build swaps this one module)",
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

// 6 · tests (gate evidence)
// Concurrency is capped by box size (D-317): past core count, worker-heavy test
// files thrash instead of parallelizing — measured 64s green at 4-wide vs
// 300s+ flaking at default-20 on a loaded 4-core box. Same tests, same
// assertions. D-368: per-test budget raised to 60s (Windows git-spawn slowness
// tripped the 5s default in the decisions self-host test) and concurrency
// honors OMEGA_TEST_CONCURRENCY (soak fallback: 1 on handle-starved boxes;
// MCP stdio uv_spawn EUNKNOWN exhaustion observed on Windows soak runs).
// The cap value is recorded in status.json so any run is interpretable.
// D-368 --quick: host-loc + decisions + compositions + bun-surface only (no tests/attest/status write) for inner loop.
const QUICK = process.argv.includes("--quick");
const testMaxConc = Number(process.env.OMEGA_TEST_CONCURRENCY ?? Math.max(4, Math.min(20, cpus().length)));
const TEST_TIMEOUT_MS = "60000";
if (QUICK) {
  const summary = { ok: failed === 0, failed, hostLoc, quick: true, at: gate.startedAt };
  console.log(JSON.stringify(summary, null, 2));
  process.exit(failed === 0 ? 0 : 1);
}
const tests = await sh(["bun", "test", "--max-concurrency", String(testMaxConc), "--timeout", TEST_TIMEOUT_MS]);
const passMatch = tests.out.match(/^\s*(\d+) pass/m);
const failMatch = tests.out.match(/^\s*(\d+) fail/m);
const testPass = parseInt(passMatch?.[1] ?? "0");
const testFail = parseInt(failMatch?.[1] ?? "0");
// failing test names (ANSI-stripped) straight into the gate record — no more
// mystery single-fail runs; the names are what the next action needs.
const failingTests = [...tests.out.replace(/\x1b\[[0-9;]*m/g, "").matchAll(/\(fail\) (.+?) \[\d[\d.,]*m?s\]/g)]
  .map((m) => m[1].trim().slice(0, 160));
if (tests.code === 0 && testFail === 0) pass("tests", { pass: testPass, fail: testFail, maxConcurrency: testMaxConc });
else fail("tests", `${testPass} pass / ${testFail} fail — failing: ${JSON.stringify(failingTests)}`);

// 6 · attest: boot the demo composition, round-trip, recovery drill (existence proof)
try {
  const { attest } = await import("./attest.ts");
  const a = await attest();
  if (a.ok) pass("attest", a.detail);
  else fail("attest", a.reason ?? "unknown");
} catch (e) { fail("attest", String(e)); }

// 7 · emit status.json (console feed) + gates.log line
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
