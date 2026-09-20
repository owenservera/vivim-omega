# D-420 — browser.json is the shippable-v1 composition, fenced mechanically — no AI-API realization boots in a shippable-tagged composition

## Status

RATIFIED

## Context

- The finding: `provider.llm` (an AI-API realization, simulator-mode today)
  is a live entry in `compositions/console.json`, `compositions/llm.json`,
  `compositions/chat.json`, and `compositions/discovery-mind.json`;
  `provider.browser` has its own separate, dedicated composition
  (`compositions/browser.json`, the "M0 GATE" composition, D-357). That
  separation is almost certainly the right instinct — console/llm/chat/
  discovery-mind as internal proving compositions that exercise the
  LLM-realization pattern in simulator mode, browser as the shippable one —
  but nothing SAYS so. There is no mechanical equivalent of the
  `FORGE_IN_PRODUCT` gate (which restricts `forge.*` routes to builder
  compositions) restricting AI-API realizations to non-shipping
  compositions.
- Why a mechanical gate, not prose: prose intent has already drifted once —
  the Ollama framing documented in D-418 sat in law-of-record documents
  without anyone deciding it should. A mechanical gate makes that class of
  drift structurally impossible instead of merely undocumented: the same
  lesson FORGE_IN_PRODUCT taught for forge.* ops, applied to the AI-API
  drift class.
- Scope discipline: `console.json`/`llm.json`/`chat.json`/
  `discovery-mind.json` keep existing EXACTLY as they are — internal proving
  compositions, untouched. The gate only needs to assert that none of them
  ever carries the shippable tag while an AI-API realization is present, and
  that the composition named shippable-v1 stays tagged.

Blocks: none

## Options

| Criterion | (a) Directive + mechanical gate: browser.json formally named shippable-v1 (tagged in its spec note), a gate check refuses AI-API realizations in shippable-tagged compositions (recommended) | (b) Prose directive only: name browser.json shippable-v1 in a record, no gate check | (c) Refactor now: split provider.llm out of the proving compositions |
|---|---|---|---|
| Drift class killed | Structurally — a shippable tag plus a present AI-API realization fails the gate BY NAME, with the fix line printed | None — the next agent re-edits prose the way the Ollama framing drifted | Structurally for the current four, but the pattern can recur with any future composition |
| Proving compositions | Untouched — console/llm/chat/discovery-mind keep exercising the LLM-realization pattern in simulator mode | Untouched | Broken — the W1 falsifier paths (D-385 parser carriers, the discovery-mind pipeline) lose their providers; re-landing them is work with no drift to fix |
| Wire cost | One pure check in the compositions net + red/green fixtures (the forge-surface pattern) | Zero code, zero protection | Refactor + matrix churn + re-signed manifests |
| D-377 byte-identity | Preserved — the tag rides the matrix `note` field, the spec regenerates byte-identical | Preserved | Churned by hand |

## Decision

**Decision:** (a) — `compositions/browser.json` (or whatever succeeds it by
amendment) is formally the **shippable-v1 composition**; the spec's note
carries the marker `SHIPPABLE-V1 (D-420)` and the matrix is the source of
truth for it; a new mechanical check — `SHIPPABLE_FENCE`, wired into the
gate's `compositions` stage — enforces three named refusals:

1. `SHIPPABLE_V1_MISSING` — no composition in the tree carries the
   `SHIPPABLE-V1 (D-420)` marker (the tag was dropped, or browser.json was
   deleted without naming a successor).
2. `SHIPPABLE_V1_UNTAGGED` — the composition named by this record
   (`browser`) does not carry the marker (the shippable-v1 name is checked
   against the tree, not remembered).
3. `AI_API_IN_SHIPPABLE` — a composition carrying the marker boots an
   AI-API realization. The AI-API realization set is DATA in the check
   (`provider.llm` today); a future AI-API realization joins the set by
   amendment to this record, the same way FORGE_OP_CATALOG amends.

The check is a pure function over the loaded specs (the forge-surface
discipline): the gate loads the real tree, the tests load hand-built
red/green inputs — every refusal has at least one red fixture that fails BY
NAME. The house gate stays the only enforcement surface; no new stage, no
new tooling surface, zero host LOC.

## Consequences

- The shippable-v1 boundary is now mechanical: any future composition edit
  that adds the shippable marker alongside an AI-API realization fails the
  gate with the entry named — the drift class that produced D-418's
  findings cannot recur silently.
- `console.json`/`llm.json`/`chat.json`/`discovery-mind.json` are unchanged
  byte-for-byte: they are internal proving compositions and remain so; the
  gate does not forbid an AI-API realization in them — only in
  shippable-tagged ones.
- What gets harder: renaming or succeeding the shippable composition
  requires amending THIS record (the check pins the name `browser`). What
  gets easier: "which composition ships?" has one answer that the gate
  verifies every run.
- The AI-API set starts as exactly `provider.llm` (the only AI-API
  realization in the tree; `provider.browser` is BROWSER_MEDIATED, not an
  AI-API — it is the realization the shippable composition EXISTS to boot).
- The tag travels with the matrix (D-377): editing `browser.json` by hand
  still fails matrix conformance; the marker is edited in `_matrix.json`'s
  note and regenerated, like every other spec byte.

## Evidence

- Course-correction briefing `OMEGA-COURSE-CORRECTION-001` §4 (the finding +
  the directed correction, option (a), the FORGE_IN_PRODUCT analogy named
  there).
- **F-1 (mechanical, red/green):** `tooling/gates/test/shippable-fence.test.ts`
  — green on the real tree (browser tagged, no AI-API realization in any
  tagged composition, the four proving compositions untouched and untagged)
  and RED on hand-built violations for each named refusal:
  `SHIPPABLE_V1_MISSING` (marker stripped from every spec),
  `SHIPPABLE_V1_UNTAGGED` (marker stripped from browser only),
  `AI_API_IN_SHIPPABLE` (provider.llm entry added to the tagged spec) —
  each failing with its own check code and subject.
- **F-2 (wired, not decorative):** the same test asserts the real-tree
  `checkCompositions()` run reports zero issues WITH the check active — and
  the gate's `compositions` stage runs it on every gate invocation (quick
  and full).
- Full gate green ×2 on this record's tree (numbers cited at ratification);
  compositions 18/18 byte-identical from the matrix post-tagging; host flat
  1500/1500; zero host LOC; anvil untouched.

- Ratified on greens (directive-class, same-day per D-364): landing commit e6c6b09; full gate green 1175/0 ×2 on the round's PROPOSED tree (2026-09-20T14:12:54Z, 14:14:34Z — 1126 + 49 new falsifiers since bundle _11: the course-correction sweeps + the efficiency-tooling suite); zero host LOC; anvil untouched; compositions 18.

## Index

summary: browser.json (D-357's M0 GATE composition, or whatever succeeds it by amendment) is formally the shippable-v1 composition, tagged in its spec note; a mechanical gate check (SHIPPABLE_FENCE, the compositions stage) enforces that no composition carrying the shippable tag boots an AI-API realization (provider.llm today) — the mechanical analog of FORGE_IN_PRODUCT for the AI-API drift class
rationale: prose intent already drifted once (the Ollama framing) without anyone deciding it should; console.json/llm.json/chat.json/discovery-mind.json keep existing exactly as internal proving compositions — the gate only asserts none of them ever carries the shippable tag while an AI-API realization is present, making that drift class structurally impossible instead of merely undocumented
class: directive
