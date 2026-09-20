# D-430 — The session ledger: timestamped stream capture, structured retrospective, and the publish gate

## Status

RATIFIED

## Context

- The program is developed 100% by AI agents, and every session evaporates
  on exit: the work survives (commits, records) but the STREAM does not —
  what was attempted, in what order, how long each phase took, what was
  red before it was green. The dev-vault (`D-428`) holds curated lessons;
  nothing holds the raw session, and nothing forces the curation to happen
  at the moment the memory is richest (session close).
- The owner directed (2026-09-22): "the agent should keep a full session
  copy of the stream log, then before closing the session and publishing
  the bundle it should have a structured and ideally automated lessons
  learned that will boost development speed and accuracy" — and, mid-wave,
  "we need timestamps so we can identify bottlenecks."
- The tree already has every ingredient: `.gitignore` reserves
  environment-local state (`dev-vault/`), `build/gates.log` is a
  timestamped JSONL of every gate run, the round-close ceremony
  (`D-414`) is the publish moment, and the dev-vault is the lesson store.
  What is missing is the INTAKE PROTOCOL: a session shape that begins,
  streams, and closes — with the close wired into publish.

Blocks: none

## Options

| Criterion | (a) sessions/ store: begin/log/import/close + chain + round-close refusal | (b) Lessons appended ad hoc to the dev-vault at session end | (c) Commit session logs into the tree |
|---|---|---|---|
| Full session copy, survives exit | Yes — sessions/ is environment-local, one envelope per session, hash-witnessed | No — only curated lessons survive; the stream is lost | Yes but law pollution: streams are memory, not law (the D-428 boundary) |
| Structured retrospective, enforced | Yes — close refuses without ≥1 evidence-cited lesson; round-close refuses while a session is open | Unenforced — the agent may skip it exactly when tired | Enforceable but the wrong gate (publish ≠ commit) |
| Timestamps → bottleneck identification | Yes — every event carries at + tMs (monotonic, regress refused), ops may carry durationMs, gates.log auto-imports; close derives a mechanical bottleneck report (kind shares, top silence gaps, slowest ops) | No timing data at all | Yes, but same as (a) without the commit |
| Tamper-evident | Yes — per-line sha256 chain over the serialized event INCLUDING its timestamps; closed envelopes digest-pinned in an index | The dev-vault chain alone | Git history, wrong tool for local memory |
| Zero host LOC / no new write path | Yes — tooling/ + local state only | Yes | Yes |

## Decision

**Decision:** (a) — `tooling/gates/session.ts`, in substance:

- **Store** (environment-local, gitignored under `sessions/`): `open.json`
  (the single open session: `{id, mission, agent, beganAt, beganAtMs}`),
  `stream.jsonl` (append-only event lines), `stream.chain.json` (one
  sha256 link per line, chained; the witness), and after close
  `closed/<id>.json` envelopes digest-pinned in `closed/index.json`.
  LAW IS COMMITTED, MEMORY IS LOCAL — the same boundary `D-428` drew.
- **Events** (`session.event@1`): `{at: ISO, tMs: ms-since-begin, kind:
  plan|code|test|gate-run|decision|repair|note|block|unblock, note,
  data?}`. Every event is time-stamped twice: wall clock for reading and
  ordering, `tMs` for duration math. A regressed `tMs` is REFUSED
  (SESSION_TIME_REGRESS — a wall-clock step is a fact to surface, never
  silently absorbed); the chain hashes the full serialized line, so
  backdating an event after the fact is DETECTED.
- **Ops**: `begin --mission --agent` (refused while a session is open —
  SESSION_OPEN_EXISTS names the open one) · `log --kind --note
  [--data-json]` · `import --gates` (ingests `build/gates.log` rows that
  fall inside the session window as `gate-run` events — the heaviest
  operation captured automatically, no agent discipline required) ·
  `report` (live bottleneck report mid-session) · `close` (the ceremony) ·
  `verify` · `status` · `context` (the next session's onboarding digest:
  last envelope + its bottleneck lines + lesson ids).
- **The structured retrospective at close**: close refuses an empty stream
  (SESSION_EMPTY_STREAM) and refuses zero lessons
  (SESSION_RETROSPECTIVE_REQUIRED). Each lesson graduates to the dev-vault
  through the EXISTING `recordDevEntry` (idempotent on identical
  statements, so a failed close is retriable); the envelope cites the
  vault ids. The bottleneck report is DERIVED (pure function of the
  events): wall duration, per-kind counts and cumulative explicit
  durations, the top silence gaps (inter-event time — the rework/thinking
  friction, each named with its surrounding notes), and the slowest
  explicit ops — so the lessons are written against measured friction,
  not vibes.
- **The publish gate**: round-close's preflight gains a session fact —
  it REFUSES while a session is open (with the open id, mission, and
  event count named), refuses a broken session store, and is green only
  when no session is open and verify is green (or no store exists). No
  retrospective, no bundle. The next-round entry block tells the entering
  agent to begin a session FIRST — the loop closes.

