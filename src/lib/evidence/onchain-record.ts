import type { Address, Hex } from "viem";
import {
  computeRecordId,
  createArcPublicClient,
  getRegistryAddress,
  KEYPRINT_REGISTRY_ABI,
  type RecordKindValue,
} from "../chain/arc";
import { sha256HexToBytes32, sha256Text } from "./hash";

const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";

/** The subset of a Supabase `records` row that the onchain check needs. */
export interface RecordRowLike {
  record_id: string;
  lease_id: string;
  kind: number;
  author: string;
  manifest_json: string;
}

/** A record as KeyprintRegistry.getRecord returns it, with plain-number timestamps. */
export interface OnchainRecordInfo {
  recordId: Hex;
  unitId: Hex;
  leaseId: Hex;
  kind: number;
  contentHash: Hex;
  author: Address;
  createdAt: number;
  createdSeq: number;
}

export type RowCheck =
  | { ok: true; onchain: OnchainRecordInfo }
  | { ok: false; reason: string };

type RawRecord = {
  unitId: Hex;
  leaseId: Hex;
  kind: number;
  contentHash: Hex;
  author: Address;
  createdAt: bigint;
  createdSeq: bigint;
};

function toInfo(recordId: Hex, raw: RawRecord): OnchainRecordInfo | null {
  if (!raw.author || raw.author.toLowerCase() === ZERO_ADDRESS) return null;
  return {
    recordId,
    unitId: raw.unitId,
    leaseId: raw.leaseId,
    kind: Number(raw.kind),
    contentHash: raw.contentHash,
    author: raw.author,
    createdAt: Number(raw.createdAt),
    createdSeq: Number(raw.createdSeq),
  };
}

/**
 * Reads many records from KeyprintRegistry in one Multicall3 round trip.
 * Unknown ids (never sealed) map to null. Throws only if the RPC itself fails,
 * so callers can tell "not sealed" apart from "couldn't check".
 */
export async function readRecordsOnchain(
  recordIds: Hex[],
  client = createArcPublicClient(),
): Promise<Map<string, OnchainRecordInfo | null>> {
  const registry = getRegistryAddress();
  const out = new Map<string, OnchainRecordInfo | null>();
  if (!registry || recordIds.length === 0) return out;

  const results = await client.multicall({
    allowFailure: true,
    contracts: recordIds.map((id) => ({
      address: registry,
      abi: KEYPRINT_REGISTRY_ABI,
      functionName: "getRecord" as const,
      args: [id] as const,
    })),
  });

  results.forEach((res, i) => {
    const id = recordIds[i];
    out.set(
      id.toLowerCase(),
      res.status === "success" ? toInfo(id, res.result as unknown as RawRecord) : null,
    );
  });
  return out;
}

/**
 * Checks that a stored row is exactly what was sealed on Arc:
 * the record exists, its id is keccak256(abi.encode(author, contentHash, kind)),
 * its kind/lease/author match the row, and sha256(manifest_json) equals the
 * sealed contentHash. Anything that fails is untrusted and must not drive UI rules.
 */
export async function checkRowAgainstRecord(
  row: RecordRowLike,
  onchain: OnchainRecordInfo | null,
): Promise<RowCheck> {
  if (!onchain) return { ok: false, reason: "Not sealed on Arc." };

  const rowId = row.record_id.toLowerCase();
  const recomputed = computeRecordId(
    onchain.author,
    onchain.contentHash,
    onchain.kind as RecordKindValue,
  ).toLowerCase();
  if (recomputed !== rowId) {
    return { ok: false, reason: "Record id does not match its author and fingerprint." };
  }
  if (Number(row.kind) !== onchain.kind) {
    return { ok: false, reason: "Record kind does not match Arc." };
  }
  if (row.lease_id.toLowerCase() !== onchain.leaseId.toLowerCase()) {
    return { ok: false, reason: "Record lease does not match Arc." };
  }
  if (row.author.toLowerCase() !== onchain.author.toLowerCase()) {
    return { ok: false, reason: "Record author does not match Arc." };
  }

  let manifestHash: Hex;
  try {
    manifestHash = sha256HexToBytes32(await sha256Text(row.manifest_json));
  } catch {
    return { ok: false, reason: "Manifest could not be hashed." };
  }
  if (manifestHash.toLowerCase() !== onchain.contentHash.toLowerCase()) {
    return { ok: false, reason: "Manifest bytes do not match the fingerprint sealed on Arc." };
  }

  return { ok: true, onchain };
}
