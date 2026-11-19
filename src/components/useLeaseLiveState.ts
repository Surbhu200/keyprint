"use client";

import { useCallback, useEffect, useState } from "react";
import type { Address, Hex } from "viem";
import {
  createArcPublicClient,
  getEscrowAddress,
  getRegistryAddress,
  KEYPRINT_ESCROW_ABI,
  KEYPRINT_REGISTRY_ABI,
} from "@/lib/chain/arc";

export interface OnchainLease {
  leaseId: Hex;
  landlord: Address;
  renter: Address;
  reviewer: Address;
  deposit: bigint;
  unitId: Hex;
  leaseEnd: number;
  reviewWindow: number;
  claimWindow: number;
  responseWindow: number;
  resolveWindow: number;
  state: number; // 0 Created, 1 Funded, 2 Ended, 3 Settled
  moveInRecordId: Hex;
  moveOutRecordId: Hex;
  fundedAt: number;
  endedAt: number;
  claimsClosed: boolean;
  activeClaimedTotal: bigint;
  landlordPayout: bigint;
  renterPayout: bigint;
}

export interface OnchainClaim {
  claimId: bigint;
  leaseId: Hex;
  evidenceRecordId: Hex;
  amount: bigint;
  awarded: bigint;
  filedAt: number;
  disputedAt: number;
  state: number; // 0 Pending, 1 Accepted, 2 Disputed, 3 Resolved, 4 Withdrawn
}

export interface StoredRecordRow {
  record_id: string;
  unit_id: string;
  lease_id: string;
  kind: number;
  content_hash: string;
  author: string;
  manifest_json: string;
  file_paths: string[];
  tx_hash: string | null;
  block_number: number | null;
  gas_cost_wei: string | null;
  sealed_at: string;
}

export interface StoredLeaseMeta {
  lease_id: string;
  unit_id: string;
  unit_name: string;
  landlord_address: string;
  renter_address: string;
  reviewer_address: string;
  move_in_scan_path: string | null;
  move_out_scan_path: string | null;
  move_in_record_id: string | null;
  move_out_record_id: string | null;
  alignment_record_id: string | null;
  report_record_id: string | null;
  alignment_matrix: number[] | null;
  alignment_metrics: {
    medianGapMeters: number;
    shareWithin5cm: number;
    summaryText: string;
    passedGate: boolean;
  } | null;
  created_tx_hash: string | null;
  funded_tx_hash: string | null;
  ended_tx_hash: string | null;
  settled_tx_hash: string | null;
  total_gas_cost_wei: string | null;
  tx_count: number | null;
}

export interface LeaseLiveState {
  loading: boolean;
  error: string | null;
  chainNowSec: number;
  lease: OnchainLease | null;
  claims: OnchainClaim[];
  meta: StoredLeaseMeta | null;
  records: StoredRecordRow[];
  coSignedMap: Record<string, number>;
  signedUrls: { moveInScan?: string | null; moveOutScan?: string | null };
  refresh: () => Promise<void>;
}

/**
 * Polls KeyprintEscrow + KeyprintRegistry + latest Arc block timestamp every 2 seconds
 * so landlord and renter screens stay live without manual reloads.
 */
