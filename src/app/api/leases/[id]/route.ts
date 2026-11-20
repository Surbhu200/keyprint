import { NextRequest, NextResponse } from "next/server";
import type { Hex } from "viem";
import {
  createArcPublicClient,
  getEscrowAddress,
  KEYPRINT_ESCROW_ABI,
  RecordKind,
} from "@/lib/chain/arc";
import { resolveSettledBy } from "@/lib/chain/keeper-info";
import { readRecordsOnchain } from "@/lib/evidence/onchain-record";
import { REFERENCE_MOVE_IN_URL, REFERENCE_MOVE_OUT_URL } from "@/lib/sample/reference";
import {
  DEFAULT_STORAGE_BUCKET,
  getSupabaseAdmin,
  isSupabaseConfigured,
} from "@/lib/supabase/server";

const HEX32 = /^0x[0-9a-f]{64}$/;
const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";
const PLACEHOLDER_PATHS = new Set([REFERENCE_MOVE_IN_URL, REFERENCE_MOVE_OUT_URL]);

/** A scan path is either the bundled placeholder model or a file inside this lease's folder. */
function isAllowedScanPath(leaseId: string, path: unknown): path is string {
  if (typeof path !== "string" || path.length > 300 || path.includes("..")) return false;
  if (PLACEHOLDER_PATHS.has(path)) return true;
  return path.toLowerCase().startsWith(`leases/${leaseId}/`);
}

async function maybeSignUrl(leaseId: string, path: string | null | undefined): Promise<string | null> {
  if (!path) return null;
  if (PLACEHOLDER_PATHS.has(path)) return path;
  if (!isAllowedScanPath(leaseId, path)) return null;
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
  if (!HEX32.test(leaseId)) {
    return NextResponse.json({ error: "Invalid lease id." }, { status: 400 });
  }

  if (!isSupabaseConfigured()) {
    return NextResponse.json({
      configured: false,
      lease: null,
      records: [],
      reports: [],
      signedUrls: {},
    });
  }

  try {
    const supabase = getSupabaseAdmin();
    const [{ data: lease }, { data: records }, { data: reports }, { data: photoRows }] = await Promise.all([
      supabase.from("leases").select("*").eq("lease_id", leaseId).maybeSingle(),
      supabase
        .from("records")
        // Storage paths stay server-side; pages only need the sealed manifest and receipts.
        .select("record_id, unit_id, lease_id, kind, content_hash, author, manifest_json, tx_hash, block_number, gas_cost_wei, sealed_at")
        .eq("lease_id", leaseId)
        .order("sealed_at", { ascending: true })
        .limit(200),
      supabase
        .from("ai_reports")
        .select("cache_key, move_in_record_id, move_out_record_id, prompt_version, view_ids, report_json, created_at")
        .eq("lease_id", leaseId)
        .order("created_at", { ascending: false })
        .limit(5),
      // Pin close-up photos: their storage paths stay on the server; only signed links go out.
      supabase
        .from("records")
        .select("record_id, file_paths")
        .eq("lease_id", leaseId)
        .eq("kind", RecordKind.Pin)
        .limit(200),
    ]);

    const photoPrefix = `leases/${leaseId}/pins/`;
    const photoEntries: Array<[string, string]> = [];
    for (const row of photoRows ?? []) {
      const path = Array.isArray(row.file_paths) ? row.file_paths[0] : null;
      if (typeof path === "string" && !path.includes("..") && path.toLowerCase().startsWith(photoPrefix)) {
        photoEntries.push([String(row.record_id).toLowerCase(), path]);
      }
    }
    const pinPhotos: Record<string, string> = {};
    if (photoEntries.length > 0) {
      const { data: signed } = await supabase.storage
        .from(DEFAULT_STORAGE_BUCKET)
        .createSignedUrls(
          photoEntries.map(([, path]) => path),
          3600,
        );
      signed?.forEach((item, i) => {
        if (item.signedUrl && !item.error) pinPhotos[photoEntries[i][0]] = item.signedUrl;
      });
    }

    // Who sent the settlement: Keyprint's deadline keeper, a lease party, or someone else.
    const settledBy = lease?.settled_tx_hash
      ? await resolveSettledBy(lease.settled_tx_hash, {
          renter: lease.renter_address,
          landlord: lease.landlord_address,
        })
      : null;

    const [moveInUrl, moveOutUrl] = await Promise.all([
      maybeSignUrl(leaseId, lease?.move_in_scan_path),
      maybeSignUrl(leaseId, lease?.move_out_scan_path),
    ]);

    return NextResponse.json({
      configured: true,
      lease: lease ? { ...lease, settled_by: settledBy } : null,
      records: records ?? [],
      reports: reports ?? [],
      signedUrls: {
        moveInScan: moveInUrl,
        moveOutScan: moveOutUrl,
        pinPhotos,
      },
    });
  } catch (err) {
    console.error("GET /api/leases/[id] failed", err);
    return NextResponse.json({ error: "The lease could not be loaded." }, { status: 500 });
  }
}

