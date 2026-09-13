# D-334 — Fresh-tree pin follows the published legacy snapshot

## Status

RATIFIED

## Context

The fresh-tree guard pins `vivim-final-enhanced` at `abb6add`, an object that
does not exist in the published single-commit snapshot lineage (`cat-file -t`
fails there). The on-disk frozen copy sits at `afebe00`, status clean. The
moment the legacy trees sit alongside omega the guard stops skipping and
enforces the pin — a stale pin then fails the gate for reasons unrelated to
any change under review (exactly the M-plan §1 warning).

## Options

| Criterion | (a) Re-pin to the published snapshot `afebe00` (recommended) | (b) Keep `abb6add` | (c) Drop the pin; clean-status only |
|---|---|---|---|
| Enforceability | Pin resolves in the snapshot lineage; HEAD equality still checked | Pin unknown outside the sandbox lineage — guard misfires on a clean tree | No misfire, but any clean HEAD passes (anchor lost) |
| Freeze strength | Unchanged mechanics (HEAD equality + clean status) | Same mechanics, wrong value | Weaker |
| CI | Unaffected (no siblings → loud skip per D-320) | Same | Same |

## Decision

**Decision:** (a) Re-pin to the published snapshot `afebe00` — the gate's legacy pin for `vivim-final-enhanced` becomes `afebe00`; `vivim-final-program` stays `4a5eb84` (resolves, HEAD matches, status clean).

## Consequences

- Fresh-tree passes on the actual frozen trees (both clean at record time).
- Any future legacy touch (edit, or HEAD move) fails the gate exactly as before.
- CI behavior unchanged (skip with no siblings present).

## Evidence

- On-disk frozen state: enhanced at `afebe00`, program at `4a5eb84`, both `status --porcelain` clean; `abb6add` is not a valid object name in the enhanced lineage.
- Pin edit in `tooling/gates/gate.ts` (land commit).
- Landing SHAs: record + pin edit landed PROPOSED in ff762be; full `bun run omega:gate` GREEN 2026-09-13 on ff762be (612/612 — the `fresh-tree` stage passes with the new pin, both trees clean at their pins) — ratified on that evidence.
- Gate green on the land commit (SHA cited at ratification).
