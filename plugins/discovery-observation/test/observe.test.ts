// discovery.observation — test/observe.test.ts (Ω7, GATE-Ω7 evidence, part 2)
//
// Unit: the event-trace parser + causal-edge derivation + drift comparison
// (src/trace.ts — pure, no ports). Integration: the SAME compositions/discovery.json
// pattern with its own temp dirs (${TMP}/omega-discovery-observation/… — via omegaTmp) — perceive
// then observe the webmail fixture through the real µhost → a click→network→
// dom-update chain with byte-span evidence that resolves via vault.get@1 →
// DRIFT: a mutated fixture variant (one event timestamp) observed against the
// same vault records latency drift as DATA (ok:true, never an error).
import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { bootComposition, compileComposition, ensureVault } from "@vivim/omega-host";
import type { BootedHost } from "@vivim/omega-host";
import type { CompositionSpec, PortResult } from "@vivim/omega-contracts";
import { compareEdges, deriveEdges, graphResolver, parseTrace, type CausalEdge, type DriftRecord } from "../src/trace.ts";
import { omegaTmp } from "@vivim/omega-platform"; // D-372 Phase 3: scratch through the seam

// ---- unit: trace parsing + edge derivation -----------------------------------------

function trace(...lines: Array<Record<string, unknown>>): string {
  return lines.map((l) => JSON.stringify(l)).join("\n") + "\n";
}

