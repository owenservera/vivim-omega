// discovery.perception — model.ts (Ω7)
// The pure ApplicationGraph model + DOM classifier. NO shim/port imports here
// (unit tests import this module in-process); src/index.ts is the only file
// that touches ports. The TS types below MIRROR the plugin's SCHEMA
// contributions (discovery.application-graph@1 & friends) — the manifest is
// the contract of record for Ω8/Ω9; this mirror exists because compartments
// never import each other's code (B2).
//
// Determinism law: nothing in this module reads the clock, random, or
// filesystem — the same capture bytes always produce the same graph.

// ---- capture fixture shapes (fixtures/<name>/page.json) ----------------------

export interface DomNode {
  tag: string;
  id?: string;
  role?: string;
  ariaLabel?: string;
  text?: string;
  placeholder?: string;
  classes?: string[];
  type?: string;
  children?: DomNode[];
}

export interface PageCapture {
  fixture: string;
  capturedAt: number;
  url?: string;
  viewport?: { width: number; height: number };
  root: DomNode;
}

// ---- the ApplicationGraph model (mirror of the SCHEMA contributions) ---------

export const NODE_KINDS = ["control", "field", "button", "list", "container", "menu", "menu-item"] as const;
export type NodeKind = (typeof NODE_KINDS)[number];

export interface EvidenceRef {
  /** G0 minimum (D-338/D-357 falsifier fix): the vault object coordinates —
   *  the triple inference's normalizeEvidence requires. Perception used to
   *  emit casRef-only refs, which inference's fail-closed filter dropped →
   *  perceive→infer produced zero evidenced candidates end-to-end (the seam
   *  was never exercised until the browser falsifier ran the full chain). */
  ns: string;
  id: string;
  rev: number;
  /** '<ns>/<id>@<rev>' — DERIVED from the triple (kept for byte-span citation readers). */
  casRef: string;
  /** UTF-8 byte offsets [start, end) into the referenced capture bytes (whole-capture citations carry no span). */
  span?: { start: number; end: number };
}

export interface GraphNode {
  id: string;
  kind: NodeKind;
  label: string;
  selectorHint: string;
  evidence: EvidenceRef[];
}

export interface CausalEdge {
  id: string;
  from: string;
  to: string;
  trigger: "click" | "type" | "network";
  latencyMs: number;
  evidence: EvidenceRef[];
}

export interface ApplicationGraph {
  id: string;
  capturedAt: number;
  source: { fixtureName: string };
  nodes: GraphNode[];
  edges: CausalEdge[]; // perception yields [] — causal edges come from discovery.observe@1
}

// ---- classification -----------------------------------------------------------

/** Roles that make a node interactive (implicit ARIA semantics beyond button/list/field/menu).
 *  menuitem* roles are NOT here — they classify as menu-item explicitly below. */
const INTERACTIVE_ROLES = new Set([
  "link", "tab",
  "checkbox", "radio", "switch", "option", "combobox", "slider", "treeitem",
]);

/**
 * Classify one DOM node. Returns null for nodes that are NOT graph material:
 * leaf, non-interactive elements (plain text spans/headings) — they are label
 * material, not claims. Kind precedence: explicit role mapping → tag mapping →
 * interactive role → container (has children). Menu roles (D-311) classify
 * before the tag switch so a <div role="menu"> is a menu, not a container.
 */
export function classifyKind(n: DomNode): NodeKind | null {
  if (n.role === "button") return "button";
  if (n.role === "list") return "list";
  if (n.role === "textbox" || n.role === "searchbox") return "field";
  if (n.role === "menu") return "menu";
  if (n.role === "menuitem" || n.role === "menuitemcheckbox" || n.role === "menuitemradio") return "menu-item";
  switch (n.tag) {
    case "button": return "button";
    case "input": return "field";
    case "textarea": return "field";
    case "ul": return "list";
    case "ol": return "list";
    case "a": return "control";
    case "select": return "control";
    case "option": return "control";
    case "menu": return "menu";
  }
  if (n.role && INTERACTIVE_ROLES.has(n.role)) return "control";
  if (n.children && n.children.length > 0) return "container";
  return null;
}

function collapse(s: string): string {
  return s.replace(/\s+/g, " ").trim();
}

