use super::*;
use soroban_sdk::{token, Address, Env, testutils::Address as _, vec};

fn create_token_contract<'a>(
    env: &Env,
    admin: &Address,
) -> (token::Client<'a>, token::StellarAssetClient<'a>) {
    let contract_address = env.register_stellar_asset_contract_v2(admin.clone());
    (
        token::Client::new(env, &contract_address.address()),
        token::StellarAssetClient::new(env, &contract_address.address()),
    )
}

#[test]
fn test_create_and_get_escrow() {
    let env = Env::default();
    env.mock_all_auths();

    let contract_id = env.register(VaultixEscrow, ());
    let client = VaultixEscrowClient::new(&env, &contract_id);

    let depositor = Address::generate(&env);
    let recipient = Address::generate(&env);
    let admin = Address::generate(&env);
    let escrow_id = 1u64;

    // Create token contract and mint tokens to depositor
    let (token_client, token_admin) = create_token_contract(&env, &admin);
    token_admin.mint(&depositor, &10000);

    // Create milestones
    let milestones = vec![
        &env,
        Milestone {
            amount: 3000,
            status: MilestoneStatus::Pending,
            description: symbol_short!("Design"),
        },
        Milestone {
            amount: 3000,
            status: MilestoneStatus::Pending,
            description: symbol_short!("Dev"),
        },
        Milestone {
            amount: 4000,
            status: MilestoneStatus::Pending,
            description: symbol_short!("Deploy"),
        },
    ];

    // Create escrow
    client.create_escrow(
        &escrow_id,
        &depositor,
        &recipient,
        &milestones,
        &token_client.address,
    );

    // Retrieve escrow
    let escrow = client.get_escrow(&escrow_id);
    assert_eq!(escrow.depositor, depositor);
    assert_eq!(escrow.recipient, recipient);
    assert_eq!(escrow.total_amount, 10000);
    assert_eq!(escrow.total_released, 0);
    assert_eq!(escrow.status, EscrowStatus::Active);
    assert_eq!(escrow.milestones.len(), 3);

    // Check balances after escrow creation
    assert_eq!(token_client.balance(&depositor), 0); // 10000 - 10000
    assert_eq!(token_client.balance(&contract_id), 10000);
    assert_eq!(token_client.balance(&recipient), 0);
}

#[test]
fn test_buyer_confirm_delivery() {
    let env = Env::default();
    env.mock_all_auths();

    let contract_id = env.register(VaultixEscrow, ());
    let client = VaultixEscrowClient::new(&env, &contract_id);

    let buyer = Address::generate(&env);
    let seller = Address::generate(&env);
    let admin = Address::generate(&env);
    let escrow_id = 2u64;

    // Create token contract and mint tokens to buyer
    let (token_client, token_admin) = create_token_contract(&env, &admin);
    token_admin.mint(&buyer, &10000);

    let milestones = vec![
        &env,
        Milestone {
            amount: 5000,
            status: MilestoneStatus::Pending,
            description: symbol_short!("Phase1"),
        },
        Milestone {
            amount: 5000,
            status: MilestoneStatus::Pending,
            description: symbol_short!("Phase2"),
        },
    ];

    client.create_escrow(
        &escrow_id,
        &buyer,
        &seller,
        &milestones,
        &token_client.address,
    );

    // Buyer confirms delivery and releases first milestone
    client.confirm_delivery(&escrow_id, &0, &buyer);

    let escrow = client.get_escrow(&escrow_id);
    assert_eq!(escrow.total_released, 5000);
    assert_eq!(
        escrow.milestones.get(0).unwrap().status,
        MilestoneStatus::Released
    );
    assert_eq!(
        escrow.milestones.get(1).unwrap().status,
        MilestoneStatus::Pending
    );

    // Check seller received funds
    assert_eq!(token_client.balance(&buyer), 0);
    assert_eq!(token_client.balance(&contract_id), 5000);
    assert_eq!(token_client.balance(&seller), 5000);
}

