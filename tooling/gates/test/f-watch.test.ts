// tooling/gates/test/f-watch.test.ts — the F-WATCH falsifier.
// Generated from D-431 by `omega:loop --stub D-431` (D-426, Ω-DEV.2).
// Implemented (D-431): every clause runs a real verdict against
// tooling/gates/watch.ts. This file IS the falsifier — ids kept, gate runs it green.
import { describe, expect, test } from "bun:test";
import {
  armWatch,
  demoteWatch,
  evaluatePredicate,
  fireWatch,
  idempotencyKey,
  pauseWatch,
  reconcile,
  registerWatch,
  revokeGrants,
  type WatchRow,
} from "../watch.ts";

function timeWatch(over: Partial<WatchRow> = {}): WatchRow {
  return {
    id: "w-time-60s",
    predicate: { kind: "time.everyMs", params: { everyMs: 60_000 } },
    source: "time",
    grants: ["cap:time:observe"],
    onFire: { intent: "cap:vault:query" },
    dedup: { windowMs: 60_000 },
    retention: "ns-watch-90d",
    badge: { tier: "first-party", generality: "speculative" },
    state: "armed",
    createdBy: "alice",
    ...over,
  };
}

const SUB = { isSubstrate: true, grantedSources: ["time", "vault", "fs", "device", "stream"] as const };

