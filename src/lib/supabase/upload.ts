"use client";

export interface SignedUploadResult {
  bucket: string;
  path: string;
  signedUrl: string;
}

/**
 * Uploads any Blob/File directly from the browser to Supabase private storage
 * using a short-lived signed upload URL from /api/upload-url (bypasses Vercel's 4.5 MB cap).
 */
export async function uploadToPrivateStorage(params: {
  file: Blob;
  filename: string;
  contentType?: string;
  scope?: string;
}): Promise<SignedUploadResult> {
  const contentType =
    params.contentType || params.file.type || "application/octet-stream";

  const res = await fetch("/api/upload-url", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      filename: params.filename,
      contentType,
      bytes: params.file.size,
      scope: params.scope ?? "scans",
    }),
  });

  const payload = (await res.json()) as {
    bucket?: string;
    path?: string;
    signedUrl?: string;
    token?: string;
    error?: string;
  };

  if (!res.ok || !payload.signedUrl || !payload.path) {
    throw new Error(payload.error || "Failed to request signed upload URL.");
  }

  const putRes = await fetch(payload.signedUrl, {
    method: "PUT",
    headers: {
      "Content-Type": contentType,
      "x-upsert": "true",
    },
    body: params.file,
  });

  if (!putRes.ok) {
    const errText = await putRes.text().catch(() => "");
    throw new Error(`Storage upload failed (${putRes.status}): ${errText}`);
  }

  return {
    bucket: payload.bucket || "keyprint-private",
    path: payload.path,
    signedUrl: payload.signedUrl,
  };
}

export async function getSignedReadUrl(storagePath: string): Promise<string> {
  const res = await fetch(
    `/api/upload-url?path=${encodeURIComponent(storagePath)}`,
  );
  const data = (await res.json()) as { signedUrl?: string; error?: string };
  if (!res.ok || !data.signedUrl) {
    throw new Error(data.error || "Could not sign private download URL.");
  }
  return data.signedUrl;
}
