import { applyMatrix4ColumnMajor, solveUmeyama, type Vec3 } from "../three/umeyama";

export const REFERENCE_MOVE_IN_URL = "/models/apartment-move-in.glb";
export const REFERENCE_MOVE_OUT_URL = "/models/apartment-move-out.glb";
export const REFERENCE_TAMPERED_URL = "/models/apartment-move-in-tampered.glb";

// Four distinctive non-collinear landmarks across the real Meta Replica apartment scan (meters)
export const REFERENCE_MOVE_IN_LANDMARKS: Vec3[] = [
  [-1.95, 1.85, -1.65],
  [1.45, 1.95, -1.55],
  [-0.85, 0.02, 1.25],
  [1.85, 0.95, 1.35],
];

// Exact scan-frame offset applied to apartment-move-out.glb (12 deg yaw + shift + 0.4% scale)
const MOVE_OUT_GENERATION_MATRIX = (() => {
  const scale = 1.004;
  const yaw = (12 * Math.PI) / 180;
  const c = Math.cos(yaw) * scale;
  const s = Math.sin(yaw) * scale;
  return [c, 0, -s, 0, 0, scale, 0, 0, s, 0, c, 0, 0.38, 0.05, -0.29, 1];
})();

export const REFERENCE_MOVE_OUT_LANDMARKS: Vec3[] =
  REFERENCE_MOVE_IN_LANDMARKS.map((pt) =>
    applyMatrix4ColumnMajor(MOVE_OUT_GENERATION_MATRIX, pt),
  );

export const REFERENCE_ALIGNMENT = solveUmeyama(
  REFERENCE_MOVE_OUT_LANDMARKS,
  REFERENCE_MOVE_IN_LANDMARKS,
);

export const REFERENCE_VERIFIED_LEASE_ID =
  "0xb43bc65443fd2847b3c37b0fc08035c033a290ddf75707993649f44e1ea2f1a4";
export const REFERENCE_VERIFIED_MOVE_IN_RECORD_ID =
  "0xf832a330403ee154d148051bccdd595d2e82d523142d8ae3dc4950d747818d50";
export const DEFAULT_DEMO_REVIEWER =
  "0xB59A3658D210f3DDbb202d0FbD14373EED43AC3F";

// Key spots in the real Meta Replica scanned living room (move-in metric coordinates)
export const REFERENCE_SPOTS = {
  // Pre-existing scratch on the wooden TV console bench (present in both scans)
  deskScratch: {
    position: [-1.35, 0.56, -0.35] as Vec3,
    normal: [0.55, 0.72, 0.42] as Vec3,
  },
  // Staged pale spill stain on the dark floor/rug right between the TV console and coffee table
  carpetStain: {
    position: [-0.4415, 0.025, 0.3647] as Vec3,
    normal: [0, 1, 0] as Vec3,
  },
  // Wall / trim area beside the door
  wallScuffs: {
    position: [0.85, 0.48, -0.65] as Vec3,
    normal: [-0.3, 0.1, 0.95] as Vec3,
  },
};
