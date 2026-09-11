// vivim.vault — index.ts (Ω2), the vault spine plugin (wiring only: onInit/onShutdown + ops).
//
// Ops exposed (CONTRACT contributions, see plugin.json):
//   vault.append@1    MUTATION         — new revision: CAS blob + objects row + FTS + Merkle link
//   vault.get@1       READ             — latest or specific revision (hot, cold fallback)
//   vault.query@1     READ             — latest revision per id in a ns (idPrefix/minRev filters)
//   vault.search@1    READ             — FTS5 MATCH with rank
//   vault.verify@1    READ             — Merkle walk + CAS resolution proof
//   vault.compact@1   MUTATION         — superseded revisions → cold_objects, refs survive
//   vault.roundtrip@1 EXTERNAL_MUTATION— full copy + verify + head comparison (swap harness)
//
// Data sovereignty: the data directory belongs to the USER'S VAULT, not this plugin —
// ctx.config.dataDir (composition passthrough, never authority), default
// "./dev-vault/vault-data". All state lives there; plugin replacement keeps the data.
//
// Handlers throw on bad payloads — the shim turns throws into DEGRADED returns.
// Mutation ops run through the single-writer queue (enqueueWrite); reads never queue.

import { definePlugin, startPlugin } from "@vivim/omega-shim";
import type { PluginContext } from "@vivim/omega-shim";
import { appendObject } from "./changelog.ts";
import { compact } from "./compaction.ts";
import { openVault, queryObjects, readObject, searchObjects, type VaultDB } from "./db.ts";
import { roundtrip } from "./roundtrip.ts";
import { verify } from "./verify.ts";
import {
  optionalInt, requireInt, requireName, requireObject, requireRefs, resolveDataDir,
} from "./validate.ts";

let vault: VaultDB | null = null;

function mustOpen(): VaultDB {
  if (!vault) throw new Error("vivim.vault: not initialized (onInit failed or already shut down)");
  return vault;
}

startPlugin(definePlugin({
  onInit(ctx: PluginContext) {
    const dataDir = resolveDataDir(ctx.config);
    const v = openVault(dataDir);
    vault = v;
    ctx.log(`vivim.vault: open ${v.path} (WAL+FTS5), dataDir=${dataDir}`);
  },
  onShutdown() {
    vault?.close();
    vault = null;
  },
  ops: {
    "vault.append@1": (payload, _ctx, meta) => {
      const p = requireObject("vault.append@1", payload);
      const ns = requireName("vault.append@1", "ns", p.ns);
      const id = requireName("vault.append@1", "id", p.id);
      if (p.data === undefined) throw new Error("vault.append@1: data is required");
      if (p.meta !== undefined && p.meta !== null && (typeof p.meta !== "object" || Array.isArray(p.meta))) {
        throw new Error("vault.append@1: meta must be an object when provided");
      }
      const refs = requireRefs("vault.append@1", p.refs);
      const causationId = requireName("vault.append@1", "causationId", meta?.causationId);
      const v = mustOpen();
      return v.enqueueWrite(() => appendObject(v, { ns, id, data: p.data, meta: p.meta ?? null, refs, causationId }));
    },

    "vault.get@1": (payload) => {
      const p = requireObject("vault.get@1", payload);
      const ns = requireName("vault.get@1", "ns", p.ns);
      const id = requireName("vault.get@1", "id", p.id);
      const rev = optionalInt("vault.get@1", "rev", p.rev, 1);
      return readObject(mustOpen(), ns, id, rev);
    },

    "vault.query@1": (payload) => {
      const p = requireObject("vault.query@1", payload);
      const ns = requireName("vault.query@1", "ns", p.ns);
      const filter = p.filter === undefined || p.filter === null ? {} : requireObject("vault.query@1 filter", p.filter);
      const idPrefix = filter.idPrefix === undefined || filter.idPrefix === null ? null : requireName("vault.query@1", "filter.idPrefix", filter.idPrefix);
      const minRev = optionalInt("vault.query@1", "filter.minRev", filter.minRev, 0);
      return queryObjects(mustOpen(), ns, { idPrefix, minRev });
    },

    "vault.search@1": (payload) => {
      const p = requireObject("vault.search@1", payload);
      const ns = requireName("vault.search@1", "ns", p.ns);
      if (typeof p.q !== "string" || p.q.length === 0) throw new Error("vault.search@1: q must be a non-empty string");
      return searchObjects(mustOpen(), ns, p.q);
    },

    "vault.verify@1": () => verify(mustOpen()),

    "vault.compact@1": (payload) => {
      const p = requireObject("vault.compact@1", payload);
      const ns = requireName("vault.compact@1", "ns", p.ns);
      const keep = requireInt("vault.compact@1", "keep", p.keep, 1);
      const v = mustOpen();
      return v.enqueueWrite(() => compact(v, ns, keep));
    },

    "vault.roundtrip@1": (payload) => {
      const p = requireObject("vault.roundtrip@1", payload);
      const targetDir = p.targetDir;
      const v = mustOpen();
      return v.enqueueWrite(() => roundtrip(v, targetDir)); // write queue → consistent snapshot
    },
  },
}));
