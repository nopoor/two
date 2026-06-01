// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script} from "forge-std/Script.sol";
import {GameManager} from "src/gamefi/manager/GameManager.sol";

contract ConfigureVrf is Script {
    function run() external {
        uint256 deployerPrivateKey = vm.envUint("DEPLOYER_PRIVATE_KEY");
        address gameManagerAddress = vm.envAddress("GAME_MANAGER");
        address coordinator = vm.envAddress("VRF_COORDINATOR");
        bytes32 keyHash = vm.envBytes32("VRF_KEY_HASH");
        uint64 subscriptionId = uint64(vm.envUint("VRF_SUBSCRIPTION_ID"));
        uint16 requestConfirmations = uint16(vm.envUint("VRF_REQUEST_CONFIRMATIONS"));
        uint32 callbackGasLimit = uint32(vm.envUint("VRF_CALLBACK_GAS_LIMIT"));

        vm.startBroadcast(deployerPrivateKey);
        GameManager(gameManagerAddress).setVrfConfig(
            coordinator, keyHash, subscriptionId, requestConfirmations, callbackGasLimit
        );
        vm.stopBroadcast();
    }
}
