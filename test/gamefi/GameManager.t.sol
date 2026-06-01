// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {ERC20} from "@openzeppelin/token/ERC20/ERC20.sol";
import {SystemAccessControl} from "src/gamefi/access/SystemAccessControl.sol";
import {GameRegistry} from "src/gamefi/games/GameRegistry.sol";
import {GameManager} from "src/gamefi/manager/GameManager.sol";
import {IGameModule} from "src/gamefi/interfaces/IGameModule.sol";
import {ReferralRegistry} from "src/gamefi/referral/ReferralRegistry.sol";
import {BankrollVault} from "src/gamefi/vault/BankrollVault.sol";
import {Roles} from "src/gamefi/libraries/Roles.sol";

contract MockDividendForManager {
    function withdrawDividendsFor(address, bool) external pure returns (bool success) {
        return success;
    }
}

contract MockTokenForManager is ERC20 {
    constructor(string memory name_, string memory symbol_) ERC20(name_, symbol_) {}

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }
}

contract MockVrfCoordinator {
    uint256 public nextRequestId = 1;

    function requestRandomWords(bytes32, uint64, uint16, uint32, uint32) external returns (uint256 requestId) {
        requestId = nextRequestId++;
    }

    function fulfill(GameManager manager, uint256 requestId, uint256[] calldata randomWords) external {
        manager.rawFulfillRandomWords(requestId, randomWords);
    }
}

contract MockCoinFlipGameModule is IGameModule {
    bytes32 private immutable _gameId;
    string private _name;

    constructor(bytes32 gameId_, string memory name_) {
        _gameId = gameId_;
        _name = name_;
    }

    function gameId() external view returns (bytes32) {
        return _gameId;
    }

    function gameName() external view returns (string memory) {
        return _name;
    }

    function validateBet(uint256 wager, bytes calldata gameData) external pure returns (uint256 maxProfit) {
        require(gameData.length == 32, "bad gameData");
        return wager;
    }

    function resolveBet(uint256 wager, bytes calldata gameData, uint256 randomWord)
        external
        pure
        returns (bool won, uint256 grossProfit, bytes memory resultData)
    {
        bool guessHeads = abi.decode(gameData, (bool));
        bool landedHeads = randomWord % 2 == 0;
        won = guessHeads == landedHeads;
        grossProfit = won ? wager : 0;
        resultData = abi.encode(guessHeads, landedHeads);
    }
}

