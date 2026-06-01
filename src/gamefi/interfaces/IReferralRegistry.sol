// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface IReferralRegistry {
    function referrerOf(address player) external view returns (address);
    function isBound(address player) external view returns (bool);
    function referredUserCount(address referrer) external view returns (uint256);
    function totalReferralRewards(address referrer) external view returns (uint256);
}
