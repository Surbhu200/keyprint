import { NextRequest, NextResponse } from "next/server";
import { createWalletClient, http, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { arcTestnet } from "viem/chains";
import {
  ARC_MIN_MAX_FEE_PER_GAS,
  createArcPublicClient,
  getArcRpcUrl,
  getEscrowAddress,
  KEYPRINT_ESCROW_ABI,
} from "@/lib/chain/arc";
import { getSupabaseAdmin, isSupabaseConfigured } from "@/lib/supabase/server";

export const maxDuration = 60;

const LEASE_STATE_ENDED = 2;
const LEASE_STATE_SETTLED = 3;

// One settle at a time per lease inside this server instance, so several open tabs
// polling at once don't all pass simulation and send duplicate transactions.
const inFlight = new Map<string, Promise<KeeperResult>>();

type KeeperResult = {
  settled: boolean;
  txHash?: Hex;
  keeperAddress?: string;
  blockNumber?: string;
  reason?: string;
  /** True when the keeper can't act at all (not configured), so the UI should offer the manual button. */
  keeperUnavailable?: boolean;
};

async function settleLease(leaseId: Hex): Promise<KeeperResult> {
  const escrow = getEscrowAddress();
  const rawKey = process.env.KEEPER_KEY?.trim();
  if (!escrow || !rawKey) {
    console.error("Keeper is not configured (escrow address or KEEPER_KEY missing).");
    return { settled: false, keeperUnavailable: true, reason: "The keeper isn't available right now." };
  }

  const normalizedKey = (rawKey.startsWith("0x") ? rawKey : `0x${rawKey}`) as Hex;
  const account = privateKeyToAccount(normalizedKey);
  const publicClient = createArcPublicClient();

  // Already settled (by anyone)? Nothing to do.
  const lease = await publicClient.readContract({
    address: escrow,
    abi: KEYPRINT_ESCROW_ABI,
    functionName: "getLease",
    args: [leaseId],
  });
  if (Number(lease.state) === LEASE_STATE_SETTLED) {
    return { settled: false, reason: "Already settled." };
  }
  if (Number(lease.state) !== LEASE_STATE_ENDED) {
    return { settled: false, reason: "Not ready to settle yet." };
  }

  // Always simulate first so the keeper never spends gas before the rules allow settling.
  try {
    await publicClient.simulateContract({
      address: escrow,
      abi: KEYPRINT_ESCROW_ABI,
      functionName: "settle",
      args: [leaseId],
      account,
    });
  } catch {
    return { settled: false, keeperAddress: account.address, reason: "Not ready to settle yet." };
  }

  // Enforce Arc's 20 Gwei mempool floor (+ safety margin) so the tx is never silently dropped.
  const fees = await publicClient.estimateFeesPerGas().catch(() => null);
  const maxFeePerGas =
    fees?.maxFeePerGas && fees.maxFeePerGas > ARC_MIN_MAX_FEE_PER_GAS
      ? fees.maxFeePerGas
      : ARC_MIN_MAX_FEE_PER_GAS;
  const maxPriorityFeePerGas =
    fees?.maxPriorityFeePerGas && fees.maxPriorityFeePerGas > 1_000_000_000n
      ? fees.maxPriorityFeePerGas
      : 1_000_000_000n;

  const walletClient = createWalletClient({
    account,
    chain: arcTestnet,
    transport: http(getArcRpcUrl()),
  });

  const txHash = await walletClient.writeContract({
    address: escrow,
    abi: KEYPRINT_ESCROW_ABI,
    functionName: "settle",
    args: [leaseId],
    maxFeePerGas,
    maxPriorityFeePerGas,
  });

  const receipt = await publicClient.waitForTransactionReceipt({
    hash: txHash,
    pollingInterval: 500,
  });

  if (receipt.status !== "success") {
    // Someone else settled first, or the rules changed between simulation and inclusion.
    return { settled: false, keeperAddress: account.address, reason: "Settlement didn't go through; retrying." };
  }

  if (isSupabaseConfigured()) {
    const supabase = getSupabaseAdmin();
    await supabase
      .from("leases")
      .update({
        settled_tx_hash: txHash,
        updated_at: new Date().toISOString(),
      })
      .eq("lease_id", leaseId.toLowerCase())
      .is("settled_tx_hash", null);
  }

  return {
    settled: true,
    txHash,
    keeperAddress: account.address,
    blockNumber: receipt.blockNumber.toString(),
  };
}

function trySettleLease(leaseId: Hex): Promise<KeeperResult> {
  const key = leaseId.toLowerCase();
  const existing = inFlight.get(key);
  if (existing) return existing;
  const p = settleLease(leaseId)
    .catch((err) => {
      console.error("Keeper settle failed", err);
      return { settled: false, reason: "Keeper error; retrying." } as KeeperResult;
    })
    .finally(() => inFlight.delete(key));
  inFlight.set(key, p);
  return p;
}

/**
 * POST /api/keeper/settle
 * Called every 2 seconds by an open lease page once the onchain countdown has passed.
 * settle() is open to anyone onchain, so this can only trigger what the lease rules already allow.
 */
export async function POST(req: NextRequest) {
  let leaseId: string | undefined;
  try {
    const body = (await req.json()) as { leaseId?: string };
    leaseId = body.leaseId?.trim();
  } catch {
    leaseId = undefined;
  }
  if (!leaseId || !/^0x[0-9a-fA-F]{64}$/.test(leaseId)) {
    return NextResponse.json({ error: "Valid bytes32 leaseId is required." }, { status: 400 });
  }
  const result = await trySettleLease(leaseId as Hex);
  return NextResponse.json(result);
}

/**
 * GET /api/keeper/settle
 * Daily Vercel Cron backstop (authenticated via CRON_SECRET). Acts only on leases that are
 * Ended onchain; one failing lease never stops the rest.
 */
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET?.trim();
  const auth = req.headers.get("authorization");
  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!isSupabaseConfigured()) {
    return NextResponse.json({ checked: 0, settled: [] });
  }

  const supabase = getSupabaseAdmin();
  const results: Array<{ leaseId: string } & KeeperResult> = [];
  const pageSize = 200;
  for (let from = 0; from < 2000; from += pageSize) {
    const { data: leases, error } = await supabase
      .from("leases")
      .select("lease_id")
      .is("settled_tx_hash", null) // settled leases need no keeper
      .order("created_at", { ascending: false }) // newest first: those are the live demos
      .range(from, from + pageSize - 1);
    if (error || !leases || leases.length === 0) break;

    for (const row of leases) {
      if (!/^0x[0-9a-fA-F]{64}$/.test(row.lease_id)) continue;
      const result = await trySettleLease(row.lease_id as Hex);
      if (result.settled || result.reason !== "Already settled.") {
        results.push({ leaseId: row.lease_id, ...result });
      }
    }
    if (leases.length < pageSize) break;
  }

  return NextResponse.json({
    checked: results.length,
    settled: results.filter((r) => r.settled),
  });
}