#[test]
fn test_complete_escrow() {
    let env = Env::default();
    env.mock_all_auths();

    let contract_id = env.register(VaultixEscrow, ());
    let client = VaultixEscrowClient::new(&env, &contract_id);

    let depositor = Address::generate(&env);
    let recipient = Address::generate(&env);
    let admin = Address::generate(&env);
    let escrow_id = 3u64;

    // Create token contract and mint tokens
    let (token_client, token_admin) = create_token_contract(&env, &admin);
    token_admin.mint(&depositor, &10000);

    let milestones = vec![
        &env,
        Milestone {
            amount: 5000,
            status: MilestoneStatus::Pending,
            description: symbol_short!("Task1"),
        },
        Milestone {
            amount: 5000,
            status: MilestoneStatus::Pending,
            description: symbol_short!("Task2"),
        },
    ];

    client.create_escrow(
        &escrow_id,
        &depositor,
        &recipient,
        &milestones,
        &token_client.address,
    );

    // Buyer confirms delivery for all milestones
    client.confirm_delivery(&escrow_id, &0, &depositor);
    client.confirm_delivery(&escrow_id, &1, &depositor);

    // Complete the escrow
    client.complete_escrow(&escrow_id);

    let escrow = client.get_escrow(&escrow_id);
    assert_eq!(escrow.status, EscrowStatus::Completed);
    assert_eq!(escrow.total_released, 10000);
}

#[test]
fn test_cancel_escrow() {
    let env = Env::default();
    env.mock_all_auths();

    let contract_id = env.register(VaultixEscrow, ());
    let client = VaultixEscrowClient::new(&env, &contract_id);

    let depositor = Address::generate(&env);
    let recipient = Address::generate(&env);
    let admin = Address::generate(&env);
    let escrow_id = 4u64;

    // Create token contract and mint tokens
    let (token_client, token_admin) = create_token_contract(&env, &admin);
    token_admin.mint(&depositor, &10000);

    let milestones = vec![
        &env,
        Milestone {
            amount: 10000,
            status: MilestoneStatus::Pending,
            description: symbol_short!("Work"),
        },
    ];

    client.create_escrow(
        &escrow_id,
        &depositor,
        &recipient,
        &milestones,
        &token_client.address,
    );

    // Cancel before any releases
    client.cancel_escrow(&escrow_id);

    let escrow = client.get_escrow(&escrow_id);
    assert_eq!(escrow.status, EscrowStatus::Cancelled);
}

#[test]
#[should_panic(expected = "Error(Contract, #2)")]
fn test_duplicate_escrow_id() {
    let env = Env::default();
    env.mock_all_auths();

    let contract_id = env.register(VaultixEscrow, ());
    let client = VaultixEscrowClient::new(&env, &contract_id);

    let depositor = Address::generate(&env);
    let recipient = Address::generate(&env);
    let admin = Address::generate(&env);
    let escrow_id = 5u64;

    // Create token contract and mint tokens
    let (token_client, token_admin) = create_token_contract(&env, &admin);
    token_admin.mint(&depositor, &10000);

    let milestones = vec![
        &env,
        Milestone {
            amount: 1000,
            status: MilestoneStatus::Pending,
            description: symbol_short!("Test"),
        },
    ];

    client.create_escrow(
        &escrow_id,
        &depositor,
        &recipient,
        &milestones,
        &token_client.address,
    );
    // This should panic with Error #2 (EscrowAlreadyExists)
    client.create_escrow(
        &escrow_id,
        &depositor,
        &recipient,
        &milestones,
        &token_client.address,
    );
}

#[test]
#[should_panic(expected = "Error(Contract, #4)")]
fn test_double_release() {
    let env = Env::default();
    env.mock_all_auths();

    let contract_id = env.register(VaultixEscrow, ());
    let client = VaultixEscrowClient::new(&env, &contract_id);

    // Initialize treasury
    let treasury = Address::generate(&env);
    client.initialize(&treasury, &Some(50));

    let depositor = Address::generate(&env);
    let recipient = Address::generate(&env);
    let admin = Address::generate(&env);
    let escrow_id = 6u64;

    // Create token contract and mint tokens
    let (token_client, token_admin) = create_token_contract(&env, &admin);
    token_admin.mint(&depositor, &10000);

    let milestones = vec![
        &env,
        Milestone {
            amount: 1000,
            status: MilestoneStatus::Pending,
            description: symbol_short!("Task"),
        },
    ];

    client.create_escrow(
        &escrow_id,
        &depositor,
        &recipient,
        &milestones,
        &token_client.address,
    );

    // Release first time with fee deduction
    client.release_milestone(&escrow_id, &0, &token_client.address);
    // This should panic with Error #4 (MilestoneAlreadyReleased)
    client.release_milestone(&escrow_id, &0, &token_client.address);
}

