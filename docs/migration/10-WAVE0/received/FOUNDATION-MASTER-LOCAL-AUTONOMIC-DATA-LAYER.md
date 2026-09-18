# FOUNDATION MASTER — Local Autonomic Data Layer

| Field | Value |
| --- | --- |
| **Status** | **MASTER**. Consolidates DRAFT-002, DRAFT-003, and DRAFT-004 into one authoritative single-machine spec. Supersedes all three as separate documents; nothing below is provisional. |
| **Date** | 2026-09-16 |
| **Scope** | One local machine. One broker. No network peers, no cluster, no cross-node anything. Every claim in this document is meant to be true on a single box or not claimed at all. |
| **Authority chain** | `../INTENT.md` → `STRATEGY-OMEGA-PLUGIN-REBUILD.md` → this document |
| **Verification owed** | §9 (full falsifier set) |

---

## 1. Core Principles

- **Broker-not-host placement.** All runtime logic — process spawning, WASM instantiation, resource accounting — lives in `plugins/runtime-broker/`, never injected into the host application. The host talks to the broker only through the Port Protocol and has no direct knowledge of processes, WASM instances, or OS primitives.
- **`platform/`-confined OS awareness.** Any code touching OS-specific syscalls, cgroups, Job Objects, or file-descriptor limits lives under `platform/`, behind a portable interface. Nothing outside `platform/` branches on operating system.
- **Supersede discipline.** A revision to this document must state explicitly what changed and why. Nothing is dropped silently.
- **Additive-only manifests.** Capability manifests are never mutated in place. New capabilities are added as new entries with their own content hash; old entries are deprecated, not deleted, preserving auditability.
- **Refusal by default.** A WASM module requesting a capability outside its declared manifest is refused at the host-call boundary, not sandboxed-and-logged. Grants are explicit and enumerated; everything else is refused.

---

## 2. Multi-Runtime Execution

Three execution tiers, selected per-capability by trust and performance need:

1. **Worker tier** — in-process, same-language, lowest overhead. For trusted first-party logic only.
2. **Process tier** — OS-level process isolation (cgroups on Linux, Job Objects on Windows). For plugins that need an OS resource boundary without full sandbox overhead.
3. **WASM tier** — WASI-based sandboxing with fuel metering. For untrusted or third-party plugin code. Fuel limits bound compute; refusal semantics (§1) bound capability access.

Resource enforcement across all three tiers starts reactive: a cgroup or Job Object limit is set at spawn time, and the OS terminates the process on breach. This is the backstop and it is always present. §3 adds an earlier, softer intervention layer in front of it — it narrows the window in which the hard kill fires, it does not replace it.

---

## 3. Predictive Local Resource Control

### 3.1 Kernel-level signal monitoring

File: `platform/src/autonomic-monitor.ts`

```typescript
// platform/src/autonomic-monitor.ts
// Reads existing kernel-exposed signals (e.g. via eBPF on Linux, or
// platform-appropriate equivalents elsewhere) through standard syscalls
// from the platform harness. No kernel modules, no host modification,
// no elevated install step beyond what profiling tools already require.
//
// Scope: monitors processes and WASM compartments spawned by THIS broker,
// on THIS machine. There is no cross-machine signal.

export interface AutonomicSignal {
  type: "ALLOCATION_VELOCITY_HIGH" | "SYSCALL_STALL" | "CACHE_THRASH";
  pid: number;
  compartmentId?: string; // set if the pid maps to a WASM compartment
  velocity: number;       // rate of degradation, implementation-defined units
  observedAtMs: number;
}

export interface AutonomicMonitor {
  watch(pid: number, onSignal: (s: AutonomicSignal) => void): () => void; // returns unsubscribe
}
```

### 3.2 Response: throttle before kill

File: `plugins/runtime-broker/src/fuel-throttle.ts`

```typescript
// plugins/runtime-broker/src/fuel-throttle.ts
// On a signal crossing threshold, the broker reduces the WASM compartment's
// fuel limit mid-flight, slowing execution rather than terminating it.
// This narrows the chance of hitting the OS hard limit for workloads with
// a gradual allocation ramp. It does NOT catch sudden, non-ramping spikes —
// those still hit the reactive OS-level limit in §2, which remains the
// final backstop in every case.

export class FuelThrottleController {
  async onSignal(signal: AutonomicSignal, compartment: WasmCompartment): Promise<void> {
    if (signal.type === "ALLOCATION_VELOCITY_HIGH" && signal.velocity > this.threshold) {
      await compartment.reduceFuelLimit(this.computeSafeFuelLimit(signal));
      this.telemetry.emit("PREDICTIVE_THROTTLE", { compartmentId: signal.compartmentId, signal });
    }
    // If throttling doesn't bring velocity below threshold within the
    // configured grace window, control falls through to the existing
    // reactive OS-level limit unchanged.
  }
}
```

### 3.3 Platform dependency

