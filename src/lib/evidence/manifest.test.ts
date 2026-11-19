import { describe, expect, it } from "vitest";
import { canonicalizeAndHash, ZERO_BYTES32 } from "./manifest";

describe("RFC 8785 manifest canonicalization & hashing", () => {
  it("produces identical SHA-256 contentHash regardless of JSON key insertion order", async () => {
    const a = {
      type: "keyprint.evidence.v1" as const,
      leaseId: ZERO_BYTES32,
      unitId: ZERO_BYTES32,
      kind: "MoveInScan" as const,
      files: [
        {
          role: "model" as const,
          sha256: "9efce5b37c1922c58448d979d81e6affd64954171ff006a503274c2d4d37fbd6",
          bytes: 2798452,
          mime: "model/gltf-binary",
        },
      ],
      capturedAtClient: "2026-11-19T02:21:00Z",
      app: "keyprint-web/0.1",
    };

    const b = {
      app: "keyprint-web/0.1",
      capturedAtClient: "2026-11-19T02:21:00Z",
      files: [
        {
          mime: "model/gltf-binary",
          bytes: 2798452,
          sha256: "9efce5b37c1922c58448d979d81e6affd64954171ff006a503274c2d4d37fbd6",
          role: "model" as const,
        },
      ],
      kind: "MoveInScan" as const,
      unitId: ZERO_BYTES32,
      leaseId: ZERO_BYTES32,
      type: "keyprint.evidence.v1" as const,
    };

    const resA = await canonicalizeAndHash(a);
    const resB = await canonicalizeAndHash(b);
    expect(resA.canonicalJson).toBe(resB.canonicalJson);
    expect(resA.contentHash).toBe(resB.contentHash);
    expect(resA.contentHash).toMatch(/^0x[0-9a-f]{64}$/);
  });

  it("changes contentHash completely if a single character in a file hash changes", async () => {
    const base = {
      type: "keyprint.evidence.v1" as const,
      leaseId: ZERO_BYTES32,
      unitId: ZERO_BYTES32,
      kind: "MoveInScan" as const,
      files: [
        {
          role: "model" as const,
          sha256: "9efce5b37c1922c58448d979d81e6affd64954171ff006a503274c2d4d37fbd6",
          bytes: 2798452,
          mime: "model/gltf-binary",
        },
      ],
      capturedAtClient: "2026-11-19T02:21:00Z",
      app: "keyprint-web/0.1",
    };
    const tampered = {
      ...base,
      files: [{ ...base.files[0], sha256: "96fc438086f9d978bef62709529e0c95cdae547b17b5d4fd4834d5220b63f94e" }],
    };

    const r1 = await canonicalizeAndHash(base);
    const r2 = await canonicalizeAndHash(tampered);
    expect(r1.contentHash).not.toBe(r2.contentHash);
  });
});
