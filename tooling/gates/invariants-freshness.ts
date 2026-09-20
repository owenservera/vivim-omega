// tooling/gates/invariants-freshness.ts — D-415 (A3): the invariants digest's
// freshness, computed on TRIGGER, not calendar (the acceleration review's
// design; closes the B5 gap where CURRENT-INVARIANTS.md sat a full
// constitutional layer stale).
//
// The digest carries a machine-readable marker:
//   <!-- invariants: pass N · as-of D-NNN · regenerated YYYY-MM-DD (D-NNN) ·
//      stages: <the gate stages the digest documents, space-separated> -->
// The stage computes staleness from three inputs — the marker, the decisions
// index (ratified rows past as-of), and the gate's stage registry
// (explain.ts STAGE_DOCS — the canonical list) — and REPORTS:
//   T1 · 30 ratifications since as-of accumulate (the calendar trigger,
//        mechanical form)
//   T2 · stage drift, both directions (a live gate stage the digest does not
//        document, or a documented stage the gate no longer runs)
//   T3 · wave closure — DEFERRED with a named trigger (see the record): no
//        mechanical wave registry exists yet; the forge waves close as
//        ratified records, which T1 catches within bounded distance. The
//        trigger for implementing T3: the first forge wave closure landing
//        WITH a wave registry to read (status.json's waves array extended,
//        or a BACKLOG wave marker).
// REPORT-ONLY: staleness lands in the detail (stale: true, triggers: [...])
// and the stage stays green — the D-368→D-402 adopt-observe-enforce pattern;
// the flip to failing is a future record's call after one green wave of
// reports. Mechanical breakage (unreadable digest, malformed marker) FAILS
// — this is a gate stage, not a suggestion.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parseIndexRows } from "./decisions.ts";
import { STAGE_DOCS } from "./explain.ts";

export const RATIFICATIONS_TRIGGER = 30;

/** The digest's marker: null when absent (the pre-D-415 era — REPORTED as
 *  stale, not failed: the digest simply predates the marker). */
export interface InvariantsMarker { pass: number; asOf: number; stages: string[] }
export function parseInvariantsMarker(text: string): InvariantsMarker | null {
  const m = /<!--\s*invariants:[^>]*-->/.exec(text);
  if (!m) return null;
  const body = m[0];
  const pass = Number(/pass (\d+)/.exec(body)?.[1] ?? NaN);
  const asOf = Number(/as-of D-(\d+)/.exec(body)?.[1] ?? NaN);
  const stages = (/stages:\s+((?:[a-z][a-z-]*)(?:\s+[a-z][a-z-]*)*)/.exec(body)?.[1] ?? "").trim().split(/\s+/).filter(Boolean);
  if (!Number.isFinite(pass) || !Number.isFinite(asOf) || stages.length === 0) {
    throw new Error(`malformed invariants marker: ${body.slice(0, 120)} — want "pass N", "as-of D-NNN", and a non-empty "stages:" list`);
  }
  return { pass, asOf, stages };
}

/** Pure staleness computation over the three trigger inputs. T3 (wave
 *  closure) is deferred — see the module header. */
export function computeFreshness(a: {
  marker: InvariantsMarker | null;
  ratifiedSince: number;
  gateStages: string[];
}): { stale: boolean; triggers: string[] } {
  const triggers: string[] = [];
  if (!a.marker) {
    return { stale: true, triggers: ["no-marker: the digest predates D-415's marker format — regenerate the digest (a report, not a failure: the old page is law-history, not law-now)"] };
  }
  if (a.ratifiedSince >= RATIFICATIONS_TRIGGER) {
    triggers.push(`${RATIFICATIONS_TRIGGER}-ratifications: ${a.ratifiedSince} ratified rows past as-of D-${a.marker.asOf} — regenerate the digest`);
  }
  const missing = a.gateStages.filter((s) => !a.marker!.stages.includes(s));
  const gone = a.marker.stages.filter((s) => !a.gateStages.includes(s));
  if (missing.length > 0) {
    triggers.push(`stage-drift: the gate runs stages the digest does not document (${missing.join(", ")}) — fold them in and regenerate`);
  }
  if (gone.length > 0) {
    triggers.push(`stage-drift: the digest documents stages the gate no longer runs (${gone.join(", ")}) — regenerate`);
  }
  return { stale: triggers.length > 0, triggers };
}

export interface FreshnessResult {
  ok: boolean; // MECHANICAL only — false = unreadable/malformed, never staleness
  detail: Record<string, unknown>; // carries stale + triggers (the report)
  issues: string[];
}

/** The gate-stage entry point: read the digest + the index + the registry,
 *  compute, REPORT. Fail-closed on mechanics only. */
export function checkInvariantsFreshness(root: string): FreshnessResult {
  const digestPath = join(root, "docs/decisions/CURRENT-INVARIANTS.md");
  let text: string;
  try {
    text = readFileSync(digestPath, "utf-8");
  } catch (e) {
    return { ok: false, detail: {}, issues: [`CURRENT-INVARIANTS.md unreadable: ${String(e instanceof Error ? e.message : e).slice(0, 120)}`] };
  }
  let marker: InvariantsMarker | null;
  try {
    marker = parseInvariantsMarker(text);
  } catch (e) {
    return { ok: false, detail: {}, issues: [String(e instanceof Error ? e.message : e)] };
  }
  const rows = parseIndexRows(readFileSync(join(root, "docs/BUILD-DECISIONS.md"), "utf-8"));
  const asOf = marker?.asOf ?? 0;
  const ratifiedSince = rows.filter((r) => r.status === "RATIFIED" && r.n > asOf).length;
  const gateStages = Object.keys(STAGE_DOCS);
  const f = computeFreshness({ marker, ratifiedSince, gateStages });
  return {
    ok: true,
    detail: {
      policy: "report-only (D-415, A3 — the flip to failing is a future record's call, after one green wave of reports)",
      pass: marker?.pass ?? null,
      asOf: marker ? `D-${marker.asOf}` : null,
      ratifiedSince,
      gateStages: gateStages.length,
      stale: f.stale,
      triggers: f.triggers,
    },
    issues: [],
  };
}
