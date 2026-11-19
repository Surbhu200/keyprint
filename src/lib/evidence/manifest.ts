import canonicalize from "canonicalize";
import type { Address, Hex } from "viem";
import {
  computeRecordId,
  createArcPublicClient,
  getEscrowAddress,
  getRegistryAddress,
  KEYPRINT_ESCROW_ABI,
  KEYPRINT_REGISTRY_ABI,
  RecordKind,
  type RecordKindValue,
} from "../chain/arc";
import { sha256Blob, sha256HexToBytes32, sha256Text } from "./hash";

export const ZERO_BYTES32 =
  "0x0000000000000000000000000000000000000000000000000000000000000000" as Hex;

export interface ManifestFileEntry {
  role: "model" | "photo" | "video";
  sha256: string;
  bytes: number;
  mime: string;
  name?: string;
}

export interface EvidenceManifestV1 {
  type: "keyprint.evidence.v1";
  leaseId: Hex;
  unitId: Hex;
  kind: "MoveInScan" | "MoveOutScan";
  files: ManifestFileEntry[];
  capturedAtClient: string;
  app: string;
}

export interface PinManifestV1 {
  type: "keyprint.pin.v1";
  leaseId: Hex;
  scanRecordId: Hex;
  position: [number, number, number];
  normal: [number, number, number];
  text: string;
  photoSha256: string | null;
  author: Address;
}

export interface ClaimManifestV1 {
  type: "keyprint.claim.v1";
  leaseId: Hex;
  alignmentRecordId: Hex;
  position: [number, number, number];
  normal: [number, number, number];
  amount: string; // 6-decimal USDC string units
  title: string;
  photoSha256: string | null;
}

export interface AlignmentManifestV1 {
  type: "keyprint.alignment.v1";
  leaseId: Hex;
  moveInRecordId: Hex;
  moveOutRecordId: Hex;
  label: "maps move-out coordinates to move-in coordinates";
  matrix: number[]; // 16 column-major entries
  scale: number;
  floorTiltDeg: number;
  medianGapMeters: number;
  shareWithin5cm: number;
}

export interface ReportManifestV1 {
  type: "keyprint.report.v1";
  leaseId: Hex;
  moveInRecordId: Hex;
  moveOutRecordId: Hex;
  promptVersion: string;
  viewIds: string[];
  /** Where the suggestions came from: "live" model run, "cache" of an earlier run, or "manual". */
  source?: string;
  changes: Array<{
    view_id: string;
    box: { x: number; y: number; w: number; h: number };
    title: string;
    description: string;
    category: "possible_damage" | "possible_wear" | "not_a_real_change";
    confidence: "low" | "medium" | "high";
    worldPosition?: [number, number, number];
    matchedMoveInPinId?: string | null;
    /** Who produced this item: the AI, or a person who added it by hand. */
    origin?: "ai" | "manual";
    /** What the people reviewing it decided. Dismissed items stay in the sealed record. */
    reviewState?: "pending" | "confirmed" | "dismissed";
  }>;
}

export type KeyprintManifest =
  | EvidenceManifestV1
  | PinManifestV1
  | ClaimManifestV1
  | AlignmentManifestV1
  | ReportManifestV1;

export function manifestKindToEnum(manifest: KeyprintManifest): RecordKindValue {
  switch (manifest.type) {
    case "keyprint.evidence.v1":
      return manifest.kind === "MoveOutScan"
        ? RecordKind.MoveOutScan
        : RecordKind.MoveInScan;
    case "keyprint.pin.v1":
      return RecordKind.Pin;
    case "keyprint.claim.v1":
      return RecordKind.ClaimEvidence;
    case "keyprint.alignment.v1":
      return RecordKind.Alignment;
    case "keyprint.report.v1":
      return RecordKind.Report;
  }
}

/**
 * Produces exact RFC 8785 canonical JSON bytes + its 32-byte SHA-256 contentHash.
 * Always store `canonicalJson` verbatim as manifest.json — never rebuild from DB columns.
 */
export async function canonicalizeAndHash(
  manifest: KeyprintManifest,
): Promise<{ canonicalJson: string; sha256Hex: string; contentHash: Hex }> {
  const canonicalJson = canonicalize(manifest);
  if (!canonicalJson) {
    throw new Error("Failed to canonicalize manifest JSON (RFC 8785).");
  }
  const sha256Hex = await sha256Text(canonicalJson);
  return {
    canonicalJson,
    sha256Hex,
    contentHash: sha256HexToBytes32(sha256Hex),
  };
}

export interface VerificationResult {
  valid: boolean;
  reason: string;
  fileSha256: string;
  manifestHash?: Hex;
  recordId?: Hex;
  sealedAt?: number;
  author?: Address;
  authorRole?: "renter" | "landlord" | "account";
  coSignedByLandlord?: boolean;
  coSignedAt?: number;
  isSolo?: boolean;
  leaseId?: Hex;
}

/**
 * Pure browser-side cryptographic verification against Arc Testnet (never trusts DB).
 * Checks all 4 rules from docs/BUILD.md:
 *   1. File SHA-256 is listed in manifest.json
 *   2. SHA-256 of canonical manifest bytes == KeyprintRegistry.getRecord(recordId).contentHash
 *   3. recordId == keccak256(abi.encode(author, contentHash, kind)) and author is lease's renter/landlord
 *   4. Record's leaseId and kind match the manifest
 */
