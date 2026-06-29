#![cfg(test)]
use super::*;
use soroban_sdk::{
    contract, contractimpl, testutils::Address as _, vec, Address, BytesN, Env, Vec,
};

// --- mock verifiers (stand in for the BN254 pairing check) ---
#[contract]
pub struct VerifierOk;
#[contractimpl]
impl VerifierOk {
    pub fn verify(_e: Env, _vk: u32, _p: Proof, _pi: Vec<BytesN<32>>) -> bool {
        true
    }
}

#[contract]
pub struct VerifierBad;
#[contractimpl]
impl VerifierBad {
    pub fn verify(_e: Env, _vk: u32, _p: Proof, _pi: Vec<BytesN<32>>) -> bool {
        false
    }
}

fn proof(env: &Env) -> Proof {
    Proof {
        a: BytesN::from_array(env, &[1u8; 64]),
        b: BytesN::from_array(env, &[2u8; 128]),
        c: BytesN::from_array(env, &[3u8; 64]),
    }
}

fn setup(env: &Env, verifier: &Address) -> (RegistryClient<'static>, Address) {
    let id = env.register(Registry, ());
    let client = RegistryClient::new(env, &id);
    let admin = Address::generate(env);
    let publisher = Address::generate(env);
    client.init(&admin, verifier, &publisher);
    client.register_feed(&1, &1, &BytesN::from_array(env, &[0u8; 32]));
    (RegistryClient::new(env, &id), publisher)
}

#[test]
fn publish_happy_path_stores_value() {
    let env = Env::default();
    env.mock_all_auths();
    let v = env.register(VerifierOk, ());
    let (reg, _pub) = setup(&env, &v);

    let commit = BytesN::from_array(&env, &[9u8; 32]);
    reg.publish(&1, &42, &commit, &1000, &1, &proof(&env));

    let entry = reg.read_feed(&1).unwrap();
    assert_eq!(entry.value, 42);
    assert_eq!(entry.timestamp, 1000);
    assert_eq!(entry.epoch, 1);
}

#[test]
fn rejected_proof_is_not_stored() {
    let env = Env::default();
    env.mock_all_auths();
    let v = env.register(VerifierBad, ());
    let (reg, _pub) = setup(&env, &v);

    let commit = BytesN::from_array(&env, &[9u8; 32]);
    let res = reg.try_publish(&1, &42, &commit, &1000, &1, &proof(&env));
    assert_eq!(res, Err(Ok(Error::ProofRejected)));
    assert!(reg.read_feed(&1).is_none());
}

#[test]
fn stale_timestamp_and_epoch_rejected() {
    let env = Env::default();
    env.mock_all_auths();
    let v = env.register(VerifierOk, ());
    let (reg, _pub) = setup(&env, &v);
    let commit = BytesN::from_array(&env, &[9u8; 32]);

    reg.publish(&1, &10, &commit, &1000, &1, &proof(&env));
    // older timestamp
    assert_eq!(
        reg.try_publish(&1, &11, &commit, &999, &2, &proof(&env)),
        Err(Ok(Error::StaleTimestamp))
    );
    // newer timestamp but non-increasing epoch
    assert_eq!(
        reg.try_publish(&1, &11, &commit, &1001, &1, &proof(&env)),
        Err(Ok(Error::StaleEpoch))
    );
    // both fresh -> ok
    reg.publish(&1, &11, &commit, &1001, &2, &proof(&env));
    assert_eq!(reg.read_feed(&1).unwrap().value, 11);
}

#[test]
fn unknown_feed_rejected() {
    let env = Env::default();
    env.mock_all_auths();
    let v = env.register(VerifierOk, ());
    let (reg, _pub) = setup(&env, &v);
    let commit = BytesN::from_array(&env, &[9u8; 32]);
    assert_eq!(
        reg.try_publish(&99, &1, &commit, &1000, &1, &proof(&env)),
        Err(Ok(Error::UnknownFeed))
    );
}

#[test]
fn negative_value_rejected() {
    let env = Env::default();
    env.mock_all_auths();
    let v = env.register(VerifierOk, ());
    let (reg, _pub) = setup(&env, &v);
    let commit = BytesN::from_array(&env, &[9u8; 32]);
    assert_eq!(
        reg.try_publish(&1, &-5, &commit, &1000, &1, &proof(&env)),
        Err(Ok(Error::NegativeValue))
    );
}
