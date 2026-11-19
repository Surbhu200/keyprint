import { applyMatrix4ColumnMajor, solveUmeyama, type Vec3 } from "../three/umeyama";

export const REFERENCE_MOVE_IN_URL = "/models/apartment-move-in.glb";
export const REFERENCE_MOVE_OUT_URL = "/models/apartment-move-out.glb";
export const REFERENCE_TAMPERED_URL = "/models/apartment-move-in-tampered.glb";

// Four distinctive room landmarks across two walls in apartment-move-in.glb (meters)
export const REFERENCE_MOVE_IN_LANDMARKS: Vec3[] = [
  [0.06, 2.1, 1.19], // Top corner of door frame (left wall)
  [1.55, 0.38, 0.035], // Wall outlet (back wall)
  [3.225, 2.1, 0.06], // Top-right corner of window frame (back wall)
  [0.425, 0.78, 0.79], // Front-left corner of desk top
];

// Exact scan-frame offset applied when generating apartment-move-out.glb
const MOVE_OUT_GENERATION_MATRIX = (() => {
  const scale = 1.004;
  const yaw = (14 * Math.PI) / 180;
  const c = Math.cos(yaw) * scale;
  const s = Math.sin(yaw) * scale;
  return [c, 0, -s, 0, 0, scale, 0, 0, s, 0, c, 0, 0.42, 0.06, -0.34, 1];
})();

export const REFERENCE_MOVE_OUT_LANDMARKS: Vec3[] =
  REFERENCE_MOVE_IN_LANDMARKS.map((pt) =>
    applyMatrix4ColumnMajor(MOVE_OUT_GENERATION_MATRIX, pt),
  );

export const REFERENCE_ALIGNMENT = solveUmeyama(
  REFERENCE_MOVE_OUT_LANDMARKS,
  REFERENCE_MOVE_IN_LANDMARKS,
);

// Key spots in the reference apartment (move-in coordinates)
export const REFERENCE_SPOTS = {
  deskScratch: {
    position: [1.1, 0.785, 0.45] as Vec3,
    normal: [0, 1, 0] as Vec3,
  },
  carpetStain: {
    position: [2.4, 0.025, 2.12] as Vec3,
    normal: [0, 1, 0] as Vec3,
  },
  wallScuffs: {
    position: [0.02, 0.42, 1.4] as Vec3,
    normal: [1, 0, 0] as Vec3,
  },
};
