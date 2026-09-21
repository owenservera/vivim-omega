# D-434 — The Trust Mesh is core (Omega-4 port, paper D-428)

## Status

RATIFIED

## Context

- Provenance ("who vouches") is signatures; without core identity a stolen laptop keeps signing and the Law Gate is bypassed by physical theft (paper `D-428` §1: cloud trap vs fragility trap).
- Requires Ω-1..Ω-3 green (tree D-431..433): vault append-only, mind sealed, physics governed — none sovereign until keys survive the physical world.
- Invariant: self-owned identity surviving loss/theft/revocation of any single device, never asking a remote server.
- Tree collision noted: tree D-434 here vs paper builder-gap `D-434` (Ω-2.5) — distinct per the two-numbering rule; registry records both.

Blocks: none

## Options

| Criterion | (a) Core mesh port (tooling + tests, zero host LOC) | (b) Cloud-backed keychain plugin | (c) Defer |
|---|---|---|---|
| Hardware-bound root | Yes — enclave-or-refuse, bytes never in user space | No — vendor holds the master password | No |
| Causal offline revocation | Yes — append-only edicts, sync rejects post-revocation writes | Server round-trip or nothing | Poisonable sync |
| Scoped device grants | Yes — enrollment carries capability grants, law-checked | Binary trust | Coarse |
| Shard recovery, no cloud | Yes — physical k-of-n, no reset link | Password-reset backdoor | Orphaned vaults |

## Decision

**Decision:** (a) — port paper `D-428` as tree D-434: two-tier hierarchy (enclave Root, scoped Device keys), vault-log enrollment/revocation, causal rejection, physical-shard recovery; enclave calls modeled test-grade here, silicon-bound via the platform seam next.

## Consequences

- Harder: no self-bootstrap; every device write carries a verifiable chain; lost hardware + lost shards seals the vault forever (no backdoor, by design).
- Easier: theft becomes a ghost (orphaned writes on next sync); grants become per-device least-privilege; Ω-7 gains unforgeable custody chains.
- Revisit: real enclave bindings per OS (TPM/Secure Enclave/StrongBox via `platform/` only); PAKE/QR pairing ceremony UX; shard custody guidance.

## Evidence

- F-TRUST.1 (hardware-bound) — enclave handle signs without exposing bytes; export attempt refuses at hardware level; non-enclave hardware refuses generation (`TRUST_KEY_EXTRACTABLE`).
- F-TRUST.2 (local-pairing) — Device B enrolls via local ritual; `trust.enrollment` row in vault, Root-signed; B signs rows thereafter.
- F-TRUST.3 (causal-revocation) — revoke A from B; A's post-revocation rows rejected on sync, ledgered (`TRUST_REVOKED_KEY`).
- F-TRUST.4 (scoped-grants) — read-only device attempting forge refuses `TRUST_GRANT_MISSING`; unenrolled device refuses `TRUST_UNENROLLED_DEVICE`.
- F-TRUST.5 (shard-recovery) — destroyed primary restored to a new enclave from k physical shards; fewer than k refuses (`TRUST_INSUFFICIENT_SHARDS`); mesh survives.
- Spec: paper `D-428` (§0–§10, 1-8 spec lines 1030–1212); requires Ω-1..Ω-3 (D-431..433).
- Gate: owner-directed ratification per owner directive 1 — isolated falsifier greens pre-flip; full-suite crash recorded as pre-existing environmental exception (Windows soak/MCP, baseline-documented); status.json stays last-green-carried.

## Index

summary: Port Omega-4 device identity pairing revocation recovery from paper D-428
rationale: Sovereignty needs self-owned identity surviving any single device loss
class: evidence
