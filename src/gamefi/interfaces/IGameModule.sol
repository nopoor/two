// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface IGameModule {
    function gameId() external view returns (bytes32);
    function gameName() external view returns (string memory);
    function validateBet(uint256 wager, bytes calldata gameData) external view returns (uint256 maxProfit);
    function resolveBet(uint256 wager, bytes calldata gameData, uint256 randomWord)
        external
        view
        returns (bool won, uint256 grossProfit, bytes memory resultData);
}
