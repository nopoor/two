// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ReentrancyGuard} from "@openzeppelin/security/ReentrancyGuard.sol";
import {AccessControlled} from "src/gamefi/access/AccessControlled.sol";
import {GameRegistry} from "src/gamefi/games/GameRegistry.sol";
import {IGameModule} from "src/gamefi/interfaces/IGameModule.sol";
import {IVRFCoordinatorV2Like} from "src/gamefi/interfaces/IVRFCoordinatorV2Like.sol";
import {ReferralRegistry} from "src/gamefi/referral/ReferralRegistry.sol";
import {BankrollVault} from "src/gamefi/vault/BankrollVault.sol";
import {Roles} from "src/gamefi/libraries/Roles.sol";

contract GameManager is AccessControlled, ReentrancyGuard {
    error InvalidWager(uint256 wager);
    error ReferrerMismatch(address existingReferrer, address providedReferrer);
    error PendingBetExists(address player, uint256 betId);
    error BetNotPending(uint256 betId);
    error GameDisabled(bytes32 gameId);
    error InvalidCoordinator();
    error VrfNotConfigured();
    error InvalidRequest(uint256 requestId);
    error InvalidRandomWords(uint256 requestId);

    uint256 public constant BASE_WAGER = 1_000 ether;
    uint256 public constant MAX_WAGER_MULTIPLIER = 15;
    uint256 public constant BPS_DENOMINATOR = 10_000;
    uint256 public constant BURN_BPS = 200;
    uint256 public constant INCOME_BPS = 380;
    uint256 public constant REFERRAL_BPS = 20;

    enum BetStatus {
        None,
        Pending,
        Settled,
        Refunded
    }

    struct PendingBet {
        address player;
        bytes32 gameId;
        address referrer;
        uint96 wager;
        uint96 maxProfit;
        uint40 placedAt;
        uint64 requestId;
        BetStatus status;
        bytes gameData;
    }

    struct SettlementAmounts {
        bool won;
        uint256 grossProfit;
        uint256 playerPayout;
        uint256 burnAmount;
        uint256 incomeAmount;
        uint256 referralAmount;
    }

    GameRegistry public immutable gameRegistry;
    ReferralRegistry public immutable referralRegistry;
    BankrollVault public immutable bankrollVault;

    uint256 public nextBetId;
    IVRFCoordinatorV2Like public vrfCoordinator;
    bytes32 public vrfKeyHash;
    uint64 public vrfSubscriptionId;
    uint16 public vrfRequestConfirmations;
    uint32 public vrfCallbackGasLimit;

    mapping(uint256 => PendingBet) public pendingBets;
    mapping(address => uint256) public pendingBetOf;
    mapping(uint256 => uint256) public requestToBetId;

    event BetPlaced(
        uint256 indexed betId,
        uint256 indexed requestId,
        bytes32 indexed gameId,
        address player,
        uint256 wager,
        uint256 maxProfit,
        address referrer
    );
    event RandomnessRequested(uint256 indexed requestId, uint256 indexed betId, bytes32 indexed gameId);
    event BetSettled(
        uint256 indexed betId,
        uint256 indexed requestId,
        bytes32 indexed gameId,
        address player,
        bool won,
        uint256 grossProfit,
        uint256 playerPayout,
        uint256 burnAmount,
        uint256 incomeAmount,
        uint256 referralAmount,
        bytes resultData
    );
    event BetRefunded(uint256 indexed betId, address indexed player);
    event VrfConfigUpdated(address indexed coordinator, bytes32 keyHash, uint64 subscriptionId, uint16 confirmations, uint32 callbackGasLimit);

    constructor(
        address accessControl_,
        address gameRegistry_,
        address referralRegistry_,
        address bankrollVault_
        ) AccessControlled(accessControl_) {
        gameRegistry = GameRegistry(gameRegistry_);
        referralRegistry = ReferralRegistry(referralRegistry_);
        bankrollVault = BankrollVault(bankrollVault_);
    }

    function setVrfConfig(
        address coordinator,
        bytes32 keyHash,
        uint64 subscriptionId,
        uint16 requestConfirmations,
        uint32 callbackGasLimit
    ) external onlyRole(Roles.OPERATOR_ROLE) {
        if (coordinator == address(0)) revert InvalidCoordinator();
        if (requestConfirmations == 0 || callbackGasLimit == 0) revert VrfNotConfigured();

        vrfCoordinator = IVRFCoordinatorV2Like(coordinator);
        vrfKeyHash = keyHash;
        vrfSubscriptionId = subscriptionId;
        vrfRequestConfirmations = requestConfirmations;
        vrfCallbackGasLimit = callbackGasLimit;

        emit VrfConfigUpdated(coordinator, keyHash, subscriptionId, requestConfirmations, callbackGasLimit);
    }

    function placeBet(bytes32 gameId, uint256 wager, address referrerHint, bytes calldata gameData)
        external
        whenSystemNotPaused
        nonReentrant
        returns (uint256 betId)
    {
        if (wager < BASE_WAGER || wager % BASE_WAGER != 0 || wager > BASE_WAGER * MAX_WAGER_MULTIPLIER) {
            revert InvalidWager(wager);
        }

        uint256 existingBetId = pendingBetOf[msg.sender];
        if (existingBetId != 0) {
            PendingBet storage currentPendingBet = pendingBets[existingBetId];
            if (currentPendingBet.status == BetStatus.Pending) {
                revert PendingBetExists(msg.sender, existingBetId);
            }
        }

        if (address(vrfCoordinator) == address(0) || vrfRequestConfirmations == 0 || vrfCallbackGasLimit == 0) {
            revert VrfNotConfigured();
        }

        GameRegistry.GameConfig memory config = gameRegistry.getGame(gameId);
        if (!config.enabled) revert GameDisabled(gameId);

        uint256 maxProfit = IGameModule(config.module).validateBet(wager, gameData);
        address resolvedReferrer = _resolveReferrer(msg.sender, referrerHint);
        uint256 requestId = vrfCoordinator.requestRandomWords(
            vrfKeyHash, vrfSubscriptionId, vrfRequestConfirmations, vrfCallbackGasLimit, config.vrfWordCount
        );

        betId = ++nextBetId;
        pendingBets[betId] = PendingBet({
            player: msg.sender,
            gameId: gameId,
            referrer: resolvedReferrer,
            wager: uint96(wager),
            maxProfit: uint96(maxProfit),
            placedAt: uint40(block.timestamp),
            requestId: uint64(requestId),
            status: BetStatus.Pending,
            gameData: gameData
        });
        pendingBetOf[msg.sender] = betId;
        requestToBetId[requestId] = betId;

        bankrollVault.lockBet(betId, msg.sender, wager, maxProfit);

        emit BetPlaced(betId, requestId, gameId, msg.sender, wager, maxProfit, resolvedReferrer);
        emit RandomnessRequested(requestId, betId, gameId);
    }

    function refundPendingBet(uint256 betId) external onlyRole(Roles.OPERATOR_ROLE) whenSystemNotPaused nonReentrant {
        PendingBet storage bet = _requirePendingBet(betId);
        address player = bet.player;
        uint256 requestId = bet.requestId;

        bet.status = BetStatus.Refunded;
        delete pendingBetOf[player];
        delete requestToBetId[requestId];

        bankrollVault.refundBet(betId);
        emit BetRefunded(betId, player);
    }

    function rawFulfillRandomWords(uint256 requestId, uint256[] calldata randomWords)
        external
        whenSystemNotPaused
        nonReentrant
    {
        if (msg.sender != address(vrfCoordinator)) revert InvalidCoordinator();
        if (randomWords.length == 0) revert InvalidRandomWords(requestId);

        uint256 betId = requestToBetId[requestId];
        if (betId == 0) revert InvalidRequest(requestId);

        PendingBet storage bet = _requirePendingBet(betId);
        GameRegistry.GameConfig memory config = gameRegistry.getGame(bet.gameId);
        if (!config.enabled) revert GameDisabled(bet.gameId);

        (bool won, uint256 grossProfit, bytes memory resultData) =
            IGameModule(config.module).resolveBet(bet.wager, bet.gameData, randomWords[0]);

        SettlementAmounts memory settlement =
            _buildSettlementAmounts(uint256(bet.wager), grossProfit, bet.referrer != address(0), won);

        if (settlement.referralAmount > 0) {
            referralRegistry.recordReferralReward(bet.player, settlement.referralAmount);
        }

        if (settlement.won) {
            bankrollVault.settleWin(
                betId,
                settlement.grossProfit,
                settlement.playerPayout,
                settlement.burnAmount,
                settlement.incomeAmount,
                bet.referrer,
                settlement.referralAmount
            );
        } else {
            bankrollVault.settleLoss(
                betId, settlement.burnAmount, settlement.incomeAmount, bet.referrer, settlement.referralAmount
            );
        }

        address player = bet.player;
        bytes32 gameId = bet.gameId;
        uint256 settledRequestId = bet.requestId;

        bet.status = BetStatus.Settled;
        delete pendingBetOf[player];
        delete requestToBetId[requestId];

        emit BetSettled(
            betId,
            settledRequestId,
            gameId,
            player,
            settlement.won,
            settlement.grossProfit,
            settlement.playerPayout,
            settlement.burnAmount,
            settlement.incomeAmount,
            settlement.referralAmount,
            resultData
        );
    }

    function _resolveReferrer(address player, address referrerHint) internal returns (address resolvedReferrer) {
        resolvedReferrer = referralRegistry.referrerOf(player);

        if (resolvedReferrer == address(0)) {
            if (referrerHint != address(0)) {
                referralRegistry.bindReferrer(player, referrerHint);
                resolvedReferrer = referrerHint;
            }
            return resolvedReferrer;
        }

        if (referrerHint != address(0) && referrerHint != resolvedReferrer) {
            revert ReferrerMismatch(resolvedReferrer, referrerHint);
        }
    }

    function _requirePendingBet(uint256 betId) internal view returns (PendingBet storage bet) {
        bet = pendingBets[betId];
        if (bet.status != BetStatus.Pending) revert BetNotPending(betId);
    }

    function _buildSettlementAmounts(uint256 wager, uint256 grossProfit, bool hasReferrer, bool won)
        internal
        pure
        returns (SettlementAmounts memory settlement)
    {
        settlement.won = won;
        settlement.grossProfit = grossProfit;

        if (won) {
            settlement.burnAmount = (grossProfit * BURN_BPS) / BPS_DENOMINATOR;
            settlement.incomeAmount = (grossProfit * INCOME_BPS) / BPS_DENOMINATOR;
            settlement.referralAmount = (grossProfit * REFERRAL_BPS) / BPS_DENOMINATOR;
            if (!hasReferrer) {
                settlement.incomeAmount += settlement.referralAmount;
                settlement.referralAmount = 0;
            }
            settlement.playerPayout =
                wager + grossProfit - settlement.burnAmount - settlement.incomeAmount - settlement.referralAmount;
        } else {
            settlement.burnAmount = (wager * BURN_BPS) / BPS_DENOMINATOR;
            settlement.incomeAmount = (wager * INCOME_BPS) / BPS_DENOMINATOR;
            settlement.referralAmount = (wager * REFERRAL_BPS) / BPS_DENOMINATOR;
            if (!hasReferrer) {
                settlement.incomeAmount += settlement.referralAmount;
                settlement.referralAmount = 0;
            }
        }
    }
}
