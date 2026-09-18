// tooling/harvest — fixture-import.ts (W1 task 3: the fixture pipeline)
//
// The recorded-fixture pipeline: import a RECORDED session/export fixture
// (never live network) into fixtures/, validate it parses through the
// GOVERNED parsers (the substitution-shape check), and pin its provenance
// + content hash in fixtures/harvest/MANIFEST.json.
//
// Substitution-shape check (D-380 bar 1, applied at W1 scope): a fixture is
// admissible iff (a) the governed parser for its declared kind consumes it
// without refusal and (b) the parse is byte-identical across two runs
// (determinism) — the recorded bytes substitute for the recorded session
// exactly because the extracted rows are a pure function of the bytes. The
// live-capture substitution test itself is W2 (D-380); W1 pins the bytes and
// the shape so drift refuses here, with a name.
//
// MANIFEST.json is CANONICAL: sorted rows, canonical JSON emitter, stable
// field order — byte-identical under `omega:fixtures:import` re-runs.
import { createHash } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join, relative } from "node:path";

const REPO_ROOT = join(import.meta.dir, "..", "..");
const MANIFEST_PATH = join(REPO_ROOT, "fixtures", "harvest", "MANIFEST.json");

export interface HarvestRow {
  fixture: string;       // repo-relative path
  kind: "sse" | "import";
  source: string;        // sse → "llm"; import → "chatgpt"|"claude"|"gemini"
  provenance: {
    mine: string;        // "vivim-final-program@4a5eb84" — the pinned mine
    originPath: string;  // path in the mine the shape/algorithm was grounded on
    recordedOnly: true;  // the pipeline imports recorded sessions ONLY
  };
  sha256: string;        // sha256 of the fixture bytes (hex)
  bytes: number;
  rows: number;          // ParsedChunk count the governed parser produces
  final: boolean;        // the parse terminates lawfully (exactly-one-final)
  harvestedAt: string;   // fixed date string supplied by the caller (never the clock)
}

// ---- canonical bytes ---------------------------------------------------------

/** Canonical JSON: sorted keys, 2-space indent, trailing newline. Same object
 *  in → same bytes out, always (the MANIFEST is byte-comparable). */
export function canonicalJson(v: unknown): string {
  const sort = (x: unknown): unknown => {
    if (Array.isArray(x)) return x.map(sort);
    if (x !== null && typeof x === "object") {
      return Object.fromEntries(Object.entries(x as Record<string, unknown>).sort(([a], [b]) => (a < b ? -1 : 1)).map(([k, val]) => [k, sort(val)]));
    }
    return x;
  };
  return JSON.stringify(sort(v), null, 2) + "\n";
}

function sha256(bytes: Buffer): string {
  return createHash("sha256").update(bytes).digest("hex");
}

// ---- governed-parser substitution-shape check --------------------------------

// Tooling imports the two parser modules directly (both are pure, zero-dep,
// contracts-only) — the same borrower pattern plugin tests use.
import { resolveParser as resolveLlmParser } from "../../plugins/provider-llm/src/parsers.ts";
import { resolveImportParser, IMPORT_SOURCES } from "../../plugins/vivim-chat/src/parsers.ts";
import type { ParsedChunk } from "@vivim/omega-contracts";

export function shapeCheck(kind: HarvestRow["kind"], source: string, text: string): { rows: ParsedChunk[]; final: boolean } {
  if (kind === "sse") {
    if (source !== "llm") throw new Error(`fixture-import: sse kind expects source "llm" (got ${JSON.stringify(source)})`);
    const def = resolveLlmParser("1"); // governed pin, fail-closed
    const rows = def.transform(text);
    return { rows, final: rows[rows.length - 1]!.final === true };
  }
  if (kind === "import") {
    const def = resolveImportParser(source, "1"); // governed pin, fail-closed
    const rows = def.transform(text);
    return { rows, final: rows[rows.length - 1]!.final === true };
  }
  throw new Error(`fixture-import: unknown kind ${JSON.stringify(kind)} (want sse|import)`);
}

// ---- manifest read/write ------------------------------------------------------

export function readManifest(): { version: 1; fixtures: HarvestRow[] } {
  if (!existsSync(MANIFEST_PATH)) return { version: 1, fixtures: [] };
  const m = JSON.parse(readFileSync(MANIFEST_PATH, "utf-8")) as { version: 1; fixtures: HarvestRow[] };
  if (m.version !== 1 || !Array.isArray(m.fixtures)) {
    throw new Error(`fixture-import: ${relative(REPO_ROOT, MANIFEST_PATH)} is not a v1 manifest`);
  }
  return m;
}

export function writeManifest(rows: HarvestRow[]): void {
  const manifest = { version: 1 as const, fixtures: [...rows].sort((a, b) => (a.fixture < b.fixture ? -1 : a.fixture > b.fixture ? 1 : 0)) };
  writeFileSync(MANIFEST_PATH, Buffer.from(canonicalJson(manifest), "utf-8"));
}

// ---- import + check ------------------------------------------------------------

export interface ImportOpts {
  fixturePath: string;   // repo-relative or absolute
  kind: HarvestRow["kind"];
  source: string;
  mine: string;          // e.g. "vivim-final-program@4a5eb84"
  originPath: string;    // e.g. "src/engines/parsers/sse-parser.ts"
  harvestedAt: string;   // fixed date, e.g. "2026-09-17" — never Date.now()
}

/** Import one recorded fixture: shape-check through the governed parser,
 *  hash the bytes, upsert the MANIFEST row (canonical bytes). Returns the row. */
