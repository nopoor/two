// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {SystemAccessControl} from "src/gamefi/access/SystemAccessControl.sol";
import {GameRegistry} from "src/gamefi/games/GameRegistry.sol";
import {IGameModule} from "src/gamefi/interfaces/IGameModule.sol";

contract MockGameModule is IGameModule {
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

    function validateBet(uint256 wager, bytes calldata) external pure returns (uint256 maxProfit) {
        return wager * 2;
    }

    function resolveBet(uint256 wager, bytes calldata, uint256) external pure returns (bool, uint256, bytes memory) {
        return (true, wager, bytes(""));
    }
}

contract GameRegistryTest is Test {
    SystemAccessControl internal accessControl;
    GameRegistry internal registry;

    address internal admin = address(0xA11CE);
    bytes32 internal constant TEST_GAME_ID = keccak256("TEST_GAME");
    bytes32 internal constant COIN_FLIP_GAME_ID = keccak256("COIN_FLIP");

    function setUp() external {
        vm.prank(admin);
        accessControl = new SystemAccessControl(admin);
        registry = new GameRegistry(address(accessControl));
    }

    function testRegisterGame() external {
        MockGameModule module = new MockGameModule(TEST_GAME_ID, "Test Game");

        vm.prank(admin);
        registry.registerGame(TEST_GAME_ID, address(module), "test-game", 1);

        GameRegistry.GameConfig memory config = registry.getGame(TEST_GAME_ID);
        assertEq(config.module, address(module));
        assertEq(config.name, "Test Game");
        assertEq(config.slug, "test-game");
        assertEq(config.vrfWordCount, 1);
        assertTrue(config.enabled);
    }

    function testRejectDuplicateRegistration() external {
        MockGameModule module = new MockGameModule(TEST_GAME_ID, "Test Game");

        vm.startPrank(admin);
        registry.registerGame(TEST_GAME_ID, address(module), "test-game", 1);
        vm.expectRevert(abi.encodeWithSelector(GameRegistry.GameAlreadyRegistered.selector, TEST_GAME_ID));
        registry.registerGame(TEST_GAME_ID, address(module), "test-game-v2", 1);
        vm.stopPrank();
    }

    function testRejectGameIdMismatch() external {
        MockGameModule module = new MockGameModule(COIN_FLIP_GAME_ID, "CoinFlip");

        vm.prank(admin);
        vm.expectRevert(
            abi.encodeWithSelector(GameRegistry.GameIdMismatch.selector, TEST_GAME_ID, COIN_FLIP_GAME_ID)
        );
        registry.registerGame(TEST_GAME_ID, address(module), "test-game", 1);
    }

    function testUpdateModule() external {
        MockGameModule module = new MockGameModule(TEST_GAME_ID, "Test Game");
        MockGameModule upgradedModule = new MockGameModule(TEST_GAME_ID, "Test Game V2");

        vm.startPrank(admin);
        registry.registerGame(TEST_GAME_ID, address(module), "test-game", 1);
        registry.setGameModule(TEST_GAME_ID, address(upgradedModule));
        vm.stopPrank();

        GameRegistry.GameConfig memory config = registry.getGame(TEST_GAME_ID);
        assertEq(config.module, address(upgradedModule));
        assertEq(config.name, "Test Game V2");
    }

    function testPauseBlocksRegistration() external {
        MockGameModule module = new MockGameModule(TEST_GAME_ID, "Test Game");

        vm.prank(admin);
        accessControl.pause();

        vm.prank(admin);
        vm.expectRevert(bytes4(keccak256("SystemPaused()")));
        registry.registerGame(TEST_GAME_ID, address(module), "test-game", 1);
    }

    function testSetGameEnabled() external {
        MockGameModule module = new MockGameModule(TEST_GAME_ID, "Test Game");

        vm.startPrank(admin);
        registry.registerGame(TEST_GAME_ID, address(module), "test-game", 1);
        registry.setGameEnabled(TEST_GAME_ID, false);
        vm.stopPrank();

        GameRegistry.GameConfig memory config = registry.getGame(TEST_GAME_ID);
        assertFalse(config.enabled);
    }
}
