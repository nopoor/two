// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/token/ERC20/IERC20.sol";
import {AccessControlled} from "src/gamefi/access/AccessControlled.sol";
import {IDividend} from "src/interfaces/Tax/IDividend.sol";
import {Roles} from "src/gamefi/libraries/Roles.sol";

abstract contract FlapDividendAware is AccessControlled {
    error InvalidDividendContract();
    error InvalidTokenAddress();

    IERC20 public immutable flapToken;
    IERC20 public immutable wbnbToken;
    IDividend public immutable flapDividendContract;

    event ExistingFlapDividendsClaimed(address indexed claimer, bool success);

    constructor(address accessControl_, address flapToken_, address wbnbToken_, address flapDividendContract_)
        AccessControlled(accessControl_)
    {
        if (flapToken_ == address(0) || wbnbToken_ == address(0)) revert InvalidTokenAddress();
        if (flapDividendContract_ == address(0)) revert InvalidDividendContract();

        flapToken = IERC20(flapToken_);
        wbnbToken = IERC20(wbnbToken_);
        flapDividendContract = IDividend(flapDividendContract_);
    }

    function claimExistingFlapDividends()
        public
        onlyRole(Roles.REVENUE_ROLE)
        whenSystemNotPaused
        returns (bool success)
    {
        success = flapDividendContract.withdrawDividendsFor(address(this), false);
        emit ExistingFlapDividendsClaimed(msg.sender, success);
    }
}
