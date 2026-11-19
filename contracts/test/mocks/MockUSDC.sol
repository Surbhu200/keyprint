// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/// @notice 6-decimal USDC mock used ONLY inside Foundry tests.
///         Supports simulating USDC blocklisting (reverting transfers to blocked addresses).
contract MockUSDC is ERC20 {
    mapping(address => bool) public blocked;

    error AddressBlocked(address account);

    constructor() ERC20("Mock USDC", "USDC") {}

    function decimals() public pure override returns (uint8) {
        return 6;
    }

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }

    function setBlocked(address account, bool isBlocked) external {
        blocked[account] = isBlocked;
    }

    function _update(address from, address to, uint256 value) internal override {
        if (blocked[from]) revert AddressBlocked(from);
        if (blocked[to]) revert AddressBlocked(to);
        super._update(from, to, value);
    }
}
