// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IGameModule} from "src/gamefi/interfaces/IGameModule.sol";

contract DiceModule is IGameModule {
    error InvalidWager();
    error InvalidTarget();
    error InvalidWinChance();
    error InvalidGameData();

    bytes32 internal constant GAME_ID = keccak256("DICE");
    string internal constant GAME_NAME = "Dice";
    uint256 internal constant SCALE = 10_000;
    uint256 internal constant TARGET_RTP_BPS = 9_700;
    uint256 internal constant SETTLEMENT_NET_BPS = 9_400;
    uint16 internal constant MIN_TARGET = 400;
    uint16 internal constant MAX_TARGET = 9_600;

    struct DiceBet {
        bool rollUnder;
        uint16 target;
    }

    function gameId() external pure returns (bytes32) {
        return GAME_ID;
    }

    function gameName() external pure returns (string memory) {
        return GAME_NAME;
    }

    function validateBet(uint256 wager, bytes calldata gameData) external pure returns (uint256 maxProfit) {
        if (wager == 0) revert InvalidWager();
        DiceBet memory bet = _decode(gameData);
        uint256 winChanceBps = _winChanceBps(bet);
        maxProfit = _quoteGrossProfit(wager, winChanceBps);
    }

    function resolveBet(uint256 wager, bytes calldata gameData, uint256 randomWord)
        external
        pure
        returns (bool won, uint256 grossProfit, bytes memory resultData)
    {
        if (wager == 0) revert InvalidWager();
        DiceBet memory bet = _decode(gameData);
        uint256 outcome = randomWord % SCALE;
        uint256 winChanceBps = _winChanceBps(bet);

        won = bet.rollUnder ? outcome < bet.target : outcome >= bet.target;
        grossProfit = won ? _quoteGrossProfit(wager, winChanceBps) : 0;
        resultData = abi.encode(bet.rollUnder, bet.target, outcome, winChanceBps);
    }

    function _decode(bytes calldata gameData) internal pure returns (DiceBet memory bet) {
        if (gameData.length != 64) revert InvalidGameData();
        bet = abi.decode(gameData, (DiceBet));
        if (bet.target < MIN_TARGET || bet.target > MAX_TARGET) revert InvalidTarget();
    }

    function _winChanceBps(DiceBet memory bet) internal pure returns (uint256 chanceBps) {
        chanceBps = bet.rollUnder ? uint256(bet.target) : uint256(SCALE - bet.target);
        if (chanceBps == 0 || chanceBps >= SCALE) revert InvalidWinChance();
    }

    function _quoteGrossProfit(uint256 wager, uint256 winChanceBps) internal pure returns (uint256 grossProfit) {
        grossProfit = (((wager * (TARGET_RTP_BPS - winChanceBps)) * SCALE) / winChanceBps) / SETTLEMENT_NET_BPS;
    }
}
