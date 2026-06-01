// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IGameModule} from "src/gamefi/interfaces/IGameModule.sol";

contract CoinFlipModule is IGameModule {
    error InvalidWager();
    error InvalidGameData();

    bytes32 internal constant GAME_ID = keccak256("COIN_FLIP");
    string internal constant GAME_NAME = "CoinFlip";

    struct CoinFlipBet {
        bool guessHeads;
    }

    function gameId() external pure returns (bytes32) {
        return GAME_ID;
    }

    function gameName() external pure returns (string memory) {
        return GAME_NAME;
    }

    function validateBet(uint256 wager, bytes calldata gameData) external pure returns (uint256 maxProfit) {
        if (wager == 0) revert InvalidWager();
        if (gameData.length != 32) revert InvalidGameData();

        CoinFlipBet memory bet = abi.decode(gameData, (CoinFlipBet));
        bet.guessHeads;

        return wager;
    }

    function resolveBet(uint256 wager, bytes calldata gameData, uint256 randomWord)
        external
        pure
        returns (bool won, uint256 grossProfit, bytes memory resultData)
    {
        if (wager == 0) revert InvalidWager();
        if (gameData.length != 32) revert InvalidGameData();

        CoinFlipBet memory bet = abi.decode(gameData, (CoinFlipBet));
        bool landedHeads = randomWord % 2 == 0;
        won = landedHeads == bet.guessHeads;
        grossProfit = won ? wager : 0;
        resultData = abi.encode(bet.guessHeads, landedHeads);
    }
}
