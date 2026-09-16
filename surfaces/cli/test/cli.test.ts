// GATE-Ω6 evidence (CLI surface) — spawn the real CLI as a child process with a
// temp vault and a minimal composition (law-stub + echo, fixtures/echo.json).
// The proof: an external trigger (a shell command) drives the booted composition
// through the µhost's public API only — compile+pin+boot via bootWithRecovery,
// calls as root principal — with honest exit codes and honest REFUSED printing.
import { describe, test, expect } from "bun:test";
import { mkdirSync, rmSync, existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { startDaemon, type DaemonHandle } from "../../daemon/src/daemon.ts";
import { callDaemon, readDaemonInfo } from "@vivim/daemon-client";
import { omegaTmp, retryOsLock } from "@vivim/omega-platform"; // D-372 Phase 3: scratch through the seam

const CLI = join(import.meta.dir, "../src/cli.ts");
const ECHO_SPEC = join(import.meta.dir, "fixtures/echo.json");
const RISK_SPEC = join(import.meta.dir, "fixtures/risk.json");

/** Unique temp vault per case (surfaces boot + pin real recipes into them). */
function tempVault(name: string): string {
  const v = omegaTmp("omega-cli-test", `${name}-${Date.now()}-${Math.floor(Math.random() * 1e6)}`);
  rmSync(v, { recursive: true, force: true });
  mkdirSync(v, { recursive: true });
  return v;
}

interface CliRun { stdout: string; stderr: string; code: number }

/**
 * Spawn+boot wait budget. Each runCli boots a full composition in a child `bun`
 * process — under full-suite parallel load that can exceed Bun's 5s default
 * test timeout (the email-composition tests spawn three times). The ceiling
 * rises; no assertion changes (happy path still fast).
 */
const SPAWN_BUDGET_MS = 30_000;

async function runCli(args: string[], timeoutMs = 30_000, opts: { daemon?: boolean } = {}): Promise<CliRun> {
  // --no-daemon ALWAYS in this suite (except the explicit warm-parity test below):
  // these tests are gate evidence for the COLD path, and must never silently
  // route warm (which would also leak a persistent daemon per temp vault).
  // Pass { daemon: true } ONLY to deliberately exercise the warm path.
  const fullArgs = opts.daemon || args.includes("--no-daemon") || args[0] === "daemon" ? args : [...args, "--no-daemon"];
  // Same soak hardening as the MCP suite (D-368): Windows can refuse spawns
  // after hundreds of worker/process spawns in a long run — bounded sync retry,
  // same shared helper; a genuinely broken command still throws after budget.
  const proc = retryOsLock(() => Bun.spawn(["bun", "run", CLI, ...fullArgs], { stdin: "ignore", stdout: "pipe", stderr: "pipe" }), {
    tries: 5,
    baseMs: 250,
    retryOn: () => true,
  });
  const [stdout, stderr, code] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ]);
  return { stdout, stderr, code: code ?? -1 };
}

