// nlcl-pure/src/ground.ts — entity grounding: a name mention → ranked WorldModel entities.
// Deterministic thresholds (N1): exact > word-prefix > prefix > fuzzy(edit distance) >
// substring. Ties keep world order. This is THE gap-narrowing surface: every mention shows
// what the machine understood, with alternatives.

import type { EntityMatch, EntityView, WorldModel, BehaviorPriors } from "./types.ts";
import { fold, lev, words } from "./text.ts";

export const CONTEXT_WORDS = new Set(["this", "that", "it", "them", "they", "latest", "last", "newest", "current"]);

export interface GroundResult {
  matches: EntityMatch[];
  primary: EntityMatch | null;   // top match (ties → primary = first, flagged ambiguous)
  ambiguous: boolean;            // 2+ entities share the top score
}

function bestScoreForAlias(name: string, alias: string): number {
  const n = fold(name);
  const a = fold(alias);
  if (n.length === 0 || a.length === 0) return 0;
  if (n === a) return 1;
  const nw = n.split(/[\s._-]+/).filter(Boolean);
  const aw = a.split(/[\s._-]+/).filter(Boolean);
  // FULL NAME match across separator styles: "peter zhang" ≡ "peter.zhang" (word-set equal)
  if (nw.length > 1 && aw.length > 1 && nw.join(" ") === aw.join(" ")) return 0.98;
  // single-word mention matching a whole word of the alias ("peter" in "peter miller")
  if (nw.length === 1 && aw.includes(n) && n.length >= 3) return 0.9;
  // single-word mention prefixing the alias string ("pete" → "peter.miller")
  if (nw.length === 1 && n.length >= 3 && a.startsWith(n)) return 0.82;
  // fuzzy: distance 1 for names ≥ 5 chars; distance 2 for names ≥ 7 chars
  if (n.length >= 5) {
    const d = lev(n, a, 2);
    if (d <= 1) return 0.72;
    if (n.length >= 7 && d <= 2) return 0.58;
  }
  // substring (min 4)
  if (n.length >= 4 && a.includes(n)) return 0.6;
  if (a.length >= 4 && n.includes(a)) return 0.55;
  return 0;
}

/** Ground a mention against entities (optional type filter). Cap: 8 matches. */
export function ground(name: string, entities: EntityView[], typeFilter?: string[]): GroundResult {
  const matches: EntityMatch[] = [];
  for (const entity of entities) {
    if (typeFilter && !typeFilter.includes(entity.type)) continue;
    let best = 0;
    let reason = "";
    for (const alias of entity.names) {
      const s = bestScoreForAlias(name, alias);
      if (s > best) { best = s; reason = `alias "${alias}"`; }
    }
    if (best >= 0.55) {
      matches.push({ entity, score: best, reason: `${reason} (${best === 1 ? "exact" : best >= 0.82 ? "prefix" : best >= 0.72 ? "fuzzy" : "partial"})` });
    }
  }
  matches.sort((a, b) => b.score - a.score || a.entity.id.localeCompare(b.entity.id));
  const capped = matches.slice(0, 8);
  const primary = capped.length > 0 ? capped[0] : null;
  const ambiguous = capped.length > 1 && primary !== null && Math.abs(capped[1].score - primary.score) < 0.01;
  return { matches: capped, primary, ambiguous };
}

/** Resolve a context word ("this") → the referent entity from world context. */
export function resolveContext(word: string, world: WorldModel, typeFilter?: string[]): EntityView | null {
  const w = fold(word);
  if (!CONTEXT_WORDS.has(w)) return null;
  const wantId = typeFilter?.includes("message") || !typeFilter
    ? world.context.latestMessageId
    : world.context.latestEntityId;
  if (!wantId) return null;
  return world.entities.find((e) => e.id === wantId) ?? null;
}

/** The '@'-symbol suffix convention: contact:peter-miller → "peter-miller". */
export function entitySymbol(entity: EntityView): string {
  const suffix = entity.id.includes(":") ? entity.id.split(":").slice(1).join(":") : entity.id;
  return `@${suffix}`;
}

