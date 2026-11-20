import { NextRequest, NextResponse } from "next/server";
import type { Hex } from "viem";
import {
  AI_PROMPT_VERSION,
  analyzeRenderPairs,
  type ChangeReportOutput,
  type RenderPairInput,
} from "@/lib/ai/analyze";
import type { ProjectedPin2D } from "@/lib/ai/matching";
import { createArcPublicClient, getEscrowAddress, KEYPRINT_ESCROW_ABI } from "@/lib/chain/arc";
import {
  DEFAULT_STORAGE_BUCKET,
  getSupabaseAdmin,
  isSafeStoragePath,
  isSupabaseConfigured,
} from "@/lib/supabase/server";

// Seconds. Worst case stays inside this: Claude 80 s, then parallel Gemini batches (45 s race + 35 s backup).
export const maxDuration = 300;
const MAX_RENDER_BYTES = 3 * 1024 * 1024; // renders are ~100-300 KB JPEGs
const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";

const HEX32 = /^0x[0-9a-f]{64}$/;
const MOVE_OUT_KEY = /^(0x[0-9a-f]{64}|sha256:[0-9a-f]{64})$/;
const VIEW_ID = /^[a-z0-9:_-]{1,90}$/i;
const MAX_INLINE_BASE64_CHARS = 3_500_000; // keep inline fallbacks under Vercel's 4.5 MB body cap

interface AnalyzePairRequest {
  viewId: string;
  pins: ProjectedPin2D[];
  beforePath?: string;
  afterPath?: string;
  beforeBase64?: string;
  afterBase64?: string;
}

function bad(status: number, error: string) {
  return NextResponse.json({ source: "manual-fallback", report: null, error }, { status });
}

async function loadImageBase64(
  leaseId: string,
  storagePath?: string,
  inlineBase64?: string,
): Promise<string> {
  if (storagePath) {
    // Only this lease's own render folder may be read.
    const prefix = `leases/${leaseId}/renders/`;
    if (
      !isSupabaseConfigured() ||
      storagePath.includes("..") ||
      !isSafeStoragePath(storagePath) ||
      !storagePath.toLowerCase().startsWith(prefix)
    ) {
      throw new Error("Render path is not allowed.");
    }
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase.storage
      .from(DEFAULT_STORAGE_BUCKET)
      .download(storagePath);
    if (error || !data) {
      throw new Error("A render could not be read from storage.");
    }
    if (data.size > MAX_RENDER_BYTES) {
      throw new Error("A render is too large.");
    }
    return Buffer.from(await data.arrayBuffer()).toString("base64");
  }
  if (inlineBase64) {
    return inlineBase64.replace(/^data:image\/\w+;base64,/, "");
  }
  throw new Error("Render pair requires either storage paths or base64 image data.");
}

