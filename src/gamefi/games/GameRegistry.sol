// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {AccessControlled} from "src/gamefi/access/AccessControlled.sol";
import {IGameModule} from "src/gamefi/interfaces/IGameModule.sol";
import {Roles} from "src/gamefi/libraries/Roles.sol";

contract GameRegistry is AccessControlled {
    error InvalidGameId();
    error InvalidModule();
    error InvalidVrfWordCount();
    error GameAlreadyRegistered(bytes32 gameId);
    error GameNotRegistered(bytes32 gameId);
    error GameIdMismatch(bytes32 expectedGameId, bytes32 actualGameId);

    struct GameConfig {
        address module;
        string name;
        string slug;
        uint16 vrfWordCount;
        bool enabled;
    }

    mapping(bytes32 => GameConfig) private _games;
    bytes32[] private _gameIds;

    event GameRegistered(
        bytes32 indexed gameId,
        address indexed module,
        string name,
        string slug,
        uint16 vrfWordCount
    );
    event GameModuleUpdated(bytes32 indexed gameId, address indexed previousModule, address indexed newModule);
    event GameStatusUpdated(bytes32 indexed gameId, bool enabled);

    constructor(address accessControl_) AccessControlled(accessControl_) {}

    function registerGame(bytes32 gameId, address module, string calldata slug, uint16 vrfWordCount)
        external
        onlyRole(Roles.GAME_ADMIN_ROLE)
        whenSystemNotPaused
    {
        if (gameId == bytes32(0)) revert InvalidGameId();
        if (module == address(0)) revert InvalidModule();
        if (vrfWordCount == 0) revert InvalidVrfWordCount();
        if (_games[gameId].module != address(0)) revert GameAlreadyRegistered(gameId);

        bytes32 moduleGameId = IGameModule(module).gameId();
        if (moduleGameId != gameId) revert GameIdMismatch(gameId, moduleGameId);

        string memory name = IGameModule(module).gameName();

        _games[gameId] = GameConfig({
            module: module,
            name: name,
            slug: slug,
            vrfWordCount: vrfWordCount,
            enabled: true
        });
        _gameIds.push(gameId);

        emit GameRegistered(gameId, module, name, slug, vrfWordCount);
    }

    function setGameModule(bytes32 gameId, address newModule)
        external
        onlyRole(Roles.GAME_ADMIN_ROLE)
        whenSystemNotPaused
    {
        if (newModule == address(0)) revert InvalidModule();

        GameConfig storage config = _requireGame(gameId);
        bytes32 moduleGameId = IGameModule(newModule).gameId();
        if (moduleGameId != gameId) revert GameIdMismatch(gameId, moduleGameId);

        address previousModule = config.module;
        config.module = newModule;
        config.name = IGameModule(newModule).gameName();

        emit GameModuleUpdated(gameId, previousModule, newModule);
    }

    function setGameEnabled(bytes32 gameId, bool enabled)
        external
        onlyRole(Roles.GAME_ADMIN_ROLE)
        whenSystemNotPaused
    {
        GameConfig storage config = _requireGame(gameId);
        config.enabled = enabled;
        emit GameStatusUpdated(gameId, enabled);
    }

    function getGame(bytes32 gameId) external view returns (GameConfig memory) {
        return _requireGame(gameId);
    }

    function gameIds() external view returns (bytes32[] memory) {
        return _gameIds;
    }

    function isRegistered(bytes32 gameId) external view returns (bool) {
        return _games[gameId].module != address(0);
    }

    function _requireGame(bytes32 gameId) internal view returns (GameConfig storage config) {
        config = _games[gameId];
        if (config.module == address(0)) revert GameNotRegistered(gameId);
    }
}
