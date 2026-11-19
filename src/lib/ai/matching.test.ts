import { describe, expect, it } from "vitest";
import {
  boxCenterToNdc,
  findMatchingMoveInPin,
  mergeNearbyChanges,
  type DetectedChange,
  type MoveInPinRef,
} from "./matching";

describe("AI geometric pin matching & deduplication", () => {
  const moveInPins: MoveInPinRef[] = [
    {
      id: "pin-desk",
      position: [1.1, 0.78, 0.45],
      sealedAt: 1_763_600_000,
      coSigned: true,
      text: "Scratch on desk, already here",
      countsAsMoveIn: true,
    },
    {
      id: "pin-late",
      position: [2.25, 0.02, 2.05],
      sealedAt: 1_764_600_000,
      coSigned: false,
      text: "Pinned at move-out",
      countsAsMoveIn: false,
    },
  ];

  it("converts pixel box centers (origin top-left, y down) to Three.js NDC", () => {
    const center = boxCenterToNdc({ x: 412, y: 284, w: 200, h: 200 }, 1024, 768);
    expect(center.x).toBeCloseTo(0, 6);
    expect(center.y).toBeCloseTo(0, 6);

    const topLeft = boxCenterToNdc({ x: 0, y: 0, w: 0, h: 0 }, 1024, 768);
    expect(topLeft.x).toBeCloseTo(-1, 6);
    expect(topLeft.y).toBeCloseTo(1, 6);
  });

  it("matches by 3D distance <= 15 cm and ignores non-move-in pins", () => {
    const deskMatch = findMatchingMoveInPin({
      worldPosition: [1.14, 0.78, 0.46], // ~4.1 cm away
      moveInPins,
    });
    expect(deskMatch?.id).toBe("pin-desk");

    // Late pin sits right at carpet stain, must NEVER count as move-in evidence
    const lateMatch = findMatchingMoveInPin({
      worldPosition: [2.25, 0.02, 2.05],
      moveInPins,
    });
    expect(lateMatch).toBeNull();
  });

  it("matches by 2D box grown by 10%", () => {
    const match = findMatchingMoveInPin({
      box: { x: 400, y: 300, w: 100, h: 100 },
      projectedPins: [{ id: "pin-desk", x: 508, y: 350 }], // within +10px pad
      moveInPins,
    });
    expect(match?.id).toBe("pin-desk");
  });

  it("merges multi-view detections within 10 cm keeping higher confidence", () => {
    const changes: DetectedChange[] = [
      {
        view_id: "v1",
        box: { x: 10, y: 10, w: 50, h: 50 },
        title: "Stain",
        description: "Low conf",
        category: "possible_damage",
        confidence: "low",
        worldPosition: [2.25, 0.02, 2.05],
      },
      {
        view_id: "v2",
        box: { x: 20, y: 20, w: 50, h: 50 },
        title: "Dark stain on carpet",
        description: "High conf",
        category: "possible_damage",
        confidence: "high",
        worldPosition: [2.29, 0.02, 2.06], // ~4.1 cm away
      },
      {
        view_id: "v2",
        box: { x: 100, y: 100, w: 60, h: 40 },
        title: "Wall scuffs",
        description: "Separate spot",
        category: "possible_wear",
        confidence: "medium",
        worldPosition: [0.02, 0.4, 1.5],
      },
    ];
    const merged = mergeNearbyChanges(changes);
    expect(merged).toHaveLength(2);
    expect(merged[0].title).toBe("Dark stain on carpet");
    expect(merged[1].title).toBe("Wall scuffs");
  });
});
