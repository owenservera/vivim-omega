// tooling/gates/adapt.ts — D-446 (Ω-16 port of paper D-448): the Adaptation-Tier Constitution.
//
// Smart features are Adaptation Realizations: propose-only guests with
// badged row-state, mandatory deterministic fallbacks, absolute sovereign
// vetoes, and a global/scoped dumb kill-switch. The substrate survives every
// intelligence. Pure library (headless).
// Falsifier: F-ADAPT (`tooling/gates/test/f-adapt.test.ts`). Zero host LOC.

export interface AdaptationLayer { id: string; fallback: string; revoked: boolean; weightsRef: string | null; }
export interface Refusal { ok: false; code: string; sentence: string; }
export type AdaptResult<T> = { ok: true; value: T } | Refusal;

/** adaptation.register — fallback mandatory, or refused at the door. */
export function registerAdaptation(layer: AdaptationLayer): AdaptResult<AdaptationLayer> {
  if (!layer.fallback || layer.fallback.trim() === "") {
    return { ok: false, code: "ADAPT_NO_FALLBACK", sentence: "Adaptation layer failed to declare a deterministic fallback. Refused. The system must survive your absence." };
  }
  if (!layer.weightsRef) {
    return { ok: false, code: "ADAPT_HIDDEN_STATE", sentence: "Adaptation layer attempted to cache ML weights in ephemeral RAM. Refused. All state must be a vault row." };
  }
  return { ok: true, value: layer };
}

/** Direct execution attempt by an adaptation layer — always refused. */
export function directExec(layerId: string): Refusal {
  void layerId;
  return { ok: false, code: "ADAPT_DIRECT_EXEC", sentence: "Adaptation layer attempted to directly execute a capability. Refused. Adaptations may only propose." };
}

/** Proposal against a pinned principal act — veto absolute, conflict logged. */
export function vetoCheck(input: { pinned: boolean; layerId: string; objectRef: string }): AdaptResult<{ conflict: string | null }> {
  if (input.pinned) {
    return { ok: true, value: { conflict: `LAYOUT_PIN_CONFLICT ${input.objectRef}: adaptation ${input.layerId} yields to the sovereign veto` } };
  }
  return { ok: true, value: { conflict: null } };
}

/** Silent override attempt — always refused. */
export function silentOverride(): Refusal {
  return { ok: false, code: "ADAPT_SILENT_OVERRIDE", sentence: "Adaptation layer attempted to silently override a principal's manual layout. Refused. The principal's placement is absolute." };
}

export type DumbScope = "global" | string;

/** adaptation.dumb — global or scoped kill-switch; deterministic baselines carry on. */
export function dumbSwitch(active: Set<string>, scope: DumbScope): { active: Set<string>; fallenBack: string[] } {
  const next = new Set(active);
  const fallenBack: string[] = [];
  if (scope === "global") {
    for (const l of next) fallenBack.push(l);
    next.clear();
    return { active: next, fallenBack };
  }
  if (next.delete(scope)) fallenBack.push(scope);
  return { active: next, fallenBack };
}

/** Transparency audit: why did the aperture prefetch this. */
export function auditPrefetch(input: { scorer: string; confidence: number; inputs: string[]; badge: string }): string {
  return `prefetch by ${input.scorer} (${input.badge}) confidence ${input.confidence} from [${input.inputs.join(", ")}]`;
}
