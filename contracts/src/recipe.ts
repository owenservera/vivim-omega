// @vivim/omega-contracts — recipe.ts
// The composition: the only grantor. Pinned in D3 03-WAVE-SPECS §1 (source/manifestPath
// are v1 additions for local content addressing; they become transport refs later).

export interface CompositionEntry {
  id: string;
  version: string;
  source: string;       // plugin content dir (relative to the recipe's build dir)
  manifestPath: string; // signed manifest file (relative to the recipe's build dir)
  manifestHash: string; // "sha256:<hex>" over the signed manifest file bytes
  contentHash: string;  // "sha256:<hex>" over the plugin content dir
  grant: {
    capabilities: string[]; // "port:echo.ping@1" | "vault.append" | "host.compartment.admin" | "host.journal.append"
    contracts: string[];    // ops for which THIS entry is the routed implementation
  };
  bootPhase: number;    // 0 = vivim.law — the µhost refuses any other assignment
  config?: Record<string, unknown>; // data passthrough (never authority): the plugin's declared config
}

export interface Recipe {
  recipeVersion: 1;
  hashAlgo: "sha256";  // pinned field: algorithm changes are Recipe-level events
  name: string;
  composition: CompositionEntry[];
  rootOfTrust: { keyId: string; publicKey: string }; // ed25519 raw public key, base64
  signature: string;   // ed25519 over canonical JSON of everything above
}

/** Human-authored composition source (no hashes, no signatures) — compiled by the host's ceremony. */
export interface CompositionSpecEntry {
  id: string;
  source: string;      // plugin dir, relative to the spec file
  bootPhase: number;
  grant: { capabilities: string[]; contracts: string[] };
  config?: Record<string, unknown>;
}

export interface CompositionSpec {
  name: string;
  entries: CompositionSpecEntry[];
}