contract GameManagerTest is Test {
    bytes32 internal constant COIN_FLIP_GAME_ID = keccak256("COIN_FLIP");

    SystemAccessControl internal accessControl;
    GameRegistry internal gameRegistry;
    ReferralRegistry internal referralRegistry;
    BankrollVault internal vault;
    GameManager internal gameManager;
    MockTokenForManager internal flap;
    MockTokenForManager internal wbnb;
    MockDividendForManager internal dividend;
    MockCoinFlipGameModule internal gameModule;
    MockVrfCoordinator internal vrfCoordinator;

    address internal admin = address(0xA11CE);
    address internal player = address(0x1111);
    address internal referrer = address(0x2222);
    address internal incomePool = address(0x3333);

    function setUp() external {
        vm.prank(admin);
        accessControl = new SystemAccessControl(admin);

        flap = new MockTokenForManager("FLAP", "FLAP");
        wbnb = new MockTokenForManager("WBNB", "WBNB");
        dividend = new MockDividendForManager();
        vrfCoordinator = new MockVrfCoordinator();

        referralRegistry = new ReferralRegistry(address(accessControl));
        gameRegistry = new GameRegistry(address(accessControl));
        vault = new BankrollVault(address(accessControl), address(flap), address(wbnb), address(dividend), incomePool);
        gameManager =
            new GameManager(address(accessControl), address(gameRegistry), address(referralRegistry), address(vault));
        gameModule = new MockCoinFlipGameModule(COIN_FLIP_GAME_ID, "CoinFlip");

        vm.startPrank(admin);
        accessControl.grantRole(Roles.GAME_MANAGER_ROLE, address(gameManager));
        accessControl.grantRole(Roles.REFERRAL_BINDER_ROLE, address(gameManager));
        accessControl.grantRole(Roles.REFERRAL_REWARD_ROLE, address(gameManager));
        accessControl.grantRole(Roles.OPERATOR_ROLE, admin);
        gameRegistry.registerGame(COIN_FLIP_GAME_ID, address(gameModule), "coin-flip", 1);
        gameManager.setVrfConfig(address(vrfCoordinator), bytes32("keyHash"), 1, 3, 300_000);
        vm.stopPrank();

        flap.mint(address(vault), 1_000_000 ether);
        flap.mint(player, 10_000 ether);

        vm.prank(player);
        flap.approve(address(vault), type(uint256).max);
    }

    function testPlaceBetBindsReferrerAndRequestsRandomness() external {
        vm.prank(player);
        uint256 betId = gameManager.placeBet(COIN_FLIP_GAME_ID, 1_000 ether, referrer, abi.encode(true));

        assertEq(betId, 1);
        assertEq(gameManager.pendingBetOf(player), betId);
        assertEq(referralRegistry.referrerOf(player), referrer);

        (
            address betPlayer,
            bytes32 gameId,
            address betReferrer,
            uint96 wager,
            uint96 maxProfit,
            ,
            uint64 requestId,
            GameManager.BetStatus status,
        ) = gameManager.pendingBets(betId);

        assertEq(betPlayer, player);
        assertEq(gameId, COIN_FLIP_GAME_ID);
        assertEq(betReferrer, referrer);
        assertEq(uint256(wager), 1_000 ether);
        assertEq(uint256(maxProfit), 1_000 ether);
        assertEq(requestId, 1);
        assertEq(uint256(status), uint256(GameManager.BetStatus.Pending));
    }

    function testRejectSecondPendingBet() external {
        vm.startPrank(player);
        gameManager.placeBet(COIN_FLIP_GAME_ID, 1_000 ether, referrer, abi.encode(true));
        vm.expectRevert(abi.encodeWithSelector(GameManager.PendingBetExists.selector, player, 1));
        gameManager.placeBet(COIN_FLIP_GAME_ID, 2_000 ether, referrer, abi.encode(true));
        vm.stopPrank();
    }

    function testRejectWagerAboveMaxMultiplier() external {
        vm.prank(player);
        vm.expectRevert(abi.encodeWithSelector(GameManager.InvalidWager.selector, 4_000 ether));
        gameManager.placeBet(COIN_FLIP_GAME_ID, 4_000 ether, referrer, abi.encode(true));
    }

    function testRejectReferrerMismatchAfterBinding() external {
        vm.prank(player);
        gameManager.placeBet(COIN_FLIP_GAME_ID, 1_000 ether, referrer, abi.encode(true));

        vm.prank(admin);
        gameManager.refundPendingBet(1);

        vm.prank(player);
        vm.expectRevert(abi.encodeWithSelector(GameManager.ReferrerMismatch.selector, referrer, address(0x4444)));
        gameManager.placeBet(COIN_FLIP_GAME_ID, 1_000 ether, address(0x4444), abi.encode(true));
    }

    function testOperatorCanRefundPendingBet() external {
        vm.prank(player);
        gameManager.placeBet(COIN_FLIP_GAME_ID, 1_000 ether, referrer, abi.encode(true));

        vm.prank(admin);
        gameManager.refundPendingBet(1);

        assertEq(gameManager.pendingBetOf(player), 0);
        assertEq(flap.balanceOf(player), 10_000 ether);
    }

    function testFulfillWinSettlesAutomatically() external {
        vm.prank(player);
        gameManager.placeBet(COIN_FLIP_GAME_ID, 1_000 ether, referrer, abi.encode(true));

        uint256[] memory randomWords = new uint256[](1);
        randomWords[0] = 2;
        vrfCoordinator.fulfill(gameManager, 1, randomWords);

        assertEq(gameManager.pendingBetOf(player), 0);
        assertEq(flap.balanceOf(player), 10_940 ether);
        assertEq(flap.balanceOf(incomePool), 38 ether);
        assertEq(flap.balanceOf(referrer), 2 ether);
        assertEq(referralRegistry.totalReferralRewards(referrer), 2 ether);
    }

    function testFulfillLossSettlesAutomatically() external {
        vm.prank(player);
        gameManager.placeBet(COIN_FLIP_GAME_ID, 1_000 ether, referrer, abi.encode(true));

        uint256[] memory randomWords = new uint256[](1);
        randomWords[0] = 1;
        vrfCoordinator.fulfill(gameManager, 1, randomWords);

        assertEq(gameManager.pendingBetOf(player), 0);
        assertEq(flap.balanceOf(player), 9_000 ether);
        assertEq(flap.balanceOf(incomePool), 38 ether);
        assertEq(flap.balanceOf(referrer), 2 ether);
        assertEq(referralRegistry.totalReferralRewards(referrer), 2 ether);
    }

    function testRejectDuplicateFulfill() external {
        vm.prank(player);
        gameManager.placeBet(COIN_FLIP_GAME_ID, 1_000 ether, referrer, abi.encode(true));

        uint256[] memory randomWords = new uint256[](1);
        randomWords[0] = 2;
        vrfCoordinator.fulfill(gameManager, 1, randomWords);

        vm.expectRevert(abi.encodeWithSelector(GameManager.InvalidRequest.selector, 1));
        vrfCoordinator.fulfill(gameManager, 1, randomWords);
    }
}
