// tooling/builder — tests (Ω9): the ecosystem builder's proof, as gate evidence.
//
// The mandated cases:
//   · scaffold into a temp dir (NOT committed) → files exist → sdk validation green
//     → conformance report {staged: true, verified: true, active: true}
//   · scaffold with a bad id (uppercase) → the issue is reported honestly
//     (CLI exit non-zero; and the sdk's own parseManifest flags it — issues non-empty)
// Plus the honesty extras: every contribution kind scaffolds conformant, the
// generated test file itself runs green under `bun test`, and a non-empty target
// dir is refused without writing.
import { describe, test, expect, afterAll } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parseManifest, validateManifest, ID_PATTERN } from "@vivim/omega-sdk";
import { scaffoldPlugin, validateScaffold, conformScaffold, checkId, removeScaffold } from "../src/builder.ts";
import { retryOsLock } from "@vivim/omega-platform"; // soak hardening: same shared retry as the CLI/MCP suites

const ROOT = join(import.meta.dir, "../../.."); // vivim-omega/
const BUILDER = join(ROOT, "tooling/builder/src/builder.ts");
const SESSION = mkdtempSync(join(tmpdir(), "omega-builder-test-"));
afterAll(() => { rmSync(SESSION, { recursive: true, force: true }); });

/** Run the builder CLI; return { exitCode, output }. */
async function runCli(args: string[]): Promise<{ exitCode: number; output: string }> {
  // Bounded spawn retry (same soak hardening as CLI/MCP suites — D-368).
  const proc = retryOsLock(() => Bun.spawn(["bun", "run", BUILDER, ...args], { cwd: ROOT, stdout: "pipe", stderr: "pipe" }), {
    tries: 5,
    baseMs: 250,
    retryOn: () => true,
  });
  const [out, err] = await Promise.all([new Response(proc.stdout).text(), new Response(proc.stderr).text()]);
  const exitCode = await proc.exited;
  return { exitCode, output: out + err };
}

// ------------------------------------------------------------------------------------

describe("Ω9 builder — scaffold → validate → conform (the third-party path)", () => {
  test("a fresh plugin scaffolded into a temp dir passes the whole ceremony: files exist, sdk validation green, conformance {staged, verified, active}", async () => {
    const dir = join(SESSION, "acme-widget");
    const result = scaffoldPlugin({ pluginId: "acme.widget", dir });

    // files exist (the five artifacts of a conformant plugin)
    expect(result.dir).toBe(dir);
    expect(result.op).toBe("acme.widget.echo@1");
    expect(result.kind).toBe("contract");
    for (const f of ["plugin.json", "package.json", "src/index.ts", "test/scaffold.test.ts", "test/conformance.fixture.ts"]) {
      expect(result.files).toContain(f);
      expect(existsSync(join(dir, f))).toBe(true);
    }
    // dev wiring: the workspace links bun install would provide (hash-excluded, gitignored)
    expect(existsSync(join(dir, "node_modules/@vivim/omega-shim")));
    expect(result.devLinks.length).toBe(4);

    // the generated manifest is the REQUEST shape, with risk READ on the contract kind
    const raw = JSON.parse(readFileSync(join(dir, "plugin.json"), "utf-8")) as Record<string, any>;
    expect(raw.id).toBe("acme.widget");
    expect(raw.manifestVersion).toBe("1");
    expect(raw.entry).toBe("src/index.ts");
    expect(raw.contentHash).toBe("");
    expect(raw.contributions.contract).toEqual([{ kind: "contract", id: "acme.widget.echo", version: "1", risk: "READ", doc: expect.any(String) }]);
    expect(raw.capabilities.requested).toEqual([]);
    // the generated package.json derives its name and carries shim+contracts (+ dev sdk+testkit)
    const pkg = JSON.parse(readFileSync(join(dir, "package.json"), "utf-8")) as Record<string, any>;
    expect(pkg.name).toBe("@vivim/plugin-acme-widget");
    expect(Object.keys(pkg.dependencies).sort()).toEqual(["@vivim/omega-contracts", "@vivim/omega-shim"]);

    // sdk validation green — the same law a hand-written manifest faces
    const v = validateScaffold(dir);
    expect(v.parseOk).toBe(true);
    expect(v.parseErrors).toEqual([]);
    expect(v.issues).toEqual([]);
    expect(v.ok).toBe(true);
    const parsed = parseManifest(readFileSync(join(dir, "plugin.json"), "utf-8"));
    expect(parsed.ok).toBe(true);
    if (parsed.ok) expect(validateManifest(parsed.value)).toEqual([]);

    // conformance — staged → verified → active, zero issues (the Ω9 proof)
    const report = await conformScaffold(dir);
    expect(report).toMatchObject({ pluginId: "acme.widget", staged: true, verified: true, active: true });
    expect(report.issues).toEqual([]);
    expect(report.ops).toEqual(["acme.widget.echo@1"]);
    expect(report.fixture).toBe("test/conformance.fixture.ts");
    expect(report.contentHash.computed).toMatch(/^sha256:[0-9a-f]{64}$/);
    removeScaffold(dir);
  });

  test("the generated test file itself runs green under bun test (a real test, not a stub)", async () => {
    const dir = join(SESSION, "runme-widget");
    scaffoldPlugin({ pluginId: "runme.widget", dir });
    const proc = Bun.spawn(["bun", "test"], { cwd: dir, stdout: "pipe", stderr: "pipe" });
    const [out, err] = await Promise.all([new Response(proc.stdout).text(), new Response(proc.stderr).text()]);
    const exitCode = await proc.exited;
    const output = out + err;
    expect(exitCode).toBe(0);
    expect(output).toContain(" 2 pass");
    expect(output).toContain(" 0 fail");
    removeScaffold(dir);
  }, 60_000);

  test("every routable contribution kind scaffolds conformant (provider, engine); the surface kind conforms with its honest dormancy fixture", async () => {
    for (const kind of ["provider", "engine", "surface"] as const) {
      const dir = join(SESSION, `${kind}-widget`);
      const result = scaffoldPlugin({ pluginId: `${kind}.widget`, dir, kind });
      expect(result.kind).toBe(kind);
      const v = validateScaffold(dir);
      expect(v.ok).toBe(true);
      const report = await conformScaffold(dir);
      expect(report).toMatchObject({ staged: true, verified: true, active: true });
      expect(report.issues).toEqual([]);
      // provider/engine contributions route the op; surface contributions do not
      expect(report.ops).toEqual(kind === "surface" ? [] : [`${kind}.widget.echo@1`]);
      removeScaffold(dir);
    }
  });

  test("--contract names the op: the manifest, op id, and conformance all follow it", async () => {
    const dir = join(SESSION, "greet-widget");
    const result = scaffoldPlugin({ pluginId: "acme.greeter", dir, contract: "greet.hello" });
    expect(result.op).toBe("greet.hello@1");
    const report = await conformScaffold(dir);
    expect(report.ops).toEqual(["greet.hello@1"]);
    expect(report.active).toBe(true);
    removeScaffold(dir);
  });
});