describe("Ω7 observation unit — event-trace parsing + edge derivation (src/trace.ts)", () => {
  test("parseTrace: line count + byte spans slice back to the exact line text", () => {
    const text = trace(
      { type: "click", targetSelector: "#a", ts: 100 },
      { type: "network", targetSelector: "#a", ts: 120, detail: { requestId: "r1" } },
      { type: "dom-update", targetSelector: "#b", ts: 300 },
    );
    const { events, spans } = parseTrace(text);
    expect(events.length).toBe(3);
    const bytes = Buffer.from(text, "utf-8");
    for (let i = 0; i < events.length; i++) {
      const sliced = bytes.slice(spans[i]!.start, spans[i]!.end).toString("utf-8");
      expect(JSON.parse(sliced)).toEqual(JSON.parse(text.split("\n")[i]!));
    }
    expect(spans[0]!.start).toBe(0);
    expect(spans[1]!.start).toBe(spans[0]!.end + 1); // contiguous, newline counted between lines
  });

  test("parseTrace: blank lines skipped; malformed lines fail closed", () => {
    expect(parseTrace("\n\n").events.length).toBe(0);
    expect(() => parseTrace("{oops")).toThrow("malformed event line");
    expect(() => parseTrace(JSON.stringify({ type: "scroll", targetSelector: "#a", ts: 1 }))).toThrow("bad type");
    expect(() => parseTrace(JSON.stringify({ type: "click", ts: 1 }))).toThrow("targetSelector");
    expect(() => parseTrace(JSON.stringify({ type: "click", targetSelector: "#a", ts: "soon" }))).toThrow("integer ts");
  });

  test("deriveEdges: the canonical chain click → network → dom-update = ONE click edge, latency = ts delta", () => {
    const text = trace(
      { type: "click", targetSelector: "#a", ts: 100 },
      { type: "network", targetSelector: "#a", ts: 120, detail: { requestId: "r1" } },
      { type: "dom-update", targetSelector: "#b", ts: 300 },
    );
    const { events, spans } = parseTrace(text);
    const resolver = (s: string) => (s === "#a" ? "na" : s === "#b" ? "nb" : null);
    const { edges, skippedUnresolved, unattributedUpdates } = deriveEdges(events, spans, resolver, { ns: "discovery", id: "trace:t", rev: 1 });
    expect(edges.length).toBe(1);
    expect(edges[0]).toMatchObject({ id: "e0", from: "na", to: "nb", trigger: "click", latencyMs: 200 });
    expect(edges[0]!.evidence.length).toBe(3); // cause line + network line + dom line
    expect(edges[0]!.evidence.every((e) => e.casRef === "discovery/trace:t@1" && e.ns === "discovery" && e.id === "trace:t" && e.rev === 1 && e.span)).toBe(true);
    expect(skippedUnresolved).toBe(0);
    expect(unattributedUpdates).toBe(0);
  });

  test("deriveEdges: type events produce 'type' edges; a network without a user action is a 'network' edge (server push)", () => {
    const text = trace(
      { type: "type", targetSelector: "#f", ts: 1000 },
      { type: "network", targetSelector: "#f", ts: 1020, detail: { requestId: "r9" } },
      { type: "dom-update", targetSelector: "#list", ts: 1400 },
      { type: "network", targetSelector: "#list", ts: 2000, detail: { requestId: "push-1" } }, // NEW lineage → new cause
      { type: "dom-update", targetSelector: "#list", ts: 2120 },
    );
    const { events, spans } = parseTrace(text);
    const resolver = (s: string) => (s === "#f" ? "nf" : s === "#list" ? "nlist" : null);
    const { edges } = deriveEdges(events, spans, resolver, { ns: "x", id: "y", rev: 1 });
    expect(edges.map((e) => [e.trigger, e.latencyMs])).toEqual([["type", 400], ["network", 120]]);
    expect(edges[0]).toMatchObject({ from: "nf", to: "nlist" });
    expect(edges[1]).toMatchObject({ from: "nlist", to: "nlist" }); // push lands on the list itself
    expect(edges[1]!.evidence.length).toBe(2); // push line + dom line (no user action in that group)
  });

  test("deriveEdges: streaming — same requestId joins the click group; every dom-update is an edge from the SAME cause", () => {
    const text = trace(
      { type: "click", targetSelector: "#send", ts: 900 },
      { type: "network", targetSelector: "#send", ts: 930, detail: { requestId: "r2" } },
      { type: "dom-update", targetSelector: "#list", ts: 1150 },
      { type: "network", targetSelector: "#stream", ts: 1500, detail: { requestId: "r2", chunk: 1 } },
      { type: "dom-update", targetSelector: "#stream", ts: 1650 },
      { type: "dom-update", targetSelector: "#stream", ts: 1980 },
    );
    const { events, spans } = parseTrace(text);
    const resolver = (s: string) => `n:${s}`;
    const { edges } = deriveEdges(events, spans, resolver, { ns: "x", id: "y", rev: 1 });
    expect(edges.length).toBe(3);
    expect(edges.map((e) => e.latencyMs)).toEqual([250, 750, 1080]); // all measured from the click
    expect(new Set(edges.map((e) => e.from))).toEqual(new Set(["n:#send"]));
    // evidence accumulates the request lineage: [click, net0] → [click, net0, net1] → …
    expect(edges[0]!.evidence.map((e) => e.span!.start)).toHaveLength(3);
    expect(edges[1]!.evidence).toHaveLength(4);
    expect(edges[2]!.evidence).toHaveLength(4);
  });

  test("deriveEdges: dom-update with no cause is unattributed; unresolved endpoints are skipped — both counted, never thrown", () => {
    const text = trace(
      { type: "dom-update", targetSelector: "#x", ts: 100 }, // no cause before it
      { type: "click", targetSelector: "#a", ts: 200 },
      { type: "dom-update", targetSelector: "#ghost", ts: 300 }, // target not in the graph
      { type: "type", targetSelector: "#f", ts: 400 },
      { type: "network", targetSelector: "#f", ts: 450, detail: {} }, // joins the type group; no dom follows
    );
    const { events, spans } = parseTrace(text);
    const resolver = (s: string) => (s === "#a" ? "na" : s === "#f" ? "nf" : null);
    const { edges, skippedUnresolved, unattributedUpdates } = deriveEdges(events, spans, resolver, { ns: "x", id: "y", rev: 1 });
    expect(edges.length).toBe(0);
    expect(unattributedUpdates).toBe(1);
    expect(skippedUnresolved).toBe(1);
  });

  test("deriveEdges: consecutive types reset the cause — latency measured from the LAST keystroke", () => {
    const t = trace(
      { type: "type", targetSelector: "#f", ts: 100, detail: { value: "m" } },
      { type: "type", targetSelector: "#f", ts: 200, detail: { value: "me" } },
      { type: "dom-update", targetSelector: "#suggest", ts: 350 },
    );
    const { events, spans } = parseTrace(t);
    const { edges } = deriveEdges(events, spans, (s) => `n:${s}`, { ns: "x", id: "y", rev: 1 });
    expect(edges.length).toBe(1);
    expect(edges[0]!.latencyMs).toBe(150); // 350 − 200: the most recent user action wins
    expect(edges[0]!.trigger).toBe("type");
  });

  test("graphResolver: selectorHint → node id; unknown selector → null", () => {
    const resolver = graphResolver([
      { id: "n0", kind: "button", label: "Go", selectorHint: "#go", evidence: [] },
      { id: "n1", kind: "field", label: "Q", selectorHint: "#q", evidence: [] },
    ]);
    expect(resolver("#go")).toBe("n0");
    expect(resolver("#q")).toBe("n1");
    expect(resolver("#nope")).toBe(null);
  });

  test("compareEdges: latency drift is a record with the delta; structure/add/remove are records too", () => {
    const base: CausalEdge[] = [
      { id: "e0", from: "na", to: "nb", trigger: "click", latencyMs: 180, evidence: [] },
      { id: "e1", from: "nc", to: "nd", trigger: "type", latencyMs: 40, evidence: [] },
      { id: "e2", from: "ne", to: "ne", trigger: "network", latencyMs: 120, evidence: [] },
    ];
    const latency = compareEdges(base, [
      { ...base[0]!, latencyMs: 580 },
      base[1]!,
      base[2]!,
    ]);
    expect(latency).toEqual([{ edgeId: "e0", kind: "latency", field: "latencyMs", baseline: 180, observed: 580, deltaMs: 400 }]);

    const structure = compareEdges(base, [
      { ...base[0]!, to: "nz" },
      base[1]!,
      base[2]!,
    ]);
    expect(structure).toEqual([{ edgeId: "e0", kind: "structure", field: "to", baseline: "nb", observed: "nz" }]);

    const addedRemoved = compareEdges([base[0]!], [base[1]!, base[2]!]);
    expect(addedRemoved.map((d) => [d.kind, d.edgeId]).sort()).toEqual([["edge-added", "e1"], ["edge-added", "e2"], ["edge-removed", "e0"]]);

    expect(compareEdges(base, base)).toEqual([]); // identical → zero drift
  });
});

