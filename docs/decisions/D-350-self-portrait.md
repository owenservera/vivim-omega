# D-350 — Re-land the self-view: `mind.portrait@1` + the portrait emitter

## Status

RATIFIED

## Context

The self-view verification channel (first lineage's D-345, second reset's standing
consequence) does not exist in the third lineage: the pristine upstream base at
`4a108d7` ships `mind.snapshot@1`/`mind.query@1` but no unified self-read, and
the workspace DevOps hub's Ω tab honestly reports `not-captured` (the portrait
tooling was destroyed with the first sandbox reset — D-345 is a retired number,
its code is lost lineage). The owner's directive this turn: "ensure the self
view is configured." RESET-NOTE.md rule 2 applies: re-landing requires a NEW
D-record (from D-350) and a fresh gate run; no second-lineage evidence carries
forward.

## Options

| Criterion | (a) re-land the full channel: 5th engine contribution `mind.portrait@1` + `port:vault.verify@1` + `tooling/portrait/portrait.ts` emitter + posture parser (recommended) | (b) hub-side derivation (the Next.js app computes the portrait from git + files) | (c) wait for PRINCIPLES.md re-creation, land the channel with it |
|---|---|---|---|
| I1 self-describing | The op + doc + manifest justification ARE the description; the emitter exercises it | The behavior lives in prose + outer tooling — a direct I1 violation | Delays an owner-directed landing on an unrelated doc |
| I14 safe degradation | One call returns kernel/vault/world/capabilities; a missing grant fails DEGRADED, fail-closed | Degradation is hub policy, not system behavior | Same channel, later |
| Honest posture | `readPosture` parses PRINCIPLES.md live; absent doc ⇒ `[]` rendered honestly (never invented rows) | Same parser available, but the runtime read bypasses the plugin boundary | Posture present, but the wait blocks the verification channel |
| Evidence integrity | Every number derived through ports (law registry, vault rows, Merkle walk); router truth merged host-side only | Hub reads files — no port discipline, no consent story | Same as (a) |

## Decision

**Decision:** (a) re-land the full channel — `mind.portrait@1` as the mind's 5th ENGINE contribution with `port:vault.verify@1`, the `omega:portrait` emitter booting the real console composition against a throwaway vault, and the tolerant posture parser; posture stays honestly empty until PRINCIPLES.md is re-created (standing prep request).

## Consequences

- `compositions/console.json` widens the mind grant (`mind.portrait@1` + `port:vault.verify@1`) — single composition, no drift surface (the only spec carrying vivim.mind).
- The emitter refuses to run over an inconsistent decision register (fail-closed at the source of `development.register`).
- `build/self-portrait.json` is gitignored (local artifact, like `dev-vault/`); the hub passes `--out` and owns persistence.
- The first-lineage numbers reproduce exactly on the pristine base (world v38, 11 vault entries verified, 27 journal events, 12 steps, consents 1) — evidence the re-landing is faithful, not a re-invention.
- PRINCIPLES.md re-creation (I10–I15 fold) remains the standing prep request; when it lands, `readPosture` starts reporting rows with zero code change.

## Evidence

- `plugins/vivim-mind/plugin.json` (5th engine contribution + the four-port capability request with justification), `src/derive.ts` (`buildPortrait`, `PORTRAIT_NAMESPACES`, `RegistryFullView`), `src/index.ts` (`mind.portrait@1` handler, `fetchRegistryFull` shared with `fetchRegistry`).
- `plugins/vivim-mind/test/portrait.test.ts` (9 tests: unit derivation/determinism/one-machinery + integration one-call-after-traffic, snapshot parity, fail-closed-without-verify, manifest lawfulness) — 40/40 mind suite green.
- `tooling/portrait/portrait.ts` + `posture.ts` + `test/posture.test.ts` (3 tests; missing-doc honesty).
- Ratification: owner directive 2026-09-14 ("ensure the self view is configured"); landed PROPOSED in 33cfdee; full `bun run omega:gate` GREEN on 33cfdee (624/624, host 984/1000, attest de3d24e) — ratified on that evidence. The emitter reproduces the first-lineage numbers exactly on the pristine base (world v38, 11 vault entries verified, 27 journal events, 12 steps, consents 1).
