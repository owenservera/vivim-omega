# D-325 — Forbidden-overlay durability (vault ns `law`)

## Status

RATIFIED

## Context

`ForbiddenTable` (`plugins/vivim-law/src/forbidden.ts`) is a bare in-memory
`Map`. `agent.spawn@1` registers forbidden actions *before the identity exists*
so no tick can observe an unenforced agent — but a restart drops the table
silently, and previously-forbidden calls fall back to normal policy with no
operator signal. The law is otherwise fail-closed; this table fails open.

## Options

| Criterion | (a) Vault-journaled overlay, fail-closed set, boot reload (this record) | (b) Recipe amendment as the only durable path (status quo) | (c) Host-owned forbidden store |
|---|---|---|---|
| Restart direction | Fail-closed (denies survive; append failure aborts the set) | Fail-open (entries vanish silently) | Fail-closed |
| Host changes | Zero (plugin port calls only) | Zero | Requires `host/src` growth (breaks G11) |
| Silent-boot risk | None (UNLOADED reported in registry; reload names the missing dep) | Present (empty table, no signal) | None |
| Write path | Vault revision per set (journaled, attributable, revertable) | None | New authority outside the vault |

## Decision

**Decision:** (a) Vault-journaled overlay, fail-closed set, boot reload — falsifier: restart test green (set → reboot same dataDir → reload → still denies) + gate green.

## Consequences

- `forbidden.ts` gains pure helpers only (`forbiddenVaultId`, `toRecord`/`fromRecord`); `ForbiddenTable` API unchanged. Writer (`law.forbidden.set@1` append to ns `law`) and reader (boot reload + `law.forbidden.reload@1`) ship in the same commit with a real-boot round-trip test.
- `law.forbidden.set@1` append failure rolls the in-memory set back and throws DEGRADED — the spawn that triggered it aborts too. Clears append empty-`ops` tombstones so restarts reproduce the clear.
- Boot ordering: law is bootPhase 0, vault is bootPhase 1 — reload retries until the vault reports queryable; a composition granting vault caps with no vault boots UNLOADED and says so (registry `forbidden` block, typed DEGRADED naming `vivim.vault`).
- Composition invariant (asserted by the W1 net): a law entry with forbidden-persistence caps must co-boot `vivim.vault`. `agent.json` first; the rest audited via W1.
- ConsentTable parity (§6.1 amendment, doc-only, same commit): `ConsentTable` has the identical structural defect (memory-only, dropped on restart) and is deliberately NOT fixed here. The asymmetry justifies the scope: consent-loss fails *toward re-asking the user* (more friction, same safety direction), whereas forbidden-loss fails *toward silent permissiveness* (less safety). A future reader seeing "durability: done" must not assume both tables were addressed.
- `docs/VAULT-NAMESPACES.md` gains the ns `law` row in the same commit.

## Evidence

- `plugins/vivim-law/src/forbidden.ts`: `FORBIDDEN_NS`/`FORBIDDEN_ID_PREFIX`/`forbiddenVaultId`/`toRecord`/`fromRecord`.
- `plugins/vivim-law/src/index.ts`: vault-journaled set with rollback, boot reload with bounded retries, `law.forbidden.reload@1`, registry `forbidden` block.
- `plugins/vivim-law/test/forbidden-durability.test.ts`: restart round trip + vault-absent fail-closed + empty-overlay reload (3/3 green).
- `plugins/vivim-law/test/law.test.ts`: pure record-mapping suite (D-325 block).
- Falsifier run: `bun test plugins/vivim-law/test/forbidden-durability.test.ts` 4 pass / 0 fail; full `bun run omega:gate` GREEN 2026-09-13 (601/601 — ratified in 3f53afc).
