// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console2} from "forge-std/Script.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {KeyprintRegistry} from "../src/KeyprintRegistry.sol";
import {KeyprintEscrow} from "../src/KeyprintEscrow.sol";

/// @notice Runs one complete real lease (create, seal, fund, end, claim, accept, close, settle)
///         on Arc Testnet so real transaction links can be recorded in README.md.
contract DemoLease is Script {
    address internal constant ARC_TESTNET_USDC = 0x3600000000000000000000000000000000000000;

    function run() external {
        KeyprintRegistry registry = KeyprintRegistry(vm.envAddress("NEXT_PUBLIC_KEYPRINT_REGISTRY_ADDRESS"));
        KeyprintEscrow escrow = KeyprintEscrow(vm.envAddress("NEXT_PUBLIC_KEYPRINT_ESCROW_ADDRESS"));
        uint256 landlordKey = vm.envUint("LANDLORD_KEY");
        uint256 renterKey = vm.envUint("RENTER_KEY");
        address reviewer = vm.envAddress("REVIEWER_ADDRESS");

        address renter = vm.addr(renterKey);
        bytes32 unitId = keccak256("arc-testnet-demo-unit");
        uint128 deposit = 2_000_000; // 2 USDC for scripted verification

        vm.startBroadcast(landlordKey);
        bytes32 leaseId = escrow.createLease(
            KeyprintEscrow.LeaseTerms({
                renter: renter,
                reviewer: reviewer,
                deposit: deposit,
                unitId: unitId,
                leaseEnd: uint64(block.timestamp),
                reviewWindow: 60,
                claimWindow: 60,
                responseWindow: 60,
                resolveWindow: 60
            })
        );
        vm.stopBroadcast();

        vm.startBroadcast(renterKey);
        bytes32 moveInId = registry.seal(
            unitId,
            leaseId,
            KeyprintRegistry.Kind.MoveInScan,
            keccak256(abi.encode("script-move-in", leaseId))
        );
        IERC20(ARC_TESTNET_USDC).approve(address(escrow), deposit);
        escrow.fund(leaseId, moveInId);

        bytes32 moveOutId = registry.seal(
            unitId,
            leaseId,
            KeyprintRegistry.Kind.MoveOutScan,
            keccak256(abi.encode("script-move-out", leaseId))
        );
        escrow.endLease(leaseId, moveOutId);
        vm.stopBroadcast();

        vm.startBroadcast(landlordKey);
        bytes32 evId = registry.seal(
            unitId,
            leaseId,
            KeyprintRegistry.Kind.ClaimEvidence,
            keccak256(abi.encode("script-claim", leaseId))
        );
        uint256 claimId = escrow.fileClaim(leaseId, evId, 1_000_000);
        escrow.closeClaims(leaseId);
        vm.stopBroadcast();

        vm.startBroadcast(renterKey);
        escrow.acceptClaim(claimId);
        escrow.settle(leaseId);
        vm.stopBroadcast();

        console2.logBytes32(leaseId);
        console2.log("Claim ID settled:", claimId);
    }
}
