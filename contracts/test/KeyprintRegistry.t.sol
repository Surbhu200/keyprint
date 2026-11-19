// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {KeyprintRegistry} from "../src/KeyprintRegistry.sol";

contract KeyprintRegistryTest is Test {
    KeyprintRegistry internal registry;

    address internal renter = address(0x1111111111111111111111111111111111111111);
    address internal landlord = address(0x2222222222222222222222222222222222222222);

    bytes32 internal unitId = keccak256("unit-4b");
    bytes32 internal leaseId = keccak256("lease-1");
    bytes32 internal contentHash = keccak256("manifest-bytes-v1");

    function setUp() public {
        registry = new KeyprintRegistry();
    }

    function test_sealAndGetRecord() public {
        vm.warp(1_763_600_000);
        vm.prank(renter);
        bytes32 recordId = registry.seal(unitId, leaseId, KeyprintRegistry.Kind.MoveInScan, contentHash);

        bytes32 expectedId = keccak256(
            abi.encode(renter, contentHash, uint8(KeyprintRegistry.Kind.MoveInScan))
        );
        assertEq(recordId, expectedId);
        assertTrue(registry.exists(recordId));

        KeyprintRegistry.Record memory rec = registry.getRecord(recordId);
        assertEq(rec.unitId, unitId);
        assertEq(rec.leaseId, leaseId);
        assertEq(uint8(rec.kind), uint8(KeyprintRegistry.Kind.MoveInScan));
        assertEq(rec.contentHash, contentHash);
        assertEq(rec.author, renter);
        assertEq(rec.createdAt, 1_763_600_000);
        assertEq(rec.createdSeq, 1);
    }

    function test_sealRevertsOnDuplicateOrZeroHash() public {
        vm.startPrank(renter);
        vm.expectRevert(KeyprintRegistry.InvalidContentHash.selector);
        registry.seal(unitId, leaseId, KeyprintRegistry.Kind.Pin, bytes32(0));

        bytes32 id = registry.seal(unitId, leaseId, KeyprintRegistry.Kind.Pin, contentHash);
        vm.expectRevert(
            abi.encodeWithSelector(KeyprintRegistry.RecordAlreadyExists.selector, id)
        );
        registry.seal(unitId, leaseId, KeyprintRegistry.Kind.Pin, contentHash);
        vm.stopPrank();
    }

    function test_acknowledgeAndContest() public {
        vm.warp(1_763_600_100);
        vm.prank(renter);
        bytes32 id = registry.seal(unitId, leaseId, KeyprintRegistry.Kind.Pin, contentHash);

        vm.warp(1_763_600_200);
        vm.prank(landlord);
        registry.acknowledge(id);
        assertEq(registry.acknowledgedAt(id, landlord), 1_763_600_200);

        vm.prank(landlord);
        vm.expectRevert(
            abi.encodeWithSelector(KeyprintRegistry.AlreadyAcknowledged.selector, id, landlord)
        );
        registry.acknowledge(id);

        bytes32 noteHash = keccak256("counter-note");
        vm.prank(landlord);
        vm.expectEmit(true, true, false, true);
        emit KeyprintRegistry.RecordContested(id, landlord, noteHash, 1_763_600_200);
        registry.contest(id, noteHash);
    }

    function test_acknowledgeAndContestRevertForMissingRecord() public {
        bytes32 missing = keccak256("missing");
        vm.expectRevert(abi.encodeWithSelector(KeyprintRegistry.RecordNotFound.selector, missing));
        registry.acknowledge(missing);

        vm.expectRevert(abi.encodeWithSelector(KeyprintRegistry.RecordNotFound.selector, missing));
        registry.contest(missing, keccak256("note"));
    }

    /// @notice Fixed vector tested in TypeScript with viem's encodeAbiParameters as well.
    function test_recordIdDeterministicVectorForViemParity() public view {
        address fixedAuthor = 0x1111111111111111111111111111111111111111;
        bytes32 fixedHash = 0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa;
        bytes32 actual = registry.computeRecordId(
            fixedAuthor,
            fixedHash,
            KeyprintRegistry.Kind.ClaimEvidence
        );
        bytes32 expected = keccak256(abi.encode(fixedAuthor, fixedHash, uint8(5)));
        assertEq(actual, expected);
    }
}