Signal granularity is platform-dependent: richest on Linux via eBPF, more limited elsewhere via whatever profiling API the OS exposes. `AutonomicMonitor` is deliberately abstract so `platform/` implementations can differ per-OS without leaking OS specifics upward.

---

## 4. Storage Routing and Local-First Durability

### 4.1 Hot/cold routing

File: `plugins/vivim-vault/src/storage-router.ts`

`StorageRouter` classifies data as hot (SQL primary) or cold (object-store fallback) and routes writes to primary first, falling back to object storage on primary unavailability. A write acknowledged by either tier is durable; no data is lost for writes already acknowledged.

### 4.2 Local durable log

File: `plugins/vivim-vault/src/local-durable-log.ts`

```typescript
// plugins/vivim-vault/src/local-durable-log.ts
// A write is appended to a local, fsync'd write-ahead log immediately,
// before it round-trips to the primary store. The caller's durability
// guarantee comes from the local fsync, not from waiting on the primary
// store. The primary store is then updated asynchronously from the log.
//
// There is exactly one writer (this machine), so there is no multi-writer
// conflict to resolve — replay on crash recovery is fully deterministic,
// strictly ordered by local sequence ID.

export interface LocalWriteRecord {
  sequenceId: number;   // monotonic, local to this machine
  payload: Uint8Array;
  targetTable: string;
  writtenAtMs: number;
}

export class LocalDurableLog {
  async append(record: Omit<LocalWriteRecord, "sequenceId">): Promise<LocalWriteRecord> {
    const withSeq = { ...record, sequenceId: this.nextSequenceId() };
    await this.log.appendAndFsync(withSeq);
    this.applyQueue.push(withSeq);
    return withSeq;
  }

  async replayFromCrash(): Promise<void> {
    const unconfirmed = await this.log.readUnconfirmed();
    for (const record of unconfirmed) {
      await this.applyToPrimary(record);
    }
  }
}
```

`LocalDurableLog` sits in front of `StorageRouter`. It changes *when* a caller is told a write is safe (immediately, on local fsync) — it does not change *where* the data eventually lands, and it does not alter the router's existing primary/fallback logic.

---

## 5. Hardware-Rooted Trust for Sensitive Operations

### 5.1 Baseline trust: the sandbox boundary

The default trust boundary is the WASM sandbox itself: a module can't do what its manifest doesn't grant (§1). This holds for all capabilities and requires no special hardware.

### 5.2 Elevated trust: local TEE

For capabilities marked `sensitivity: "critical"` — credential use, PII handling — a stronger guarantee is available on hardware that supports it.

File: `plugins/runtime-broker/src/tee-enclave.ts`

```typescript
// plugins/runtime-broker/src/tee-enclave.ts
// Runs the WASM runtime inside a local hardware enclave (e.g. Intel SGX or
// AMD SEV-SNP, via Gramine or a comparable local shim) on THIS machine.
// The host OS cannot read the enclave's linear memory, even if the host OS
// itself has been compromised. This is a single-machine trust boundary —
// it makes no claim about network transport, because none is involved.
//
// Requires enclave-capable hardware with the necessary firmware/BIOS
// support enabled. Availability is a hardware fact, checked at runtime,
// not assumed.

export interface ExecutionProof {
  runtimeHash: string;         // hash of the WASM module + WIT bindings
  inputHash: string;           // hash of the input arguments
  outputHash: string;          // hash of the output state
  teeAttestation: Uint8Array;  // hardware quote from the local enclave
}

export class TEECompartment extends WasmCompartment {
  async invoke(req: PortRequest): Promise<PortResponse & { proof: ExecutionProof }> {
    const result = await super.invoke(req);
    const quote = await this.enclave.getAttestationQuote();
    const proof: ExecutionProof = {
      runtimeHash: this.moduleHash,
      inputHash: hash(req),
      outputHash: hash(result),
      teeAttestation: quote,
    };
    return { ...result, proof };
  }
}
```

### 5.3 Verification and explicit degradation

File: `contracts/src/execution-proof.ts`

```typescript
export interface ExecutionProof {
  runtimeHash: string;
  inputHash: string;
  outputHash: string;
  teeAttestation: Uint8Array; // required whenever proof is present
}

export interface VerifiableStorageResult extends StorageResult {
  proof?: ExecutionProof; // present only when routed through a TEECompartment
}
```

The Vault Spine verifies `teeAttestation` against the local enclave hardware's root of trust before accepting a state mutation from a `sensitivity: "critical"` capability. If enclave hardware is unavailable on this machine, the Spine does **not** silently fall back to an unverified WASM compartment for critical-sensitivity operations — it refuses the operation and surfaces `TEE_UNAVAILABLE`, consistent with refusal-by-default (§1). Whether to permit an explicit, logged opt-down to WASM-only trust on non-enclave hardware is a deployment policy decision, never a silent default.

---

## 6. Reviewed Capability Synthesis

### 6.1 Purpose

