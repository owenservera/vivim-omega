// discovery.inference — test/utils.ts (Ω8 GATE-Ω8 helpers)
//
// THE PIPELINE'S OWN FIXTURE MIND — nothing here imports Ω7's code (their dirs
// are off-limits); we consume their DOCUMENTED data shapes only:
//   • page.json  — serialized DOM snapshot {fixture, url, root: {tag, id, role,
//     text, ariaLabel, placeholder, classes, children}} (elements carry labels
//     via ariaLabel/text/placeholder/classes — all tolerated)
//   • events.jsonl — {type, targetSelector, ts, detail} lines
// When fixtures/webmail-inbox/ exists (Ω7 landed), fixtureWebmailGraph walks
// the page tree into an ApplicationGraph; webmailGraphFixture emits the
// equivalent inline webmail-like graph (the deterministic full-pipeline
// surface). Either way the engines see the same node/evidence model.
//
// The probe simulator: the CALLER (this harness) simulates executing each
// mapped op against a small webmail state and checks the postcondition —
// e.g. "click send → a new message node appears in the outbox region".
// Probes are caller-supplied by design: the engine verifies, never fabricates.

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

export interface EvidenceRef { ns: string; id: string; rev: number }
export interface GraphNode { id: string; kind: string; label: string; selectorHint: string; evidence: EvidenceRef[] }
export interface CausalEdge { from: string; to: string; trigger: string; latencyMs: number; evidence: EvidenceRef[] }
export interface ApplicationGraph { nodes: GraphNode[]; edges: CausalEdge[]; source?: string }

const OMEGA_ROOT = join(import.meta.dir, "../../..");
export const WEBMAIL_FIXTURE_DIR = join(OMEGA_ROOT, "fixtures/webmail-inbox");

// ---- the webmail surface model -----------------------------------------------

/** The perception-evidenced webmail surface (inline fixture — the Ω7-shape equivalent, deterministic). */
export function webmailGraphFixture(evidenceFor: (nodeId: string) => EvidenceRef): ApplicationGraph {
  const node = (id: string, kind: string, label: string, selectorHint: string): GraphNode =>
    ({ id, kind, label, selectorHint, evidence: [evidenceFor(id)] });
  return {
    source: "inline:webmail",
    nodes: [
      node("btn-send", "button", "Send", "form.compose button[type=submit]"),
      node("btn-compose", "button", "Compose", "button.compose"),
      node("btn-reply", "button", "Reply", "button.reply"),
      node("btn-delete", "button", "Delete", "button.delete"),
      node("btn-search", "button", "Search", "button.search"),
      node("btn-archive", "button", "Move to archive", "button.archive"),
      node("btn-open", "button", "Open", "button.open"),
      node("btn-receive", "button", "Receive", "button.receive"),
      node("field-search", "field", "Search", "input.search"),
      node("field-subject", "field", "Subject", "input.subject"),
      node("field-to", "field", "To", "input.to"),
      node("field-body", "field", "Body", "textarea.body"),
      node("list-inbox", "list", "Message list", "ul.message-list"),
    ],
    edges: [
      { from: "field-search", to: "btn-search", trigger: "type", latencyMs: 120, evidence: [evidenceFor("field-search")] },
      { from: "btn-search", to: "list-inbox", trigger: "click", latencyMs: 90, evidence: [evidenceFor("btn-search")] },
      { from: "btn-send", to: "list-inbox", trigger: "click", latencyMs: 250, evidence: [evidenceFor("btn-send")] },
      { from: "btn-open", to: "btn-reply", trigger: "click", latencyMs: 60, evidence: [evidenceFor("btn-open")] },
      { from: "btn-receive", to: "list-inbox", trigger: "click", latencyMs: 140, evidence: [evidenceFor("btn-receive")] },
    ],
  };
}

/** An element's best label: ariaLabel || text || placeholder || classes (the fixture's label carriers). */
function labelOf(el: Record<string, unknown>): string {
  for (const key of ["ariaLabel", "aria-label", "text", "placeholder"]) {
    const v = el[key];
    if (typeof v === "string" && v.trim().length > 0) return v.trim();
  }
  if (Array.isArray(el.classes)) {
    const cls = (el.classes as unknown[]).filter((c) => typeof c === "string").join(" ").trim();
    if (cls.length > 0) return cls;
  }
  return "";
}

function selectorOf(el: Record<string, unknown>, tag: string): string {
  const id = el.id;
  if (typeof id === "string" && id.length > 0) return `#${id}`;
  for (const key of ["ariaLabel", "aria-label"]) {
    const v = el[key];
    if (typeof v === "string" && v.length > 0) return `[aria-label="${v}"]`;
  }
  return tag;
}

