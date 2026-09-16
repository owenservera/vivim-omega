// tooling/portrait/portrait.ts — the Ω self-portrait emitter (D-350).
//
// Boots the REAL console composition against a throwaway vault at
// ${TMP}/omega-portrait, runs the honest 12-step scenario (including the full
// consent ceremony: the rule fires → the law demands consent → the user grants
// → the same rule fires clean), then captures:
//
//   runtime      mind.portrait@1 (the plugin's one unified self-read) + the
//                booted host's router truth (compartments/dormant/routedOps —
//                host-side facts a plugin cannot see, merged by the emitter)
//   development  git state, the decision-register summary (the decisions
//                checker, run live), the last gate board (build/status.json),
//                the posture (docs/PRINCIPLES.md §1 parsed live, [] when the
//                doc is absent — honest, never invented), the signed manifests
//                of the booted recipe, the recipe grant graph, host/src LOC
//   journal      the booted instance's law-journal.jsonl, read directly (the
//                surfaces/web/src/events.ts precedent)
//   scenario     the steps that produced this state + the NLCL language sample
//
// Output: the omega-self-portrait/1 artifact. `--out <path>` overrides the
// default (<repo>/build/self-portrait.json); the workspace DevOps hub passes
// its own path. Every number is derived, none hardcoded.
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { compileComposition, ensureVault, bootComposition } from "@vivim/omega-host";
import type { BootedHost, Recipe } from "@vivim/omega-host";
import type { PluginManifest, PortResult } from "@vivim/omega-contracts";
import { routableOps } from "@vivim/omega-contracts";
import { boardFreshness, checkDecisions, parseIndexRows } from "../gates/decisions.ts";
import { readPosture } from "./posture.ts";
import { omegaTmp } from "@vivim/omega-platform"; // D-372 Phase 3: scratch through the seam

const ROOT = join(import.meta.dir, "../..");
const SPEC_PATH = join(ROOT, "compositions/console.json");
// E-9: run-unique dir — fixed names collide across concurrent runs on one box.
const VAULT_DIR = omegaTmp("omega-portrait", `run-${Date.now()}-${process.pid}`);

// ---- CLI: --out <path> (default build/self-portrait.json) ----

function parseOutArg(): string {
  const argv = Bun.argv;
  const i = argv.indexOf("--out");
  if (i !== -1 && i + 1 < argv.length && argv[i + 1].length > 0) return argv[i + 1];
  return join(ROOT, "build", "self-portrait.json");
}

// ---- git helpers (source truth for the artifact header) ----

function sh(cmd: string[]): string {
  const p = Bun.spawnSync(cmd, { cwd: ROOT });
  return p.stdout.toString().trim();
}

function gitHead(): { full: string; short: string } {
  const full = sh(["git", "rev-parse", "HEAD"]);
  return { full: full || "uncommitted", short: full.slice(0, 7) || "uncommitted" };
}

function gitBranch(): string {
  return sh(["git", "rev-parse", "--abbrev-ref", "HEAD"]) || "(detached)";
}

function gitClean(): boolean {
  return sh(["git", "status", "--porcelain"]) === "";
}

/** host/src LOC, exactly the gate's count (the boredom budget is law, B5). */
function countHostLoc(): number {
  let total = 0;
  const dir = join(ROOT, "host/src");
  for (const f of readdirSync(dir)) {
    const p = join(dir, f);
    if (statSync(p).isDirectory()) continue;
    if (!f.endsWith(".ts")) continue;
    total += readFileSync(p, "utf-8").split("\n").length;
  }
  return total;
}

// ---- the artifact's development.gate: the last gate board, read honestly ----

interface GateBoard {
  generatedAt: string | null;
  head: string | null;
  tests: { pass?: number; fail?: number } | null;
  checks: Array<{ stage: string; ok: boolean }>;
}

function readLastGate(): GateBoard | null {
  const path = join(ROOT, "build", "status.json");
  if (!existsSync(path)) return null;
  try {
    const status = JSON.parse(readFileSync(path, "utf-8")) as Record<string, unknown>;
    const gate = status["gate"] as Record<string, unknown> | undefined;
    if (!gate || typeof gate !== "object") return null;
    const checksRaw = gate["checks"] as Record<string, { ok?: boolean; skipped?: boolean }> | undefined;
    const checks = Object.entries(checksRaw ?? {}).map(([stage, v]) => ({ stage, ok: v?.ok === true }));
    const tests = status["tests"] as { pass?: number; fail?: number } | undefined;
    return {
      generatedAt: typeof status["generatedAt"] === "string" ? status["generatedAt"] : null,
      head: typeof status["head"] === "string" ? status["head"] : null,
      tests: tests && typeof tests === "object" ? tests : null,
      checks,
    };
  } catch {
    return null;
  }
}

