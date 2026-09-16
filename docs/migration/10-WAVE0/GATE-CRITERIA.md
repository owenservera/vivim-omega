# Wave0 Gate Criteria — exact commands + evidence checklist

Run these in `clone-omega` (not here). Append outputs to `40-EVIDENCE/`.

## Commands (Windows: serial lanes, 60s timeout on bare `bun test`)

```powershell
$env:OMEGA_TEST_CONCURRENCY=1
bun install
bun test --timeout 60000              # expect all green (baseline ~733; record actual)
bun run omega:quick                   # structural stages, seconds
bun run omega:gate                    # full gate, minutes; expect {"ok": true}
bun run omega:bench                   # append walls; do NOT commit bench noise here — copy the delta to 40-EVIDENCE/
git diff --stat -- host/src           # expect EMPTY (Wave0 adds zero host lines)
Get-Content build/status.json | ConvertFrom-Json | Select-Object ok, hostLoc
```

## Expected

- `ok: true`, `failed: 0`, `hostLoc` unchanged from Wave0 entry (record entry number here: ____/1100).
- `✓ fresh-tree` or `○ fresh-tree: skipped` with a stated reason (siblings absent on this box — skipped is honest, never green-or-red; do not force siblings into place for Wave0).
- `decisions` stage green (7 new PROPOSED rows well-formed, board regenerated same-branch).
- New stage (conformance net) green on current tree + red on seeded drift (keep the seed script in `40-EVIDENCE/`).

## Evidence checklist (append to 40-EVIDENCE/ per run)

- [ ] `gate.json` (full `omega:gate` stdout + `build/status.json` excerpt: ok/failed/hostLoc/tests/waves)
- [ ] `bench-delta.md` (append-latency vs ns-size table + boot/RTT walls)
- [ ] `boot.log` (one real boot of `chat.json` + one of `browser.json`, resolved vault paths visible)
- [ ] `host-diff.txt` (`git diff --stat -- host/src` output — must be empty)
- [ ] `decisions-diff.txt` (`git status --short docs/decisions/` + board diff)
- [ ] Landing SHA + run-URL (or local-run attestation) per D-362 citation discipline
