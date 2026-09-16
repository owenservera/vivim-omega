# Base Delta — Old M-plan Base vs Turn-015 Recovered Base

Precise record of what the fresh assessment assumed differently from `vivim-kernel-auto/MASTER/Migration/`.

## Sources

- Old: `OMEGA-LEGACY-MIGRATION-PLAN.md` (142 lines, M0–M4 + pilot + scale-out + frontend + cutover), `M-TRIAGE-01.md` (64 lines, T-01–T-18), `OMEGA-AGENT-BRIEF-FRESH-CONTEXT.md` (161 lines, Tasks 1–4 + baseline 612 tests / host 984).
- New: `clone-omega` @ `61d1a41`, `docs/BUILD-DECISIONS.md` (D-210–D-372), `docs/ARCHITECTURE-NEXT-STEPS.md`, `docs/VAULT-NAMESPACES.md` (13 namespaces), `docs/KNOWN-LIMITS.md` (L-1–L-13), `docs/decisions/OPEN-QUESTIONS.md` (6 open), `BENCHMARKS.md`, 16 compositions, 21 plugin dirs, 17 contract files, `sdk/src` (6 files incl. `stream.ts`), `tooling/{watchdog,ci,gates}`.

## Line-by-line delta on M-plan claims

| M-plan claim | Status on new base | Evidence |
|---|---|---|
| "M0 has zero implementation" (§3 M0) | **SUPERSEDED — implemented (D-357)** | `plugins/provider-browser/src/{index,session,parsers}.ts` + `compositions/browser.json` + D-357 record |
| "port.call is single request→response, no streaming" (§3 M1) | **SUPERSEDED — implemented (D-352)** | `contracts` StreamChunk + `checkStreamSeq`, `sdk/src/stream.ts` (`streamRootCall`), `echo.stream@1`, D-352 record |
| "vault proven at demo scale, never at chat-history scale" (§3 M2) | **PARTIALLY SUPERSEDED** — pilot writer exists (D-358), scale still open (L-4) | `plugins/vivim-chat`, ns `chat` row, L-4 total-ns scan limit |
| "principal model is agent:<id>/director/root only" (§3 M3) | **SUPERSEDED — implemented (D-353)** | `PrincipalKind`, `law.describe@1`, law 0.2.0 in 13 compositions |
| "resolution collision needs a ruling" (§3 M4) | **SUPERSEDED — ruled + wired (D-337 + D-359)** | `chat.resolve@1` + shared `resolve.classify@1`, `contracts/surface.ts` |
| "pilot falsifier: CLI message → streamed response → ledgered → mind-queryable" (§4) | **PARTIALLY MET** — chat pilot boots, streaming + storage + resolution wired; provider is `provider-llm` (simulator/live), not yet BROWSER_MEDIATED end-to-end at 16-provider scale | `compositions/chat.json` + `llm.json` + `browser.json` (three separate compositions, not yet one pilot composition) |
| "Phase 4 scale-out repeats Phase 3 pattern" (§5) | **STANDS, with new precondition** — daemon (D-322), cache (D-330), lazy (D-331) all landed; deferred pool (D-329) landed; but 16-spec freeze (D-370) now caps composition growth | D-329/D-330/D-331 records + D-370 freeze |
| "point existing frontend at omega over HTTP" (§6) | **STANDS, narrower** — `surfaces/web` + `surfaces/mcp` + `surfaces/cli` exist; console assumes cooperative local user; multi-user auth still open | `docs/SURFACES.md`, L-11 |
| "triage over per-file YAMLs" (§2) | **REINTERPRETED (already done in M-TRIAGE-01 §0)** — no 2,398-row table on disk; subsystem map is the working index | M-TRIAGE-01 §0 + §2 counts (200 Prisma models, 3 provider plugin files) |
| "migration-table.yaml K-001 rows" (§2 pointer) | **STALE POINTER** — file does not exist on the new base (it lived in the legacy tree, not in Omega); T-series is the live index now | Absent in `clone-omega`; carried in `30-TRIAGE/` here |
| "host wall 984/1000" (brief §4.2) | **STALE — now 911/1100** (D-365 raised, D-372 extracted platform) | `host/src` 8 files, 911 lines measured 2026-09-16 |
| "612 tests" (brief §3) | **STALE — ~733** | `build/status.json` lineage + gate-refresh commits |

## What the old plan got right (carry forward verbatim)

1. Omega wins; kernel-plugins target retired (D-333). No reopen.
2. HARVEST-not-MIGRATE as dominant verdict; REMOVE for EventBus/ModuleRegistry/Prisma-runtime/tar.gz-install.
3. Pilot-then-scale; no faked mechanism; frozen legacy; tooling rewrite before orchestration.
4. M0 authority-first (forbidden-overlay day one) — D-357 honors it.
5. Streaming additive-with-cold-fallback — D-352 honors it.

## What the old plan could not have known (new obligations)

1. **Composition freeze** — the plan assumed unbounded new compositions; D-370 forbids them. Wave0 must specify generation.
2. **Parser-as-data governance** — the plan assumed harvested algorithms become plugin ops; D-354/D-355 say parsers become **signed version-pinned data**, not routable ops.
3. **Credentials spine** — the plan has no credential story; D-356 is now the mandatory path for keys/profiles.
4. **Risk parity net** — the plan predates D-351; every migrated MUTATION now needs an exact LAW_POLICY row + parity coverage from first boot.
5. **Platform seam** — the plan predates D-361/D-371/D-372; every OS-touching harvest must go through `platform/` + `${TMP}` spelling.
6. **Watchdog + reproducibility** — the plan assumes manual gate discipline; D-360/D-362 mechanize containment + claim-reproduction. Migration waves inherit both (budgets in manifests, status citations in ratifies).