export async function verifyFileAgainstArc(params: {
  file: Blob;
  manifestJson: string;
  recordId: Hex;
  onHashProgress?: (pct: number) => void;
}): Promise<VerificationResult> {
  const fileSha256 = await sha256Blob(params.file, params.onHashProgress);

  let manifest: KeyprintManifest;
  try {
    manifest = JSON.parse(params.manifestJson) as KeyprintManifest;
  } catch {
    return {
      valid: false,
      reason: "Manifest JSON could not be parsed.",
      fileSha256,
    };
  }

  // 1. Check file SHA-256 appears inside the manifest
  let fileListed = false;
  if (manifest.type === "keyprint.evidence.v1") {
    fileListed = manifest.files.some(
      (f) => f.sha256.toLowerCase() === fileSha256.toLowerCase(),
    );
  } else if (
    manifest.type === "keyprint.pin.v1" ||
    manifest.type === "keyprint.claim.v1"
  ) {
    fileListed =
      Boolean(manifest.photoSha256) &&
      manifest.photoSha256!.toLowerCase() === fileSha256.toLowerCase();
  }

  if (!fileListed) {
    return {
      valid: false,
      reason: "This file does not match any sealed record.",
      fileSha256,
    };
  }

  const registry = getRegistryAddress();
  if (!registry) {
    return {
      valid: false,
      reason: "Registry contract address is not configured.",
      fileSha256,
    };
  }

  // 2. Hash the exact manifest bytes and read onchain record from Arc
  const manifestSha = await sha256Text(params.manifestJson);
  const manifestHash = sha256HexToBytes32(manifestSha);
  const expectedKind = manifestKindToEnum(manifest);

  const client = createArcPublicClient();
  const record = await client.readContract({
    address: registry,
    abi: KEYPRINT_REGISTRY_ABI,
    functionName: "getRecord",
    args: [params.recordId],
  });

  if (
    !record.author ||
    record.author === "0x0000000000000000000000000000000000000000"
  ) {
    return {
      valid: false,
      reason: "No sealed record found on Arc for this record ID.",
      fileSha256,
      manifestHash,
      recordId: params.recordId,
    };
  }

  if (record.contentHash.toLowerCase() !== manifestHash.toLowerCase()) {
    return {
      valid: false,
      reason: "Manifest bytes do not match the fingerprint sealed on Arc.",
      fileSha256,
      manifestHash,
      recordId: params.recordId,
    };
  }

  // 3. Verify recordId matches author + contentHash + kind
  const recomputedId = computeRecordId(
    record.author,
    record.contentHash,
    record.kind as RecordKindValue,
  );
  if (recomputedId.toLowerCase() !== params.recordId.toLowerCase()) {
    return {
      valid: false,
      reason: "Record ID does not match its author and fingerprint.",
      fileSha256,
      manifestHash,
      recordId: params.recordId,
    };
  }

  // 4. Verify leaseId and kind match the manifest
  if (
    record.kind !== expectedKind ||
    record.leaseId.toLowerCase() !== manifest.leaseId.toLowerCase()
  ) {
    return {
      valid: false,
      reason: "Record lease or kind does not match the manifest.",
      fileSha256,
      manifestHash,
      recordId: params.recordId,
    };
  }

  // Check solo vs lease role + landlord co-sign directly from Escrow & Registry
  const isSolo = manifest.leaseId === ZERO_BYTES32;
  let authorRole: "renter" | "landlord" | "account" = "account";
  let coSignedByLandlord = false;
  let coSignedAt = 0;

  if (!isSolo) {
    // A lease record is only valid if its lease exists in KeyprintEscrow and its author is a
    // party to that lease. A made-up lease id can't be used to dress up a stranger's seal.
    const escrow = getEscrowAddress();
    if (!escrow) {
      return {
        valid: false,
        reason: "The escrow address isn't configured, so this lease record can't be checked.",
        fileSha256,
        manifestHash,
        recordId: params.recordId,
      };
    }
    const lease = await client.readContract({
      address: escrow,
      abi: KEYPRINT_ESCROW_ABI,
      functionName: "getLease",
      args: [manifest.leaseId],
    });

    if (lease.landlord === "0x0000000000000000000000000000000000000000") {
      return {
        valid: false,
        reason: "This record names a lease that doesn't exist on Arc.",
        fileSha256,
        manifestHash,
        recordId: params.recordId,
      };
    }

    const isRenter = record.author.toLowerCase() === lease.renter.toLowerCase();
    const isLandlord = record.author.toLowerCase() === lease.landlord.toLowerCase();
    if (!isRenter && !isLandlord) {
      return {
        valid: false,
        reason: "Record author is neither the renter nor landlord of this lease.",
        fileSha256,
        manifestHash,
        recordId: params.recordId,
      };
    }
    authorRole = isRenter ? "renter" : "landlord";

    // "Co-signed by the landlord" only means something on the renter's record.
    if (isRenter) {
      const ackTs = await client.readContract({
        address: registry,
        abi: KEYPRINT_REGISTRY_ABI,
        functionName: "acknowledgedAt",
        args: [params.recordId, lease.landlord],
      });
      if (ackTs > 0n) {
        coSignedByLandlord = true;
        coSignedAt = Number(ackTs);
      }
    }
  }

  return {
    valid: true,
    reason: "Matches sealed record on Arc.",
    fileSha256,
    manifestHash,
    recordId: params.recordId,
    sealedAt: Number(record.createdAt),
    author: record.author,
    authorRole,
    coSignedByLandlord: isSolo ? false : coSignedByLandlord,
    coSignedAt: isSolo ? 0 : coSignedAt,
    isSolo,
    leaseId: manifest.leaseId,
  };
}
