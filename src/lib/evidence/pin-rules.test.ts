import { describe, expect, it } from "vitest";
import { countsAsMoveInPin } from "./pin-rules";

const renter = "0x1111111111111111111111111111111111111111";
const landlord = "0x2222222222222222222222222222222222222222";
const lease = { renter, reviewWindow: 600, fundedAt: 1_000 };

describe("countsAsMoveInPin", () => {
  it("counts a renter pin sealed with the move-in record", () => {
    expect(
      countsAsMoveInPin({ pinAuthor: renter, pinCreatedAt: 1_000, coSignedByLandlord: false, lease, moveInCreatedAt: 1_000 }),
    ).toBe(true);
  });

  it("counts a renter pin at the very end of the review window, not one second later", () => {
    expect(
      countsAsMoveInPin({ pinAuthor: renter, pinCreatedAt: 1_600, coSignedByLandlord: false, lease, moveInCreatedAt: 1_000 }),
    ).toBe(true);
    expect(
      countsAsMoveInPin({ pinAuthor: renter, pinCreatedAt: 1_601, coSignedByLandlord: false, lease, moveInCreatedAt: 1_000 }),
    ).toBe(false);
  });

  it("counts a late renter pin only when the landlord co-signed it", () => {
    expect(
      countsAsMoveInPin({ pinAuthor: renter, pinCreatedAt: 9_999, coSignedByLandlord: true, lease, moveInCreatedAt: 1_000 }),
    ).toBe(true);
  });

  it("never counts the landlord's own pins, pins sealed before move-in, or unknown times", () => {
    expect(
      countsAsMoveInPin({ pinAuthor: landlord, pinCreatedAt: 1_000, coSignedByLandlord: true, lease, moveInCreatedAt: 1_000 }),
    ).toBe(false);
    expect(
      countsAsMoveInPin({ pinAuthor: renter, pinCreatedAt: 999, coSignedByLandlord: false, lease, moveInCreatedAt: 1_000 }),
    ).toBe(false);
    expect(
      countsAsMoveInPin({ pinAuthor: renter, pinCreatedAt: null, coSignedByLandlord: false, lease, moveInCreatedAt: 1_000 }),
    ).toBe(false);
  });

  it("is false while the lease or the move-in anchor is unknown", () => {
    expect(
      countsAsMoveInPin({ pinAuthor: renter, pinCreatedAt: 1_000, coSignedByLandlord: false, lease: null }),
    ).toBe(false);
    expect(
      countsAsMoveInPin({
        pinAuthor: renter,
        pinCreatedAt: 1_000,
        coSignedByLandlord: false,
        lease: { ...lease, fundedAt: 0 },
        moveInCreatedAt: null,
      }),
    ).toBe(false);
  });
});
