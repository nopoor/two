// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {SafeERC20} from "@openzeppelin/token/ERC20/utils/SafeERC20.sol";
import {IERC20} from "@openzeppelin/token/ERC20/IERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/security/ReentrancyGuard.sol";
import {FlapDividendAware} from "src/gamefi/revenue/FlapDividendAware.sol";
import {IPancakeRouterV2} from "src/gamefi/interfaces/IPancakeRouterV2.sol";
import {Roles} from "src/gamefi/libraries/Roles.sol";

contract IncomePool is FlapDividendAware, ReentrancyGuard {
    using SafeERC20 for IERC20;

    error InvalidRouter();
    error InvalidDistributor();
    error InvalidAmount();
    error InvalidPath();
    error SlippageExceeded(uint256 expectedMinimum, uint256 actualReceived);

    IPancakeRouterV2 public router;
    address public nftDistributor;

    event RouterUpdated(address indexed previousRouter, address indexed newRouter);
    event NftDistributorUpdated(address indexed previousDistributor, address indexed newDistributor);
    event IncomeAllocatedToNftDistributor(address indexed distributor, uint256 amount);
    event FlapBuyBackExecuted(uint256 wbnbSpent, uint256 flapReceived, address indexed operator);

    constructor(
        address accessControl_,
        address flapToken_,
        address wbnbToken_,
        address flapDividendContract_,
        address router_
    ) FlapDividendAware(accessControl_, flapToken_, wbnbToken_, flapDividendContract_) {
        if (router_ == address(0)) revert InvalidRouter();
        router = IPancakeRouterV2(router_);
    }

    function setRouter(address newRouter) external onlyRole(Roles.REVENUE_ROLE) {
        if (newRouter == address(0)) revert InvalidRouter();
        address previousRouter = address(router);
        router = IPancakeRouterV2(newRouter);
        emit RouterUpdated(previousRouter, newRouter);
    }

    function setNftDistributor(address newDistributor) external onlyRole(Roles.REVENUE_ROLE) {
        if (newDistributor == address(0)) revert InvalidDistributor();
        address previousDistributor = nftDistributor;
        nftDistributor = newDistributor;
        emit NftDistributorUpdated(previousDistributor, newDistributor);
    }

    function allocateToNftDistributor(uint256 amount)
        external
        onlyRole(Roles.REVENUE_ROLE)
        whenSystemNotPaused
        nonReentrant
    {
        if (amount == 0) revert InvalidAmount();
        if (nftDistributor == address(0)) revert InvalidDistributor();

        flapToken.safeTransfer(nftDistributor, amount);
        emit IncomeAllocatedToNftDistributor(nftDistributor, amount);
    }

    function buyBackFlap(uint256 wbnbAmount, uint256 minFlapOut, address[] calldata path)
        external
        onlyRole(Roles.REVENUE_ROLE)
        whenSystemNotPaused
        nonReentrant
        returns (uint256 flapReceived)
    {
        if (wbnbAmount == 0) revert InvalidAmount();
        _validatePath(path);

        uint256 flapBalanceBefore = flapToken.balanceOf(address(this));

        wbnbToken.safeApprove(address(router), 0);
        wbnbToken.safeApprove(address(router), wbnbAmount);
        router.swapExactTokensForTokensSupportingFeeOnTransferTokens(
            wbnbAmount, minFlapOut, path, address(this), block.timestamp
        );

        flapReceived = flapToken.balanceOf(address(this)) - flapBalanceBefore;
        if (flapReceived < minFlapOut) {
            revert SlippageExceeded(minFlapOut, flapReceived);
        }

        emit FlapBuyBackExecuted(wbnbAmount, flapReceived, msg.sender);
    }

    function availableFlap() external view returns (uint256) {
        return flapToken.balanceOf(address(this));
    }

    function _validatePath(address[] calldata path) internal view {
        if (path.length < 2) revert InvalidPath();
        if (path[0] != address(wbnbToken) || path[path.length - 1] != address(flapToken)) {
            revert InvalidPath();
        }
    }
}
