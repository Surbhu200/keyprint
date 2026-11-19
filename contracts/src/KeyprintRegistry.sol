// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title KeyprintRegistry
/// @notice Immutable, ownerless onchain evidence log for Keyprint scans, pins,
///         alignments, AI reports, and claim evidence manifests.
/// @dev Solo mode only needs this contract; no landlord or deposit is required.
contract KeyprintRegistry {
    enum Kind {
        MoveInScan,
        Pin,
        MoveOutScan,
        Alignment,
        Report,
        ClaimEvidence
    }

    struct Record {
        bytes32 unitId;
        bytes32 leaseId;
        Kind kind;
        bytes32 contentHash;
        address author;
        uint64 createdAt;
        uint64 createdSeq;
    }

    /// @notice Monotonic seal counter (starts at 1) to guarantee strict ordering
    ///         even across sub-second blocks sharing identical timestamps on Arc.
    uint64 public nextSeq = 1;

    /// @notice Record storage keyed by deterministic recordId.
    mapping(bytes32 => Record) private _records;

    /// @notice Onchain co-sign timestamps: recordId => account => timestamp (0 if not acknowledged).
    mapping(bytes32 => mapping(address => uint64)) public acknowledgedAt;

    event RecordSealed(
        bytes32 indexed recordId,
        bytes32 indexed unitId,
        bytes32 indexed leaseId,
        Kind kind,
        bytes32 contentHash,
        address author,
        uint64 timestamp
    );
    event RecordAcknowledged(bytes32 indexed recordId, address indexed by, uint64 timestamp);
    event RecordContested(
        bytes32 indexed recordId,
        address indexed by,
        bytes32 noteHash,
        uint64 timestamp
    );

    error InvalidContentHash();
    error InvalidNoteHash();
    error RecordAlreadyExists(bytes32 recordId);
    error RecordNotFound(bytes32 recordId);
    error AlreadyAcknowledged(bytes32 recordId, address by);

    /// @notice Deterministically computes a record ID matching client-side viem encoding.
    function computeRecordId(
        address author,
        bytes32 contentHash,
        Kind kind
    ) public pure returns (bytes32) {
        return keccak256(abi.encode(author, contentHash, uint8(kind)));
    }

    /// @notice Seals a manifest's SHA-256 hash onchain. Reverts if the recordId already exists.
    function seal(
        bytes32 unitId,
        bytes32 leaseId,
        Kind kind,
        bytes32 contentHash
    ) external returns (bytes32 recordId) {
        if (contentHash == bytes32(0)) revert InvalidContentHash();

        recordId = computeRecordId(msg.sender, contentHash, kind);
        if (_records[recordId].author != address(0)) {
            revert RecordAlreadyExists(recordId);
        }

        uint64 ts = uint64(block.timestamp);
        uint64 seq = nextSeq++;

        _records[recordId] = Record({
            unitId: unitId,
            leaseId: leaseId,
            kind: kind,
            contentHash: contentHash,
            author: msg.sender,
            createdAt: ts,
            createdSeq: seq
        });

        emit RecordSealed(recordId, unitId, leaseId, kind, contentHash, msg.sender, ts);
    }

    /// @notice Co-signs an existing record. Stored in state so apps read co-signs directly.
    function acknowledge(bytes32 recordId) external {
        if (_records[recordId].author == address(0)) revert RecordNotFound(recordId);
        if (acknowledgedAt[recordId][msg.sender] != 0) {
            revert AlreadyAcknowledged(recordId, msg.sender);
        }

        uint64 ts = uint64(block.timestamp);
        acknowledgedAt[recordId][msg.sender] = ts;

        emit RecordAcknowledged(recordId, msg.sender, ts);
    }

    /// @notice Contests an existing record with the hash of a counter-note / counter-pin.
    function contest(bytes32 recordId, bytes32 noteHash) external {
        if (_records[recordId].author == address(0)) revert RecordNotFound(recordId);
        if (noteHash == bytes32(0)) revert InvalidNoteHash();

        uint64 ts = uint64(block.timestamp);
        emit RecordContested(recordId, msg.sender, noteHash, ts);
    }

    /// @notice Returns the stored Record struct (author == address(0) if not found).
    function getRecord(bytes32 recordId) external view returns (Record memory) {
        return _records[recordId];
    }

    /// @notice Returns true if recordId has been sealed.
    function exists(bytes32 recordId) external view returns (bool) {
        return _records[recordId].author != address(0);
    }
}
