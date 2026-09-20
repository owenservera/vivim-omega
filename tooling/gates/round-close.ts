// tooling/gates/round-close.ts — D-414 (A2): the round-close automator.
//
// `bun run omega:round-close --note "<round description>"
//    --evidence "<gate evidence>"` runs the round-closing ceremony as ONE
// fail-closed command:
//   preflight  → clean tree · quick gate green · decisions contract green ·
//                board fresh · status.json carried + green · ledger contiguous ·
//                the tip advanced since the last bundle (double-run guard)
//   bundle     → git bundle create --all per the existing protocol + verify
//   sha256     → over the bundle bytes (node:crypto, never typed)
//   ledger row → appended to the ledger README's bundle table, generated from
//                `git` data (tip short-sha, tree hash, sha256 — 8…7 truncation)
//   print      → the next-round entry block, generated from BACKLOG's open
//                items + parked sections + the open board (a scaffold, not prose)
//
// Refuses to run on a dirty tree or a red gate — fail-closed like every other
// stage. `--dry-run` runs the preflight + renders the row + prints the block
// WITHOUT creating the bundle or touching the ledger (rehearsal; F-0's
// pre-flip leg). `--ledger <dir>` overrides the ledger location (default:
// ../download resolved from the repo root — refuse loudly when absent).
//
// Zero host LOC; tooling/ + docs/ only (the acceleration review §8 landing
// protocol). The board/status regeneration itself belongs to the ratify step;
// the close VERIFIES both are fresh and carried, it never rewrites them.
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { spawnSync as nodeSpawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { join } from "node:path";
import { boardFreshness, checkDecisions, listOpenQuestions } from "./decisions.ts";

const ROOT = join(import.meta.dir, "../..");

/** D-361 discipline: node:child_process with a Bun-spawnSync-shaped result —
 *  runtime-neutral, same pattern as decisions.ts. */
function sh(cmd: string[], opts: { cwd: string; timeout?: number }): { code: number; out: string } {
  const p = nodeSpawnSync(cmd[0], cmd.slice(1), { cwd: opts.cwd, encoding: "buffer", timeout: opts.timeout });
  return { code: p.status ?? 1, out: `${p.stdout?.toString() ?? ""}${p.stderr?.toString() ?? ""}` };
}

// ---- pure surface (unit-tested in tooling/gates/test/round-close.test.ts) ----

/** The ledger's short form for a hash: first 8 … last 8 (`7f18fff4…1e53aee9`).
 *  Accepts the two real shapes: a 40-char git object id and a 64-char sha256. */
export function shortHash(h: string): string {
  if (!/^(?:[0-9a-f]{40}|[0-9a-f]{64})$/.test(h)) throw new Error(`refused: not a 40/64-char hex hash: "${h}"`);
  return `${h.slice(0, 8)}…${h.slice(-8)}`;
}

/** One ledger table row, generated from git data — never typed (A2's core claim). */
export function renderLedgerRow(a: { n: number; note: string; tip: string; tree: string; sha256: string; evidence: string }): string {
  return `| \`_${a.n}.bundle\` | ${a.n} — ${a.note} | \`${a.tip}\` | \`${shortHash(a.tree)}\` | \`${shortHash(a.sha256)}\` | ${a.evidence} |`;
}

/** Parse `vivim-omega-wave0-omega-forge_<N>.bundle` filenames; refuse gaps (a
 *  missing bundle in the middle means the ledger is lying about completeness). */
export function scanBundles(files: string[]): { ns: number[]; issues: string[] } {
  const ns: number[] = [];
  const issues: string[] = [];
  for (const f of files) {
    const m = /^vivim-omega-wave0-omega-forge_(\d+)\.bundle$/.exec(f);
    if (!m) continue;
    ns.push(Number(m[1]));
  }
  ns.sort((x, y) => x - y);
  for (let i = 0; i < ns.length; i++) {
    if (ns[i] !== i + 1) {
      issues.push(`bundle numbering not contiguous from 1 (found ${ns.join(", ")}) — a gap means the ledger is incomplete; fix it before closing`);
      break;
    }
  }
  return { ns, issues };
}

/** The preflight verdict: pure decision over collected facts. Every refusal is
 *  named; ok requires ALL green. Nothing is written when !ok (by construction —
 *  the CLI refuses before any fs/git mutation). */
export interface PreflightFacts {
  cleanTree: boolean; treeDetail: string;
  quickGreen: boolean; quickDetail: string;
  decisionsGreen: boolean; decisionsDetail: string;
  boardFresh: boolean; boardDetail: string;
  statusCarried: boolean; statusDetail: string;
  ledgerOk: boolean; ledgerDetail: string;
  tipAdvanced: boolean; tipDetail: string;
}
export function preflightVerdict(f: PreflightFacts): { ok: boolean; refusals: string[] } {
  const refusals: string[] = [];
  if (!f.cleanTree) refusals.push(`dirty tree: ${f.treeDetail} — commit or discard before closing`);
  if (!f.quickGreen) refusals.push(`quick gate red: ${f.quickDetail}`);
  if (!f.decisionsGreen) refusals.push(`decisions contract red: ${f.decisionsDetail}`);
  if (!f.boardFresh) refusals.push(`board not fresh: ${f.boardDetail} — regenerate (bun run omega:questions --write) and commit first`);
  if (!f.statusCarried) refusals.push(`status.json not carried+green: ${f.statusDetail} — run omega:gate green and commit it first`);
  if (!f.ledgerOk) refusals.push(`ledger not ready: ${f.ledgerDetail}`);
  if (!f.tipAdvanced) refusals.push(`tip unchanged since the last bundle: ${f.tipDetail} — nothing to close (double-run guard)`);
  return { ok: refusals.length === 0, refusals };
}

/** Validate a --note/--evidence cell: one line, no pipes, non-empty. */
export function validateCell(kind: string, v: string): void {
  if (!v || !v.trim()) throw new Error(`refused: --${kind} is required and must be non-empty`);
  if (v.includes("|") || v.includes("\n")) throw new Error(`refused: --${kind} must be one line without "|" — it lands in the ledger table row`);
}

/** BACKLOG's open items + parked sections, parsed (the next-round block's
 *  source — derived, never hard-coded round prose). Open = a non-struck
 *  top-level bullet containing "OPEN"; parked = any ## section whose title
 *  says PARKED. Fuzzy by nature — the block is a scaffold, not prose. */
export function parseBacklogSignals(text: string): { openItems: string[]; parkedSections: string[] } {
  const openItems: string[] = [];
  const parkedSections: string[] = [];
  for (const line of text.split("\n")) {
    const bullet = /^- \*\*(.+?)\*\*(.*)$/.exec(line);
    if (bullet && !line.startsWith("- ~~") && /\bOPEN\b/.test(line)) {
      openItems.push(`${bullet[1]}${bullet[2].replace(/\s+/g, " ").trim()}`.replace(/\s+/g, " ").trim().slice(0, 160));
    }
    const header = /^##\s+(.*PARKED.*)$/i.exec(line);
    if (header) parkedSections.push(header[1].trim().slice(0, 120));
  }
  return { openItems, parkedSections };
}

/** The next-round entry block: baseline commands + open board + BACKLOG
 *  signals + the derived pointers. Generated, printed, never committed. */
export function nextRoundEntryBlock(
  backlogText: string,
  board: Array<{ n: number; title: string; blocks: string }>,
): string {
  const { openItems, parkedSections } = parseBacklogSignals(backlogText);
  const lines: string[] = [];
  lines.push("NEXT ROUND — entry scaffold (generated by omega:round-close; the HANDOFF is the rich version)");
  lines.push("");
  lines.push("1. Baseline first (falsifier discipline — must be green on entry):");
  lines.push("   bun test plugins/forge-author/test/happy/self-host.test.ts --timeout 60000");
  lines.push("   bun run omega:quick");
  lines.push("2. Open questions on the board (blocking-first):");
  if (board.length === 0) lines.push("   (none — 0 open)");
  for (const q of board) lines.push(`   D-${q.n} · ${q.title.slice(0, 100)} [Blocks: ${q.blocks}]`);
  lines.push("3. BACKLOG open items:");
  if (openItems.length === 0) lines.push("   (no OPEN-marked bullet parsed — read docs/forge/BACKLOG.md directly)");
  for (const it of openItems) lines.push(`   - ${it}`);
  if (parkedSections.length > 0) {
    lines.push("4. Parked (do not touch — see docs/forge/annex/OMEGA-CORE-FIRST-RESEQUENCE.md §3 for the register):");
    for (const s of parkedSections) lines.push(`   - ${s}`);
  }
  lines.push("5. Read the current HANDOFF-ROUND-<N>.md before writing any code — the boundary it names is binding.");
  return lines.join("\n");
}

/** Insert a ledger row after the LAST bundle-table row. Pure: refuses (issues,
 *  text unchanged) when the README carries no table to append to. */
export function appendLedgerRow(readmeText: string, row: string): { text: string; issues: string[] } {
  const lines = readmeText.split("\n");
  let lastRowIdx = -1;
  lines.forEach((l, i) => { if (/^\| `_\d+\.bundle` \|/.test(l)) lastRowIdx = i; });
  if (lastRowIdx === -1) return { text: readmeText, issues: ["no bundle-table row found in the ledger README — refusing to guess where the row goes"] };
  lines.splice(lastRowIdx + 1, 0, row);
  return { text: lines.join("\n"), issues: [] };
}

// ---- integration (CLI only) ----

function git(args: string[], cwd: string): { code: number; out: string } {
  return sh(["git", ...args], { cwd });
}

/** The bundle-protocol facts, collected from the actual tree. */
function collectFacts(root: string, ledgerDir: string): PreflightFacts & { lastTip: string; bundleFiles: string[] } {
  const tree = git(["status", "--porcelain"], root);
  const cleanTree = tree.code === 0 && tree.out.trim() === "";
  const quick = sh([process.execPath, "tooling/gates/gate.ts", "--quick"], { cwd: root, timeout: 120_000 });
  const quickGreen = quick.code === 0;
  const bf = boardFreshness(root);
  const boardFresh = bf.state === "fresh";
  const boardDetail = `state=${bf.state} (base ${bf.base || "?"}, head ${bf.head})`;
  const statusPath = join(root, "build", "status.json");
  let statusCarried = false;
  let statusDetail = "unknown";
  try {
    const st = JSON.parse(readFileSync(statusPath, "utf-8"));
    const headOk = git(["merge-base", "--is-ancestor", String(st.head ?? ""), "HEAD"], root).code === 0;
    const redStages = Object.entries(st.gate?.checks ?? {}).filter(([, v]) => (v as { ok?: boolean }).ok !== true).map(([k]) => k);
    const testsFail = st.tests?.fail;
    statusCarried = headOk && redStages.length === 0 && testsFail === 0;
    statusDetail = !headOk
      ? `head ${st.head} is not an ancestor of HEAD`
      : redStages.length > 0 ? `red stages recorded: ${redStages.join(", ")}` : testsFail !== 0 ? `tests.fail=${testsFail}` : `head ${st.head} carried, all stages green`;
  } catch (e) {
    statusDetail = String(e instanceof Error ? e.message : e).slice(0, 120);
  }
  const ledgerOk0 = existsSync(ledgerDir);
  let ledgerDetail = ledgerOk0 ? "ok" : `${ledgerDir} does not exist — pass --ledger <dir>`;
  let bundleFiles: string[] = [];
  let lastTip = "";
  if (ledgerOk0) {
    bundleFiles = readdirSync(ledgerDir).filter((f) => f.endsWith(".bundle"));
    const { ns, issues } = scanBundles(bundleFiles);
    const readme = existsSync(join(ledgerDir, "README.md"));
    if (issues.length > 0) ledgerDetail = issues.join("; ");
    else if (!readme) ledgerDetail = "no README.md in the ledger dir — refusing to guess where the table lives";
    else {
      const readmeRows = readFileSync(join(ledgerDir, "README.md"), "utf-8").split("\n").filter((l) => /^\| `_\d+\.bundle` \|/.test(l));
      const lastRowN = readmeRows.length > 0 ? Number(/^\| `_(\d+)\.bundle`/.exec(readmeRows[readmeRows.length - 1])![1]) : 0;
      if (ns.length === 0) ledgerDetail = "no prior bundles found — first bundle will be _1";
      else if (lastRowN !== ns[ns.length - 1]) ledgerDetail = `README table last row (_${lastRowN}) desynced from bundle files (_${ns[ns.length - 1]}) — fix the ledger first`;
    }
    if (ns.length > 0) {
      const heads = git(["bundle", "list-heads", join(ledgerDir, `vivim-omega-wave0-omega-forge_${ns[ns.length - 1]}.bundle`)], root);
      lastTip = heads.out.split("\n").find((l) => l.trim().endsWith(" HEAD"))?.split(/\s+/)[0] ?? "";
    }
  }
  const headFull = git(["rev-parse", "HEAD"], root).out.trim();
  const tipAdvanced = lastTip === "" ? true : headFull !== lastTip;
  return {
    cleanTree, treeDetail: tree.out.trim().split("\n").slice(0, 3).join(" / ").slice(0, 160),
    quickGreen, quickDetail: quick.out.trim().split("\n").slice(-3).join(" / ").slice(0, 200),
    decisionsGreen: false, decisionsDetail: "(filled by runRoundClose before the verdict)",
    boardFresh, boardDetail,
    statusCarried, statusDetail,
    ledgerOk: ledgerDetail === "ok" || ledgerDetail.startsWith("no prior bundles"), ledgerDetail,
    tipAdvanced, tipDetail: `HEAD ${headFull.slice(0, 7)} vs last bundle tip ${lastTip.slice(0, 7) || "(none)"}`,
    lastTip, bundleFiles,
  };
}

export interface RoundCloseResult {
  ok: boolean;
  refusals: string[];
  dryRun: boolean;
  bundlePath?: string;
  sha256?: string;
  row?: string;
  nextBlock?: string;
}

/** The full ceremony. Pure-ish: reads git/fs, writes ONLY on the green path
 *  (the bundle + the README row); refuses before any mutation otherwise. */
export async function runRoundClose(
  root: string,
  ledgerDir: string,
  note: string,
  evidence: string,
  dryRun = false,
): Promise<RoundCloseResult> {
  validateCell("note", note);
  validateCell("evidence", evidence);
  const d = await checkDecisions(root);
  const facts = collectFacts(root, ledgerDir);
  facts.decisionsGreen = d.ok;
  facts.decisionsDetail = d.ok ? `${d.detail.records} records, ${d.detail.ratified} ratified` : (d.issues[0] ?? "unknown").slice(0, 160);
  const v = preflightVerdict(facts);
  if (!v.ok) return { ok: false, refusals: v.refusals, dryRun };
  const { ns } = scanBundles(facts.bundleFiles);
  const n = (ns[ns.length - 1] ?? 0) + 1;
  const tip = git(["rev-parse", "--short", "HEAD"], root).out.trim();
  const tree = git(["rev-parse", "HEAD^{tree}"], root).out.trim();
  const dryRow = renderLedgerRow({ n, note, tip, tree, sha256: "a".repeat(64), evidence })
    .replace(shortHash("a".repeat(64)), "(sha256 computed at the real cut)");
  if (dryRun) {
    const nextBlock = nextRoundEntryBlock(readFileSync(join(root, "docs/forge/BACKLOG.md"), "utf-8"), listOpenQuestions(root));
    return { ok: true, refusals: [], dryRun: true, row: dryRow, nextBlock };
  }
  const bundlePath = join(ledgerDir, `vivim-omega-wave0-omega-forge_${n}.bundle`);
  const create = git(["bundle", "create", bundlePath, "--all"], root);
  if (create.code !== 0) return { ok: false, refusals: [`git bundle create failed: ${create.out.trim().slice(0, 200)}`], dryRun: false };
  const verify = git(["bundle", "verify", bundlePath], root);
  if (verify.code !== 0) return { ok: false, refusals: [`git bundle verify failed: ${verify.out.trim().slice(0, 200)} — the bundle file was written; remove it before re-running`], dryRun: false };
  const sha256 = createHash("sha256").update(readFileSync(bundlePath)).digest("hex");
  const finalRow = renderLedgerRow({ n, note, tip, tree, sha256, evidence });
  const readmePath = join(ledgerDir, "README.md");
  const appended = appendLedgerRow(readFileSync(readmePath, "utf-8"), finalRow);
  if (appended.issues.length > 0) {
    return { ok: false, refusals: [...appended.issues.map((i) => `${i} (bundle was created; append the row manually or remove the bundle)`)], dryRun: false };
  }
  writeFileSync(readmePath, appended.text);
  const nextBlock = nextRoundEntryBlock(readFileSync(join(root, "docs/forge/BACKLOG.md"), "utf-8"), listOpenQuestions(root));
  return { ok: true, refusals: [], dryRun: false, bundlePath, sha256, row: finalRow, nextBlock };
}

// ---- CLI ----

function parseCli(argv: string[]): { note: string; evidence: string; ledger?: string; dryRun: boolean } {
  const flags: Record<string, string> = {};
  let dryRun = false;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--dry-run") { dryRun = true; continue; }
    if (a.startsWith("--")) {
      const val = argv[i + 1];
      if (!val || val.startsWith("--")) throw new Error(`refused: ${a} needs a value`);
      flags[a.slice(2)] = val;
      i++;
    }
  }
  if (!flags["note"] || !flags["evidence"]) {
    throw new Error('refused: usage: bun run omega:round-close --note "<round description>" --evidence "<gate evidence>" [--ledger <dir>] [--dry-run]');
  }
  return { note: flags["note"], evidence: flags["evidence"], ledger: flags["ledger"], dryRun };
}

if (import.meta.main) {
  try {
    const a = parseCli(process.argv.slice(2));
    const ledgerDir = a.ledger ? join(ROOT, a.ledger) : join(ROOT, "..", "download");
    const r = await runRoundClose(ROOT, ledgerDir, a.note, a.evidence, a.dryRun);
    if (!r.ok) {
      console.error(`✗ round-close REFUSED (${r.refusals.length} named):`);
      for (const x of r.refusals) console.error(`  - ${x}`);
      process.exit(1);
    }
    if (r.dryRun) {
      console.log("○ dry-run: preflight green, nothing written. The row WOULD be:");
      console.log(`  ${r.row}`);
      console.log("");
      console.log(r.nextBlock);
      process.exit(0);
    }
    console.log(`✓ bundle: ${r.bundlePath} (git bundle verify green)`);
    console.log(`✓ sha256: ${r.sha256}`);
    console.log(`✓ ledger row appended:`);
    console.log(`  ${r.row}`);
    console.log("");
    console.log(r.nextBlock);
  } catch (e) {
    console.error(String(e instanceof Error ? e.message : e));
    process.exit(1);
  }
}
