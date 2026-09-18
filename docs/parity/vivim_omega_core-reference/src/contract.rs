//! Versioned tool contracts, decoupled from implementation —
//! requirement #4 — plus per-execution generation pinning —
//! requirement #9.
//!
//! A tool exposes a stable, named interface at a specific semantic
//! version. Plugins never depend on a specific implementation build —
//! they declare a `VersionReq` range against the interface name (see
//! manifest.rs). This is what lets a tool's internals be rewritten
//! completely as long as the contract still holds, and it's what lets
//! old and new callers coexist across an upgrade instead of forcing a
//! flag-day migration.

use semver::{Version, VersionReq};
use std::collections::HashMap;
use std::sync::Arc;

#[derive(Debug, Clone)]
pub struct Contract {
    pub name: String,
    pub version: Version,
}

/// One generation of a tool's implementation. Wrapped in `Arc` so a
/// generation stays alive for exactly as long as something in flight
/// is still using it — no global mutable "current version" pointer,
/// so upgrading never requires stopping the world.
pub struct GenerationPin<T> {
    pub contract: Contract,
    pub implementation: Arc<T>,
}

pub struct ToolRegistry<T> {
    /// Every generation ever published for a tool name, oldest first.
    generations: HashMap<String, Vec<GenerationPin<T>>>,
}

impl<T> Default for ToolRegistry<T> {
    fn default() -> Self {
        Self::new()
    }
}

impl<T> ToolRegistry<T> {
    pub fn new() -> Self {
        Self {
            generations: HashMap::new(),
        }
    }

    /// Publish a new generation. Existing generations are never
    /// removed by this call — retiring an old generation is a
    /// separate, explicit decision (e.g. once its blast radius, per
    /// centrality.rs, drops to zero).
    pub fn publish(&mut self, name: &str, version: Version, implementation: T) {
        self.generations
            .entry(name.to_string())
            .or_default()
            .push(GenerationPin {
                contract: Contract {
                    name: name.to_string(),
                    version,
                },
                implementation: Arc::new(implementation),
            });
    }

    /// Resolve a caller's version requirement against the newest
    /// generation that still satisfies it. A caller that started work
    /// against an older compatible range gets a live `Arc` to exactly
    /// that generation, even after a newer one has been published —
    /// this is the mechanism behind requirement #9.
    pub fn resolve(&self, name: &str, req: &VersionReq) -> Option<Arc<T>> {
        self.generations
            .get(name)?
            .iter()
            .rev()
            .find(|g| req.matches(&g.contract.version))
            .map(|g| g.implementation.clone())
    }

    pub fn latest(&self, name: &str) -> Option<Arc<T>> {
        self.generations.get(name)?.last().map(|g| g.implementation.clone())
    }

    /// How many published generations of a tool are still registered.
    /// A widening gap between `latest` and the oldest generation still
    /// being `resolve`d by live callers is itself a signal worth
    /// watching — it means an upgrade hasn't fully propagated.
    pub fn generation_count(&self, name: &str) -> usize {
        self.generations.get(name).map(|v| v.len()).unwrap_or(0)
    }
}