/**
 * Walk a Ω7 page.json DOM snapshot into an ApplicationGraph. Tolerant to the
 * shape drift observed in the committed fixture: the tree lives under `root`
 * (falling back to the object itself), and labels arrive via ariaLabel / text /
 * placeholder / classes. Buttons → "button", inputs/textareas → "field",
 * lists (ul/ol/table or role list/listbox/grid/table) → "list"; other elements
 * carry no inference signal in v1.
 */
export function buildGraphFromFixture(
  page: unknown,
  evidenceFor: (nodeId: string) => EvidenceRef,
  source = "fixture:webmail-inbox",
): ApplicationGraph {
  const nodes: GraphNode[] = [];
  const walk = (el: unknown, depth: number): void => {
    if (el === null || typeof el !== "object" || depth > 24) return;
    const o = el as Record<string, unknown>;
    const tag = typeof o.tag === "string" ? (o.tag as string).toLowerCase() : "";
    const role = typeof o.role === "string" ? (o.role as string).toLowerCase() : "";
    const rawId = typeof o.id === "string" && (o.id as string).length > 0 ? (o.id as string) : null;
    const id = rawId ?? `el-${nodes.length}`;
    const label = labelOf(o);
    let kind: string | null = null;
    if (role === "button" || tag === "button") kind = "button";
    else if (["textbox", "searchbox"].includes(role) || ["input", "textarea"].includes(tag)) kind = "field";
    else if (["list", "listbox", "grid", "table"].includes(role) || ["ul", "ol", "table"].includes(tag)) kind = "list";
    if (kind && label.length > 0) {
      nodes.push({ id, kind, label, selectorHint: selectorOf(o, tag), evidence: [evidenceFor(id)] });
    }
    if (Array.isArray(o.children)) for (const child of o.children) walk(child, depth + 1);
  };
  const o = (page !== null && typeof page === "object" ? page : {}) as Record<string, unknown>;
  walk(o.root ?? o, 0);

  // Edges from the event trace: consecutive events whose #id selectors resolve
  // to graph nodes become causal edges (recorded context, capped at 8).
  const edges: CausalEdge[] = [];
  const eventsPath = join(WEBMAIL_FIXTURE_DIR, "events.jsonl");
  if (existsSync(eventsPath)) {
    const lines = readFileSync(eventsPath, "utf-8").split("\n").filter(Boolean).map((l) => {
      try { return JSON.parse(l) as { targetSelector?: string; type?: string }; } catch { return null; }
    }).filter(Boolean) as Array<{ targetSelector?: string; type?: string }>;
    const byId = (sel: string | undefined): GraphNode | null => {
      if (!sel || !sel.startsWith("#")) return null;
      return nodes.find((n) => n.id === sel.slice(1)) ?? null;
    };
    for (let i = 0; i + 1 < lines.length && edges.length < 8; i++) {
      const from = byId(lines[i].targetSelector);
      const to = byId(lines[i + 1].targetSelector);
      if (from && to && from.id !== to.id) {
        edges.push({ from: from.id, to: to.id, trigger: lines[i].type ?? "event", latencyMs: 100, evidence: [evidenceFor(from.id)] });
      }
    }
  }
  return { nodes, edges, source };
}

/** The Ω7 fixture graph when their committed data exists, else null (never block on their dirs). */
export function fixtureWebmailGraph(evidenceFor: (nodeId: string) => EvidenceRef): ApplicationGraph | null {
  const pagePath = join(WEBMAIL_FIXTURE_DIR, "page.json");
  if (!existsSync(pagePath)) return null;
  try {
    const page = JSON.parse(readFileSync(pagePath, "utf-8"));
    return buildGraphFromFixture(page, evidenceFor);
  } catch {
    return null; // a malformed/mid-flight fixture falls back to the inline graph
  }
}

// ---- the webmail state + probe simulator -------------------------------------

export interface FixtureMsg { id: string; to: string; subject: string; folder: string }
export interface WebmailState { outbox: FixtureMsg[]; inbox: FixtureMsg[]; archive: FixtureMsg[]; seen: string[]; query: string; results: string[] }

export function initialWebmailState(): WebmailState {
  return {
    outbox: [],
    inbox: [
      { id: "m1", to: "me@omega.local", subject: "the merkle chain is intact", folder: "inbox" },
      { id: "m2", to: "me@omega.local", subject: "second missive", folder: "inbox" },
    ],
    archive: [],
    seen: [],
    query: "",
    results: [],
  };
}

/**
 * Simulate executing the mapped op against the fixture state and check the
 * postcondition. Deterministic; returns the (pre, post, passed) triple the
 * probe records. Unknown ops fail closed: no change, not passed.
 */
