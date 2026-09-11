# Ω7 — Discovery: perception + observation engines

The discovery wave turns **captured application behavior into evidence-backed
graphs**. Two ORDINARY plugins (ENGINE contributions — no special spine hooks):

| plugin | op | what it does |
|---|---|---|
| `discovery.perception` | `discovery.perceive@1` | walks a captured page (`page.json`), classifies DOM nodes, builds an **ApplicationGraph**, appends capture + graph to the vault |
| `discovery.observation` | `discovery.observe@1` | replays a captured event trace (`events.jsonl`), derives **CausalEdges** with byte-span evidence, records **drift** vs a prior observation |

Their only outputs: **evidence + graphs in the vault + candidate contracts** (for
Ω8/Ω9). Composition: `compositions/discovery.json` (real `vivim.law` phase 0 +
`vivim.vault` phase 1 + both engines phase 1; the engines hold exactly
`port:vault.append@1` + `port:vault.get@1`).

## The evidence model (SCHEMA contributions — the contract of record)

Declared by `plugins/discovery-perception/plugin.json`; the TS types in both
engine plugins are mirrors (B2: compartments never import each other's code):

```
discovery.application-graph@1  { id, capturedAt, source: {fixtureName}, nodes[], edges[] }
discovery.graph-node@1         { id, kind: control|field|button|list|container,
                                 label, selectorHint, evidence[] }
discovery.causal-edge@1        { id, from, to, trigger: click|type|network,
                                 latencyMs, evidence[] }
discovery.evidence-ref@1       { casRef: "<ns>/<id>@<rev>", span?: {start, end} }
```

- `casRef` grammar: `<ns>/<id>@<rev>` — e.g. `discovery/capture:webmail-inbox@1`.
  It resolves through `vault.get@1 {ns, id, rev}`; the object's `data` IS the
  capture bytes (the raw `page.json` / `events.jsonl` text, so spans index real
  bytes). **Every claim node and every edge cites at least one ref** — evidence
  is constitutional (P5: provenance).
- `span` = UTF-8 **byte** offsets `[start, end)` into the referenced capture
  bytes. Perception cites whole-capture (no span); observation cites the exact
  event lines backing each edge (cause line + network lines + dom-update line).
- Vault-level provenance is layered on top: the `graph:<name>` object carries a
  `refs` edge to `capture:<name>`; `observation:<name>` carries refs to
  `trace:<name>`, the page capture, the graph, and the baseline observation.
- Node ids are path ids (`n0`, `n0.3.2`); selector hints are `#id` or CSS
  `tag:nth-of-type(k)` paths — the JOIN KEY between graphs and event traces
  (`events.jsonl` `targetSelector` values are authored to match).

## The engines

**`discovery.perceive@1 {fixture: {name, pageRef?}} → {graphId, nodeCount, edgeCount}`**
Loads `<fixturesDir>/<name>/page.json` (`ctx.config.fixturesDir`, composition
passthrough — absolute in the shipped composition), appends the page bytes as a
vault evidence object (default `discovery` / `capture:<name>`), reads them back
through `port:vault.get@1` (integrity self-check), walks + classifies the DOM
tree (button: `role=button`|`tag=button`; field: `input`/`textarea`;
list: `ul`/`ol`/`role=list`; control: `a`/`select`/`option` + interactive roles;
container: everything else with children — non-interactive leaves are label
material and are skipped), appends the graph (`discovery` / `graph:<name>`),
returns `{graphId: {ns, id, rev, cid}, nodeCount, edgeCount: 0}`.
Label precedence: aria-label → own text → placeholder → first descendant text →
id → `tag(:role)` fallback; collapsed, capped at 60 chars.

**`discovery.observe@1 {fixture: {name, pageRef?, traceRef?}, graphRef?} → {edges, eventCount, edgesCount, drift, observationId}`**
Replays `<fixturesDir>/<name>/events.jsonl`. Attribution rules (deterministic):
a click/type starts a causal group; a network event joins the open group iff it
is the group's first network or shares its `requestId` lineage (streaming
chunks), otherwise it starts a **network-attributed** group (server push); every
dom-update in the open group emits one edge — `trigger` = the cause's type,
`latencyMs` = `ts(dom) − ts(cause)`, evidence = the backing trace lines by byte
span. With `graphRef` the endpoints resolve to GraphNode ids (the explicit ref
must resolve — fail-closed); without it, edges carry raw selectors as node
references and attach later by selectorHint match. **Drift**: if a prior
`observation:<name>` exists in the vault, its edges are the baseline; latency,
structure, and edge-set divergences are returned as drift RECORDS — *drift is
data, not error* (the op returns `ok:true`; a real vault failure still fails
closed at the next append).

