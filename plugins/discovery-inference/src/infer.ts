// discovery.inference — infer.ts (Ω8), the PURE inference core.
//
// From an ApplicationGraph, infer candidate SurfaceContracts:
//   • kind "button" + label matching an action word (send, compose, reply,
//     delete, search, move, archive, open, read, view, trash) → CLICK contract
//     with a label-derived op ("message.send") and a risk hint
//     (EXTERNAL_MUTATION for send/delete/reply-like, MUTATION for move-ish,
//     READ for read-ish). Unknown labels → generic click, fail-closed
//     EXTERNAL_MUTATION (an unknown button can do anything — same philosophy
//     as the law's defaultRisk).
//   • kind "field" + label in (search, subject, to, body, from, cc, bcc) →
//     TYPING contract (op "message.field.<label>"; the search field is
//     READ-ish query prep, compose fields MUTATE a draft).
//   • kind "list" → READ contract (op "message.list" — the mailbox surface).
//
// CONFIDENCE is a recorded label-match heuristic (exact domain word 0.9,
// partial 0.6, generic 0.4). It is NEVER a promotion input: promotion belongs
// to discovery.verify@1 and its postcondition probes (promotion = proof).
//
// EVIDENCE IS MANDATORY: a node without evidence refs yields NO candidate —
// an unevidenced surface is a hallucination, and this engine refuses to emit
// one. Causal edges are carried as recorded context (graphSummary), not
// decision inputs in v1.
//
// Pure module: no ports, no fs, no worker assumptions — unit-testable in-process.

import type { ApplicationGraph, RiskHint, SurfaceContract } from "./model.ts";

// ---- label → (op, riskHint) tables, ordered by decision priority ----

interface ActionWord { word: string; op: string; risk: RiskHint }

/** Button action words (priority order: send/delete-class first so a label like "Send to archive" never binds to move). D-222 evolution: receive/refresh/sync join the vocabulary for the email pack's sixth contract. */
const BUTTON_ACTION_WORDS: ActionWord[] = [
  { word: "send", op: "message.send", risk: "EXTERNAL_MUTATION" },
  { word: "delete", op: "message.delete", risk: "EXTERNAL_MUTATION" },
  { word: "trash", op: "message.delete", risk: "EXTERNAL_MUTATION" },
  { word: "reply", op: "message.reply", risk: "EXTERNAL_MUTATION" },
  { word: "compose", op: "message.compose", risk: "MUTATION" },
  { word: "search", op: "message.search", risk: "READ" },
  { word: "move", op: "message.move", risk: "MUTATION" },
  { word: "archive", op: "message.move", risk: "MUTATION" },
  { word: "open", op: "message.read", risk: "READ" },
  { word: "read", op: "message.read", risk: "READ" },
  { word: "view", op: "message.read", risk: "READ" },
  { word: "receive", op: "message.receive", risk: "READ" },
  { word: "refresh", op: "message.receive", risk: "READ" },
  { word: "sync", op: "message.receive", risk: "READ" },
];

/** Field labels → typing contracts. The search field prepares a READ query; compose fields mutate a draft. */
const FIELD_WORDS: Array<{ word: string; op: string; risk: RiskHint }> = [
  { word: "search", op: "message.field.search", risk: "READ" },
  { word: "subject", op: "message.field.subject", risk: "MUTATION" },
  { word: "to", op: "message.field.to", risk: "MUTATION" },
  { word: "body", op: "message.field.body", risk: "MUTATION" },
  { word: "from", op: "message.field.from", risk: "MUTATION" },
  { word: "cc", op: "message.field.cc", risk: "MUTATION" },
  { word: "bcc", op: "message.field.bcc", risk: "MUTATION" },
];

/** List labels: exact word "list" 0.9, known mailbox nouns 0.6, anything else generic 0.4. */
const LIST_STRONG = "list";
const LIST_PARTIAL = ["inbox", "messages", "threads", "mail"];

/** Confidence tiers (recorded heuristic only). */
export const CONFIDENCE_EXACT = 0.9;
export const CONFIDENCE_PARTIAL = 0.6;
export const CONFIDENCE_GENERIC = 0.4;

// ---- label helpers ----

function normalizeLabel(label: string): string {
  return label.trim().toLowerCase();
}

/** Tokenize a label into lowercase words ("Move to archive" → ["move","to","archive"]). */
function words(label: string): string[] {
  return normalizeLabel(label).split(/[^a-z0-9@.]+/).filter(Boolean);
}

