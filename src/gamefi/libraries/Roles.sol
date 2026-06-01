// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

library Roles {
    bytes32 internal constant OPERATOR_ROLE = keccak256("OPERATOR_ROLE");
    bytes32 internal constant PAUSER_ROLE = keccak256("PAUSER_ROLE");
    bytes32 internal constant REVENUE_ROLE = keccak256("REVENUE_ROLE");
    bytes32 internal constant GAME_ADMIN_ROLE = keccak256("GAME_ADMIN_ROLE");
    bytes32 internal constant GAME_MANAGER_ROLE = keccak256("GAME_MANAGER_ROLE");
    bytes32 internal constant REFERRAL_BINDER_ROLE = keccak256("REFERRAL_BINDER_ROLE");
    bytes32 internal constant REFERRAL_REWARD_ROLE = keccak256("REFERRAL_REWARD_ROLE");
    bytes32 internal constant AUTOMATION_ROLE = keccak256("AUTOMATION_ROLE");
}