describe("Ω9 builder — honest refusals (bad input never scaffolds)", () => {
  test("a bad id (uppercase) is refused: CLI exit non-zero, the sdk grammar quoted, nothing written", async () => {
    const dir = join(SESSION, "bad-id-widget");
    const { exitCode, output } = await runCli(["new", "Acme.Widget", "--dir", dir]);
    expect(exitCode).not.toBe(0);
    expect(output).toContain("Acme.Widget");
    expect(output).toContain("must match");
    expect(existsSync(dir)).toBe(false); // refused BEFORE writing
    // the same grammar the sdk enforces on manifests — issues non-empty on parse
    const parsed = parseManifest({ manifestVersion: "1", id: "Acme.Widget", version: "0.1.0", entry: "src/index.ts", publisher: { keyId: "", signature: "" }, contributions: {}, dependencies: [], capabilities: { requested: [] }, runtime: { tier: "worker-thread", budget: {} }, contentHash: "" });
    expect(parsed.ok).toBe(false);
    if (!parsed.ok) expect(parsed.errors.join(" ")).toContain("must match");
    expect(ID_PATTERN.test("Acme.Widget")).toBe(false);
    // and the in-process check surfaces the same problems
    expect(checkId("Acme.Widget", "Acme.Widget.echo", "contract").length).toBeGreaterThan(0);
  });

  test("a bad --contract id and a bad --kind are refused honestly (exit non-zero, nothing written)", async () => {
    const dir = join(SESSION, "bad-contract-widget");
    const badContract = await runCli(["new", "acme.two", "--contract", "Not An Op", "--dir", dir]);
    expect(badContract.exitCode).not.toBe(0);
    expect(badContract.output).toContain("contract id");
    expect(existsSync(dir)).toBe(false);

    const badKind = await runCli(["new", "acme.three", "--kind", "daemon", "--dir", dir]);
    expect(badKind.exitCode).not.toBe(0);
    expect(badKind.output).toContain('kind "daemon" is invalid');
    expect(existsSync(dir)).toBe(false);
  });

  test("a non-empty target dir is refused without touching it", () => {
    const dir = join(SESSION, "occupied");
    mkdirSync(dir, { recursive: true });
    const precious = join(dir, "precious.txt");
    writeFileSync(precious, "precious");
    expect(() => scaffoldPlugin({ pluginId: "acme.occupied", dir })).toThrow(/non-empty/);
    expect(readFileSync(precious, "utf-8")).toBe("precious"); // untouched
    rmSync(dir, { recursive: true, force: true });
  });

  test("unknown command / flags → usage, exit 2", async () => {
    const noCmd = await runCli([]);
    expect(noCmd.exitCode).toBe(2);
    expect(noCmd.output).toContain("omega new-plugin");
    const unknown = await runCli(["summon", "acme.x"]);
    expect(unknown.exitCode).toBe(2);
    expect(unknown.output).toContain('unknown command "summon"');
    const badFlag = await runCli(["new", "acme.x", "--magic"]);
    expect(badFlag.exitCode).toBe(2);
    expect(badFlag.output).toContain("unknown flag --magic");
  });
});

describe("Ω9 builder — the CLI end-to-end (spawn, exit codes, ceremony transcript)", () => {
  test("new <id> via the CLI: scaffold + validate + conformance green, exit 0, the Ω9 proof line printed", async () => {
    const dir = join(SESSION, "cli-widget");
    const { exitCode, output } = await runCli(["new", "cli.widget", "--dir", dir, "--kind", "engine", "--contract", "cli.run"]);
    expect(exitCode).toBe(0);
    expect(output).toContain("scaffolded cli.widget (engine kind, op cli.run@1)");
    for (const f of ["plugin.json", "package.json", "src/index.ts", "test/scaffold.test.ts", "test/conformance.fixture.ts"]) {
      expect(output).toContain(`+ ${f}`);
    }
    expect(output).toContain("validated: sdk parse green + semantic validators green");
    expect(output).toContain("staged=true verified=true active=true");
    expect(output).toContain("ZERO host changes");
    removeScaffold(dir);
  }, 60_000);
});
