# W2 — Provider Stratum (16 providers as realizations)

**Objective:** every legacy provider as a governed realization. API_NATIVE wherever a real API exists; BROWSER_MEDIATED where automation is the product.
**Consumes:** T-01, T-02, T-03, T-07 (admission list), T-08 (governor restructure), GAP-M4 (launch scope + bar), W1 fixtures.
**Order:** Ollama (`API_NATIVE`, local, no auth quirks — M-TRIAGE-01 §3 pilot candidate) → least-defended browser surface per import-parser fixtures → remainder by fixture availability, never by live-network convenience.

## Tasks

1. Per provider: realization row (ns `providers`) + handler + `ProviderClass` + stream config (M1 shape) + LAW_POLICY exact rows + forbidden entries (browser only, day one).
2. Launch mode (W0 scope → code): per-OS lifecycle via `platform/`, packaging, manifest budgets (`runtime.budget`), watchdog coverage.
3. Stealth T-07 file-by-file: each file admitted with a law reason or refused with a reason; admitted files carry forbidden-overlay entries from the same commit.
4. Governor T-08: control-loop logic rebuilt against capability tokens (concept preserved, authority replaced).
5. Registry: `deriveRegistry()` gains real callers; `vivim.providers` ships in the compositions that need it (via generator).

## Falsifier (per provider, all must hold)

One fixture-recorded message through the realization, gated by `law.check@1`, streamed, ledgered, `vivim.mind`-queryable — plus one forbidden action refused + ledgered (browser providers). No live-network calls in tests, ever.

## Non-goals

No chat UX. No multi-user. No auto-routing. No fourth `ProviderClass` member (D-306 reservation stands until a harness provider exists in-repo).