When the Spine encounters a missing capability (e.g. `storage.parse:pdf-v2`), a candidate implementation can be drafted automatically. Registration into the live router is always a separate, explicit, human-approved step — nothing synthesizes and deploys unattended.

File: `plugins/capability-synthesizer/src/index.ts`

```typescript
// plugins/capability-synthesizer/src/index.ts
export class CapabilitySynthesizer {
  async draftCandidate(missingCapability: string, schema: unknown): Promise<SynthesisCandidate> {
    const rustCode = await this.llm.invoke(
      `Generate a Rust Wasm module implementing ${missingCapability} for schema: ${JSON.stringify(schema)}`
    );
    const wasmBytes = await this.wasmToolchain.build(rustCode);
    const fuzzReport = await this.fuzzer.run(wasmBytes, schema, { durationSeconds: this.config.fuzzDurationSeconds });

    return {
      missingCapability,
      rustCode,
      wasmBytes,
      fuzzReport,
      status: "AWAITING_HUMAN_REVIEW",
    };
  }

  // Registration is a distinct, explicit call — never invoked automatically
  // by draftCandidate(). Requires a candidate whose status has been set to
  // APPROVED by a human reviewer (or a named accountable approval workflow)
  // after reading rustCode and fuzzReport.
  async registerApprovedCandidate(candidate: SynthesisCandidate, approvedBy: string): Promise<string> {
    if (candidate.status !== "APPROVED") {
      throw new Error("SYNTHESIS: cannot register a candidate that has not been explicitly approved");
    }
    const hash = await this.registry.publish(candidate.wasmBytes);
    this.spineRouter.registerCapability(candidate.missingCapability, hash, { approvedBy });
    return hash;
  }
}
```

### 6.2 Fuzz window

`fuzzDurationSeconds` is a configuration value, set according to the complexity of the target capability. It is one input to human review, not a pass/fail gate that alone justifies deployment.

---

## 7. Contracts Summary

Everything below is single-machine. No field encodes node identity, cluster membership, or network topology.

```typescript
// contracts/src/execution-proof.ts
export interface ExecutionProof {
  runtimeHash: string;
  inputHash: string;
  outputHash: string;
  teeAttestation: Uint8Array;
}

export interface VerifiableStorageResult extends StorageResult {
  proof?: ExecutionProof;
}

// contracts/src/local-durable-log.ts
export interface LocalWriteRecord {
  sequenceId: number;
  payload: Uint8Array;
  targetTable: string;
  writtenAtMs: number;
}
```

---

## 8. Explicit Non-Goals

Stated plainly, so scope creep back toward distributed claims requires a deliberate, documented decision rather than a quiet drift:

- **No cross-node migration.** Nothing in this document moves a running compartment to another machine, because no other machine is assumed to exist.
- **No multi-writer conflict resolution.** `LocalDurableLog` has exactly one writer. If a future revision introduces multiple machines, this section must be re-derived from scratch, not extended.
- **No zero-knowledge proofs of arbitrary execution.** Trust for critical operations comes from TEE hardware attestation (§5), not from proving general computation in zero-knowledge — that remains an open problem at this scope and is not claimed here.
- **No autonomous production deployment of synthesized code.** §6 always terminates in a human approval step before registration.

---

## 9. Falsifier Set

1. **Isolation.** An out-of-manifest syscall attempted by a Process-tier or Worker-tier plugin is refused at the host-call boundary.
2. **Fuel metering.** A WASM compartment exceeding its declared fuel budget is terminated with no partial state leaked to the host.
3. **Storage failover.** `StorageRouter` fails over from primary to fallback store on primary unavailability with no loss of already-acknowledged writes.
4. **Artifact integrity.** A content-hashed artifact with a tampered hash is refused before being loaded into any runtime tier.
5. **Predictive throttle.** Under a synthetic *gradual* memory-allocation ramp in a WASM compartment, `FuelThrottleController` reduces the compartment's fuel limit and emits `PREDICTIVE_THROTTLE` before the OS-level cgroup limit would terminate the process. A *sudden*, non-ramping spike is expected to still hit the hard limit — this falsifier claims improvement only for the gradual case.
6. **Crash durability.** A write is appended via `LocalDurableLog.append()` and fsync-confirmed. The broker process is then killed with `SIGKILL` before the write reaches the primary store. On restart, `replayFromCrash()` applies the write exactly once — not zero times, not duplicated.
7. **TEE rejection.** On enclave-capable hardware, a mock tampering attempt against a `credential.use` operation's output, while it runs inside a `TEECompartment`, causes the Vault Spine to reject the mutation on attestation failure. On non-enclave hardware, the same `sensitivity: "critical"` request returns `TEE_UNAVAILABLE` rather than executing unverified.
8. **Synthesis gating.** After `CapabilitySynthesizer.draftCandidate()` runs for a missing capability, a direct call to that capability continues to be refused until `registerApprovedCandidate()` is called with `status: "APPROVED"` — confirming no autonomous registration path exists.