// ---- main ----

const outPath = parseOutArg();
const spec = JSON.parse(readFileSync(SPEC_PATH, "utf-8"));

// throwaway vault, deterministic overrides: vault data out of the repo, the
// law's registry replay pointed at the router's journal (the Ω1 integration
// pattern), the director's live tick loop off (manual ticks only).
rmSync(VAULT_DIR, { recursive: true, force: true });
mkdirSync(VAULT_DIR, { recursive: true });
const { rootKey } = ensureVault(VAULT_DIR);
const portraitSpec = {
  ...spec,
  name: "console-portrait",
  entries: spec.entries.map((e: { id: string; config?: Record<string, unknown> }) => {
    if (e.id === "vivim.vault") return { ...e, config: { ...e.config, dataDir: join(VAULT_DIR, "vault-data") } };
    if (e.id === "vivim.law") return { ...e, config: { ...e.config, journalPath: join(VAULT_DIR, "law-journal.jsonl") } };
    if (e.id === "vivim.director") return { ...e, config: { ...e.config, intervalMs: 0 } };
    return e;
  }),
};

const t0 = performance.now();
const { recipe, buildDir } = compileComposition(portraitSpec, join(SPEC_PATH, ".."), VAULT_DIR, rootKey);
const host: BootedHost = await bootComposition(recipe, buildDir, VAULT_DIR);
const bootMs = Math.round(performance.now() - t0);

/** callAsRoot with a JSON-safe result (dates/undefined survive the log, not the artifact). */
async function call(op: string, payload: unknown, deadlineMs = 10_000): Promise<PortResult> {
  const r = await host.router.callAsRoot(op, payload, deadlineMs);
  return JSON.parse(JSON.stringify(r)) as PortResult;
}

// ---- the 12-step honest scenario (the consent ceremony included) ----

interface Step { op: string; note?: string; ok?: boolean; error?: string; detail?: string }
const steps: Step[] = [];
let consentGranted = false;

async function step(op: string, note: string, payload: unknown, deadlineMs?: number): Promise<PortResult> {
  const r = await call(op, payload, deadlineMs);
  steps.push({ op, note, ok: r.ok, ...(r.ok ? {} : { error: r.error, detail: r.detail }) });
  return r;
}

await step("law.registry@1", "the constitution is a plugin (warm the law)", {});
await step("message.receive@1", "peter writes in", { from: "peter@northwind.example", subject: "quarterly numbers", body: "here are the quarterly numbers you asked for" });
await step("message.receive@1", "ana writes in", { from: "ana@acme.example", subject: "budget review", body: "can we review the budget tomorrow?" });
await step("message.receive@1", "the digest bot writes in (the rule trigger)", { from: "bot@news.example", subject: "weekly digest", body: "your weekly digest is ready" });
await step("director.teach@1", "teach: 'digest' grounds to message.search", { word: "digest", op: "message.search@1", action: "add" });
await step("director.rule@1", "a rule: when the digest bot writes, tell ana (one consent, at rule-creation time)", {
  when: { event: "message.received", from: "contact:bot" },
  then: { op: "message.send@1", payload: { to: "ana@acme.example", subject: "digest ready", body: "the digest bot wrote in" } },
});

// tick #1 — the rule fires; the law demands consent first (the honest refusal)
const tick1 = await step("director.tick@1", "tick #1 — the rule fires; the law demands consent first", {});
interface TickFiredRow { messageId: string; ruleId: string; ok: boolean; error?: string; consentId?: string }
const fired1 = ((tick1.ok ? (tick1.value as { fired?: TickFiredRow[] }).fired : []) ?? []);
const refused = fired1.find((f) => !f.ok && typeof f.consentId === "string");
if (refused?.consentId) {
  await step("law.consent.grant@1", `the user grants — the console ceremony (${refused.consentId})`, { consentId: refused.consentId });
  consentGranted = true;
}

await step("message.receive@1", "the digest bot writes again", { from: "bot@news.example", subject: "weekly digest", body: "your weekly digest is ready, again" });
await step("director.tick@1", "tick #2 — the same rule now fires clean (allow + journal)", {});

// the language sample — plain language in, symbolic reading out (C1 grounding)
const sampleText = "send 'thanks for the quarterly numbers' to Peter";
const interp = await step("nlcl.interpret@1", "plain language in, symbolic reading out (C1 grounding)", { text: sampleText });

