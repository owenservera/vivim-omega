//! VIVIM-Omega genesis kernel.
//!
//! This crate is the answer to one question: what is the smallest set
//! of primitives that has to be right in the very first commit, such
//! that everything discussed on top of it (plugin atomization, tool
//! upgrades, global capabilities, load-bearing promotion) can be
//! built as ordinary data and code afterward, never as a redesign of
//! the kernel itself?
//!
//! Nine requirements, three of them (graph, genesis, state) not
//! retrofittable — see each module's doc comment for which one it
//! satisfies:
//!
//!  1. graph::CapabilityGraph   — one graph, no parallel "global" registry
//!  2. genesis::Genesis         — a hand-verifiable, self-closing bootstrap
//!  3. state::StateArbitrator   — the one non-plugin, non-negotiable core
//!  4. contract::Contract       — interface version separate from impl version
//!  5. manifest::PluginManifest — same schema for coarse and atomic plugins
//!  6. graph::who_offers        — resolution by query, never by hardcoded ref
//!  7. centrality::sweep        — load-bearing status is computed, not assigned
//!  8. audit::AuditLog          — every grant/upgrade is signed and chained
//!  9. contract::GenerationPin  — running work keeps the version it started with

pub mod audit;
pub mod centrality;
pub mod contract;
pub mod genesis;
pub mod graph;
pub mod manifest;
pub mod state;

#[cfg(test)]
mod tests {
    use super::*;
    use contract::ToolRegistry;
    use graph::{Granularity, Node, NodeKind};
    use manifest::{CapabilityOffer, CapabilityRequirement, PluginManifest, SerGranularity};
    use semver::{Version, VersionReq};
    use state::LockMode;

    #[test]
    fn genesis_closes_and_the_chain_verifies() {
        let kernel = genesis::Genesis::bootstrap();
        assert!(kernel.audit.verify_chain(), "genesis chain must verify from the first entry");
        assert_eq!(kernel.audit.len(), 2, "genesis is exactly two grants: self, and schema");
    }

    #[test]
    fn a_coarse_plugin_wraps_legacy_surface_honestly() {
        // Requirement #5: register one coarse plugin wrapping a large
        // chunk of legacy VIVIM surface. The manifest schema doesn't
        // care that it's coarse — it declares internal seams up front
        // so extraction later has something real to cut along.
        let manifest = PluginManifest {
            id: "plugin:vivim-legacy-surface".into(),
            granularity: SerGranularity::Coarse,
            offers: vec![CapabilityOffer {
                name: "cap:chat-completion".into(),
                contract_version: "1.0.0".into(),
            }],
            requires: vec![CapabilityRequirement {
                name: "state-store".into(),
                compatible_with: VersionReq::parse("^1.0").unwrap(),
            }],
            internal_seams: vec![
                "seam:session-memory".into(),
                "seam:prompt-templates".into(),
            ],
            extraction_candidate: true,
        };
        assert!(manifest.validate().is_ok());

        let mut kernel = genesis::Genesis::bootstrap();
        kernel.graph.upsert_node(Node {
            id: manifest.id.clone(),
            kind: NodeKind::Principal,
            granularity: Some(Granularity::Coarse),
            extraction_candidate: manifest.extraction_candidate,
        });
        for offer in &manifest.offers {
            kernel.declare_capability(&offer.name);
            let g = kernel
                .audit
                .record(&manifest.id, &manifest.id, &offer.name);
            kernel
                .graph
                .grant(&manifest.id, &manifest.id, &offer.name, g)
                .unwrap();
        }

        // Requirement #6: resolve by query, not by hardcoded reference.
        assert_eq!(
            kernel.graph.who_offers("cap:chat-completion"),
            vec!["plugin:vivim-legacy-surface".to_string()]
        );

        // Requirement #1: global availability is an ordinary grant to
        // `everyone`, not a special mechanism.
        kernel.make_globally_available("cap:chat-completion").unwrap();
        let offerors = kernel.graph.who_offers("cap:chat-completion");
        assert!(offerors.contains(&genesis::EVERYONE.to_string()));
        assert!(offerors.contains(&"plugin:vivim-legacy-surface".to_string()));

        assert!(kernel.audit.verify_chain());
    }

