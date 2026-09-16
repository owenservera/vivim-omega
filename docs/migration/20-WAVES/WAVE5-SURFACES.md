# W5 — Surfaces (web console, CLI, MCP, desktop)

**Objective:** existing product surfaces pointed at Omega, decided last not first.
**Consumes:** T-17 (frontend KEEP-not-yet-migrated), GAP-M3 boundary, W2–W4 backends.
**Default (M-plan Phase 5, unchanged):** point the existing Next.js frontend at Omega surfaces over HTTP (web console service, extended). Rebuild only on proven shape mismatch (streaming M1 shape or auth M3 shape the frontend genuinely cannot speak — proven by a failing integration, not by anticipation).

## Tasks

1. Web console → Next.js pointer: `surfaceOpMeta` derivation shared (A2 — MCP already refactored in D-359; web + CLI follow, no third derivation).
2. CLI/MCP parity: same capability set, same law gate, same consent flows; daemon warm path + cold fallback both exercised.
3. Tauri shell decision: reuse vs thin wrapper — scope is packaging + `platform/` lifecycle + forbidden policy for shell-granted ops. No shell code until the decision record exists.
4. Multi-user hardening: cooperative-local-user assumption → authenticated `user:<id>` (credentials spine + consent + `law.describe`); console dataDir `${TMP}` spelling via generator.
5. Keystroke-latency check: browser nlcl-pure local parse ≈ server parse (N1 — same bytes); execution always the server's parse.

## Falsifier (M-plan pilot falsifier, unchanged)

A person types into the existing frontend (CLI-as-stand-in until the pointer lands) and gets a real streamed response from one real provider through the law gate, ledgered + `vivim.mind`-queryable.

## Non-goals

No UI rebuild for aesthetics. No new auth model outside law/consent. No new composition per surface variant (generator).
