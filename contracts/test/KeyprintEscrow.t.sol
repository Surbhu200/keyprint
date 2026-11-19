// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {StdInvariant} from "forge-std/StdInvariant.sol";
import {KeyprintRegistry} from "../src/KeyprintRegistry.sol";
import {KeyprintEscrow} from "../src/KeyprintEscrow.sol";
import {MockUSDC} from "./mocks/MockUSDC.sol";

contract KeyprintEscrowTest is Test {
    MockUSDC internal usdc;
    KeyprintRegistry internal registry;
    KeyprintEscrow internal escrow;

    address internal landlord = makeAddr("landlord");
    address internal renter = makeAddr("renter");
    address internal reviewer = makeAddr("reviewer");
    address internal stranger = makeAddr("stranger");

    uint64 internal constant MIN_WINDOW = 60;
    uint128 internal constant DEPOSIT = 200_000_000; // 200 USDC (6 decimals)
    bytes32 internal constant UNIT_ID = keccak256("apt-302");

    function setUp() public {
        vm.warp(1_763_600_000);
        usdc = new MockUSDC();
        registry = new KeyprintRegistry();
        escrow = new KeyprintEscrow(address(usdc), address(registry), MIN_WINDOW);

        usdc.mint(renter, 10_000_000_000); // 10,000 USDC
        usdc.mint(stranger, 1_000_000_000);
    }

    function _defaultTerms(uint64 leaseEnd) internal view returns (KeyprintEscrow.LeaseTerms memory) {
        return KeyprintEscrow.LeaseTerms({
            renter: renter,
            reviewer: reviewer,
            deposit: DEPOSIT,
            unitId: UNIT_ID,
            leaseEnd: leaseEnd,
            reviewWindow: 600,
            claimWindow: 600,
            responseWindow: 600,
            resolveWindow: 600
        });
    }

    function _createAndFundLease(uint64 leaseEnd) internal returns (bytes32 leaseId, bytes32 moveInId) {
        vm.prank(landlord);
        leaseId = escrow.createLease(_defaultTerms(leaseEnd));

        vm.startPrank(renter);
        moveInId = registry.seal(
            UNIT_ID,
            leaseId,
            KeyprintRegistry.Kind.MoveInScan,
            keccak256(abi.encode("move-in", leaseId))
        );
        usdc.approve(address(escrow), DEPOSIT);
        escrow.fund(leaseId, moveInId);
        vm.stopPrank();
    }

    function _endLease(bytes32 leaseId, address by) internal returns (bytes32 moveOutId) {
        vm.startPrank(by);
        moveOutId = registry.seal(
            UNIT_ID,
            leaseId,
            KeyprintRegistry.Kind.MoveOutScan,
            keccak256(abi.encode("move-out", leaseId, by, vm.getBlockTimestamp()))
        );
        escrow.endLease(leaseId, moveOutId);
        vm.stopPrank();
    }

    function _sealClaimEvidence(bytes32 leaseId, address by, uint256 salt) internal returns (bytes32) {
        vm.prank(by);
        return registry.seal(
            UNIT_ID,
            leaseId,
            KeyprintRegistry.Kind.ClaimEvidence,
            keccak256(abi.encode("claim-ev", leaseId, salt))
        );
    }

    // -------------------------------------------------------------------------
    // 1. Happy path (matches stage demo: $200 deposit, $40 accepted, $120 disputed -> withdrawn)
    // -------------------------------------------------------------------------
    function test_happyPathExactSplit() public {
        uint64 leaseEnd = uint64(block.timestamp + 10);
        (bytes32 leaseId,) = _createAndFundLease(leaseEnd);

        uint256 renterBefore = usdc.balanceOf(renter);
        uint256 landlordBefore = usdc.balanceOf(landlord);

        vm.warp(leaseEnd);
        _endLease(leaseId, renter);

        bytes32 evStain = _sealClaimEvidence(leaseId, landlord, 1);
        bytes32 evScratch = _sealClaimEvidence(leaseId, landlord, 2);

        vm.startPrank(landlord);
        uint256 cStain = escrow.fileClaim(leaseId, evStain, 40_000_000);
        uint256 cScratch = escrow.fileClaim(leaseId, evScratch, 120_000_000);
        escrow.closeClaims(leaseId);
        vm.stopPrank();

        // Renter disputes the $120 scratch; landlord withdraws it.
        vm.prank(renter);
        escrow.disputeClaim(cScratch);

        vm.prank(landlord);
        escrow.withdrawClaim(cScratch);

        // Renter accepts the $40 stain and settles.
        vm.startPrank(renter);
        escrow.acceptClaim(cStain);
        escrow.settle(leaseId);
        vm.stopPrank();

        assertEq(usdc.balanceOf(landlord) - landlordBefore, 40_000_000);
        assertEq(usdc.balanceOf(renter) - renterBefore, 160_000_000);

        KeyprintEscrow.Lease memory l = escrow.getLease(leaseId);
        assertEq(uint8(l.state), uint8(KeyprintEscrow.LeaseState.Settled));
        assertEq(l.landlordPayout, 40_000_000);
        assertEq(l.renterPayout, 160_000_000);
    }

    // -------------------------------------------------------------------------
    // 2. No claims: stranger calls settle after claim window -> renter gets 100%
    // -------------------------------------------------------------------------
    function test_noClaimsStrangerSettlesFullRefund() public {
        uint64 leaseEnd = uint64(block.timestamp + 10);
        (bytes32 leaseId,) = _createAndFundLease(leaseEnd);
        uint256 renterBefore = usdc.balanceOf(renter);

        vm.warp(leaseEnd);
        _endLease(leaseId, renter);

        // One second past claimWindow (600s)
        vm.warp(leaseEnd + 601);
        vm.prank(stranger);
        escrow.settle(leaseId);

        assertEq(usdc.balanceOf(renter) - renterBefore, DEPOSIT);
        assertEq(usdc.balanceOf(landlord), 0);
    }

    // -------------------------------------------------------------------------
    // 3. settle() revert conditions
    // -------------------------------------------------------------------------
    function test_settleRevertsWhenNotReadyOrTwice() public {
        uint64 leaseEnd = uint64(block.timestamp + 10);
        (bytes32 leaseId,) = _createAndFundLease(leaseEnd);

        // Right after fund
        vm.expectRevert(
            abi.encodeWithSelector(
                KeyprintEscrow.InvalidLeaseState.selector,
                KeyprintEscrow.LeaseState.Funded,
                KeyprintEscrow.LeaseState.Ended
            )
        );
        escrow.settle(leaseId);

        // After endLease while claim window is open and not closed
        vm.warp(leaseEnd);
        _endLease(leaseId, renter);
        vm.expectRevert(KeyprintEscrow.ClaimWindowOpen.selector);
        escrow.settle(leaseId);

        // While a claim isn't final (even after closeClaims)
        bytes32 ev = _sealClaimEvidence(leaseId, landlord, 1);
        vm.startPrank(landlord);
        uint256 claimId = escrow.fileClaim(leaseId, ev, 50_000_000);
        escrow.closeClaims(leaseId);
        vm.stopPrank();

        vm.expectRevert(abi.encodeWithSelector(KeyprintEscrow.ClaimNotFinal.selector, claimId));
        escrow.settle(leaseId);

        // Accept and settle once, then second settle must revert
        vm.prank(renter);
        escrow.acceptClaim(claimId);
        escrow.settle(leaseId);

        vm.expectRevert(
            abi.encodeWithSelector(
                KeyprintEscrow.InvalidLeaseState.selector,
                KeyprintEscrow.LeaseState.Settled,
                KeyprintEscrow.LeaseState.Ended
            )
        );
        escrow.settle(leaseId);
    }

    // -------------------------------------------------------------------------
    // 4. Exact 1-second window boundaries (claimWindow, responseWindow, resolveWindow)
    // -------------------------------------------------------------------------
    function test_exactWindowBoundaries() public {
        uint64 leaseEnd = uint64(vm.getBlockTimestamp() + 10);
        (bytes32 leaseId,) = _createAndFundLease(leaseEnd);

        vm.warp(leaseEnd);
        _endLease(leaseId, renter);
        uint64 endedAt = uint64(vm.getBlockTimestamp());

        // At exactly endedAt + claimWindow: fileClaim succeeds, settle reverts
        vm.warp(endedAt + 600);
        bytes32 ev1 = _sealClaimEvidence(leaseId, landlord, 1);
        vm.prank(landlord);
        uint256 c1 = escrow.fileClaim(leaseId, ev1, 20_000_000);
        uint64 filedAt = uint64(vm.getBlockTimestamp());

        vm.expectRevert(KeyprintEscrow.ClaimWindowOpen.selector);
        escrow.settle(leaseId);

        // One second later: fileClaim reverts, claim window is closed
        vm.warp(endedAt + 601);
        bytes32 ev2 = _sealClaimEvidence(leaseId, landlord, 2);
        vm.prank(landlord);
        vm.expectRevert(KeyprintEscrow.ClaimWindowClosed.selector);
        escrow.fileClaim(leaseId, ev2, 20_000_000);

        // At exactly filedAt + responseWindow: settle reverts, disputeClaim succeeds
        vm.warp(filedAt + 600);
        vm.expectRevert(abi.encodeWithSelector(KeyprintEscrow.ClaimNotFinal.selector, c1));
        escrow.settle(leaseId);

        vm.prank(renter);
        escrow.disputeClaim(c1);

        // Test responseWindow + 1s on a fresh lease (disputeClaim reverts, settle succeeds)
        (bytes32 leaseId2,) = _createAndFundLease(uint64(vm.getBlockTimestamp()));
        _endLease(leaseId2, renter);
        bytes32 ev3 = _sealClaimEvidence(leaseId2, landlord, 3);
        vm.startPrank(landlord);
        uint256 c2 = escrow.fileClaim(leaseId2, ev3, 25_000_000);
        escrow.closeClaims(leaseId2);
        vm.stopPrank();
        uint64 filedAt2 = uint64(vm.getBlockTimestamp());

        vm.warp(filedAt2 + 601);
        vm.prank(renter);
        vm.expectRevert(KeyprintEscrow.ResponseWindowClosed.selector);
        escrow.disputeClaim(c2);
        escrow.settle(leaseId2); // unanswered -> auto-accepted

        // Test resolveWindow exact boundary and +1s on a fresh lease
        (bytes32 leaseId3,) = _createAndFundLease(uint64(vm.getBlockTimestamp()));
        _endLease(leaseId3, renter);
        bytes32 ev4 = _sealClaimEvidence(leaseId3, landlord, 4);
        vm.startPrank(landlord);
        uint256 c3 = escrow.fileClaim(leaseId3, ev4, 30_000_000);
        escrow.closeClaims(leaseId3);
        vm.stopPrank();
        vm.prank(renter);
        escrow.disputeClaim(c3);
        uint64 disputedAt3 = uint64(vm.getBlockTimestamp());

        vm.warp(disputedAt3 + 600);
        vm.expectRevert(abi.encodeWithSelector(KeyprintEscrow.ClaimNotFinal.selector, c3));
        escrow.settle(leaseId3);

        vm.warp(disputedAt3 + 601);
        vm.prank(reviewer);
        vm.expectRevert(KeyprintEscrow.ResolveWindowClosed.selector);
        escrow.resolveClaim(c3, 15_000_000);

        escrow.settle(leaseId3);
        assertEq(escrow.getLease(leaseId3).landlordPayout, 0);
        assertEq(escrow.getLease(leaseId3).renterPayout, DEPOSIT);
    }

    function test_resolveAtExactBoundarySucceeds() public {
        uint64 leaseEnd = uint64(block.timestamp);
        (bytes32 leaseId,) = _createAndFundLease(leaseEnd);
        _endLease(leaseId, renter);
        bytes32 ev = _sealClaimEvidence(leaseId, landlord, 1);
        vm.startPrank(landlord);
        uint256 c = escrow.fileClaim(leaseId, ev, 50_000_000);
        escrow.closeClaims(leaseId);
        vm.stopPrank();
        vm.prank(renter);
        escrow.disputeClaim(c);
        uint64 disputedAt = uint64(block.timestamp);

        vm.warp(disputedAt + 600);
        vm.prank(reviewer);
        escrow.resolveClaim(c, 35_000_000);
        escrow.settle(leaseId);

        assertEq(escrow.getLease(leaseId).landlordPayout, 35_000_000);
        assertEq(escrow.getLease(leaseId).renterPayout, DEPOSIT - 35_000_000);
    }

    // -------------------------------------------------------------------------
    // 5. fileClaim adversarial revert matrix
    // -------------------------------------------------------------------------
    function test_fileClaimRevertsOnEveryBadCondition() public {
        uint64 leaseEnd = uint64(block.timestamp + 10);
        (bytes32 leaseId,) = _createAndFundLease(leaseEnd);
        (bytes32 otherLeaseId,) = _createAndFundLease(leaseEnd);

        // Seal ClaimEvidence BEFORE endLease
        bytes32 preMoveOutEv = _sealClaimEvidence(leaseId, landlord, 1);

        // Before endLease
        vm.prank(landlord);
        vm.expectRevert(
            abi.encodeWithSelector(
                KeyprintEscrow.InvalidLeaseState.selector,
                KeyprintEscrow.LeaseState.Funded,
                KeyprintEscrow.LeaseState.Ended
            )
        );
        escrow.fileClaim(leaseId, preMoveOutEv, 10_000_000);

        vm.warp(leaseEnd);
        _endLease(leaseId, renter);
        _endLease(otherLeaseId, renter);

        bytes32 validEv = _sealClaimEvidence(leaseId, landlord, 2);

        // Non-landlord
        vm.prank(renter);
        vm.expectRevert(KeyprintEscrow.Unauthorized.selector);
        escrow.fileClaim(leaseId, validEv, 10_000_000);

        // Evidence sealed before endLease
        vm.prank(landlord);
        vm.expectRevert(KeyprintEscrow.InvalidEvidence.selector);
        escrow.fileClaim(leaseId, preMoveOutEv, 10_000_000);

        // Wrong kind (Pin instead of ClaimEvidence)
        vm.prank(landlord);
        bytes32 wrongKindEv = registry.seal(
            UNIT_ID,
            leaseId,
            KeyprintRegistry.Kind.Pin,
            keccak256("wrong-kind")
        );
        vm.prank(landlord);
        vm.expectRevert(KeyprintEscrow.InvalidEvidence.selector);
        escrow.fileClaim(leaseId, wrongKindEv, 10_000_000);

        // Sealed by renter
        bytes32 renterEv = _sealClaimEvidence(leaseId, renter, 3);
        vm.prank(landlord);
        vm.expectRevert(KeyprintEscrow.InvalidEvidence.selector);
        escrow.fileClaim(leaseId, renterEv, 10_000_000);

        // From another lease
        bytes32 otherLeaseEv = _sealClaimEvidence(otherLeaseId, landlord, 4);
        vm.prank(landlord);
        vm.expectRevert(KeyprintEscrow.InvalidEvidence.selector);
        escrow.fileClaim(leaseId, otherLeaseEv, 10_000_000);

        // Under 1 USDC
        vm.prank(landlord);
        vm.expectRevert(KeyprintEscrow.ClaimAmountTooSmall.selector);
        escrow.fileClaim(leaseId, validEv, 999_999);

        // Exceeds deposit
        vm.prank(landlord);
        vm.expectRevert(KeyprintEscrow.ClaimsExceedDeposit.selector);
        escrow.fileClaim(leaseId, validEv, DEPOSIT + 1);

        // Valid claim, then reusing same evidence reverts
        vm.prank(landlord);
        escrow.fileClaim(leaseId, validEv, 5_000_000);

        vm.prank(landlord);
        vm.expectRevert(
            abi.encodeWithSelector(KeyprintEscrow.EvidenceAlreadyUsed.selector, validEv)
        );
        escrow.fileClaim(leaseId, validEv, 5_000_000);

        // Fill up to 20 claims, then 21st reverts
        for (uint256 i = 1; i < 20; i++) {
            bytes32 ev = _sealClaimEvidence(leaseId, landlord, 100 + i);
            vm.prank(landlord);
            escrow.fileClaim(leaseId, ev, 1_000_000);
        }
        bytes32 ev21 = _sealClaimEvidence(leaseId, landlord, 200);
        vm.prank(landlord);
        vm.expectRevert(KeyprintEscrow.TooManyClaims.selector);
        escrow.fileClaim(leaseId, ev21, 1_000_000);

        // After closeClaims reverts on otherLeaseId
        vm.startPrank(landlord);
        escrow.closeClaims(otherLeaseId);
        vm.expectRevert(KeyprintEscrow.ClaimsAlreadyClosed.selector);
        escrow.fileClaim(otherLeaseId, otherLeaseEv, 5_000_000);
        vm.stopPrank();
    }

    // -------------------------------------------------------------------------
    // 6. endLease reverts
    // -------------------------------------------------------------------------
    function test_endLeaseReverts() public {
        uint64 leaseEnd = uint64(block.timestamp + 100);
        vm.prank(landlord);
        bytes32 leaseId = escrow.createLease(_defaultTerms(leaseEnd));

        // Seal MoveOutScan BEFORE funding
        vm.prank(renter);
        bytes32 preFundMoveOut = registry.seal(
            UNIT_ID,
            leaseId,
            KeyprintRegistry.Kind.MoveOutScan,
            keccak256("pre-fund-moveout")
        );

        // Fund properly
        vm.startPrank(renter);
        bytes32 moveInId = registry.seal(
            UNIT_ID,
            leaseId,
            KeyprintRegistry.Kind.MoveInScan,
            keccak256("move-in-ok")
        );
        usdc.approve(address(escrow), DEPOSIT);
        escrow.fund(leaseId, moveInId);
        vm.stopPrank();

        // Seal valid post-funding MoveOutScan
        vm.prank(renter);
        bytes32 postFundMoveOut = registry.seal(
            UNIT_ID,
            leaseId,
            KeyprintRegistry.Kind.MoveOutScan,
            keccak256("post-fund-moveout")
        );

        // Before leaseEnd
        vm.prank(renter);
        vm.expectRevert(
            abi.encodeWithSelector(
                KeyprintEscrow.LeaseNotReachedEnd.selector,
                leaseEnd,
                uint64(block.timestamp)
            )
        );
        escrow.endLease(leaseId, postFundMoveOut);

        vm.warp(leaseEnd);

        // Stranger
        vm.prank(stranger);
        vm.expectRevert(KeyprintEscrow.Unauthorized.selector);
        escrow.endLease(leaseId, postFundMoveOut);

        // MoveOutScan sealed before funding
        vm.prank(renter);
        vm.expectRevert(KeyprintEscrow.InvalidEvidence.selector);
        escrow.endLease(leaseId, preFundMoveOut);

        // Valid endLease, then second call reverts
        vm.prank(renter);
        escrow.endLease(leaseId, postFundMoveOut);

        vm.prank(landlord);
        vm.expectRevert(
            abi.encodeWithSelector(
                KeyprintEscrow.InvalidLeaseState.selector,
                KeyprintEscrow.LeaseState.Ended,
                KeyprintEscrow.LeaseState.Funded
            )
        );
        escrow.endLease(leaseId, postFundMoveOut);
    }

    // -------------------------------------------------------------------------
    // 7. createLease & fund bad inputs
    // -------------------------------------------------------------------------
    function test_createLeaseAndFundBadInputs() public {
        KeyprintEscrow.LeaseTerms memory t = _defaultTerms(uint64(block.timestamp + 10));

        // Zero renter
        t.renter = address(0);
        vm.prank(landlord);
        vm.expectRevert(KeyprintEscrow.InvalidTerms.selector);
        escrow.createLease(t);

        // Renter == landlord
        t = _defaultTerms(uint64(block.timestamp + 10));
        t.renter = landlord;
        vm.prank(landlord);
        vm.expectRevert(KeyprintEscrow.InvalidTerms.selector);
        escrow.createLease(t);

        // Zero reviewer
        t = _defaultTerms(uint64(block.timestamp + 10));
        t.reviewer = address(0);
        vm.prank(landlord);
        vm.expectRevert(KeyprintEscrow.InvalidTerms.selector);
        escrow.createLease(t);

        // Reviewer == landlord
        t = _defaultTerms(uint64(block.timestamp + 10));
        t.reviewer = landlord;
        vm.prank(landlord);
        vm.expectRevert(KeyprintEscrow.InvalidTerms.selector);
        escrow.createLease(t);

        // Reviewer == renter
        t = _defaultTerms(uint64(block.timestamp + 10));
        t.reviewer = renter;
        vm.prank(landlord);
        vm.expectRevert(KeyprintEscrow.InvalidTerms.selector);
        escrow.createLease(t);

        // Zero deposit
        t = _defaultTerms(uint64(block.timestamp + 10));
        t.deposit = 0;
        vm.prank(landlord);
        vm.expectRevert(KeyprintEscrow.InvalidTerms.selector);
        escrow.createLease(t);

        // Window < MIN_WINDOW (test each of the four windows)
        t = _defaultTerms(uint64(block.timestamp + 10));
        t.reviewWindow = MIN_WINDOW - 1;
        vm.prank(landlord);
        vm.expectRevert(KeyprintEscrow.InvalidTerms.selector);
        escrow.createLease(t);

        t = _defaultTerms(uint64(block.timestamp + 10));
        t.claimWindow = MIN_WINDOW - 1;
        vm.prank(landlord);
        vm.expectRevert(KeyprintEscrow.InvalidTerms.selector);
        escrow.createLease(t);

        t = _defaultTerms(uint64(block.timestamp + 10));
        t.responseWindow = MIN_WINDOW - 1;
        vm.prank(landlord);
        vm.expectRevert(KeyprintEscrow.InvalidTerms.selector);
        escrow.createLease(t);

        t = _defaultTerms(uint64(block.timestamp + 10));
        t.resolveWindow = MIN_WINDOW - 1;
        vm.prank(landlord);
        vm.expectRevert(KeyprintEscrow.InvalidTerms.selector);
        escrow.createLease(t);

        // fund bad inputs
        vm.prank(landlord);
        bytes32 leaseId = escrow.createLease(_defaultTerms(uint64(block.timestamp + 10)));

        // Non-renter calls fund
        vm.prank(landlord);
        vm.expectRevert(KeyprintEscrow.Unauthorized.selector);
        escrow.fund(leaseId, keccak256("none"));

        // Wrong kind / landlord author / missing record
        vm.prank(landlord);
        bytes32 landlordMoveIn = registry.seal(
            UNIT_ID,
            leaseId,
            KeyprintRegistry.Kind.MoveInScan,
            keccak256("landlord-movein")
        );
        vm.prank(renter);
        vm.expectRevert(KeyprintEscrow.InvalidEvidence.selector);
        escrow.fund(leaseId, landlordMoveIn);

        vm.prank(renter);
        bytes32 wrongLeaseMoveIn = registry.seal(
            UNIT_ID,
            keccak256("other-lease"),
            KeyprintRegistry.Kind.MoveInScan,
            keccak256("wrong-lease-movein")
        );
        vm.prank(renter);
        vm.expectRevert(KeyprintEscrow.InvalidEvidence.selector);
        escrow.fund(leaseId, wrongLeaseMoveIn);
    }

    // -------------------------------------------------------------------------
    // 8. resolveClaim reverts
    // -------------------------------------------------------------------------
    function test_resolveClaimReverts() public {
        (bytes32 leaseId,) = _createAndFundLease(uint64(block.timestamp));
        _endLease(leaseId, renter);
        bytes32 ev = _sealClaimEvidence(leaseId, landlord, 1);

        vm.prank(landlord);
        uint256 c = escrow.fileClaim(leaseId, ev, 50_000_000);

        // Not disputed yet
        vm.prank(reviewer);
        vm.expectRevert(
            abi.encodeWithSelector(
                KeyprintEscrow.InvalidClaimState.selector,
                KeyprintEscrow.ClaimState.Pending
            )
        );
        escrow.resolveClaim(c, 25_000_000);

        vm.prank(renter);
        escrow.disputeClaim(c);

        // Non-reviewer
        vm.prank(landlord);
        vm.expectRevert(KeyprintEscrow.Unauthorized.selector);
        escrow.resolveClaim(c, 25_000_000);

        // Award > claim
        vm.prank(reviewer);
        vm.expectRevert(KeyprintEscrow.AwardExceedsClaim.selector);
        escrow.resolveClaim(c, 50_000_001);

        // Past resolve window
        vm.warp(block.timestamp + 601);
        vm.prank(reviewer);
        vm.expectRevert(KeyprintEscrow.ResolveWindowClosed.selector);
        escrow.resolveClaim(c, 25_000_000);
    }

    // -------------------------------------------------------------------------
    // 9. Silence both ways
    // -------------------------------------------------------------------------
    function test_silenceUnansweredAcceptsAndUnresolvedPaysRenter() public {
        (bytes32 leaseId,) = _createAndFundLease(uint64(block.timestamp));
        _endLease(leaseId, renter);

        bytes32 ev1 = _sealClaimEvidence(leaseId, landlord, 1);
        bytes32 ev2 = _sealClaimEvidence(leaseId, landlord, 2);

        vm.startPrank(landlord);
        uint256 cUnanswered = escrow.fileClaim(leaseId, ev1, 60_000_000);
        uint256 cUnresolved = escrow.fileClaim(leaseId, ev2, 80_000_000);
        escrow.closeClaims(leaseId);
        vm.stopPrank();

        // Renter only disputes cUnresolved and ignores cUnanswered
        vm.prank(renter);
        escrow.disputeClaim(cUnresolved);
        assertEq(uint8(escrow.getClaim(cUnanswered).state), uint8(KeyprintEscrow.ClaimState.Pending));

        // Warp past both responseWindow and resolveWindow
        vm.warp(block.timestamp + 601);
        escrow.settle(leaseId);

        KeyprintEscrow.Lease memory l = escrow.getLease(leaseId);
        // Unanswered ($60) -> landlord; unresolved dispute ($80) -> 0 (back to renter)
        assertEq(l.landlordPayout, 60_000_000);
        assertEq(l.renterPayout, 140_000_000);
    }

    // -------------------------------------------------------------------------
    // 10. Withdrawn pays 0; cannot withdraw accepted; claim fns revert after settle
    // -------------------------------------------------------------------------
    function test_withdrawAndPostSettlementGuards() public {
        (bytes32 leaseId,) = _createAndFundLease(uint64(block.timestamp));
        _endLease(leaseId, renter);

        bytes32 ev1 = _sealClaimEvidence(leaseId, landlord, 1);
        bytes32 ev2 = _sealClaimEvidence(leaseId, landlord, 2);
        vm.startPrank(landlord);
        uint256 c1 = escrow.fileClaim(leaseId, ev1, 40_000_000);
        uint256 c2 = escrow.fileClaim(leaseId, ev2, 50_000_000);
        escrow.closeClaims(leaseId);
        vm.stopPrank();

        vm.prank(renter);
        escrow.acceptClaim(c1);

        // Cannot withdraw accepted claim
        vm.prank(landlord);
        vm.expectRevert(
            abi.encodeWithSelector(
                KeyprintEscrow.InvalidClaimState.selector,
                KeyprintEscrow.ClaimState.Accepted
            )
        );
        escrow.withdrawClaim(c1);

        // Withdraw c2 -> pays 0
        vm.prank(landlord);
        escrow.withdrawClaim(c2);

        escrow.settle(leaseId);
        assertEq(escrow.getLease(leaseId).landlordPayout, 40_000_000);
        assertEq(escrow.getLease(leaseId).renterPayout, 160_000_000);

        // Every claim function reverts after settlement
        bytes32 ev3 = _sealClaimEvidence(leaseId, landlord, 3);
        vm.prank(landlord);
        vm.expectRevert(
            abi.encodeWithSelector(
                KeyprintEscrow.InvalidLeaseState.selector,
                KeyprintEscrow.LeaseState.Settled,
                KeyprintEscrow.LeaseState.Ended
            )
        );
        escrow.fileClaim(leaseId, ev3, 1_000_000);

        vm.prank(landlord);
        vm.expectRevert(
            abi.encodeWithSelector(
                KeyprintEscrow.InvalidLeaseState.selector,
                KeyprintEscrow.LeaseState.Settled,
                KeyprintEscrow.LeaseState.Ended
            )
        );
        escrow.withdrawClaim(c1);

        vm.prank(renter);
        vm.expectRevert(
            abi.encodeWithSelector(
                KeyprintEscrow.InvalidLeaseState.selector,
                KeyprintEscrow.LeaseState.Settled,
                KeyprintEscrow.LeaseState.Ended
            )
        );
        escrow.acceptClaim(c1);

        vm.prank(renter);
        vm.expectRevert(
            abi.encodeWithSelector(
                KeyprintEscrow.InvalidLeaseState.selector,
                KeyprintEscrow.LeaseState.Settled,
                KeyprintEscrow.LeaseState.Ended
            )
        );
        escrow.disputeClaim(c2);

        vm.prank(reviewer);
        vm.expectRevert(
            abi.encodeWithSelector(
                KeyprintEscrow.InvalidLeaseState.selector,
                KeyprintEscrow.LeaseState.Settled,
                KeyprintEscrow.LeaseState.Ended
            )
        );
        escrow.resolveClaim(c2, 0);
    }

    // -------------------------------------------------------------------------
    // 11. Isolation: two leases + stray USDC sent by stranger
    // -------------------------------------------------------------------------
    function test_isolationBetweenLeasesAndStrayUSDC() public {
        (bytes32 leaseA,) = _createAndFundLease(uint64(block.timestamp));
        (bytes32 leaseB,) = _createAndFundLease(uint64(block.timestamp));

        // Stranger sends 500 stray USDC straight to the escrow contract
        vm.prank(stranger);
        usdc.transfer(address(escrow), 500_000_000);

        _endLease(leaseA, renter);
        vm.prank(landlord);
        escrow.closeClaims(leaseA);

        uint256 renterBefore = usdc.balanceOf(renter);
        escrow.settle(leaseA);

        // Renter receives exactly leaseA's DEPOSIT, not stray USDC or leaseB's deposit
        assertEq(usdc.balanceOf(renter) - renterBefore, DEPOSIT);
        assertEq(uint8(escrow.getLease(leaseB).state), uint8(KeyprintEscrow.LeaseState.Funded));
        assertEq(escrow.totalEscrowedDeposits(), DEPOSIT);
        assertEq(usdc.balanceOf(address(escrow)), DEPOSIT + 500_000_000);
    }

    // -------------------------------------------------------------------------
    // 12. Rejecting transfer lands in owed[], other side still paid immediately
    // -------------------------------------------------------------------------
    function test_blockedRecipientCreditsOwedWithoutFreezingOtherParty() public {
        (bytes32 leaseId,) = _createAndFundLease(uint64(block.timestamp));
        _endLease(leaseId, renter);

        bytes32 ev = _sealClaimEvidence(leaseId, landlord, 1);
        vm.startPrank(landlord);
        uint256 c = escrow.fileClaim(leaseId, ev, 40_000_000);
        escrow.closeClaims(leaseId);
        vm.stopPrank();

        vm.prank(renter);
        escrow.acceptClaim(c);

        // Blocklist landlord before settlement
        usdc.setBlocked(landlord, true);

        uint256 renterBefore = usdc.balanceOf(renter);
        escrow.settle(leaseId);

        // Renter is still paid immediately; landlord's $40 is safely credited to owed[]
        assertEq(usdc.balanceOf(renter) - renterBefore, 160_000_000);
        assertEq(usdc.balanceOf(landlord), 0);
        assertEq(escrow.owed(landlord), 40_000_000);
        assertEq(escrow.totalOwed(), 40_000_000);

        // Once unblocked, landlord calls withdraw()
        usdc.setBlocked(landlord, false);
        vm.prank(landlord);
        escrow.withdraw();

        assertEq(usdc.balanceOf(landlord), 40_000_000);
        assertEq(escrow.owed(landlord), 0);
        assertEq(escrow.totalOwed(), 0);
    }

    // -------------------------------------------------------------------------
    // 13. Fuzz test: payouts never exceed deposit and always sum to deposit
    // -------------------------------------------------------------------------
    function testFuzz_payoutsAlwaysSumToDeposit(
        uint128 deposit,
        uint128 claim1,
        uint128 claim2,
        uint128 award2
    ) public {
        deposit = uint128(bound(deposit, 2_000_000, 100_000_000_000));
        claim1 = uint128(bound(claim1, 1_000_000, deposit - 1_000_000));
        claim2 = uint128(bound(claim2, 1_000_000, deposit - claim1));
        award2 = uint128(bound(award2, 0, claim2));

        usdc.mint(renter, deposit);

        KeyprintEscrow.LeaseTerms memory terms = _defaultTerms(uint64(block.timestamp));
        terms.deposit = deposit;

        vm.prank(landlord);
        bytes32 leaseId = escrow.createLease(terms);

        vm.startPrank(renter);
        bytes32 moveInId = registry.seal(
            UNIT_ID,
            leaseId,
            KeyprintRegistry.Kind.MoveInScan,
            keccak256(abi.encode("fuzz-in", deposit, claim1, claim2))
        );
        usdc.approve(address(escrow), deposit);
        escrow.fund(leaseId, moveInId);
        vm.stopPrank();

        _endLease(leaseId, renter);

        bytes32 ev1 = _sealClaimEvidence(leaseId, landlord, 1);
        bytes32 ev2 = _sealClaimEvidence(leaseId, landlord, 2);

        vm.startPrank(landlord);
        uint256 c1 = escrow.fileClaim(leaseId, ev1, claim1);
        uint256 c2 = escrow.fileClaim(leaseId, ev2, claim2);
        escrow.closeClaims(leaseId);
        vm.stopPrank();

        vm.startPrank(renter);
        escrow.acceptClaim(c1);
        escrow.disputeClaim(c2);
        vm.stopPrank();

        vm.prank(reviewer);
        escrow.resolveClaim(c2, award2);

        escrow.settle(leaseId);

        KeyprintEscrow.Lease memory l = escrow.getLease(leaseId);
        assertLe(l.landlordPayout, deposit);
        assertLe(l.renterPayout, deposit);
        assertEq(uint256(l.landlordPayout) + uint256(l.renterPayout), uint256(deposit));
        assertEq(l.landlordPayout, claim1 + award2);
    }
}