// ---- integration: the discovery composition pattern through the real µhost ----------

const OMEGA_ROOT = join(import.meta.dir, "../../.."); // test/ → discovery-observation/ → plugins/ → root
const FIXTURES = join(OMEGA_ROOT, "fixtures");

const LAW_CONTRACTS = ["law.check@1", "law.registry@1", "law.consent.grant@1", "law.tokens.revoke@1", "law.amendment@1"];
const VAULT_CONTRACTS = ["vault.append@1", "vault.get@1", "vault.query@1", "vault.search@1", "vault.verify@1", "vault.compact@1", "vault.roundtrip@1"];
const ENGINE_CAPS = ["port:vault.append@1", "port:vault.get@1"];

const hosts: BootedHost[] = [];
afterAll(async () => { await Promise.all(hosts.map((h) => h.shutdown().catch(() => {}))); }, 20_000);

async function shutdownCase(h: BootedHost): Promise<void> {
  const i = hosts.indexOf(h);
  if (i >= 0) hosts.splice(i, 1);
  await h.shutdown().catch(() => {});
}

interface Case { host: BootedHost; root: string; vaultDir: string; dataDir: string }

/** Spec copy of compositions/discovery.json (same pattern) with a per-case dataDir/fixturesDir. */
function makeDiscoverySpec(name: string, dataDir: string, fixturesDir: string): CompositionSpec {
  return {
    name,
    entries: [
      { id: "vivim.law", source: "plugins/vivim-law", bootPhase: 0, grant: { capabilities: ["host.journal.append", "host.tokens.revoke"], contracts: LAW_CONTRACTS } },
      { id: "vivim.vault", source: "plugins/vivim-vault", bootPhase: 1, grant: { capabilities: [], contracts: VAULT_CONTRACTS }, config: { dataDir } },
      { id: "discovery.perception", source: "plugins/discovery-perception", bootPhase: 1, grant: { capabilities: ENGINE_CAPS, contracts: ["discovery.perceive@1"] }, config: { fixturesDir } },
      { id: "discovery.observation", source: "plugins/discovery-observation", bootPhase: 1, grant: { capabilities: ENGINE_CAPS, contracts: ["discovery.observe@1"] }, config: { fixturesDir } },
    ],
  };
}

