// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {ERC20} from "@openzeppelin/token/ERC20/ERC20.sol";
import {SystemAccessControl} from "src/gamefi/access/SystemAccessControl.sol";
import {DividendBankNFT} from "src/gamefi/nft/DividendBankNFT.sol";
import {NftRevenueDistributor} from "src/gamefi/revenue/NftRevenueDistributor.sol";
import {Roles} from "src/gamefi/libraries/Roles.sol";

contract MockIncomePoolForDistributor {
    ERC20 public immutable flap;
    address public distributor;

    constructor(address flap_) {
        flap = ERC20(flap_);
    }

    function setDistributor(address distributor_) external {
        distributor = distributor_;
    }

    function availableFlap() external view returns (uint256) {
        return flap.balanceOf(address(this));
    }

    function allocateToNftDistributor(uint256 amount) external {
        require(msg.sender == distributor, "not distributor");
        flap.transfer(distributor, amount);
    }
}

contract MockFlapForDistributor is ERC20 {
    constructor() ERC20("FLAP", "FLAP") {}

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }
}

contract NftRevenueDistributorTest is Test {
    SystemAccessControl internal accessControl;
    MockFlapForDistributor internal flap;
    DividendBankNFT internal nft;
    MockIncomePoolForDistributor internal incomePool;
    NftRevenueDistributor internal distributor;

    address internal admin = address(0xA11CE);
    address internal alice = address(0x1111);
    address internal bob = address(0x2222);

    function setUp() external {
        vm.prank(admin);
        accessControl = new SystemAccessControl(admin);

        flap = new MockFlapForDistributor();
        nft = new DividendBankNFT();
        nft.initialize("Dividend Bank NFT", "DBNFT", "ipfs://db/", admin, admin, 500);

        incomePool = new MockIncomePoolForDistributor(address(flap));
        distributor =
            new NftRevenueDistributor(address(accessControl), address(flap), address(nft), address(incomePool));
        incomePool.setDistributor(address(distributor));

        vm.startPrank(admin);
        accessControl.grantRole(Roles.AUTOMATION_ROLE, admin);
        accessControl.grantRole(Roles.REVENUE_ROLE, admin);
        nft.mint(alice, 2);
        nft.mint(bob, 1);
        vm.stopPrank();

        flap.mint(address(incomePool), 10_000 ether);
        vm.warp(1 days - 8 hours + 1);
        vm.roll(block.number + 1);
    }

    function testSnapshotAndClaimUsesHistoricalBalances() external {
        uint256 dayId = distributor.currentUtc8DayId();
        uint256 dailyPool = 2_000 ether;

        vm.prank(admin);
        distributor.snapshotAndPull(dayId);

        vm.prank(alice);
        uint256 aliceClaim = distributor.claim(dayId);
        vm.prank(bob);
        uint256 bobClaim = distributor.claim(dayId);

        assertEq(aliceClaim, (dailyPool * 2) / 3);
        assertEq(bobClaim, dailyPool / 3);
    }

    function testTransferAfterSnapshotDoesNotChangeClaimWeight() external {
        uint256 dayId = distributor.currentUtc8DayId();
        uint256 dailyPool = 2_000 ether;

        vm.prank(admin);
        distributor.snapshotAndPull(dayId);

        vm.prank(alice);
        nft.transferFrom(alice, bob, 1);

        vm.prank(alice);
        uint256 aliceClaim = distributor.claim(dayId);
        vm.prank(bob);
        uint256 bobClaim = distributor.claim(dayId);

        assertEq(aliceClaim, (dailyPool * 2) / 3);
        assertEq(bobClaim, dailyPool / 3);
    }

    function testRejectDuplicateClaim() external {
        uint256 dayId = distributor.currentUtc8DayId();

        vm.prank(admin);
        distributor.snapshotAndPull(dayId);

        vm.prank(alice);
        distributor.claim(dayId);

        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(NftRevenueDistributor.AlreadyClaimed.selector, dayId, alice));
        distributor.claim(dayId);
    }

    function testRejectSnapshotForNonCurrentDay() external {
        uint256 wrongDayId = distributor.currentUtc8DayId() + 1;

        vm.startPrank(admin);
        vm.expectRevert(
            abi.encodeWithSelector(
                NftRevenueDistributor.InvalidSnapshotDay.selector,
                wrongDayId,
                distributor.currentUtc8DayId()
            )
        );
        distributor.snapshotAndPull(wrongDayId);
        vm.stopPrank();
    }

    function testRejectSnapshotOutsideUtc8Window() external {
        vm.warp((1 days - 8 hours) + distributor.snapshotWindowSeconds() + 1);
        uint256 dayId = distributor.currentUtc8DayId();

        vm.startPrank(admin);
        vm.expectRevert(
            abi.encodeWithSelector(
                NftRevenueDistributor.SnapshotWindowClosed.selector,
                distributor.snapshotWindowSeconds() + 1,
                distributor.snapshotWindowSeconds()
            )
        );
        distributor.snapshotAndPull(dayId);
        vm.stopPrank();
    }

    function testRevenueRoleCanUpdateSnapshotWindow() external {
        vm.prank(admin);
        distributor.setSnapshotWindowSeconds(30 minutes);

        assertEq(distributor.snapshotWindowSeconds(), 30 minutes);
    }
}