/**
 * PATCH /api/leases/[id]
 * Updates cached display data for a lease. Nothing here can move money (that only happens
 * onchain), but every field is checked so the index can't be pointed at the wrong evidence:
 *  - scan paths: write-once, inside this lease's folder (or the bundled placeholder),
 *  - record ids: must match KeyprintEscrow.getLease or be sealed records of this lease,
 *  - tx hashes: the receipt must contain an escrow log for this lease,
 *  - gas totals: only incremented, never set.
 */
export async function PATCH(
  req: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  if (!isSupabaseConfigured()) {
    return NextResponse.json({ error: "The lease index is not configured." }, { status: 503 });
  }
  const escrow = getEscrowAddress();
  if (!escrow) {
    return NextResponse.json({ error: "The escrow address is not configured." }, { status: 503 });
  }

  const { id } = await context.params;
  const leaseId = id.toLowerCase();
  if (!HEX32.test(leaseId)) {
    return NextResponse.json({ error: "Invalid lease id." }, { status: 400 });
  }

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid payload." }, { status: 400 });
  }

  try {
    const client = createArcPublicClient();
    const lease = await client.readContract({
      address: escrow,
      abi: KEYPRINT_ESCROW_ABI,
      functionName: "getLease",
      args: [leaseId as Hex],
    });
    if (lease.landlord === ZERO_ADDRESS) {
      return NextResponse.json({ error: "This lease doesn't exist on Arc." }, { status: 404 });
    }

    const supabase = getSupabaseAdmin();
    const { data: existing } = await supabase
      .from("leases")
      .select("move_in_scan_path, move_out_scan_path, total_gas_cost_wei, tx_count")
      .eq("lease_id", leaseId)
      .maybeSingle();
    if (!existing) {
      return NextResponse.json({ error: "This lease isn't in the index yet." }, { status: 404 });
    }

    const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };

    if (typeof body.unit_name === "string" && body.unit_name.trim()) {
      patch.unit_name = body.unit_name.trim().slice(0, 80);
    }

    // Scan paths are write-once.
    if (!existing.move_in_scan_path && isAllowedScanPath(leaseId, body.move_in_scan_path)) {
      patch.move_in_scan_path = body.move_in_scan_path;
    }
    if (!existing.move_out_scan_path && isAllowedScanPath(leaseId, body.move_out_scan_path)) {
      patch.move_out_scan_path = body.move_out_scan_path;
    }

    // Record ids must agree with the contract.
    const moveInId = String(body.move_in_record_id ?? "").toLowerCase();
    if (moveInId && moveInId === lease.moveInRecordId.toLowerCase()) {
      patch.move_in_record_id = moveInId;
    }
    const moveOutId = String(body.move_out_record_id ?? "").toLowerCase();
    if (moveOutId && moveOutId === lease.moveOutRecordId.toLowerCase()) {
      patch.move_out_record_id = moveOutId;
    }

    // Alignment / report record ids must be sealed records of this lease, of the right kind.
    const wanted: Array<[string, string, number]> = [];
    const alignId = String(body.alignment_record_id ?? "").toLowerCase();
    if (HEX32.test(alignId)) wanted.push(["alignment_record_id", alignId, RecordKind.Alignment]);
    const reportId = String(body.report_record_id ?? "").toLowerCase();
    if (HEX32.test(reportId)) wanted.push(["report_record_id", reportId, RecordKind.Report]);
    if (wanted.length > 0) {
      const onchain = await readRecordsOnchain(wanted.map(([, rid]) => rid as Hex), client);
      for (const [col, rid, kind] of wanted) {
        const rec = onchain.get(rid);
        if (rec && rec.kind === kind && rec.leaseId.toLowerCase() === leaseId) {
          patch[col] = rid;
        }
      }
    }

    // Alignment cache: shape-checked only (it is display data; the sealed record is the truth).
    if (
      Array.isArray(body.alignment_matrix) &&
      body.alignment_matrix.length === 16 &&
      body.alignment_matrix.every((v) => typeof v === "number" && Number.isFinite(v))
    ) {
      patch.alignment_matrix = body.alignment_matrix;
    }
    if (body.alignment_metrics && typeof body.alignment_metrics === "object") {
      const m = body.alignment_metrics as Record<string, unknown>;
      if (
        typeof m.medianGapMeters === "number" &&
        typeof m.shareWithin5cm === "number" &&
        typeof m.passedGate === "boolean"
      ) {
        patch.alignment_metrics = {
          medianGapMeters: m.medianGapMeters,
          shareWithin5cm: m.shareWithin5cm,
          passedGate: m.passedGate,
          summaryText: typeof m.summaryText === "string" ? m.summaryText.slice(0, 200) : "",
          moveOutKey: typeof m.moveOutKey === "string" ? m.moveOutKey.slice(0, 300) : undefined,
          scale: typeof m.scale === "number" ? m.scale : undefined,
          floorTiltDeg: typeof m.floorTiltDeg === "number" ? m.floorTiltDeg : undefined,
        };
      }
    }

    // Tx hashes: keep only those whose receipt contains this lease's escrow log.
    // (Retried briefly: right after an action this server's RPC can lag a block behind.)
    for (const col of ["funded_tx_hash", "ended_tx_hash", "settled_tx_hash"] as const) {
      const h = String(body[col] ?? "").toLowerCase();
      if (!HEX32.test(h)) continue;
      for (let attempt = 0; attempt < 6; attempt++) {
        try {
          const receipt = await client.getTransactionReceipt({ hash: h as Hex });
          const ok =
            receipt.status === "success" &&
            receipt.logs.some(
              (log) =>
                log.address.toLowerCase() === escrow.toLowerCase() &&
                (log.topics[1] ?? "").toLowerCase() === leaseId,
            );
          if (ok) patch[col] = h;
          break;
        } catch {
          await new Promise((r) => setTimeout(r, 750));
        }
      }
    }

    // Gas totals: increment only, with sane bounds.
    const addGas = String(body.add_gas_cost_wei ?? "");
    if (/^\d{1,30}$/.test(addGas)) {
      const prevGas = /^\d{1,40}$/.test(String(existing.total_gas_cost_wei ?? ""))
        ? BigInt(existing.total_gas_cost_wei)
        : 0n;
      patch.total_gas_cost_wei = (prevGas + BigInt(addGas)).toString();
      const addTx = Number(body.add_tx_count ?? 1);
      patch.tx_count =
        Number(existing.tx_count || 0) + (Number.isInteger(addTx) && addTx > 0 && addTx <= 20 ? addTx : 1);
    }

    const { data, error } = await supabase
      .from("leases")
      .update(patch)
      .eq("lease_id", leaseId)
      .select("*")
      .maybeSingle();
    if (error) throw error;

    return NextResponse.json({ lease: data });
  } catch (err) {
    console.error("PATCH /api/leases/[id] failed", err);
    return NextResponse.json({ error: "The lease could not be updated." }, { status: 500 });
  }
}
