"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Address, Hex } from "viem";
import {
  createArcPublicClient,
  getEscrowAddress,
  getRegistryAddress,
  KEYPRINT_ESCROW_ABI,
  KEYPRINT_REGISTRY_ABI,
} from "@/lib/chain/arc";
import {
  checkRowAgainstRecord,
  readRecordsOnchain,
} from "@/lib/evidence/onchain-record";
import { retryPendingRecordSaves } from "@/lib/evidence/record-store";

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
  /** Never sent to the browser by /api/leases/[id]; kept optional for older callers. */
  file_paths?: string[];
  tx_hash: string | null;
  block_number: number | null;
  gas_cost_wei: string | null;
  /** ISO time. For rows returned by this hook it is the onchain seal time, never the DB insert time. */
  sealed_at: string;
  /** Onchain seal time (unix seconds) from KeyprintRegistry.getRecord().createdAt. */
  chain_created_at?: number;
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
  /** Only rows whose manifest bytes, kind, lease and author match what is sealed on Arc. */
  records: StoredRecordRow[];
  /** How many index rows were dropped because they don't match Arc (shown as a warning, never used). */
  unverifiedRecordCount: number;
  coSignedMap: Record<string, number>;
  signedUrls: { moveInScan?: string | null; moveOutScan?: string | null };
  refresh: () => Promise<void>;
}

const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";

type VerifiedEntry = { manifest: string; row: StoredRecordRow | null };

