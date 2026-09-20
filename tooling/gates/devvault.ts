// tooling/gates/devvault.ts — D-428 (Ω-DEV.4): the development vault.
//
// The gap this closes: every development session starts from zero — lessons,
// patterns, and mistakes evaporate when the session ends. The tree already
// reserved the seat: .gitignore carries `dev-vault/` and the fresh-tree walk
// skips it — environment-local by design, anticipated before this record.
// The constitutional fit that reservation encodes:
//
//   LAW IS COMMITTED    (docs/decisions, the gate, the genome)
//   MEMORY IS LOCAL     (dev-vault/ — survives sessions on this box,
//                        never committed, never a substitute for a record)
//
// Shape: ns.dev as filesystem tooling state (the runtime vault's ns registry
// governs compartment persistence — this is the TOOLING-side namespace, the
// same evidence-class distinction D-423/D-424 drew). Rows:
//
//   dev.entry@1 { id, type: lesson|pattern|mistake|note, at, agent,
//                 context, statement, evidence[], appliesTo[],
//                 retention: "dev-vault-permanent" }
//
// Laws (all mechanical, all refusal-first):
//   - APPEND-ONLY: entries are written once; a hash chain (ledger.json)
//     makes tampering detectable — verifyDevVault recomputes every link.
//     Extending a broken chain is refused; editing or deleting an entry is
//     detected, never prevented (local files) — the chain is the witness.
//   - EVIDENCE-REQUIRED: every entry cites at least one resolvable artifact
//     (a D-id, a file path, a URL) — an uncited lesson is an opinion.
//   - The fold (knowledge.md) is derived: regenerate, never hand-edit.
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { join } from "node:path";

export const DEV_TYPES = ["lesson", "pattern", "mistake", "note"] as const;
export type DevType = (typeof DEV_TYPES)[number];

export interface DevEntry {
  id: string;              // <yyyymmdd>-<slug> — stable, human-sortable
  type: DevType;
  at: string;              // ISO — allowed HERE (local memory, not the genome: no byte-verify)
  agent: string;
  context: string;
  statement: string;
  evidence: string[];      // ≥1 required — citations, not opinions
  appliesTo: string[];     // layer ids / D-ids
  retention: "dev-vault-permanent";
}

export interface ChainLink { file: string; sha256: string; prev: string }
export interface DevLedger { chain: ChainLink[]; head: string }

const GENESIS = "genesis";

function sha256(s: string): string {
  return createHash("sha256").update(s, "utf-8").digest("hex");
}

function entriesDir(root: string): string { return join(root, "dev-vault", "entries"); }
function ledgerPath(root: string): string { return join(root, "dev-vault", "ledger.json"); }

function readLedger(root: string): DevLedger {
  if (!existsSync(ledgerPath(root))) return { chain: [], head: GENESIS };
  try {
    const l = JSON.parse(readFileSync(ledgerPath(root), "utf-8")) as DevLedger;
    return { chain: Array.isArray(l.chain) ? l.chain : [], head: typeof l.head === "string" ? l.head : GENESIS };
  } catch {
    throw new Error("DEV_LEDGER_UNREADABLE: dev-vault/ledger.json is malformed — repair the ledger before appending (the chain is the witness)");
  }
}

/** Serialize an entry to its canonical stored bytes (stable key order). */
export function serializeEntry(e: DevEntry): string {
  return `${JSON.stringify(e, null, 2)}\n`;
}

/** Parse + validate one entry file. Pure. */
export function parseEntry(text: string): { entry: DevEntry | null; issues: string[] } {
  const issues: string[] = [];
  let raw: unknown;
  try { raw = JSON.parse(text); } catch { return { entry: null, issues: ["not valid JSON"] }; }
  const e = raw as Partial<DevEntry>;
  if (!e.id || !/^\d{8}-[a-z0-9-]+$/.test(e.id)) issues.push(`id "${e.id}" must be <yyyymmdd>-<kebab-slug>`);
  if (!DEV_TYPES.includes(e.type as DevType)) issues.push(`type "${e.type}" illegal (${DEV_TYPES.join(" | ")})`);
  if (!e.statement || !e.statement.trim()) issues.push("statement is required and must be non-empty");
  if (!Array.isArray(e.evidence) || e.evidence.length === 0 || e.evidence.some((c) => !String(c).trim())) {
    issues.push("DEV_EVIDENCE_REQUIRED: at least one non-empty evidence citation — an uncited lesson is an opinion");
  }
  if (e.retention !== "dev-vault-permanent") issues.push(`retention "${e.retention}" illegal (dev-vault-permanent)`);
  if (issues.length > 0) return { entry: null, issues };
  return { entry: e as DevEntry, issues: [] };
}

