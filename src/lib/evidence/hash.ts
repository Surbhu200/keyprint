import { createSHA256 } from "hash-wasm";
import type { Hex } from "viem";

/**
 * Hashes a Blob / File in streaming chunks via hash-wasm so large .glb scans
 * never have to sit fully decoded in memory at once.
 */
export async function sha256Blob(
  blob: Blob,
  onProgress?: (percent: number) => void,
): Promise<string> {
  const hasher = await createSHA256();
  hasher.init();

  const total = blob.size || 1;
  let processed = 0;

  if (typeof blob.stream === "function") {
    const reader = blob.stream().getReader();
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value) {
        hasher.update(value);
        processed += value.byteLength;
        onProgress?.(Math.min(100, Math.round((processed / total) * 100)));
      }
    }
  } else {
    const chunkSize = 2 * 1024 * 1024;
    for (let offset = 0; offset < blob.size; offset += chunkSize) {
      const slice = await blob.slice(offset, offset + chunkSize).arrayBuffer();
      hasher.update(new Uint8Array(slice));
      processed += slice.byteLength;
      onProgress?.(Math.min(100, Math.round((processed / total) * 100)));
    }
  }

  return hasher.digest("hex");
}

export async function sha256Bytes(bytes: Uint8Array): Promise<string> {
  const hasher = await createSHA256();
  hasher.init();
  hasher.update(bytes);
  return hasher.digest("hex");
}

export async function sha256Text(text: string): Promise<string> {
  return sha256Bytes(new TextEncoder().encode(text));
}

export function sha256HexToBytes32(hex64: string): Hex {
  const clean = hex64.replace(/^0x/i, "").toLowerCase();
  if (!/^[0-9a-f]{64}$/.test(clean)) {
    throw new Error(`Invalid SHA-256 hex string: ${hex64}`);
  }
  return `0x${clean}` as Hex;
}
