// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script} from "forge-std/Script.sol";
import {NftRevenueDistributor} from "src/gamefi/revenue/NftRevenueDistributor.sol";

contract RunDailySnapshot is Script {
    function run() external {
        uint256 deployerPrivateKey = vm.envUint("DEPLOYER_PRIVATE_KEY");
        address distributorAddress = vm.envAddress("NFT_REVENUE_DISTRIBUTOR");

        vm.startBroadcast(deployerPrivateKey);

        NftRevenueDistributor distributor = NftRevenueDistributor(distributorAddress);
        uint256 dayId = distributor.currentUtc8DayId();
        distributor.snapshotAndPull(dayId);

        vm.stopBroadcast();
    }
}
