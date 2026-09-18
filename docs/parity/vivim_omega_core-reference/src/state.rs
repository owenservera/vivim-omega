//! State arbitration — requirement #3, the single non-negotiable
//! exception to "everything is a plugin".
//!
//! Every other capability in this system is granted, revoked,
//! versioned, upgraded and atomized. This one is not: it is created
//! once by `Genesis::bootstrap` under the fixed identity
//! `genesis::STATE_ARBITRATOR`, which is excluded from extraction and
//! atomization by construction (see genesis.rs). Without exactly one
//! arbiter for "who can read/write this piece of shared state right
//! now", two plugins racing on the same key silently corrupts state —
//! the one failure mode this whole design exists to prevent.

use std::collections::HashMap;
use std::sync::{Arc, RwLock};

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum LockMode {
    Shared,
    Exclusive,
}

struct KeyState {
    holders: Vec<(String, LockMode)>,
}

pub struct StateArbitrator {
    keys: RwLock<HashMap<String, KeyState>>,
}

impl StateArbitrator {
    pub fn new() -> Arc<Self> {
        Arc::new(Self {
            keys: RwLock::new(HashMap::new()),
        })
    }

    /// Attempt to acquire `key` for `principal`. Multiple shared
    /// holders are fine; an exclusive holder must be alone.
    pub fn try_acquire(&self, key: &str, principal: &str, mode: LockMode) -> Result<(), String> {
        let mut keys = self.keys.write().unwrap();
        let entry = keys
            .entry(key.to_string())
            .or_insert(KeyState { holders: Vec::new() });

        let has_exclusive_holder = entry.holders.iter().any(|(_, m)| *m == LockMode::Exclusive);
        let would_conflict = has_exclusive_holder
            || (mode == LockMode::Exclusive && !entry.holders.is_empty());

        if would_conflict {
            return Err(format!(
                "state key '{key}' is locked; '{principal}' must wait"
            ));
        }
        entry.holders.push((principal.to_string(), mode));
        Ok(())
    }

    pub fn release(&self, key: &str, principal: &str) {
        if let Some(entry) = self.keys.write().unwrap().get_mut(key) {
            entry.holders.retain(|(p, _)| p != principal);
        }
    }

    /// Current holders of a key, for debugging/audit — never for
    /// bypassing the lock itself.
    pub fn holders_of(&self, key: &str) -> Vec<(String, LockMode)> {
        self.keys
            .read()
            .unwrap()
            .get(key)
            .map(|k| k.holders.clone())
            .unwrap_or_default()
    }
}
