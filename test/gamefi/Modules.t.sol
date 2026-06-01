// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {CoinFlipModule} from "src/gamefi/modules/CoinFlipModule.sol";
import {DiceModule} from "src/gamefi/modules/DiceModule.sol";
import {MysteryBoxModule} from "src/gamefi/modules/MysteryBoxModule.sol";

contract ModulesTest is Test {
    CoinFlipModule internal coinFlip;
    DiceModule internal dice;
    MysteryBoxModule internal mysteryBox;

    function setUp() external {
        coinFlip = new CoinFlipModule();
        dice = new DiceModule();
        mysteryBox = new MysteryBoxModule();
    }

    function testCoinFlipResolveWin() external view {
        (bool won, uint256 grossProfit,) = coinFlip.resolveBet(1_000 ether, abi.encode(true), 2);
        assertTrue(won);
        assertEq(grossProfit, 1_000 ether);
    }

    function testCoinFlipResolveLoss() external view {
        (bool won, uint256 grossProfit,) = coinFlip.resolveBet(1_000 ether, abi.encode(true), 1);
        assertFalse(won);
        assertEq(grossProfit, 0);
    }

    function testDiceValidateAndResolveWin() external view {
        uint256 maxProfit = dice.validateBet(1_000 ether, abi.encode(true, uint16(4_000)));
        assertEq(maxProfit, 1_515_957_446_808_510_638_297);

        (bool won, uint256 grossProfit,) = dice.resolveBet(1_000 ether, abi.encode(true, uint16(4_000)), 123);
        assertTrue(won);
        assertEq(grossProfit, 1_515_957_446_808_510_638_297);
    }

    function testDiceResolveLoss() external view {
        (bool won, uint256 grossProfit,) = dice.resolveBet(1_000 ether, abi.encode(false, uint16(8_000)), 123);
        assertFalse(won);
        assertEq(grossProfit, 0);
    }

    function testMysteryBoxValidateUsesLegendaryCap() external view {
        uint256 maxProfit = mysteryBox.validateBet(1_000 ether, bytes(""));
        assertEq(maxProfit, 50_000 ether);
    }

    function testMysteryBoxResolveLegendary() external view {
        (bool won, uint256 grossProfit, bytes memory resultData) = mysteryBox.resolveBet(1_000 ether, bytes(""), 3);
        (uint8 tierId, uint16 outcome, uint32 grossMultiplierBps) = abi.decode(resultData, (uint8, uint16, uint32));

        assertTrue(won);
        assertEq(grossProfit, 50_000 ether);
        assertEq(tierId, 0);
        assertEq(outcome, 3);
        assertEq(grossMultiplierBps, 500_000);
    }

    function testMysteryBoxResolveEmpty() external view {
        (bool won, uint256 grossProfit, bytes memory resultData) = mysteryBox.resolveBet(1_000 ether, bytes(""), 7_777);
        (uint8 tierId, uint16 outcome, uint32 grossMultiplierBps) = abi.decode(resultData, (uint8, uint16, uint32));

        assertFalse(won);
        assertEq(grossProfit, 0);
        assertEq(tierId, 4);
        assertEq(outcome, 7_777);
        assertEq(grossMultiplierBps, 0);
    }
}
