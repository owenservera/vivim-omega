//! Granularity-agnostic plugin manifest — requirement #5.
//!
//! A manifest wrapping an entire legacy VIVIM subsystem and a manifest
//! for one atomic function use the IDENTICAL schema below. The only
//! difference between a coarse and an atomic plugin is how many things
//! get declared inside one manifest — the schema itself never assumes
//! a grain size, so wrapping a big chunk of legacy surface today isn't
//! lying to the system, and splitting it later is a subtraction of
//! entries, not a schema migration.

use semver::VersionReq;
use serde::{Deserialize, Serialize};

use crate::graph::Granularity;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CapabilityOffer {
    pub name: String,
    /// The exact version of the named contract this offer implements.
    /// See contract.rs — requirement #4: implementations are exact,
    /// requirements (below) are ranges.
    pub contract_version: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CapabilityRequirement {
    pub name: String,
    #[serde(with = "version_req_serde")]
    pub compatible_with: VersionReq,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
pub enum SerGranularity {
    Coarse,
    Atomic,
}

impl From<SerGranularity> for Granularity {
    fn from(g: SerGranularity) -> Self {
        match g {
            SerGranularity::Coarse => Granularity::Coarse,
            SerGranularity::Atomic => Granularity::Atomic,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PluginManifest {
    pub id: String,
    pub granularity: SerGranularity,
    pub offers: Vec<CapabilityOffer>,
    pub requires: Vec<CapabilityRequirement>,
    /// Sub-modules tagged with their own would-be capability surface
    /// even while physically fused into one coarse plugin. Declaring
    /// these costs nothing today and gives extraction a real seam to
    /// cut along later, instead of requiring archaeology.
    pub internal_seams: Vec<String>,
    /// Honest self-reporting: does this plugin already know it's
    /// secretly several plugins wearing a trenchcoat? Lets the system
    /// (or a human) query "what should be atomized" at any time,
    /// rather than that knowledge living only in someone's head.
    pub extraction_candidate: bool,
}

impl PluginManifest {
    /// A quick sanity check independent of the capability graph: every
    /// declared internal seam should correspond to something concrete
    /// enough to eventually become its own manifest. This doesn't
    /// enforce isolation (that's not this schema's job) — it just
    /// catches an empty seam list on a manifest that claims to be an
    /// extraction candidate, which usually means someone flagged
    /// intent without doing the (cheap) work of naming the seams.
    pub fn validate(&self) -> Result<(), String> {
        if self.extraction_candidate && self.internal_seams.is_empty() {
            return Err(format!(
                "manifest '{}' is flagged extraction_candidate but declares no internal_seams",
                self.id
            ));
        }
        if self.granularity == SerGranularity::Atomic && !self.internal_seams.is_empty() {
            return Err(format!(
                "manifest '{}' is Atomic but still declares internal_seams — extraction already happened, seams should be cleared",
                self.id
            ));
        }
        Ok(())
    }
}

mod version_req_serde {
    use semver::VersionReq;
    use serde::{Deserialize, Deserializer, Serialize, Serializer};

    pub fn serialize<S: Serializer>(v: &VersionReq, s: S) -> Result<S::Ok, S::Error> {
        v.to_string().serialize(s)
    }

    pub fn deserialize<'de, D: Deserializer<'de>>(d: D) -> Result<VersionReq, D::Error> {
        let s = String::deserialize(d)?;
        VersionReq::parse(&s).map_err(serde::de::Error::custom)
    }
}
