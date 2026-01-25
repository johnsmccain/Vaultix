use soroban_sdk::{BytesN, Env};

/// Storage keys for escrow data
pub struct EscrowDataKey;

impl EscrowDataKey {
    /// Prefix for escrow agreements storage
    pub fn escrow(env: &Env) -> BytesN<32> {
        BytesN::from_array(env, &[
            b'E', b'S', b'C', b'R', b'O', b'W', 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
            0, 0, 0, 0, 0, 0, 0, 0, 0,
        ])
    }
    
    /// Prefix for escrow counter (for generating unique IDs)
    pub fn counter(env: &Env) -> BytesN<32> {
        BytesN::from_array(env, &[
            b'C', b'O', b'U', b'N', b'T', b'E', b'R', 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
            0, 0, 0, 0, 0, 0, 0, 0, 0,
        ])
    }
}

/// Storage utility functions for escrow management
pub struct EscrowStorage;

impl EscrowStorage {
    /// Generates a unique escrow ID using a simple counter-based approach
    pub fn generate_escrow_id(env: &Env) -> BytesN<32> {
        // Get current counter value
        let counter_key = EscrowDataKey::counter(env);
        let mut counter: u64 = env.storage().persistent().get(&counter_key).unwrap_or(0);
        
        // Increment counter
        counter = counter.checked_add(1).expect("Counter overflow");
        
        // Store new counter
        env.storage().persistent().set(&counter_key, &counter);
        
        // Generate unique ID using a simple counter-based approach
        let mut hash_input = [0u8; 32];
        hash_input[0..8].copy_from_slice(&counter.to_le_bytes());
        
        // Add some entropy from ledger timestamp
        let timestamp = env.ledger().timestamp();
        hash_input[8..16].copy_from_slice(&timestamp.to_le_bytes());
        
        BytesN::from_array(env, &hash_input)
    }
    
    /// Stores an escrow agreement
    pub fn store_escrow(env: &Env, escrow_id: &BytesN<32>, escrow: &crate::types::EscrowAgreement) {
        env.storage().persistent().set(escrow_id, escrow);
    }
    
    /// Retrieves an escrow agreement
    pub fn get_escrow(env: &Env, escrow_id: &BytesN<32>) -> Option<crate::types::EscrowAgreement> {
        env.storage().persistent().get(escrow_id)
    }
    
    /// Checks if an escrow exists
    pub fn escrow_exists(env: &Env, escrow_id: &BytesN<32>) -> bool {
        env.storage().persistent().has(escrow_id)
    }
    
    /// Removes an escrow agreement
    pub fn remove_escrow(env: &Env, escrow_id: &BytesN<32>) {
        env.storage().persistent().remove(escrow_id);
    }
}
