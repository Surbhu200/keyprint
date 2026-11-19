import { describe, expect, it } from "vitest";
import { computeRecordId, formatDollars, formatNativeUsdcFee, RecordKind } from "./arc";

describe("Arc helpers & Solidity recordId parity", () => {
  it("computes the exact same recordId as KeyprintRegistry.sol", () => {
    // Verified directly against Foundry cast keccak(abi.encode(author, contentHash, uint8(5)))
    const expectedFromSolidity =
      "0x451a395d996336f4ce2e999985e97c649d51d71613c7d6953a15b08a0abef6ff";
    const computed = computeRecordId(
      "0x1111111111111111111111111111111111111111",
      "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      RecordKind.ClaimEvidence,
    );
    expect(computed).toBe(expectedFromSolidity);
  });

  it("formats 6-decimal ERC-20 USDC dollars and 18-decimal native gas fees cleanly", () => {
    expect(formatDollars(200_000_000n)).toBe("$200");
    expect(formatDollars(40_500_000n)).toBe("$40.50");
    expect(formatNativeUsdcFee(4_200_000_000_000_000n)).toBe("$0.0042");
  });
});
