import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin, isSupabaseConfigured } from "@/lib/supabase/server";

export async function GET(req: NextRequest) {
  if (!isSupabaseConfigured()) {
    return NextResponse.json({ records: [], configured: false });
  }

  const recordId = req.nextUrl.searchParams.get("recordId")?.trim().toLowerCase();
  const leaseId = req.nextUrl.searchParams.get("leaseId")?.trim().toLowerCase();
  const fileSha256 = req.nextUrl.searchParams.get("fileSha256")?.trim().toLowerCase();

  const supabase = getSupabaseAdmin();

  if (recordId) {
    const { data, error } = await supabase
      .from("records")
      .select("*")
      .eq("record_id", recordId)
      .maybeSingle();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ record: data ?? null, records: data ? [data] : [] });
  }

  let query = supabase
    .from("records")
    .select("*")
    .order("sealed_at", { ascending: false })
    .limit(100);

  if (leaseId) {
    query = query.eq("lease_id", leaseId);
  }

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  let records = data ?? [];
  if (fileSha256) {
    records = records.filter((r) =>
      String(r.manifest_json || "").toLowerCase().includes(fileSha256),
    );
  }

  return NextResponse.json({ records, configured: true });
}

export async function POST(req: NextRequest) {
  if (!isSupabaseConfigured()) {
    return NextResponse.json({ error: "Supabase is not configured." }, { status: 503 });
  }

  try {
    const body = (await req.json()) as {
      record_id?: string;
      unit_id?: string;
      lease_id?: string;
      kind?: number;
      content_hash?: string;
      author?: string;
      manifest_json?: string;
      file_paths?: string[];
      tx_hash?: string | null;
      block_number?: number | string | null;
      gas_cost_wei?: string | null;
    };

    if (
      !body.record_id ||
      !body.content_hash ||
      !body.author ||
      !body.manifest_json ||
      body.kind === undefined
    ) {
      return NextResponse.json(
        { error: "record_id, kind, content_hash, author, and manifest_json are required." },
        { status: 400 },
      );
    }

    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from("records")
      .upsert(
        {
          record_id: body.record_id.toLowerCase(),
          unit_id: (body.unit_id || "0x" + "0".repeat(64)).toLowerCase(),
          lease_id: (body.lease_id || "0x" + "0".repeat(64)).toLowerCase(),
          kind: Number(body.kind),
          content_hash: body.content_hash.toLowerCase(),
          author: body.author.toLowerCase(),
          manifest_json: body.manifest_json,
          file_paths: body.file_paths ?? [],
          tx_hash: body.tx_hash ?? null,
          block_number: body.block_number ? Number(body.block_number) : null,
          gas_cost_wei: body.gas_cost_wei ?? "0",
        },
        { onConflict: "record_id" },
      )
      .select("*")
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ record: data });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Invalid record payload." },
      { status: 400 },
    );
  }
}
