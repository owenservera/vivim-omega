// @vivim/omega-contracts — intent-phase3.ts (D-389 Phase 3)
// Output references, safe input mapping (JSON pointers), artifact references.

/** A safe, bounded projection reference from a prior step's output into a later step's input. */
export interface InputMapping {
  fromStepId: string;         // step whose output provides the value
  fromOutputPath: string;     // JSON Pointer (RFC 6901) into that output; bounded depth ≤4
  toPayloadKey: string;       // key in the receiving step's payload
}

/** Reference to an artifact produced by a step execution. */
export interface ArtifactReference {
  stepId: string;
  artifactName: string;        // user-declared label for the artifact
  contentType: string;         // MIME-style descriptor (e.g., "application/json")
  size?: number;               // bytes, for budget checks
  provenance: { ns: string; id: string; rev: number };
}

/** Plan-level extension for Phase 3: same-payload restriction lifted with safe projection. */
export interface PlanTemplateV2 {
  planType: string;
  planVersion: string;
  promoted: boolean;
  inputMappings?: InputMapping[];  // bounded: max 8 mappings, depth ≤4, keys must exist
  artifacts?: ArtifactReference[]; // produced artifacts declared up-front (not ambient)
  author: string;
  createdAt: number;
}