export function applyAction(
  state: WebmailState,
  op: string,
  args: Record<string, string> = {},
): { pre: WebmailState; post: WebmailState; passed: boolean; reason: string } {
  const pre: WebmailState = JSON.parse(JSON.stringify(state));
  let post: WebmailState = JSON.parse(JSON.stringify(state));
  let passed = false;
  let reason = "";
  if (op === "message.send") {
    const to = args.to ?? "river@omega.local";
    const subject = args.subject ?? "hello from the gate";
    post = { ...post, outbox: [...post.outbox, { id: `out-${post.outbox.length + 1}`, to, subject, folder: "outbox" }] };
    passed = post.outbox.length === pre.outbox.length + 1 && post.outbox[post.outbox.length - 1].to === to;
    reason = "click send → a new message node appears in the outbox region";
  } else if (op === "message.list") {
    post = { ...post, results: post.inbox.map((m) => m.id) };
    passed = post.results.length === pre.inbox.length;
    reason = "list → every inbox message id is listed";
  } else if (op === "message.search") {
    const q = args.q ?? "merkle";
    const hits = pre.inbox.filter((m) => m.subject.includes(q)).map((m) => m.id);
    post = { ...post, query: q, results: hits };
    passed = post.results.length === hits.length && post.results.every((id) => pre.inbox.find((m) => m.id === id)!.subject.includes(q));
    reason = `search {q: ${q}} → exactly the subject-matching messages are returned`;
  } else if (op === "message.read") {
    const id = args.id ?? pre.inbox[0]!.id;
    post = { ...post, seen: [...post.seen, id] };
    passed = post.seen.includes(id);
    reason = `read {id: ${id}} → the message is marked seen`;
  } else if (op === "message.receive") {
    const from = args.from ?? "peter.miller@omega.local";
    const subject = args.subject ?? "a freshly received missive";
    post = { ...post, inbox: [...post.inbox, { id: `in-${post.inbox.length + 1}`, to: "me@omega.local", subject, folder: "inbox" }], };
    void from;
    passed = post.inbox.length === pre.inbox.length + 1;
    reason = "click receive/refresh → a new message appears in the inbox";
  } else if (op === "message.move") {
    const id = args.id ?? pre.inbox[1]!.id;
    post = { ...post, inbox: post.inbox.filter((m) => m.id !== id), archive: [...post.archive, { ...pre.inbox.find((m) => m.id === id)!, folder: "archive" }] };
    passed = post.archive.some((m) => m.id === id) && !post.inbox.some((m) => m.id === id);
    reason = `move {id: ${id}} → the message leaves the inbox and appears in the archive`;
  } else {
    passed = false;
    reason = `unknown op ${op} — no postcondition to check (fail closed)`;
  }
  return { pre, post, passed, reason };
}

/**
 * Build the probe battery for a mapping's bindings: 3 probes per binding
 * (the policy's requiredProbes), each simulating the mapped op against a
 * fresh fixture state and citing the replay capture span as evidence.
 * `failAt` marks (candidateId, probeIndex) pairs whose postcondition the
 * harness treats as BROKEN (the op silently did nothing).
 */
export function buildProbes(
  bindings: Array<{ blueprintOp: string; candidateId: string }>,
  replayEvidenceFor: (candidateId: string) => EvidenceRef,
  failAt: Array<{ candidateId: string; probeIndex: number }> = [],
): Array<{ candidateId: string; preState: WebmailState; postState: WebmailState; passed: boolean; evidence: EvidenceRef[]; note: string }> {
  const probes: Array<{ candidateId: string; preState: WebmailState; postState: WebmailState; passed: boolean; evidence: EvidenceRef[]; note: string }> = [];
  for (const b of bindings) {
    const op = b.blueprintOp.split("@")[0]!;
    for (let i = 0; i < 3; i++) {
      const state = initialWebmailState();
      const args = i === 0 ? {} : i === 1 ? { q: "missive", to: `river${i}@omega.local`, subject: `gate probe ${i}` } : { q: "merkle", to: `delta${i}@omega.local` };
      const sim = applyAction(state, op, args);
      const broken = failAt.some((f) => f.candidateId === b.candidateId && f.probeIndex === i);
      probes.push({
        candidateId: b.candidateId,
        preState: sim.pre,
        postState: broken ? sim.pre : sim.post, // a broken op leaves the world unchanged
        passed: broken ? false : sim.passed,
        evidence: [replayEvidenceFor(b.candidateId)],
        note: broken ? `BROKEN replay ${i + 1}/3 — ${sim.reason} — the world did NOT change (silent drop)` : `replay ${i + 1}/3 — ${sim.reason}`,
      });
    }
  }
  return probes;
}
