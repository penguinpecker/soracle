#![no_std]
//! Soracle feed registry. Holds proven feed values and is the only contract a
//! consumer reads. `publish` reconstructs the expected public signals from its
//! typed call args (anti-substitution), enforces monotonic freshness
//! (anti-replay), then calls the verifier's on-chain pairing check BEFORE any
//! value is stored. A value that fails the proof is never written.
//!
//! Public-signal layout reconstructed here is the shared 6-signal "hero feed"
//! layout used by both consensus and derivation (see circuits/SIGNALS.md):
//!   [ feed_id, aux1, value, inputs_commitment, timestamp, epoch ]
//! where aux1 is per-feed static metadata (n_sources for consensus, the
//! wallet_id_hash for derivation), set at register_feed.

use soroban_sdk::{
    contract, contracterror, contractimpl, contracttype, symbol_short, vec, Address, BytesN, Env,
    IntoVal, Symbol,
};

#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq)]
#[repr(u32)]
pub enum Error {
    NotInitialized = 1,
    UnknownFeed = 3,
    StaleTimestamp = 4,
    StaleEpoch = 5,
    ProofRejected = 6,
    NegativeValue = 7,
}

// ~1 day / ~31 days in 5s ledgers — keep persistent entries live past any demo window.
const TTL_THRESHOLD: u32 = 17_280;
const TTL_EXTEND_TO: u32 = 535_680;

/// Mirror of the verifier's Proof type (cross-contract structs match by field).
#[contracttype]
#[derive(Clone)]
pub struct Proof {
    pub a: BytesN<64>,
    pub b: BytesN<128>,
    pub c: BytesN<64>,
}

#[contracttype]
#[derive(Clone)]
pub struct FeedMeta {
    pub circuit_id: u32,
    pub aux1: BytesN<32>,
}

#[contracttype]
#[derive(Clone)]
pub struct FeedEntry {
    pub value: i128,
    pub inputs_commitment: BytesN<32>,
    pub timestamp: u64,
    pub epoch: u32,
    pub circuit_id: u32,
}

#[contracttype]
enum DataKey {
    Admin,
    Verifier,
    Publisher,
    Meta(u32),
    Entry(u32),
}

#[contract]
pub struct Registry;

#[contractimpl]
impl Registry {
    /// Admin/verifier/publisher are bound atomically at deploy time (no separate
    /// init -> no front-running window).
    pub fn __constructor(env: Env, admin: Address, verifier: Address, publisher: Address) {
        let s = env.storage().instance();
        s.set(&DataKey::Admin, &admin);
        s.set(&DataKey::Verifier, &verifier);
        s.set(&DataKey::Publisher, &publisher);
        s.extend_ttl(TTL_THRESHOLD, TTL_EXTEND_TO);
    }

    pub fn set_publisher(env: Env, publisher: Address) -> Result<(), Error> {
        Self::admin(&env)?.require_auth();
        env.storage().instance().set(&DataKey::Publisher, &publisher);
        Ok(())
    }

    pub fn set_verifier(env: Env, verifier: Address) -> Result<(), Error> {
        Self::admin(&env)?.require_auth();
        env.storage().instance().set(&DataKey::Verifier, &verifier);
        Ok(())
    }

    /// Register a feed: which circuit proves it and its static aux1 signal.
    pub fn register_feed(env: Env, feed_id: u32, circuit_id: u32, aux1: BytesN<32>) -> Result<(), Error> {
        Self::admin(&env)?.require_auth();
        env.storage()
            .persistent()
            .set(&DataKey::Meta(feed_id), &FeedMeta { circuit_id, aux1 });
        // Meta is write-once + read-on-every-publish: keep it from archiving.
        env.storage()
            .persistent()
            .extend_ttl(&DataKey::Meta(feed_id), TTL_THRESHOLD, TTL_EXTEND_TO);
        Ok(())
    }

