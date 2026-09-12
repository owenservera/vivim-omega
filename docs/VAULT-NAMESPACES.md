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
| `agent` | vivim.agent | `agent_*` identities | agent.spawn | Append-only; lineage refs must resolve (dangling parents refused at write) |
| `behavior` | vivim.agent | contract ids (multi-rev: staged→active→quarantined) | propose/promote/rollback | All revs kept (rollback walks history; quarantine never deletes) |
| `decision` | vivim.agent | `dec-*` genealogy records | decision.record | Append-only; parent refs must resolve at write (G0 §4) |
| `providers` | vivim.providers (reads), discovery.verify/healing (writes) | `realization:<archetype>:<provider>` | verify (PROMOTED/REQUIRES_REDISCOVERY/TESTING); healing (DEGRADED/TESTING) | Latest-wins current state; cites `discovery` promotion events (see worked example) |
| `probe` | tests only | `p*` seeded proof records | test harnesses | Ephemeral; never read by product code |

## Not vault namespaces (common confusion)

- `law-journal.jsonl` — a FILE on disk via `host.journal.append`, not a vault ns.
  The law's journal is replayed at boot; vault verification does not cover it.
- `dev-vault/*` — local dev persistence for shipped compositions, not a namespace.

## Open questions

- Retention policy for `email` at scale (per-folder keep windows?) — undecided, no pressure yet.
- `healing` writes to `providers` are specified (A4 remainder) but not yet implemented.
- Session bookkeeping (`session:<uuid>` in ns `providers`) is deferred with its consumer.