#[test]
#[should_panic(expected = "Error(Contract, #10)")]
fn test_too_many_milestones() {
    let env = Env::default();
    env.mock_all_auths();

    let contract_id = env.register(VaultixEscrow, ());
    let client = VaultixEscrowClient::new(&env, &contract_id);

    let depositor = Address::generate(&env);
    let recipient = Address::generate(&env);
    let admin = Address::generate(&env);
    let escrow_id = 7u64;

    // Create token contract and mint tokens
    let (token_client, token_admin) = create_token_contract(&env, &admin);
    token_admin.mint(&depositor, &10000);

    // Create 21 milestones (exceeds max of 20)
    let mut milestones = Vec::new(&env);
    for _i in 0..21 {
        milestones.push_back(Milestone {
            amount: 100,
            status: MilestoneStatus::Pending,
            description: symbol_short!("Task"),
        });
    }

    // This should panic with Error #10 (VectorTooLarge)
    client.create_escrow(
        &escrow_id,
        &depositor,
        &recipient,
        &milestones,
        &token_client.address,
    );
}

#[test]
#[should_panic(expected = "Error(Contract, #13)")]
fn test_invalid_milestone_amount() {
    let env = Env::default();
    env.mock_all_auths();

    let contract_id = env.register(VaultixEscrow, ());
    let client = VaultixEscrowClient::new(&env, &contract_id);

    let depositor = Address::generate(&env);
    let recipient = Address::generate(&env);
    let admin = Address::generate(&env);
    let escrow_id = 8u64;

    // Create token contract and mint tokens
    let (token_client, token_admin) = create_token_contract(&env, &admin);
    token_admin.mint(&depositor, &10000);

    let milestones = vec![
        &env,
        Milestone {
            amount: 0, // Invalid: zero amount
            status: MilestoneStatus::Pending,
            description: symbol_short!("Task"),
        },
    ];

    // This should panic with Error #13 (ZeroAmount)
    client.create_escrow(
        &escrow_id,
        &depositor,
        &recipient,
        &milestones,
        &token_client.address,
    );
}

#[test]
#[should_panic(expected = "Error(Contract, #5)")]
fn test_unauthorized_confirm_delivery() {
    let env = Env::default();
    env.mock_all_auths();

    let contract_id = env.register(VaultixEscrow, ());
    let client = VaultixEscrowClient::new(&env, &contract_id);

    let buyer = Address::generate(&env);
    let seller = Address::generate(&env);
    let non_buyer = Address::generate(&env);
    let admin = Address::generate(&env);
    let escrow_id = 9u64;

    // Create token contract and mint tokens
    let (token_client, token_admin) = create_token_contract(&env, &admin);
    token_admin.mint(&buyer, &10000);

    let milestones = vec![
        &env,
        Milestone {
            amount: 1000,
            status: MilestoneStatus::Pending,
            description: symbol_short!("Task"),
        },
    ];

    client.create_escrow(
        &escrow_id,
        &buyer,
        &seller,
        &milestones,
        &token_client.address,
    );

    // Non-buyer tries to confirm delivery - should panic with Error #5 (UnauthorizedAccess)
    client.confirm_delivery(&escrow_id, &0, &non_buyer);
}

#[test]
#[should_panic(expected = "Error(Contract, #4)")]
fn test_double_confirm_delivery() {
    let env = Env::default();
    env.mock_all_auths();

    let contract_id = env.register(VaultixEscrow, ());
    let client = VaultixEscrowClient::new(&env, &contract_id);

    let buyer = Address::generate(&env);
    let seller = Address::generate(&env);
    let admin = Address::generate(&env);
    let escrow_id = 10u64;

    // Create token contract and mint tokens
    let (token_client, token_admin) = create_token_contract(&env, &admin);
    token_admin.mint(&buyer, &10000);

    let milestones = vec![
        &env,
        Milestone {
            amount: 1000,
            status: MilestoneStatus::Pending,
            description: symbol_short!("Task"),
        },
    ];

    client.create_escrow(
        &escrow_id,
        &buyer,
        &seller,
        &milestones,
        &token_client.address,
    );

    // First confirmation succeeds
    client.confirm_delivery(&escrow_id, &0, &buyer);

    // Second confirmation should panic with Error #4 (MilestoneAlreadyReleased)
    client.confirm_delivery(&escrow_id, &0, &buyer);
}

