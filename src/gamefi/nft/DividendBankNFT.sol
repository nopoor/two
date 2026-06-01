// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Initializable} from "@openzeppelin-upgradeable/proxy/utils/Initializable.sol";
import {ERC721Upgradeable} from "@openzeppelin-upgradeable/token/ERC721/ERC721Upgradeable.sol";
import {ERC721EnumerableUpgradeable} from "@openzeppelin-upgradeable/token/ERC721/extensions/ERC721EnumerableUpgradeable.sol";
import {ERC2981Upgradeable} from "@openzeppelin-upgradeable/token/common/ERC2981Upgradeable.sol";
import {AccessControlEnumerableUpgradeable} from "@openzeppelin-upgradeable/access/AccessControlEnumerableUpgradeable.sol";
import {Checkpoints} from "@openzeppelin/utils/Checkpoints.sol";

contract DividendBankNFT is
    Initializable,
    ERC721Upgradeable,
    ERC721EnumerableUpgradeable,
    ERC2981Upgradeable,
    AccessControlEnumerableUpgradeable
{
    using Checkpoints for Checkpoints.History;

    error MaxSupplyExceeded(uint256 requestedSupply);
    error InvalidRecipient();
    error InvalidMintQuantity();

    bytes32 public constant MINTER_ROLE = keccak256("MINTER_ROLE");
    bytes32 public constant METADATA_ROLE = keccak256("METADATA_ROLE");
    uint256 public constant MAX_SUPPLY = 420;

    uint256 public nextTokenId;
    string private _baseTokenURI;

    mapping(address => Checkpoints.History) private _balanceCheckpoints;
    Checkpoints.History private _totalSupplyCheckpoints;

    function initialize(
        string memory name_,
        string memory symbol_,
        string memory baseTokenURI_,
        address admin_,
        address royaltyReceiver_,
        uint96 royaltyFeeNumerator_
    ) external initializer {
        __ERC721_init(name_, symbol_);
        __ERC721Enumerable_init();
        __ERC2981_init();
        __AccessControlEnumerable_init();

        _grantRole(DEFAULT_ADMIN_ROLE, admin_);
        _grantRole(MINTER_ROLE, admin_);
        _grantRole(METADATA_ROLE, admin_);

        nextTokenId = 1;
        _baseTokenURI = baseTokenURI_;

        if (royaltyReceiver_ != address(0) && royaltyFeeNumerator_ > 0) {
            _setDefaultRoyalty(royaltyReceiver_, royaltyFeeNumerator_);
        }
    }

    function mint(address to, uint256 quantity) external onlyRole(MINTER_ROLE) {
        if (to == address(0)) revert InvalidRecipient();
        if (quantity == 0) revert InvalidMintQuantity();

        uint256 finalSupply = totalSupply() + quantity;
        if (finalSupply > MAX_SUPPLY) revert MaxSupplyExceeded(finalSupply);

        for (uint256 i = 0; i < quantity; ++i) {
            uint256 tokenId = nextTokenId;
            nextTokenId = tokenId + 1;
            _safeMint(to, tokenId);
        }
    }

    function setBaseURI(string calldata baseTokenURI_) external onlyRole(METADATA_ROLE) {
        _baseTokenURI = baseTokenURI_;
    }

    function setDefaultRoyalty(address receiver, uint96 feeNumerator) external onlyRole(DEFAULT_ADMIN_ROLE) {
        _setDefaultRoyalty(receiver, feeNumerator);
    }

    function getPastBalanceOf(address account, uint256 blockNumber) external view returns (uint256) {
        return _balanceCheckpoints[account].getAtBlock(blockNumber);
    }

    function getPastTotalSupply(uint256 blockNumber) external view returns (uint256) {
        return _totalSupplyCheckpoints.getAtBlock(blockNumber);
    }

    function supportsInterface(bytes4 interfaceId)
        public
        view
        override(ERC721Upgradeable, ERC721EnumerableUpgradeable, ERC2981Upgradeable, AccessControlEnumerableUpgradeable)
        returns (bool)
    {
        return super.supportsInterface(interfaceId);
    }

    function _baseURI() internal view override returns (string memory) {
        return _baseTokenURI;
    }

    function _beforeTokenTransfer(address from, address to, uint256 firstTokenId, uint256 batchSize)
        internal
        override(ERC721Upgradeable, ERC721EnumerableUpgradeable)
    {
        super._beforeTokenTransfer(from, to, firstTokenId, batchSize);
    }

    function _afterTokenTransfer(address from, address to, uint256 firstTokenId, uint256 batchSize)
        internal
        override(ERC721Upgradeable)
    {
        super._afterTokenTransfer(from, to, firstTokenId, batchSize);

        firstTokenId;

        if (from == address(0)) {
            _totalSupplyCheckpoints.push(totalSupply());
        } else {
            _balanceCheckpoints[from].push(balanceOf(from));
        }

        if (to != address(0)) {
            _balanceCheckpoints[to].push(balanceOf(to));
        }
    }
}
