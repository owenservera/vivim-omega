# Discovery fixtures — captured pages (SYNTHETIC, deterministic)

These are **synthetic-but-realistic captured pages** that stand in for real CDP
(Chrome DevTools Protocol) captures inside the sandbox. They are committed data,
not generated at test time — the discovery engines (`discovery.perceive@1`,
`discovery.observe@1`) consume them exactly the way they would consume a real
capture: `page.json` (a serialized DOM snapshot) + `events.jsonl` (a network/DOM
event trace with timestamps).

## The fixture-honesty law

- **In-sandbox**: fixtures only. No browser, no network, no LLM, no wall-clock
  values inside derived artifacts — every test outcome is deterministic.
- **Live capture legs are owner-machine scripts**, documented in
  `docs/DISCOVERY.md` (CDP `DOMSnapshot.captureSnapshot` → `page.json`,
  `Network.*` + `MutationObserver` → `events.jsonl`). They are not run here.

## Fixture shape

```
fixtures/<name>/page.json     { fixture, capturedAt, url, viewport, root: DomNode }
fixtures/<name>/events.jsonl  one JSON object per line:
                              { type: click|type|network|dom-update,
                                targetSelector, ts, detail? }
```

`DomNode`: `{ tag, id?, role?, ariaLabel?, text?, placeholder?, classes?, type?,
children? }` — a deliberately simple serialization of the CDP snapshot tree
(tag + role/aria + text + id + classes per node).

- `capturedAt` / `ts` are fixed epoch-ms values authored with the fixture —
  never wall clock — so perception/observation output is byte-deterministic.
- `targetSelector` values in `events.jsonl` match `selectorHint` values
  produced by the perception engine (nodes with a DOM `id` hint as `#id`).

## Fixtures

| fixture         | UI                                            | classified nodes | trace events |
|-----------------|-----------------------------------------------|------------------|--------------|
| `webmail-inbox` | inbox: folder nav, search field, message list, compose form | 27               | 17           |
| `ai-chat`       | chat: prompt textarea, send/stop buttons, message list, streaming panel | 20               | 13           |

Byte spans: `events.jsonl` lines are strictly ASCII; `discovery.observe@1`
computes UTF-8 byte offsets per line, so string indices equal byte offsets in
these files.
