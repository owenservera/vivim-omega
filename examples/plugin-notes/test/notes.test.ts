// GATE-Ω4 evidence — plugin-notes on the REAL µhost.
//
// THE POINT: this plugin (omega.notes) installed through the full staged→active
// path — compile ceremony (sign + content-hash stamp) → B1/B4 verification →
// worker compartment boot → routed ops — with ZERO changes to host/, sdk/,
// testkit/. Those packages were committed BEFORE this plugin existed; the proof
// is this file doing nothing but standard plugin things and passing.
//
// (Host is imported by relative path: examples/plugin-notes declares only shim +
// contracts — plugins never depend on the host; only tests borrow its ceremony.)
import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { mkdirSync, rmSync, readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { compileComposition, ensureVault, bootComposition, contentHashDir } from "../../../host/src/index.ts";
import type { BootedHost } from "../../../host/src/index.ts";
import type { PortResult } from "@vivim/omega-contracts";
import { omegaTmp } from "@vivim/omega-platform"; // D-372 Phase 3: scratch through the seam

const SPEC = join(import.meta.dir, "../../../compositions/notes.json");
const spec = JSON.parse(readFileSync(SPEC, "utf-8"));
let vault: string;
let host: BootedHost;

beforeAll(async () => {
  vault = omegaTmp("omega-notes-test", `run-${Date.now()}-${Math.floor(Math.random() * 1e6)}`);
  rmSync(vault, { recursive: true, force: true });
  mkdirSync(vault, { recursive: true });
  const { rootKey } = ensureVault(vault);
  const { recipe, buildDir } = compileComposition(spec, join(SPEC, ".."), vault, rootKey);
  host = await bootComposition(recipe, buildDir, vault);
});

afterAll(async () => { await host.shutdown(); });

describe("GATE-Ω4 — omega.notes installs staged→active on the real µhost", () => {
  test("the compile ceremony signed the manifest and stamped its content hash (staged→verified)", () => {
    const m = host.manifests.get("omega.notes")!;
    expect(m).toBeTruthy();
    expect(m.contentHash).toMatch(/^sha256:[0-9a-f]{64}$/);
    // recompute the B1 hash from the source dir with the HOST implementation: must match
    expect(contentHashDir(join(import.meta.dir, ".."))).toBe(m.contentHash);
    expect(m.publisher.keyId).toBe(ensureVault(vault).rootKey.keyId); // signed by the vault root of trust
    expect(m.publisher.signature.length).toBeGreaterThan(0);
  });

  test("note.write@1 from root: ok (MUTATION → law allow) and the write is journaled", async () => {
    const r: PortResult = await host.router.callAsRoot("note.write@1", { title: "hello omega", body: "written through the real router" });
    expect(r.ok).toBe(true);
    if (r.ok) {
      const note = (r.value as { note: { title: string; body: string } }).note;
      expect(note.title).toBe("hello omega");
      expect(note.body).toBe("written through the real router");
    }
    // journal evidence: the law-stub gate journaled an allow decision for note.write@1
    const jf = join(vault, "law-journal.jsonl");
    expect(existsSync(jf)).toBe(true);
    const lines = readFileSync(jf, "utf-8").trim().split("\n").filter(Boolean).map((l) => JSON.parse(l));
    const gate = lines.find((l) => l.op === "note.write@1" && l.decision === "allow");
    expect(gate).toBeTruthy();
    expect(gate.principal).toBe("root");
    expect(typeof gate.causationId).toBe("string");
    // AND the plugin's own journal append (host.journal.append@1 granted by the recipe)
    const pluginEntry = lines.find((l) => l.op === "note.write@1" && l.noteId);
    expect(pluginEntry).toBeTruthy();
  });

  test("note.list@1: the note is there (round-trip through the worker compartment)", async () => {
    const r = await host.router.callAsRoot("note.list@1", {});
    expect(r.ok).toBe(true);
    if (r.ok) {
      const notes = (r.value as { notes: Array<{ title: string; body: string }> }).notes;
      expect(notes.some((n) => n.title === "hello omega" && n.body === "written through the real router")).toBe(true);
    }
  });

  test("malformed write (no title) → DEGRADED register with the handler's detail", async () => {
    const r = await host.router.callAsRoot("note.write@1", { body: "titleless" });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error).toBe("DEGRADED");
      expect(r.detail).toContain("title is required");
    }
  });

  test("router wires exactly the manifest-declared ops (B1: nothing else routes)", () => {
    const st = host.router.status();
    expect(st.routedOps).toContain("note.write@1");
    expect(st.routedOps).toContain("note.list@1");
    expect(st.routedOps).toContain("law.check@1");
    expect(st.routedOps).not.toContain("note.delete@1");
    expect((st.compartments as Record<string, { state: string }>)["omega.notes"].state).toBe("active");
  });
});