export function importFixture(opts: ImportOpts): HarvestRow {
  const abs = opts.fixturePath.startsWith("/") ? opts.fixturePath : join(REPO_ROOT, opts.fixturePath);
  if (!existsSync(abs)) throw new Error(`fixture-import: fixture not found: ${opts.fixturePath}`);
  const bytes = readFileSync(abs);
  const text = bytes.toString("utf-8");
  const rel = relative(REPO_ROOT, abs).split("\\").join("/");
  if (opts.mine.length === 0 || !opts.mine.includes("@")) {
    throw new Error(`fixture-import: provenance.mine must be <repo>@<pinned-sha> (got ${JSON.stringify(opts.mine)})`);
  }
  if (opts.originPath.length === 0) throw new Error("fixture-import: provenance.originPath must name the mine path the shape was grounded on");
  if (kind8(opts.kind, opts.source)) {
    throw new Error(`fixture-import: source ${JSON.stringify(opts.source)} is not a harvested import source (want ${IMPORT_SOURCES.join("|")})`);
  }
  const first = shapeCheck(opts.kind, opts.source, text);
  const second = shapeCheck(opts.kind, opts.source, text); // determinism: parse twice
  if (JSON.stringify(first.rows) !== JSON.stringify(second.rows)) {
    throw new Error(`fixture-import: ${rel} parsed non-deterministically across runs — refusing (substitution-shape law)`);
  }
  if (!first.final) {
    throw new Error(`fixture-import: ${rel} parse does not terminate (no final row) — refusing`);
  }
  const row: HarvestRow = {
    fixture: rel,
    kind: opts.kind,
    source: opts.source,
    provenance: { mine: opts.mine, originPath: opts.originPath, recordedOnly: true },
    sha256: sha256(bytes),
    bytes: bytes.length,
    rows: first.rows.length,
    final: first.final,
    harvestedAt: opts.harvestedAt,
  };
  const m = readManifest();
  const others = m.fixtures.filter((r) => r.fixture !== rel);
  writeManifest([...others, row]);
  return row;
}

function kind8(kind: HarvestRow["kind"], source: string): boolean {
  return kind === "import" && !(IMPORT_SOURCES as readonly string[]).includes(source);
}

export interface CheckResult {
  ok: boolean;
  problems: string[];
  rows: number;
}

/** Verify every MANIFEST row against disk: exists, byte-hash matches, shape
 *  still parses through the governed parser, determinism holds. Named problems,
 *  fail-closed — this is the drift refusal the pipeline promises. */
export function checkFixtures(): CheckResult {
  const m = readManifest();
  const problems: string[] = [];
  for (const row of m.fixtures) {
    const abs = join(REPO_ROOT, row.fixture);
    if (!existsSync(abs)) {
      problems.push(`${row.fixture}: MISSING (recorded in MANIFEST, gone on disk)`);
      continue;
    }
    const bytes = readFileSync(abs);
    const hash = sha256(bytes);
    if (hash !== row.sha256) {
      problems.push(`${row.fixture}: HASH DRIFT (recorded ${row.sha256.slice(0, 12)}…, disk ${hash.slice(0, 12)}…) — recorded bytes changed; re-import with provenance or revert`);
      continue;
    }
    try {
      const { rows, final } = shapeCheck(row.kind, row.source, bytes.toString("utf-8"));
      if (!final) problems.push(`${row.fixture}: parse no longer terminates`);
      if (rows.length !== row.rows) {
        problems.push(`${row.fixture}: ROW SHAPE DRIFT (recorded ${row.rows} rows, now ${rows.length}) — parser or fixture changed without a re-import`);
      }
    } catch (e) {
      problems.push(`${row.fixture}: SHAPE REFUSED — ${String(e)}`);
    }
    if (row.provenance.recordedOnly !== true) {
      problems.push(`${row.fixture}: provenance.recordedOnly must be true (the pipeline imports recorded sessions only)`);
    }
  }
  return { ok: problems.length === 0, problems, rows: m.fixtures.length };
}

// ---- CLI ------------------------------------------------------------------------

function main(argv: string[]): number {
  if (argv.includes("--check")) {
    const r = checkFixtures();
    for (const p of r.problems) console.error(`FIXTURE DRIFT: ${p}`);
    console.log(r.ok ? `fixtures: ${r.rows} recorded rows verified (hash + shape + determinism)` : `fixtures: ${r.problems.length} drift problem(s)`);
    return r.ok ? 0 : 1;
  }
  const get = (flag: string): string | undefined => {
    const i = argv.indexOf(flag);
    return i >= 0 ? argv[i + 1] : undefined;
  };
  const fixturePath = get("--import");
  const kind = get("--kind") as HarvestRow["kind"] | undefined;
  const source = get("--source");
  const mine = get("--mine") ?? "vivim-final-program@4a5eb84";
  const originPath = get("--origin") ?? "";
  const harvestedAt = get("--at") ?? "2026-09-17";
  if (!fixturePath || !kind || !source) {
    console.error("usage: bun run omega:fixtures:import -- --import <fixture-path> --kind sse|import --source <llm|chatgpt|claude|gemini> [--mine repo@sha] [--origin <mine path>] [--at YYYY-MM-DD]");
    console.error("       bun run omega:fixtures:check");
    return 2;
  }
  const row = importFixture({ fixturePath, kind, source, mine, originPath, harvestedAt });
  console.log(`imported ${row.fixture} (${row.bytes} bytes, ${row.rows} rows, sha256 ${row.sha256.slice(0, 12)}…)`);
  return 0;
}

if (import.meta.main) {
  process.exit(main(process.argv.slice(2)));
}
