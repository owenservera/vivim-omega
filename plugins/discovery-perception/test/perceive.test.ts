// discovery.perception — test/perceive.test.ts (Ω7, GATE-Ω7 evidence, part 1)
//
// Unit: the DOM classifier + graph builder (src/model.ts — pure, no ports).
// Integration: boot the SHIPPED compositions/discovery.json through the real
// µhost (compile ceremony + worker compartments + capability tokens) →
// perceive the webmail fixture → nodeCount > 15 with EVERY node citing
// capture bytes that resolve via vault.get@1 → graph persisted in the vault
// with a provenance refs edge → DETERMINISM: a second boot in a fresh vault
// produces a byte-identical graph (sha256 over canonical JSON, node:crypto)
// and an identical capture cid (content addressing).
import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { mkdirSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { createHash } from "node:crypto";
import { bootComposition, compileComposition, ensureVault } from "@vivim/omega-host";
import type { BootedHost } from "@vivim/omega-host";
import type { PortResult } from "@vivim/omega-contracts";
import { buildGraph, canonicalJson, classifyKind, labelFor, walkDom, type ApplicationGraph, type DomNode, type GraphNode } from "../src/model.ts";
import { omegaTmp } from "@vivim/omega-platform"; // D-372 Phase 3: scratch through the seam

// ---- unit: classification --------------------------------------------------------

describe("Ω7 perception unit — DOM classification (src/model.ts)", () => {
  test("classifyKind: button-ish by tag and by role", () => {
    expect(classifyKind({ tag: "button" })).toBe("button");
    expect(classifyKind({ tag: "div", role: "button" })).toBe("button");
  });

  test("classifyKind: fields are input/textarea (and role textbox/searchbox)", () => {
    expect(classifyKind({ tag: "input", type: "search" })).toBe("field");
    expect(classifyKind({ tag: "textarea" })).toBe("field");
    expect(classifyKind({ tag: "div", role: "textbox" })).toBe("field");
    expect(classifyKind({ tag: "div", role: "searchbox" })).toBe("field");
  });

  test("classifyKind: lists are ul/ol/[role=list]", () => {
    expect(classifyKind({ tag: "ul" })).toBe("list");
    expect(classifyKind({ tag: "ol" })).toBe("list");
    expect(classifyKind({ tag: "div", role: "list" })).toBe("list");
  });

  test("classifyKind: controls are a/select/option and interactive roles (link, tab, checkbox...)", () => {
    expect(classifyKind({ tag: "a" })).toBe("control");
    expect(classifyKind({ tag: "select" })).toBe("control");
    expect(classifyKind({ tag: "option" })).toBe("control");
    expect(classifyKind({ tag: "div", role: "tab" })).toBe("control");
    expect(classifyKind({ tag: "div", role: "checkbox" })).toBe("control");
  });

  test("classifyKind: everything else with children is a container; non-interactive leaves are null (label material)", () => {
    expect(classifyKind({ tag: "div", children: [{ tag: "span" }] })).toBe("container");
    expect(classifyKind({ tag: "span", text: "just text" })).toBe(null);
    expect(classifyKind({ tag: "h1", text: "Title" })).toBe(null);
    expect(classifyKind({ tag: "nav", role: "navigation" })).toBe(null); // no children → not even a container
  });

  test("classifyKind (D-311): menu roles and the menu tag classify as menu/menu-item, before container fallback", () => {
    expect(classifyKind({ tag: "div", role: "menu" })).toBe("menu");
    expect(classifyKind({ tag: "menu" })).toBe("menu");
    expect(classifyKind({ tag: "div", role: "menuitem" })).toBe("menu-item");
    expect(classifyKind({ tag: "div", role: "menuitemcheckbox" })).toBe("menu-item");
    expect(classifyKind({ tag: "div", role: "menuitemradio" })).toBe("menu-item");
    // role mapping precedes the container fallback: a menu WITH children is still a menu
    expect(classifyKind({ tag: "div", role: "menu", children: [{ tag: "div", role: "menuitem", text: "x" }] })).toBe("menu");
    // menubar itself is not a menu kind — it is a plain container of menus
    expect(classifyKind({ tag: "div", role: "menubar", children: [{ tag: "div" }] })).toBe("container");
  });

  test("label precedence: aria-label → own text → placeholder → first descendant text → id → tag(:role)", () => {
    expect(labelFor({ tag: "button", text: "x", ariaLabel: "Do it" })).toBe("Do it");
    expect(labelFor({ tag: "input", text: "typed", placeholder: "Ph" })).toBe("typed");
    expect(labelFor({ tag: "input", placeholder: "Search mail..." })).toBe("Search mail...");
    expect(labelFor({ tag: "li", children: [{ tag: "span", text: "Alice Chen" }] })).toBe("Alice Chen");
    expect(labelFor({ tag: "div", id: "app" })).toBe("app");
    expect(labelFor({ tag: "nav", role: "navigation" })).toBe("nav:navigation");
  });

  test("labels collapse whitespace and cap at 60 chars", () => {
    expect(labelFor({ tag: "span", text: "  lots   of\n\tspaces  " })).toBe("lots of spaces");
    const long = "a".repeat(100);
    const out = labelFor({ tag: "span", text: long });
    expect(out.length).toBe(60);
    expect(out.endsWith("...")).toBe(true);
    expect(out.startsWith("a".repeat(57))).toBe(true);
  });

  test("walkDom: inline tree → path ids, kinds, labels, evidence on every node; leaves skipped", () => {
    const tree: DomNode = {
      tag: "div", id: "root", children: [
        { tag: "h1", text: "Title" },
        { tag: "input", id: "q", placeholder: "Search..." },
        { tag: "button", id: "go", text: "Go" },
        {
          tag: "div", classes: ["panel"], children: [
            { tag: "span", text: "hello" },
            { tag: "a", text: "link text" },
          ],
        },
      ],
    };
    const nodes = walkDom(tree, [{ casRef: "x/y@1" }]);
    expect(nodes.map((n) => n.id)).toEqual(["n0", "n0.1", "n0.2", "n0.3", "n0.3.1"]);
    expect(nodes.map((n) => n.kind)).toEqual(["container", "field", "button", "container", "control"]);
    expect(nodes.map((n) => n.label)).toEqual(["Title", "Search...", "Go", "hello", "link text"]);
    // selectorHint: '#id' when id'd; CSS path of tag:nth-of-type(k) segments otherwise
    expect(nodes[0]!.selectorHint).toBe("#root");
    expect(nodes[3]!.selectorHint).toBe("#root > div:nth-of-type(1)");
    expect(nodes[4]!.selectorHint).toBe("#root > div:nth-of-type(1) > a:nth-of-type(1)");
    // evidence is constitutional: every node cites the capture, refs are per-node copies
    for (const n of nodes) {
      expect(n.evidence.length).toBeGreaterThanOrEqual(1);
      expect(n.evidence[0]!.casRef).toBe("x/y@1");
    }
    nodes[0]!.evidence[0]!.casRef = "mutated";
    expect(nodes[1]!.evidence[0]!.casRef).toBe("x/y@1");
  });

  test("walkDom is deterministic (same tree → deep-equal output)", () => {
    const tree: DomNode = { tag: "div", id: "a", children: [{ tag: "button", id: "b", text: "B" }, { tag: "ul", children: [{ tag: "li", children: [{ tag: "span", text: "s" }] }] }] };
    expect(walkDom(tree, [{ casRef: "c/d@1" }])).toEqual(walkDom(tree, [{ casRef: "c/d@1" }]));
  });

  test("buildGraph: id/capturedAt/source from the capture, edges empty (edges come from observation)", () => {
    const page = { fixture: "t", capturedAt: 1735689600000, root: { tag: "button", id: "b", text: "B" } };
    const g: ApplicationGraph = buildGraph(page, [{ casRef: "c/d@1" }]);
    expect(g.id).toBe("graph:t");
    expect(g.capturedAt).toBe(1735689600000);
    expect(g.source).toEqual({ fixtureName: "t" });
    expect(g.edges).toEqual([]);
    expect(g.nodes.length).toBe(1);
  });

  test("canonicalJson: sorted keys, ordered arrays, undefined dropped", () => {
    expect(canonicalJson({ b: 1, a: 2 })).toBe('{"a":2,"b":1}');
    expect(canonicalJson({ x: [3, 1, { z: 1, y: 2 }], a: undefined })).toBe('{"x":[3,1,{"y":2,"z":1}]}');
    expect(canonicalJson("s")).toBe('"s"');
    expect(canonicalJson(null)).toBe("null");
  });
});

// ---- integration: the shipped discovery composition through the real µhost ----------

const OMEGA_ROOT = join(import.meta.dir, "../../.."); // test/ → discovery-perception/ → plugins/ → root
const SPEC = join(OMEGA_ROOT, "compositions/discovery.json");
const spec = JSON.parse(readFileSync(SPEC, "utf-8"));
const FIXTURES = join(OMEGA_ROOT, "fixtures");
// E-9: run-unique dir — fixed names collide across concurrent gates on one box.
const CASE_ROOT = omegaTmp("omega-discovery-perception", `run-${Date.now()}-${process.pid}`);
const VAULT_DIR = join(CASE_ROOT, "host");

const hosts: BootedHost[] = [];
afterAll(async () => { await Promise.all(hosts.map((h) => h.shutdown().catch(() => {}))); }, 20_000);

/** Shutdown + deregister (double-terminate of an exited worker parks 2.5s in the host fallback). */
async function shutdownCase(h: BootedHost): Promise<void> {
  const i = hosts.indexOf(h);
  if (i >= 0) hosts.splice(i, 1);
  await h.shutdown().catch(() => {});
}

interface PerceiveResult { graphId: { ns: string; id: string; rev: number; cid: string }; nodeCount: number; edgeCount: number }
interface VaultGet { rev: number; cid: string; data: unknown; meta: unknown; refs: Array<{ ns: string; id: string; rev: number }> }

async function root<T>(host: BootedHost, op: string, payload: unknown): Promise<T> {
  const r: PortResult = await host.router.callAsRoot(op, payload);
  expect(r.ok).toBe(true);
  if (!r.ok) throw new Error(`${op} failed: ${JSON.stringify(r)}`);
  return r.value as T;
}

const CAS_REF = /^([^/]+)\/([^/@]+)@(\d+)$/;

function parseCasRef(ref: string): { ns: string; id: string; rev: number } {
  const m = CAS_REF.exec(ref);
  if (!m) throw new Error(`bad casRef grammar: ${ref}`);
  return { ns: m[1]!, id: m[2]!, rev: Number(m[3]) };
}

function graphSha256(graph: unknown): string {
  return createHash("sha256").update(canonicalJson(graph)).digest("hex");
}

let host: BootedHost;

beforeAll(async () => {
  rmSync(CASE_ROOT, { recursive: true, force: true });
  mkdirSync(VAULT_DIR, { recursive: true });
  // House pattern (email/pilot integration): the shipped spec's ${TMP} dataDir
  // is SHARED across runs on one box (rev would accumulate, breaking the
  // "fresh vault rev 1" assertions) — boot a copy pointed inside this run's root.
  const caseSpec = JSON.parse(JSON.stringify(spec));
  caseSpec.entries.find((e: { id: string }) => e.id === "vivim.vault").config.dataDir = join(CASE_ROOT, "vault-data");
  const { rootKey } = ensureVault(VAULT_DIR);
  const { recipe, buildDir } = compileComposition(caseSpec, join(SPEC, ".."), VAULT_DIR, rootKey);
  host = await bootComposition(recipe, buildDir, VAULT_DIR);
  hosts.push(host);
});

describe("GATE-Ω7 perception — boot compositions/discovery.json (law + vault + both engines)", () => {
  test("law eager, perception+observation+vault dormant at boot (D-331); routes intact", () => {
    const st = host.router.status();
    const compartments = st.compartments as Record<string, { state: string }>;
    expect(compartments["vivim.law"]?.state).toBe("active");
    expect(st.dormant).toEqual(["discovery.observation", "discovery.perception", "vivim.vault"]);
    expect(st.routedOps).toEqual(expect.arrayContaining([
      "discovery.perceive@1", "discovery.observe@1",
      "vault.append@1", "vault.get@1", "vault.query@1", "vault.search@1", "vault.verify@1", "vault.compact@1", "vault.roundtrip@1",
      "law.check@1", "law.registry@1", "law.consent.grant@1", "law.tokens.revoke@1", "law.amendment@1",
    ]));
  });

  test("perceive webmail-inbox → nodeCount 27 (> 15), edgeCount 0, graphId rev 1 in a fresh vault", async () => {
    const r = await root<PerceiveResult>(host, "discovery.perceive@1", { fixture: { name: "webmail-inbox" } });
    expect(r.nodeCount).toBe(27);
    expect(r.nodeCount).toBeGreaterThan(15);
    expect(r.edgeCount).toBe(0);
    expect(r.graphId).toEqual({ ns: "discovery", id: "graph:webmail-inbox", rev: 1, cid: expect.stringMatching(/^[0-9a-f]{64}$/) });
  });

  test("perceive webmail-menu (D-311) → 10 nodes incl. menu/menu-item kinds, evidence resolves", async () => {
    const r = await root<PerceiveResult>(host, "discovery.perceive@1", { fixture: { name: "webmail-menu" } });
    expect(r.nodeCount).toBe(10);
    expect(r.edgeCount).toBe(0);
    expect(r.graphId).toEqual({ ns: "discovery", id: "graph:webmail-menu", rev: 1, cid: expect.stringMatching(/^[0-9a-f]{64}$/) });
    const pageJsonText = readFileSync(join(FIXTURES, "webmail-menu/page.json"), "utf-8");
    const graph = await root<VaultGet>(host, "vault.get@1", { ns: "discovery", id: "graph:webmail-menu" });
    const nodes = (graph.data as ApplicationGraph).nodes as GraphNode[];
    const kinds = new Set(nodes.map((n) => n.kind));
    expect(kinds).toEqual(new Set(["container", "menu", "menu-item", "button"]));
    const bySelector = new Map(nodes.map((n) => [n.selectorHint, n] as const));
    expect(bySelector.get("#menu-file")!.kind).toBe("menu");
    expect(bySelector.get("#menu-file")!.label).toBe("File");
    expect(bySelector.get("#mi-archive")!.kind).toBe("menu-item");
    expect(bySelector.get("#archive-btn")!.kind).toBe("button");
    // every node cites the capture bytes (same constitutional guarantee as webmail-inbox)
    for (const node of nodes) {
      expect(node.evidence.length).toBeGreaterThanOrEqual(1);
      for (const ref of node.evidence) {
        const { ns, id, rev } = parseCasRef(ref.casRef);
        const capture = await root<VaultGet>(host, "vault.get@1", { ns, id, rev });
        expect(capture.data).toBe(pageJsonText);
      }
    }
  });

  test("EVERY node cites capture bytes: each evidence ref resolves via vault.get@1 to the exact page.json bytes", async () => {
    const pageJsonText = readFileSync(join(FIXTURES, "webmail-inbox/page.json"), "utf-8");
    const graph = await root<VaultGet>(host, "vault.get@1", { ns: "discovery", id: "graph:webmail-inbox" });
    const nodes = (graph.data as ApplicationGraph).nodes as GraphNode[];
    expect(nodes.length).toBe(27);
    for (const node of nodes) {
      expect(node.evidence.length).toBeGreaterThanOrEqual(1);
      for (const ref of node.evidence) {
        const { ns, id, rev } = parseCasRef(ref.casRef);
        const capture = await root<VaultGet>(host, "vault.get@1", { ns, id, rev });
        expect(capture.data).toBe(pageJsonText); // the evidence IS the capture bytes
        expect((capture.meta as { type?: string }).type).toBe("capture");
      }
    }
  });

  test("the graph is persisted in the vault with a provenance refs edge to the capture", async () => {
    const graph = await root<VaultGet>(host, "vault.get@1", { ns: "discovery", id: "graph:webmail-inbox" });
    const data = graph.data as ApplicationGraph;
    expect(data.id).toBe("graph:webmail-inbox");
    expect(data.capturedAt).toBe(1735689600000); // from the capture fixture, never wall clock
    expect(data.source).toEqual({ fixtureName: "webmail-inbox" });
    expect(graph.refs).toEqual([{ ns: "discovery", id: "capture:webmail-inbox", rev: 1 }]);
    // spot-check kinds + labels through the whole classification matrix
    const bySelector = new Map(data.nodes.map((n) => [n.selectorHint, n] as const));
    expect(bySelector.get("#app")!.kind).toBe("container");
    expect(bySelector.get("#search-input")!.kind).toBe("field");
    expect(bySelector.get("#search-input")!.label).toBe("Search mail...");
    expect(bySelector.get("#compose-btn")!.kind).toBe("button");
    expect(bySelector.get("#compose-btn")!.label).toBe("Compose");
    expect(bySelector.get("#folder-inbox")!.kind).toBe("control");
    expect(bySelector.get("#msg-list")!.kind).toBe("list");
    expect(bySelector.get("#star-1")!.label).toBe("Star message 1");
    expect(bySelector.get("#msg-1")!.kind).toBe("container");
    expect(bySelector.get("#msg-1")!.label).toBe("Alice Chen");
  });

  test("DETERMINISM: two runs (two fresh vaults) → identical nodeCount + identical graph sha256 + identical capture cid", async () => {
    const runA = await root<VaultGet>(host, "vault.get@1", { ns: "discovery", id: "graph:webmail-inbox" });

    // second boot: spec copy of the shipped composition with a unique fresh dataDir
    const root2 = omegaTmp("omega-discovery-perception-det", `run-${Date.now()}-${Math.floor(Math.random() * 1e6)}`);
    rmSync(root2, { recursive: true, force: true });
    const vaultDir2 = join(root2, "host");
    mkdirSync(vaultDir2, { recursive: true });
    const spec2 = JSON.parse(JSON.stringify(spec)) as typeof spec;
    const vaultEntry = spec2.entries.find((e: { id: string }) => e.id === "vivim.vault");
    vaultEntry.config = { ...vaultEntry.config, dataDir: join(root2, "vault-data") };
    const { rootKey } = ensureVault(vaultDir2);
    const { recipe, buildDir } = compileComposition(spec2, join(SPEC, ".."), vaultDir2, rootKey);
    const host2 = await bootComposition(recipe, buildDir, vaultDir2);
    try {
      const perceived = await root<PerceiveResult>(host2, "discovery.perceive@1", { fixture: { name: "webmail-inbox" } });
      expect(perceived.nodeCount).toBe(27); // identical nodeCount
      const runB = await root<VaultGet>(host2, "vault.get@1", { ns: "discovery", id: "graph:webmail-inbox" });
      expect(graphSha256(runB.data)).toBe(graphSha256(runA.data)); // identical graph object hash (sha256, node:crypto)
      expect(runB.cid).toBe(runA.cid); // content addressing: same graph bytes → same CAS cid
      const captureB = await root<VaultGet>(host2, "vault.get@1", { ns: "discovery", id: "capture:webmail-inbox" });
      const captureA = await root<VaultGet>(host, "vault.get@1", { ns: "discovery", id: "capture:webmail-inbox" });
      expect(captureB.cid).toBe(captureA.cid);
    } finally {
      await shutdownCase(host2);
    }
  });

  test("perceive ai-chat → 20 nodes, every ref resolves (the second fixture classifies clean)", async () => {
    const pageJsonText = readFileSync(join(FIXTURES, "ai-chat/page.json"), "utf-8");
    const r = await root<PerceiveResult>(host, "discovery.perceive@1", { fixture: { name: "ai-chat" } });
    expect(r.nodeCount).toBe(20);
    const graph = await root<VaultGet>(host, "vault.get@1", { ns: "discovery", id: "graph:ai-chat" });
    const nodes = (graph.data as ApplicationGraph).nodes as GraphNode[];
    for (const node of nodes) {
      expect(node.evidence.length).toBeGreaterThanOrEqual(1);
      const { ns, id, rev } = parseCasRef(node.evidence[0]!.casRef);
      const capture = await root<VaultGet>(host, "vault.get@1", { ns, id, rev });
      expect(capture.data).toBe(pageJsonText);
    }
    const bySelector = new Map(nodes.map((n) => [n.selectorHint, n] as const));
    expect(bySelector.get("#prompt-input")!.kind).toBe("field");
    expect(bySelector.get("#send-btn")!.kind).toBe("button");
    expect(bySelector.get("#message-list")!.kind).toBe("list");
    expect(bySelector.get("#model-select")!.kind).toBe("control");
    expect(bySelector.get("#stream-text")!.kind).toBe("container");
  });

  test("fail-closed: malformed payloads → DEGRADED (not a crash, not silent)", async () => {
    const missing = await host.router.callAsRoot("discovery.perceive@1", {});
    expect(missing.ok).toBe(false);
    if (!missing.ok) {
      expect(missing.error).toBe("DEGRADED");
      expect(missing.detail).toContain("payload.fixture");
    }
    const traversal = await host.router.callAsRoot("discovery.perceive@1", { fixture: { name: "../etc" } });
    expect(traversal.ok).toBe(false);
    if (!traversal.ok) {
      expect(traversal.error).toBe("DEGRADED");
      expect(traversal.detail).toContain("fixture.name");
    }
    const unknown = await host.router.callAsRoot("discovery.perceive@1", { fixture: { name: "no-such-capture" } });
    expect(unknown.ok).toBe(false);
    if (!unknown.ok) {
      expect(unknown.error).toBe("DEGRADED");
      expect(unknown.detail).toContain("no-such-capture");
    }
  });

  test("the internal evidence appends passed the REAL law gate (vault.append@1 MUTATION → allow + journal)", async () => {
    const jf = join(VAULT_DIR, "law-journal.jsonl");
    const lines = readFileSync(jf, "utf-8").trim().split("\n").filter(Boolean).map((l) => JSON.parse(l) as Record<string, unknown>);
    const perceptionAppends = lines.filter((l) => l.op === "vault.append@1" && l.decision === "allow" && l.principal === "discovery.perception");
    // webmail (2 objects: capture + graph) + ai-chat (2) + determinism re-checks... at least the 4 from this vault
    expect(perceptionAppends.length).toBeGreaterThanOrEqual(4);
  });
});
