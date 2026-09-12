// @vivim/omega-contracts — variation.ts
// A Variation is one of possibly several concurrently-valid realizations of the same
// canonical contract id — not a candidate competing for one slot.
//
// A provider may legitimately expose more than one live realization at once
// (toolbar button AND keyboard shortcut for `email.archive@1`). Mapping's
// legacy output (MappingReport with a best-pick binding + recorded alternatives)
// treats non-winners as surplus; Variations promote those alternatives to
// first-class entities with their own status lifecycle and evidence.
// Each Variation promotes independently through discovery.verify@1;
// several Variations for one contractId may sit at PROMOTED simultaneously
// (routing preference among them is vivim.law policy, not mapping state).
import type { RealizationStatus, VaultProvenanceRef } from "./vocabulary.ts";

export type VariationChannel =
  | "UI_ELEMENT"      // toolbar button, menu item, icon
  | "KEYBOARD"        // shortcut
  | "MENU_PATH"       // multi-step overflow/nested menu
  | "NETWORK_DIRECT"; // API call bypassing UI entirely

export interface Variation {
  contractId: string;          // "email.archive@1" — the canonical op this realizes
  providerId: string;          // manifest id of the provider plugin
  channel: VariationChannel;
  status: RealizationStatus;   // DRAFT|TESTING|PROMOTED|DEGRADED|REQUIRES_REDISCOVERY
  selectorOrPath: unknown;     // channel-specific: CSS selector, key combo, menu path array
  evidence: VaultProvenanceRef[];
  discoveredAt: string;        // ISO timestamp
  lastVerifiedAt?: string;
}
