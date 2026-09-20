# Vault Namespaces (A6)

One row per namespace: owner plugin, object shapes, writers, retention. New namespaces
get a row here *in the same commit that first writes them* — an undocumented namespace
is a namespace nobody can compact, query, or trust.

Conventions both writers and readers obey (enforced by `vivim.vault`, not by convention):
refs are `{ns, id, rev}` with integer rev ≥ 1 (`validate.ts` rejects anything else);
compaction never deletes a revision cited by a live object's refs; the changelog is
append-only forever while object revisions are latest-wins (hot) + cold fallback.

## Worked example: audit log vs current state (D-319)

Promotion of a candidate produces TWO writes with different retention needs:
- `discovery` ns, `promotion:<runId>` — the audit event (proof chain: probes, policy,
  gaps). Append-only forever; never updated, never compacted away while cited.
- `providers` ns, `realization:<archetype>:<provider>` — the current state (latest
  status). Latest-wins; each new verdict supersedes by new revision.
The realization cites the promotion event in its refs. Collapsing these into one
write would force a choice between auditability and freshness — hence two objects.

## The rows

| ns | Owner | Object ids | Writers | Retention |
|---|---|---|---|---|
| `email` | provider.email-file | message ids (`msg_*`), `capture:*` (spans) | provider (receive/send), director tick reads | Messages accumulate; `seen`/folder are data revisions, never deletes |
| `automation` | vivim.director | `rule:*`, `fired:*` | director (rules, tick ledger) | Ledger rows are authority (no-refire); kept while any rule lives |
| `nlcl` | vivim.director | `lexicon:*` | director.teach | Survives plugin swaps by design (D-218) |
| `discovery` | discovery-* engines | `candidates:*`, `mapping:*`, `promotion:*`, `graph:*`, `capture:*`, `trace:*`, `observation:*` | infer/map/verify/perceive/observe | Promotion events append-only (proof chain); graphs/captures cited by evidence refs (compaction honors) |
| `agent` | vivim.agent | `agent_*` identities, `exec:*` per-attempt ledger (`exec:<causationId>`) | agent.spawn (identities), agent.exec (ledger rows: admittedContractRev + quarantinedMidFlight + decision, settled and refused alike — D-327) | Append-only; lineage refs must resolve (dangling parents refused at write); exec rows kept while their agent lives |
| `behavior` | vivim.agent | contract ids (multi-rev: staged→active→quarantined) | propose/promote/rollback | All revs kept (rollback walks history; quarantine never deletes) |
| `decision` | vivim.agent | `dec-*` genealogy records | decision.record | Append-only; parent refs must resolve at write (G0 §4) |
| `providers` | vivim.providers (reads), discovery.verify/healing (writes) | `realization:<archetype>:<provider>` | verify (PROMOTED/REQUIRES_REDISCOVERY/TESTING); healing (DEGRADED/TESTING) | Latest-wins current state; cites `discovery` promotion events (see worked example) |
| `probe` | tests only | `p*` seeded proof records | test harnesses | Ephemeral; never read by product code |
| `law` | vivim.law | `forbidden:<principal>` (D-325: per-principal forbidden-action overlay records `{principal, ops, updatedAt}`) | vivim.law (forbidden.set appends after the in-memory set — append failure aborts the set fail-closed; boot reloads once the vault is queryable) | Latest-wins per principal; empty-`ops` tombstones preserve clears across restarts |
| `resolve` | vivim.director | `resolve:<decisionId>` (D-323: decision rev 1 `{decisionId, kind, capability, branch, reason, evidenceRefs, buildDecisionRef: "D-323"}` + outcome rev 2 `{status, execMs}`) | resolve.classify (rev 1) + resolve.report (rev 2); strategy.scorecard reads; vivim.chat writes chat-originated DETERMINISTIC verdicts (rev 1 only, D-359 — the ambiguous half's rows stay the director's) | Two revs of one object (verdict then outcome); ids without outcomes are decided-but-unreported |
| `control` | vivim.agent (writes), vivim.mind (reads) | `delegation:<childId>` (D-328b handoff envelopes), `evolution:<contractId>` (D-328b proposal→evaluation→promotion/rollback mirrors) | agent.delegate (delegations); evolution.propose/evaluate/promote/rollback (evolution log); control.describe counts `evolution:` rows | Latest-wins per id; behavior mechanics stay in ns `behavior` (control mirrors genealogy, never authority) |
| `intent` | vivim.intent | `intent:<hex>` (multi-rev: submitted→resolving→planned→awaiting_approval→executing→succeeded\|failed\|rejected\|cancelling\|cancelled) | intent.submit (rev 1), intent.resolve/step.execute/cancel (later revs) | All revs kept — audit trail; cites resolve/law/plan refs | 
| `intent-plan` | vivim.intent (writer: explicitly authorized plan-authoring path only — never a bare `intent.*` op) | `plan:<type>@<planVersion>` (immutable once promoted; versioned by promotion only) | Plan-authoring plugin/console only (narrower writer set than `intent`) | All revs kept forever — in-flight intents may cite specific plan revisions years later; templates never edited in place |
| `chat` | vivim.chat | `conv:*` (conversation rows, latest-wins), `msg:*` (messages, append-only ledger; D-358: `{id, conversationId, role, seq, content, providerId?, realizationRef?, streamRef?, createdAt}` — realizationRef = producing realization, streamRef = M1's chunk envelope when streamed), `idx:*` (D-378: per-conversation writer-maintained index rows `idx_<hex>`, latest-wins `{conversationId, count, entries:[{id, seq}]}`, bounded by CHAT_HISTORY_CAP, same-append-critical-section as the message), `refusal:*` (D-379: principal-refusal ledger rows `{conversationId, owner, caller, op, at}`) | chat.open (conversations), chat.append (messages + index rows), chat.history (reads + refusal ledger on fenced reads); chat.resolve writes ns `resolve`, never ns `chat` verdicts twice | Retention windows DECLARED per D-378: conversations hot 180d; conv superseded revs cold after 90d; refusal rows 400d; messages bound by CHAT_HISTORY_CAP=200/conversation (fail-closed refusal at cap on the indexed path — never silent truncation); mechanical enforcement of the windows is Wave3 with the full index build. Cross-principal reads refuse (REFUSED verdict) + ledger, never degrade (D-379) |
| `proposal` | forge.author (Wave 0, D-406; the future forge.emit.* emitters join as writers by amendment) | `file:<pluginId>/<path>` (one row per emitted file, latest-wins: pack.builder `proposal-artifact` shape `{schemaVersion, targetPath, artifactKind, contentHash, generatedBy, ledgerRef, authority, justification}` — `authority` is schema-pinned `"none"`, the row CANNOT carry authority) | forge.author.init@1 (append + read-back verify, one row per emitted file; the op refuses fail-closed if any row does not read back byte-identical) | Proposal ledger: append-only in effect (latest-wins per file id on re-emission of the same spec); rows cite `decision:D-406`; nothing in ns `proposal` is authority — emission confers none, promotion is a separate human decision (forge.tier's Wave 1+ scope); boot never reads this ns |

## Not vault namespaces (common confusion)

- `law-journal.jsonl` — a FILE on disk via `host.journal.append`, not a vault ns.
  The law's journal is replayed at boot; vault verification does not cover it.
- `dev-vault/*` — local dev persistence for shipped compositions, not a namespace.

## Open questions

- Retention policy for `email` at scale (per-folder keep windows?) — undecided, no pressure yet.
- ~~`healing` writes to `providers` are specified (A4 remainder) but not yet implemented.~~ Closed by D-326: `discovery.heal@1` appends `realization:<archetype>:<provider>` with `DEGRADED` (drift, no admissible candidate) or `TESTING` (probation entry), superseding the prior rev and citing the drift observation; `none`/`promote` write nothing (verify owns promotion).
- Session bookkeeping (`session:<uuid>` in ns `providers`) is deferred with its consumer.
