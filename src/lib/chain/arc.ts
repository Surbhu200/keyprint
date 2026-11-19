import {
  createPublicClient,
  encodeAbiParameters,
  formatUnits,
  http,
  keccak256,
  parseAbi,
  type Address,
  type Hex,
} from "viem";
import { arcTestnet } from "viem/chains";

export const ARC_CHAIN_ID = 5042002 as const;
export const ARC_DEFAULT_RPC = "https://rpc.testnet.arc.io";
export const ARC_DEFAULT_EXPLORER = "https://explorer.testnet.arc.io";
export const ARC_USDC_ADDRESS =
  "0x3600000000000000000000000000000000000000" as Address;
export const CIRCLE_DEFAULT_CLIENT_URL =
  "https://modular-sdk.circle.com/v1/rpc/w3s/buidl";

/** Minimum base fee floor on Arc mempool (20 Gwei); we add safety headroom for keeper txs. */
export const ARC_MIN_MAX_FEE_PER_GAS = 25_000_000_000n; // 25 Gwei

export const RecordKind = {
  MoveInScan: 0,
  Pin: 1,
  MoveOutScan: 2,
  Alignment: 3,
  Report: 4,
  ClaimEvidence: 5,
} as const;

export type RecordKindValue = (typeof RecordKind)[keyof typeof RecordKind];

export const RecordKindName: Record<RecordKindValue, string> = {
  0: "MoveInScan",
  1: "Pin",
  2: "MoveOutScan",
  3: "Alignment",
  4: "Report",
  5: "ClaimEvidence",
};

export const LeaseStateLabel = {
  0: "Waiting for move-in",
  1: "Moved in",
  2: "Moved out",
  3: "Settled",
} as const;

export const ClaimStateLabel = {
  0: "Pending",
  1: "Accepted",
  2: "Disputed",
  3: "Resolved",
  4: "Withdrawn",
} as const;

export const KEYPRINT_REGISTRY_ABI = parseAbi([
  "function seal(bytes32 unitId, bytes32 leaseId, uint8 kind, bytes32 contentHash) external returns (bytes32 recordId)",
  "function acknowledge(bytes32 recordId) external",
  "function contest(bytes32 recordId, bytes32 noteHash) external",
  "function exists(bytes32 recordId) external view returns (bool)",
  "function acknowledgedAt(bytes32 recordId, address account) external view returns (uint64)",
  "function nextSeq() external view returns (uint64)",
  "function computeRecordId(address author, bytes32 contentHash, uint8 kind) external pure returns (bytes32)",
  "function getRecord(bytes32 recordId) external view returns ((bytes32 unitId, bytes32 leaseId, uint8 kind, bytes32 contentHash, address author, uint64 createdAt, uint64 createdSeq))",
  "event RecordSealed(bytes32 indexed recordId, bytes32 indexed unitId, bytes32 indexed leaseId, uint8 kind, bytes32 contentHash, address author, uint64 timestamp)",
  "event RecordAcknowledged(bytes32 indexed recordId, address indexed by, uint64 timestamp)",
  "event RecordContested(bytes32 indexed recordId, address indexed by, bytes32 noteHash, uint64 timestamp)",
]);