## Consequences

- Sessions become first-class: every agent touching this repo works inside
  a witnessed, time-stamped stream, and the bundle is cut only after the
  retrospective — development speed and accuracy compound because the
  friction is NAMED (top gaps, slow ops) and the lessons are CITED, not
  remembered.
- The report measures what the ledger holds: inter-event gaps, explicit
  `durationMs`, per-kind counts. It does NOT guess unlogged work — honest
  by construction; the fix for a thin report is logging, not inference.
- `tMs` is wall-clock-derived (each CLI call is a process; no cross-process
  monotonic clock exists) — NTP steps inside one session can skew it; the
  regress refusal makes the skew visible instead of silent, and gap math
  at minute granularity is unaffected. Stated plainly, not hidden.
- Closed envelopes are tamper-EVIDENT, not tamper-PROOF (the D-321/D-428
  stance): whoever owns the box can rewrite; verify re-derives every
  digest and names the lie.
- The dev-vault gains a feeder: session close is now the primary intake,
  and a lesson that matters constitutionally still graduates to a D-record
  through the existing process (the vault is never a substitute for law).
- Zero host LOC; writes only under `sessions/` (local) and `dev-vault/`
  (via the existing op); never committed; no runtime seam crossed.

## Evidence

- `tooling/gates/session.ts` (new — the store, the chain, the ops, the
  pure bottleneck fold), `package.json` gains `omega:session`;
  `round-close.ts` gains the session preflight fact + refusal + the
  next-round session-discipline step; `process.ts` reports session state
  (report-only, the D-423 discipline); `entry.ts` prints the session line
  and the begin-first pointer; `AGENTS.md` gains the law;
  `.gitignore` reserves `sessions/`; `genome/layers.json` adds Ω-DEV.6.
- Falsifiers, green in this record's tree BEFORE the flip per D-364:
  - F-SESSION.1 (single-open) — begin is refused while a session is open, naming the open session; after close, a new begin opens a distinct session.
  - F-SESSION.2 (append-only-witness) — the chain detects an edited event line, a deleted line, and a tampered closed envelope; appending to a broken chain is refused; logging after close is refused.
  - F-SESSION.3 (time-stamped-events) — every event carries a parseable ISO `at` and a non-negative `tMs`; a regressed `tMs` is refused SESSION_TIME_REGRESS; editing only an event's `at` breaks the chain (the timestamps are inside the witness).
  - F-SESSION.4 (publish-gate) — round-close's preflight refuses an open session and a broken store by name; green only with none open + verify green + store absent tolerated.
  - F-SESSION.5 (structured-retrospective) — close with zero lessons is refused and nothing is sealed; close with lessons graduates each to the dev-vault (idempotently — a pre-existing identical statement reuses its vault id), and the envelope cites the vault ids.
  - F-SESSION.6 (bottleneck-report) — the report is a pure fold of the events: wall duration, per-kind counts/cumulative durations, top silence gaps sorted desc with their surrounding notes, slowest explicit ops; degenerate inputs degrade honestly, never crash.
- Self-host, exercised in this record's own round: the wave that builds
  the ledger opens its session at tool completion (the bootstrap is
  stated, not backdated — the pre-tool design work is logged as a `note`
  event at its honest `at`), streams the implementation and gate events,
  imports `build/gates.log`, and closes with the wave's real lessons
  graduated to the dev-vault; `omega:round-close` for THIS bundle runs
  only after that close — the publish gate dogfooded on its own landing
  wave.
- Precedents: `D-428` (the store this feeds; the law-committed /
  memory-local boundary), `D-414` (the publish ceremony this gates),
  `D-423` (the evidence-class boundary), `D-426` (the falsifier-first
  loop this record rides), the owner directives of 2026-09-22 (the
  session stream + structured lessons; the timestamps for bottleneck
  identification).

- Ratified on greens (evidence-class, F-SESSION.1..6 green in this record's tree BEFORE the flip per D-364): landing commit 93cf286; full gate green 1247/0 ×2 on the PROPOSED tree (2026-09-20T23:22:19Z and 2026-09-20T23:23:56Z; the prior tip's 1232 + 15 new); the wave's own session opened at tool completion (20260920-232544, bootstrap stated in-stream at its honest `at`, never backdated) and closed with the retrospective before `omega:round-close` cut the bundle — the publish gate dogfooded on its own landing wave; the tooling caught its own program mid-wave (the deletion witness naming its line range, the stale genome fold + pass-5 pin flagged by the first full gate); the checker clean, docscan 0 findings; zero host LOC; anvil untouched.

## Index

summary: sessions/ as environment-local stream memory: begin/log/import/close with chain-witnessed timestamped events, a derived bottleneck report, lessons that graduate to the dev-vault, and a round-close that refuses while a session is open
rationale: The program is developed 100% agentic and every session evaporates on exit; the owner directed a full session stream copy plus structured automated lessons learned that boost development speed and accuracy, with timestamps to identify bottlenecks
class: evidence
