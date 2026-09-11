// nlcl-pure/src/text.ts — deterministic text utilities. No regex backtracking traps,
// no locale dependence, no clocks, no randomness (N1).

/** Lowercase + strip diacritics + collapse inner whitespace. Peter/Péter/pETER → "peter". */
export function fold(s: string): string {
  const lowered = s.toLowerCase().normalize("NFD");
  let out = "";
  for (const ch of lowered) {
    const code = ch.codePointAt(0)!;
    if (code >= 0x0300 && code <= 0x036f) continue; // combining diacritical marks
    if (ch === "\t" || ch === "\n") out += " ";
    else out += ch;
  }
  return out.replace(/\s+/g, " ").trim();
}

/** Strip leading/trailing quote marks and smart quotes. */
export function unquote(s: string): string {
  const t = s.trim();
  const pairs: Array<[string, string]> = [["'", "'"], ['"', '"'], ["“", "”"], ["‘", "’"], ["«", "»"]];
  for (const [a, b] of pairs) {
    if (t.length >= 2 && t.startsWith(a) && t.endsWith(b)) return t.slice(a.length, t.length - b.length);
  }
  return t;
}

/** Bounded Levenshtein (returns > cap fast when clearly farther). */
export function lev(a: string, b: string, cap = 2): number {
  if (Math.abs(a.length - b.length) > cap) return cap + 1;
  const n = a.length, m = b.length;
  if (n === 0) return m;
  if (m === 0) return n;
  let prev = new Array<number>(m + 1);
  let cur = new Array<number>(m + 1);
  for (let j = 0; j <= m; j++) prev[j] = j;
  for (let i = 1; i <= n; i++) {
    cur[0] = i;
    let best = cur[0];
    for (let j = 1; j <= m; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost);
      if (cur[j] < best) best = cur[j];
    }
    if (best > cap) return cap + 1;
    const swap = prev; prev = cur; cur = swap;
  }
  return prev[m];
}

/** True edit-distance match class for verb lookup (deterministic thresholds). */
export type VerbMatchClass = "exact" | "taught" | "fuzzy";

export function classifyVerb(norm: string, builtinVerbs: string[], taughtVerbs: string[]): { cls: VerbMatchClass; verb: string } | null {
  if (builtinVerbs.includes(norm)) return { cls: "exact", verb: norm };
  if (taughtVerbs.includes(norm)) return { cls: "taught", verb: norm };
  // fuzzy only for words of length ≥ 5, distance ≤ 1 (a conservative, quiet autocorrect)
  if (norm.length >= 5) {
    for (const v of builtinVerbs) {
      if (Math.abs(v.length - norm.length) <= 1 && lev(norm, v, 1) <= 1) return { cls: "fuzzy", verb: v };
    }
    for (const v of taughtVerbs) {
      if (Math.abs(v.length - norm.length) <= 1 && lev(norm, v, 1) <= 1) return { cls: "fuzzy", verb: v };
    }
  }
  return null;
}

/** Split a folded phrase into words (for alias token matching). */
export function words(s: string): string[] {
  return fold(s).split(/[\s,;]+/).filter(Boolean);
}

/** Deterministic slug: lowercase, diacritics stripped, non-alphanumerics → "-". */
export function slug(s: string): string {
  const f = fold(s);
  let out = "";
  for (const ch of f) {
    if (/[a-z0-9]/.test(ch)) out += ch;
    else if (out.length > 0 && !out.endsWith("-")) out += "-";
  }
  return out.replace(/-+$/g, "") || "x";
}

/** Title-case a local part: "peter.miller" → "Peter Miller". */
export function prettifyLocalPart(local: string): string {
  return local
    .split(/[._-]+/)
    .filter(Boolean)
    .map((seg) => (seg.length > 0 ? seg[0].toUpperCase() + seg.slice(1) : seg))
    .join(" ");
}
