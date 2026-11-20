import { NextRequest, NextResponse } from "next/server";
import { parseEventLogs, type Hex } from "viem";
import {
  createArcPublicClient,
  getEscrowAddress,
  KEYPRINT_ESCROW_ABI,
} from "@/lib/chain/arc";
import { getSupabaseAdmin, isSupabaseConfigured } from "@/lib/supabase/server";

const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";
const HEX32 = /^0x[0-9a-f]{64}$/;
const LIST_COLUMNS =
  "lease_id, unit_id, unit_name, landlord_address, renter_address, reviewer_address, move_in_record_id, move_out_record_id, created_tx_hash, funded_tx_hash, ended_tx_hash, settled_tx_hash, created_at, updated_at";

/**
 * GET /api/leases?address=0x...
 * Lists the leases where this account is a party. Without an address it lists nothing:
 * the index is never browsable as a whole.
 */
export async function GET(req: NextRequest) {
  if (!isSupabaseConfigured()) {
    return NextResponse.json({ leases: [], configured: false });
  }

  const address = req.nextUrl.searchParams.get("address")?.trim().toLowerCase();
  if (!address || !/^0x[0-9a-f]{40}$/.test(address)) {
    return NextResponse.json({ leases: [], configured: true });
  }

  try {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from("leases")
      .select(LIST_COLUMNS)
      .or(
        `renter_address.eq.${address},landlord_address.eq.${address},reviewer_address.eq.${address}`,
      )
      .order("created_at", { ascending: false })
      .limit(50);
    if (error) throw error;
    return NextResponse.json({ leases: data ?? [], configured: true });
  } catch (err) {
    console.error("GET /api/leases failed", err);
    return NextResponse.json({ error: "Leases could not be loaded." }, { status: 500 });
  }
}

/**
 * POST /api/leases
 * Adds a lease that already exists in KeyprintEscrow to the index. Parties and unit come from
 * the chain, not the body, and an existing row is never overwritten.
 */
export async function POST(req: NextRequest) {
  if (!isSupabaseConfigured()) {
    return NextResponse.json({ error: "The lease index is not configured." }, { status: 503 });
  }
  const escrow = getEscrowAddress();
  if (!escrow) {
    return NextResponse.json({ error: "The escrow address is not configured." }, { status: 503 });
  }

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid lease payload." }, { status: 400 });
  }

  const leaseId = String(body.lease_id ?? "").toLowerCase();
  if (!HEX32.test(leaseId)) {
    return NextResponse.json({ error: "A 32-byte lease_id is required." }, { status: 400 });
  }
  const unitName = String(body.unit_name || "Apartment").slice(0, 80);

  try {
    const client = createArcPublicClient();
    // The lease was just created; this server's RPC can lag the bundler by a block.
    let lease = null;
    for (let attempt = 0; attempt < 8; attempt++) {
      const l = await client.readContract({
        address: escrow,
        abi: KEYPRINT_ESCROW_ABI,
        functionName: "getLease",
        args: [leaseId as Hex],
      });
      if (l.landlord !== ZERO_ADDRESS) {
        lease = l;
        break;
      }
      await new Promise((r) => setTimeout(r, 750));
    }
    if (!lease) {
      return NextResponse.json({ error: "This lease doesn't exist on Arc yet." }, { status: 409 });
    }

    // Only keep a creation tx hash if its receipt really contains this lease's escrow log.
    let createdTxHash: string | null = null;
    const txCandidate = String(body.created_tx_hash ?? "").toLowerCase();
    if (HEX32.test(txCandidate)) {
      try {
        const receipt = await client.getTransactionReceipt({ hash: txCandidate as Hex });
        const ok =
          receipt.status === "success" &&
          parseEventLogs({ abi: KEYPRINT_ESCROW_ABI, logs: receipt.logs, eventName: "LeaseCreated" }).some(
            (log) =>
              log.address.toLowerCase() === escrow.toLowerCase() &&
              String(log.args.leaseId).toLowerCase() === leaseId,
          );
        if (ok) createdTxHash = txCandidate;
      } catch {
        // pending or unknown: store without it
      }
    }

    const supabase = getSupabaseAdmin();
    const { data: existing } = await supabase
      .from("leases")
      .select(LIST_COLUMNS)
      .eq("lease_id", leaseId)
      .maybeSingle();
    if (existing) {
      return NextResponse.json({ lease: existing });
    }

    const { data, error } = await supabase
      .from("leases")
      .insert({
        lease_id: leaseId,
        unit_id: lease.unitId.toLowerCase(),
        unit_name: unitName,
        landlord_address: lease.landlord.toLowerCase(),
        renter_address: lease.renter.toLowerCase(),
        reviewer_address: lease.reviewer.toLowerCase(),
        created_tx_hash: createdTxHash,
        updated_at: new Date().toISOString(),
      })
      .select(LIST_COLUMNS)
      .single();
    if (error) throw error;
    return NextResponse.json({ lease: data });
  } catch (err) {
    console.error("POST /api/leases failed", err);
    return NextResponse.json({ error: "The lease could not be saved." }, { status: 500 });
  }
}
