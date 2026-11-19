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

async function trySettleLease(leaseId: Hex) {
  const escrow = getEscrowAddress();
  if (!escrow) {
    return { settled: false, reason: "NEXT_PUBLIC_KEYPRINT_ESCROW_ADDRESS is not set." };
  }

  const rawKey = process.env.KEEPER_KEY?.trim();
  if (!rawKey) {
    return { settled: false, reason: "KEEPER_KEY is not configured on the server." };
  }
  const normalizedKey = (rawKey.startsWith("0x") ? rawKey : `0x${rawKey}`) as Hex;
  const account = privateKeyToAccount(normalizedKey);
  const publicClient = createArcPublicClient();

  // Always simulate first so we never waste keeper USDC gas before the deadline passes.
  try {
    await publicClient.simulateContract({
      address: escrow,
      abi: KEYPRINT_ESCROW_ABI,
      functionName: "settle",
      args: [leaseId],
      account,
    });
  } catch (err) {
    return {
      settled: false,
      keeperAddress: account.address,
      reason: err instanceof Error ? err.message : "Lease is not yet eligible to settle.",
    };
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

  const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash });

  if (isSupabaseConfigured()) {
    const supabase = getSupabaseAdmin();
    await supabase
      .from("leases")
      .update({
        settled_tx_hash: txHash,
        updated_at: new Date().toISOString(),
      })
      .eq("lease_id", leaseId.toLowerCase());
  }

  return {
    settled: true,
    txHash,
    keeperAddress: account.address,
    blockNumber: receipt.blockNumber.toString(),
  };
}

/**
 * POST /api/keeper/settle
 * Called every 2 seconds by an open lease page once the onchain countdown hits zero.
 */
export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as { leaseId?: string };
    const leaseId = body.leaseId?.trim();
    if (!leaseId || !/^0x[0-9a-fA-F]{64}$/.test(leaseId)) {
      return NextResponse.json({ error: "Valid bytes32 leaseId is required." }, { status: 400 });
    }

    const result = await trySettleLease(leaseId as Hex);
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json(
      { settled: false, error: err instanceof Error ? err.message : "Keeper error." },
      { status: 500 },
    );
  }
}

/**
 * GET /api/keeper/settle
 * Daily Vercel Cron backstop (authenticated via CRON_SECRET).
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
  const { data: leases } = await supabase
    .from("leases")
    .select("lease_id")
    .is("settled_tx_hash", null)
    .limit(50);

  const results = [];
  for (const row of leases ?? []) {
    if (/^0x[0-9a-fA-F]{64}$/.test(row.lease_id)) {
      results.push({
        leaseId: row.lease_id,
        ...(await trySettleLease(row.lease_id as Hex)),
      });
    }
  }

  return NextResponse.json({
    checked: results.length,
    settled: results.filter((r) => r.settled),
  });
}
