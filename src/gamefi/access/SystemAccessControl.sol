// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {AccessControlEnumerable} from "@openzeppelin/access/AccessControlEnumerable.sol";
import {Pausable} from "@openzeppelin/security/Pausable.sol";
import {Roles} from "src/gamefi/libraries/Roles.sol";

contract SystemAccessControl is AccessControlEnumerable, Pausable {
    error ZeroAddress();

    event BootstrapRoleGranted(bytes32 indexed role, address indexed account);

    constructor(address admin) {
        if (admin == address(0)) revert ZeroAddress();

        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(Roles.OPERATOR_ROLE, admin);
        _grantRole(Roles.PAUSER_ROLE, admin);
        _grantRole(Roles.REVENUE_ROLE, admin);
        _grantRole(Roles.GAME_ADMIN_ROLE, admin);
        _grantRole(Roles.GAME_MANAGER_ROLE, admin);
        _grantRole(Roles.REFERRAL_BINDER_ROLE, admin);
        _grantRole(Roles.REFERRAL_REWARD_ROLE, admin);
        _grantRole(Roles.AUTOMATION_ROLE, admin);
    }

    function grantBootstrapRoles(address account, bytes32[] calldata roles) external onlyRole(DEFAULT_ADMIN_ROLE) {
        if (account == address(0)) revert ZeroAddress();

        uint256 length = roles.length;
        for (uint256 i = 0; i < length; ++i) {
            _grantRole(roles[i], account);
            emit BootstrapRoleGranted(roles[i], account);
        }
    }

    function pause() external onlyRole(Roles.PAUSER_ROLE) {
        _pause();
    }

    function unpause() external onlyRole(DEFAULT_ADMIN_ROLE) {
        _unpause();
    }
}
