// @vivim/omega-nlcl-pure — the deterministic Natural Command Language Layer core (Ω11).
// ZERO imports outside this package. The exact same bytes run:
//   1. inside the vivim.nlcl compartment (nlcl.interpret@1),
//   2. in the web surface server (authoritative parse),
//   3. in the browser (keystroke-latency feedback against the replicated WorldModel).
// Determinism law N1: interpret(text, world) is pure — same input, same output, always.

export { interpret } from "./interpret.ts";
export { lex } from "./lexer.ts";
export { SYMBOL_FAMILIES, FAMILY_BY_CHAR, STOPWORDS, MODIFIER_WORDS } from "./symbols.ts";
export { DEFAULT_FRAMES, NCLL_VERSION, framesForWorld } from "./frames.ts";
export {
  ground, groundPhrase, entitySymbol, CONTEXT_WORDS,
  applyPriors, groundWithPriors, groundPhraseWithPriors,
} from "./ground.ts";
export { matchFrames, fillFrame, buildPayload, buildCanonical, buildReading, type Candidate } from "./grammar.ts";
export {
  recognizeHelp, recognizeEntityQuery, recognizeTeach, recognizeRule, recognizeReceive, recognizeInbox,
} from "./recognize.ts";
export { projectTokens, projectEffects } from "./project.ts";
export { fold, unquote, lev, slug, prettifyLocalPart, words } from "./text.ts";

export type {
  RiskClass, FamilyChar, PluginView, OpView, EntityView, LexiconEntry, RuleView, WorldModel,
  Interpretation, InterpStatus, Token, TokKind, EntityMatch, IRSlot, IR, TokenNote, EffectView,
  Suggestion, SuggestionKind, GapNote, GapKind, StageTrace, FamilyDef, SlotKind, FrameSlot, OpFrame,
  EntityPrior, ChannelPrior, VerbPrior, CorrectionPrior, BehaviorPriors,
  CapabilityView, GapRecord, AttachmentView, FocusView, PendingIntent,
  VisualSlotCard, VisualEntityChip, VisualChannelPicker, VisualRiskBadge, VisualSpec,
} from "./types.ts";

import type { WorldModel, EntityView } from "./types.ts";
import { prettifyLocalPart, slug } from "./text.ts";
import { NCLL_VERSION } from "./frames.ts";

/** Build an empty world (tests, fixtures, bootstrapping). */
export function emptyWorld(): WorldModel {
  return {
    v: 1, t: 0,
    kernel: { composition: "empty", nlclVersion: NCLL_VERSION, plugins: [] },
    ops: [], entities: [], lexicon: [], rules: [],
    context: { latestMessageId: null, latestEntityId: null },
  };
}

/** Derive a contact EntityView from an email address — the mind's contact derivation uses
 *  this exact function so derived contacts are byte-identical everywhere (N1). */
export function contactFromAddress(address: string, at?: number): EntityView {
  const addressFolded = address.toLowerCase();
  const local = addressFolded.split("@")[0] ?? addressFolded;
  const label = prettifyLocalPart(local);
  const labelFolded = label.toLowerCase();
  const names = [local, addressFolded, labelFolded, ...local.split(/[._-]+/).filter((s) => s.length >= 3)];
  return {
    id: `contact:${slug(local)}`,
    type: "contact",
    label,
    names: [...new Set(names)],
    data: { address: addressFolded },
    at,
  };
}
