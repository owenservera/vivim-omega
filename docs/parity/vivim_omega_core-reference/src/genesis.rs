//! The genesis kernel — requirement #2.
//!
//! A hand-verifiable, self-closing bootstrap: a small set of entities
//! that mutually define each other, terminating the "who defines the
//! definer" regress instead of hiding an implicit root elsewhere in
//! the code. Modeled on two known-working precedents:
//!
//!   - Smalltalk's metaclass pair: every class has a metaclass, every
//!     metaclass is itself a class — the chain terminates because
//!     `Class` is an instance of `Metaclass`, and `Metaclass` is
//!     itself an instance of `Class`. Two objects, closing the loop.
//!   - EROS/seL4-style capability derivation: don't avoid a root —
//!     make the root minimal and self-describing, and derive
//!     everything else from it by attenuation, auditable back to that
//!     one seed.
//!
//! This module is the ONLY place in the system where node identities
//! are hardcoded. Every plugin, tool, and grant registered afterward
//! is data written on top of this, never a special case in code.

use ed25519_dalek::SigningKey;
use rand::rngs::OsRng;

use crate::audit::AuditLog;
use crate::graph::{CapabilityGraph, Granularity, Node, NodeKind};

/// Describes what a node IS (kind, granularity, capability shape).
/// Its own kind is `Capability` — the schema is describable as an
/// instance of its own schema, which is the actual self-reference,
/// not a metaphor for one.
pub const SCHEMA: &str = "genesis:schema";
/// The principal that issues the very first, self-signed grant.
pub const KERNEL: &str = "genesis:kernel";
/// Requirement #1: "global availability" is a real principal in the
/// same graph as everything else, not a parallel mechanism.
pub const EVERYONE: &str = "genesis:everyone";
/// Requirement #3: the one non-plugin core. Created once, here, and
/// never listed as an extraction candidate — see `state.rs`.
pub const STATE_ARBITRATOR: &str = "core:state-arbitrator";
pub const CAP_SELF_DESCRIBE: &str = "cap:self-describe";

pub struct Genesis {
    pub graph: CapabilityGraph,
    pub audit: AuditLog,
}

impl Genesis {
    /// Boot the closed genesis set. This is the entire hardcoded
    /// surface of the system: five nodes and two grants that point at
    /// each other, closing the loop. Nothing else is ever hardcoded —
    /// every later plugin, tool and grant is ordinary data on top of this.
    pub fn bootstrap() -> Self {
        let signing_key = SigningKey::generate(&mut OsRng);
        let mut audit = AuditLog::new(signing_key);
        let mut graph = CapabilityGraph::new();

        graph.upsert_node(Node {
            id: SCHEMA.into(),
            kind: NodeKind::Capability, // schema-of-schema: a capability like any other
            granularity: None,
            extraction_candidate: false,
        });
        graph.upsert_node(Node {
            id: KERNEL.into(),
            kind: NodeKind::Principal,
            granularity: Some(Granularity::Atomic),
            extraction_candidate: false,
        });
        graph.upsert_node(Node {
            id: EVERYONE.into(),
            kind: NodeKind::Principal,
            granularity: None,
            extraction_candidate: false,
        });
        graph.upsert_node(Node {
            id: STATE_ARBITRATOR.into(),
            kind: NodeKind::Principal,
            granularity: Some(Granularity::Atomic),
            // Never a candidate: this identity is excluded from
            // extraction/atomization by construction, not by policy
            // that could later be relaxed by mistake.
            extraction_candidate: false,
        });
        graph.upsert_node(Node {
            id: CAP_SELF_DESCRIBE.into(),
            kind: NodeKind::Capability,
            granularity: None,
            extraction_candidate: false,
        });

        // The closing loop, made concrete as grants rather than as
        // prose: Kernel grants itself the capability to describe
        // itself (Kernel instance-of Schema), and separately grants
        // that same capability onto Schema (Schema instance-of
        // itself, via Kernel). Two edges pointing back at each other —
        // the regress terminates in a cycle instead of an unstated root.
        let g1 = audit.record(KERNEL, KERNEL, CAP_SELF_DESCRIBE);
        graph
            .grant(KERNEL, KERNEL, CAP_SELF_DESCRIBE, g1)
            .expect("genesis self-grant must succeed");

        let g2 = audit.record(KERNEL, SCHEMA, CAP_SELF_DESCRIBE);
        graph
            .grant(KERNEL, SCHEMA, CAP_SELF_DESCRIBE, g2)
            .expect("genesis schema-grant must succeed");

        Self { graph, audit }
    }

    /// Register a brand-new capability node so it can subsequently be
    /// offered or granted. Kept separate from `grant` so "a capability
    /// exists" and "a capability was handed to someone" are two
    /// distinct, independently auditable facts.
    pub fn declare_capability(&mut self, capability: &str) {
        self.graph.upsert_node(Node {
            id: capability.to_string(),
            kind: NodeKind::Capability,
            granularity: None,
            extraction_candidate: false,
        });
    }

    /// Requirement #1 in action: making something globally available
    /// is not a special code path — it is exactly this ordinary,
    /// signed, revocable grant to the `everyone` principal, indexed
    /// in the same graph and audit log as any scoped grant.
    pub fn make_globally_available(&mut self, capability: &str) -> anyhow::Result<()> {
        if self.graph.node(capability).is_none() {
            self.declare_capability(capability);
        }
        let grant = self.audit.record(KERNEL, EVERYONE, capability);
        self.graph.grant(KERNEL, EVERYONE, capability, grant)
    }
}
