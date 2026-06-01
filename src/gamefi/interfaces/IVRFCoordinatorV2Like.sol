// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface IVRFCoordinatorV2Like {
    function requestRandomWords(
        bytes32 keyHash,
        uint64 subscriptionId,
        uint16 requestConfirmations,
        uint32 callbackGasLimit,
        uint32 numWords
    ) external returns (uint256 requestId);
}
