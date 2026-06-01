// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {SafeERC20} from "@openzeppelin/token/ERC20/utils/SafeERC20.sol";
import {IERC20} from "@openzeppelin/token/ERC20/IERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/security/ReentrancyGuard.sol";
import {FlapDividendAware} from "src/gamefi/revenue/FlapDividendAware.sol";
import {Roles} from "src/gamefi/libraries/Roles.sol";

contract BankrollVault is FlapDividendAware, ReentrancyGuard {
    using SafeERC20 for IERC20;

    address public constant DEAD_ADDRESS = 0x000000000000000000000000000000000000dEaD;

    error InvalidPlayer();
    error InvalidIncomePool();
    error InvalidBetId(uint256 betId);
    error BetAlreadyExists(uint256 betId);
    error BetNotLocked(uint256 betId);
    error InsufficientAvailableBalance(uint256 availableBalance, uint256 requiredBalance);
    error InvalidAmount();
    error InvalidReferrerSplit();
    error GrossProfitExceedsReserved(uint256 grossProfit, uint256 maxProfit);
    error InvalidWinSettlement(uint256 expectedTotalOut, uint256 actualTotalOut);

    enum BetStatus {
        None,
        Locked,
        Settled,
        Refunded
    }

    struct BetEscrow {
        address player;
        uint96 wager;
        uint96 maxProfit;
        BetStatus status;
    }

    IERC20 public immutable flapTokenMirror;
    address public incomePool;
    uint256 public reservedProfit;

    mapping(uint256 => BetEscrow) public betEscrows;

    event IncomePoolUpdated(address indexed previousIncomePool, address indexed newIncomePool);
    event BetLocked(uint256 indexed betId, address indexed player, uint256 wager, uint256 maxProfit);
    event BetRefunded(uint256 indexed betId, address indexed player, uint256 wager);
    event LossSettled(
        uint256 indexed betId,
        address indexed player,
        uint256 burnAmount,
        uint256 incomeAmount,
        address indexed referrer,
        uint256 referralAmount
    );
    event WinSettled(
        uint256 indexed betId,
        address indexed player,
        uint256 grossProfit,
        uint256 playerPayout,
        uint256 burnAmount,
        uint256 incomeAmount,
        address referrer,
        uint256 referralAmount
    );
    event WbnbForwardedToIncomePool(uint256 amount);

    constructor(
        address accessControl_,
        address flapToken_,
        address wbnbToken_,
        address flapDividendContract_,
        address incomePool_
    ) FlapDividendAware(accessControl_, flapToken_, wbnbToken_, flapDividendContract_) {
        flapTokenMirror = IERC20(flapToken_);
        incomePool = incomePool_;
    }

    function setIncomePool(address newIncomePool) external onlyRole(Roles.REVENUE_ROLE) {
        if (newIncomePool == address(0)) revert InvalidIncomePool();
        address previousIncomePool = incomePool;
        incomePool = newIncomePool;
        emit IncomePoolUpdated(previousIncomePool, newIncomePool);
    }

    function lockBet(uint256 betId, address player, uint256 wager, uint256 maxProfit)
        external
        onlyRole(Roles.GAME_MANAGER_ROLE)
        whenSystemNotPaused
        nonReentrant
    {
        if (player == address(0)) revert InvalidPlayer();
        if (wager == 0) revert InvalidAmount();
        if (betEscrows[betId].status != BetStatus.None) revert BetAlreadyExists(betId);

        uint256 availableBalance_ = availableBalance();
        if (availableBalance_ < maxProfit) {
            revert InsufficientAvailableBalance(availableBalance_, maxProfit);
        }

        reservedProfit += maxProfit;
        betEscrows[betId] =
            BetEscrow({player: player, wager: uint96(wager), maxProfit: uint96(maxProfit), status: BetStatus.Locked});

        flapTokenMirror.safeTransferFrom(player, address(this), wager);
        emit BetLocked(betId, player, wager, maxProfit);
    }

    function refundBet(uint256 betId) external onlyRole(Roles.GAME_MANAGER_ROLE) whenSystemNotPaused nonReentrant {
        BetEscrow memory escrow = _consumeLockedBet(betId, BetStatus.Refunded);
        reservedProfit -= escrow.maxProfit;
        flapTokenMirror.safeTransfer(escrow.player, escrow.wager);
        emit BetRefunded(betId, escrow.player, escrow.wager);
    }

    function settleLoss(uint256 betId, uint256 burnAmount, uint256 incomeAmount, address referrer, uint256 referralAmount)
        external
        onlyRole(Roles.GAME_MANAGER_ROLE)
        whenSystemNotPaused
        nonReentrant
    {
        BetEscrow memory escrow = _consumeLockedBet(betId, BetStatus.Settled);
        reservedProfit -= escrow.maxProfit;

        uint256 totalOut = burnAmount + incomeAmount + referralAmount;
        if (totalOut > escrow.wager) revert InvalidAmount();
        if (referrer == address(0) && referralAmount > 0) revert InvalidReferrerSplit();

        if (burnAmount > 0) flapTokenMirror.safeTransfer(DEAD_ADDRESS, burnAmount);
        if (incomeAmount > 0) flapTokenMirror.safeTransfer(incomePool, incomeAmount);
        if (referralAmount > 0) flapTokenMirror.safeTransfer(referrer, referralAmount);

        emit LossSettled(betId, escrow.player, burnAmount, incomeAmount, referrer, referralAmount);
    }

    function settleWin(
        uint256 betId,
        uint256 grossProfit,
        uint256 playerPayout,
        uint256 burnAmount,
        uint256 incomeAmount,
        address referrer,
        uint256 referralAmount
    ) external onlyRole(Roles.GAME_MANAGER_ROLE) whenSystemNotPaused nonReentrant {
        BetEscrow memory escrow = _consumeLockedBet(betId, BetStatus.Settled);
        if (grossProfit > escrow.maxProfit) revert GrossProfitExceedsReserved(grossProfit, escrow.maxProfit);

        reservedProfit -= escrow.maxProfit;

        uint256 totalOut = playerPayout + burnAmount + incomeAmount + referralAmount;
        uint256 expectedTotalOut = uint256(escrow.wager) + grossProfit;
        if (totalOut != expectedTotalOut) revert InvalidWinSettlement(expectedTotalOut, totalOut);
        if (referrer == address(0) && referralAmount > 0) revert InvalidReferrerSplit();

        flapTokenMirror.safeTransfer(escrow.player, playerPayout);
        if (burnAmount > 0) flapTokenMirror.safeTransfer(DEAD_ADDRESS, burnAmount);
        if (incomeAmount > 0) flapTokenMirror.safeTransfer(incomePool, incomeAmount);
        if (referralAmount > 0) flapTokenMirror.safeTransfer(referrer, referralAmount);

        emit WinSettled(
            betId, escrow.player, grossProfit, playerPayout, burnAmount, incomeAmount, referrer, referralAmount
        );
    }

    function forwardWbnbToIncomePool(uint256 amount)
        external
        onlyRole(Roles.REVENUE_ROLE)
        whenSystemNotPaused
        nonReentrant
    {
        if (incomePool == address(0)) revert InvalidIncomePool();
        if (amount == 0) revert InvalidAmount();

        wbnbToken.safeTransfer(incomePool, amount);
        emit WbnbForwardedToIncomePool(amount);
    }

    function availableBalance() public view returns (uint256) {
        uint256 balance = flapTokenMirror.balanceOf(address(this));
        return balance > reservedProfit ? balance - reservedProfit : 0;
    }

    function _consumeLockedBet(uint256 betId, BetStatus targetStatus) internal returns (BetEscrow memory escrow) {
        escrow = betEscrows[betId];
        if (escrow.status != BetStatus.Locked) revert BetNotLocked(betId);
        betEscrows[betId].status = targetStatus;
    }
}
