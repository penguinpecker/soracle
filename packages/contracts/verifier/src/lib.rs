#![no_std]
//! Soracle Groth16 verifier over BN254, using the Protocol 25 (X-Ray) host
//! functions exposed by `soroban_sdk::crypto::bn254`.
//!
//! Adapted from the reference verifier (stellar/soroban-examples PR #399,
//! branch `add-bn254-groth16`). Verifying keys are registered per `vk_id`
//! (== `circuit_id`) by the admin; `verify` runs the standard Groth16 check:
//!
//!   e(-A, B) · e(alpha, beta) · e(vk_x, gamma) · e(C, delta) == 1
//!
//! where vk_x = IC[0] + Σ pub_signals[i] · IC[i+1].
//!
//! Byte layout (CAP-0074, must match packages/circuits/scripts/vkey-to-soroban.mjs
//! and node/src/encoding.ts):
//!   G1 = X(32) || Y(32)                        big-endian, uncompressed
//!   G2 = X.c1 || X.c0 || Y.c1 || Y.c0          (c1 FIRST — the snarkjs swap)
//!   Fr = U256 big-endian (public signals come in as BytesN<32>)

use soroban_sdk::{
    contract, contracterror, contractimpl, contracttype,
    crypto::bn254::{Bn254Fr, Bn254G1Affine, Bn254G2Affine},
    vec, Address, Bytes, BytesN, Env, Vec, U256,
};

#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq)]
#[repr(u32)]
pub enum Error {
    NotInitialized = 1,
    UnknownVk = 3,
    MalformedVk = 4,
}

// ~1 day / ~31 days in 5s ledgers — keep entries live well past any demo window.
const TTL_THRESHOLD: u32 = 17_280;
const TTL_EXTEND_TO: u32 = 535_680;

/// Groth16 proof in raw on-chain byte form (decoded to affine points inside).
#[contracttype]
#[derive(Clone)]
pub struct Proof {
    pub a: BytesN<64>,  // G1
    pub b: BytesN<128>, // G2
    pub c: BytesN<64>,  // G1
}

/// Verifying key for one circuit. `ic` has length nPublic + 1.
#[contracttype]
#[derive(Clone)]
pub struct VerifyingKey {
    pub alpha: BytesN<64>,
    pub beta: BytesN<128>,
    pub gamma: BytesN<128>,
    pub delta: BytesN<128>,
    pub ic: Vec<BytesN<64>>,
}

#[contracttype]
enum DataKey {
    Admin,
    Vk(u32),
}

#[contract]
pub struct Verifier;

#[contractimpl]
impl Verifier {
    /// Admin is bound atomically at deploy time (no separate init -> no
    /// front-running window between deploy and init).
    pub fn __constructor(env: Env, admin: Address) {
        env.storage().instance().set(&DataKey::Admin, &admin);
        env.storage().instance().extend_ttl(TTL_THRESHOLD, TTL_EXTEND_TO);
    }

    /// Register / replace a verifying key for `vk_id` (admin only).
    pub fn register_vkey(env: Env, vk_id: u32, vk: VerifyingKey) -> Result<(), Error> {
        let admin: Address = env
            .storage()
            .instance()
            .get(&DataKey::Admin)
            .ok_or(Error::NotInitialized)?;
        admin.require_auth();
        if vk.ic.len() < 1 {
            return Err(Error::MalformedVk);
        }
        env.storage().persistent().set(&DataKey::Vk(vk_id), &vk);
        // keep the (write-once, read-forever) vkey from being archived
        env.storage()
            .persistent()
            .extend_ttl(&DataKey::Vk(vk_id), TTL_THRESHOLD, TTL_EXTEND_TO);
        env.storage().instance().extend_ttl(TTL_THRESHOLD, TTL_EXTEND_TO);
        Ok(())
    }

    /// Verify a Groth16 proof for `vk_id` against `public_inputs`.
    /// Returns true iff the on-chain pairing check passes.
    pub fn verify(
        env: Env,
        vk_id: u32,
        proof: Proof,
        public_inputs: Vec<BytesN<32>>,
    ) -> Result<bool, Error> {
        let vk: VerifyingKey = env
            .storage()
            .persistent()
            .get(&DataKey::Vk(vk_id))
            .ok_or(Error::UnknownVk)?;
        // bump the hot vkey on every verify so an active feed never archives it
        env.storage()
            .persistent()
            .extend_ttl(&DataKey::Vk(vk_id), TTL_THRESHOLD, TTL_EXTEND_TO);

        // One IC point per public input, plus IC[0].
        if public_inputs.len() + 1 != vk.ic.len() {
            return Err(Error::MalformedVk);
        }

        let bn = env.crypto().bn254();

        // vk_x = IC[0] + Σ public_inputs[i] · IC[i+1]
        let mut vk_x = g1(&env, &vk.ic.get(0).ok_or(Error::MalformedVk)?);
        for i in 0..public_inputs.len() {
            let s = fr(&env, &public_inputs.get(i).unwrap());
            let ic = g1(&env, &vk.ic.get(i + 1).ok_or(Error::MalformedVk)?);
            let prod = bn.g1_mul(&ic, &s);
            vk_x = bn.g1_add(&vk_x, &prod);
        }

        // e(-A, B) · e(alpha, beta) · e(vk_x, gamma) · e(C, delta) == 1
        let neg_a = -g1(&env, &proof.a);
        let vp1 = vec![
            &env,
            neg_a,
            g1(&env, &vk.alpha),
            vk_x,
            g1(&env, &proof.c),
        ];
        let vp2 = vec![
            &env,
            g2(&env, &proof.b),
            g2(&env, &vk.beta),
            g2(&env, &vk.gamma),
            g2(&env, &vk.delta),
        ];

        Ok(bn.pairing_check(vp1, vp2))
    }
}

fn g1(env: &Env, b: &BytesN<64>) -> Bn254G1Affine {
    Bn254G1Affine::from_array(env, &b.to_array())
}

fn g2(env: &Env, b: &BytesN<128>) -> Bn254G2Affine {
    Bn254G2Affine::from_array(env, &b.to_array())
}

fn fr(env: &Env, b: &BytesN<32>) -> Bn254Fr {
    let bytes = Bytes::from_array(env, &b.to_array());
    Bn254Fr::from_u256(U256::from_be_bytes(env, &bytes))
}

mod test;
