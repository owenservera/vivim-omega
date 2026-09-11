// vivim.law — amendment.ts
// Shadow mode: every law.check evaluates BOTH the primary policy and a registered
// shadow policy; divergences are recorded (journal + report). The shadow NEVER
// swaps the live policy — the actual amendment is a recipe re-compile + atomic pin
// swap performed by the host ceremony (D-213), so this module only observes and reports.
import type { LawDecision } from "@vivim/omega-contracts";
import { cloneDoc, normalizeShadowSpec, type PolicyDoc, type ShadowSpec } from "./policy.ts";

export interface DivergenceRecord {
  ts: number;
  principal: string;
  op: string;
  causationId?: string;
  primary: Pick<LawDecision, "decision" | "reason">;
  shadow: Pick<LawDecision, "decision" | "reason">;
  shadowPolicyId: string;
}

export interface ShadowStatus {
  registered: boolean;
  policyId?: string;
  version?: string;
  description?: string;
  registeredAt?: number;
}

export interface AmendmentReport {
  shadow: ShadowStatus;
  divergences: DivergenceRecord[];
  count: number;
  swap: string; // how the real swap happens (never live, never from here)
}

export const AMENDMENT_SWAP_NOTE =
  "shadow policies never swap live policy; the amendment is a recipe re-compile + atomic pin swap (host ceremony, D-213)";

export class ShadowAmendment {
  private shadow: PolicyDoc | null = null;
  private registeredAt = 0;
  private divergences: DivergenceRecord[] = [];

  constructor(private primary: PolicyDoc) {}

  /** Register (or replace) the shadow policy. Returns the status snapshot. */
  registerShadow(spec: ShadowSpec): ShadowStatus {
    this.shadow = normalizeShadowSpec(this.primary, spec);
    this.registeredAt = Date.now();
    // a new shadow starts with a clean divergence ledger
    this.divergences = [];
    return this.status();
  }

  clearShadow(): ShadowStatus {
    this.shadow = null;
    return { registered: false };
  }

  isRegistered(): boolean {
    return this.shadow !== null;
  }

  doc(): PolicyDoc | null {
    return this.shadow ? cloneDoc(this.shadow) : null;
  }

  status(): ShadowStatus {
    if (!this.shadow) return { registered: false };
    const { policyId, version, description } = this.shadow;
    return { registered: true, policyId, version, description, registeredAt: this.registeredAt };
  }

  /**
   * Compare a resolved primary decision with the shadow's resolved decision for the
   * same call. Records and RETURNS the divergence when the decisions differ.
   */
  observe(
    principal: string,
    op: string,
    primary: Pick<LawDecision, "decision" | "reason">,
    shadowDecision: Pick<LawDecision, "decision" | "reason">,
    causationId?: string,
  ): DivergenceRecord | null {
    if (primary.decision === shadowDecision.decision) return null;
    const rec: DivergenceRecord = {
      ts: Date.now(),
      principal,
      op,
      ...(causationId !== undefined ? { causationId } : {}),
      primary: { decision: primary.decision, reason: primary.reason },
      shadow: { decision: shadowDecision.decision, reason: shadowDecision.reason },
      shadowPolicyId: this.shadow?.policyId ?? "none",
    };
    this.divergences.push(rec);
    return rec;
  }

  report(): AmendmentReport {
    return {
      shadow: this.status(),
      divergences: this.divergences.map((d) => ({ ...d })),
      count: this.divergences.length,
      swap: AMENDMENT_SWAP_NOTE,
    };
  }
}
