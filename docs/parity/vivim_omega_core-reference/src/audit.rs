//! Signed provenance for every grant, revocation and tool-version
//! upgrade — requirement #8. Every edge in the capability graph
//! carries a `SignedGrant`, and every `SignedGrant` is also appended
//! to a hash-chained log so the full history can be replayed and
//! independently verified by anyone holding the signer's public key —
//! not just trusted because this process says so.

use ed25519_dalek::{Signature, Signer, SigningKey, Verifier, VerifyingKey};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GrantPayload {
    pub from: String,
    pub to: String,
    pub capability: String,
    /// Monotonic sequence number within the audit chain.
    pub seq: u64,
    /// Hash of the previous entry; the genesis entry uses a
    /// well-known zero hash. This is what makes the log tamper-evident:
    /// altering any past entry breaks every hash after it.
    pub prev_hash: [u8; 32],
}

impl GrantPayload {
    pub fn canonical_bytes(&self) -> Vec<u8> {
        serde_json::to_vec(self).expect("GrantPayload always serializes")
    }

    pub fn hash(&self) -> [u8; 32] {
        let mut hasher = Sha256::new();
        hasher.update(self.canonical_bytes());
        hasher.finalize().into()
    }
}

#[derive(Debug, Clone)]
pub struct SignedGrant {
    pub payload: GrantPayload,
    pub signature: Signature,
    pub signer: VerifyingKey,
}

impl SignedGrant {
    pub fn verify(&self) -> bool {
        self.signer
            .verify(&self.payload.canonical_bytes(), &self.signature)
            .is_ok()
    }
}

/// A hash-chained, signed audit log. Every mutation to the capability
/// graph produces one entry here — there is no side channel for
/// changing who-can-do-what without leaving a signed, chained trace.
pub struct AuditLog {
    signing_key: SigningKey,
    entries: Vec<SignedGrant>,
}

impl AuditLog {
    pub fn new(signing_key: SigningKey) -> Self {
        Self {
            signing_key,
            entries: Vec::new(),
        }
    }

    pub fn verifying_key(&self) -> VerifyingKey {
        self.signing_key.verifying_key()
    }

    fn prev_hash(&self) -> [u8; 32] {
        self.entries
            .last()
            .map(|e| e.payload.hash())
            .unwrap_or([0u8; 32])
    }

    /// Record and sign one grant. Note this doesn't touch the graph —
    /// audit.rs knows nothing about graph.rs. The two are wired
    /// together by the caller (see genesis.rs), which is what keeps
    /// "can this be granted" and "was this grant recorded" as
    /// separately verifiable concerns.
    pub fn record(&mut self, from: &str, to: &str, capability: &str) -> SignedGrant {
        let payload = GrantPayload {
            from: from.to_string(),
            to: to.to_string(),
            capability: capability.to_string(),
            seq: self.entries.len() as u64,
            prev_hash: self.prev_hash(),
        };
        let signature = self.signing_key.sign(&payload.canonical_bytes());
        let signed = SignedGrant {
            payload,
            signature,
            signer: self.signing_key.verifying_key(),
        };
        self.entries.push(signed.clone());
        signed
    }

    /// Independently verify the entire chain: every hash link is
    /// correct and every signature checks out. This is what lets an
    /// external auditor trust the log's integrity without trusting
    /// this process's memory.
    pub fn verify_chain(&self) -> bool {
        let mut expected_prev = [0u8; 32];
        for entry in &self.entries {
            if entry.payload.prev_hash != expected_prev {
                return false;
            }
            if !entry.verify() {
                return false;
            }
            expected_prev = entry.payload.hash();
        }
        true
    }

    pub fn len(&self) -> usize {
        self.entries.len()
    }

    pub fn is_empty(&self) -> bool {
        self.entries.is_empty()
    }
}
