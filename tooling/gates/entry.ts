// tooling/gates/entry.ts — D-422 (A16): the session-entry brief. ONE command
// answering what the B3 entry storm spent ~17 tool calls on (the efficiency
// audit's own measured tax): branch/tip, the last bundle + the ledger's
// resolved home, tip-advanced, dirty files with one-line classifications,
// status.json carriage/freshness, the open board + PROPOSED records, the
// docscan finding count (A15, report-only), the harness worklog check, and
// the derived next-command block. READ-ONLY: nothing here writes — entry
// verifies, it never regenerates (the D-414 recorded default, applied to
// entry: a tool that rewrote derived state at entry would race its own
// operator).
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { spawnSync as nodeSpawnSync } from "node:child_process";
import { boardFreshness, listOpenQuestions } from "./decisions.ts";
import { resolveLedgerDir } from "./round-close.ts";
import { renderDocscanReport, scanDocs } from "./docscan.ts";
import { checkProcess } from "./process.ts";
import { lastClosedEnvelope, renderSessionContext, verifySessions } from "./session.ts";

const ROOT = join(import.meta.dir, "../..");

function sh(cmd: string[]): { code: number; out: string } {
  const p = nodeSpawnSync(cmd[0], cmd.slice(1), { cwd: ROOT, encoding: "buffer" });
  return { code: p.status ?? 1, out: `${p.stdout?.toString() ?? ""}${p.stderr?.toString() ?? ""}` };
}

export interface DirtyFile { file: string; classification: string }

/** One-line classification per dirty file (pure — fixture-tested).
 *  statusLines: `git status --porcelain` lines (XY + path). numstatLines:
 *  `git diff --numstat HEAD` lines (adds\tdels\tpath — tracked changes only;
 *  untracked files classify without a delta). */
export function classifyDirty(statusLines: string[], numstatLines: string[] = []): DirtyFile[] {
  const deltas = new Map<string, string>();
  for (const line of numstatLines) {
    if (!line.trim()) continue;
    const [adds, dels, ...rest] = line.split("\t");
    const file = rest.join("\t").trim();
    if (file) deltas.set(file, `+${adds === "-" ? "?" : adds}/−${dels === "-" ? "?" : dels}`);
  }
  const out: DirtyFile[] = [];
  for (const line of statusLines) {
    if (!line.trim()) continue;
    const xy = line.slice(0, 2).trim();
    const raw = line.slice(3).trim().replace(/^"|"$/g, "");
    const arrow = / -> /.exec(raw); // rename spelling: "old -> new"
    const file = arrow ? arrow[1] : raw;
    const delta = deltas.get(file) ?? (xy === "??" ? "(untracked)" : "");
    let classification = [delta, xy && xy !== "??" ? `status ${xy}` : ""].filter(Boolean).join(" ") || xy;
    if (file === "build/status.json") classification += " · gate-run artifact (carried at close)";
    else if (file.startsWith("docs/decisions/") || file === "docs/BUILD-DECISIONS.md") classification += " · decision input";
    else if (file.startsWith("docs/")) classification += " · docs";
    else if (file.startsWith("tooling/")) classification += " · tooling";
    out.push({ file, classification });
  }
  return out;
}

export function worklogPath(): string {
  return process.env.OMEGA_WORKLOG ?? "/home/z/my-project/worklog.md";
}

