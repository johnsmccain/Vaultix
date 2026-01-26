use super::*;
use soroban_sdk::testutils::{Address as _, Events};
use soroban_sdk::{symbol_short, Address, Env, IntoVal};

#[test]
fn test_escrow_flow() {
    let env = Env::default();
    env.mock_all_auths();

    let contract_id = env.register_contract(None, VaultixContract);
    let client = VaultixContractClient::new(&env, &contract_id);

    let buyer = Address::generate(&env);
    let seller = Address::generate(&env);
    let id = 1u64;
    let amount = 1000i128;

    // 1. Create Escrow
    client.create_escrow(&id, &buyer, &seller, &amount);

    let escrow = client.get_escrow(&id).unwrap();
    assert_eq!(escrow.id, id);
    assert_eq!(escrow.buyer, buyer);
    assert_eq!(escrow.seller, seller);
    assert_eq!(escrow.amount, amount);
    assert_eq!(escrow.status, EscrowStatus::Created);

    // Verify Create Event
    let events = env.events().all();
    assert_eq!(events.len(), 1);
    let event = events.get(0).unwrap();
    assert_eq!(event.0, contract_id);
    assert_eq!(event.1, (symbol_short!("create"), id, buyer.clone(), seller.clone()).into_val(&env));
    let amount_val: i128 = event.2.into_val(&env);
    assert_eq!(amount_val, amount);

    // 2. Confirm Delivery
    client.confirm_delivery(&id);
    let escrow = client.get_escrow(&id).unwrap();
    assert_eq!(escrow.status, EscrowStatus::Released);

    // Verify Release Event
    let events = env.events().all();
    assert_eq!(events.len(), 2);
    let event = events.get(1).unwrap();
    assert_eq!(event.0, contract_id);
    assert_eq!(event.1, (symbol_short!("release"), id).into_val(&env));
    let amount_val: i128 = event.2.into_val(&env);
    assert_eq!(amount_val, amount);
}

#[test]
fn test_dispute_flow() {
    let env = Env::default();
    env.mock_all_auths();

    let contract_id = env.register_contract(None, VaultixContract);
    let client = VaultixContractClient::new(&env, &contract_id);

    let buyer = Address::generate(&env);
    let seller = Address::generate(&env);
    let id = 2u64;
    let amount = 500i128;

    client.create_escrow(&id, &buyer, &seller, &amount);

    // 1. Raise Dispute
    client.raise_dispute(&id, &buyer);
    let escrow = client.get_escrow(&id).unwrap();
    assert_eq!(escrow.status, EscrowStatus::Disputed);

    // Verify Dispute Event
    let events = env.events().all();
    let event = events.get(1).unwrap();
    assert_eq!(event.0, contract_id);
    assert_eq!(event.1, (symbol_short!("dispute"), id, buyer.clone()).into_val(&env));
    let _: () = event.2.into_val(&env);

    // 2. Resolve Dispute
    client.resolve_dispute(&id, &seller);
    let escrow = client.get_escrow(&id).unwrap();
    assert_eq!(escrow.status, EscrowStatus::Resolved);

    // Verify Resolve Event
    let events = env.events().all();
    let event = events.get(2).unwrap();
    assert_eq!(event.0, contract_id);
    assert_eq!(event.1, (symbol_short!("resolve"), id, seller.clone()).into_val(&env));
    let amount_val: i128 = event.2.into_val(&env);
    assert_eq!(amount_val, amount);
}