#[test]
fn test_zero_amount_milestone_rejected() {
    let env = Env::default();
    env.mock_all_auths();
    let contract_id = env.register(VaultixEscrow, ());
    let client = VaultixEscrowClient::new(&env, &contract_id);

    let depositor = Address::generate(&env);
    let recipient = Address::generate(&env);
    let admin = Address::generate(&env);
    let escrow_id = 11u64;

    // Create token contract and mint tokens
    let (token_client, token_admin) = create_token_contract(&env, &admin);
    token_admin.mint(&depositor, &10000);

    // Create milestones with one zero amount
    let milestones = vec![
        &env,
        Milestone {
            amount: 0, // Invalid: zero amount
            status: MilestoneStatus::Pending,
            description: symbol_short!("Test"),
        },
    ];

    // Attempt to create escrow with zero amount milestone
    let result = client.try_create_escrow(
        &escrow_id,
        &depositor,
        &recipient,
        &milestones,
        &token_client.address,
    );

    // Assert specific error is returned
    assert_eq!(result, Err(Ok(Error::ZeroAmount)));
}

#[test]
fn test_negative_amount_milestone_rejected() {
    let env = Env::default();
    env.mock_all_auths();
    let contract_id = env.register(VaultixEscrow, ());
    let client = VaultixEscrowClient::new(&env, &contract_id);

    let depositor = Address::generate(&env);
    let recipient = Address::generate(&env);
    let admin = Address::generate(&env);
    let escrow_id = 12u64;

    // Create token contract and mint tokens
    let (token_client, token_admin) = create_token_contract(&env, &admin);
    token_admin.mint(&depositor, &10000);

    // Create milestones with negative amount
    let milestones = vec![
        &env,
        Milestone {
            amount: -1000, // Invalid: negative amount
            status: MilestoneStatus::Pending,
            description: symbol_short!("Test"),
        },
    ];

    // Attempt to create escrow
    let result = client.try_create_escrow(
        &escrow_id,
        &depositor,
        &recipient,
        &milestones,
        &token_client.address,
    );

    // Assert ZeroAmount error (covers negative case)
    assert_eq!(result, Err(Ok(Error::ZeroAmount)));
}

#[test]
fn test_self_dealing_rejected() {
    let env = Env::default();
    env.mock_all_auths();
    let contract_id = env.register(VaultixEscrow, ());
    let client = VaultixEscrowClient::new(&env, &contract_id);

    let same_party = Address::generate(&env); // Same address for both
    let admin = Address::generate(&env);
    let escrow_id = 13u64;

    // Create token contract and mint tokens
    let (token_client, token_admin) = create_token_contract(&env, &admin);
    token_admin.mint(&same_party, &10000);

    // Create valid milestones
    let milestones = vec![
        &env,
        Milestone {
            amount: 5000,
            status: MilestoneStatus::Pending,
            description: symbol_short!("Task"),
        },
    ];

    // Attempt to create escrow where depositor == recipient
    let result = client.try_create_escrow(
        &escrow_id,
        &same_party,
        &same_party,
        &milestones,
        &token_client.address,
    );

    // Assert SelfDealing error
    assert_eq!(result, Err(Ok(Error::SelfDealing)));
}

#[test]
fn test_valid_escrow_creation_succeeds() {
    let env = Env::default();
    env.mock_all_auths();
    let contract_id = env.register(VaultixEscrow, ());
    let client = VaultixEscrowClient::new(&env, &contract_id);

    let depositor = Address::generate(&env);
    let recipient = Address::generate(&env);
    let admin = Address::generate(&env);
    let escrow_id = 14u64;

    // Create token contract and mint tokens
    let (token_client, token_admin) = create_token_contract(&env, &admin);
    token_admin.mint(&depositor, &10000);

    // Valid milestones with positive amounts
    let milestones = vec![
        &env,
        Milestone {
            amount: 3000,
            status: MilestoneStatus::Pending,
            description: symbol_short!("Phase1"),
        },
        Milestone {
            amount: 7000,
            status: MilestoneStatus::Pending,
            description: symbol_short!("Phase2"),
        },
    ];

    // Create escrow - should succeed
    let result = client.try_create_escrow(
        &escrow_id,
        &depositor,
        &recipient,
        &milestones,
        &token_client.address,
    );

    // Assert success
    assert!(result.is_ok());

    // Verify escrow was created correctly
    let escrow = client.get_escrow(&escrow_id);
    assert_eq!(escrow.depositor, depositor);
    assert_eq!(escrow.recipient, recipient);
    assert_eq!(escrow.total_amount, 10000);
}

