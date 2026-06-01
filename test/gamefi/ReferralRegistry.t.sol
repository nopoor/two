// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {SystemAccessControl} from "src/gamefi/access/SystemAccessControl.sol";
import {ReferralRegistry} from "src/gamefi/referral/ReferralRegistry.sol";
import {Roles} from "src/gamefi/libraries/Roles.sol";

contract ReferralRegistryTest is Test {
    SystemAccessControl internal accessControl;
    ReferralRegistry internal registry;

    address internal admin = address(0xA11CE);
    address internal binder = address(0xB10D);
    address internal rewarder = address(0xFEE1);
    address internal player = address(0x1111);
    address internal referrer = address(0x2222);

    function setUp() external {
        vm.prank(admin);
        accessControl = new SystemAccessControl(admin);

        vm.startPrank(admin);
        accessControl.grantRole(Roles.REFERRAL_BINDER_ROLE, binder);
        accessControl.grantRole(Roles.REFERRAL_REWARD_ROLE, rewarder);
        vm.stopPrank();

        registry = new ReferralRegistry(address(accessControl));
    }

    function testBindReferrer() external {
        vm.prank(binder);
        registry.bindReferrer(player, referrer);

        assertEq(registry.referrerOf(player), referrer);
        assertEq(registry.referredUserCount(referrer), 1);
    }

    function testRejectSelfReferral() external {
        vm.prank(binder);
        vm.expectRevert(ReferralRegistry.SelfReferral.selector);
        registry.bindReferrer(player, player);
    }

    function testRejectDuplicateBinding() external {
        vm.startPrank(binder);
        registry.bindReferrer(player, referrer);
        vm.expectRevert(
            abi.encodeWithSelector(ReferralRegistry.ReferrerAlreadyBound.selector, player, referrer)
        );
        registry.bindReferrer(player, address(0x3333));
        vm.stopPrank();
    }

    function testRejectUnauthorizedBinder() external {
        vm.prank(player);
        vm.expectRevert(
            abi.encodeWithSelector(
                bytes4(keccak256("Unauthorized(address,bytes32)")), player, Roles.REFERRAL_BINDER_ROLE
            )
        );
        registry.bindReferrer(player, referrer);
    }

    function testRecordReferralReward() external {
        vm.prank(binder);
        registry.bindReferrer(player, referrer);

        vm.prank(rewarder);
        bool recorded = registry.recordReferralReward(player, 25 ether);

        assertTrue(recorded);
        assertEq(registry.totalReferralRewards(referrer), 25 ether);
    }

    function testSkipRewardWhenPlayerHasNoReferrer() external {
        vm.prank(rewarder);
        bool recorded = registry.recordReferralReward(player, 1 ether);

        assertFalse(recorded);
    }

    function testPauseBlocksMutations() external {
        vm.prank(admin);
        accessControl.pause();

        vm.prank(binder);
        vm.expectRevert(bytes4(keccak256("SystemPaused()")));
        registry.bindReferrer(player, referrer);
    }
}
