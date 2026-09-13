# D-332 — Conformance-net check: new contract type, zero call sites

## Status

RATIFIED

## Context

The plan names "vocabulary-without-writers relapse" as its top risk and
mitigates it with commit discipline — "enforced per-commit" by reviewer
attention. Every other risk in the system gets a falsifier; this one, the
most consequential, doesn't. Reviewer attention doesn't scale; a mechanical
backstop does. It belongs in the W1 composition-conformance net (a
conformance-net change, not new subsystem work), landing with the other V2.5
hygiene items.

## Options

| Criterion | (a) W1 rule flagging new exported `contracts/` types with zero call sites tree-wide (this record) | (b) Discipline-only (status quo ante) | (c) Full unused-export linter over the tree |
|---|---|---|---|
| Signal | Exactly the relapse shape (vocabulary with no writer/reader) | Loudest risk, quietest mitigation | Noisy (flags intentional reserves like D-306's 4th-class reservation) |
| Cost | One rule in the existing net | Zero, and zero backstop | Allowlist sprawl |
| Judgment | Backstops reviewers, never replaces them | Reviewers alone | Replaces judgment with volume |

## Decision

**Decision:** (a) W1 rule flagging new exported `contracts/` types with zero call sites tree-wide — flag, not fail, on intentional reservations (allowlist with a D-record pointer, e.g. D-306).

## Consequences

- Lands in V2.5 hygiene (same wave as the W1 re-run over everything V2.0–V2.4 touched).
- Principle 1 (§3 of the plan: writer + reader + real-boot test per commit) keeps its discipline half; this rule is the mechanical half.
- Does not replace reviewer judgment — it backstops it.

## Evidence

- Spec: `upgrades/OMEGA-FINAL-UPGRADE-PLAN.md` §6.3 (amendment authoring this record) + §5 (V2.5 hygiene).
- `tooling/gates/contract-sites.ts`: export collection (interfaces/types/functions/consts/classes/enums + `export {}`/`export type {}` aliases) + tree-wide call-site search (non-`export` lines outside `contracts/src/`; tests count as readers; barrel pass-through never counts; the harness never observes itself) + D-record-pointed allowlist (grandfathered pre-V2 names only — a live name needs no reservation).
- Folded into the W1 net (`tooling/gates/compositions.ts` check 5 — the gate's `compositions` stage fails on relapse).
- The rule caught four newborn gaps the same day (DelegateEnvelope, DescribeFocus, EpistemicStatus, ResolveOutcomeStatus exported with no readers) — all four were WIRED (real type uses in agent/mind/director/verification), not allowlisted.
- `tooling/gates/test/contract-sites.test.ts`: parsing + verdicts + allowlist + self-observation guards, temp-dir only.
- Regression note (post-ratification fix): `readdirSync` order is filesystem-dependent, and `collectContractExports` built per-export file lists in that order — green where the ratifying run happened to enumerate alphabetically, red on a fresh clone elsewhere that didn't. The checker now sorts explicitly (`readdirSync(dir).sort()`); the directory walk needs no sort (it feeds a `Set` whose verdicts are emitted in sorted-key order — checked, order-independent). Caught on a fresh clone in a different environment than the one that ratified this record.
- Falsifier run: `bun run tooling/gates/contract-sites.ts` ok:true (68 checked, 11 grandfathered); gate suites green; full `bun run omega:gate` GREEN 2026-09-13 (601/601 — ratified in 3f53afc).