Determinism: neither engine reads the clock, random, or anything outside the
config-passed fixtures dir. Same fixture bytes → same graph/edges (proven by
test: two fresh vaults → identical sha256 graph hash + identical capture cids —
CAS is content-addressed).

## The fixture-honesty law

- **In-sandbox = fixtures only.** `fixtures/webmail-inbox/` and
  `fixtures/ai-chat/` are synthetic-but-realistic captures committed to the
  repo; timestamps are authored epoch-ms, never wall clock.
- **Live capture legs are owner-machine scripts** (documented, NOT run here):
  - `page.json` from CDP `DOMSnapshot.captureSnapshot` (tag/role/aria/text/id
    classes per node, serialized to the simple tree above);
  - `events.jsonl` from CDP `Network.*` + a `MutationObserver` bridge (click/
    type targets from `Input.dispatchMouseEvent`/keypress, `requestId` from the
    network domain, `ts` from the trace monotonic clock);
  - scripts live on the owner machine (browser + target app reachable), write
    the same fixture shape into the same fixtures layout, and the engines
    consume them unchanged — fixture shape is the only contract.
- **Zero LLM**: no `z-ai-web-dev-sdk`, no network calls, no model inference
  anywhere in the discovery engines. All classification/derivation is
  deterministic code over captured data.

## How Ω8/Ω9 consume this

- **Read the graph**: `vault.get@1 {ns: "discovery", id: "graph:<fixture>"}` →
  `data` is an `application-graph@1` (or use the structured `graphId` returned
  by `discovery.perceive@1`).
- **Read the edges**: `vault.get@1 {ns: "discovery", id: "observation:<fixture>"}` →
  `data.edges[]` (also returned directly by `discovery.observe@1`).
- **Verify any claim**: parse `evidence[i].casRef` → `vault.get@1` → slice
  `span` off the returned bytes → the exact capture line/node backing the claim
  (the GATE-Ω7 tests do exactly this for every node and every edge).
- **Candidate contracts** derive from the graph: a button node with an outgoing
  click edge whose dom-update lands on a container is a candidate
  `<action>.<target>@1` contract; latency distributions (`latencyMs` across
  edges) inform budget defaults; `selectorHint` + `label` feed affordance
  metadata. Drift records tell Ω8 when a re-observation of the same app
  diverged (a changed latency budget or a changed DOM shape) — re-derive, never
  crash.

## Deviations (documented judgment calls)

1. **SCHEMA ids are lowercase** (`discovery.application-graph@1`, not
   `ApplicationGraph@1`): the pinned contribution-id grammar
   (`sdk` `ID_PATTERN`, host loader, `DEP_REF` grammar) is lowercase-only —
   same deviation class as Ω5's `email.message@1` rename.
2. **Engine contributions carry no `risk` field** — the pinned grammar allows
   risk only on contract-kind contributions (sdk `RISK_NON_CONTRACT`). The
   engines are READ-class by behavior (documented in the `doc` fields); their
   internal `vault.append@1` calls are gated by the vault contract's MUTATION
   risk and journaled by the real law (proven in tests).
3. `pageRef`/`traceRef` are optional with defaults (`capture:<name>` /
   `trace:<name>`); explicit refs must resolve (fail-closed) — the caller can
   redirect where captures live, the default is the canonical vault address.
4. Committed `compositions/discovery.json` carries an absolute `fixturesDir`
   (per the wave spec) — the engines also accept relative paths resolved
   against the host process CWD.
5. The always-append design: every perceive/observe run appends new revisions
   (CAS dedupes identical bytes). Determinism is proven across two fresh vaults;
   re-runs in one vault intentionally produce new revisions (each observation is
   a recorded event), with drift comparing against the latest prior observation.
