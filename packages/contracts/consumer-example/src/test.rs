#![cfg(test)]
use super::*;
use soroban_sdk::{
    contract, contractimpl, testutils::Address as _, testutils::Ledger as _, Address, BytesN, Env,
};

// Mock registry returning a fixed proven feed value, observed after close.
#[contract]
pub struct MockRegistry;
#[contractimpl]
impl MockRegistry {
    pub fn read_feed(env: Env, _feed_id: u32) -> Option<FeedEntry> {
        Some(FeedEntry {
            value: 2,
            inputs_commitment: BytesN::from_array(&env, &[0u8; 32]),
            timestamp: 1500, // >= market close_ts (1000)
            epoch: 1,
            circuit_id: 1,
        })
    }
}

fn setup(env: &Env) -> ConsumerClient<'static> {
    let reg = env.register(MockRegistry, ());
    let id = env.register(Consumer, (&reg,));
    let client = ConsumerClient::new(env, &id);
    client.create_market(&1, &1, &1000); // closes at ts 1000
    ConsumerClient::new(env, &id)
}

#[test]
fn settles_winners_proportionally() {
    let env = Env::default();
    env.mock_all_auths();
    env.ledger().with_mut(|l| l.timestamp = 100);
    let c = setup(&env);

    let a = Address::generate(&env);
    let b = Address::generate(&env);
    c.bet(&1, &a, &2, &100); // predicts the winning value
    c.bet(&1, &b, &3, &100); // wrong

    env.ledger().with_mut(|l| l.timestamp = 2000); // past close
    let winning = c.settle(&1);
    assert_eq!(winning, 2);

    let bets = c.get_bets(&1);
    assert_eq!(bets.get(0).unwrap().payout, 200); // takes the whole pool
    assert_eq!(bets.get(1).unwrap().payout, 0);
    assert!(c.get_market(&1).unwrap().settled);
}

#[test]
fn refunds_when_no_winner() {
    let env = Env::default();
    env.mock_all_auths();
    env.ledger().with_mut(|l| l.timestamp = 100);
    let c = setup(&env);

    let a = Address::generate(&env);
    c.bet(&1, &a, &7, &50); // nobody predicts the winning value (2)

    env.ledger().with_mut(|l| l.timestamp = 2000);
    c.settle(&1);
    assert_eq!(c.get_bets(&1).get(0).unwrap().payout, 50); // refunded
}

#[test]
fn cannot_settle_twice() {
    let env = Env::default();
    env.mock_all_auths();
    env.ledger().with_mut(|l| l.timestamp = 2000);
    let c = setup(&env);
    c.settle(&1);
    assert_eq!(c.try_settle(&1), Err(Ok(Error::AlreadySettled)));
}

#[test]
fn cannot_settle_before_close() {
    let env = Env::default();
    env.mock_all_auths();
    env.ledger().with_mut(|l| l.timestamp = 100); // before close (1000)
    let c = setup(&env);
    assert_eq!(c.try_settle(&1), Err(Ok(Error::MarketStillOpen)));
}

#[test]
fn bet_rejects_nonpositive_amount() {
    let env = Env::default();
    env.mock_all_auths();
    env.ledger().with_mut(|l| l.timestamp = 100);
    let c = setup(&env);
    let a = Address::generate(&env);
    assert_eq!(c.try_bet(&1, &a, &2, &0), Err(Ok(Error::InvalidAmount)));
    assert_eq!(c.try_bet(&1, &a, &2, &-5), Err(Ok(Error::InvalidAmount)));
}