function cap60(s: string): string {
  return s.length > 60 ? `${s.slice(0, 57)}...` : s;
}

/** First non-empty text found by DFS in child order (depth-first, document order). */
function firstDescendantText(n: DomNode): string | null {
  for (const c of n.children ?? []) {
    const own = collapse(c.text ?? "");
    if (own) return own;
    const deeper = firstDescendantText(c);
    if (deeper) return deeper;
  }
  return null;
}

/**
 * Label precedence: aria-label → own text → placeholder → first descendant
 * text → id → tag(:role) fallback. Whitespace-collapsed, capped at 60 chars.
 */
export function labelFor(n: DomNode): string {
  const aria = collapse(n.ariaLabel ?? "");
  if (aria) return cap60(aria);
  const own = collapse(n.text ?? "");
  if (own) return cap60(own);
  const ph = collapse(n.placeholder ?? "");
  if (ph) return cap60(ph);
  const desc = firstDescendantText(n);
  if (desc) return cap60(desc);
  if (n.id) return n.id;
  return n.role ? `${n.tag}:${n.role}` : n.tag;
}

// ---- the walk -------------------------------------------------------------------

interface WalkFrame {
  node: DomNode;
  /** 1-based position among same-tag siblings (nth-of-type). */
  sameTagIndex: number;
}

/**
 * Walk the capture tree in document order and emit GraphNodes for every
 * classifiable node. Node ids are path ids ('n' + child indices from the
 * root, e.g. 'n0', 'n0.3.2'); selectorHint is '#id' when the DOM node has an
 * id, else a CSS path of 'tag:nth-of-type(k)' segments from the capture root.
 * Every node carries the given evidence refs (the capture citation).
 */
export function walkDom(root: DomNode, evidence: EvidenceRef[]): GraphNode[] {
  const out: GraphNode[] = [];

  const segmentFor = (f: WalkFrame): string =>
    f.node.id ? `#${f.node.id}` : `${f.node.tag}:nth-of-type(${f.sameTagIndex})`;

  const visit = (frame: WalkFrame, path: number[], chain: string[]): void => {
    const { node } = frame;
    const kind = classifyKind(node);
    if (kind) {
      out.push({
        id: `n${path.join(".")}`,
        kind,
        label: labelFor(node),
        selectorHint: node.id ? `#${node.id}` : [...chain, segmentFor(frame)].join(" > "),
        evidence: evidence.map((e) => ({ ...e, span: e.span ? { ...e.span } : undefined })),
      });
    }
    const children = node.children ?? [];
    // nth-of-type counters per tag within this parent
    const sameTagCount = new Map<string, number>();
    for (let i = 0; i < children.length; i++) {
      const child = children[i]!;
      const k = (sameTagCount.get(child.tag) ?? 0) + 1;
      sameTagCount.set(child.tag, k);
      visit({ node: child, sameTagIndex: k }, [...path, i], [...chain, segmentFor(frame)]);
    }
  };

  visit({ node: root, sameTagIndex: 1 }, [0], []);
  return out;
}

/** Build the ApplicationGraph object for a capture (pure — no vault, no clock). */
export function buildGraph(page: PageCapture, evidence: EvidenceRef[]): ApplicationGraph {
  const nodes = walkDom(page.root, evidence);
  return {
    id: `graph:${page.fixture}`,
    capturedAt: page.capturedAt,
    source: { fixtureName: page.fixture },
    nodes,
    edges: [],
  };
}

// ---- canonical JSON (equality/determinism helper) -------------------------------

/**
 * Canonical JSON for byte-level equality checks: object keys sorted, arrays in
 * order, JSON.stringify leaf encoding. (Duplicated per the B2 import law —
 * plugins never import each other's code; this is used only for local
 * comparisons, never as a hashing authority.)
 */
export function canonicalJson(value: unknown): string {
  return serialize(value);
}

function serialize(v: unknown): string {
  if (v === null || typeof v !== "object") return JSON.stringify(v) ?? "null";
  if (Array.isArray(v)) return `[${v.map(serialize).join(",")}]`;
  const entries = Object.entries(v as Record<string, unknown>)
    .filter(([, val]) => val !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  return `{${entries.map(([k, val]) => `${JSON.stringify(k)}:${serialize(val)}`).join(",")}}`;
}
