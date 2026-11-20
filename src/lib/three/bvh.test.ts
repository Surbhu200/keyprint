import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { computeSurfaceAgreement, refineAlignmentICP } from "./bvh";
import { solveUmeyama, type Vec3 } from "./umeyama";

/** A room corner like a phone scan: floor, two walls and a cabinet, Y up, meters. */
function makeCorner(): THREE.Group {
  const root = new THREE.Group();
  const mat = new THREE.MeshBasicMaterial();
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(3, 3, 30, 30), mat);
  floor.rotation.x = -Math.PI / 2;
  const back = new THREE.Mesh(new THREE.PlaneGeometry(3, 2.5, 30, 25), mat);
  back.position.set(0, 1.25, -1.5);
  const side = new THREE.Mesh(new THREE.PlaneGeometry(3, 2.5, 30, 25), mat);
  side.rotation.y = Math.PI / 2;
  side.position.set(-1.5, 1.25, 0);
  const cabinet = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.8, 0.4, 6, 8, 4), mat);
  cabinet.position.set(0.4, 0.4, -1.25);
  root.add(floor, back, side, cabinet);
  root.updateMatrixWorld(true);
  return root;
}

let seed = 7;
const rand = () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296;
const jitter = (p: Vec3, cm: number): Vec3 => [
  p[0] + (rand() - 0.5) * 2 * cm * 0.01,
  p[1] + (rand() - 0.5) * 2 * cm * 0.01,
  p[2] + (rand() - 0.5) * 2 * cm * 0.01,
];

describe("refineAlignmentICP", () => {
  // Corners a person would tap: cabinet top corners and the wall/floor corner area.
  const tapsInMoveIn: Vec3[] = [
    [0.7, 0.8, -1.05],
    [0.1, 0.8, -1.45],
    [-1.5, 2.0, -0.6],
    [-1.4, 0.0, 1.2],
  ];

  it("snaps sloppy 4-point taps into a passing fit", () => {
    const moveIn = makeCorner();
    const moveOut = makeCorner();
    moveOut.rotation.y = (25 * Math.PI) / 180; // a second scan starts facing another way
    moveOut.position.set(0.5, 0.0, -0.3);
    moveOut.updateMatrixWorld(true);

    const toMoveOut = moveOut.matrixWorld;
    const tapsOut = tapsInMoveIn.map((p) => {
      const v = new THREE.Vector3(...p).applyMatrix4(toMoveOut);
      return jitter([v.x, v.y, v.z], 3);
    });
    const tapsIn = tapsInMoveIn.map((p) => jitter(p, 3));

    const tapFit = solveUmeyama(tapsOut, tapsIn);
    const refined = refineAlignmentICP(moveIn, moveOut, tapFit.matrix4ColumnMajor);
    const gate = computeSurfaceAgreement(moveIn, moveOut, refined.matrixColumnMajor);

    expect(refined.improved).toBe(true);
    expect(gate.passedGate).toBe(true);
    expect(gate.medianGapMeters).toBeLessThan(0.01);
    expect(refined.floorTiltDeg).toBeLessThan(0.5);
  });

  it("never returns a worse fit than the taps", () => {
    const moveIn = makeCorner();
    const moveOut = makeCorner();
    const identity = new THREE.Matrix4().elements as unknown as number[];
    const refined = refineAlignmentICP(moveIn, moveOut, Array.from(identity));
    expect(refined.after.shareWithin5cm).toBeGreaterThanOrEqual(refined.before.shareWithin5cm);
    const gate = computeSurfaceAgreement(moveIn, moveOut, refined.matrixColumnMajor);
    expect(gate.passedGate).toBe(true);
  });
});
