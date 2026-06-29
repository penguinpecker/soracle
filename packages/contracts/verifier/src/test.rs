#![cfg(test)]
use super::*;
use soroban_sdk::{testutils::Address as _, vec, Address, BytesN, Env};

fn dummy_vk(env: &Env, n_ic: u32) -> VerifyingKey {
    let mut ic = Vec::new(env);
    for _ in 0..n_ic {
        ic.push_back(BytesN::from_array(env, &[0u8; 64]));
    }
    VerifyingKey {
        alpha: BytesN::from_array(env, &[0u8; 64]),
        beta: BytesN::from_array(env, &[0u8; 128]),
        gamma: BytesN::from_array(env, &[0u8; 128]),
        delta: BytesN::from_array(env, &[0u8; 128]),
        ic,
    }
}

#[test]
fn unknown_vk_errors() {
    let env = Env::default();
    let admin = Address::generate(&env);
    let id = env.register(Verifier, (&admin,));
    let client = VerifierClient::new(&env, &id);

    let proof = Proof {
        a: BytesN::from_array(&env, &[0u8; 64]),
        b: BytesN::from_array(&env, &[0u8; 128]),
        c: BytesN::from_array(&env, &[0u8; 64]),
    };
    assert_eq!(
        client.try_verify(&1, &proof, &vec![&env]),
        Err(Ok(Error::UnknownVk))
    );
}

#[test]
fn public_input_count_must_match_ic() {
    let env = Env::default();
    env.mock_all_auths();
    let admin = Address::generate(&env);
    let id = env.register(Verifier, (&admin,));
    let client = VerifierClient::new(&env, &id);

    // vk for a circuit with 6 public inputs => ic length 7
    client.register_vkey(&1, &dummy_vk(&env, 7));

    let proof = Proof {
        a: BytesN::from_array(&env, &[0u8; 64]),
        b: BytesN::from_array(&env, &[0u8; 128]),
        c: BytesN::from_array(&env, &[0u8; 64]),
    };
    // pass only 2 public inputs -> mismatch -> MalformedVk (caught before any
    // point decoding, so no host pairing on zero points).
    let inputs = vec![
        &env,
        BytesN::from_array(&env, &[0u8; 32]),
        BytesN::from_array(&env, &[0u8; 32]),
    ];
    assert_eq!(
        client.try_verify(&1, &proof, &inputs),
        Err(Ok(Error::MalformedVk))
    );
}

// NOTE: an end-to-end test with a REAL proof/vkey vector is wired through the
// node integration test (packages/node) once `npm run build` in circuits has
// produced consensus.zkey + consensus.soroban-vkey.json. Verifying against
// garbage points here would trap in the host pairing routine, so we only test
// the pre-pairing guard rails on-chain.