export function useLeaseLiveState(leaseId: string): LeaseLiveState {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [chainNowSec, setChainNowSec] = useState<number>(() =>
    Math.floor(Date.now() / 1000),
  );
  const [lease, setLease] = useState<OnchainLease | null>(null);
  const [claims, setClaims] = useState<OnchainClaim[]>([]);
  const [meta, setMeta] = useState<StoredLeaseMeta | null>(null);
  const [records, setRecords] = useState<StoredRecordRow[]>([]);
  const [coSignedMap, setCoSignedMap] = useState<Record<string, number>>({});
  const [signedUrls, setSignedUrls] = useState<{
    moveInScan?: string | null;
    moveOutScan?: string | null;
  }>({});

  const refresh = useCallback(async () => {
    if (!leaseId || !/^0x[0-9a-fA-F]{64}$/.test(leaseId)) {
      setError("Invalid lease ID.");
      setLoading(false);
      return;
    }

    try {
      const escrow = getEscrowAddress();
      const registry = getRegistryAddress();

      const [apiRes, chainData] = await Promise.all([
        fetch(`/api/leases/${encodeURIComponent(leaseId)}`, { cache: "no-store" })
          .then((r) => r.json())
          .catch(() => null),
        (async () => {
          if (!escrow) return null;
          const client = createArcPublicClient();
          const [block, rawLease, rawClaims] = await Promise.all([
            client.getBlock({ blockTag: "latest" }),
            client.readContract({
              address: escrow,
              abi: KEYPRINT_ESCROW_ABI,
              functionName: "getLease",
              args: [leaseId as Hex],
            }),
            client.readContract({
              address: escrow,
              abi: KEYPRINT_ESCROW_ABI,
              functionName: "getClaims",
              args: [leaseId as Hex],
            }),
          ]);
          return { block, rawLease, rawClaims };
        })(),
      ]);

      const fetchedRecords: StoredRecordRow[] = apiRes?.records ?? [];
      setMeta(apiRes?.lease ?? null);
      setRecords(fetchedRecords);
      setSignedUrls(apiRes?.signedUrls ?? {});

      if (chainData) {
        setChainNowSec(Number(chainData.block.timestamp));
        const r = chainData.rawLease;
        const parsedLease: OnchainLease | null =
          r.landlord === "0x0000000000000000000000000000000000000000"
            ? null
            : {
                leaseId: r.leaseId,
                landlord: r.landlord,
                renter: r.renter,
                reviewer: r.reviewer,
                deposit: r.deposit,
                unitId: r.unitId,
                leaseEnd: Number(r.leaseEnd),
                reviewWindow: Number(r.reviewWindow),
                claimWindow: Number(r.claimWindow),
                responseWindow: Number(r.responseWindow),
                resolveWindow: Number(r.resolveWindow),
                state: Number(r.state),
                moveInRecordId: r.moveInRecordId,
                moveOutRecordId: r.moveOutRecordId,
                fundedAt: Number(r.fundedAt),
                endedAt: Number(r.endedAt),
                claimsClosed: r.claimsClosed,
                activeClaimedTotal: r.activeClaimedTotal,
                landlordPayout: r.landlordPayout,
                renterPayout: r.renterPayout,
              };
        setLease(parsedLease);
        setClaims(
          chainData.rawClaims.map((c) => ({
            claimId: c.claimId,
            leaseId: c.leaseId,
            evidenceRecordId: c.evidenceRecordId,
            amount: c.amount,
            awarded: c.awarded,
            filedAt: Number(c.filedAt),
            disputedAt: Number(c.disputedAt),
            state: Number(c.state),
          })),
        );

        // Read onchain landlord co-sign status directly from KeyprintRegistry.acknowledgedAt
        if (parsedLease && registry && fetchedRecords.length > 0) {
          const client = createArcPublicClient();
          const ackEntries = await Promise.all(
            fetchedRecords.map(async (rec) => {
              try {
                const ts = await client.readContract({
                  address: registry,
                  abi: KEYPRINT_REGISTRY_ABI,
                  functionName: "acknowledgedAt",
                  args: [rec.record_id as Hex, parsedLease.landlord],
                });
                return [rec.record_id.toLowerCase(), Number(ts)] as const;
              } catch {
                return [rec.record_id.toLowerCase(), 0] as const;
              }
            }),
          );
          setCoSignedMap(Object.fromEntries(ackEntries));
        }
      }

      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load lease state.");
    } finally {
      setLoading(false);
    }
  }, [leaseId]);

  useEffect(() => {
    const first = setTimeout(() => {
      void refresh();
    }, 0);
    const id = setInterval(() => {
      void refresh();
    }, 2000);
    return () => {
      clearTimeout(first);
      clearInterval(id);
    };
  }, [refresh]);

  return {
    loading,
    error,
    chainNowSec,
    lease,
    claims,
    meta,
    records,
    coSignedMap,
    signedUrls,
    refresh,
  };
}