export function nextCommands(proposed: number[], boardCount: number): string[] {
  const lines: string[] = [];
  if (proposed.length > 0) {
    lines.push(`Next (PROPOSED records open: ${proposed.map((n) => `D-${n}`).join(", ")}):`);
    lines.push("  1. session discipline (D-430): omega:session begin --mission … FIRST, stream events as you work, close with the retrospective before round-close");
    lines.push("  2. falsifier baseline: bun test plugins/forge-author/test/happy/self-host.test.ts --timeout 60000 && bun run omega:quick");
    lines.push("  3. full gate ×2 on the PROPOSED tree: bun run omega:gate (record the numbers; omega:session import --gates after each)");
    lines.push("  4. ratify: flip Status → RATIFIED + cite the landing sha + gate numbers in each record's Evidence");
    lines.push("  5. bun run omega:questions --write (rows + board) — commit the ratify");
    lines.push("  6. board refresh at the ratified tip (regenerate + commit — the ratify changed decision inputs)");
    lines.push("  7. close-out (HANDOFF-ROUND-<N> + BACKLOG strikes), omega:session close --lesson …, then bun run omega:round-close --note … --evidence … (rehearse --dry-run first)");
  } else {
    lines.push("Next (0 PROPOSED):");
    lines.push("  baseline: bun test plugins/forge-author/test/happy/self-host.test.ts --timeout 60000 && bun run omega:quick");
    lines.push(`  close: omega:session close --lesson … (if open) then bun run omega:round-close --note … --evidence … (rehearse --dry-run first)${boardCount > 0 ? ` — ${boardCount} open question(s) on the board first` : ""}`);
  }
  return lines;
}

