// Fixture: mutable module-level state for the pool bleed suite. Every isolate
// gets its OWN module registry, so a mutation here must never be visible from
// another checkout — observing it is a bleed proof.
export const box: { value: unknown } = { value: undefined };