async function bootCase(caseName: string, opts: { dataDir?: string; fixturesDir?: string } = {}): Promise<Case> {
  const root = omegaTmp("omega-discovery-observation", `${caseName}-${Date.now()}-${Math.floor(Math.random() * 1e6)}`);
  rmSync(root, { recursive: true, force: true });
  const vaultDir = join(root, "host");
  mkdirSync(vaultDir, { recursive: true });
  const dataDir = opts.dataDir ?? join(root, "vault-data");
  const fixturesDir = opts.fixturesDir ?? FIXTURES;
  const { rootKey } = ensureVault(vaultDir);
  const { recipe, buildDir } = compileComposition(makeDiscoverySpec(`discovery-${caseName}`, dataDir, fixturesDir), OMEGA_ROOT, vaultDir, rootKey);
  const host = await bootComposition(recipe, buildDir, vaultDir);
  hosts.push(host);
  return { host, root, vaultDir, dataDir };
}

interface ObserveResult {
  edges: CausalEdge[];
  eventCount: number;
  edgesCount: number;
  drift: DriftRecord[];
  observationId: { ns: string; id: string; rev: number; cid: string };
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

describe("GATE-Ω7 observation — perceive → observe the webmail trace through the real host", () => {
  let c: Case;
  let selectorToId: Map<string, string>;
  let observe: ObserveResult;

  beforeAll(async () => {
    c = await bootCase("pipeline");
    const perceived = await root<PerceiveResult>(c.host, "discovery.perceive@1", { fixture: { name: "webmail-inbox" } });
    expect(perceived.nodeCount).toBe(27);
    const graph = await root<VaultGet>(c.host, "vault.get@1", { ns: "discovery", id: "graph:webmail-inbox" });
    selectorToId = new Map(((graph.data as { nodes: Array<{ id: string; selectorHint: string }> }).nodes).map((n) => [n.selectorHint, n.id] as const));
    observe = await root<ObserveResult>(c.host, "discovery.observe@1", {
      fixture: { name: "webmail-inbox", pageRef: { ns: "discovery", id: "capture:webmail-inbox" } },
      graphRef: { ns: "discovery", id: "graph:webmail-inbox" },
    });
  });

  test("first touch activated the pipeline (D-331 transparency); both engine ops route", () => {
    // beforeAll already perceived + observed + read the vault back: every
    // phase-1 entry above woke on its first routed call. Dormant-at-boot for
    // this same composition shape is pinned in perceive.test.ts.
    const st = c.host.router.status();
    const compartments = st.compartments as Record<string, { state: string }>;
    for (const id of ["vivim.law", "vivim.vault", "discovery.perception", "discovery.observation"]) {
      expect(compartments[id]?.state).toBe("active");
    }
    expect(st.dormant).toEqual([]);
    expect(st.routedOps).toEqual(expect.arrayContaining(["discovery.perceive@1", "discovery.observe@1"]));
  });

  test("17 events replayed → 6 causal edges incl. the click→network→dom-update chain (exact matrix)", () => {
    expect(observe.eventCount).toBe(17);
    expect(observe.edgesCount).toBe(6);
    expect(observe.drift).toEqual([]); // first observation: no baseline
    const expectEdge = (id: string, fromSel: string, toSel: string, trigger: string, latency: number) => {
      const e = observe.edges.find((x) => x.id === id);
      expect(e).toBeTruthy();
      expect(e!.from).toBe(selectorToId.get(fromSel));
      expect(e!.to).toBe(selectorToId.get(toSel));
      expect(e!.trigger).toBe(trigger);
      expect(e!.latencyMs).toBe(latency);
    };
    expectEdge("e0", "#compose-btn", "#compose-form", "click", 180); // the compose chain
    expectEdge("e1", "#send-btn", "#msg-list", "click", 500); // send → message appended
    expectEdge("e2", "#send-btn", "#status-bar", "click", 550); // send → status text
    expectEdge("e3", "#msg-1", "#msg-1", "click", 90); // self-edge: row marked seen
    expectEdge("e4", "#search-input", "#msg-list", "type", 400); // search results
    expectEdge("e5", "#msg-list", "#msg-list", "network", 120); // server push → new mail
  });

  test("EVERY edge cites trace bytes by span: refs resolve via vault.get@1 and the spans slice to the backing event lines", async () => {
    const rawTrace = readFileSync(join(FIXTURES, "webmail-inbox/events.jsonl"), "utf-8");
    for (const edge of observe.edges) {
      expect(edge.evidence.length).toBeGreaterThanOrEqual(1);
      const lines: Array<Record<string, unknown>> = [];
      for (const ref of edge.evidence) {
        const m = CAS_REF.exec(ref.casRef);
        expect(m).toBeTruthy();
        const got = await root<VaultGet>(c.host, "vault.get@1", { ns: m![1], id: m![2], rev: Number(m![3]) });
        expect(got.data).toBe(rawTrace); // the evidence IS the appended trace bytes
        const text = got.data as string;
        const sliced = Buffer.from(text, "utf-8").slice(ref.span!.start, ref.span!.end).toString("utf-8");
        lines.push(JSON.parse(sliced) as Record<string, unknown>);
      }
      // deep span validation: the first cited line is the CAUSE (its target resolves to edge.from),
      // the last is the DOM UPDATE (its target resolves to edge.to)
      const idToSelector = new Map([...selectorToId.entries()].map(([sel, id]) => [id, sel] as const));
      expect(lines[0]!.targetSelector).toBe(idToSelector.get(edge.from));
      expect(lines.at(-1)!.type).toBe("dom-update");
      expect(lines.at(-1)!.targetSelector).toBe(idToSelector.get(edge.to));
      expect(lines.slice(1, -1).every((l) => l.type === "network")).toBe(true); // lineage in the middle
    }
  });

  test("the observation persists in the vault with provenance refs (trace + page capture + graph)", async () => {
    const stored = await root<VaultGet>(c.host, "vault.get@1", { ns: "discovery", id: "observation:webmail-inbox" });
    const data = stored.data as { edgesCount: number; drift: DriftRecord[]; fixture: string; eventCount: number };
    expect(data.fixture).toBe("webmail-inbox");
    expect(data.eventCount).toBe(17);
    expect(data.edgesCount).toBe(6);
    expect(data.drift).toEqual([]);
    expect(stored.rev).toBe(1);
    expect(stored.refs).toEqual(expect.arrayContaining([
      { ns: "discovery", id: "trace:webmail-inbox", rev: 1 },
      { ns: "discovery", id: "capture:webmail-inbox", rev: 1 },
      { ns: "discovery", id: "graph:webmail-inbox", rev: 1 },
    ]));
    expect(observe.observationId).toMatchObject({ ns: "discovery", id: "observation:webmail-inbox", rev: 1 });
  });

  test("ai-chat: the streaming trace yields one type edge + six click edges with rising latencies", async () => {
    const perceived = await root<PerceiveResult>(c.host, "discovery.perceive@1", { fixture: { name: "ai-chat" } });
    expect(perceived.nodeCount).toBe(20);
    const r = await root<ObserveResult>(c.host, "discovery.observe@1", {
      fixture: { name: "ai-chat", pageRef: { ns: "discovery", id: "capture:ai-chat" } },
      graphRef: { ns: "discovery", id: "graph:ai-chat" },
    });
    expect(r.eventCount).toBe(13);
    expect(r.edgesCount).toBe(7);
    expect(r.edges.map((e) => [e.trigger, e.latencyMs])).toEqual([
      ["type", 40], // token counter updates while typing
      ["click", 250], ["click", 750], ["click", 1080], ["click", 1360], ["click", 1500], ["click", 1550], // streaming dom updates
    ]);
    // the ai-chat graph's OWN selector→node map (selectors like #send-btn exist in both fixtures)
    const chatGraph = await root<VaultGet>(c.host, "vault.get@1", { ns: "discovery", id: "graph:ai-chat" });
    const chatSel = new Map(((chatGraph.data as { nodes: Array<{ id: string; selectorHint: string }> }).nodes).map((n) => [n.selectorHint, n.id] as const));
    expect(r.edges.every((e) => e.from === chatSel.get("#send-btn") || e.trigger === "type")).toBe(true);
    const typeEdge = r.edges[0]!;
    expect(typeEdge.from).toBe(chatSel.get("#prompt-input"));
    expect(typeEdge.to).toBe(chatSel.get("#chat-footer"));
    const streamEdges = r.edges.slice(1).filter((e) => e.to === chatSel.get("#stream-text"));
    expect(streamEdges.map((e) => e.latencyMs)).toEqual([750, 1080, 1360, 1550]); // the streamed text
  });

  test("stand-alone mode (no graphRef): edges carry raw selectors as node references", async () => {
    const standalone = await bootCase("standalone");
    try {
      const r = await root<ObserveResult>(standalone.host, "discovery.observe@1", { fixture: { name: "ai-chat" } });
      expect(r.edgesCount).toBe(7);
      expect(r.edges[0]!.from).toBe("#prompt-input");
      expect(r.edges[0]!.to).toBe("#chat-footer");
      expect(r.edges[1]!.from).toBe("#send-btn");
      expect(r.drift).toEqual([]); // fresh vault → no baseline
    } finally {
      await shutdownCase(standalone.host);
    }
  });
});

describe("GATE-Ω7 observation — drift is data, not error (mutated fixture variant)", () => {
  test("second observation against the same vault records latency drift; the op stays ok:true", async () => {
    // boot 1: the pristine fixture, observed (baseline)
    const c = await bootCase("drift");
    const perceived = await root<PerceiveResult>(c.host, "discovery.perceive@1", { fixture: { name: "webmail-inbox" } });
    expect(perceived.nodeCount).toBe(27);
    const first = await root<ObserveResult>(c.host, "discovery.observe@1", {
      fixture: { name: "webmail-inbox", pageRef: { ns: "discovery", id: "capture:webmail-inbox" } },
      graphRef: { ns: "discovery", id: "graph:webmail-inbox" },
    });
    expect(first.drift).toEqual([]);
    expect(first.observationId.rev).toBe(1);

    // fixture variant: copy webmail-inbox, mutate ONE event timestamp (compose dom-update 300 → 700)
    const variantDir = join(c.root, "fixtures-variant");
    rmSync(variantDir, { recursive: true, force: true }); // start clean; cpSync creates the dest itself
    cpSync(join(FIXTURES, "webmail-inbox"), join(variantDir, "webmail-inbox"), { recursive: true });
    const eventsPath = join(variantDir, "webmail-inbox", "events.jsonl");
    const lines = readFileSync(eventsPath, "utf-8").split("\n");
    const composeDom = lines.findIndex((l) => l.includes('"dom-update"') && l.includes('"#compose-form"'));
    expect(composeDom).toBe(2); // the third line: the dom-update of the compose chain
    const mutated = JSON.parse(lines[composeDom]!) as { ts: number };
    mutated.ts = 1735689600700; // +400ms
    lines[composeDom] = JSON.stringify(mutated);
    writeFileSync(eventsPath, lines.join("\n"));

    // boot 2: SAME dataDir (the baseline lives in the vault), fixturesDir → the variant
    await shutdownCase(c.host);
    const root2 = join(c.root, "host2");
    mkdirSync(root2, { recursive: true });
    const { rootKey } = ensureVault(root2);
    const { recipe, buildDir } = compileComposition(
      makeDiscoverySpec("discovery-drift-variant", c.dataDir, variantDir),
      OMEGA_ROOT, root2, rootKey,
    );
    const host2 = await bootComposition(recipe, buildDir, root2);
    hosts.push(host2);
    try {
      const second = await root<ObserveResult>(host2, "discovery.observe@1", {
        fixture: { name: "webmail-inbox", pageRef: { ns: "discovery", id: "capture:webmail-inbox" } },
        graphRef: { ns: "discovery", id: "graph:webmail-inbox" },
      });
      // DRIFT IS DATA: the op returned ok — the divergence is recorded, not raised
      expect(second.eventCount).toBe(17);
      expect(second.edgesCount).toBe(6); // structure unchanged: only one timestamp moved
      expect(second.drift).toEqual([
        { edgeId: "e0", kind: "latency", field: "latencyMs", baseline: 180, observed: 580, deltaMs: 400 },
      ]);
      expect(second.observationId.rev).toBe(2); // appended as a new observation revision

      // the stored observation carries the drift + the baseline provenance edge
      const stored = await root<VaultGet>(host2, "vault.get@1", { ns: "discovery", id: "observation:webmail-inbox" });
      const data = stored.data as { drift: DriftRecord[]; baselineRev?: number };
      expect(data.drift).toEqual(second.drift);
      expect(data.baselineRev).toBe(1);
      expect(stored.rev).toBe(2);
      expect(stored.refs).toEqual(expect.arrayContaining([
        { ns: "discovery", id: "trace:webmail-inbox", rev: 2 }, // mutated trace → new revision
        { ns: "discovery", id: "observation:webmail-inbox", rev: 1 }, // the baseline it diverged from
      ]));

      // a THIRD observation of the same variant bytes converges: drift vs rev 2 is empty
      // (same graphRef → identical edge endpoints → only latencies compare, and they match)
      const third = await root<ObserveResult>(host2, "discovery.observe@1", {
        fixture: { name: "webmail-inbox" },
        graphRef: { ns: "discovery", id: "graph:webmail-inbox" },
      });
      expect(third.drift).toEqual([]);
      expect(third.observationId.rev).toBe(3);
    } finally {
      await shutdownCase(host2);
    }
  });
});
