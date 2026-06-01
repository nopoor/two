// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {AccessControlled} from "src/gamefi/access/AccessControlled.sol";
import {IReferralRegistry} from "src/gamefi/interfaces/IReferralRegistry.sol";
import {Roles} from "src/gamefi/libraries/Roles.sol";

contract ReferralRegistry is AccessControlled, IReferralRegistry {
    error InvalidPlayer();
    error InvalidReferrer();
    error SelfReferral();
    error ReferrerAlreadyBound(address player, address existingReferrer);
    error RewardAmountZero();

    mapping(address => address) private _referrers;
    mapping(address => uint256) public referredUserCount;
    mapping(address => uint256) public totalReferralRewards;

    event ReferrerBound(address indexed player, address indexed referrer, address indexed binder);
    event ReferralRewardRecorded(address indexed referrer, address indexed player, uint256 amount, address operator);

    constructor(address accessControl_) AccessControlled(accessControl_) {}

    function referrerOf(address player) external view returns (address) {
        return _referrers[player];
    }

    function isBound(address player) external view returns (bool) {
        return _referrers[player] != address(0);
    }

    function bindReferrer(address player, address referrer)
        external
        onlyRole(Roles.REFERRAL_BINDER_ROLE)
        whenSystemNotPaused
    {
        if (player == address(0)) revert InvalidPlayer();
        if (referrer == address(0)) revert InvalidReferrer();
        if (player == referrer) revert SelfReferral();

        address existingReferrer = _referrers[player];
        if (existingReferrer != address(0)) {
            revert ReferrerAlreadyBound(player, existingReferrer);
        }

        _referrers[player] = referrer;
        referredUserCount[referrer] += 1;

        emit ReferrerBound(player, referrer, msg.sender);
    }

    function recordReferralReward(address player, uint256 amount)
        external
        onlyRole(Roles.REFERRAL_REWARD_ROLE)
        whenSystemNotPaused
        returns (bool recorded)
    {
        if (amount == 0) revert RewardAmountZero();

        address referrer = _referrers[player];
        if (referrer == address(0)) {
            return false;
        }

        totalReferralRewards[referrer] += amount;
        emit ReferralRewardRecorded(referrer, player, amount, msg.sender);
        return true;
    }

    function getReferralStats(address account)
        external
        view
        returns (address boundReferrer, uint256 inviteeCount, uint256 cumulativeRewards)
    {
        return (_referrers[account], referredUserCount[account], totalReferralRewards[account]);
    }
}