// the system, seeing itself — one unified read (D-350)
const portraitCall = await step("mind.portrait@1", "the system, seeing itself — one unified read (D-350)", {});
if (!portraitCall.ok) throw new Error(`mind.portrait@1 failed: ${portraitCall.error}: ${portraitCall.detail ?? ""}`);
const portrait = (portraitCall.value as { portrait: Record<string, unknown> }).portrait;

// host-side router truth (a plugin cannot see this; the emitter can)
const routerStatus = host.router.status();

// the recipe's signed manifests + grant graph (captured before shutdown)
const manifests = new Map(host.manifests);
interface GrantEdge { op: string; to: string }
const grants = recipe.composition.map((e) => {
  const edges: GrantEdge[] = [];
  for (const cap of e.grant.capabilities) {
    if (cap.startsWith("port:")) {
      const op = cap.slice("port:".length);
      const to = recipe.composition.find((x) => x.grant.contracts.includes(op));
      if (to) edges.push({ op, to: to.id });
    } else {
      edges.push({ op: cap, to: "µhost" });
    }
  }
  return { plugin: e.id, bootPhase: e.bootPhase, capabilities: e.grant.capabilities, contracts: e.grant.contracts, edges };
});

// shutdown the compartments, then read the journal the instance left behind
await host.shutdown();
const journalPath = join(VAULT_DIR, "law-journal.jsonl");
interface JournalEvent { ts?: number; principal?: string; op?: string; decision?: string; reason?: string; consentId?: string }
const journalEvents: JournalEvent[] = existsSync(journalPath)
  ? readFileSync(journalPath, "utf-8").split("\n").filter(Boolean)
      .map((line) => { try { return JSON.parse(line) as JournalEvent; } catch { return null; } })
      .filter((e): e is JournalEvent => e !== null)
  : [];

// ---- development truth (repo-side, read live) ----

const head = gitHead();
const decisions = await checkDecisions(ROOT);
if (!decisions.ok) {
  throw new Error(`the decision register is inconsistent — refusing to emit a portrait over a broken board: ${decisions.issues.join("; ")}`);
}
const indexText = readFileSync(join(ROOT, "docs/BUILD-DECISIONS.md"), "utf-8");
const proposed = parseIndexRows(indexText).filter((r) => r.status === "PROPOSED").length;
const board = boardFreshness(ROOT);

const plugins = [...manifests.entries()].map(([id, m]: [string, PluginManifest]) => ({
  id,
  version: m.version,
  description: m.description,
  ops: routableOps(m),
  capabilitiesRequested: m.capabilities?.requested ?? [],
})).sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));

const development = {
  hostLoc: countHostLoc(),
  hostLocBudget: 1000,
  register: {
    rows: decisions.detail["rows"] as number,
    records: decisions.detail["records"] as number,
    ratified: decisions.detail["ratified"] as number,
    proposed,
    board: board.state,
  },
  gate: readLastGate(),
  posture: readPosture(ROOT),
  plugins,
  grants,
};

// ---- the artifact ----

const artifact = {
  schema: "omega-self-portrait/1",
  generatedAt: new Date().toISOString(),
  source: {
    repo: "vivim-omega",
    branch: gitBranch(),
    head: head.full,
    clean: gitClean(),
    specPath: "compositions/console.json",
    composition: "console-portrait",
    bootMs,
  },
  runtime: { ...portrait, router: routerStatus },
  development,
  journal: { path: journalPath, count: journalEvents.length, events: journalEvents },
  scenario: {
    consentGranted,
    steps,
    languageSample: interp.ok ? { text: sampleText, result: interp.value } : null,
  },
  provenance: {
    runtime: "mind.portrait@1 through the booted console composition (throwaway vault at /tmp/omega-portrait, seeded by the scenario below — every number is derived, none hardcoded)",
    development: "tooling: git, build/status.json (the last gate board), docs/BUILD-DECISIONS.md + the decisions checker (run live, refuses on an inconsistent board), the signed manifests of the booted recipe, host/src LOC. docs/PRINCIPLES.md is not present in this lineage — posture is honestly empty and its re-creation is a standing prep request",
    journal: "the booted instance's law-journal.jsonl, read directly by the emitter (the surfaces/web/src/events.ts precedent)",
    scope: "owner-side verification artifact for the workspace DevOps hub — NOT an Omega surface; does NOT fire the I9 trigger",
  },
};

mkdirSync(dirname(outPath), { recursive: true });
writeFileSync(outPath, JSON.stringify(artifact, null, 2) + "\n");
console.log(JSON.stringify({ ok: true, out: outPath, generatedAt: artifact.generatedAt, worldV: (portrait as { world?: { v?: number } }).world?.v, journal: journalEvents.length, steps: steps.length }, null, 2));

// keep TS honest: Recipe type is used for the grant graph above
void (undefined as unknown as Recipe);
