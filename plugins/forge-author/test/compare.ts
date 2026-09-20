// forge.author — test/compare.ts (authored: the falsifier's judge)
// The self-hosting comparison, as six named rules (packet D4 "Comparison
// rule"). This file is AUTHORED on purpose: the comparison is the verdict the
// falsifier delivers about the system under test — a judge emitted by the
// defendant would not be a judge. Every failure is a NAMED issue {rule, file,
// detail}; there is no generic "diff failed".
//
// Rules:
//   1. Bytes outside FORGE:AUTHORED-BEGIN/END must match exactly (SPEC_BYTE_DRIFT).
//   2. Bytes inside authored regions are ignored (stripped from both sides).
//   3. Files listed in authoredFiles are ignored whole-file.
//   4. A file present in checked-in but not declared in the spec fails
//      (SPEC_UNDECLARED_FILE).
//   5. A file declared in the spec but missing from checked-in fails
//      (SPEC_FILE_MISSING); missing from the emission fails (EMIT_FILE_MISSING).
//   6. A generated block whose header hash does not match the spec fails
//      (SPEC_HASH_MISMATCH).
// No other exclusions are allowed — a wanted exclusion is backlog, not a gate
// exception.
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import {
  specInputHash,
  type RecordedSpec,
} from "../src/index.ts";

export interface CompareIssue { rule: string; file: string; detail: string }
export interface CompareResult { ok: boolean; issues: CompareIssue[] }

const GENERATED_HEADER = /FORGE:GENERATED-BEGIN schema=([\w.@-]+) spec-hash=(sha256:[0-9a-f]{64})/;

/** Every file under dir, as relative posix-style paths. node_modules is
 *  skipped — the same exclusion the host's contentHashDir applies: package
 *  manager links are machine state, not plugin bytes. */
export function listFilesRecursive(dir: string): string[] {
  const out: string[] = [];
  const walk = (d: string) => {
    for (const e of readdirSync(d)) {
      if (e === "node_modules") continue;
      const p = join(d, e);
      if (statSync(p).isDirectory()) walk(p);
      else out.push(relative(dir, p).split("\\").join("/"));
    }
  };
  walk(dir);
  return out.sort();
}

/** Remove every authored region (begin..end inclusive) from the text.
 *  Unbalanced markers remove to EOF — a broken region never silently passes. */
export function stripAuthoredRegions(text: string, regions: Array<{ markers: { begin: string; end: string } }>): string {
  let out = text;
  for (const r of regions) {
    for (;;) {
      const b = out.indexOf(r.markers.begin);
      if (b < 0) break;
      const e = out.indexOf(r.markers.end, b + r.markers.begin.length);
      if (e < 0) { out = out.slice(0, b); break; }
      out = out.slice(0, b) + out.slice(e + r.markers.end.length);
    }
  }
  return out;
}

/** First-difference detail: offset + a short window of both sides. */
function byteDiffDetail(path: string, a: string, b: string): string {
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i++) {
    if (a[i] !== b[i]) {
      const lo = Math.max(0, i - 24);
      return `${path}: first differing byte at offset ${i} — checked-in "...${a.slice(lo, i + 24).replace(/\n/g, "\\n")}..." vs emitted "...${b.slice(lo, i + 24).replace(/\n/g, "\\n")}..."`;
    }
  }
  return `${path}: lengths differ — checked-in ${a.length} bytes vs emitted ${b.length} (identical prefix)`;
}

/** The self-hosting comparison. `emittedDir` is the scratch output of one
 *  forge.author.init@1 run; `checkedInDir` is the plugin directory in the
 *  repository. Both sides strip authored regions before the byte compare, so
 *  the SAME file may differ inside its regions and still compare green. */
export function comparePluginTree(spec: RecordedSpec, emittedDir: string, checkedInDir: string): CompareResult {
  const issues: CompareIssue[] = [];
  const generatedFiles = spec.files.map((f) => f.path);
  const authoredFiles = spec.authoredFiles ?? [];
  const declared = new Set<string>([...generatedFiles, ...authoredFiles]);
  const regionsByFile = new Map<string, Array<{ markers: { begin: string; end: string } }>>();
  for (const r of spec.authoredRegions ?? []) {
    const list = regionsByFile.get(r.file) ?? [];
    list.push(r);
    regionsByFile.set(r.file, list);
  }
  const inputHash = specInputHash(spec as unknown as Record<string, unknown>);

  const checkedInFiles = new Set(listFilesRecursive(checkedInDir));

  // rule 4 — nothing undeclared may live in the checked-in tree
  for (const f of checkedInFiles) {
    if (!declared.has(f)) {
      issues.push({ rule: "SPEC_UNDECLARED_FILE", file: f, detail: `${f} exists in the checked-in plugin but the spec declares neither generating nor authoring it — undeclared bytes are invisible to the falsifier` });
    }
  }

  // rule 5 — every declared file must exist where it is claimed
  for (const f of declared) {
    if (!checkedInFiles.has(f)) {
      issues.push({ rule: "SPEC_FILE_MISSING", file: f, detail: `${f} is declared in the spec but missing from the checked-in plugin directory` });
    }
  }
  for (const f of generatedFiles) {
    try { statSync(join(emittedDir, f)); } catch {
      issues.push({ rule: "EMIT_FILE_MISSING", file: f, detail: `${f} is a generated file but the emission did not produce it` });
    }
  }

  // rules 1, 2, 6 — the byte comparison over generated files
  for (const f of generatedFiles) {
    if (!checkedInFiles.has(f)) continue; // already reported by rule 5
    let emittedBytes: string;
    try { emittedBytes = readFileSync(join(emittedDir, f), "utf-8"); } catch {
      continue; // already reported (EMIT_FILE_MISSING)
    }
    const checkedInBytes = readFileSync(join(checkedInDir, f), "utf-8");

    // rule 6 — the GENERATED header pins the spec's inputHash
    const header = GENERATED_HEADER.exec(checkedInBytes);
    if (header) {
      if (header[2] !== inputHash) {
        issues.push({ rule: "SPEC_HASH_MISMATCH", file: f, detail: `${f}: GENERATED header pins spec-hash=${header[2]} but the spec's computed inputHash is ${inputHash} — the header and the spec disagree on what generated this file` });
      }
    }

    // rules 1+2 — byte-identical outside authored regions
    const regions = regionsByFile.get(f) ?? [];
    const a = stripAuthoredRegions(checkedInBytes, regions);
    const b = stripAuthoredRegions(emittedBytes, regions);
    if (a !== b) {
      issues.push({ rule: "SPEC_BYTE_DRIFT", file: f, detail: byteDiffDetail(f, a, b) });
    }
  }

  return { ok: issues.length === 0, issues };
}
