# vivim_omega_core

The genesis kernel for VIVIM-Ω: the smallest set of primitives that has
to be correct in the first commit, so that everything built on top
(atomizing a coarse plugin, upgrading a tool, granting a capability
globally, promoting a load-bearing shared algorithm) is ordinary data
and code afterward — never a redesign of the kernel itself.

Compiles and passes on stock `rustc 1.75` / `cargo 1.75` with no
nightly features. `cargo test` runs six tests that exercise all nine
requirements end to end, including the exact "one algorithm a broad
section of plugins leverage" scenario from the design discussion.

## Requirement → module map

| # | Requirement | Module | Not retrofittable? |
|---|---|---|---|
| 1 | One capability graph; "global" is a real principal, not a parallel registry | `graph::CapabilityGraph`, `genesis::EVERYONE` | **Yes** |
| 2 | A genesis set that closes on itself (Smalltalk-metaclass-style loop) | `genesis::Genesis::bootstrap` | **Yes** |
| 3 | State arbitration is the one non-plugin core | `state::StateArbitrator`, `genesis::STATE_ARBITRATOR` | **Yes** |
| 4 | Contract version separate from implementation version | `contract::Contract`, `contract::ToolRegistry` | No |
| 5 | Granularity-agnostic manifest (coarse today, atomic later, same schema) | `manifest::PluginManifest` | No |
| 6 | Capability resolution by query, never a hardcoded reference | `graph::CapabilityGraph::who_offers` | No |
| 7 | Centrality is computed, not assigned | `centrality::compute`, `centrality::sweep` | No |
| 8 | Every grant/upgrade is signed and hash-chained | `audit::AuditLog`, `audit::SignedGrant` | No |
| 9 | Version pinning per execution (generations), not per system | `contract::GenerationPin` | No |

Requirements 1–3 are structural: every other module depends on the
graph existing, the genesis loop having closed, and there being
exactly one arbiter for shared state. Get those three right once;
everything else (4–9) can evolve, be re-tuned, or be swapped without
touching the kernel.

## How the pieces actually fit together

- `genesis::Genesis::bootstrap()` is the entire hardcoded surface of
  the system — five nodes, two self-referential grants. It returns a
  `CapabilityGraph` and an `AuditLog` that are used identically for
  every later plugin, tool, and grant; nothing about genesis is a
  special case anywhere else in the code.
- A **coarse plugin** (e.g. a wrapper around your existing VIVIM
  surface) is registered as one `Node` plus one `PluginManifest` that
  declares its `internal_seams` up front — see
  `a_coarse_plugin_wraps_legacy_surface_honestly` in `lib.rs` for the
  full sequence: register → declare capability → grant → resolve by
  query → make globally available.
- A **shared algorithm many plugins leverage** doesn't need to be
  manually classified as "core." Register it as an ordinary
  `Capability` node; once enough plugins grant themselves access to
  it, `centrality::sweep` reports it as load-bearing on its own — see
  `centrality_is_computed_not_assigned`.
- **Upgrading a tool** never breaks in-flight callers: `ToolRegistry`
  keeps every published generation, and `resolve()` always returns the
  generation matching a caller's declared `VersionReq`, even after a
  newer, incompatible generation has been published — see
  `tool_upgrade_never_breaks_in_flight_callers`.

## A note on the pinned dependency versions

`Cargo.toml` pins `ed25519-dalek = "=2.0.0"`, `base64ct = "=1.6.0"`,
`hashbrown = "=0.14.5"`, `indexmap = "=2.2.6"`, and `zeroize = "=1.7.0"`.
These pins exist **only** to stay buildable on the `rustc 1.75`
toolchain available in the environment this was built and tested in —
newer releases of those crates have since moved their MSRV up (and
some depend on edition 2024, which stable Cargo 1.75 can't parse at
all). If your actual build environment runs a current stable
toolchain, these pins can be loosened or dropped — run `cargo update`
and `cargo test` after doing so to confirm nothing shifted underneath
you.

The signing scheme itself (ed25519 + SHA-256 hash chain) matches what
you've already got in the governance/audit layer (Cedar + Macaroon +
WORM Merkle fabric), so this kernel's `audit::AuditLog` is meant to
sit underneath that layer, not replace it — it's the primitive the
Merkle fabric would be chaining, not a competing implementation of it.

## Running it

```
cargo test      # six tests, one per requirement-cluster
cargo doc --open   # every module has requirement-tagged doc comments
```
