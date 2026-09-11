// omega.notes — the TEST contribution the conformance runner executes.
// Exports run(def, fake): boot-side round-trip proof on the FakeHost. The runner
// installs the def with the manifest's requested capabilities (none for notes),
// so the journal path is exercised as the GRACEFUL-SKIP branch here; the granted-
// cap branch is proven on the real host (test/notes.test.ts) and in the
// differential suite.
import type { PluginDef } from "@vivim/omega-shim";
import type { FakeHost } from "@vivim/omega-testkit";

export async function run(def: PluginDef, fake: FakeHost): Promise<{ pass: boolean; wrote?: string; listed?: number }> {
  if (!def.ops?.["note.write@1"] || !def.ops?.["note.list@1"]) {
    return { pass: false };
  }
  const w = await fake.call("note.write@1", { title: "conformance", body: "staged→verified→active round-trip" });
  if (!w.ok) return { pass: false };
  const note = (w.value as { note: { id: string; title: string; body: string } }).note;
  if (note.title !== "conformance") return { pass: false };

  const l = await fake.call("note.list@1", {});
  if (!l.ok) return { pass: false };
  const notes = (l.value as { notes: Array<{ title: string }> }).notes;
  if (!notes.some((n) => n.title === "conformance")) return { pass: false };

  // the mutation write must be journaled by the FAKE host gate (MUTATION default:
  // allow + journal) — proves the risk declaration walked the B-gate
  const gated = fake.journal.some((e) => e.op === "note.write@1" && e.decision === "allow");
  if (!gated) return { pass: false };

  return { pass: true, wrote: note.id, listed: notes.length };
}