// ============================================================================
// Platform Fee Tests
// ============================================================================

#[test]
fn test_initialize_contract() {
    let env = Env::default();
    env.mock_all_auths();

    let contract_id = env.register(VaultixEscrow, ());
    let client = VaultixEscrowClient::new(&env, &contract_id);

    let treasury = Address::generate(&env);
    
    // Initialize with default fee
    client.initialize(&treasury, &None);
    
    let (stored_treasury, fee_bps) = client.get_config();
    assert_eq!(stored_treasury, treasury);
    assert_eq!(fee_bps, 50); // Default 0.5%
}

#[test]
fn test_initialize_with_custom_fee() {
    let env = Env::default();
    env.mock_all_auths();

    let contract_id = env.register(VaultixEscrow, ());
    let client = VaultixEscrowClient::new(&env, &contract_id);

    let treasury = Address::generate(&env);
    
    // Initialize with custom fee (1%)
    client.initialize(&treasury, &Some(100));
    
    let (stored_treasury, fee_bps) = client.get_config();
    assert_eq!(stored_treasury, treasury);
    assert_eq!(fee_bps, 100);
}

#[test]
#[should_panic(expected = "Error(Contract, #12)")]
fn test_initialize_invalid_fee() {
    let env = Env::default();
    env.mock_all_auths();

    let contract_id = env.register(VaultixEscrow, ());
    let client = VaultixEscrowClient::new(&env, &contract_id);

    let treasury = Address::generate(&env);
    
    // Try to initialize with fee > 100% (should panic)
    client.initialize(&treasury, &Some(10001));
}

#[test]
fn test_update_fee() {
    let env = Env::default();
    env.mock_all_auths();

    let contract_id = env.register(VaultixEscrow, ());
    let client = VaultixEscrowClient::new(&env, &contract_id);

    let treasury = Address::generate(&env);
    client.initialize(&treasury, &Some(50));
    
    // Update fee to 1%
    client.update_fee(&100);
    
    let (_, fee_bps) = client.get_config();
    assert_eq!(fee_bps, 100);
}

#[test]
fn test_fee_calculation_standard_amount() {
    let env = Env::default();
    env.mock_all_auths();

    let contract_id = env.register(VaultixEscrow, ());
    let client = VaultixEscrowClient::new(&env, &contract_id);

    // Initialize with 0.5% fee (50 bps)
    let treasury = Address::generate(&env);
    client.initialize(&treasury, &Some(50));

    // Setup token
    let token_admin = Address::generate(&env);
    let token_address = env.register_stellar_asset_contract_v2(token_admin.clone()).address();

    let depositor = Address::generate(&env);
    let recipient = Address::generate(&env);
    let escrow_id = 100u64;

    // Create escrow with 10000 amount
    let milestones = vec![
        &env,
        Milestone {
            amount: 10000,
            status: MilestoneStatus::Pending,
            description: symbol_short!("Work"),
        },
    ];

    client.create_escrow(&escrow_id, &depositor, &recipient, &milestones);

    // Mint tokens to contract
    let token_client = token::StellarAssetClient::new(&env, &token_address);
    token_client.mint(&contract_id, &10000);

    // Release milestone
    client.release_milestone(&escrow_id, &0, &token_address);

    // Verify fee calculation: 10000 * 50 / 10000 = 50
    let token = token::TokenClient::new(&env, &token_address);
    let expected_fee = 50;
    let expected_payout = 10000 - expected_fee; // 9950

    assert_eq!(token.balance(&recipient), expected_payout);
    assert_eq!(token.balance(&treasury), expected_fee);
}

