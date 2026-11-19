// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console2} from "forge-std/Script.sol";
import {KeyprintRegistry} from "../src/KeyprintRegistry.sol";
import {KeyprintEscrow} from "../src/KeyprintEscrow.sol";

/// @notice Deploys KeyprintRegistry and KeyprintEscrow to Arc Testnet.
/// @dev Usage (Git Bash / WSL):
///      forge script script/Deploy.s.sol:Deploy --rpc-url "$ARC_RPC" --private-key "$DEPLOYER_KEY" --broadcast
contract Deploy is Script {
    address internal constant ARC_TESTNET_USDC = 0x3600000000000000000000000000000000000000;
    uint64 internal constant DEMO_MIN_WINDOW = 60;

    function run() external {
        uint256 deployerKey = vm.envUint("DEPLOYER_KEY");
        vm.startBroadcast(deployerKey);

        KeyprintRegistry registry = new KeyprintRegistry();
        KeyprintEscrow escrow = new KeyprintEscrow(
            ARC_TESTNET_USDC,
            address(registry),
            DEMO_MIN_WINDOW
        );

        vm.stopBroadcast();

        console2.log("KeyprintRegistry:", address(registry));
        console2.log("KeyprintEscrow:  ", address(escrow));
        console2.log("USDC ERC-20:     ", ARC_TESTNET_USDC);
        console2.log("MIN_WINDOW (s):  ", DEMO_MIN_WINDOW);
    }
}
