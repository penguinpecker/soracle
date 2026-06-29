#![no_std]
//! Demo consumer: a minimal prediction market that settles on a Soracle feed.
//! Shows DoD #4 — a consumer contract reads a proven feed value and acts on it.
//! Bettors stake on a predicted feed value; `settle` reads the registry feed
//! and pays the winners proportionally. (Token transfer is omitted for the demo;
//! payouts are computed and recorded as claimable entitlements + emitted.)

use soroban_sdk::{
    contract, contracterror, contractimpl, contracttype, symbol_short, vec, Address, Env, IntoVal,
    Symbol, Vec,
};

#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq)]
#[repr(u32)]
pub enum Error {
    NotInitialized = 1,
    UnknownMarket = 2,
    AlreadySettled = 3,
    MarketClosed = 4,
    FeedNotReady = 5,
    InvalidAmount = 6,
    MarketStillOpen = 7,
}

// ~1 day / ~31 days in 5s ledgers.
const TTL_THRESHOLD: u32 = 17_280;
const TTL_EXTEND_TO: u32 = 535_680;

/// Mirror of registry::FeedEntry (cross-contract structs match by field).
#[contracttype]
#[derive(Clone)]
pub struct FeedEntry {
    pub value: i128,
    pub inputs_commitment: soroban_sdk::BytesN<32>,
    pub timestamp: u64,
    pub epoch: u32,
    pub circuit_id: u32,
}

#[contracttype]
#[derive(Clone)]
pub struct Market {
    pub feed_id: u32,
    pub close_ts: u64,
    pub settled: bool,
    pub winning_value: i128,
    pub total_pool: i128,
}

#[contracttype]
#[derive(Clone)]
pub struct Bet {
    pub bettor: Address,
    pub predicted: i128,
    pub amount: i128,
    pub payout: i128,
}

#[contracttype]
enum DataKey {
    Registry,
    Market(u32),
    Bets(u32),
}

#[contract]
pub struct Consumer;

#[contractimpl]
impl Consumer {
    pub fn __constructor(env: Env, registry: Address) {
        env.storage().instance().set(&DataKey::Registry, &registry);
        env.storage().instance().extend_ttl(TTL_THRESHOLD, TTL_EXTEND_TO);
    }

    pub fn create_market(env: Env, market_id: u32, feed_id: u32, close_ts: u64) {
        let market = Market {
            feed_id,
            close_ts,
            settled: false,
            winning_value: 0,
            total_pool: 0,
        };
        env.storage().persistent().set(&DataKey::Market(market_id), &market);
        env.storage()
            .persistent()
            .set(&DataKey::Bets(market_id), &Vec::<Bet>::new(&env));
        bump(&env, market_id);
    }

    pub fn bet(
        env: Env,
        market_id: u32,
        bettor: Address,
        predicted: i128,
        amount: i128,
    ) -> Result<(), Error> {
        bettor.require_auth();
        if amount <= 0 {
            return Err(Error::InvalidAmount);
        }
        let mut market: Market = env
            .storage()
            .persistent()
            .get(&DataKey::Market(market_id))
            .ok_or(Error::UnknownMarket)?;
        if market.settled || env.ledger().timestamp() >= market.close_ts {
            return Err(Error::MarketClosed);
        }
        let mut bets: Vec<Bet> = env
            .storage()
            .persistent()
            .get(&DataKey::Bets(market_id))
            .unwrap_or(Vec::new(&env));
        bets.push_back(Bet {
            bettor,
            predicted,
            amount,
            payout: 0,
        });
        market.total_pool += amount;
        env.storage().persistent().set(&DataKey::Market(market_id), &market);
        env.storage().persistent().set(&DataKey::Bets(market_id), &bets);
        bump(&env, market_id);
        Ok(())
    }

    /// Read the proven feed from the registry and pay winners.
    pub fn settle(env: Env, market_id: u32) -> Result<i128, Error> {
        let mut market: Market = env
            .storage()
            .persistent()
            .get(&DataKey::Market(market_id))
            .ok_or(Error::UnknownMarket)?;
        if market.settled {
            return Err(Error::AlreadySettled);
        }
        // settle only after the market closes (matches bet()'s close enforcement)
        if env.ledger().timestamp() < market.close_ts {
            return Err(Error::MarketStillOpen);
        }

        let registry: Address = env
            .storage()
            .instance()
            .get(&DataKey::Registry)
            .ok_or(Error::NotInitialized)?;
        let entry: Option<FeedEntry> = env.invoke_contract(
            &registry,
            &symbol_short!("read_feed"),
            vec![&env, market.feed_id.into_val(&env)],
        );
        let entry = entry.ok_or(Error::FeedNotReady)?;
        // resolve only on a feed observation at/after close — never a stale value
        if entry.timestamp < market.close_ts {
            return Err(Error::FeedNotReady);
        }
        let winning_value = entry.value;

        let mut bets: Vec<Bet> = env
            .storage()
            .persistent()
            .get(&DataKey::Bets(market_id))
            .unwrap_or(Vec::new(&env));

        // winners' staked pool
        let mut winners_pool: i128 = 0;
        for b in bets.iter() {
            if b.predicted == winning_value {
                winners_pool += b.amount;
            }
        }

        // proportional payout from the whole pool; refund all if nobody won
        let mut settled_bets: Vec<Bet> = Vec::new(&env);
        for b in bets.iter() {
            let payout = if winners_pool == 0 {
                b.amount
            } else if b.predicted == winning_value {
                b.amount * market.total_pool / winners_pool
            } else {
                0
            };
            settled_bets.push_back(Bet { payout, ..b });
        }
        bets = settled_bets;

        market.settled = true;
        market.winning_value = winning_value;
        env.storage().persistent().set(&DataKey::Market(market_id), &market);
        env.storage().persistent().set(&DataKey::Bets(market_id), &bets);
        bump(&env, market_id);
        env.events().publish(
            (Symbol::new(&env, "market_settled"), market_id),
            winning_value,
        );
        Ok(winning_value)
    }

    pub fn get_market(env: Env, market_id: u32) -> Option<Market> {
        env.storage().persistent().get(&DataKey::Market(market_id))
    }

    pub fn get_bets(env: Env, market_id: u32) -> Vec<Bet> {
        env.storage()
            .persistent()
            .get(&DataKey::Bets(market_id))
            .unwrap_or(Vec::new(&env))
    }
}

fn bump(env: &Env, market_id: u32) {
    let p = env.storage().persistent();
    p.extend_ttl(&DataKey::Market(market_id), TTL_THRESHOLD, TTL_EXTEND_TO);
    p.extend_ttl(&DataKey::Bets(market_id), TTL_THRESHOLD, TTL_EXTEND_TO);
    env.storage().instance().extend_ttl(TTL_THRESHOLD, TTL_EXTEND_TO);
}

mod test;