export const KEYPRINT_ESCROW_ABI = parseAbi([
  "function usdc() external view returns (address)",
  "function registry() external view returns (address)",
  "function MIN_WINDOW() external view returns (uint64)",
  "function owed(address account) external view returns (uint256)",
  "function usedEvidence(bytes32 evidenceRecordId) external view returns (bool)",
  "function createLease((address renter, address reviewer, uint128 deposit, bytes32 unitId, uint64 leaseEnd, uint64 reviewWindow, uint64 claimWindow, uint64 responseWindow, uint64 resolveWindow) terms) external returns (bytes32 leaseId)",
  "function fund(bytes32 leaseId, bytes32 moveInRecordId) external",
  "function endLease(bytes32 leaseId, bytes32 moveOutRecordId) external",
  "function fileClaim(bytes32 leaseId, bytes32 evidenceRecordId, uint128 amount) external returns (uint256 claimId)",
  "function closeClaims(bytes32 leaseId) external",
  "function withdrawClaim(uint256 claimId) external",
  "function acceptClaim(uint256 claimId) external",
  "function disputeClaim(uint256 claimId) external",
  "function resolveClaim(uint256 claimId, uint128 awarded) external",
  "function settle(bytes32 leaseId) external",
  "function withdraw() external",
  "function getLease(bytes32 leaseId) external view returns ((bytes32 leaseId, address landlord, address renter, address reviewer, uint128 deposit, bytes32 unitId, uint64 leaseEnd, uint64 reviewWindow, uint64 claimWindow, uint64 responseWindow, uint64 resolveWindow, uint8 state, bytes32 moveInRecordId, bytes32 moveOutRecordId, uint64 fundedAt, uint64 fundedRegistrySeq, uint64 endedAt, uint64 endedRegistrySeq, bool claimsClosed, uint128 activeClaimedTotal, uint128 landlordPayout, uint128 renterPayout))",
  "function getClaim(uint256 claimId) external view returns ((uint256 claimId, bytes32 leaseId, bytes32 evidenceRecordId, uint128 amount, uint128 awarded, uint64 filedAt, uint64 disputedAt, uint8 state))",
  "function getClaims(bytes32 leaseId) external view returns ((uint256 claimId, bytes32 leaseId, bytes32 evidenceRecordId, uint128 amount, uint128 awarded, uint64 filedAt, uint64 disputedAt, uint8 state)[])",
  "event LeaseCreated(bytes32 indexed leaseId, address indexed landlord, address indexed renter, address reviewer, uint128 deposit, bytes32 unitId, uint64 leaseEnd)",
  "event LeaseFunded(bytes32 indexed leaseId, address indexed renter, bytes32 moveInRecordId, uint128 deposit, uint64 fundedAt)",
  "event LeaseEnded(bytes32 indexed leaseId, address indexed by, bytes32 moveOutRecordId, uint64 endedAt)",
  "event ClaimFiled(bytes32 indexed leaseId, uint256 indexed claimId, bytes32 evidenceRecordId, uint128 amount, uint64 filedAt)",
  "event ClaimsClosed(bytes32 indexed leaseId, uint64 closedAt)",
  "event ClaimWithdrawn(bytes32 indexed leaseId, uint256 indexed claimId, uint64 timestamp)",
  "event ClaimAccepted(bytes32 indexed leaseId, uint256 indexed claimId, uint128 amount, uint64 timestamp)",
  "event ClaimDisputed(bytes32 indexed leaseId, uint256 indexed claimId, uint64 disputedAt)",
  "event ClaimResolved(bytes32 indexed leaseId, uint256 indexed claimId, address indexed reviewer, uint128 awarded, uint64 timestamp)",
  "event LeaseSettled(bytes32 indexed leaseId, address indexed caller, uint128 landlordPayout, uint128 renterPayout, uint64 timestamp)",
]);

export function getArcRpcUrl(): string {
  if (typeof window === "undefined") {
    return (
      process.env.ARC_RPC_URL ||
      process.env.NEXT_PUBLIC_ARC_RPC_URL ||
      ARC_DEFAULT_RPC
    );
  }
  return process.env.NEXT_PUBLIC_ARC_RPC_URL || ARC_DEFAULT_RPC;
}

export function getArcExplorerUrl(): string {
  return (
    process.env.NEXT_PUBLIC_ARC_EXPLORER_URL || ARC_DEFAULT_EXPLORER
  ).replace(/\/$/, "");
}

export function getRegistryAddress(): Address | null {
  const addr = process.env.NEXT_PUBLIC_KEYPRINT_REGISTRY_ADDRESS?.trim();
  return addr && /^0x[0-9a-fA-F]{40}$/.test(addr) ? (addr as Address) : null;
}

export function getEscrowAddress(): Address | null {
  const addr = process.env.NEXT_PUBLIC_KEYPRINT_ESCROW_ADDRESS?.trim();
  return addr && /^0x[0-9a-fA-F]{40}$/.test(addr) ? (addr as Address) : null;
}

export function explorerTxUrl(txHash: string): string {
  return `${getArcExplorerUrl()}/tx/${txHash}`;
}

export function explorerAddressUrl(address: string): string {
  return `${getArcExplorerUrl()}/address/${address}`;
}

/**
 * Computes recordId identically to KeyprintRegistry.computeRecordId:
 *   keccak256(abi.encode(author, contentHash, uint8(kind)))
 */
export function computeRecordId(
  author: Address,
  contentHash: Hex,
  kind: RecordKindValue,
): Hex {
  const encoded = encodeAbiParameters(
    [{ type: "address" }, { type: "bytes32" }, { type: "uint8" }],
    [author, contentHash, kind],
  );
  return keccak256(encoded);
}

export function createArcPublicClient(rpcUrl?: string) {
  return createPublicClient({
    chain: arcTestnet,
    transport: http(rpcUrl ?? getArcRpcUrl()),
  });
}

/** Formats 6-decimal ERC-20 USDC integer units as consumer-friendly dollars (e.g. "$200" or "$40.50"). */
export function formatDollars(amount6: bigint): string {
  const raw = Number(formatUnits(amount6, 6));
  if (Number.isInteger(raw)) {
    return `$${raw.toLocaleString("en-US")}`;
  }
  return `$${raw.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

/** Formats 18-decimal native USDC gas cost from UserOp receipts (actualGasCost). */
export function formatNativeUsdcFee(gasCost18: bigint): string {
  const val = Number(formatUnits(gasCost18, 18));
  if (val === 0) return "$0.00";
  if (val < 0.0001) return "<$0.0001";
  return `$${val.toFixed(4)}`;
}

export function stringToBytes32(label: string): Hex {
  return keccak256(new TextEncoder().encode(label));
}
