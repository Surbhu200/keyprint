import { describe, expect, it } from "vitest";
import { fromGeminiBox, normalizeReport } from "./analyze";

describe("fromGeminiBox", () => {
  it("turns Gemini's 0-1000 [ymin, xmin, ymax, xmax] into a 1024x768 pixel box", () => {
    // The floor stain in the synthetic test render sits at about x 560-720, y 560-650 px.
    expect(fromGeminiBox([729, 547, 851, 703])).toEqual({
      x: 560.128,
      y: 559.872,
      w: (156 / 1000) * 1024,
      h: (122 / 1000) * 768,
    });
  });

  it("accepts swapped corners, clamps to the image, and rejects malformed boxes", () => {
    expect(fromGeminiBox([1000, 1000, 0, 0])).toEqual({ x: 0, y: 0, w: 1024, h: 768 });
    expect(fromGeminiBox([-50, 0, 2000, 500])).toEqual({ x: 0, y: 0, w: 512, h: 768 });
    expect(fromGeminiBox([1, 2, 3])).toBeNull();
    expect(fromGeminiBox([1, 2, 3, Number.NaN])).toBeNull();
  });
});

const base = {
  title: "Stain",
  description: "Dark stain on rug",
  category: "possible_damage" as const,
  confidence: "medium" as const,
};

describe("normalizeReport", () => {
  const viewByLabel = new Map([
    ["V1", "overview-floor-rug"],
    ["V2", "pin-0xabc"],
  ]);
  const known = new Set(["overview-floor-rug", "pin-0xabc"]);

  it("maps short view labels back to real view ids", () => {
    const out = normalizeReport(
      { changes: [{ ...base, view_id: "V2", box: { x: 10, y: 20, w: 30, h: 40 } }] },
      viewByLabel,
      known,
    );
    expect(out.changes[0].view_id).toBe("pin-0xabc");
  });

  it("keeps boxes inside the 1024x768 render and drops empty or unknown ones", () => {
    const out = normalizeReport(
      {
        changes: [
          { ...base, view_id: "V1", box: { x: -20, y: 700, w: 2000, h: 200 } },
          { ...base, view_id: "V1", box: { x: 1030, y: 10, w: 50, h: 50 } },
          { ...base, view_id: "V9", box: { x: 10, y: 10, w: 50, h: 50 } },
          { ...base, view_id: "overview-floor-rug", box: { x: 5, y: 5, w: 0, h: 10 } },
        ],
      },
      viewByLabel,
      known,
    );
    expect(out.changes).toHaveLength(1);
    expect(out.changes[0].box).toEqual({ x: 0, y: 700, w: 1024, h: 68 });
  });
});
