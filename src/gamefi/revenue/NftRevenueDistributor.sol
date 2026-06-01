// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {SafeERC20} from "@openzeppelin/token/ERC20/utils/SafeERC20.sol";
import {IERC20} from "@openzeppelin/token/ERC20/IERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/security/ReentrancyGuard.sol";
import {AccessControlled} from "src/gamefi/access/AccessControlled.sol";
import {IDividendBankNFT} from "src/gamefi/interfaces/IDividendBankNFT.sol";
import {IIncomePool} from "src/gamefi/interfaces/IIncomePool.sol";
import {Roles} from "src/gamefi/libraries/Roles.sol";

contract NftRevenueDistributor is AccessControlled, ReentrancyGuard {
    using SafeERC20 for IERC20;

    error InvalidToken();
    error InvalidNft();
    error InvalidIncomePool();
    error SnapshotAlreadyExists(uint256 dayId);
    error SnapshotNotFound(uint256 dayId);
    error InvalidSnapshotBlock();
    error ZeroTotalUnits(uint256 dayId);
    error NothingToClaim(uint256 dayId, address account);
    error AlreadyClaimed(uint256 dayId, address account);
    error InvalidSnapshotDay(uint256 providedDayId, uint256 currentDayId);
    error SnapshotWindowClosed(uint256 secondsIntoUtc8Day, uint256 snapshotWindowSeconds);
    error InvalidSnapshotWindow(uint256 snapshotWindowSeconds);

    uint256 public constant DEFAULT_DAILY_PAYOUT_BPS = 2_000;
    uint256 public constant DEFAULT_SNAPSHOT_WINDOW_SECONDS = 10 minutes;
    uint256 public constant BPS_DENOMINATOR = 10_000;
    uint256 public constant UTC8_OFFSET = 8 hours;

    struct Snapshot {
        uint64 snapshotBlock;
        uint192 allocationAmount;
        uint192 totalUnits;
    }

    IERC20 public immutable flapToken;
    IDividendBankNFT public immutable nft;
    IIncomePool public immutable incomePool;

    uint16 public dailyPayoutBps;
    uint32 public snapshotWindowSeconds;

    mapping(uint256 => Snapshot) public snapshots;
    mapping(uint256 => mapping(address => bool)) public claimed;

    event SnapshotCreated(uint256 indexed dayId, uint256 indexed snapshotBlock, uint256 allocationAmount, uint256 totalUnits);
    event RevenueClaimed(uint256 indexed dayId, address indexed account, uint256 amount);
    event DailyPayoutBpsUpdated(uint16 oldBps, uint16 newBps);
    event SnapshotWindowUpdated(uint32 oldWindowSeconds, uint32 newWindowSeconds);

    constructor(address accessControl_, address flapToken_, address nft_, address incomePool_)
        AccessControlled(accessControl_)
    {
        if (flapToken_ == address(0)) revert InvalidToken();
        if (nft_ == address(0)) revert InvalidNft();
        if (incomePool_ == address(0)) revert InvalidIncomePool();

        flapToken = IERC20(flapToken_);
        nft = IDividendBankNFT(nft_);
        incomePool = IIncomePool(incomePool_);
        dailyPayoutBps = uint16(DEFAULT_DAILY_PAYOUT_BPS);
        snapshotWindowSeconds = uint32(DEFAULT_SNAPSHOT_WINDOW_SECONDS);
    }

    function setDailyPayoutBps(uint16 newBps) external onlyRole(Roles.REVENUE_ROLE) {
        uint16 oldBps = dailyPayoutBps;
        dailyPayoutBps = newBps;
        emit DailyPayoutBpsUpdated(oldBps, newBps);
    }

    function setSnapshotWindowSeconds(uint32 newWindowSeconds) external onlyRole(Roles.REVENUE_ROLE) {
        if (newWindowSeconds == 0 || newWindowSeconds > 1 days) revert InvalidSnapshotWindow(newWindowSeconds);
        uint32 oldWindowSeconds = snapshotWindowSeconds;
        snapshotWindowSeconds = newWindowSeconds;
        emit SnapshotWindowUpdated(oldWindowSeconds, newWindowSeconds);
    }

    function currentUtc8DayId() public view returns (uint256) {
        return (block.timestamp + UTC8_OFFSET) / 1 days;
    }

    function snapshotAndPull(uint256 dayId) external onlyRole(Roles.AUTOMATION_ROLE) whenSystemNotPaused nonReentrant {
        uint256 currentDayId = currentUtc8DayId();
        if (dayId != currentDayId) revert InvalidSnapshotDay(dayId, currentDayId);

        uint256 secondsIntoUtc8Day = (block.timestamp + UTC8_OFFSET) % 1 days;
        if (secondsIntoUtc8Day > snapshotWindowSeconds) {
            revert SnapshotWindowClosed(secondsIntoUtc8Day, snapshotWindowSeconds);
        }

        if (snapshots[dayId].snapshotBlock != 0) revert SnapshotAlreadyExists(dayId);
        if (block.number <= 1) revert InvalidSnapshotBlock();

        uint256 snapshotBlock = block.number - 1;
        uint256 totalUnits = nft.getPastTotalSupply(snapshotBlock);
        if (totalUnits == 0) revert ZeroTotalUnits(dayId);

        uint256 allocationAmount = (incomePool.availableFlap() * dailyPayoutBps) / BPS_DENOMINATOR;

        uint256 balanceBefore = flapToken.balanceOf(address(this));
        if (allocationAmount > 0) {
            incomePool.allocateToNftDistributor(allocationAmount);
        }
        uint256 received = flapToken.balanceOf(address(this)) - balanceBefore;

        snapshots[dayId] = Snapshot({
            snapshotBlock: uint64(snapshotBlock),
            allocationAmount: uint192(received),
            totalUnits: uint192(totalUnits)
        });

        emit SnapshotCreated(dayId, snapshotBlock, received, totalUnits);
    }

    function claim(uint256 dayId) external whenSystemNotPaused nonReentrant returns (uint256 amount) {
        amount = _claim(dayId, msg.sender);
    }

    function claimBatch(uint256[] calldata dayIds) external whenSystemNotPaused nonReentrant returns (uint256 totalAmount) {
        uint256 length = dayIds.length;
        for (uint256 i = 0; i < length; ++i) {
            totalAmount += _claim(dayIds[i], msg.sender);
        }
    }

    function previewClaim(uint256 dayId, address account) public view returns (uint256 amount) {
        Snapshot memory snapshot = snapshots[dayId];
        if (snapshot.snapshotBlock == 0) revert SnapshotNotFound(dayId);
        if (claimed[dayId][account]) return 0;

        uint256 userUnits = nft.getPastBalanceOf(account, snapshot.snapshotBlock);
        if (userUnits == 0 || snapshot.totalUnits == 0 || snapshot.allocationAmount == 0) {
            return 0;
        }

        return (uint256(snapshot.allocationAmount) * userUnits) / uint256(snapshot.totalUnits);
    }

    function _claim(uint256 dayId, address account) internal returns (uint256 amount) {
        Snapshot memory snapshot = snapshots[dayId];
        if (snapshot.snapshotBlock == 0) revert SnapshotNotFound(dayId);
        if (claimed[dayId][account]) revert AlreadyClaimed(dayId, account);

        amount = previewClaim(dayId, account);
        if (amount == 0) revert NothingToClaim(dayId, account);

        claimed[dayId][account] = true;
        flapToken.safeTransfer(account, amount);

        emit RevenueClaimed(dayId, account, amount);
    }
}
