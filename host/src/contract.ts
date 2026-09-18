// µhost — contract.ts: versioned tool contracts decoupled from implementations (kernel
// requirement #4) with per-execution generation pinning (#9). Host-side per D-340:
// resolve() sits on the same hot dispatch path as graph.ts::whoOffers — an in-flight
// caller must never be yanked to a newer, possibly-incompatible generation mid-call.
// A dispatch frame holds its resolved target for the full await: that held reference
// IS the Ω GenerationPin. Generations are APPEND-ONLY — publishing never removes a
// prior one, so retirement is a separate explicit decision, never a side effect.
// Range grammar v1: Ω's existing DependencyRef convention ("1.x" prefix | "*" | exact
// version) — no second range grammar is introduced (D-340 §1.4).
export interface GenerationPin { version: string; impl: string }

export class ToolRegistry {
  private generations = new Map<string, GenerationPin[]>();

  publish(name: string, version: string, impl: string): void {
    const list = this.generations.get(name) ?? [];
    list.push({ version, impl });
    this.generations.set(name, list);
  }

  /** Newest generation matching the caller's declared range. */
  resolve(name: string, range: string): GenerationPin | undefined {
    const list = this.generations.get(name);
    if (!list) return undefined;
    for (let i = list.length - 1; i >= 0; i--) if (matchesRange(list[i].version, range)) return list[i];
    return undefined;
  }

  latest(name: string): GenerationPin | undefined { const l = this.generations.get(name); return l?.[l.length - 1]; }
  generationCount(name: string): number { return this.generations.get(name)?.length ?? 0; }
}

export function matchesRange(version: string, range: string): boolean {
  if (range === "*" || range === "" || range === "latest") return true;
  if (range.endsWith(".x")) return version.split(".")[0] === range.slice(0, -2); // "1.x" matches any 1-series ("1", "1.2")
  return version === range;
}
