# Runbook — Fresh Boot (clone-omega on Windows)

```powershell
# one-time
npm install -g bun
bun --version   # >= 1.3.14

# every session
$env:OMEGA_TEST_CONCURRENCY=1
Get-Process bun -ErrorAction SilentlyContinue | Stop-Process -Force  # kill orphans (leaked workers poison benches)
bun install                     # regenerates workspace symlinks; never copy node_modules
bun run omega:quick             # structural, seconds
bun test --timeout 60000        # full suite (serial lane discipline)
bun run omega:gate              # full gate + build/status.json + gates.log
```

**Notes:** `/tmp/…` works drive-relative but `${TMP}`/`omegaTmp()` is the portable spelling (D-372). `chmod` best-effort (ACLs). CRLF warnings are `.gitattributes` working. Known soak flakes (MCP `uv_spawn`, multi-GB worker crash) reproduce on clean tree — clean slate + serial lanes; Linux CI arbitrates merges. Bare refspec pushes (branch and tag share names — use full `refs/heads/…` / `refs/tags/…`).
