// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IGameModule} from "src/gamefi/interfaces/IGameModule.sol";

contract MysteryBoxModule is IGameModule {
    error InvalidWager();
    error InvalidGameData();

    bytes32 internal constant GAME_ID = keccak256("MYSTERY_BOX");
    string internal constant GAME_NAME = "MysteryBox";
    uint256 internal constant SCALE = 10_000;

    uint8 internal constant LEGENDARY = 0;
    uint8 internal constant EPIC = 1;
    uint8 internal constant RARE = 2;
    uint8 internal constant COMMON = 3;
    uint8 internal constant EMPTY = 4;

    uint16 internal constant LEGENDARY_CUTOFF = 4;
    uint16 internal constant EPIC_CUTOFF = 84;
    uint16 internal constant RARE_CUTOFF = 500;
    uint16 internal constant COMMON_CUTOFF = 4_500;

    uint32 internal constant LEGENDARY_GROSS_MULTIPLIER_BPS = 500_000;
    uint32 internal constant EPIC_GROSS_MULTIPLIER_BPS = 150_000;
    uint32 internal constant RARE_GROSS_MULTIPLIER_BPS = 40_000;
    uint32 internal constant COMMON_GROSS_MULTIPLIER_BPS = 8_500;

    function gameId() external pure returns (bytes32) {
        return GAME_ID;
    }

    function gameName() external pure returns (string memory) {
        return GAME_NAME;
    }

    function validateBet(uint256 wager, bytes calldata gameData) external pure returns (uint256 maxProfit) {
        if (wager == 0) revert InvalidWager();
        if (gameData.length != 0) revert InvalidGameData();

        maxProfit = _quoteGrossProfit(wager, LEGENDARY_GROSS_MULTIPLIER_BPS);
    }

    function resolveBet(uint256 wager, bytes calldata gameData, uint256 randomWord)
        external
        pure
        returns (bool won, uint256 grossProfit, bytes memory resultData)
    {
        if (wager == 0) revert InvalidWager();
        if (gameData.length != 0) revert InvalidGameData();

        uint16 outcome = uint16(randomWord % SCALE);
        (uint8 tierId, uint32 grossMultiplierBps) = _resolveTier(outcome);
        won = grossMultiplierBps > 0;
        grossProfit = won ? _quoteGrossProfit(wager, grossMultiplierBps) : 0;
        resultData = abi.encode(tierId, outcome, grossMultiplierBps);
    }

    function _resolveTier(uint16 outcome) internal pure returns (uint8 tierId, uint32 grossMultiplierBps) {
        if (outcome < LEGENDARY_CUTOFF) {
            return (LEGENDARY, LEGENDARY_GROSS_MULTIPLIER_BPS);
        }

        if (outcome < EPIC_CUTOFF) {
            return (EPIC, EPIC_GROSS_MULTIPLIER_BPS);
        }

        if (outcome < RARE_CUTOFF) {
            return (RARE, RARE_GROSS_MULTIPLIER_BPS);
        }

        if (outcome < COMMON_CUTOFF) {
            return (COMMON, COMMON_GROSS_MULTIPLIER_BPS);
        }

        return (EMPTY, 0);
    }

    function _quoteGrossProfit(uint256 wager, uint32 grossMultiplierBps) internal pure returns (uint256 grossProfit) {
        grossProfit = (wager * grossMultiplierBps) / SCALE;
    }
}