    #[test]
    fn tool_upgrade_never_breaks_in_flight_callers() {
        // Requirements #4 and #9: a caller pinned to an old compatible
        // range keeps its generation even after a new one ships.
        let mut registry: ToolRegistry<&'static str> = ToolRegistry::new();
        registry.publish("state-store", Version::parse("1.0.0").unwrap(), "impl-v1");
        let old_req = VersionReq::parse("^1.0").unwrap();
        let pinned_before_upgrade = registry.resolve("state-store", &old_req).unwrap();

        // Tool gets upgraded — a new major version is published.
        registry.publish("state-store", Version::parse("2.0.0").unwrap(), "impl-v2");

        // The old caller's already-resolved pin is untouched...
        assert_eq!(*pinned_before_upgrade, "impl-v1");
        // ...and a caller with the same old requirement resolving
        // *after* the upgrade still gets the compatible generation,
        // not the newer incompatible one.
        assert_eq!(*registry.resolve("state-store", &old_req).unwrap(), "impl-v1");
        // A caller with a wide-open requirement gets the latest.
        let new_req = VersionReq::parse(">=1.0").unwrap();
        assert_eq!(*registry.resolve("state-store", &new_req).unwrap(), "impl-v2");
        assert_eq!(registry.generation_count("state-store"), 2);
    }

    #[test]
    fn state_arbitration_prevents_the_race_everything_else_depends_on() {
        // Requirement #3: this is the one thing that must not be a
        // plugin, because two exclusive holders on the same key is
        // exactly the corruption this whole design exists to prevent.
        let arb = state::StateArbitrator::new();
        arb.try_acquire("session:42", "plugin:a", LockMode::Exclusive).unwrap();
        let conflict = arb.try_acquire("session:42", "plugin:b", LockMode::Exclusive);
        assert!(conflict.is_err());

        arb.release("session:42", "plugin:a");
        assert!(arb.try_acquire("session:42", "plugin:b", LockMode::Exclusive).is_ok());
    }

    #[test]
    fn centrality_is_computed_not_assigned() {
        // Requirement #7: a node nobody labeled "core" becomes
        // load-bearing purely because enough things now depend on it.
        let mut kernel = genesis::Genesis::bootstrap();
        kernel.declare_capability("cap:shared-tokenizer");

        for i in 0..6 {
            let plugin_id = format!("plugin:consumer-{i}");
            kernel.graph.upsert_node(Node {
                id: plugin_id.clone(),
                kind: NodeKind::Principal,
                granularity: Some(Granularity::Atomic),
                extraction_candidate: false,
            });
            let g = kernel
                .audit
                .record(&plugin_id, &plugin_id, "cap:shared-tokenizer");
            kernel
                .graph
                .grant(&plugin_id, &plugin_id, "cap:shared-tokenizer", g)
                .unwrap();
        }

        let load_bearing = centrality::sweep(&kernel.graph);
        assert!(
            load_bearing.iter().any(|(id, _)| id == "cap:shared-tokenizer"),
            "a capability with fan-in >= 5 must surface as load-bearing without anyone declaring it a tool"
        );
    }

    #[test]
    fn manifest_catches_dishonest_self_reporting() {
        let lying_atomic = PluginManifest {
            id: "plugin:should-be-clean".into(),
            granularity: SerGranularity::Atomic,
            offers: vec![],
            requires: vec![],
            internal_seams: vec!["seam:leftover".into()],
            extraction_candidate: false,
        };
        assert!(lying_atomic.validate().is_err());

        let unlabeled_candidate = PluginManifest {
            id: "plugin:vague".into(),
            granularity: SerGranularity::Coarse,
            offers: vec![],
            requires: vec![],
            internal_seams: vec![],
            extraction_candidate: true,
        };
        assert!(unlabeled_candidate.validate().is_err());
    }
}