/** Verify the whole vault: recompute the chain, check every cited file
 *  exists, flag orphan entry files not in the chain. The tamper witness. */
export function verifyDevVault(root: string): { ok: boolean; issues: string[]; count: number } {
  const issues: string[] = [];
  const ledger = readLedger(root);
  let prev = GENESIS;
  let count = 0;
  for (const link of ledger.chain) {
    const abs = join(root, "dev-vault", link.file);
    if (!existsSync(abs)) { issues.push(`DEV_CHAIN_BROKEN: chained entry ${link.file} is missing`); prev = link.sha256; count++; continue; }
    const actual = sha256(readFileSync(abs, "utf-8"));
    if (actual !== link.sha256) issues.push(`DEV_CHAIN_BROKEN: ${link.file} hash mismatch — recorded ${link.sha256.slice(0, 8)}…, actual ${actual.slice(0, 8)}… (edited or corrupted after chaining)`);
    if (link.prev !== prev) issues.push(`DEV_CHAIN_BROKEN: ${link.file} prev ${link.prev.slice(0, 8)}… does not continue the chain (${prev.slice(0, 8)}…)`);
    const { entry, issues: entryIssues } = parseEntry(readFileSync(abs, "utf-8"));
    if (!entry) issues.push(`DEV_ENTRY_INVALID: ${link.file}: ${entryIssues.join("; ")}`);
    prev = link.sha256;
    count++;
  }
  if (ledger.head !== prev) issues.push(`DEV_CHAIN_BROKEN: ledger head ${ledger.head.slice(0, 8)}… ≠ recomputed ${prev.slice(0, 8)}…`);
  if (existsSync(entriesDir(root))) {
    const chained = new Set(ledger.chain.map((l) => l.file));
    for (const f of readdirSync(entriesDir(root)).filter((x) => x.endsWith(".json"))) {
      if (!chained.has(`entries/${f}`)) issues.push(`DEV_ORPHAN: entries/${f} exists but is not in the chain — record it or remove it (an unchained entry is unverifiable)`);
    }
  }
  return { ok: issues.length === 0, issues, count };
}

/** Append one entry (write once + chain). Refusals: DEV_ENTRY_EXISTS,
 *  DEV_EVIDENCE_REQUIRED (via parseEntry), DEV_CHAIN_BROKEN (refuse to
 *  extend a broken chain — repair first, the chain is the witness). */
export function recordDevEntry(root: string, e: DevEntry): { file: string; sha256: string } {
  const { entry, issues } = parseEntry(serializeEntry(e));
  if (!entry) throw new Error(`refused: ${issues.join("; ")}`);
  const vault = { ok: verifyDevVault(root).ok };
  if (!vault.ok) {
    const v = verifyDevVault(root);
    throw new Error(`refused: DEV_CHAIN_BROKEN — will not extend a broken chain (${v.issues[0]}); repair before appending`);
  }
  const rel = `entries/${e.id}.json`;
  const abs = join(root, "dev-vault", rel);
  if (existsSync(abs)) throw new Error(`refused: DEV_ENTRY_EXISTS — dev-vault/${rel} is written once; append-only means never rewritten (supersede with a new entry that cites this one)`);
  mkdirSync(entriesDir(root), { recursive: true });
  const bytes = serializeEntry(e);
  writeFileSync(abs, bytes);
  const ledger = readLedger(root);
  const digest = sha256(bytes);
  ledger.chain.push({ file: rel, sha256: digest, prev: ledger.head });
  ledger.head = digest;
  writeFileSync(ledgerPath(root), `${JSON.stringify(ledger, null, 2)}\n`);
  return { file: `dev-vault/${rel}`, sha256: digest };
}

/** Query: case-insensitive substring over statement/context/appliesTo. Pure
 *  over collected entries. */
export function queryDevVault(entries: DevEntry[], text: string): DevEntry[] {
  const t = text.toLowerCase();
  return entries.filter((e) =>
    e.statement.toLowerCase().includes(t) ||
    e.context.toLowerCase().includes(t) ||
    e.appliesTo.some((a) => a.toLowerCase().includes(t)));
}

