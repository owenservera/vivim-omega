// Fixture tenant A: pollutes every channel a sloppy compartment could reach,
// at import (assign) time. No startPlugin — the pool assigns plugin code, the
// test terminates the worker directly (mirroring host release-termination).
import { box } from "./tenant-shared.ts";

(box as { value: unknown }).value = "tenant-a-secret";
const g = globalThis as Record<string, unknown>;
g.__bleed = "tenant-a-secret";
g.__ticks = 0;
g.__fn = () => "tenant-a-secret";
setInterval(() => {
  g.__ticks = ((g.__ticks as number) ?? 0) + 1;
}, 5);
