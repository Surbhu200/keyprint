"use client";

/**
 * Saves a sealed record's exact canonical manifest bytes to the index (/api/records).
 *
 * The bytes only exist in this browser until they are saved, and they can't be rebuilt
 * later (they include capture times), so:
 *   1. a copy is kept in localStorage before the POST,
 *   2. the POST is retried (the server waits for Arc to show the record),
 *   3. the local copy is removed only after the server confirms it,
 *   4. retryPendingRecordSaves() re-sends any leftovers next time a lease page opens.
 */
export interface RecordSavePayload {
  record_id: string;
  lease_id: string;
  manifest_json: string;
  file_paths?: string[];
  tx_hash?: string | null;
  gas_cost_wei?: string | null;
}

const PREFIX = "keyprint.pending-record.";

function backupKey(recordId: string) {
  return `${PREFIX}${recordId.toLowerCase()}`;
}

function writeBackup(payload: RecordSavePayload) {
  try {
    window.localStorage.setItem(backupKey(payload.record_id), JSON.stringify(payload));
  } catch {
    // Storage full or blocked: the POST below is still attempted.
  }
}

function clearBackup(recordId: string) {
  try {
    window.localStorage.removeItem(backupKey(recordId));
  } catch {
    // ignore
  }
}

type PostResult = { ok: boolean; retryable: boolean; status?: number; error?: string };

async function postOnce(payload: RecordSavePayload): Promise<PostResult> {
  try {
    const res = await fetch("/api/records", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (res.ok) return { ok: true, retryable: false };
    const data = (await res.json().catch(() => null)) as { error?: string } | null;
    // 409 = not visible on Arc yet; 5xx = server/index hiccup. 4xx otherwise won't improve.
    const retryable = res.status === 409 || res.status >= 500;
    return { ok: false, retryable, status: res.status, error: data?.error || `HTTP ${res.status}` };
  } catch (err) {
    return { ok: false, retryable: true, error: err instanceof Error ? err.message : "Network error" };
  }
}

async function postWithRetries(payload: RecordSavePayload): Promise<{ ok: boolean; error?: string }> {
  let last: PostResult = { ok: false, retryable: true };
  for (let attempt = 0; attempt < 3; attempt++) {
    last = await postOnce(payload);
    if (last.ok) {
      clearBackup(payload.record_id);
      return { ok: true };
    }
    if (!last.retryable) {
      // 422 = the bytes don't match what is sealed on Arc: keeping them can't help.
      // Any other refusal keeps the local copy, since it is the only one.
      if (last.status === 422) clearBackup(payload.record_id);
      return { ok: false, error: last.error };
    }
    if (attempt < 2) await new Promise((r) => setTimeout(r, 1500 * (attempt + 1)));
  }
  return { ok: false, error: last.error };
}

export async function saveRecordManifest(payload: RecordSavePayload): Promise<{ ok: boolean; error?: string }> {
  writeBackup(payload);
  return postWithRetries(payload);
}

/** Saves several records; returns how many failed (their local copies are kept for a retry). */
export async function saveRecordManifests(payloads: RecordSavePayload[]): Promise<number> {
  // Back up every manifest first, so leaving the page mid-save can't lose the later ones.
  for (const p of payloads) writeBackup(p);
  let failed = 0;
  for (const p of payloads) {
    const res = await postWithRetries(p);
    if (!res.ok) failed += 1;
  }
  return failed;
}

/** Re-sends any manifests that were sealed but never confirmed by the index. */
export async function retryPendingRecordSaves(leaseId?: string): Promise<void> {
  if (typeof window === "undefined") return;
  const keys: string[] = [];
  try {
    for (let i = 0; i < window.localStorage.length; i++) {
      const k = window.localStorage.key(i);
      if (k && k.startsWith(PREFIX)) keys.push(k);
    }
  } catch {
    return;
  }
  for (const k of keys) {
    let payload: RecordSavePayload | null = null;
    try {
      payload = JSON.parse(window.localStorage.getItem(k) || "null") as RecordSavePayload | null;
    } catch {
      payload = null;
    }
    if (!payload?.record_id) {
      try {
        window.localStorage.removeItem(k);
      } catch {
        // ignore
      }
      continue;
    }
    if (leaseId && payload.lease_id.toLowerCase() !== leaseId.toLowerCase()) continue;
    const res = await postOnce(payload);
    if (res.ok || res.status === 422) clearBackup(payload.record_id);
  }
}