export function entryReport(root = ROOT): string[] {
  const lines: string[] = [];
  const branch = sh(["git", "rev-parse", "--abbrev-ref", "HEAD"]).out.trim();
  const tip = sh(["git", "rev-parse", "--short", "HEAD"]).out.trim();
  lines.push(`omega:entry — ${branch} @ ${tip}`);

  // ledger + last bundle (A17's resolver, so entry and close agree on the home)
  const resolved = resolveLedgerDir(root);
  let lastBundle = "(none resolvable)";
  let tipAdvanced = "(unknown — no last-bundle tip)";
  if (existsSync(resolved.dir)) {
    const readme = join(resolved.dir, "README.md");
    if (existsSync(readme)) {
      const rows = readFileSync(readme, "utf-8").split("\n")
        .map((l) => /^\| `_(\d+)\.bundle`/.exec(l)).filter(Boolean).map((m) => Number(m![1]));
      if (rows.length > 0) {
        const last = Math.max(...rows);
        const bp = join(resolved.dir, `vivim-omega-wave0-omega-forge_${last}.bundle`);
        if (existsSync(bp)) {
          const heads = sh(["git", "bundle", "list-heads", bp]);
          const lastTip = heads.out.split("\n").find((l) => l.trim().endsWith(" HEAD"))?.split(/\s+/)[0] ?? "";
          const headFull = sh(["git", "rev-parse", "HEAD"]).out.trim();
          const advanced = lastTip ? headFull !== lastTip : true;
          lastBundle = `_${last} (tip ${lastTip.slice(0, 7) || "?"})`;
          tipAdvanced = advanced ? "yes" : `NO — tip unchanged (double-run guard will refuse)`;
        } else {
          lastBundle = `_${last} (row present, bundle file pruned by delivery)`;
        }
      }
    }
  } else {
    lastBundle = `(ledger dir absent — searched: ${resolved.searched.join("; ")})`;
  }
  lines.push(`Ledger: ${resolved.dir} (via ${resolved.source}) · last bundle: ${lastBundle} · tip advanced: ${tipAdvanced}`);

  // dirty files, classified (porcelain for the file set + XY, numstat for deltas).
  // NOTE: no .trim() before the split — trim() would eat the FIRST line's
  // leading XY space (" M .gitignore" → "M .gitignore" → slice(3) loses the
  // dot); empty-line filtering replaces it.
  const porcelain = sh(["git", "status", "--porcelain"]).out;
  if (!porcelain.trim()) lines.push("Tree: clean");
  else {
    const numstat = sh(["git", "diff", "--numstat", "HEAD"]).out.split("\n");
    const dirty = classifyDirty(porcelain.split("\n").filter((l) => l.trim()), numstat);
    lines.push(`Tree: ${dirty.length} dirty — ${dirty.map((d) => `${d.file} (${d.classification})`).join("; ").slice(0, 300)}`);
  }

  // status.json carriage + freshness
  try {
    const st = JSON.parse(readFileSync(join(root, "build/status.json"), "utf-8"));
    const carried = sh(["git", "merge-base", "--is-ancestor", String(st.head ?? ""), "HEAD"]).code === 0;
    const red = Object.entries(st.gate?.checks ?? {}).filter(([, v]) => (v as { ok?: boolean }).ok !== true).map(([k]) => k);
    const ageMin = Math.round((Date.now() - new Date(st.generatedAt as string).getTime()) / 60000);
    lines.push(`status.json: head ${st.head} ${carried ? "carried" : "NOT an ancestor of HEAD"} · ${red.length === 0 ? "all stages green" : `RED: ${red.join(",")}`} · tests ${st.tests?.pass ?? "?"}/${st.tests?.fail ?? "?"} · age ${ageMin}m`);
  } catch (e) {
    lines.push(`status.json: unreadable (${String(e instanceof Error ? e.message : e).slice(0, 80)})`);
  }

  // board + PROPOSED (the board is the file-backed authority — raw index-row
  // scanning would surface prose-word false positives from grandfathered
  // hand-era rows, e.g. D-213's narration row)
  const qs = listOpenQuestions(root);
  const fresh = boardFreshness(root);
  const proposed = qs.map((q) => q.n);
  lines.push(`Board: ${qs.length} open (${fresh.state}) · PROPOSED records: ${proposed.length ? proposed.map((n) => `D-${n}`).join(", ") : "none"}`);

  // docscan (A15) — report-only count, so the scan is seen routinely
  try {
    const ds = scanDocs(root);
    lines.push(`docscan: ${ds.findings.length} finding(s) (report-only)`);
    for (const f of ds.findings.slice(0, 5)) lines.push(`  ${f.rule} ${f.file}:${f.line}: ${f.msg}`);
    if (ds.findings.length > 5) lines.push(`  … (+${ds.findings.length - 5} more — bun run omega:docscan)`);
  } catch (e) {
    lines.push(`docscan: mechanical breakage — ${String(e instanceof Error ? e.message : e).slice(0, 120)}`);
  }

  // process self-model (D-423) — one consolidated line, sourced from the same
  // derivation the `process` gate stage and `omega:process` use
  try {
    const pm = checkProcess(root);
    const d = pm.detail;
    lines.push(pm.ok
      ? `Process: gate ${d["gateGreen"] === null ? "n/a" : d["gateGreen"] ? "GREEN" : "RED"}${d["gateStale"] ? " (STALE vs tip)" : ""} · board ${d["boardOpen"]} open/${d["boardBlocking"]} blocking · docscan ${d["docscanFindings"]} · ratified ${d["ratifiedCount"]} index rows (omega:process)`
      : `Process: mechanical breakage — ${pm.issues.join("; ").slice(0, 120)}`);
  } catch (e) {
    lines.push(`Process: mechanical breakage — ${String(e instanceof Error ? e.message : e).slice(0, 120)}`);
  }

  // session ledger (D-430) — the stream state + last session's bottleneck
  // digest, sourced from the session module's own readers (never a second
  // parser). If a session is OPEN, this is the loudest line on the page:
  // the work is already inside a witnessed stream.
  try {
    lines.push(...renderSessionContext(verifySessions(root), lastClosedEnvelope(root)));
  } catch (e) {
    lines.push(`session: mechanical breakage — ${String(e instanceof Error ? e.message : e).slice(0, 120)}`);
  }

  // harness worklog law
  const wl = worklogPath();
  lines.push(`Worklog: ${existsSync(wl) ? `present (${wl})` : `ABSENT (${wl}) — the harness law requires a record before close (append it)`}`);

  lines.push("");
  lines.push(...nextCommands(proposed, qs.length));
  return lines;
}

if (import.meta.main) {
  for (const l of entryReport()) console.log(l);
}