describe("GATE-Ω6 — CLI surface (root-principal script over the µhost)", () => {
  test("help exits 0 and prints the command set", async () => {
    const r = await runCli(["--help"]);
    expect(r.code).toBe(0);
    expect(r.stdout).toContain("plugins");
    expect(r.stdout).toContain("call <op>");
    expect(r.stdout).toContain("consent <consentId>");
    expect(r.stdout).toContain("msg send");
    expect(r.stdout).toContain("status");
  }, SPAWN_BUDGET_MS);

  test("unknown command → usage error, exit 2", async () => {
    const r = await runCli(["frobnicate"]);
    expect(r.code).toBe(2);
    expect(r.stderr).toContain("unknown command");
  }, SPAWN_BUDGET_MS);

  test("call echo.ping@1 '{\"hello\":\"cli\"}' → ok, exit 0, payload echoed", async () => {
    const vault = tempVault("echo-ok");
    const r = await runCli(["call", "echo.ping@1", '{"hello":"cli"}', "--vault", vault, "--composition", ECHO_SPEC]);
    expect(r.code).toBe(0);
    expect(r.stdout).toContain("ok echo.ping@1");
    expect(r.stdout).toContain('"hello": "cli"');
    // the boot flow really compiled + pinned: vault artifacts exist
    expect(existsSync(join(vault, "recipe.pinned"))).toBe(true);
    expect(existsSync(join(vault, "build", "echo-cli", "recipe.json"))).toBe(true);
    // the surface owns stdio: host/worker log lines never appear on stdout
    expect(r.stdout).not.toContain("[vivim]");
  }, SPAWN_BUDGET_MS);

  test("call with --json emits ONE parseable JSON document", async () => {
    const vault = tempVault("echo-json");
    const r = await runCli(["call", "echo.ping@1", '{"hello":"json"}', "--json", "--vault", vault, "--composition", ECHO_SPEC]);
    expect(r.code).toBe(0);
    const doc = JSON.parse(r.stdout);
    expect(doc.op).toBe("echo.ping@1");
    expect(doc.result.ok).toBe(true);
    expect(doc.result.value.payload.hello).toBe("json");
    expect(typeof doc.ms).toBe("number");
  }, SPAWN_BUDGET_MS);

  test("call no.such.op@1 → REFUSED printed, exit 1", async () => {
    const vault = tempVault("echo-refused");
    const r = await runCli(["call", "no.such.op@1", "--vault", vault, "--composition", ECHO_SPEC]);
    expect(r.code).toBe(1);
    expect(r.stdout).toContain("fail no.such.op@1 → REFUSED");
    expect(r.stdout).toContain("no routed implementation for no.such.op@1");
  }, SPAWN_BUDGET_MS);

  test("call with malformed json-args → usage error, exit 2 (before any boot)", async () => {
    const r = await runCli(["call", "echo.ping@1", "{nope", "--vault", tempVault("bad-json"), "--composition", ECHO_SPEC]);
    expect(r.code).toBe(2);
    expect(r.stderr).toContain("does not parse as JSON");
  }, SPAWN_BUDGET_MS);

  test("plugins lists the compartments + routed ops of the booted composition", async () => {
    const vault = tempVault("plugins");
    const r = await runCli(["plugins", "--vault", vault, "--composition", ECHO_SPEC]);
    expect(r.code).toBe(0);
    expect(r.stdout).toContain("omega.echo");
    expect(r.stdout).toContain("echo.ping@1");
    expect(r.stdout).toContain("vivim.law");
    expect(r.stdout).toContain("[active]");
    const j = await runCli(["plugins", "--json", "--vault", vault, "--composition", ECHO_SPEC]);
    const doc = JSON.parse(j.stdout);
    expect(doc.composition).toBe("echo-cli");
    expect(doc.routedOps).toContain("echo.ping@1");
    const echo = (doc.compartments as Array<{ id: string; routedOps: string[] }>).find((c) => c.id === "omega.echo");
    expect(echo?.routedOps).toEqual(["echo.ping@1"]);
  }, SPAWN_BUDGET_MS);

  test("status prints pure router-status JSON (parseable stdout)", async () => {
    const vault = tempVault("status");
    const r = await runCli(["status", "--vault", vault, "--composition", ECHO_SPEC]);
    expect(r.code).toBe(0);
    const st = JSON.parse(r.stdout); // stdout must be pure JSON — no host log pollution
    expect(st.routedOps).toContain("echo.ping@1");
    // Cold status never calls an op: phase-0 law is active, echo is dormant
    // (never started — D-331), and the route table is intact regardless.
    expect(st.compartments["vivim.law"].state).toBe("active");
    expect(st.dormant).toEqual(["omega.echo"]);
    expect(st.generation).toBeGreaterThanOrEqual(1);
  }, SPAWN_BUDGET_MS);

  test("boot failure is fail-closed: JSON report on stderr, exit 1", async () => {
    const r = await runCli(["call", "echo.ping@1", "--vault", tempVault("noboot"), "--composition", "/no/such/spec.json"]);
    expect(r.code).toBe(1);
    const report = JSON.parse(r.stderr.split("\n").find((l) => l.trim().startsWith("{"))!);
    expect(report.booted).toBe(false);
    expect(report.report.reason).toContain("not found");
  }, SPAWN_BUDGET_MS);

  test("--recipe boots the already-compiled recipe (second boot mode)", async () => {
    const vault = tempVault("recipe-mode");
    const first = await runCli(["call", "echo.ping@1", '{"via":"spec"}', "--vault", vault, "--composition", ECHO_SPEC]);
    expect(first.code).toBe(0);
    const recipeFile = join(vault, "build", "echo-cli", "recipe.json");
    const second = await runCli(["call", "echo.ping@1", '{"via":"recipe"}', "--vault", vault, "--recipe", recipeFile]);
    expect(second.code).toBe(0);
    expect(second.stdout).toContain('"via": "recipe"');
  }, SPAWN_BUDGET_MS);
});

