// Ω gate runner: host-loc (B5) + fresh-tree (legacy untouched) + tests + attest → build/status.json
// A wave ends only when this is green (D-205 existence law).
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

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

// 1 · host-loc (B5 — the boredom budget is law)
const hostLoc = countLoc(join(ROOT, "host/src"));
if (hostLoc <= 1000) pass("host-loc", { loc: hostLoc, budget: 1000 });
else fail("host-loc", `µhost is ${hostLoc} LOC (budget 1000) — move the creep into a plugin`);

// 2 · fresh-tree: legacy repos untouched + no legacy imports anywhere in the fresh tree
try {
  const legacy = [
    { name: "vivim-final-enhanced", pin: "abb6add" },
    { name: "vivim-final-program", pin: "4a5eb84" },
  ];
  let legacyOk = true; const detail: Record<string, unknown> = {};
  for (const repo of legacy) {
    // Layout-aware: the fresh tree may sit one level deeper (e.g. inside a
    // MASTER/ handback dir) than the sandbox layout. Probe both; absence fails.
    const dir = [join(ROOT, "..", repo.name), join(ROOT, "..", "..", repo.name)]
      .find((d) => existsSync(join(d, ".git")));
    if (!dir) { legacyOk = false; detail[repo.name] = { missing: true }; continue; }
    const head = (await sh(["git", "-C", dir, "rev-parse", "--short", "HEAD"])).out.trim();
    const status = (await sh(["git", "-C", dir, "status", "--porcelain"])).out.trim();
    // The pin is enforceable only where that object exists (the sandbox lineage).
    // Elsewhere the legacies are read-only snapshots — "untouched" = clean status.
    const pinKnown = (await sh(["git", "-C", dir, "cat-file", "-t", repo.pin])).out.trim() === "commit";
    const pinOk = pinKnown ? head === repo.pin : true;
    if (!pinOk || status !== "") { legacyOk = false; detail[repo.name] = { head, status, pin: pinKnown ? repo.pin : "(foreign lineage — clean-only)" }; }
    else detail[repo.name] = { head, clean: true };
  }
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
  if (legacyOk && legacyImports === 0) pass("fresh-tree", { ...detail, legacyImports });
  else fail("fresh-tree", `legacy touched or imported (imports: ${legacyImports}) ${JSON.stringify(detail)}`);
} catch (e) { fail("fresh-tree", String(e)); }

// 3 · tests (gate evidence)
const tests = await sh(["bun", "test"]);
const passMatch = tests.out.match(/^\s*(\d+) pass/m);
const failMatch = tests.out.match(/^\s*(\d+) fail/m);
const testPass = parseInt(passMatch?.[1] ?? "0");
const testFail = parseInt(failMatch?.[1] ?? "0");
if (tests.code === 0 && testFail === 0) pass("tests", { pass: testPass, fail: testFail });
else fail("tests", `${testPass} pass / ${testFail} fail`);

// 4 · attest: boot the demo composition, round-trip, recovery drill (existence proof)
try {
  const { attest } = await import("./attest.ts");
  const a = await attest();
  if (a.ok) pass("attest", a.detail);
  else fail("attest", a.reason ?? "unknown");
} catch (e) { fail("attest", String(e)); }

// 5 · emit status.json (console feed) + gates.log line
const { emitStatus } = await import("./status.ts");
await emitStatus({ gate, hostLoc, tests: { pass: testPass, fail: testFail } });

const summary = { ok: failed === 0, failed, hostLoc, tests: { pass: testPass, fail: testFail }, at: gate.startedAt };
console.log(JSON.stringify(summary, null, 2));
process.exit(failed === 0 ? 0 : 1);
// gates.log line (append after status emit)
import { appendFileSync as _append } from "node:fs";
try { _append(join(ROOT, "build", "gates.log"), `${JSON.stringify(summary)}\n`); } catch {}
