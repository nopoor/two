// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console2} from "forge-std/Script.sol";
import {ERC1967Proxy} from "@openzeppelin/proxy/ERC1967/ERC1967Proxy.sol";
import {SystemAccessControl} from "src/gamefi/access/SystemAccessControl.sol";
import {ReferralRegistry} from "src/gamefi/referral/ReferralRegistry.sol";
import {GameRegistry} from "src/gamefi/games/GameRegistry.sol";
import {IncomePool} from "src/gamefi/revenue/IncomePool.sol";
import {BankrollVault} from "src/gamefi/vault/BankrollVault.sol";
import {GameManager} from "src/gamefi/manager/GameManager.sol";
import {CoinFlipModule} from "src/gamefi/modules/CoinFlipModule.sol";
import {MysteryBoxModule} from "src/gamefi/modules/MysteryBoxModule.sol";
import {DividendBankNFT} from "src/gamefi/nft/DividendBankNFT.sol";
import {NftRevenueDistributor} from "src/gamefi/revenue/NftRevenueDistributor.sol";
import {Roles} from "src/gamefi/libraries/Roles.sol";

contract DeployGameFi is Script {
    struct DeployConfig {
        uint256 deployerPrivateKey;
        address broadcaster;
        address flapToken;
        address flapDividend;
        address wbnbToken;
        address pancakeRouter;
        string nftName;
        string nftSymbol;
        string nftBaseUri;
        address nftRoyaltyReceiver;
        uint96 nftRoyaltyBps;
        address multisigAdmin;
        address operatorWallet;
        address pauserWallet;
        address revenueOperatorWallet;
        address automationWallet;
        address nftMinterWallet;
        address nftMetadataWallet;
    }

    struct DeploymentResult {
        address accessControl;
        address referralRegistry;
        address gameRegistry;
        address incomePool;
        address bankrollVault;
        address gameManager;
        address coinFlipModule;
        address mysteryBoxModule;
        address nftImplementation;
        address nftProxy;
        address nftRevenueDistributor;
    }

    function run() external {
        DeployConfig memory cfg = _loadConfig();

        vm.startBroadcast(cfg.deployerPrivateKey);

        DeploymentResult memory deployed = _deployContracts(cfg);
        _configureContracts(cfg, deployed);

        vm.stopBroadcast();

        _writeDeploymentJson(deployed);
    }

    function _loadConfig() internal view returns (DeployConfig memory cfg) {
        cfg.deployerPrivateKey = vm.envUint("DEPLOYER_PRIVATE_KEY");
        cfg.broadcaster = vm.addr(cfg.deployerPrivateKey);
        cfg.flapToken = vm.envAddress("FLAP_TOKEN");
        cfg.flapDividend = vm.envAddress("FLAP_DIVIDEND");
        cfg.wbnbToken = vm.envAddress("WBNB_TOKEN");
        cfg.pancakeRouter = vm.envAddress("PANCAKE_ROUTER_V2");
        cfg.nftName = vm.envString("NFT_NAME");
        cfg.nftSymbol = vm.envString("NFT_SYMBOL");
        cfg.nftBaseUri = vm.envString("NFT_BASE_URI");
        cfg.nftRoyaltyReceiver = vm.envAddress("NFT_ROYALTY_RECEIVER");
        cfg.nftRoyaltyBps = uint96(vm.envUint("NFT_ROYALTY_BPS"));
        cfg.multisigAdmin = vm.envAddress("MULTISIG_ADMIN");
        cfg.operatorWallet = vm.envAddress("OPERATOR_WALLET");
        cfg.pauserWallet = vm.envAddress("PAUSER_WALLET");
        cfg.revenueOperatorWallet = vm.envAddress("REVENUE_OPERATOR_WALLET");
        cfg.automationWallet = vm.envAddress("AUTOMATION_WALLET");
        cfg.nftMinterWallet = vm.envAddress("NFT_MINTER_WALLET");
        cfg.nftMetadataWallet = vm.envAddress("NFT_METADATA_WALLET");
    }

    function _deployContracts(DeployConfig memory cfg) internal returns (DeploymentResult memory deployed) {
        deployed.accessControl = address(new SystemAccessControl(cfg.broadcaster));
        deployed.referralRegistry = address(new ReferralRegistry(deployed.accessControl));
        deployed.gameRegistry = address(new GameRegistry(deployed.accessControl));
        deployed.incomePool =
            address(new IncomePool(deployed.accessControl, cfg.flapToken, cfg.wbnbToken, cfg.flapDividend, cfg.pancakeRouter));
        deployed.bankrollVault = address(
            new BankrollVault(deployed.accessControl, cfg.flapToken, cfg.wbnbToken, cfg.flapDividend, deployed.incomePool)
        );
        deployed.gameManager = address(
            new GameManager(deployed.accessControl, deployed.gameRegistry, deployed.referralRegistry, deployed.bankrollVault)
        );
        deployed.coinFlipModule = address(new CoinFlipModule());
        deployed.mysteryBoxModule = address(new MysteryBoxModule());
        (deployed.nftImplementation, deployed.nftProxy, deployed.nftRevenueDistributor) =
            _deployNftStack(deployed.accessControl, deployed.incomePool, cfg);
    }

    function _deployNftStack(address accessControl, address incomePool, DeployConfig memory cfg)
        internal
        returns (address nftImplementation, address nftProxy, address nftRevenueDistributor)
    {
        DividendBankNFT implementation = new DividendBankNFT();
        bytes memory initData = abi.encodeCall(
            DividendBankNFT.initialize,
            (
                cfg.nftName,
                cfg.nftSymbol,
                cfg.nftBaseUri,
                cfg.broadcaster,
                cfg.nftRoyaltyReceiver,
                cfg.nftRoyaltyBps
            )
        );
        ERC1967Proxy proxy = new ERC1967Proxy(address(implementation), initData);
        NftRevenueDistributor distributor =
            new NftRevenueDistributor(accessControl, cfg.flapToken, address(proxy), incomePool);

        nftImplementation = address(implementation);
        nftProxy = address(proxy);
        nftRevenueDistributor = address(distributor);
    }

    function _configureContracts(DeployConfig memory cfg, DeploymentResult memory deployed) internal {
        IncomePool(deployed.incomePool).setNftDistributor(deployed.nftRevenueDistributor);
        GameRegistry gameRegistry = GameRegistry(deployed.gameRegistry);
        gameRegistry.registerGame(CoinFlipModule(deployed.coinFlipModule).gameId(), deployed.coinFlipModule, "coin-flip", 1);
        gameRegistry.registerGame(
            MysteryBoxModule(deployed.mysteryBoxModule).gameId(), deployed.mysteryBoxModule, "mystery-box", 1
        );
        gameRegistry.setGameEnabled(MysteryBoxModule(deployed.mysteryBoxModule).gameId(), false);

        _grantSystemRoles(
            SystemAccessControl(deployed.accessControl),
            deployed.gameManager,
            deployed.nftRevenueDistributor,
            cfg.multisigAdmin,
            cfg.operatorWallet,
            cfg.pauserWallet,
            cfg.revenueOperatorWallet,
            cfg.automationWallet
        );
        _grantNftRoles(
            DividendBankNFT(deployed.nftProxy), cfg.multisigAdmin, cfg.nftMinterWallet, cfg.nftMetadataWallet
        );
    }

    function _grantSystemRoles(
        SystemAccessControl accessControl,
        address gameManager,
        address nftRevenueDistributor,
        address multisigAdmin,
        address operatorWallet,
        address pauserWallet,
        address revenueOperatorWallet,
        address automationWallet
    ) internal {
        bytes32[] memory gameManagerRoles = new bytes32[](3);
        gameManagerRoles[0] = Roles.GAME_MANAGER_ROLE;
        gameManagerRoles[1] = Roles.REFERRAL_BINDER_ROLE;
        gameManagerRoles[2] = Roles.REFERRAL_REWARD_ROLE;
        accessControl.grantBootstrapRoles(gameManager, gameManagerRoles);

        bytes32[] memory distributorRoles = new bytes32[](1);
        distributorRoles[0] = Roles.REVENUE_ROLE;
        accessControl.grantBootstrapRoles(nftRevenueDistributor, distributorRoles);

        if (multisigAdmin != address(0)) {
            bytes32[] memory multisigRoles = new bytes32[](6);
            multisigRoles[0] = bytes32(0);
            multisigRoles[1] = Roles.OPERATOR_ROLE;
            multisigRoles[2] = Roles.PAUSER_ROLE;
            multisigRoles[3] = Roles.REVENUE_ROLE;
            multisigRoles[4] = Roles.GAME_ADMIN_ROLE;
            multisigRoles[5] = Roles.AUTOMATION_ROLE;
            accessControl.grantBootstrapRoles(multisigAdmin, multisigRoles);
        }

        if (operatorWallet != address(0)) {
            bytes32[] memory operatorRoles = new bytes32[](1);
            operatorRoles[0] = Roles.OPERATOR_ROLE;
            accessControl.grantBootstrapRoles(operatorWallet, operatorRoles);
        }

        if (pauserWallet != address(0)) {
            bytes32[] memory pauserRoles = new bytes32[](1);
            pauserRoles[0] = Roles.PAUSER_ROLE;
            accessControl.grantBootstrapRoles(pauserWallet, pauserRoles);
        }

        if (revenueOperatorWallet != address(0)) {
            bytes32[] memory revenueRoles = new bytes32[](1);
            revenueRoles[0] = Roles.REVENUE_ROLE;
            accessControl.grantBootstrapRoles(revenueOperatorWallet, revenueRoles);
        }

        if (automationWallet != address(0)) {
            bytes32[] memory automationRoles = new bytes32[](1);
            automationRoles[0] = Roles.AUTOMATION_ROLE;
            accessControl.grantBootstrapRoles(automationWallet, automationRoles);
        }
    }

    function _grantNftRoles(
        DividendBankNFT nft,
        address multisigAdmin,
        address nftMinterWallet,
        address nftMetadataWallet
    ) internal {
        if (multisigAdmin != address(0)) {
            nft.grantRole(0x00, multisigAdmin);
            nft.grantRole(nft.MINTER_ROLE(), multisigAdmin);
            nft.grantRole(nft.METADATA_ROLE(), multisigAdmin);
        }

        if (nftMinterWallet != address(0)) {
            nft.grantRole(nft.MINTER_ROLE(), nftMinterWallet);
        }

        if (nftMetadataWallet != address(0)) {
            nft.grantRole(nft.METADATA_ROLE(), nftMetadataWallet);
        }
    }

    function _writeDeploymentJson(DeploymentResult memory deployed) internal {
        string memory root = "deployment";
        vm.serializeUint(root, "chainId", block.chainid);
        vm.serializeAddress(root, "systemAccessControl", deployed.accessControl);
        vm.serializeAddress(root, "referralRegistry", deployed.referralRegistry);
        vm.serializeAddress(root, "gameRegistry", deployed.gameRegistry);
        vm.serializeAddress(root, "incomePool", deployed.incomePool);
        vm.serializeAddress(root, "bankrollVault", deployed.bankrollVault);
        vm.serializeAddress(root, "gameManager", deployed.gameManager);
        vm.serializeAddress(root, "coinFlipModule", deployed.coinFlipModule);
        vm.serializeAddress(root, "mysteryBoxModule", deployed.mysteryBoxModule);
        vm.serializeAddress(root, "dividendBankNftImplementation", deployed.nftImplementation);
        vm.serializeAddress(root, "dividendBankNftProxy", deployed.nftProxy);
        string memory json = vm.serializeAddress(root, "nftRevenueDistributor", deployed.nftRevenueDistributor);

        string memory outputPath = string.concat(vm.projectRoot(), "/deployments/", vm.toString(block.chainid), ".json");
        vm.writeJson(json, outputPath);

        console2.log("Deployment manifest written to", outputPath);
    }
}