    /// Publish a proven feed value. Only the registered publisher may call.
    pub fn publish(
        env: Env,
        feed_id: u32,
        value: i128,
        inputs_commitment: BytesN<32>,
        timestamp: u64,
        epoch: u32,
        proof: Proof,
    ) -> Result<(), Error> {
        // 1. access control
        let publisher: Address = env
            .storage()
            .instance()
            .get(&DataKey::Publisher)
            .ok_or(Error::NotInitialized)?;
        publisher.require_auth();

        let meta: FeedMeta = env
            .storage()
            .persistent()
            .get(&DataKey::Meta(feed_id))
            .ok_or(Error::UnknownFeed)?;

        // 2. freshness / replay
        if let Some(prev) = env
            .storage()
            .persistent()
            .get::<DataKey, FeedEntry>(&DataKey::Entry(feed_id))
        {
            if timestamp <= prev.timestamp {
                return Err(Error::StaleTimestamp);
            }
            if epoch <= prev.epoch {
                return Err(Error::StaleEpoch);
            }
        }
        if value < 0 {
            return Err(Error::NegativeValue);
        }

        // 3. reconstruct the public signals from the call args (binding) and verify
        let public_inputs = vec![
            &env,
            u32_field(&env, feed_id),
            meta.aux1.clone(),
            i128_field(&env, value),
            inputs_commitment.clone(),
            u64_field(&env, timestamp),
            u32_field(&env, epoch),
        ];

        let verifier: Address = env
            .storage()
            .instance()
            .get(&DataKey::Verifier)
            .ok_or(Error::NotInitialized)?;
        let ok: bool = env.invoke_contract(
            &verifier,
            &symbol_short!("verify"),
            vec![
                &env,
                meta.circuit_id.into_val(&env),
                proof.into_val(&env),
                public_inputs.into_val(&env),
            ],
        );
        if !ok {
            return Err(Error::ProofRejected);
        }

        // 4. store + emit
        let entry = FeedEntry {
            value,
            inputs_commitment,
            timestamp,
            epoch,
            circuit_id: meta.circuit_id,
        };
        env.storage().persistent().set(&DataKey::Entry(feed_id), &entry);
        // keep entry + (write-once) meta + instance live
        env.storage()
            .persistent()
            .extend_ttl(&DataKey::Entry(feed_id), TTL_THRESHOLD, TTL_EXTEND_TO);
        env.storage()
            .persistent()
            .extend_ttl(&DataKey::Meta(feed_id), TTL_THRESHOLD, TTL_EXTEND_TO);
        env.storage().instance().extend_ttl(TTL_THRESHOLD, TTL_EXTEND_TO);
        env.events().publish(
            (Symbol::new(&env, "feed_updated"), feed_id),
            (value, timestamp, epoch),
        );
        Ok(())
    }

    /// View function consumers call.
    pub fn read_feed(env: Env, feed_id: u32) -> Option<FeedEntry> {
        env.storage().persistent().get(&DataKey::Entry(feed_id))
    }

    fn admin(env: &Env) -> Result<Address, Error> {
        env.storage()
            .instance()
            .get(&DataKey::Admin)
            .ok_or(Error::NotInitialized)
    }
}

// --- field-element encoders: typed call arg -> 32-byte big-endian BN254 Fr ---

fn u32_field(env: &Env, x: u32) -> BytesN<32> {
    let mut b = [0u8; 32];
    b[28..32].copy_from_slice(&x.to_be_bytes());
    BytesN::from_array(env, &b)
}

fn u64_field(env: &Env, x: u64) -> BytesN<32> {
    let mut b = [0u8; 32];
    b[24..32].copy_from_slice(&x.to_be_bytes());
    BytesN::from_array(env, &b)
}

// Non-negative i128 only (enforced by the caller). Signed PnL feeds would need
// field reduction (p - |v|); demo derivation data is chosen positive.
fn i128_field(env: &Env, v: i128) -> BytesN<32> {
    let mut b = [0u8; 32];
    b[16..32].copy_from_slice(&(v as u128).to_be_bytes());
    BytesN::from_array(env, &b)
}

mod test;