/// @notice Handler driving randomized multi-lease sequences for Foundry invariant testing.
contract EscrowInvariantHandler is Test {
    MockUSDC public usdc;
    KeyprintRegistry public registry;
    KeyprintEscrow public escrow;

    address public landlord = makeAddr("inv_landlord");
    address public renter = makeAddr("inv_renter");
    address public reviewer = makeAddr("inv_reviewer");
    bytes32 public constant UNIT_ID = keccak256("inv-unit");

    bytes32[] public leaseIds;
    uint256[] public claimIds;
    uint256 internal salt;

    constructor(MockUSDC _usdc, KeyprintRegistry _registry, KeyprintEscrow _escrow) {
        usdc = _usdc;
        registry = _registry;
        escrow = _escrow;
        usdc.mint(renter, 1_000_000_000_000);
    }

    function createAndFund(uint128 deposit) external {
        deposit = uint128(bound(deposit, 2_000_000, 1_000_000_000));
        KeyprintEscrow.LeaseTerms memory t = KeyprintEscrow.LeaseTerms({
            renter: renter,
            reviewer: reviewer,
            deposit: deposit,
            unitId: UNIT_ID,
            leaseEnd: uint64(block.timestamp),
            reviewWindow: 60,
            claimWindow: 60,
            responseWindow: 60,
            resolveWindow: 60
        });

        vm.prank(landlord);
        bytes32 leaseId = escrow.createLease(t);

        vm.startPrank(renter);
        bytes32 moveIn = registry.seal(
            UNIT_ID,
            leaseId,
            KeyprintRegistry.Kind.MoveInScan,
            keccak256(abi.encode("inv-in", ++salt))
        );
        usdc.approve(address(escrow), deposit);
        escrow.fund(leaseId, moveIn);
        vm.stopPrank();

        leaseIds.push(leaseId);
    }

    function endLeaseAt(uint256 idx) external {
        if (leaseIds.length == 0) return;
        bytes32 leaseId = leaseIds[idx % leaseIds.length];
        if (escrow.getLease(leaseId).state != KeyprintEscrow.LeaseState.Funded) return;

        vm.startPrank(renter);
        bytes32 moveOut = registry.seal(
            UNIT_ID,
            leaseId,
            KeyprintRegistry.Kind.MoveOutScan,
            keccak256(abi.encode("inv-out", ++salt))
        );
        escrow.endLease(leaseId, moveOut);
        vm.stopPrank();
    }

    function fileClaimAt(uint256 idx, uint128 amount) external {
        if (leaseIds.length == 0) return;
        bytes32 leaseId = leaseIds[idx % leaseIds.length];
        KeyprintEscrow.Lease memory l = escrow.getLease(leaseId);
        if (l.state != KeyprintEscrow.LeaseState.Ended || l.claimsClosed) return;
        if (block.timestamp > uint256(l.endedAt) + uint256(l.claimWindow)) return;
        if (l.deposit <= l.activeClaimedTotal) return;
        uint128 remaining = l.deposit - l.activeClaimedTotal;
        if (remaining < 1_000_000) return;

        amount = uint128(bound(amount, 1_000_000, remaining));
        vm.startPrank(landlord);
        bytes32 ev = registry.seal(
            UNIT_ID,
            leaseId,
            KeyprintRegistry.Kind.ClaimEvidence,
            keccak256(abi.encode("inv-ev", ++salt))
        );
        try escrow.fileClaim(leaseId, ev, amount) returns (uint256 cid) {
            claimIds.push(cid);
        } catch {}
        vm.stopPrank();
    }

    function acceptOrDispute(uint256 idx, bool doDispute) external {
        if (claimIds.length == 0) return;
        uint256 cid = claimIds[idx % claimIds.length];
        vm.prank(renter);
        if (doDispute) {
            try escrow.disputeClaim(cid) {} catch {}
        } else {
            try escrow.acceptClaim(cid) {} catch {}
        }
    }

    function resolveAt(uint256 idx, uint128 awarded) external {
        if (claimIds.length == 0) return;
        uint256 cid = claimIds[idx % claimIds.length];
        KeyprintEscrow.Claim memory c = escrow.getClaim(cid);
        if (c.state != KeyprintEscrow.ClaimState.Disputed) return;
        awarded = uint128(bound(awarded, 0, c.amount));
        vm.prank(reviewer);
        try escrow.resolveClaim(cid, awarded) {} catch {}
    }

    function warpAndSettle(uint256 idx, uint64 dt) external {
        if (leaseIds.length == 0) return;
        dt = uint64(bound(dt, 0, 1200));
        vm.warp(block.timestamp + dt);
        bytes32 leaseId = leaseIds[idx % leaseIds.length];
        try escrow.settle(leaseId) {} catch {}
    }

    function leaseCount() external view returns (uint256) {
        return leaseIds.length;
    }
}

