// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ISystemAccessControl} from "src/gamefi/interfaces/ISystemAccessControl.sol";

abstract contract AccessControlled {
    error Unauthorized(address caller, bytes32 role);
    error SystemPaused();
    error ZeroAddress();

    bytes32 internal constant DEFAULT_ADMIN_ROLE = 0x00;

    ISystemAccessControl public immutable accessControl;

    constructor(address accessControl_) {
        if (accessControl_ == address(0)) revert ZeroAddress();
        accessControl = ISystemAccessControl(accessControl_);
    }

    modifier onlyRole(bytes32 role) {
        _checkRole(role, msg.sender);
        _;
    }

    modifier whenSystemNotPaused() {
        if (accessControl.paused()) revert SystemPaused();
        _;
    }

    function _checkRole(bytes32 role, address account) internal view {
        if (accessControl.hasRole(DEFAULT_ADMIN_ROLE, account) || accessControl.hasRole(role, account)) {
            return;
        }

        revert Unauthorized(account, role);
    }
}
