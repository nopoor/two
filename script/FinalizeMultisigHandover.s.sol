// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script} from "forge-std/Script.sol";
import {SystemAccessControl} from "src/gamefi/access/SystemAccessControl.sol";
import {DividendBankNFT} from "src/gamefi/nft/DividendBankNFT.sol";
import {Roles} from "src/gamefi/libraries/Roles.sol";

contract FinalizeMultisigHandover is Script {
    function run() external {
        uint256 deployerPrivateKey = vm.envUint("DEPLOYER_PRIVATE_KEY");
        address broadcaster = vm.addr(deployerPrivateKey);
        address finalAdmin = vm.envAddress("MULTISIG_ADMIN");
        address systemAccessControlAddress = vm.envAddress("SYSTEM_ACCESS_CONTROL");
        address nftAddress = vm.envAddress("DIVIDEND_BANK_NFT");

        vm.startBroadcast(deployerPrivateKey);

        SystemAccessControl accessControl = SystemAccessControl(systemAccessControlAddress);
        DividendBankNFT nft = DividendBankNFT(nftAddress);

        bytes32[] memory adminRoles = new bytes32[](9);
        adminRoles[0] = bytes32(0);
        adminRoles[1] = Roles.OPERATOR_ROLE;
        adminRoles[2] = Roles.PAUSER_ROLE;
        adminRoles[3] = Roles.REVENUE_ROLE;
        adminRoles[4] = Roles.GAME_ADMIN_ROLE;
        adminRoles[5] = Roles.GAME_MANAGER_ROLE;
        adminRoles[6] = Roles.REFERRAL_BINDER_ROLE;
        adminRoles[7] = Roles.REFERRAL_REWARD_ROLE;
        adminRoles[8] = Roles.AUTOMATION_ROLE;
        accessControl.grantBootstrapRoles(finalAdmin, adminRoles);

        nft.grantRole(0x00, finalAdmin);
        nft.grantRole(nft.MINTER_ROLE(), finalAdmin);
        nft.grantRole(nft.METADATA_ROLE(), finalAdmin);

        accessControl.renounceRole(0x00, broadcaster);
        accessControl.renounceRole(Roles.OPERATOR_ROLE, broadcaster);
        accessControl.renounceRole(Roles.PAUSER_ROLE, broadcaster);
        accessControl.renounceRole(Roles.REVENUE_ROLE, broadcaster);
        accessControl.renounceRole(Roles.GAME_ADMIN_ROLE, broadcaster);
        accessControl.renounceRole(Roles.GAME_MANAGER_ROLE, broadcaster);
        accessControl.renounceRole(Roles.REFERRAL_BINDER_ROLE, broadcaster);
        accessControl.renounceRole(Roles.REFERRAL_REWARD_ROLE, broadcaster);
        accessControl.renounceRole(Roles.AUTOMATION_ROLE, broadcaster);

        nft.renounceRole(0x00, broadcaster);
        nft.renounceRole(nft.MINTER_ROLE(), broadcaster);
        nft.renounceRole(nft.METADATA_ROLE(), broadcaster);

        vm.stopBroadcast();
    }
}