/** Load all chained entries in chain order. */
export function loadDevEntries(root: string): DevEntry[] {
  const ledger = readLedger(root);
  const out: DevEntry[] = [];
  for (const link of ledger.chain) {
    const abs = join(root, "dev-vault", link.file);
    if (!existsSync(abs)) continue;
    const { entry } = parseEntry(readFileSync(abs, "utf-8"));
    if (entry) out.push(entry);
  }
  return out;
}

/** The fold: knowledge.md, grouped by type, chain order, derived. Pure. */
export function foldDevVault(entries: DevEntry[]): string {
  const lines: string[] = [];
  lines.push("# The development knowledge base (ns.dev fold)");
  lines.push("");
  lines.push("<!-- generated by omega:devault fold (D-428). Derived — regenerate, never hand-edit. Source of truth: dev-vault/entries + ledger.json (hash-chained, append-only). -->");
  lines.push("");
  for (const type of DEV_TYPES) {
    const of = entries.filter((e) => e.type === type);
    if (of.length === 0) continue;
    lines.push(`## ${type} (${of.length})`);
    lines.push("");
    for (const e of of) {
      lines.push(`- **${e.id}** · ${e.at} · ${e.agent} · applies: ${e.appliesTo.join(", ") || "—"}`);
      lines.push(`  - context: ${e.context}`);
      lines.push(`  - ${e.statement}`);
      lines.push(`  - evidence: ${e.evidence.join("; ")}`);
    }
    lines.push("");
  }
  if (entries.length === 0) lines.push("(empty — no entries chained yet)");
  return lines.join("\n");
}

// ---- CLI (`omega:devault add|verify|query|fold`) ----

if (import.meta.main) {
  const ROOT = join(import.meta.dir, "../..");
  const [cmd, ...rest] = process.argv.slice(2);
  try {
    if (cmd === "add") {
      const flags: Record<string, string> = {};
      const positional: string[] = [];
      for (let i = 0; i < rest.length; i++) {
        if (rest[i].startsWith("--")) { flags[rest[i].slice(2)] = rest[i + 1] ?? ""; i++; }
        else positional.push(rest[i]);
      }
      const stmt = positional.join(" ").trim();
      if (!stmt) throw new Error('refused: usage: omega:devault add "the statement" --type lesson --context "…" --agent "…" --evidence "D-425,docs/foo.ts" --applies "Ω-DEV.1"');
      const split = (v?: string) => (v ? v.split(",").map((s) => s.trim()).filter(Boolean) : []);
      const id = `${new Date().toISOString().slice(0, 10).replace(/-/g, "")}-${(flags["slug"] ?? stmt.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")).slice(0, 48)}`;
      const r = recordDevEntry(ROOT, {
        id,
        type: (flags["type"] ?? "lesson") as DevType,
        at: new Date().toISOString(),
        agent: flags["agent"] ?? "omega-continuation-agent",
        context: flags["context"] ?? "(unspecified context)",
        statement: stmt,
        evidence: split(flags["evidence"]),
        appliesTo: split(flags["applies"]),
        retention: "dev-vault-permanent",
      });
      console.log(`chained: ${r.file} (sha256 ${r.sha256.slice(0, 8)}…, prev linked)`);
    } else if (cmd === "verify") {
      const v = verifyDevVault(ROOT);
      for (const i of v.issues) console.error(`✗ ${i}`);
      console.log(v.ok ? `dev-vault: GREEN — ${v.count} entries, chain intact` : "dev-vault: RED — the chain is the witness; repair before appending");
      process.exit(v.ok ? 0 : 1);
    } else if (cmd === "query") {
      const text = rest[0];
      if (!text) throw new Error("refused: usage: omega:devault query <text>");
      for (const e of queryDevVault(loadDevEntries(ROOT), text)) console.log(`[${e.type}] ${e.id}: ${e.statement} (evidence: ${e.evidence.join("; ")})`);
    } else if (cmd === "fold") {
      const md = foldDevVault(loadDevEntries(ROOT));
      writeFileSync(join(ROOT, "dev-vault", "knowledge.md"), md);
      console.log(`folded: dev-vault/knowledge.md (${loadDevEntries(ROOT).length} entries)`);
    } else {
      console.log("usage: omega:devault add \"statement\" --type lesson|pattern|mistake|note --context … --agent … --evidence a,b --applies x,y [--slug kebab] | verify | query <text> | fold");
    }
  } catch (e) {
    console.error(String(e instanceof Error ? e.message : e));
    process.exit(1);
  }
}
