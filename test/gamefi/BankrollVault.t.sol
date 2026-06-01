// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {ERC20} from "@openzeppelin/token/ERC20/ERC20.sol";
import {SystemAccessControl} from "src/gamefi/access/SystemAccessControl.sol";
import {BankrollVault} from "src/gamefi/vault/BankrollVault.sol";
import {Roles} from "src/gamefi/libraries/Roles.sol";

contract MockDividend {
    bool internal _nextResult = true;

    function setNextResult(bool nextResult_) external {
        _nextResult = nextResult_;
    }

    function withdrawDividendsFor(address, bool) external returns (bool success) {
        return _nextResult;
    }
}

contract MockERC20 is ERC20 {
    constructor(string memory name_, string memory symbol_) ERC20(name_, symbol_) {}

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }
}

contract BankrollVaultTest is Test {
    SystemAccessControl internal accessControl;
    MockERC20 internal flap;
    MockERC20 internal wbnb;
    MockDividend internal dividend;
    BankrollVault internal vault;

    address internal admin = address(0xA11CE);
    address internal gameManager = address(0x6A6E);
    address internal player = address(0x1111);
    address internal referrer = address(0x2222);
    address internal incomePool = address(0x3333);

    function setUp() external {
        vm.prank(admin);
        accessControl = new SystemAccessControl(admin);

        flap = new MockERC20("FLAP", "FLAP");
        wbnb = new MockERC20("WBNB", "WBNB");
        dividend = new MockDividend();

        vault = new BankrollVault(
            address(accessControl), address(flap), address(wbnb), address(dividend), incomePool
        );

        vm.prank(admin);
        accessControl.grantRole(Roles.GAME_MANAGER_ROLE, gameManager);

        flap.mint(address(vault), 1_000_000 ether);
        flap.mint(player, 10_000 ether);

        vm.prank(player);
        flap.approve(address(vault), type(uint256).max);
    }

    function testLockBetReservesProfitAndPullsWager() external {
        vm.prank(gameManager);
        vault.lockBet(1, player, 1_000 ether, 2_000 ether);

        (address lockedPlayer, uint96 wager, uint96 maxProfit, BankrollVault.BetStatus status) = vault.betEscrows(1);
        assertEq(lockedPlayer, player);
        assertEq(uint256(wager), 1_000 ether);
        assertEq(uint256(maxProfit), 2_000 ether);
        assertEq(uint256(status), uint256(BankrollVault.BetStatus.Locked));
        assertEq(vault.reservedProfit(), 2_000 ether);
        assertEq(flap.balanceOf(address(vault)), 1_001_000 ether);
        assertEq(flap.balanceOf(player), 9_000 ether);
    }

    function testSettleLoss() external {
        vm.prank(gameManager);
        vault.lockBet(1, player, 1_000 ether, 2_000 ether);

        vm.prank(gameManager);
        vault.settleLoss(1, 20 ether, 38 ether, referrer, 2 ether);

        assertEq(vault.reservedProfit(), 0);
        assertEq(flap.balanceOf(address(0x000000000000000000000000000000000000dEaD)), 20 ether);
        assertEq(flap.balanceOf(incomePool), 38 ether);
        assertEq(flap.balanceOf(referrer), 2 ether);
        assertEq(flap.balanceOf(address(vault)), 1_000_940 ether);
    }

    function testSettleWin() external {
        vm.prank(gameManager);
        vault.lockBet(2, player, 1_000 ether, 2_000 ether);

        vm.prank(gameManager);
        vault.settleWin(2, 500 ether, 1_470 ether, 10 ether, 19 ether, referrer, 1 ether);

        assertEq(vault.reservedProfit(), 0);
        assertEq(flap.balanceOf(player), 10_470 ether);
        assertEq(flap.balanceOf(address(0x000000000000000000000000000000000000dEaD)), 10 ether);
        assertEq(flap.balanceOf(incomePool), 19 ether);
        assertEq(flap.balanceOf(referrer), 1 ether);
        assertEq(flap.balanceOf(address(vault)), 999_500 ether);
    }

    function testRefundBet() external {
        vm.prank(gameManager);
        vault.lockBet(3, player, 1_000 ether, 2_000 ether);

        vm.prank(gameManager);
        vault.refundBet(3);

        assertEq(vault.reservedProfit(), 0);
        assertEq(flap.balanceOf(player), 10_000 ether);
    }

    function testRejectDoubleSettlement() external {
        vm.prank(gameManager);
        vault.lockBet(4, player, 1_000 ether, 2_000 ether);

        vm.prank(gameManager);
        vault.refundBet(4);

        vm.prank(gameManager);
        vm.expectRevert(abi.encodeWithSelector(BankrollVault.BetNotLocked.selector, 4));
        vault.refundBet(4);
    }
}
