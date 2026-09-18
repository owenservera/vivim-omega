// µhost — audit.ts: signed, hash-chained provenance for every graph mutation (kernel
// requirement #8). record() is called inline by graph.ts::grant — an edge without
// provenance is structurally impossible, never merely discouraged. Host-side by
// necessity, not choice (D-340 §3): grant() calls it inside the trust boundary.
// This chain is deliberately parallel to — not a replacement for — the best-effort
// law-journal.jsonl: a law decision is never blocked by a journal failure; a graph
// mutation without a signed record is refused outright. Two different laws, two logs.
import { canonicalJson, sha256Hex, signJson, verifyJson } from "./canon.ts";

export interface GrantPayload { from: string; to: string; capability: string; seq: number; prevHash: string }
export interface SignedGrant {
  payload: GrantPayload;
  signature: string;
  signerKeyId: string;
  verify(): boolean;
}

const GENESIS_PREV = "0".repeat(64);

export class AuditLog {
  private entries: SignedGrant[] = [];
  constructor(private signerKeyId: string, private privateKeyPem: string, private publicKey: string) {}

  private hashPayload(p: GrantPayload): string { return sha256Hex(canonicalJson(p)); }

  /** Signs + chains one grant. prevHash links to the prior entry — tampering with ANY
   *  past entry breaks verifyChain() for every later one (the tamper-evidence property
   *  the law journal deliberately does not carry). */
  record(from: string, to: string, capability: string): SignedGrant {
    const prev = this.entries.length === 0 ? GENESIS_PREV : this.hashPayload(this.entries[this.entries.length - 1].payload);
    const payload: GrantPayload = { from, to, capability, seq: this.entries.length, prevHash: prev };
    const signature = signJson(payload, this.privateKeyPem);
    const publicKey = this.publicKey;
    const grant: SignedGrant = { payload, signature, signerKeyId: this.signerKeyId, verify: () => verifyJson(payload, publicKey, signature) };
    this.entries.push(grant);
    return grant;
  }

  verifyChain(): boolean {
    let expected = GENESIS_PREV;
    for (const e of this.entries) {
      if (e.payload.prevHash !== expected || !e.verify()) return false;
      expected = this.hashPayload(e.payload);
    }
    return true;
  }

  /** Copy-out chain for READ-side consumers (kernel-lens / operators): plain data,
   *  no closures, no live handles into host state. verdict computed host-side — one
   *  canonical verifyJson, never duplicated into a compartment (D-340 impl note b). */
  export(): { verified: boolean; signerKeyId: string; publicKey: string; length: number; headHash: string; entries: Array<{ payload: GrantPayload; signature: string }> } {
    return {
      verified: this.verifyChain(), signerKeyId: this.signerKeyId, publicKey: this.publicKey,
      length: this.entries.length, headHash: this.entries.length === 0 ? GENESIS_PREV : this.hashPayload(this.entries[this.entries.length - 1].payload),
      entries: this.entries.map((e) => ({ payload: e.payload, signature: e.signature })),
    };
  }

  length(): number { return this.entries.length; }
}
