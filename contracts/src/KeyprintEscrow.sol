// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {KeyprintRegistry} from "./KeyprintRegistry.sol";

/// @title KeyprintEscrow
/// @notice Ownerless, non-upgradeable security deposit escrow on Arc holding 6-decimal ERC-20 USDC.
/// @dev Enforces move-in/move-out evidence checks, priced-pin claim windows, two-sided silence rules,
///      reviewer dispute resolution, permissionless settlement, and non-blocking payouts via owed[].
contract KeyprintEscrow is ReentrancyGuard {
    using SafeERC20 for IERC20;

    /// @notice Minimum single claim amount: 1 USDC in 6-decimal ERC-20 units.
    uint128 public constant MIN_CLAIM_AMOUNT = 1_000_000;

    /// @notice Maximum number of claims allowed per lease.
    uint256 public constant MAX_CLAIMS_PER_LEASE = 20;

    IERC20 public immutable usdc;
    KeyprintRegistry public immutable registry;
    uint64 public immutable MIN_WINDOW;

    enum LeaseState {
        Created,
        Funded,
        Ended,
        Settled
    }

    enum ClaimState {
        Pending,
        Accepted,
        Disputed,
        Resolved,
        Withdrawn
    }

    struct LeaseTerms {
        address renter;
        address reviewer;
        uint128 deposit;
        bytes32 unitId;
        uint64 leaseEnd;
        uint64 reviewWindow;
        uint64 claimWindow;
        uint64 responseWindow;
        uint64 resolveWindow;
    }

    struct Lease {
        bytes32 leaseId;
        address landlord;
        address renter;
        address reviewer;
        uint128 deposit;
        bytes32 unitId;
        uint64 leaseEnd;
        uint64 reviewWindow;
        uint64 claimWindow;
        uint64 responseWindow;
        uint64 resolveWindow;
        LeaseState state;
        bytes32 moveInRecordId;
        bytes32 moveOutRecordId;
        uint64 fundedAt;
        uint64 fundedRegistrySeq;
        uint64 endedAt;
        uint64 endedRegistrySeq;
        bool claimsClosed;
        uint128 activeClaimedTotal;
        uint128 landlordPayout;
        uint128 renterPayout;
    }

    struct Claim {
        uint256 claimId;
        bytes32 leaseId;
        bytes32 evidenceRecordId;
        uint128 amount;
        uint128 awarded;
        uint64 filedAt;
        uint64 disputedAt;
        ClaimState state;
    }

    uint256 public leaseNonce;
    uint256 public nextClaimId;

    /// @notice Stored accounting totals (never derived from usdc.balanceOf).
    uint256 public totalEscrowedDeposits;
    uint256 public totalOwed;

    mapping(bytes32 => Lease) private _leases;
    mapping(uint256 => Claim) private _claims;
    mapping(bytes32 => uint256[]) private _leaseClaimIds;

    /// @notice Prevents reusing a ClaimEvidence record across claims.
    mapping(bytes32 => bool) public usedEvidence;

    /// @notice Fallback balances credited if a USDC payout transfer fails (e.g. blocklisted address).
    mapping(address => uint256) public owed;

    event LeaseCreated(
        bytes32 indexed leaseId,
        address indexed landlord,
        address indexed renter,
        address reviewer,
        uint128 deposit,
        bytes32 unitId,
        uint64 leaseEnd
    );
    event LeaseFunded(
        bytes32 indexed leaseId,
        address indexed renter,
        bytes32 moveInRecordId,
        uint128 deposit,
        uint64 fundedAt
    );
    event LeaseEnded(
        bytes32 indexed leaseId,
        address indexed by,
        bytes32 moveOutRecordId,
        uint64 endedAt
    );
    event ClaimFiled(
        bytes32 indexed leaseId,
        uint256 indexed claimId,
        bytes32 evidenceRecordId,
        uint128 amount,
        uint64 filedAt
    );
    event ClaimsClosed(bytes32 indexed leaseId, uint64 closedAt);
    event ClaimWithdrawn(bytes32 indexed leaseId, uint256 indexed claimId, uint64 timestamp);
    event ClaimAccepted(
        bytes32 indexed leaseId,
        uint256 indexed claimId,
        uint128 amount,
        uint64 timestamp
    );
    event ClaimDisputed(bytes32 indexed leaseId, uint256 indexed claimId, uint64 disputedAt);
    event ClaimResolved(
        bytes32 indexed leaseId,
        uint256 indexed claimId,
        address indexed reviewer,
        uint128 awarded,
        uint64 timestamp
    );
    event LeaseSettled(
        bytes32 indexed leaseId,
        address indexed caller,
        uint128 landlordPayout,
        uint128 renterPayout,
        uint64 timestamp
    );
    event PayoutSent(bytes32 indexed leaseId, address indexed to, uint128 amount);
    event PayoutCredited(bytes32 indexed leaseId, address indexed to, uint128 amount);
    event OwedWithdrawn(address indexed to, uint256 amount);

    error InvalidAddress();
    error InvalidMinWindow();
    error InvalidTerms();
    error LeaseNotFound(bytes32 leaseId);
    error ClaimNotFound(uint256 claimId);
    error Unauthorized();
    error InvalidLeaseState(LeaseState current, LeaseState expected);
    error LeaseNotReachedEnd(uint64 leaseEnd, uint64 currentTime);
    error InvalidEvidence();
    error EvidenceAlreadyUsed(bytes32 evidenceRecordId);
    error ClaimsAlreadyClosed();
    error ClaimWindowClosed();
    error ClaimWindowOpen();
    error ClaimAmountTooSmall();
    error TooManyClaims();
    error ClaimsExceedDeposit();
    error InvalidClaimState(ClaimState current);
    error ResponseWindowClosed();
    error ResolveWindowClosed();
    error AwardExceedsClaim();
    error ClaimNotFinal(uint256 claimId);
    error NothingOwed();

    constructor(address _usdc, address _registry, uint64 _minWindow) {
        if (_usdc == address(0) || _registry == address(0)) revert InvalidAddress();
        if (_minWindow == 0) revert InvalidMinWindow();
        usdc = IERC20(_usdc);
        registry = KeyprintRegistry(_registry);
        MIN_WINDOW = _minWindow;
    }

    /// @notice Landlord creates a lease with explicit deposit, deadlines, and reviewer terms.
    function createLease(LeaseTerms calldata terms) external returns (bytes32 leaseId) {
        if (terms.renter == address(0) || terms.renter == msg.sender) revert InvalidTerms();
        if (
            terms.reviewer == address(0) ||
            terms.reviewer == msg.sender ||
            terms.reviewer == terms.renter
        ) revert InvalidTerms();
        if (terms.deposit == 0) revert InvalidTerms();
        if (terms.leaseEnd == 0) revert InvalidTerms();
        if (
            terms.reviewWindow < MIN_WINDOW ||
            terms.claimWindow < MIN_WINDOW ||
            terms.responseWindow < MIN_WINDOW ||
            terms.resolveWindow < MIN_WINDOW
        ) revert InvalidTerms();

        leaseId = keccak256(abi.encode(msg.sender, terms, ++leaseNonce));

        _leases[leaseId] = Lease({
            leaseId: leaseId,
            landlord: msg.sender,
            renter: terms.renter,
            reviewer: terms.reviewer,
            deposit: terms.deposit,
            unitId: terms.unitId,
            leaseEnd: terms.leaseEnd,
            reviewWindow: terms.reviewWindow,
            claimWindow: terms.claimWindow,
            responseWindow: terms.responseWindow,
            resolveWindow: terms.resolveWindow,
            state: LeaseState.Created,
            moveInRecordId: bytes32(0),
            moveOutRecordId: bytes32(0),
            fundedAt: 0,
            fundedRegistrySeq: 0,
            endedAt: 0,
            endedRegistrySeq: 0,
            claimsClosed: false,
            activeClaimedTotal: 0,
            landlordPayout: 0,
            renterPayout: 0
        });

        emit LeaseCreated(
            leaseId,
            msg.sender,
            terms.renter,
            terms.reviewer,
            terms.deposit,
            terms.unitId,
            terms.leaseEnd
        );
    }

    /// @notice Renter funds the deposit, accepting all terms, linked to a sealed MoveInScan.
    function fund(bytes32 leaseId, bytes32 moveInRecordId) external nonReentrant {
        Lease storage lease = _getLeaseStorage(leaseId);
        if (msg.sender != lease.renter) revert Unauthorized();
        if (lease.state != LeaseState.Created) {
            revert InvalidLeaseState(lease.state, LeaseState.Created);
        }

        KeyprintRegistry.Record memory rec = registry.getRecord(moveInRecordId);
        if (
            rec.author != lease.renter ||
            rec.kind != KeyprintRegistry.Kind.MoveInScan ||
            rec.leaseId != leaseId
        ) revert InvalidEvidence();

        uint64 nowTs = uint64(block.timestamp);
        lease.state = LeaseState.Funded;
        lease.moveInRecordId = moveInRecordId;
        lease.fundedAt = nowTs;
        lease.fundedRegistrySeq = registry.nextSeq();
        totalEscrowedDeposits += lease.deposit;

        usdc.safeTransferFrom(msg.sender, address(this), lease.deposit);

        emit LeaseFunded(leaseId, msg.sender, moveInRecordId, lease.deposit, nowTs);
    }

    /// @notice Renter or landlord ends the lease on or after leaseEnd with a post-funding MoveOutScan.
    function endLease(bytes32 leaseId, bytes32 moveOutRecordId) external {
        Lease storage lease = _getLeaseStorage(leaseId);
        if (msg.sender != lease.renter && msg.sender != lease.landlord) {
            revert Unauthorized();
        }
        if (lease.state != LeaseState.Funded) {
            revert InvalidLeaseState(lease.state, LeaseState.Funded);
        }
        if (block.timestamp < lease.leaseEnd) {
            revert LeaseNotReachedEnd(lease.leaseEnd, uint64(block.timestamp));
        }

        KeyprintRegistry.Record memory rec = registry.getRecord(moveOutRecordId);
        if (
            rec.author == address(0) ||
            (rec.author != lease.renter && rec.author != lease.landlord) ||
            rec.kind != KeyprintRegistry.Kind.MoveOutScan ||
            rec.leaseId != leaseId ||
            rec.createdSeq < lease.fundedRegistrySeq ||
            rec.createdAt < lease.fundedAt
        ) revert InvalidEvidence();

        uint64 nowTs = uint64(block.timestamp);
        lease.state = LeaseState.Ended;
        lease.moveOutRecordId = moveOutRecordId;
        lease.endedAt = nowTs;
        lease.endedRegistrySeq = registry.nextSeq();

        emit LeaseEnded(leaseId, msg.sender, moveOutRecordId, nowTs);
    }

    /// @notice Landlord files an evidence-backed claim within the claim window.
    function fileClaim(
        bytes32 leaseId,
        bytes32 evidenceRecordId,
        uint128 amount
    ) external returns (uint256 claimId) {
        Lease storage lease = _getLeaseStorage(leaseId);
        if (msg.sender != lease.landlord) revert Unauthorized();
        if (lease.state != LeaseState.Ended) {
            revert InvalidLeaseState(lease.state, LeaseState.Ended);
        }
        if (lease.claimsClosed) revert ClaimsAlreadyClosed();
        if (block.timestamp > uint256(lease.endedAt) + uint256(lease.claimWindow)) {
            revert ClaimWindowClosed();
        }
        if (amount < MIN_CLAIM_AMOUNT) revert ClaimAmountTooSmall();
        if (_leaseClaimIds[leaseId].length >= MAX_CLAIMS_PER_LEASE) revert TooManyClaims();
        if (uint256(lease.activeClaimedTotal) + uint256(amount) > uint256(lease.deposit)) {
            revert ClaimsExceedDeposit();
        }
        if (usedEvidence[evidenceRecordId]) revert EvidenceAlreadyUsed(evidenceRecordId);

        KeyprintRegistry.Record memory rec = registry.getRecord(evidenceRecordId);
        if (
            rec.author != lease.landlord ||
            rec.kind != KeyprintRegistry.Kind.ClaimEvidence ||
            rec.leaseId != leaseId ||
            rec.createdSeq < lease.endedRegistrySeq ||
            rec.createdAt < lease.endedAt
        ) revert InvalidEvidence();

        usedEvidence[evidenceRecordId] = true;
        lease.activeClaimedTotal += amount;

        claimId = ++nextClaimId;
        uint64 nowTs = uint64(block.timestamp);

        _claims[claimId] = Claim({
            claimId: claimId,
            leaseId: leaseId,
            evidenceRecordId: evidenceRecordId,
            amount: amount,
            awarded: 0,
            filedAt: nowTs,
            disputedAt: 0,
            state: ClaimState.Pending
        });
        _leaseClaimIds[leaseId].push(claimId);

        emit ClaimFiled(leaseId, claimId, evidenceRecordId, amount, nowTs);
    }

    /// @notice Landlord closes claims early; no further claims may be filed afterwards.
    function closeClaims(bytes32 leaseId) external {
        Lease storage lease = _getLeaseStorage(leaseId);
        if (msg.sender != lease.landlord) revert Unauthorized();
        if (lease.state != LeaseState.Ended) {
            revert InvalidLeaseState(lease.state, LeaseState.Ended);
        }
        if (lease.claimsClosed) revert ClaimsAlreadyClosed();

        lease.claimsClosed = true;
        emit ClaimsClosed(leaseId, uint64(block.timestamp));
    }

    /// @notice Landlord withdraws a claim unless already accepted, resolved, withdrawn, or timed out.
    function withdrawClaim(uint256 claimId) external {
        Claim storage claim = _getClaimStorage(claimId);
        Lease storage lease = _getLeaseStorage(claim.leaseId);
        if (msg.sender != lease.landlord) revert Unauthorized();
        if (lease.state != LeaseState.Ended) {
            revert InvalidLeaseState(lease.state, LeaseState.Ended);
        }

        if (claim.state == ClaimState.Pending) {
            if (block.timestamp > uint256(claim.filedAt) + uint256(lease.responseWindow)) {
                revert InvalidClaimState(claim.state);
            }
        } else if (claim.state == ClaimState.Disputed) {
            if (block.timestamp > uint256(claim.disputedAt) + uint256(lease.resolveWindow)) {
                revert InvalidClaimState(claim.state);
            }
        } else {
            revert InvalidClaimState(claim.state);
        }

        claim.state = ClaimState.Withdrawn;
        lease.activeClaimedTotal -= claim.amount;

        emit ClaimWithdrawn(claim.leaseId, claimId, uint64(block.timestamp));
    }

    /// @notice Renter accepts a pending (or active disputed) claim.
    function acceptClaim(uint256 claimId) external {
        Claim storage claim = _getClaimStorage(claimId);
        Lease storage lease = _getLeaseStorage(claim.leaseId);
        if (msg.sender != lease.renter) revert Unauthorized();
        if (lease.state != LeaseState.Ended) {
            revert InvalidLeaseState(lease.state, LeaseState.Ended);
        }

        if (claim.state == ClaimState.Pending) {
            // Accepting before or after responseWindow yields the same accepted outcome.
        } else if (claim.state == ClaimState.Disputed) {
            if (block.timestamp > uint256(claim.disputedAt) + uint256(lease.resolveWindow)) {
                revert InvalidClaimState(claim.state);
            }
        } else {
            revert InvalidClaimState(claim.state);
        }

        claim.state = ClaimState.Accepted;
        claim.awarded = claim.amount;

        emit ClaimAccepted(claim.leaseId, claimId, claim.amount, uint64(block.timestamp));
    }

    /// @notice Renter disputes a pending claim within the response window.
    function disputeClaim(uint256 claimId) external {
        Claim storage claim = _getClaimStorage(claimId);
        Lease storage lease = _getLeaseStorage(claim.leaseId);
        if (msg.sender != lease.renter) revert Unauthorized();
        if (lease.state != LeaseState.Ended) {
            revert InvalidLeaseState(lease.state, LeaseState.Ended);
        }
        if (claim.state != ClaimState.Pending) {
            revert InvalidClaimState(claim.state);
        }
        if (block.timestamp > uint256(claim.filedAt) + uint256(lease.responseWindow)) {
            revert ResponseWindowClosed();
        }

        uint64 nowTs = uint64(block.timestamp);
        claim.state = ClaimState.Disputed;
        claim.disputedAt = nowTs;

        emit ClaimDisputed(claim.leaseId, claimId, nowTs);
    }

    /// @notice Named reviewer resolves a disputed claim within the resolve window.
    function resolveClaim(uint256 claimId, uint128 awarded) external {
        Claim storage claim = _getClaimStorage(claimId);
        Lease storage lease = _getLeaseStorage(claim.leaseId);
        if (msg.sender != lease.reviewer) revert Unauthorized();
        if (lease.state != LeaseState.Ended) {
            revert InvalidLeaseState(lease.state, LeaseState.Ended);
        }
        if (claim.state != ClaimState.Disputed) {
            revert InvalidClaimState(claim.state);
        }
        if (block.timestamp > uint256(claim.disputedAt) + uint256(lease.resolveWindow)) {
            revert ResolveWindowClosed();
        }
        if (awarded > claim.amount) revert AwardExceedsClaim();

        claim.awarded = awarded;
        claim.state = ClaimState.Resolved;

        emit ClaimResolved(claim.leaseId, claimId, msg.sender, awarded, uint64(block.timestamp));
    }

    /// @notice Permissionless one-shot settlement once claims are closed and every claim is final.
    function settle(bytes32 leaseId) external nonReentrant {
        Lease storage lease = _getLeaseStorage(leaseId);
        if (lease.state != LeaseState.Ended) {
            revert InvalidLeaseState(lease.state, LeaseState.Ended);
        }

        bool claimsAreClosed = lease.claimsClosed ||
            block.timestamp > uint256(lease.endedAt) + uint256(lease.claimWindow);
        if (!claimsAreClosed) revert ClaimWindowOpen();

        uint256[] storage ids = _leaseClaimIds[leaseId];
        uint256 landlordTotal = 0;

        for (uint256 i = 0; i < ids.length; i++) {
            Claim storage c = _claims[ids[i]];
            if (c.state == ClaimState.Withdrawn) {
                continue;
            } else if (c.state == ClaimState.Accepted) {
                landlordTotal += c.amount;
            } else if (c.state == ClaimState.Resolved) {
                landlordTotal += c.awarded;
            } else if (c.state == ClaimState.Pending) {
                if (block.timestamp <= uint256(c.filedAt) + uint256(lease.responseWindow)) {
                    revert ClaimNotFinal(c.claimId);
                }
                landlordTotal += c.amount;
            } else if (c.state == ClaimState.Disputed) {
                if (block.timestamp <= uint256(c.disputedAt) + uint256(lease.resolveWindow)) {
                    revert ClaimNotFinal(c.claimId);
                }
                // Unresolved dispute past resolveWindow defaults to 0 (goes back to renter).
            }
        }

        uint128 landlordPayout = uint128(landlordTotal);
        uint128 renterPayout = lease.deposit - landlordPayout;

        // Effects before external interactions.
        lease.state = LeaseState.Settled;
        lease.landlordPayout = landlordPayout;
        lease.renterPayout = renterPayout;
        totalEscrowedDeposits -= lease.deposit;

        _tryTransferOrCredit(leaseId, lease.landlord, landlordPayout);
        _tryTransferOrCredit(leaseId, lease.renter, renterPayout);

        emit LeaseSettled(
            leaseId,
            msg.sender,
            landlordPayout,
            renterPayout,
            uint64(block.timestamp)
        );
    }

    /// @notice Collects any payout previously credited to owed[msg.sender] after a failed transfer.
    function withdraw() external nonReentrant {
        uint256 amount = owed[msg.sender];
        if (amount == 0) revert NothingOwed();

        owed[msg.sender] = 0;
        totalOwed -= amount;

        usdc.safeTransfer(msg.sender, amount);
        emit OwedWithdrawn(msg.sender, amount);
    }

    function getLease(bytes32 leaseId) external view returns (Lease memory) {
        return _leases[leaseId];
    }

    function getClaim(uint256 claimId) external view returns (Claim memory) {
        return _claims[claimId];
    }

    function getClaims(bytes32 leaseId) external view returns (Claim[] memory result) {
        uint256[] storage ids = _leaseClaimIds[leaseId];
        result = new Claim[](ids.length);
        for (uint256 i = 0; i < ids.length; i++) {
            result[i] = _claims[ids[i]];
        }
    }

    function _getLeaseStorage(bytes32 leaseId) private view returns (Lease storage lease) {
        lease = _leases[leaseId];
        if (lease.landlord == address(0)) revert LeaseNotFound(leaseId);
    }

    function _getClaimStorage(uint256 claimId) private view returns (Claim storage claim) {
        claim = _claims[claimId];
        if (claim.claimId == 0) revert ClaimNotFound(claimId);
    }

    /// @dev Attempts an ERC-20 transfer without letting a recipient blocklist/revert block settle().
    function _tryTransferOrCredit(bytes32 leaseId, address to, uint128 amount) private {
        if (amount == 0) return;

        (bool ok, bytes memory ret) = address(usdc).call(
            abi.encodeWithSelector(IERC20.transfer.selector, to, uint256(amount))
        );
        bool succeeded = ok && (ret.length == 0 || abi.decode(ret, (bool)));

        if (succeeded) {
            emit PayoutSent(leaseId, to, amount);
        } else {
            owed[to] += amount;
            totalOwed += amount;
            emit PayoutCredited(leaseId, to, amount);
        }
    }
}
