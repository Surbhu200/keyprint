import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import {
  ALLOWED_UPLOAD_MIMES,
  DEFAULT_STORAGE_BUCKET,
  getSupabaseAdmin,
  isSupabaseConfigured,
  MAX_UPLOAD_BYTES,
} from "@/lib/supabase/server";

/** Folders the app actually uploads to; anything else is refused. */
const ALLOWED_SCOPE = /^(leases\/0x[0-9a-f]{64}(\/(pins|renders))?|solo|solo-photos|lab)$/;

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
    // A lease folder alone is 73 characters ("leases/" + 66-char id), so allow room for a subfolder.
    const scope = (body.scope || "uploads").replace(/[^a-zA-Z0-9/_-]/g, "").slice(0, 120).toLowerCase();
    if (!ALLOWED_SCOPE.test(scope)) {
      return NextResponse.json({ error: "Unsupported upload folder." }, { status: 400 });
    }

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
      console.error("createSignedUploadUrl failed", error);
      return NextResponse.json(
        { error: "Private storage isn't available right now. Try again in a moment." },
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
    console.error("POST /api/upload-url failed", err);
    return NextResponse.json({ error: "Invalid upload request." }, { status: 400 });
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
  // Only files inside the app's own upload folders can be signed for reading.
  const folder = objectPath.split("/").slice(0, -1).join("/").toLowerCase();
  if (!ALLOWED_SCOPE.test(folder)) {
    return NextResponse.json({ error: "Valid storage path required." }, { status: 400 });
  }

  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase.storage
    .from(DEFAULT_STORAGE_BUCKET)
    .createSignedUrl(objectPath, 3600);

  if (error || !data) {
    return NextResponse.json({ error: "File not found." }, { status: 404 });
  }

  return NextResponse.json({ path: objectPath, signedUrl: data.signedUrl });
}
