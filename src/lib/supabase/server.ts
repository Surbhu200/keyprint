import { createClient, type SupabaseClient } from "@supabase/supabase-js";

export const DEFAULT_STORAGE_BUCKET =
  process.env.SUPABASE_STORAGE_BUCKET?.trim() || "keyprint-private";

export const MAX_UPLOAD_BYTES = 50 * 1024 * 1024; // Supabase free plan 50 MB limit

export const ALLOWED_UPLOAD_MIMES = new Set([
  "model/gltf-binary",
  "application/octet-stream",
  "image/jpeg",
  "image/png",
  "image/webp",
  "application/json",
]);

let cachedClient: SupabaseClient | null = null;

export function isSupabaseConfigured(): boolean {
  return Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() &&
      process.env.SUPABASE_SERVICE_ROLE_KEY?.trim(),
  );
}

/**
 * Returns a server-only Supabase admin client using SUPABASE_SERVICE_ROLE_KEY
 * for minting signed upload/download URLs and reading/writing index tables.
 */
export function getSupabaseAdmin(): SupabaseClient {
  if (cachedClient) return cachedClient;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();

  if (!url || !serviceKey) {
    throw new Error(
      "Supabase is not configured. Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env.local.",
    );
  }

  cachedClient = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return cachedClient;
}
