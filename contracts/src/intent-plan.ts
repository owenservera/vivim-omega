// @vivim/omega-contracts — intent-plan.ts (PROPOSED D-389 Phase 2)
// Plan templates: data-only, immutable once promoted, same-payload DAGs.

export interface PlanStepTemplate {
  stepId: string;
  stepType: string;        // archetype slug (e.g. "media/image/resize")
  dependsOn: string[];     // stepIds in this plan; cycle-rejected at resolve time
}

export interface PlanTemplate {
  planType: string;         // matches Intent.type
  planVersion: string;      // versioned; promotion = new version, never edit
  steps: PlanStepTemplate[];
  promoted: boolean;        // must be PROMOTED for resolve.classify@1 to use (§3.6)
  author: string;           // explicitly-authorized writer (§3.5)
  createdAt: number;
}

/** Canonical plan-template vault id (§3.5, §3.6). */
export function planTemplateId(type: string, version: string): string {
  if (typeof type !== "string" || typeof version !== "string") {
    throw new Error("planTemplateId: type and version must be strings");
  }
  return `plan:${type}@${version}`;
}

/** Cycle detection for dependency graph (§3.6, §3.7). Returns null if acyclic. */
export function detectCycle(steps: PlanStepTemplate[]): string[] | null {
  const ids = new Set(steps.map(s => s.stepId));
  const adj = new Map<string, string[]>();
  for (const s of steps) adj.set(s.stepId, s.dependsOn.filter(id => ids.has(id)));

  const WHITE = 0, GRAY = 1, BLACK = 2;
  const color = new Map<string, number>();
  for (const id of ids) color.set(id, WHITE);

  const visit = (id: string, path: string[]): string[] | null => {
    color.set(id, GRAY);
    for (const d of adj.get(id) ?? []) {
      if (!ids.has(d)) continue;
      const c = color.get(d) ?? WHITE;
      if (c === GRAY) return [...path, id, d]; // cycle found
      if (c === WHITE) {
        const r = visit(d, [...path, id]);
        if (r) return r;
      }
    }
    color.set(id, BLACK);
    return null;
  };
  for (const id of ids) {
    if (color.get(id) === WHITE) {
      const r = visit(id, [id]);
      if (r) return r;
    }
  }
  return null;
}

/** Max depth guard (§3.6). */
export function maxDependencyDepth(steps: PlanStepTemplate[]): number {
  const depth = new Map<string, number>();
  const compute = (id: string): number => {
    if (depth.has(id)) return depth.get(id)!;
    const s = steps.find(st => st.stepId === id);
    if (!s || s.dependsOn.length === 0) {
      depth.set(id, 1);
      return 1;
    }
    const maxParent = Math.max(...s.dependsOn.map(p => compute(p)));
    depth.set(id, maxParent + 1);
    return maxParent + 1;
  };
  return Math.max(...steps.map(s => compute(s.stepId)));
}
