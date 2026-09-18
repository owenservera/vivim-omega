//! The single capability graph — requirement #1.
//!
//! Every principal (plugin, tool, external actor, even the wildcard
//! "everyone" principal) and every capability is a node in ONE graph.
//! "Global availability" is never implicit or special-cased: it is an
//! edge from a granting principal to the well-known `everyone` node,
//! exactly like any other grant. There is no parallel registry for
//! "global" things — if it existed, it would be exactly the ambient-
//! authority hole that breaks auditability.

use petgraph::graph::{DiGraph, NodeIndex};
use petgraph::Direction;
use std::collections::HashMap;

use crate::audit::SignedGrant;

/// Stable string identity for any node. Kept as a string (not a bare
/// graph index) so manifests, audit logs and centrality reports can
/// reference nodes durably even as the graph is mutated underneath them.
pub type NodeId = String;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Granularity {
    /// A plugin wrapping an arbitrarily large chunk of legacy surface.
    /// Declares the same capability contract an atomic plugin would —
    /// see manifest.rs, requirement #5.
    Coarse,
    /// A plugin that has been split down to a single responsibility.
    Atomic,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum NodeKind {
    /// Something that can hold and exercise capabilities: a plugin,
    /// a tool, an external caller, or the wildcard `everyone`.
    Principal,
    /// A capability itself (e.g. "state.read:session.*"). Modeled as
    /// its own node — not a bare string field on an edge — so a
    /// capability can be reasoned about, versioned and revoked
    /// independently of any single grant that references it.
    Capability,
}

#[derive(Debug, Clone)]
pub struct Node {
    pub id: NodeId,
    pub kind: NodeKind,
    /// Only meaningful for Principal nodes that are plugins.
    pub granularity: Option<Granularity>,
    /// Requirement #5: a coarse plugin can flag its own internal
    /// seams as future extraction points without enforcing isolation
    /// yet. Costs nothing now; gives extraction a real seam later.
    pub extraction_candidate: bool,
}

pub struct CapabilityGraph {
    g: DiGraph<Node, SignedGrant>,
    index: HashMap<NodeId, NodeIndex>,
}

impl Default for CapabilityGraph {
    fn default() -> Self {
        Self::new()
    }
}

impl CapabilityGraph {
    pub fn new() -> Self {
        Self {
            g: DiGraph::new(),
            index: HashMap::new(),
        }
    }

    pub fn upsert_node(&mut self, node: Node) -> NodeIndex {
        if let Some(&idx) = self.index.get(&node.id) {
            self.g[idx] = node;
            idx
        } else {
            let id = node.id.clone();
            let idx = self.g.add_node(node);
            self.index.insert(id, idx);
            idx
        }
    }

    pub fn node_index(&self, id: &str) -> Option<NodeIndex> {
        self.index.get(id).copied()
    }

    pub fn node(&self, id: &str) -> Option<&Node> {
        self.node_index(id).map(|i| &self.g[i])
    }

    /// Record a capability grant as a graph edge. This is the ONLY
    /// way capabilities move between principals — including the
    /// "everyone" wildcard case. `grant` must already be signed (see
    /// audit.rs) before it reaches here: the graph never accepts an
    /// unsigned edge, so there is no path to a capability that
    /// doesn't trace back to a provenance record.
    ///
    /// The edge is added `to -> capability` (the receiving principal
    /// now points at the capability it holds), which is what makes
    /// `who_offers` a plain incoming-neighbor query on the capability
    /// node. `from` (the granter) is not a graph edge at all — it is
    /// preserved inside the signed payload, so provenance ("who
    /// granted this") and topology ("who currently holds this") stay
    /// independently queryable instead of conflated into one edge.
    pub fn grant(
        &mut self,
        from: &str,
        to: &str,
        capability: &str,
        grant: SignedGrant,
    ) -> anyhow::Result<()> {
        self.node_index(from)
            .ok_or_else(|| anyhow::anyhow!("unknown principal: {from}"))?;
        let to_idx = self
            .node_index(to)
            .ok_or_else(|| anyhow::anyhow!("unknown principal: {to}"))?;
        let cap_idx = self
            .node_index(capability)
            .ok_or_else(|| anyhow::anyhow!("unknown capability: {capability}"))?;
        if !grant.verify() {
            anyhow::bail!("grant signature does not verify — refusing to add edge");
        }
        self.g.add_edge(to_idx, cap_idx, grant);
        Ok(())
    }

    /// Requirement #6: resolution is always a graph query, never a
    /// hardcoded reference. Callers ask "who currently offers X" and
    /// get routed — whether X is answered today by one coarse plugin
    /// or by five atomized ones tomorrow is invisible to the caller.
    pub fn who_offers(&self, capability: &str) -> Vec<NodeId> {
        let Some(cap_idx) = self.node_index(capability) else {
            return vec![];
        };
        self.g
            .neighbors_directed(cap_idx, Direction::Incoming)
            .filter_map(|n| {
                let node = &self.g[n];
                (node.kind == NodeKind::Principal).then(|| node.id.clone())
            })
            .collect()
    }

    /// Fan-in: how many principals hold a grant that terminates at
    /// this node. Feeds requirement #7 (computed centrality).
    pub fn fan_in(&self, id: &str) -> usize {
        self.node_index(id)
            .map(|idx| self.g.neighbors_directed(idx, Direction::Incoming).count())
            .unwrap_or(0)
    }

    /// Blast radius: every node reachable *downstream* of this one via
    /// grant edges — i.e. everything that would be affected if this
    /// node's behavior changed. Also feeds requirement #7.
    pub fn blast_radius(&self, id: &str) -> usize {
        use petgraph::visit::Bfs;
        let Some(start) = self.node_index(id) else {
            return 0;
        };
        let mut bfs = Bfs::new(&self.g, start);
        let mut count = 0usize;
        while let Some(n) = bfs.next(&self.g) {
            if n != start {
                count += 1;
            }
        }
        count
    }

    pub fn all_principals(&self) -> Vec<NodeId> {
        self.g
            .node_indices()
            .filter_map(|i| (self.g[i].kind == NodeKind::Principal).then(|| self.g[i].id.clone()))
            .collect()
    }

    /// Every node regardless of kind. Centrality (requirement #7) has
    /// to sweep both principals AND capabilities — a shared algorithm
    /// that "a broad section of other plugins need and leverage" is
    /// exactly a Capability node with high fan-in, not a Principal.
    pub fn all_nodes(&self) -> Vec<NodeId> {
        self.g.node_indices().map(|i| self.g[i].id.clone()).collect()
    }
}