#[test]
fn test_fee_calculation_small_amount() {
    let env = Env::default();
    env.mock_all_auths();

    let contract_id = env.register(VaultixEscrow, ());
    let client = VaultixEscrowClient::new(&env, &contract_id);

    // Initialize with 0.5% fee (50 bps)
    let treasury = Address::generate(&env);
    client.initialize(&treasury, &Some(50));

    // Setup token
    let token_admin = Address::generate(&env);
    let token_address = env.register_stellar_asset_contract_v2(token_admin.clone()).address();

    let depositor = Address::generate(&env);
    let recipient = Address::generate(&env);
    let escrow_id = 101u64;

    // Create escrow with small amount (100)
    let milestones = vec![
        &env,
        Milestone {
            amount: 100,
            status: MilestoneStatus::Pending,
            description: symbol_short!("Small"),
        },
    ];

    client.create_escrow(&escrow_id, &depositor, &recipient, &milestones);

    // Mint tokens to contract
    let token_client = token::StellarAssetClient::new(&env, &token_address);
    token_client.mint(&contract_id, &100);

    // Release milestone
    client.release_milestone(&escrow_id, &0, &token_address);

    // Verify fee calculation: 100 * 50 / 10000 = 0 (rounds down)
    let token = token::TokenClient::new(&env, &token_address);
    let expected_fee = 0;
    let expected_payout = 100 - expected_fee; // 100

    assert_eq!(token.balance(&recipient), expected_payout);
    assert_eq!(token.balance(&treasury), expected_fee);
}

#[test]
fn test_fee_calculation_large_amount() {
    let env = Env::default();
    env.mock_all_auths();

    let contract_id = env.register(VaultixEscrow, ());
    let client = VaultixEscrowClient::new(&env, &contract_id);

    // Initialize with 1% fee (100 bps)
    let treasury = Address::generate(&env);
    client.initialize(&treasury, &Some(100));

    // Setup token
    let token_admin = Address::generate(&env);
    let token_address = env.register_stellar_asset_contract_v2(token_admin.clone()).address();

    let depositor = Address::generate(&env);
    let recipient = Address::generate(&env);
    let escrow_id = 102u64;

    // Create escrow with large amount
    let milestones = vec![
        &env,
        Milestone {
            amount: 1_000_000,
            status: MilestoneStatus::Pending,
            description: symbol_short!("Large"),
        },
    ];

    client.create_escrow(&escrow_id, &depositor, &recipient, &milestones);

    // Mint tokens to contract
    let token_client = token::StellarAssetClient::new(&env, &token_address);
    token_client.mint(&contract_id, &1_000_000);

    // Release milestone
    client.release_milestone(&escrow_id, &0, &token_address);

    // Verify fee calculation: 1000000 * 100 / 10000 = 10000
    let token = token::TokenClient::new(&env, &token_address);
    let expected_fee = 10_000;
    let expected_payout = 1_000_000 - expected_fee; // 990000

    assert_eq!(token.balance(&recipient), expected_payout);
    assert_eq!(token.balance(&treasury), expected_fee);
}

#[test]
fn test_fee_calculation_boundary_value() {
    let env = Env::default();
    env.mock_all_auths();

    let contract_id = env.register(VaultixEscrow, ());
    let client = VaultixEscrowClient::new(&env, &contract_id);

    // Initialize with 0.5% fee (50 bps)
    let treasury = Address::generate(&env);
    client.initialize(&treasury, &Some(50));

    // Setup token
    let token_admin = Address::generate(&env);
    let token_address = env.register_stellar_asset_contract_v2(token_admin.clone()).address();

    let depositor = Address::generate(&env);
    let recipient = Address::generate(&env);
    let escrow_id = 103u64;

    // Create escrow with boundary amount (200 - minimum for 1 unit fee)
    let milestones = vec![
        &env,
        Milestone {
            amount: 200,
            status: MilestoneStatus::Pending,
            description: symbol_short!("Boundary"),
        },
    ];

    client.create_escrow(&escrow_id, &depositor, &recipient, &milestones);

    // Mint tokens to contract
    let token_client = token::StellarAssetClient::new(&env, &token_address);
    token_client.mint(&contract_id, &200);

    // Release milestone
    client.release_milestone(&escrow_id, &0, &token_address);

    // Verify fee calculation: 200 * 50 / 10000 = 1
    let token = token::TokenClient::new(&env, &token_address);
    let expected_fee = 1;
    let expected_payout = 200 - expected_fee; // 199

    assert_eq!(token.balance(&recipient), expected_payout);
    assert_eq!(token.balance(&treasury), expected_fee);
}