describe("GATE-Ω6 — CLI consent ceremony (real vivim.law + omega.risky)", () => {
  test("call risky.op@1 → REFUSED names the consentId + the exact consent command", async () => {
    const vault = tempVault("consent-refuse");
    const r = await runCli(["call", "risky.op@1", '{"hello":"world"}', "--vault", vault, "--composition", RISK_SPEC]);
    expect(r.code).toBe(1);
    expect(r.stdout).toContain("CONSENT REQUIRED");
    const id = r.stdout.match(/consent_[0-9a-f]{16}/)?.[0];
    expect(id).toBeTruthy();
    // the exact runnable consent command is printed with this invocation's flags
    expect(r.stdout).toContain(`consent ${id}`);
    expect(r.stdout).toContain(`--vault ${vault}`);
    expect(r.stdout).toContain(`--composition ${RISK_SPEC}`);
    // the law gate really refused (register + detail), not a surface-side invention
    expect(r.stdout).toContain("fail risky.op@1 → REFUSED");
  }, SPAWN_BUDGET_MS);

  test("consent <id> grants through law.consent.grant@1 → exit 0", async () => {
    const vault = tempVault("consent-grant");
    const refused = await runCli(["call", "risky.op@1", "--vault", vault, "--composition", RISK_SPEC]);
    const id = refused.stdout.match(/consent_[0-9a-f]{16}/)?.[0] as string;
    const r = await runCli(["consent", id, "--vault", vault, "--composition", RISK_SPEC]);
    expect(r.code).toBe(0);
    expect(r.stdout).toContain("granted");
    expect(r.stdout).toContain(id);
    // the grant is journaled by the REAL law plugin (vault evidence)
    const journal = join(vault, "law-journal.jsonl");
    expect(existsSync(journal)).toBe(true);
    const lines = readFileSync(journal, "utf-8").trim().split("\n").filter(Boolean).map((l) => JSON.parse(l));
    const grantEntry = lines.find((l) => l.op === "law.consent.grant" && l.action === "grant" && l.consentId === id);
    expect(grantEntry).toBeTruthy();
  }, SPAWN_BUDGET_MS);

  test("one-shot ceremony: call risky.op@1 --consent <id> grants then succeeds → exit 0", async () => {
    const vault = tempVault("consent-oneshot");
    const refused = await runCli(["call", "risky.op@1", '{"hello":"one"}', "--vault", vault, "--composition", RISK_SPEC]);
    const id = refused.stdout.match(/consent_[0-9a-f]{16}/)?.[0] as string;
    const r = await runCli(["call", "risky.op@1", '{"hello":"one"}', "--consent", id, "--vault", vault, "--composition", RISK_SPEC]);
    expect(r.code).toBe(0);
    expect(r.stdout).toContain("granted");
    expect(r.stdout).toContain("mutated");
    expect(r.stdout).toContain('"hello": "one"');
  }, SPAWN_BUDGET_MS);

  test("msg list without an email provider in the composition → 'not in composition', exit 1", async () => {
    const vault = tempVault("msg-absent");
    const r = await runCli(["msg", "list", "--vault", vault, "--composition", ECHO_SPEC]);
    expect(r.code).toBe(1);
    expect(r.stdout).toContain("not in composition");
    expect(r.stdout).toContain("provider.email.file");
  }, SPAWN_BUDGET_MS);
});

