// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {SystemAccessControl} from "src/gamefi/access/SystemAccessControl.sol";
import {GameRegistry} from "src/gamefi/games/GameRegistry.sol";
import {IGameModule} from "src/gamefi/interfaces/IGameModule.sol";
import {Roles} from "src/gamefi/libraries/Roles.sol";

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
    bytes32 internal constant DICE_GAME_ID = keccak256("DICE");
    bytes32 internal constant COIN_FLIP_GAME_ID = keccak256("COIN_FLIP");

    function setUp() external {
        vm.prank(admin);
        accessControl = new SystemAccessControl(admin);
        registry = new GameRegistry(address(accessControl));
    }

    function testRegisterGame() external {
        MockGameModule module = new MockGameModule(DICE_GAME_ID, "Dice");

        vm.prank(admin);
        registry.registerGame(DICE_GAME_ID, address(module), "dice", 1);

        GameRegistry.GameConfig memory config = registry.getGame(DICE_GAME_ID);
        assertEq(config.module, address(module));
        assertEq(config.name, "Dice");
        assertEq(config.slug, "dice");
        assertEq(config.vrfWordCount, 1);
        assertTrue(config.enabled);
    }

    function testRejectDuplicateRegistration() external {
        MockGameModule module = new MockGameModule(DICE_GAME_ID, "Dice");

        vm.startPrank(admin);
        registry.registerGame(DICE_GAME_ID, address(module), "dice", 1);
        vm.expectRevert(abi.encodeWithSelector(GameRegistry.GameAlreadyRegistered.selector, DICE_GAME_ID));
        registry.registerGame(DICE_GAME_ID, address(module), "dice-v2", 1);
        vm.stopPrank();
    }

    function testRejectGameIdMismatch() external {
        MockGameModule module = new MockGameModule(COIN_FLIP_GAME_ID, "CoinFlip");

        vm.prank(admin);
        vm.expectRevert(
            abi.encodeWithSelector(GameRegistry.GameIdMismatch.selector, DICE_GAME_ID, COIN_FLIP_GAME_ID)
        );
        registry.registerGame(DICE_GAME_ID, address(module), "dice", 1);
    }

    function testUpdateModule() external {
        MockGameModule module = new MockGameModule(DICE_GAME_ID, "Dice");
        MockGameModule upgradedModule = new MockGameModule(DICE_GAME_ID, "Dice V2");

        vm.startPrank(admin);
        registry.registerGame(DICE_GAME_ID, address(module), "dice", 1);
        registry.setGameModule(DICE_GAME_ID, address(upgradedModule));
        vm.stopPrank();

        GameRegistry.GameConfig memory config = registry.getGame(DICE_GAME_ID);
        assertEq(config.module, address(upgradedModule));
        assertEq(config.name, "Dice V2");
    }

    function testPauseBlocksRegistration() external {
        MockGameModule module = new MockGameModule(DICE_GAME_ID, "Dice");

        vm.prank(admin);
        accessControl.pause();

        vm.prank(admin);
        vm.expectRevert(bytes4(keccak256("SystemPaused()")));
        registry.registerGame(DICE_GAME_ID, address(module), "dice", 1);
    }

    function testSetGameEnabled() external {
        MockGameModule module = new MockGameModule(DICE_GAME_ID, "Dice");

        vm.startPrank(admin);
        registry.registerGame(DICE_GAME_ID, address(module), "dice", 1);
        registry.setGameEnabled(DICE_GAME_ID, false);
        vm.stopPrank();

        GameRegistry.GameConfig memory config = registry.getGame(DICE_GAME_ID);
        assertFalse(config.enabled);
    }
}