export async function POST(req: NextRequest) {
  let body: {
    leaseId?: string;
    moveInRecordId?: string;
    moveOutRecordId?: string;
    pairs?: AnalyzePairRequest[];
    forceRefresh?: boolean;
  };
  try {
    body = await req.json();
  } catch {
    return bad(400, "Invalid request.");
  }

  const leaseId = String(body.leaseId ?? "").toLowerCase();
  const moveInRecordId = String(body.moveInRecordId ?? "").toLowerCase();
  const moveOutRecordId = String(body.moveOutRecordId ?? "").toLowerCase();
  const rawPairs = Array.isArray(body.pairs) ? body.pairs : [];

  if (!HEX32.test(leaseId) || !HEX32.test(moveInRecordId) || !MOVE_OUT_KEY.test(moveOutRecordId)) {
    return bad(400, "A lease id, a move-in record id and a move-out record id or fingerprint are required.");
  }
  if (rawPairs.length === 0 || rawPairs.length > 12) {
    return bad(400, "Provide between 1 and 12 render viewpoint pairs.");
  }
  if (rawPairs.some((p) => !VIEW_ID.test(String(p.viewId ?? "")))) {
    return bad(400, "Invalid view id.");
  }
  const inlineChars = rawPairs.reduce(
    (n, p) => n + (p.beforeBase64?.length ?? 0) + (p.afterBase64?.length ?? 0),
    0,
  );
  if (inlineChars > MAX_INLINE_BASE64_CHARS) {
    return bad(413, "Too much image data in one request. Upload renders to storage first.");
  }

  // Only a real lease, compared against its own sealed move-in record, can use the AI.
  const escrow = getEscrowAddress();
  if (!escrow) return bad(503, "The escrow address is not configured.");
  try {
    const lease = await createArcPublicClient().readContract({
      address: escrow,
      abi: KEYPRINT_ESCROW_ABI,
      functionName: "getLease",
      args: [leaseId as Hex],
    });
    if (lease.landlord === ZERO_ADDRESS || lease.moveInRecordId.toLowerCase() !== moveInRecordId) {
      return bad(403, "This comparison doesn't match a lease on Arc.");
    }
  } catch {
    return bad(503, "Couldn't check the lease on Arc. Try again in a moment.");
  }

  try {
    // Cache identity: lease + both sealed records (or the move-out file's fingerprint)
    // + views + prompt version. Never image bytes, so a live re-alignment still hits.
    const viewIds = rawPairs.map((p) => p.viewId).sort();
    const cacheKey = `${leaseId}:${moveInRecordId}:${moveOutRecordId}:${viewIds.join(",")}:${AI_PROMPT_VERSION}`;

    let cachedReport: ChangeReportOutput | null = null;
    if (isSupabaseConfigured()) {
      const supabase = getSupabaseAdmin();
      const { data } = await supabase
        .from("ai_reports")
        .select("report_json")
        .eq("cache_key", cacheKey)
        .maybeSingle();
      if (data?.report_json) {
        cachedReport = data.report_json as ChangeReportOutput;
      }
    }

    if (cachedReport && !body.forceRefresh) {
      return NextResponse.json({
        source: "cache",
        cacheKey,
        promptVersion: AI_PROMPT_VERSION,
        report: cachedReport,
      });
    }

    const pairs: RenderPairInput[] = await Promise.all(
      rawPairs.map(async (p) => ({
        viewId: p.viewId,
        pins: Array.isArray(p.pins)
          ? p.pins
              .filter((pin) => Number.isFinite(Number(pin.x)) && Number.isFinite(Number(pin.y)))
              .slice(0, 50)
              .map((pin) => ({
                id: String(pin.id).slice(0, 80),
                x: Math.round(Number(pin.x)),
                y: Math.round(Number(pin.y)),
              }))
          : [],
        beforeBase64: await loadImageBase64(leaseId, p.beforePath, p.beforeBase64),
        afterBase64: await loadImageBase64(leaseId, p.afterPath, p.afterBase64),
      })),
    );

    const liveResult = await analyzeRenderPairs(pairs);

    if (liveResult) {
      if (isSupabaseConfigured()) {
        // Insert-only: an existing cached report for these exact scans is never overwritten.
        const supabase = getSupabaseAdmin();
        await supabase.from("ai_reports").upsert(
          {
            cache_key: cacheKey,
            lease_id: leaseId,
            move_in_record_id: moveInRecordId,
            move_out_record_id: moveOutRecordId,
            prompt_version: AI_PROMPT_VERSION,
            view_ids: viewIds,
            report_json: liveResult.report,
          },
          { onConflict: "cache_key", ignoreDuplicates: true },
        );
      }

      return NextResponse.json({
        source: "live",
        model: liveResult.model,
        cacheKey,
        promptVersion: AI_PROMPT_VERSION,
        report: liveResult.report,
      });
    }

    // Fallback order per spec: live -> cache -> manual mode
    if (cachedReport) {
      return NextResponse.json({
        source: "cache-fallback",
        cacheKey,
        promptVersion: AI_PROMPT_VERSION,
        report: cachedReport,
      });
    }

    return NextResponse.json({
      source: "manual-fallback",
      cacheKey,
      promptVersion: AI_PROMPT_VERSION,
      report: null,
      note: "The AI comparison isn't available right now. Add changes by hand below.",
    });
  } catch (err) {
    console.error("POST /api/analyze failed", err);
    return bad(500, "The AI comparison isn't available right now. Add changes by hand below.");
  }
}
