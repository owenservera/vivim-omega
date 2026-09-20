# D-428 — The development vault: omega:devault append-only hash-chained agent memory

## Status

RATIFIED

## Context

- Every development session starts from zero: lessons, patterns, and
  mistakes evaporate when the session ends. The program's own history
  lives in records (law) and the gate (evidence), but the working
  knowledge BETWEEN decisions — what tripped, what worked, what to avoid —
  has no home.
- The tree already reserved the seat: `.gitignore` carries `dev-vault/`
  and the gate's fresh-tree walk skips it — environment-local by design,
  anticipated before this record. The constitutional fit that reservation
  encodes: LAW IS COMMITTED (records, gates, the genome); MEMORY IS LOCAL
  (survives sessions on this box, never committed, never a substitute for
  a record).
- The evidence-class boundary (D-423/D-424) applies: this is the
  TOOLING-side ns.dev, filesystem state — not the runtime vault's
  namespace registry, which governs compartment persistence. Making it
  runtime-visible would be a D-424-class seam change, deliberately not
  crossed here.

Blocks: none

## Options

| Criterion | (a) Filesystem dev-vault/ with a hash-chained append-only ledger + verify/query/fold ops | (b) A vault namespace through the real runtime vault | (c) Append lessons to a committed doc |
|---|---|---|---|
| Survives sessions, local-first | Yes — dev-vault/ persists on the box, gitignored per the existing reservation | Yes, but the runtime vault is compartment evidence — wrong class for tooling memory | Committed = law; lessons are not law |
| Tamper-evident | Yes — sha256 chain; an edited or deleted entry is DETECTED (DEV_CHAIN_BROKEN), extending a broken chain is refused | The vault's own chain, heavier than needed | Git history, wrong tool |
| Evidence-required | Yes — an uncited lesson is an opinion (DEV_EVIDENCE_REQUIRED) | Enforceable but foreign | Unenforced |
| No new write path / grants | Yes — pure filesystem tooling | No — composition grants, a real seam change (D-424 territory) | Yes |
| Zero host LOC | Yes | No | Yes |

## Decision

**Decision:** (a) — `tooling/gates/devvault.ts`, in substance:

- **Rows** (`dev.entry@1`): `{ id: <yyyymmdd>-<slug>, type:
  lesson|pattern|mistake|note, at, agent, context, statement,
  evidence[], appliesTo[], retention: dev-vault-permanent }` — one JSON
  file per entry under `dev-vault/entries/`.
- **Append-only with a witness**: entries are written ONCE
  (DEV_ENTRY_EXISTS on collision); `dev-vault/ledger.json` chains each
  entry's sha256 to the previous head. Local files can always be edited by
  whoever owns the box — the chain DETECTS it (hash mismatch, broken prev
  link, orphan file), and extending a broken chain is refused: repair
  first, the chain is the witness.
- **Evidence-required**: every entry cites at least one resolvable
  artifact (a D-id, a file path, a URL) — enforced at record time and
  re-checked at verify time.
- **Ops**: `omega:devault add "statement" --type … --context … --evidence
  a,b --applies x,y` · `verify` (the chain walk) · `query <text>`
  (case-insensitive over statement/context/appliesTo) · `fold`
  (dev-vault/knowledge.md — a pure fold of the chained entries, derived,
  never hand-edited).

## Consequences

- Session-to-session memory exists without polluting law: the dev-vault
  never gates, never ratifies, never substitutes for a record — a lesson
  that matters constitutionally graduates into a D-record through the
  existing process, citing its dev-vault entry as context.
- The chain is tamper-EVIDENT, not tamper-PROOF (stated plainly): a
  determined local actor can rewrite entries AND the ledger — what they
  cannot do is make the rewrite unnoticed by verify. Honest containment,
  the D-321 stance.
- The fold gives the next session an onboarding digest: load the genome
  (state), read the fold (wisdom), run the plan (next actions).
- Zero host LOC; writes only under dev-vault/; never committed.

## Evidence

- `tooling/gates/devvault.ts` (new — parseEntry, verifyDevVault, recordDevEntry, queryDevVault, loadDevEntries, foldDevVault), `package.json` gains `omega:devault`.
- Falsifiers, green in this record's tree BEFORE the flip per D-364:
  - F-DEVAULT.1 (append-only-witness) — the chain detects an edited entry (hash mismatch, named file) and a deleted one (missing chained entry); extending a broken chain is refused.
  - F-DEVAULT.2 (evidence-required) — an entry with no citations is refused DEV_EVIDENCE_REQUIRED at record time and flagged at verify time.
  - F-DEVAULT.3 (fold-derived) — knowledge.md is a pure fold of the chained entries: same entries ⇒ byte-identical fold.
  - F-DEVAULT.4 (query-precision) — query returns exactly the entries whose statement, context, or appliesTo match, case-insensitive; non-matching entries never surface.
- Self-host, exercised in this record's own round: the wave's own working
  lessons (the docscan backtick discipline for paper ids, the registry
  collision handling, the falsifier-clause line shape) are recorded as the
  vault's first chained entries via `omega:devault add`; `verify` walks
  the chain green; `fold` renders them.
- Precedents: D-423 (the evidence-class boundary), D-424 (the seam NOT
  crossed), D-410 item C (append-only history discipline), the
  pre-existing `.gitignore` reservation.

- Ratified on greens (evidence-class, F-DEVAULT.1..4 green in this record's tree BEFORE the flip per D-364): landing commit 083739b; full gate green 1232/0 ×2 on the PROPOSED tree (2026-09-20T22:24:15Z and 22:25:53Z); the vault's first three chained entries recorded and verified live in this record's own round (the wave's working lessons: the backtick law, the clause-line law, the evidence-kind law); the checker clean, docscan 0 findings; zero host LOC; anvil untouched.

## Index

summary: ns.dev as environment-local tooling state in dev-vault/ (gitignored by pre-existing reservation): entries are written once, hash-chained in a ledger that makes tampering detectable, evidence citations are mandatory, and the knowledge fold is derived
rationale: Sessions start from zero and lessons evaporate; the tree already reserved the seat (.gitignore carries dev-vault/) — law is committed, memory is local, and an uncited lesson is an opinion
class: evidence