/** Value extraction for payload mapping (contact → address, message → id). */
export function entityPayloadValue(entity: EntityView, role: string): unknown {
  const d = entity.data ?? {};
  if (entity.type === "contact") return d["address"] ?? entity.label;
  if (entity.type === "message") return d["id"] ?? entity.id.split(":")[1] ?? entity.id;
  if (entity.type === "rule") return entity.id.split(":")[1] ?? entity.id;
  void role;
  return d["id"] ?? entity.id;
}

/** Suggest entities for an unfilled slot (deterministic, top N by recency). */
export function suggestEntities(entities: EntityView[], typeFilter: string[], cap = 5): EntityView[] {
  return entities
    .filter((e) => typeFilter.includes(e.type))
    .slice(0, cap);
}

/** Match helper for multiword mentions ("peter miller"): try the phrase, then the last word. */
export function groundPhrase(phrase: string, entities: EntityView[], typeFilter?: string[]): GroundResult {
  const direct = ground(phrase, entities, typeFilter);
  if (direct.matches.length > 0 || /\s/.test(phrase.trim()) === false) return direct;
  const ws = words(phrase);
  if (ws.length >= 2) {
    const lastWord = ws[ws.length - 1];
    const byLast = ground(lastWord, entities, typeFilter);
    if (byLast.matches.length > 0) return byLast;
  }
  return direct;
}

// ===========================================================================
// Ω13.5 — prior-aware grounding (learned ranking, deterministic, non-deciding)
// ===========================================================================

/**
 * Apply learned priors to a grounding result: deterministic re-ranking + correction
 * tiebreak. RANKING ONLY — never adds/removes entities, never decides execution,
 * never bypasses a gate. Pure given (result, priors, mention, slotRole).
 */
export function applyPriors(
  result: GroundResult,
  priors: BehaviorPriors | undefined,
  mention: string,
  slotRole: string,
): GroundResult {
  if (!priors || result.matches.length === 0) return result;
  const folded = mention.toLowerCase();
  const entityPriorById = new Map((priors.entities ?? []).map((p) => [p.entityId, p] as const));
  const correction = (priors.corrections ?? []).find(
    (c) => c.inputText === folded && c.slotRole === slotRole,
  );
  const rescored: EntityMatch[] = result.matches.map((m) => {
    let score = m.score;
    const prior = entityPriorById.get(m.entity.id);
    if (prior) score = Math.min(1, score * 0.7 + prior.score * 0.3); // blend, ranking only
    if (correction) {
      if (correction.chosenEntityId === m.entity.id) score = Math.min(1, score + 0.25);
      if (correction.rejectedEntityIds.includes(m.entity.id)) score = Math.max(0, score - 0.25);
    }
    return { ...m, score };
  });
  rescored.sort((a, b) => b.score - a.score || a.entity.id.localeCompare(b.entity.id));
  const capped = rescored.slice(0, 8);
  const primary = capped.length > 0 ? capped[0] : null;
  const ambiguous = capped.length > 1 && primary !== null
    && Math.abs(capped[1].score - primary.score) < 0.01;
  return { matches: capped, primary, ambiguous };
}

/** ground() + learned priors (backward compatible: priors optional). */
export function groundWithPriors(
  name: string,
  entities: EntityView[],
  priors: BehaviorPriors | undefined,
  slotRole: string,
  typeFilter?: string[],
): GroundResult {
  return applyPriors(ground(name, entities, typeFilter), priors, name, slotRole);
}

/** groundPhrase() + learned priors (backward compatible: priors optional). */
export function groundPhraseWithPriors(
  phrase: string,
  entities: EntityView[],
  priors: BehaviorPriors | undefined,
  slotRole: string,
  typeFilter?: string[],
): GroundResult {
  return applyPriors(groundPhrase(phrase, entities, typeFilter), priors, phrase, slotRole);
}