/**
 * Polls KeyprintEscrow + KeyprintRegistry + the latest Arc block every 2 seconds
 * so landlord and renter screens stay live without manual reloads.
 *
 * Index rows from /api/leases/[id] are untrusted: each one is checked against
 * KeyprintRegistry (sha256(manifest_json) == contentHash, matching id, kind, lease
 * and a lease-party author) before any page can use it. Verified results are
 * memoized per record id + manifest text, since sealed records never change.
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
  const [unverifiedRecordCount, setUnverifiedRecordCount] = useState(0);
  const [coSignedMap, setCoSignedMap] = useState<Record<string, number>>({});
  const [signedUrls, setSignedUrls] = useState<{
    moveInScan?: string | null;
    moveOutScan?: string | null;
  }>({});

  const inFlight = useRef<Promise<void> | null>(null);
  const verifiedCache = useRef(new Map<string, VerifiedEntry>());
  // Signed storage URLs carry a fresh token on every poll; keep the first one per path
  // so viewers don't re-download the whole scan every 2 seconds.
  const urlByPath = useRef(new Map<string, string>());

  const stableUrl = useCallback(
    (path: string | null | undefined, fresh: string | null | undefined) => {
      if (!fresh) return null;
      if (!path) return fresh;
      const known = urlByPath.current.get(path);
      if (known) return known;
      urlByPath.current.set(path, fresh);
      return fresh;
    },
    [],
  );

  const runOnce = useCallback(async () => {
    if (!leaseId || !/^0x[0-9a-fA-F]{64}$/.test(leaseId)) {
      setError("Invalid lease ID.");
      setLoading(false);
      return;
    }

    try {
      const escrow = getEscrowAddress();
      const registry = getRegistryAddress();
      const client = createArcPublicClient();

      const [apiRes, chainData] = await Promise.all([
        fetch(`/api/leases/${encodeURIComponent(leaseId)}`, { cache: "no-store" })
          .then(async (r) => (r.ok ? r.json() : null))
          .catch(() => null),
        (async () => {
          if (!escrow) return null;
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

      let parsedLease: OnchainLease | null = null;
      if (chainData) {
        setChainNowSec(Number(chainData.block.timestamp));
        const r = chainData.rawLease;
        parsedLease =
          r.landlord === ZERO_ADDRESS
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
      }

      // Only replace index-backed state when the index answered; a failed request
      // keeps what is on screen instead of rolling the UI back.
      if (apiRes && !apiRes.error) {
        const rawRows: StoredRecordRow[] = Array.isArray(apiRes.records)
          ? apiRes.records
          : [];
        const nextMeta: StoredLeaseMeta | null = apiRes.lease ?? null;
        setMeta(nextMeta);
        setSignedUrls({
          moveInScan: stableUrl(nextMeta?.move_in_scan_path, apiRes.signedUrls?.moveInScan),
          moveOutScan: stableUrl(nextMeta?.move_out_scan_path, apiRes.signedUrls?.moveOutScan),
        });

        // Verify rows we haven't verified yet (or whose manifest text changed).
        const cache = verifiedCache.current;
        const toCheck = rawRows.filter((row) => {
          const hit = cache.get(row.record_id.toLowerCase());
          return !hit || hit.manifest !== row.manifest_json;
        });
        if (toCheck.length > 0 && registry) {
          const onchain = await readRecordsOnchain(
            toCheck.map((row) => row.record_id as Hex),
            client,
          );
          for (const row of toCheck) {
            const info = onchain.get(row.record_id.toLowerCase()) ?? null;
            const check = await checkRowAgainstRecord(row, info);
            if (check.ok) {
              cache.set(row.record_id.toLowerCase(), {
                manifest: row.manifest_json,
                row: {
                  ...row,
                  author: check.onchain.author.toLowerCase(),
                  chain_created_at: check.onchain.createdAt,
                  sealed_at: new Date(check.onchain.createdAt * 1000).toISOString(),
                },
              });
            } else if (info) {
              // Sealed on Arc but the stored row doesn't match it: never trust this text.
              cache.set(row.record_id.toLowerCase(), { manifest: row.manifest_json, row: null });
            }
            // Not sealed yet (or RPC lag right after sealing): leave uncached and retry next poll.
          }
        }

        const verifiedRows: StoredRecordRow[] = [];
        let unverified = 0;
        for (const row of rawRows) {
          const hit = cache.get(row.record_id.toLowerCase());
          if (hit?.row && hit.manifest === row.manifest_json) {
            verifiedRows.push(hit.row);
          } else {
            unverified += 1;
          }
        }

        // Records of a lease must be authored by that lease's renter or landlord.
        const parties = parsedLease
          ? [parsedLease.renter.toLowerCase(), parsedLease.landlord.toLowerCase()]
          : null;
        const partyRows = parties
          ? verifiedRows.filter((row) => parties.includes(row.author.toLowerCase()))
          : verifiedRows;
        unverified += verifiedRows.length - partyRows.length;

        partyRows.sort((a, b) => (a.chain_created_at ?? 0) - (b.chain_created_at ?? 0));
        setRecords(partyRows);
        setUnverifiedRecordCount(unverified);

        // Landlord co-sign status comes only from KeyprintRegistry.acknowledgedAt.
        if (parsedLease && registry && partyRows.length > 0) {
          const ackResults = await client.multicall({
            allowFailure: true,
            contracts: partyRows.map((row) => ({
              address: registry,
              abi: KEYPRINT_REGISTRY_ABI,
              functionName: "acknowledgedAt" as const,
              args: [row.record_id as Hex, parsedLease!.landlord] as const,
            })),
          });
          setCoSignedMap(
            Object.fromEntries(
              partyRows.map((row, i) => {
                const res = ackResults[i];
                return [
                  row.record_id.toLowerCase(),
                  res.status === "success" ? Number(res.result) : 0,
                ];
              }),
            ),
          );
        } else if (partyRows.length === 0) {
          setCoSignedMap({});
        }
      }

      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load lease state.");
    } finally {
      setLoading(false);
    }
  }, [leaseId, stableUrl]);

  // Background polls skip while one is running, so a slow response can never land
  // after a newer one. Explicit refreshes (after an action) wait, then read fresh state.
  const poll = useCallback(() => {
    if (inFlight.current) return;
    const p = runOnce().finally(() => {
      inFlight.current = null;
    });
    inFlight.current = p;
  }, [runOnce]);

  const refresh = useCallback(async () => {
    while (inFlight.current) {
      await inFlight.current;
    }
    const p = runOnce().finally(() => {
      inFlight.current = null;
    });
    inFlight.current = p;
    await p;
  }, [runOnce]);

  useEffect(() => {
    // Re-send any manifests this browser sealed but the index never confirmed.
    void retryPendingRecordSaves(leaseId).catch(() => undefined);
  }, [leaseId]);

  useEffect(() => {
    const first = setTimeout(poll, 0);
    const id = setInterval(poll, 2000);
    return () => {
      clearTimeout(first);
      clearInterval(id);
    };
  }, [poll]);

  return {
    loading,
    error,
    chainNowSec,
    lease,
    claims,
    meta,
    records,
    unverifiedRecordCount,
    coSignedMap,
    signedUrls,
    refresh,
  };
}
