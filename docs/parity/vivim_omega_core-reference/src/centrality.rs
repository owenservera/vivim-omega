//! Computed centrality — requirement #7.
//!
//! One metric drives two decisions that would otherwise need separate,
//! hand-maintained logic: promoting a load-bearing node to tool-tier
//! audit/versioning rigor, and flagging a sub-module inside a coarse
//! plugin as ready for extraction. Neither decision is made once by a
//! person at design time — both are recomputed from the live graph.

use crate::graph::CapabilityGraph;

#[derive(Debug, Clone, Copy)]
pub struct Centrality {
    pub fan_in: usize,
    pub blast_radius: usize,
}

impl Centrality {
    /// Crossing this threshold means: enough of the system depends on
    /// this node that (a) if it lives inside a coarse plugin, it's a
    /// genuine extraction candidate rather than a guess, and (b)
    /// whatever it is, it should be held to the same audit/versioning
    /// rigor as a tool, whether or not anyone formally declared it one.
    ///
    /// Thresholds are deliberately conservative defaults — tune per
    /// deployment once real fan-in/blast-radius distributions are known.
    pub fn is_load_bearing(&self) -> bool {
        self.fan_in >= 5 || self.blast_radius >= 20
    }
}

pub fn compute(graph: &CapabilityGraph, node_id: &str) -> Centrality {
    Centrality {
        fan_in: graph.fan_in(node_id),
        blast_radius: graph.blast_radius(node_id),
    }
}

/// Sweep every node — principal or capability — and report which ones
/// are currently load-bearing. A shared algorithm that a broad section
/// of plugins depend on shows up here as a Capability node with high
/// fan-in, exactly the same way an overloaded tool principal would.
/// Intended to be called periodically (or after any batch of grants)
/// rather than deciding tiers by hand at design time — the
/// load-bearing set is expected to change as the system grows from a
/// handful of coarse plugins into hundreds of atomic ones.
pub fn sweep(graph: &CapabilityGraph) -> Vec<(String, Centrality)> {
    graph
        .all_nodes()
        .into_iter()
        .map(|id| {
            let c = compute(graph, &id);
            (id, c)
        })
        .filter(|(_, c)| c.is_load_bearing())
        .collect()
}