/** Slug a label into an op fragment ("Forward this Now!" → "forward.this.now"). */
function slug(label: string): string {
  const s = normalizeLabel(label)
    .replace(/[^a-z0-9.@]+/g, ".")
    .replace(/\.+/g, ".")
    .replace(/^\.|\.$/g, "");
  return s;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

interface WordMatch { op: string; risk: RiskHint; confidence: number; word: string | null }

/**
 * Match a button label against the action-word table.
 * Exact token match wins (0.9); substring match is partial (0.6); a label that
 * already IS an op ("message.send") binds directly (0.9); otherwise generic
 * (0.4, fail-closed EXTERNAL_MUTATION).
 */
function matchButton(label: string): WordMatch | null {
  const tokens = words(label);
  const s = normalizeLabel(label);
  // A label that already IS a single dotted op token ("message.send") is an exact domain match.
  if (tokens.length === 1 && tokens[0].includes(".")) {
    return { op: tokens[0], risk: riskForDirectOp(tokens[0]), confidence: CONFIDENCE_EXACT, word: null };
  }
  for (const a of BUTTON_ACTION_WORDS) {
    if (tokens.includes(a.word)) return { op: a.op, risk: a.risk, confidence: CONFIDENCE_EXACT, word: a.word };
  }
  for (const a of BUTTON_ACTION_WORDS) {
    if (s.includes(a.word)) return { op: a.op, risk: a.risk, confidence: CONFIDENCE_PARTIAL, word: a.word };
  }
  return null;
}

/** Risk for an already-dotted label: send/delete/reply-ish → EXTERNAL_MUTATION, else MUTATION (fail-closed-ish default for unknown dots). */
function riskForDirectOp(op: string): RiskHint {
  const tail = op.split(".").pop() ?? "";
  if (["send", "delete", "trash", "reply", "forward"].includes(tail)) return "EXTERNAL_MUTATION";
  if (["search", "read", "view", "open", "list"].includes(tail)) return "READ";
  return "MUTATION";
}

/** Match a field label → typing contract; search is READ-ish, compose fields mutate. */
function matchField(label: string): WordMatch | null {
  const tokens = words(label);
  const s = normalizeLabel(label);
  for (const f of FIELD_WORDS) {
    if (tokens.includes(f.word)) return { op: f.op, risk: f.risk, confidence: CONFIDENCE_EXACT, word: f.word };
  }
  for (const f of FIELD_WORDS) {
    if (s.includes(f.word)) return { op: f.op, risk: f.risk, confidence: CONFIDENCE_PARTIAL, word: f.word };
  }
  return null;
}

/** List labels → the read surface (message.list); confidence by word strength. */
function matchList(label: string): WordMatch {
  const tokens = words(label);
  const s = normalizeLabel(label);
  if (tokens.includes(LIST_STRONG)) return { op: "message.list", risk: "READ", confidence: CONFIDENCE_EXACT, word: LIST_STRONG };
  for (const w of LIST_PARTIAL) {
    if (tokens.includes(w) || s.includes(w)) return { op: "message.list", risk: "READ", confidence: CONFIDENCE_PARTIAL, word: w };
  }
  return { op: "message.list", risk: "READ", confidence: CONFIDENCE_GENERIC, word: null };
}

// ---- the core ----

/**
 * Infer candidates from a normalized graph. Deterministic: output order follows
 * node order; ids are "sc-<n>" in that order. A node without valid evidence
 * yields NO candidate (evidence is mandatory — the hallucination guard).
 */
export function inferCandidates(graph: ApplicationGraph): SurfaceContract[] {
  const out: SurfaceContract[] = [];
  let seq = 0;
  for (const node of graph.nodes) {
    const evidence = node.evidence;
    if (evidence.length === 0) continue; // NO evidence → NO candidate (mandatory)
    let match: WordMatch | null = null;
    let actionType: "click" | "type" | "read" = "click";
    if (node.kind === "button") {
      match = matchButton(node.label);
      actionType = "click";
    } else if (node.kind === "field" || node.kind === "input" || node.kind === "textarea") {
      match = matchField(node.label);
      actionType = "type";
    } else if (node.kind === "list") {
      match = matchList(node.label);
      actionType = "read";
    } else {
      continue; // unknown kinds carry no inference signal in v1
    }
    if (!match) {
      // Generic tier: the label had no domain word. Buttons → fail-closed
      // EXTERNAL_MUTATION (unknown surface, strictest hint, same philosophy as
      // the law's defaultRisk); fields → MUTATION (typing changes UI state).
      const genericSlug = slug(node.label);
      if (genericSlug.length === 0) continue;
      const fieldish = actionType === "type";
      match = {
        op: fieldish ? `message.field.${genericSlug}` : `message.${genericSlug}`,
        risk: fieldish ? "MUTATION" : "EXTERNAL_MUTATION",
        confidence: CONFIDENCE_GENERIC,
        word: null,
      };
    }
    if (!match.op || !match.op.includes(".")) continue; // ops must be namespaced (slug failed)
    seq++;
    out.push({
      id: `sc-${seq}`,
      nodeId: node.id,
      op: match.op,
      selector: node.selectorHint,
      actionType,
      riskHint: match.risk,
      evidence: evidence.map((e) => ({ ...e })),
      status: "DRAFT",
      confidence: round2(match.confidence),
    });
  }
  return out;
}
