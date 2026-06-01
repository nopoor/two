// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script} from "forge-std/Script.sol";
import {IERC20} from "@openzeppelin/token/ERC20/IERC20.sol";
import {BankrollVault} from "src/gamefi/vault/BankrollVault.sol";
import {IncomePool} from "src/gamefi/revenue/IncomePool.sol";

contract HarvestAndBuyback is Script {
    function run() external {
        uint256 deployerPrivateKey = vm.envUint("DEPLOYER_PRIVATE_KEY");
        address vaultAddress = vm.envAddress("BANKROLL_VAULT");
        address incomePoolAddress = vm.envAddress("INCOME_POOL");
        address wbnbToken = vm.envAddress("WBNB_TOKEN");
        address flapToken = vm.envAddress("FLAP_TOKEN");
        uint256 minFlapOut = vm.envUint("BUYBACK_MIN_FLAP_OUT");

        vm.startBroadcast(deployerPrivateKey);

        BankrollVault vault = BankrollVault(vaultAddress);
        IncomePool incomePool = IncomePool(incomePoolAddress);

        vault.claimExistingFlapDividends();

        uint256 vaultWbnb = IERC20(wbnbToken).balanceOf(vaultAddress);
        if (vaultWbnb > 0) {
            vault.forwardWbnbToIncomePool(vaultWbnb);
        }

        incomePool.claimExistingFlapDividends();

        uint256 incomePoolWbnb = IERC20(wbnbToken).balanceOf(incomePoolAddress);
        if (incomePoolWbnb > 0) {
            address[] memory path = new address[](2);
            path[0] = wbnbToken;
            path[1] = flapToken;
            incomePool.buyBackFlap(incomePoolWbnb, minFlapOut, path);
        }

        vm.stopBroadcast();
    }
}