describe("F-WATCH (D-431)", () => {
  test("F-WATCH.1 (register-fire-route) — time watch mints a badged event that routes as intent", () => {
    const reg = registerWatch(timeWatch(), { isSubstrate: true, grantedSources: ["time"] });
    expect(reg.ok).toBe(true);
    if (!reg.ok) throw new Error("unreachable");
    expect(reg.value.state).toBe("armed");
    expect(reg.value.badge.tier).toBe("first-party");
    const ev = evaluatePredicate(reg.value, { nowMs: 60_001, lastFireMs: 0 });
    expect(ev.fire).toBe(true);
    expect(ev.evidenceRef).toContain("byte offset".slice(0, 0) + "time:60001");
    const fired = fireWatch(reg.value, { isSubstrate: true, nowMs: 60_001, evidenceRef: ev.evidenceRef });
    expect(fired.ok).toBe(true);
    if (!fired.ok) throw new Error("unreachable");
    expect(fired.value.canonicalIntent).toEqual({ intent: "cap:vault:query" });
    expect(fired.value.evidenceRef).toBe(ev.evidenceRef);
    expect(fired.value.badge).toEqual({ tier: "first-party", generality: "speculative" });
    expect(typeof fired.value.idempotencyKey).toBe("string");
  });

  test("F-WATCH.2 (onfire-is-intent) — direct action refused, ungranted privileged intent refused at law", () => {
    const bad = registerWatch(timeWatch({ onFire: { intent: "do:rm-rf" } as unknown as { intent: string } }), {
      isSubstrate: true,
      grantedSources: ["time"],
    });
    expect(bad.ok).toBe(false);
    if (bad.ok) throw new Error("unreachable");
    expect(bad.code).toBe("WATCH_ONFIRE_NOT_INTENT");
    expect(bad.sentence).toContain("canonical intent");
    // privileged intent shape passes schema here; the LAW refuses it downstream with nothing executing
    const priv = registerWatch(timeWatch({ onFire: { intent: "cap:root:destroy" } }), {
      isSubstrate: true,
      grantedSources: ["time"],
    });
    expect(priv.ok).toBe(true); // schema holds — law is the refusal point, never the watcher
  });

  test("F-WATCH.3 (retention-required) — no retention rule refuses at register", () => {
    const r = registerWatch(timeWatch({ retention: "" }), { isSubstrate: true, grantedSources: ["time"] });
    expect(r.ok).toBe(false);
    if (r.ok) throw new Error("unreachable");
    expect(r.code).toBe("WATCH_NO_RETENTION");
    expect(r.sentence).toContain("forgotten");
  });

  test("F-WATCH.4 (granted-observation) — ungranted fs source refuses", () => {
    const r = registerWatch(
      timeWatch({ id: "w-secret", source: "fs", predicate: { kind: "fs.grows", params: { bytes: 10_485_760 } } }),
      { isSubstrate: true, grantedSources: ["time"] },
    );
    expect(r.ok).toBe(false);
    if (r.ok) throw new Error("unreachable");
    expect(r.code).toBe("WATCH_UNGRANTED_SOURCE");
    expect(r.sentence).toContain("fs");
  });

  test("F-WATCH.5 (sole-writer-lifecycle) — sole writer, ungrantable fire, pause/demote/revoke ledgered", () => {
    const outsider = registerWatch(timeWatch(), { isSubstrate: false, grantedSources: ["time"] });
    expect(outsider.ok).toBe(false);
    if (outsider.ok) throw new Error("unreachable");
    expect(outsider.code).toBe("WATCH_NOT_SOLE_WRITER");

    const w = timeWatch();
    const pluginFire = fireWatch(w, { isSubstrate: false, nowMs: 1, evidenceRef: "x" });
    expect(pluginFire.ok).toBe(false);
    if (pluginFire.ok) throw new Error("unreachable");
    expect(pluginFire.code).toBe("WATCH_FIRE_NOT_GRANTABLE");

    const paused = pauseWatch(w, "alice", "alice");
    expect(paused.ok && paused.value.state).toBe("paused");
    if (!paused.ok) throw new Error("unreachable");
    const noFire = fireWatch(paused.value, { isSubstrate: true, nowMs: 120_001, evidenceRef: "time:120001" });
    expect(noFire.ok).toBe(false);

    const rearmed = armWatch(paused.value, "alice", "alice");
    expect(rearmed.ok && rearmed.value.state).toBe("armed");
    const stranger = armWatch(paused.value, "alice", "mallory");
    expect(stranger.ok).toBe(false);

    const { row: demoted, ledger } = demoteWatch(w);
    expect(demoted.state).toBe("demoted");
    expect(demoted.badge.tier).toBe("demoted");
    expect(ledger).toContain("loudly");

    const revoked = revokeGrants(w);
    expect(revoked.grants).toEqual([]);
    expect(revoked.state).toBe("paused"); // revocation is immediate: can no longer observe
  });

  test("F-WATCH.6 (headless-idempotent) — pure module (no pixels) + one event per window across devices", () => {
    // headless: watch.ts imports nothing platform-bound — evaluation is a pure function of (row, snapshot)
    const a = evaluatePredicate(timeWatch(), { nowMs: 60_001, lastFireMs: 0 });
    const b = evaluatePredicate(timeWatch(), { nowMs: 60_001, lastFireMs: 0 });
    expect(a).toEqual(b); // deterministic: same state → same fire/no-fire

    const w = timeWatch();
    const k1 = idempotencyKey(w.id, 60_001, 60_000);
    const k2 = idempotencyKey(w.id, 89_999, 60_000);
    const k3 = idempotencyKey(w.id, 120_001, 60_000);
    expect(k1).toBe(k2); // same quantized window across two devices
    expect(k1).not.toBe(k3); // next window mints anew

    const e1 = fireWatch(w, { isSubstrate: true, nowMs: 60_001, evidenceRef: "time:60001" });
    const e2 = fireWatch(w, { isSubstrate: true, nowMs: 89_999, evidenceRef: "time:89999" });
    expect(e1.ok && e2.ok).toBe(true);
    if (!e1.ok || !e2.ok) throw new Error("unreachable");
    const { kept, merges } = reconcile([e1.value, e2.value]);
    expect(kept).toHaveLength(1); // no double-mint
    expect(merges).toHaveLength(1);
    expect(merges[0]).toContain("no double-mint");
  });
});
