import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import {
  ALLOWED_UPLOAD_MIMES,
  DEFAULT_STORAGE_BUCKET,
  getSupabaseAdmin,
  isSupabaseConfigured,
  MAX_UPLOAD_BYTES,
} from "@/lib/supabase/server";

function sanitizeFilename(name: string): string {
  const base = name.split(/[\\/]/).pop() || "file.bin";
  return base.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 120);
}

/**
 * POST /api/upload-url
 * Mints a short-lived Supabase private bucket signed upload URL so large .glb
 * scans and JPEG renders upload directly from the browser (bypassing Vercel's 4.5 MB limit).
 */
export async function POST(req: NextRequest) {
  if (!isSupabaseConfigured()) {
    return NextResponse.json(
      {
        error:
          "Supabase is not configured. Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env.local.",
      },
      { status: 503 },
    );
  }

  try {
    const body = (await req.json()) as {
      filename?: string;
      contentType?: string;
      bytes?: number;
      scope?: string;
    };

    const filename = sanitizeFilename(body.filename || "scan.glb");
    const contentType = (body.contentType || "application/octet-stream").toLowerCase();
    const bytes = Number(body.bytes ?? 0);
    const scope = (body.scope || "uploads").replace(/[^a-zA-Z0-9/_-]/g, "").slice(0, 80);

    if (!Number.isFinite(bytes) || bytes <= 0 || bytes > MAX_UPLOAD_BYTES) {
      return NextResponse.json(
        { error: `File size must be between 1 byte and ${MAX_UPLOAD_BYTES / (1024 * 1024)} MB.` },
        { status: 400 },
      );
    }

    const isGlb = filename.toLowerCase().endsWith(".glb");
    if (!isGlb && !ALLOWED_UPLOAD_MIMES.has(contentType)) {
      return NextResponse.json(
        { error: `Unsupported file type: ${contentType}` },
        { status: 400 },
      );
    }

    const objectPath = `${scope}/${Date.now()}-${randomUUID().slice(0, 8)}-${filename}`;
    const supabase = getSupabaseAdmin();

    const { data, error } = await supabase.storage
      .from(DEFAULT_STORAGE_BUCKET)
      .createSignedUploadUrl(objectPath);

    if (error || !data) {
      return NextResponse.json(
        {
          error:
            error?.message ||
            `Failed to create signed upload URL for bucket "${DEFAULT_STORAGE_BUCKET}". Run supabase/schema.sql first.`,
        },
        { status: 500 },
      );
    }

    return NextResponse.json({
      bucket: DEFAULT_STORAGE_BUCKET,
      path: data.path,
      token: data.token,
      signedUrl: data.signedUrl,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Invalid upload request." },
      { status: 400 },
    );
  }
}

/**
 * GET /api/upload-url?path=...
 * Mints a short-lived signed read URL (1 hour) for a private bucket object.
 */
export async function GET(req: NextRequest) {
  if (!isSupabaseConfigured()) {
    return NextResponse.json(
      { error: "Supabase is not configured." },
      { status: 503 },
    );
  }

  const objectPath = req.nextUrl.searchParams.get("path")?.trim();
  if (!objectPath || objectPath.includes("..")) {
    return NextResponse.json({ error: "Valid storage path required." }, { status: 400 });
  }

  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase.storage
    .from(DEFAULT_STORAGE_BUCKET)
    .createSignedUrl(objectPath, 3600);

  if (error || !data) {
    return NextResponse.json(
      { error: error?.message || "Failed to create signed download URL." },
      { status: 404 },
    );
  }

  return NextResponse.json({ path: objectPath, signedUrl: data.signedUrl });
}