contract KeyprintEscrowInvariantTest is StdInvariant, Test {
    MockUSDC internal usdc;
    KeyprintRegistry internal registry;
    KeyprintEscrow internal escrow;
    EscrowInvariantHandler internal handler;

    function setUp() public {
        vm.warp(1_763_600_000);
        usdc = new MockUSDC();
        registry = new KeyprintRegistry();
        escrow = new KeyprintEscrow(address(usdc), address(registry), 60);
        handler = new EscrowInvariantHandler(usdc, registry, escrow);
        targetContract(address(handler));
    }

    /// @notice Escrow USDC balance always covers funded unsettled deposits plus owed[].
    function invariant_solvencyCoversEscrowedDepositsPlusOwed() public view {
        assertGe(
            usdc.balanceOf(address(escrow)),
            escrow.totalEscrowedDeposits() + escrow.totalOwed()
        );
    }

    /// @notice Every settled lease has payouts <= deposit summing exactly to deposit.
    function invariant_settledLeasePayoutsSumToDeposit() public view {
        uint256 count = handler.leaseCount();
        for (uint256 i = 0; i < count; i++) {
            bytes32 leaseId = handler.leaseIds(i);
            KeyprintEscrow.Lease memory l = escrow.getLease(leaseId);
            if (l.state == KeyprintEscrow.LeaseState.Settled) {
                assertLe(l.landlordPayout, l.deposit);
                assertLe(l.renterPayout, l.deposit);
                assertEq(
                    uint256(l.landlordPayout) + uint256(l.renterPayout),
                    uint256(l.deposit)
                );
            }
        }
    }
}
