import { NextRequest, NextResponse } from "next/server";
import {
  AI_PROMPT_VERSION,
  analyzeRenderPairs,
  type ChangeReportOutput,
  type RenderPairInput,
} from "@/lib/ai/analyze";
import type { ProjectedPin2D } from "@/lib/ai/matching";
import {
  DEFAULT_STORAGE_BUCKET,
  getSupabaseAdmin,
  isSupabaseConfigured,
} from "@/lib/supabase/server";

export const maxDuration = 300; // Vercel Hobby Fluid Compute max

interface AnalyzePairRequest {
  viewId: string;
  pins: ProjectedPin2D[];
  beforePath?: string;
  afterPath?: string;
  beforeBase64?: string;
  afterBase64?: string;
}

async function loadImageBase64(
  storagePath?: string,
  inlineBase64?: string,
): Promise<string> {
  if (storagePath && isSupabaseConfigured()) {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase.storage
      .from(DEFAULT_STORAGE_BUCKET)
      .download(storagePath);
    if (error || !data) {
      throw new Error(`Could not download render from storage: ${storagePath}`);
    }
    const buf = Buffer.from(await data.arrayBuffer());
    return buf.toString("base64");
  }
  if (inlineBase64) {
    return inlineBase64.replace(/^data:image\/\w+;base64,/, "");
  }
  throw new Error("Render pair requires either storage paths or base64 image data.");
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as {
      leaseId?: string;
      moveInRecordId?: string;
      moveOutRecordId?: string;
      pairs?: AnalyzePairRequest[];
      forceRefresh?: boolean;
    };

    const leaseId = (body.leaseId || "solo").toLowerCase();
    const moveInRecordId = (body.moveInRecordId || "move-in").toLowerCase();
    const moveOutRecordId = (body.moveOutRecordId || "move-out").toLowerCase();
    const rawPairs = body.pairs ?? [];

    if (rawPairs.length === 0 || rawPairs.length > 12) {
      return NextResponse.json(
        { error: "Provide between 1 and 12 render viewpoint pairs." },
        { status: 400 },
      );
    }

    // Cache key uses record IDs + view IDs + prompt version (never image bytes)
    const viewIds = rawPairs.map((p) => p.viewId).sort();
    const cacheKey = `${moveInRecordId}:${moveOutRecordId}:${viewIds.join(",")}:${AI_PROMPT_VERSION}`;

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
          ? p.pins.map((pin) => ({
              id: String(pin.id),
              x: Math.round(Number(pin.x)),
              y: Math.round(Number(pin.y)),
            }))
          : [],
        beforeBase64: await loadImageBase64(p.beforePath, p.beforeBase64),
        afterBase64: await loadImageBase64(p.afterPath, p.afterBase64),
      })),
    );

    const liveReport = await analyzeRenderPairs(pairs);

    if (liveReport) {
      if (isSupabaseConfigured()) {
        const supabase = getSupabaseAdmin();
        await supabase.from("ai_reports").upsert(
          {
            cache_key: cacheKey,
            lease_id: leaseId,
            move_in_record_id: moveInRecordId,
            move_out_record_id: moveOutRecordId,
            prompt_version: AI_PROMPT_VERSION,
            view_ids: viewIds,
            report_json: liveReport,
          },
          { onConflict: "cache_key" },
        );
      }

      return NextResponse.json({
        source: "live",
        cacheKey,
        promptVersion: AI_PROMPT_VERSION,
        report: liveReport,
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
      note: "AI comparison unavailable; use manual 'Add change' to mark items yourself.",
    });
  } catch (err) {
    return NextResponse.json(
      {
        source: "manual-fallback",
        report: null,
        error: err instanceof Error ? err.message : "Analysis failed.",
      },
      { status: 500 },
    );
  }
}
