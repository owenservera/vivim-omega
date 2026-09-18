// @vivim/omega-platform — containment.ts (D-386)
// OS-enforced memory containment probe — the L-15 revisit trigger, elevated to a
// pre-B1b gate condition by the 2026-09-18 independent recommendation (§7).
// Linux cgroups v2, single-OS experiment: measure whether the kernel ACTUALLY
// bounds a real child process at a declared memory cap, judged ONLY by
// kernel-side accounting (memory.peak / memory.events) that the child cannot
// spoof — the non-spoofable signal the worker-tier watchdog lacks (L-2: heap
// is self-reported there; only unresponsiveness is non-spoofable).
//
// Honesty contract (D-321 — never fake-enforce):
//   verdict "enforced"    kernel measurements exist AND demonstrate bounding
//                         (peak ≤ cap+slack while the child attempted > cap)
//   verdict "advisory"    measured and NOT bounded — or not PROVABLY bounded
//   verdict "unavailable" the OS refused the probe; nothing measured, nothing claimed
// Consumers must treat anything not "enforced" as advisory. The child's
// self-reported allocation is carried in the report as DATA (the spoofable
// signal, the process-tier L-2 analog) and NEVER feeds the verdict.
//
// Placement: platform/ is the only OS-aware module (D-372). Spawning rides
// platformSpawn (D-374 seam); scratch rides omegaTmp(); no forbidden tmp
// spellings, no platform-identifier branches, no raw permission calls
// (os-surface). No production boot
// path imports this module — the probe is evidence tooling, and its verdict is
// data for decisions, not runtime behavior (broker integration stays deferred
// with its named trigger; see the D-386 record).
import { existsSync, mkdirSync, readFileSync, rmSync, rmdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { platformSpawn, type OmegaSpawnHandle } from "./spawn.ts";
import { omegaTmp } from "./platform.ts";

export type ContainmentVerdict = "enforced" | "advisory" | "unavailable";

/** The L-1 falsifier's cap, reused: a 32MB declared budget. */
export const DEFAULT_CAP_BYTES = 32 * 1024 * 1024;
/** What the child attempts to exceed it with: 4× the cap (128MB). */
export const DEFAULT_ATTEMPT_BYTES = 128 * 1024 * 1024;
/** Measurement slack on the "bounded" comparison (page noise, accounting granularity). */
export const PEAK_SLACK_BYTES = 4 * 1024 * 1024;
/** Hard deadline for the whole probe — bounded tooling, never a hang. */
export const PROBE_DEADLINE_MS = 20_000;

const CG_ROOT_DEFAULT = "/sys/fs/cgroup";

/** Probe root override for delegated user slices (e.g. systemd user slice mounts). */
export function cgroupRoot(): string {
  return process.env.OMEGA_CGROUP_ROOT ?? CG_ROOT_DEFAULT;
}

export interface CgroupDetection {
  available: boolean;     // cgroup v2 unified hierarchy present
  writable: boolean;      // we may create + configure probe subgroups (authoritative mkdir test)
  root: string;
  controllers: string[];  // controllers advertised at the root — [] when absent
  reason: string;         // ALWAYS populated, human-readable — the honest answer
}

/** Detect the cgroup v2 unified hierarchy. Writability is tested, never inferred. */
export function detectCgroupV2(root: string = cgroupRoot()): CgroupDetection {
  const controllersPath = join(root, "cgroup.controllers");
  if (!existsSync(controllersPath)) {
    return {
      available: false, writable: false, root, controllers: [],
      reason: `no cgroup v2 unified hierarchy at ${root} — memory enforcement probing is Linux cgroup v2 only; treat process budgets as advisory per KNOWN-LIMITS L-15`,
    };
  }
  let controllers: string[] = [];
  try {
    controllers = readFileSync(controllersPath, "utf-8").trim().split(/\s+/).filter(Boolean);
  } catch (e) {
    return { available: false, writable: false, root, controllers: [], reason: `cgroup.controllers at ${root} exists but is unreadable: ${errMsg(e)} — refusing to guess (fail-closed)` };
  }
  const probe = join(root, `omega-probe-${process.pid}-${Math.random().toString(36).slice(2, 6)}`);
  try {
    mkdirSync(probe);
    try { rmdirSync(probe); } catch { /* best-effort; an empty subgroup litters nothing */ }
  } catch (e) {
    return {
      available: true, writable: false, root, controllers,
      reason: `cgroup v2 present but the hierarchy is not writable for probe subgroups (${errMsg(e)}) — enforcement cannot be tested here; treat process budgets as advisory per KNOWN-LIMITS L-15`,
    };
  }
  return { available: true, writable: true, root, controllers, reason: "cgroup v2 unified hierarchy present and writable for probe subgroups" };
}

export interface ContainmentMeasurements {
  declaredCapBytes: number;
  attemptedBytes: number;
  /** Kernel-side high-water (or best live sample) of the probe subgroup's memory. */
  peakBytes: number;
  peakSource: "memory.peak" | "memory.current";
  /** memory.events oom_kill counter > 0 — the kernel itself ended the child. */
  oomKilled: boolean;
  /** The spoofable signal, carried as data only — never a verdict input. */
  childSelfReportedBytes: number | null;
  childExit: { code: number | null; signal: string | null };
}

export interface ContainmentReport {
  verdict: ContainmentVerdict;
  reason: string;
  root: string;
  /** The probe subgroup — created for the probe, removed after (best-effort). */
  subgroup: string | null;
  measurements: ContainmentMeasurements | null;
}

export interface VerdictInput {
  capBytes: number;
  attemptedBytes: number;
  peakBytes: number | null;
  peakSource: "memory.peak" | "memory.current" | "none";
  oomKilled: boolean;
  swapBounded: boolean;
  placedInCgroup: boolean;
  timedOut: boolean;
}

/**
 * The honesty core. Enforcement is claimed ONLY when kernel measurements
 * demonstrate bounding; every refusal to claim names its reason. Pure —
 * exhaustively pinned by the falsifier truth table in containment.test.ts.
 */
export function verdictFrom(i: VerdictInput): { verdict: ContainmentVerdict; reason: string } {
  if (i.timedOut) {
    return { verdict: "unavailable", reason: `probe deadline exceeded — the child was killed before enforcement could be measured; nothing is claimed (fail-closed)` };
  }
  if (!i.placedInCgroup) {
    return { verdict: "unavailable", reason: `the child was never placed inside the probe cgroup — nothing was measured, nothing is claimed (fail-closed)` };
  }
  if (i.peakBytes === null || i.peakSource === "none") {
    return { verdict: "unavailable", reason: `kernel accounting unreadable (no memory.peak / live sample) — refuse to claim anything (fail-closed, D-321 honesty)` };
  }
  if (i.attemptedBytes <= i.capBytes) {
    return { verdict: "unavailable", reason: `probe misconfigured: the child attempted ${i.attemptedBytes}B against a ${i.capBytes}B cap — enforcement was never tested` };
  }
  if (i.peakBytes <= i.capBytes + PEAK_SLACK_BYTES) {
    if (i.oomKilled) {
      return { verdict: "enforced", reason: `kernel OOM-killed the child at the declared cap: peak ${i.peakBytes}B stayed within cap ${i.capBytes}B (+${PEAK_SLACK_BYTES}B slack) while it attempted ${i.attemptedBytes}B — kernel-side, non-spoofable (memory.events/memory.peak)` };
    }
    if (i.swapBounded) {
      return { verdict: "enforced", reason: `kernel held the child at/below the declared cap: peak ${i.peakBytes}B ≤ cap ${i.capBytes}B (+${PEAK_SLACK_BYTES}B slack) while it attempted ${i.attemptedBytes}B, swap disabled — kernel-side accounting (memory.peak)` };
    }
    return { verdict: "advisory", reason: `peak stayed under the cap this run (peak ${i.peakBytes}B ≤ cap ${i.capBytes}B) but swap could not be bounded — under-enforcement cannot be ruled out, so enforcement is NOT claimed (fail-closed)` };
  }
  return { verdict: "advisory", reason: `kernel did NOT bound the child: peak ${i.peakBytes}B exceeded the declared cap ${i.capBytes}B (attempted ${i.attemptedBytes}B) — process budgets are advisory at this tier (the process-tier L-1 analog)` };
}

/** memory.events → the oom_kill counter. Malformed content → null (never 0). */
export function parseMemoryEvents(text: string): { oomKill: number | null } {
  const m = /^oom_kill\s+(\d+)\s*$/m.exec(text);
  return { oomKill: m ? Number(m[1]) : null };
}

/** memory.peak → integer bytes. Anything non-numeric ("max", garbage, empty) → null. */
export function parseMemoryPeak(text: string): number | null {
  const t = text.trim();
  if (!/^\d+$/.test(t)) return null;
  const n = Number(t);
  return Number.isSafeInteger(n) ? n : Number.MAX_SAFE_INTEGER;
}

function errMsg(e: unknown): string {
  const code = (e as { code?: string }).code;
  const message = (e as { message?: string }).message ?? String(e);
  return code ? `${code} (${message})` : message;
}

/** Generated child (never checked in): waits for {"op":"alloc","bytes":N}, then
 *  allocates + TOUCHES N bytes in 1MB chunks, self-reporting as it goes (the
 *  spoofable signal), holds briefly so the kernel accounts the peak, exits. */
function childScriptSource(): string {
  return `// omega containment probe child — generated at probe time, never checked in
let buf = "";
process.stdin.setEncoding("utf-8");
process.stdin.on("data", (c) => {
  buf += c; let i;
  while ((i = buf.indexOf("\\n")) >= 0) {
    const line = buf.slice(0, i).trim(); buf = buf.slice(i + 1);
    if (!line) continue;
    let m; try { m = JSON.parse(line); } catch { continue; }
    if (m && m.op === "alloc") {
      const chunk = 1024 * 1024; const keep = []; let soFar = 0;
      try {
        while (soFar < m.bytes) {
          const b = Buffer.alloc(chunk, 1);
          for (let k = 0; k < chunk; k += 4096) b[k] = k & 255;
          keep.push(b); soFar += chunk;
          process.stdout.write(JSON.stringify({ self: "allocated", bytes: soFar }) + "\\n");
        }
        process.stdout.write(JSON.stringify({ self: "done", bytes: soFar }) + "\\n");
      } catch (e) {
        process.stdout.write(JSON.stringify({ self: "alloc-failed", bytes: soFar, error: String((e && e.message) || e) }) + "\\n");
      }
      setTimeout(() => process.exit(0), 300);
    }
  }
});
process.stdout.write(JSON.stringify({ self: "ready" }) + "\\n");
`;
}

/**
 * The L-15 probe: does this kernel actually bound a child at a declared memory cap?
 * Creates a probe subgroup, configures memory.max (+ swap.max 0 when delegable),
 * spawns a REAL child, places it in the subgroup, orders a 4× over-cap allocation,
 * and reads kernel-side accounting after exit. Cleans up after itself. Bounded by
 * PROBE_DEADLINE_MS — tooling never hangs. Fail-closed at every step: anything the
 * OS refuses becomes verdict "unavailable" with the exact reason.
 */
export async function probeMemoryEnforcement(opts: { capBytes?: number; attemptBytes?: number } = {}): Promise<ContainmentReport> {
  const capBytes = opts.capBytes ?? DEFAULT_CAP_BYTES;
  const attemptBytes = opts.attemptBytes ?? DEFAULT_ATTEMPT_BYTES;
  const det = detectCgroupV2();
  if (!det.available || !det.writable) {
    return { verdict: "unavailable", reason: det.reason, root: det.root, subgroup: null, measurements: null };
  }
  const subgroup = join(det.root, `omega-containment-${process.pid}-${Math.random().toString(36).slice(2, 8)}`);
  let handle: OmegaSpawnHandle | null = null;
  let childPath: string | null = null;
  let timedOut = false;
  let placed = false;
  try {
    mkdirSync(subgroup);
    // the memory controller must be available in the new subgroup; if the root
    // does not delegate it yet, try enabling it (best-effort — refused = honest unavailable)
    let subControllers = readFileSync(join(subgroup, "cgroup.controllers"), "utf-8").trim().split(/\s+/);
    if (!subControllers.includes("memory")) {
      try { writeFileSync(join(det.root, "cgroup.subtree_control"), "+memory\n"); } catch { /* handled below */ }
      subControllers = readFileSync(join(subgroup, "cgroup.controllers"), "utf-8").trim().split(/\s+/);
      if (!subControllers.includes("memory")) {
        rmdirSync(subgroup);
        return { verdict: "unavailable", reason: `the memory controller is not delegated to probe subgroups under ${det.root} — enforcement cannot be tested here (treat budgets as advisory, L-15)`, root: det.root, subgroup: null, measurements: null };
      }
    }
    writeFileSync(join(subgroup, "memory.max"), `${capBytes}\n`);
    // swap honesty: only swap.max = 0 makes "peak ≤ cap" a total-memory claim.
    // A cap-valued swap bound still allows 2× total, so it counts as NOT bounded.
    let swapBounded = false;
    try { writeFileSync(join(subgroup, "memory.swap.max"), "0\n"); swapBounded = true; } catch { /* advisory at most */ }

    // real child, real allocation
    childPath = omegaTmp("omega-containment-probe", `child-${process.pid}-${Math.random().toString(36).slice(2, 8)}.mjs`);
    mkdirSync(omegaTmp("omega-containment-probe"), { recursive: true });
    writeFileSync(childPath, childScriptSource());
    handle = platformSpawn([process.execPath, childPath]);

    let exit: { code: number | null; signal: string | null } | null = null;
    let selfMax: number | null = null;
    let liveCurrentMax: number | null = null;
    let exited = new Promise<void>((resolve) => {
      handle!.onExit((code, signal) => { exit = { code, signal }; resolve(); });
    });
    handle.onLine((obj) => {
      const o = obj as { self?: string; bytes?: number };
      if (o && typeof o.bytes === "number") selfMax = Math.max(selfMax ?? 0, o.bytes);
      // kernel-side live sample while the child is alive (memory.current drops at exit)
      try {
        const cur = parseMemoryPeak(readFileSync(join(subgroup, "memory.current"), "utf-8"));
        if (cur !== null) liveCurrentMax = Math.max(liveCurrentMax ?? 0, cur);
      } catch { /* sampling is best-effort; memory.peak is the primary source */ }
    });

    // place the child INSIDE the probe subgroup before any allocation is ordered
    const pid = handle.proc.pid;
    if (typeof pid !== "number" || pid <= 0) {
      handle.kill();
      return { verdict: "unavailable", reason: `spawn did not yield a usable pid — refusing to probe unplaced (fail-closed)`, root: det.root, subgroup, measurements: null };
    }
    try { writeFileSync(join(subgroup, "cgroup.procs"), `${pid}\n`); } catch (e) {
      handle.kill(); await exited;
      return { verdict: "unavailable", reason: `could not write the child pid into cgroup.procs (${errMsg(e)}) — nothing measured, nothing claimed`, root: det.root, subgroup, measurements: null };
    }
    try {
      const procs = readFileSync(join(subgroup, "cgroup.procs"), "utf-8").trim().split(/\s+/);
      placed = procs.includes(String(pid));
    } catch { placed = false; }
    if (!placed) {
      handle.kill(); await exited;
      return { verdict: "unavailable", reason: `the child did not land inside the probe cgroup (cgroup.procs lacks ${pid}) — nothing measured, nothing claimed`, root: det.root, subgroup, measurements: null };
    }

    // order the over-cap allocation under a hard deadline
    const deadline = setTimeout(() => { timedOut = true; try { handle?.kill(); } catch { /* already dead */ } }, PROBE_DEADLINE_MS);
    handle.writeLine({ op: "alloc", bytes: attemptBytes });
    await Promise.race([exited, new Promise<void>((r) => setTimeout(r, PROBE_DEADLINE_MS + 2000))]);
    clearTimeout(deadline);
    try { handle.kill(); } catch { /* best-effort */ }

    // kernel-side accounting, read after exit (memory.peak is monotonic — persists)
    let peak: number | null = null;
    let peakSource: "memory.peak" | "memory.current" | "none" = "none";
    try {
      peak = parseMemoryPeak(readFileSync(join(subgroup, "memory.peak"), "utf-8"));
      if (peak !== null) peakSource = "memory.peak";
    } catch { /* fall through to the live sample */ }
    if (peak === null && liveCurrentMax !== null) {
      peak = liveCurrentMax;
      peakSource = "memory.current";
    }
    let oomKilled = false;
    try {
      const ev = parseMemoryEvents(readFileSync(join(subgroup, "memory.events"), "utf-8"));
      oomKilled = ev.oomKill !== null && ev.oomKill > 0;
    } catch { /* accounting missing → peakSource may still carry the verdict honestly */ }

    const v = verdictFrom({ capBytes, attemptedBytes: attemptBytes, peakBytes: peak, peakSource, oomKilled, swapBounded, placedInCgroup: placed, timedOut });
    const measurements: ContainmentMeasurements = {
      declaredCapBytes: capBytes,
      attemptedBytes: attemptBytes,
      peakBytes: peak ?? 0,
      peakSource,
      oomKilled,
      childSelfReportedBytes: selfMax,
      childExit: exit ?? { code: null, signal: null },
    };
    return { verdict: v.verdict, reason: v.reason, root: det.root, subgroup, measurements };
  } catch (e) {
    return { verdict: "unavailable", reason: `probe aborted before a measurement could be trusted: ${errMsg(e)} — nothing is claimed (fail-closed)`, root: det.root, subgroup, measurements: null };
  } finally {
    try { handle?.kill(); } catch { /* best-effort */ }
    if (childPath) { try { rmSync(childPath, { force: true }); } catch { /* best-effort */ } }
    if (subgroup) {
      for (let t = 0; t < 3; t++) {
        try { rmdirSync(subgroup); break; } catch { await new Promise((r) => setTimeout(r, 50)); }
      }
    }
  }
}

/** CLI: `bun run omega:containment` — prints the verdict JSON (exit 0 always; a
 *  finding is a finding, advisory and unavailable are legitimate results). */
if (import.meta.main) {
  probeMemoryEnforcement().then((r) => {
    console.log(JSON.stringify(r, null, 2));
  }).catch((e) => {
    console.log(JSON.stringify({ verdict: "unavailable", reason: `probe crashed: ${errMsg(e)} — nothing is claimed (fail-closed)`, root: cgroupRoot(), subgroup: null, measurements: null }, null, 2));
  });
}
