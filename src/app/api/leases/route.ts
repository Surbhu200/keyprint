import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin, isSupabaseConfigured } from "@/lib/supabase/server";

export async function GET(req: NextRequest) {
  if (!isSupabaseConfigured()) {
    return NextResponse.json({ leases: [], configured: false });
  }

  const address = req.nextUrl.searchParams.get("address")?.trim().toLowerCase();
  const supabase = getSupabaseAdmin();

  let query = supabase
    .from("leases")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(50);

  if (address && /^0x[0-9a-f]{40}$/.test(address)) {
    query = query.or(
      `renter_address.ilike.${address},landlord_address.ilike.${address},reviewer_address.ilike.${address}`,
    );
  }

  const { data, error } = await query;
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ leases: data ?? [], configured: true });
}

export async function POST(req: NextRequest) {
  if (!isSupabaseConfigured()) {
    return NextResponse.json(
      { error: "Supabase is not configured." },
      { status: 503 },
    );
  }

  try {
    const body = (await req.json()) as Record<string, unknown>;
    if (!body.lease_id || !body.unit_id || !body.landlord_address || !body.renter_address) {
      return NextResponse.json(
        { error: "lease_id, unit_id, landlord_address, and renter_address are required." },
        { status: 400 },
      );
    }

    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from("leases")
      .upsert(
        {
          lease_id: String(body.lease_id).toLowerCase(),
          unit_id: String(body.unit_id).toLowerCase(),
          unit_name: String(body.unit_name || "Apartment"),
          landlord_address: String(body.landlord_address).toLowerCase(),
          renter_address: String(body.renter_address).toLowerCase(),
          reviewer_address: String(body.reviewer_address || "").toLowerCase(),
          move_in_scan_path: body.move_in_scan_path ?? null,
          move_out_scan_path: body.move_out_scan_path ?? null,
          move_in_record_id: body.move_in_record_id ?? null,
          move_out_record_id: body.move_out_record_id ?? null,
          created_tx_hash: body.created_tx_hash ?? null,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "lease_id" },
      )
      .select("*")
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ lease: data });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Invalid lease payload." },
      { status: 400 },
    );
  }
}
