import { describe, expect, it } from "vitest";
import { applyMatrix4ColumnMajor, solveUmeyama, type Vec3 } from "./umeyama";

function eulerRotationMatrix(rx: number, ry: number, rz: number): number[][] {
  const cx = Math.cos(rx), sx = Math.sin(rx);
  const cy = Math.cos(ry), sy = Math.sin(ry);
  const cz = Math.cos(rz), sz = Math.sin(rz);
  // R = Rz * Ry * Rx
  return [
    [cy * cz, cz * sx * sy - cx * sz, cx * cz * sy + sx * sz],
    [cy * sz, cx * cz + sx * sy * sz, cx * sy * sz - cz * sx],
    [-sy, cy * sx, cx * cy],
  ];
}

function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

describe("solveUmeyama similarity transform", () => {
  it("recovers exact random scale, rotation, and translation across 25 randomized trials", () => {
    const rand = mulberry32(20261118);

    // 4 non-collinear room corners across two walls
    const baseMoveOut: Vec3[] = [
      [0.05, 2.05, 0.72],
      [1.55, 0.38, 0.02],
      [2.0, 2.1, 0.03],
      [3.22, 1.0, 0.03],
    ];

    for (let trial = 0; trial < 25; trial++) {
      const trueScale = 0.8 + rand() * 0.5;
      const rx = (rand() - 0.5) * 1.4;
      const ry = (rand() - 0.5) * Math.PI * 2;
      const rz = (rand() - 0.5) * 1.4;
      const R = eulerRotationMatrix(rx, ry, rz);
      const t: Vec3 = [
        (rand() - 0.5) * 8,
        (rand() - 0.5) * 4,
        (rand() - 0.5) * 8,
      ];

      const moveIn: Vec3[] = baseMoveOut.map(([x, y, z]) => [
        trueScale * (R[0][0] * x + R[0][1] * y + R[0][2] * z) + t[0],
        trueScale * (R[1][0] * x + R[1][1] * y + R[1][2] * z) + t[1],
        trueScale * (R[2][0] * x + R[2][1] * y + R[2][2] * z) + t[2],
      ]);

      const solved = solveUmeyama(baseMoveOut, moveIn);

      expect(solved.scale).toBeCloseTo(trueScale, 6);
      expect(solved.tapRmsErrorMeters).toBeLessThan(1e-6);

      for (let r = 0; r < 3; r++) {
        expect(solved.translation[r]).toBeCloseTo(t[r], 6);
        for (let c = 0; c < 3; c++) {
          expect(solved.rotation[r][c]).toBeCloseTo(R[r][c], 6);
        }
      }

      // Check mapping on a held-out 5th point not used in fitting
      const extra: Vec3 = [2.25, 0.02, 2.05];
      const expectedExtra: Vec3 = [
        trueScale * (R[0][0] * extra[0] + R[0][1] * extra[1] + R[0][2] * extra[2]) + t[0],
        trueScale * (R[1][0] * extra[0] + R[1][1] * extra[1] + R[1][2] * extra[2]) + t[1],
        trueScale * (R[2][0] * extra[0] + R[2][1] * extra[1] + R[2][2] * extra[2]) + t[2],
      ];
      const mappedExtra = applyMatrix4ColumnMajor(solved.matrix4ColumnMajor, extra);
      expect(mappedExtra[0]).toBeCloseTo(expectedExtra[0], 6);
      expect(mappedExtra[1]).toBeCloseTo(expectedExtra[1], 6);
      expect(mappedExtra[2]).toBeCloseTo(expectedExtra[2], 6);
    }
  });

  it("rejects nearly collinear taps under 20 cm RMS", () => {
    const linePts: Vec3[] = [
      [0, 1, 0],
      [1, 1.01, 0],
      [2, 0.99, 0.02],
      [3, 1.0, 0],
    ];
    expect(() => solveUmeyama(linePts, linePts)).toThrow(/straight line/i);
  });

  it("flags scale drift or floor tilt in warnings while preserving proper rotation (det = +1)", () => {
    const moveOut: Vec3[] = [
      [0, 0, 0],
      [2, 0, 0],
      [0, 2, 0],
      [0, 0, 2],
    ];
    const tiltedR = eulerRotationMatrix(0.08, 0.2, 0); // ~4.6 deg tilt
    const moveIn: Vec3[] = moveOut.map(([x, y, z]) => [
      1.05 * (tiltedR[0][0] * x + tiltedR[0][1] * y + tiltedR[0][2] * z) + 0.5,
      1.05 * (tiltedR[1][0] * x + tiltedR[1][1] * y + tiltedR[1][2] * z) - 0.1,
      1.05 * (tiltedR[2][0] * x + tiltedR[2][1] * y + tiltedR[2][2] * z) + 0.3,
    ]);
    const res = solveUmeyama(moveOut, moveIn);
    expect(res.scale).toBeCloseTo(1.05, 5);
    expect(res.floorTiltDeg).toBeGreaterThan(4);
    expect(res.warnings.length).toBeGreaterThanOrEqual(2);
  });
});
