import { NextRequest, NextResponse } from "next/server";
import {
  DEFAULT_STORAGE_BUCKET,
  getSupabaseAdmin,
  isSupabaseConfigured,
} from "@/lib/supabase/server";

async function maybeSignUrl(path: string | null | undefined): Promise<string | null> {
  if (!path) return null;
  if (path.startsWith("/") || path.startsWith("http://") || path.startsWith("https://")) {
    return path;
  }
  const supabase = getSupabaseAdmin();
  const { data } = await supabase.storage
    .from(DEFAULT_STORAGE_BUCKET)
    .createSignedUrl(path, 3600);
  return data?.signedUrl ?? null;
}

export async function GET(
  _req: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  const leaseId = id.toLowerCase();

  if (!isSupabaseConfigured()) {
    return NextResponse.json({
      configured: false,
      lease: null,
      records: [],
      reports: [],
      signedUrls: {},
    });
  }

  const supabase = getSupabaseAdmin();
  const [{ data: lease }, { data: records }, { data: reports }] = await Promise.all([
    supabase.from("leases").select("*").eq("lease_id", leaseId).maybeSingle(),
    supabase
      .from("records")
      .select("*")
      .eq("lease_id", leaseId)
      .order("sealed_at", { ascending: true }),
    supabase
      .from("ai_reports")
      .select("*")
      .eq("lease_id", leaseId)
      .order("created_at", { ascending: false })
      .limit(5),
  ]);

  const [moveInUrl, moveOutUrl] = await Promise.all([
    maybeSignUrl(lease?.move_in_scan_path),
    maybeSignUrl(lease?.move_out_scan_path),
  ]);

  return NextResponse.json({
    configured: true,
    lease: lease ?? null,
    records: records ?? [],
    reports: reports ?? [],
    signedUrls: {
      moveInScan: moveInUrl,
      moveOutScan: moveOutUrl,
    },
  });
}

export async function PATCH(
  req: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  if (!isSupabaseConfigured()) {
    return NextResponse.json({ error: "Supabase is not configured." }, { status: 503 });
  }

  const { id } = await context.params;
  const leaseId = id.toLowerCase();
  const body = (await req.json()) as Record<string, unknown>;

  const allowedKeys = [
    "unit_name",
    "move_in_scan_path",
    "move_out_scan_path",
    "move_in_record_id",
    "move_out_record_id",
    "alignment_record_id",
    "report_record_id",
    "alignment_matrix",
    "alignment_metrics",
    "funded_tx_hash",
    "ended_tx_hash",
    "settled_tx_hash",
    "total_gas_cost_wei",
    "tx_count",
  ] as const;

  const patch: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  };
  for (const key of allowedKeys) {
    if (key in body) patch[key] = body[key];
  }

  const supabase = getSupabaseAdmin();

  // Optional gas increment helper
  if (typeof body.add_gas_cost_wei === "string" || typeof body.add_tx_count === "number") {
    const { data: existing } = await supabase
      .from("leases")
      .select("total_gas_cost_wei, tx_count")
      .eq("lease_id", leaseId)
      .maybeSingle();

    const prevGas = BigInt(existing?.total_gas_cost_wei || "0");
    const addGas = BigInt(String(body.add_gas_cost_wei || "0"));
    patch.total_gas_cost_wei = (prevGas + addGas).toString();
    patch.tx_count = Number(existing?.tx_count || 0) + Number(body.add_tx_count || 1);
  }

  const { data, error } = await supabase
    .from("leases")
    .update(patch)
    .eq("lease_id", leaseId)
    .select("*")
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ lease: data });
}
