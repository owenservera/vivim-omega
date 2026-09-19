# D-400 — Composition proposal generation without self-application (Part2 §4)

## Status

RATIFIED

## Context

When describe reports a requested op with no offeror, the gap is visible but nothing may self-grant it: auto-signing new capabilities would bypass the human trust root (B1 spirit). A prepared proposal saves labor; a credential would remove the human.

## Options

| Criterion | (a) Proposal-only: draft diff plus justification to recipe.proposed.json, boot proof it cannot self-apply (recommended) | (b) Self-applying recompose | (c) No proposal surface |
|---|---|---|---|
| B1 trust root | Human signs through existing tooling, draft never boots | System grants itself capability | Gap stays manual |
| Labor | Draft saves writing | Most autonomous | Most manual |
| Risk | Provisional path, boot ignores | Bypasses signature chain | None |

## Decision

**Decision:** (a) — proposal-only with boot proof.

## Consequences

- Draft holds composition entry plus manifest plus grant edges plus plain-language justification, mirroring capability justification discipline.
- `recipe.proposed.json` is provisional; recovery boot never reads it, proven by test.
- Acting on proposals (even rubber-stamped) is a future wave after live proposal data exists.

## Evidence

- `tooling/propose.ts` plus `tooling/propose/test/propose.test.ts` green.
- Ratified: falsifier plus boot proof plus two consecutive full greens (962/0, host 1500/1500, attest green, Linux). Landing: 786006c.
