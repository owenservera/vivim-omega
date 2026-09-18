// tooling/generate/format.ts — THE canonical JSON formatter for compositions.
// W0-1/D-377: one formatter, zero hand-formatting drift. House style (matches
// the shipped specs): containers render inline when their single-line form fits
// the width budget, otherwise one item per line; scalars (including long notes)
// always render inline; two-space indent; no trailing spaces; file ends "\n".
// Pure function of the parsed value — parse∘render is idempotent by construction.

export const FORMAT_WIDTH = 120;

export type Json = null | boolean | number | string | Json[] | { [k: string]: Json };

function isContainer(v: Json): v is Json[] | { [k: string]: Json } {
  return Array.isArray(v) || (typeof v === "object" && v !== null);
}

/** Single-line render: `{ "k": v, … }` / `[a, b]` / `[]` / `{}` (house spacing). */
export function inline(v: Json): string {
  if (v === null) return "null";
  if (typeof v === "boolean" || typeof v === "number") return String(v);
  if (typeof v === "string") return JSON.stringify(v);
  if (Array.isArray(v)) return `[${v.map(inline).join(", ")}]`;
  const keys = Object.keys(v);
  if (keys.length === 0) return "{}";
  return `{ ${keys.map((k) => `${JSON.stringify(k)}: ${inline(v[k])}`).join(", ")} }`;
}

/** Multi-line-capable render at the given indent (2 spaces per level). */
export function render(v: Json, indent = 0): string {
  const pad = "  ".repeat(indent);
  const one = inline(v);
  if (pad.length + one.length <= FORMAT_WIDTH || !isContainer(v)) return one;
  const padIn = "  ".repeat(indent + 1);
  if (Array.isArray(v)) {
    if (v.length === 0) return "[]";
    return `[\n${v.map((item) => padIn + render(item, indent + 1)).join(",\n")}\n${pad}]`;
  }
  const keys = Object.keys(v);
  if (keys.length === 0) return "{}";
  return `{\n${keys.map((k) => `${padIn}${JSON.stringify(k)}: ${render(v[k], indent + 1)}`).join(",\n")}\n${pad}}`;
}

// ---- composition spec emission (the shape the 16 shipped specs share) ----

export interface SpecEntry {
  id: string;
  source: string;
  bootPhase: number;
  grant: { capabilities: string[]; contracts: string[] };
  config?: Record<string, Json>;
}

/** Canonical spec document: keys in the house order (name, _note?, entries),
 *  entry keys (id, source, bootPhase, grant, config?), grant keys (capabilities,
 *  contracts), config omitted when absent. Returns the FILE text (trailing \n). */
export function emitSpec(name: string, note: string | null, entries: SpecEntry[]): string {
  const spec: Record<string, Json> = { name };
  if (note !== null) spec["_note"] = note;
  spec["entries"] = entries.map((e) => {
    const out: Record<string, Json> = {
      id: e.id,
      source: e.source,
      bootPhase: e.bootPhase,
      grant: { capabilities: e.grant.capabilities, contracts: e.grant.contracts },
    };
    if (e.config !== undefined) out["config"] = e.config;
    return out as Json;
  });
  return render(spec as Json) + "\n";
}