describe("GATE-Ω6 — CLI msg sugar over the real email composition (Ω5 wave)", () => {
  // fixtures/email.json = real vivim.law + pack.domain-email + vivim.vault + provider.email.file.
  // The pack declares message.send@1 EXTERNAL_MUTATION → the sugar walks the real
  // consent ceremony; search/list are READ → ungated.
  const EMAIL_SPEC = join(import.meta.dir, "fixtures/email.json");

  test("msg send needs consent; one-shot --consent grant+send → exit 0 with messageId", async () => {
    const vault = tempVault("msg-send");
    const subject = `cli-surface-${Date.now()}`;
    const refused = await runCli(["msg", "send", "--to", "dest@omega.local", "--subject", subject, "--body", "through the surface sugar", "--vault", vault, "--composition", EMAIL_SPEC]);
    expect(refused.code).toBe(1);
    expect(refused.stdout).toContain("CONSENT REQUIRED");
    const id = refused.stdout.match(/consent_[0-9a-f]{16}/)?.[0] as string;

    const sent = await runCli(["msg", "send", "--to", "dest@omega.local", "--subject", subject, "--body", "through the surface sugar", "--consent", id, "--vault", vault, "--composition", EMAIL_SPEC]);
    expect(sent.code).toBe(0);
    expect(sent.stdout).toContain("granted");
    expect(sent.stdout).toContain("messageId");

    // search (READ, ungated) finds the message just sent through the sugar.
    // NOTE: fixtures/email.json pins vivim.vault dataDir to the shared
    // ${TMP}/omega-cli-test/email-fixture/vault-data (not per-case tempVault),
    // so the DB accumulates every historic run and message.search caps at 50.
    // Searching the generic body ("surface sugar") therefore truncates the
    // newest row once history exceeds the cap. Search the unique subject in
    // the SAME vault instead — one exact hit, history-proof.
    const found = await runCli(["msg", "search", subject, "--vault", vault, "--composition", EMAIL_SPEC]);
    expect(found.code).toBe(0);
    expect(found.stdout).toContain(subject);
  }, SPAWN_BUDGET_MS);

  test("msg list is READ-risk sugar → ungated, exit 0", async () => {
    const r = await runCli(["msg", "list", "--vault", tempVault("msg-list"), "--composition", EMAIL_SPEC]);
    expect(r.code).toBe(0);
    expect(r.stdout).toContain("ok message.list@1");
    expect(r.stdout).toContain("messages");
  }, SPAWN_BUDGET_MS);
});

describe("GATE-Ω6 — CLI via warm daemon (D-322): same stdout as cold, served warm", () => {
  test("daemon-served call prints exactly the cold shape; callsServed proves the path; --no-daemon proves cold", async () => {
    const vault = tempVault("daemon-warm");
    const handle: DaemonHandle = await startDaemon({ vaultDir: vault, specPath: ECHO_SPEC, idleMs: 300_000 });
    try {
      const info = readDaemonInfo(vault)!;
      const servedBefore = async (): Promise<number> => {
        const s = await callDaemon(info, "status", {}, 10000);
        return (s.value as { daemon: { callsServed: number } }).daemon.callsServed;
      };
      expect(await servedBefore()).toBe(0);
      // warm: identical stdout contract to the cold path (same op, same pretty print)
      const warm = await runCli(["call", "echo.ping@1", '{"hello":"warm"}', "--vault", vault, "--composition", ECHO_SPEC], 30_000, { daemon: true });
      expect(warm.code).toBe(0);
      expect(warm.stdout).toContain("ok echo.ping@1");
      expect(warm.stdout).toContain('"hello": "warm"');
      expect(warm.stderr).toContain("via warm daemon"); // diagnostics ride stderr, never stdout
      expect(await servedBefore()).toBe(1); // the daemon (not a cold boot) served it
      // --no-daemon forces the cold path even with a live daemon present
      const cold = await runCli(["call", "echo.ping@1", '{"hello":"cold"}', "--vault", vault, "--composition", ECHO_SPEC, "--no-daemon"]);
      expect(cold.code).toBe(0);
      expect(cold.stdout).toContain("ok echo.ping@1");
      expect(cold.stderr).not.toContain("via warm daemon");
      expect(await servedBefore()).toBe(1); // unchanged — cold boot served it
    } finally {
      await handle.close();
      rmSync(vault, { recursive: true, force: true });
    }
  }, 60_000);
});
