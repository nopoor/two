// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface IIncomePool {
    function allocateToNftDistributor(uint256 amount) external;
    function availableFlap() external view returns (uint256);
}
