// @vivim/omega-sdk — client.ts
// The typed port client: a UX short-circuit in front of the port transport. The
// client REFUSES ops not in the granted set BEFORE sending (fail-fast for review
// UIs and plugin authors) — the host remains the security boundary (B3).
import type { PortResult } from "@vivim/omega-contracts";
import { HOST_OP_TO_CAP } from "@vivim/omega-contracts";

export interface PortCallOptions { deadlineMs?: number }

/** The transport the client wraps: exactly the shim's `ctx.port.call` / host `callAsRoot` shape. */
export type PortTransport = (op: string, payload: unknown, opts?: PortCallOptions) => Promise<PortResult>;

export interface PortClient {
  /** Call an op. REFUSES (no transport hop) when the op is not covered by `granted`. */
  call(op: string, payload?: unknown, opts?: PortCallOptions): Promise<PortResult>;
  /** Is this op covered by the granted set? (host-op aware) */
  can(op: string): boolean;
  /** The granted capability list (defensive copy). */
  readonly granted: string[];
}

/**
 * Build a typed client over a granted capability list. Grant grammar:
 * `port:<op>@<v>` for plugin ops, `host.*` capabilities (or their `port:host.*@1`
 * aliases) for host ops. `.call` short-circuits ungranted ops with a REFUSED
 * result — the host would refuse them anyway; this just fails 0 RTTs earlier.
 */
export function createPortClient(granted: string[], call: PortTransport): PortClient {
  const set = new Set(granted);

  const can = (op: string): boolean => {
    const hostCap = HOST_OP_TO_CAP[op];
    if (hostCap) return set.has(hostCap) || set.has(`port:${op}`);
    return set.has(`port:${op}`) || set.has(op);
  };

  return {
    can,
    get granted() { return [...granted]; },
    async call(op, payload = null, opts) {
      if (!can(op)) {
        return { ok: false, error: "REFUSED", detail: `client-side guard: op ${op} is not in the granted set (${granted.join(", ") || "no capabilities granted"})` };
      }
      return call(op, payload, opts);
    },
  };
}

// ---- grant description (review UIs) ------------------------------------------

export interface GrantGroup {
  kind: "host" | "port" | "other";
  label: string;   // "host capabilities" | "ops granted via echo.*" | "unrecognized"
  items: string[]; // sorted, deterministic
}

export interface GrantDescription {
  total: number;
  groups: GrantGroup[];
}

/**
 * Group a granted list for review UIs: host capabilities first, then port-op
 * grants grouped by namespace (the op's first dot-segment), then anything the
 * grammar doesn't recognize. Deterministic ordering — same input, same listing.
 */
export function describeGrants(granted: string[]): GrantDescription {
  const host: string[] = [];
  const byNamespace = new Map<string, string[]>();
  const other: string[] = [];

  for (const g of granted) {
    if (/^host\.[a-z0-9.-]+$/.test(g)) { host.push(g); continue; }
    if (/^port:[a-z0-9.-]+@[0-9]+$/.test(g)) {
      const op = g.slice("port:".length);
      const ns = op.split(".")[0] ?? "?";
      const list = byNamespace.get(ns) ?? [];
      list.push(op);
      byNamespace.set(ns, list);
      continue;
    }
    other.push(g);
  }

  const groups: GrantGroup[] = [];
  if (host.length) groups.push({ kind: "host", label: "host capabilities", items: [...host].sort() });
  for (const ns of [...byNamespace.keys()].sort()) {
    groups.push({ kind: "port", label: `ops via ${ns}.*`, items: (byNamespace.get(ns) ?? []).sort() });
  }
  if (other.length) groups.push({ kind: "other", label: "unrecognized", items: [...other].sort() });

  return { total: granted.length, groups };
}
