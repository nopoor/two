// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console2} from "forge-std/Script.sol";
import {DividendBankNFT} from "src/gamefi/nft/DividendBankNFT.sol";

contract MintDividendBankNft is Script {
    error InvalidRecipient();
    error InvalidTotalQuantity();
    error InvalidChunkSize();

    function run() external {
        uint256 deployerPrivateKey = vm.envUint("DEPLOYER_PRIVATE_KEY");
        address nftAddress = vm.envAddress("DIVIDEND_BANK_NFT");
        address recipient = vm.envAddress("NFT_MINT_RECIPIENT");
        uint256 totalQuantity = vm.envUint("NFT_MINT_TOTAL_QUANTITY");
        uint256 chunkSize = vm.envUint("NFT_MINT_CHUNK_SIZE");

        if (recipient == address(0)) revert InvalidRecipient();
        if (totalQuantity == 0) revert InvalidTotalQuantity();
        if (chunkSize == 0) revert InvalidChunkSize();

        DividendBankNFT nft = DividendBankNFT(nftAddress);
        uint256 minted;

        vm.startBroadcast(deployerPrivateKey);

        while (minted < totalQuantity) {
            uint256 remaining = totalQuantity - minted;
            uint256 quantity = remaining < chunkSize ? remaining : chunkSize;
            nft.mint(recipient, quantity);
            minted += quantity;
            console2.log("Minted NFT chunk", quantity, "total", minted);
        }

        vm.stopBroadcast();
    }
}