#[test]
fn test_multiple_milestone_releases_accumulate_fees() {
    let env = Env::default();
    env.mock_all_auths();

    let contract_id = env.register(VaultixEscrow, ());
    let client = VaultixEscrowClient::new(&env, &contract_id);

    // Initialize with 0.5% fee (50 bps)
    let treasury = Address::generate(&env);
    client.initialize(&treasury, &Some(50));

    // Setup token
    let token_admin = Address::generate(&env);
    let token_address = env.register_stellar_asset_contract_v2(token_admin.clone()).address();

    let depositor = Address::generate(&env);
    let recipient = Address::generate(&env);
    let escrow_id = 104u64;

    // Create escrow with multiple milestones
    let milestones = vec![
        &env,
        Milestone {
            amount: 5000,
            status: MilestoneStatus::Pending,
            description: symbol_short!("M1"),
        },
        Milestone {
            amount: 3000,
            status: MilestoneStatus::Pending,
            description: symbol_short!("M2"),
        },
        Milestone {
            amount: 2000,
            status: MilestoneStatus::Pending,
            description: symbol_short!("M3"),
        },
    ];

    client.create_escrow(&escrow_id, &depositor, &recipient, &milestones);

    // Mint tokens to contract
    let token_client = token::StellarAssetClient::new(&env, &token_address);
    token_client.mint(&contract_id, &10000);

    let token = token::TokenClient::new(&env, &token_address);

    // Release first milestone: 5000 * 50 / 10000 = 25 fee
    client.release_milestone(&escrow_id, &0, &token_address);
    assert_eq!(token.balance(&recipient), 4975);
    assert_eq!(token.balance(&treasury), 25);

    // Release second milestone: 3000 * 50 / 10000 = 15 fee
    client.release_milestone(&escrow_id, &1, &token_address);
    assert_eq!(token.balance(&recipient), 4975 + 2985);
    assert_eq!(token.balance(&treasury), 25 + 15);

    // Release third milestone: 2000 * 50 / 10000 = 10 fee
    client.release_milestone(&escrow_id, &2, &token_address);
    assert_eq!(token.balance(&recipient), 4975 + 2985 + 1990);
    assert_eq!(token.balance(&treasury), 25 + 15 + 10);
}

#[test]
fn test_zero_fee_configuration() {
    let env = Env::default();
    env.mock_all_auths();

    let contract_id = env.register(VaultixEscrow, ());
    let client = VaultixEscrowClient::new(&env, &contract_id);

    // Initialize with 0% fee
    let treasury = Address::generate(&env);
    client.initialize(&treasury, &Some(0));

    // Setup token
    let token_admin = Address::generate(&env);
    let token_address = env.register_stellar_asset_contract_v2(token_admin.clone()).address();

    let depositor = Address::generate(&env);
    let recipient = Address::generate(&env);
    let escrow_id = 105u64;

    let milestones = vec![
        &env,
        Milestone {
            amount: 10000,
            status: MilestoneStatus::Pending,
            description: symbol_short!("NoFee"),
        },
    ];

    client.create_escrow(&escrow_id, &depositor, &recipient, &milestones);

    // Mint tokens to contract
    let token_client = token::StellarAssetClient::new(&env, &token_address);
    token_client.mint(&contract_id, &10000);

    // Release milestone
    client.release_milestone(&escrow_id, &0, &token_address);

    // Verify no fee collected
    let token = token::TokenClient::new(&env, &token_address);
    assert_eq!(token.balance(&recipient), 10000);
    assert_eq!(token.balance(&treasury), 0);
}

#[test]
#[should_panic(expected = "Error(Contract, #11)")]
fn test_release_without_initialization() {
    let env = Env::default();
    env.mock_all_auths();

    let contract_id = env.register(VaultixEscrow, ());
    let client = VaultixEscrowClient::new(&env, &contract_id);

    // Setup token
    let token_admin = Address::generate(&env);
    let token_address = env.register_stellar_asset_contract_v2(token_admin.clone()).address();

    let depositor = Address::generate(&env);
    let recipient = Address::generate(&env);
    let escrow_id = 106u64;

    let milestones = vec![
        &env,
        Milestone {
            amount: 1000,
            status: MilestoneStatus::Pending,
            description: symbol_short!("Test"),
        },
    ];

    // Create escrow without initializing contract
    client.create_escrow(&escrow_id, &depositor, &recipient, &milestones);

    // Mint tokens to contract
    let token_client = token::StellarAssetClient::new(&env, &token_address);
    token_client.mint(&contract_id, &1000);

    // This should panic with Error #11 (TreasuryNotInitialized)
    client.release_milestone(&escrow_id, &0, &token_address);
}
