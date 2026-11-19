import { applyMatrix4ColumnMajor, solveUmeyama, type Vec3 } from "../three/umeyama";

export const REFERENCE_MOVE_IN_URL = "/models/apartment-move-in.glb";
export const REFERENCE_MOVE_OUT_URL = "/models/apartment-move-out.glb";
export const REFERENCE_TAMPERED_URL = "/models/apartment-move-in-tampered.glb";

// Four distinctive non-collinear landmarks across the real bedroom scene (meters):
//   - Left window frame corner (back wall)
//   - Right window frame corner (back wall)
//   - Front-left carpet corner (floor plane)
//   - Side wall / ceiling trim corner (side wall)
export const REFERENCE_MOVE_IN_LANDMARKS: Vec3[] = [
  [-1.18, 1.48, -1.12],
  [1.18, 1.48, -1.12],
  [-0.62, 0.015, 0.83],
  [1.65, 0.95, 0.45],
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
  "0x03233ed03704723f17cc7625d024bf316f17f7ae0e6685524c3205522bd8d9ed";
export const REFERENCE_VERIFIED_MOVE_IN_RECORD_ID =
  "0x92934d0e9167e77d31d663c933fe3e08569c1b0a00592763d740513adbc077d2";
export const DEFAULT_DEMO_REVIEWER =
  "0xB59A3658D210f3DDbb202d0FbD14373EED43AC3F";

// Key spots in the real modern bedroom scene (move-in metric coordinates)
export const REFERENCE_SPOTS = {
  // Pre-existing scratch on the side table / headboard area (present in both move-in & move-out)
  deskScratch: {
    position: [-0.82, 0.34, -0.82] as Vec3,
    normal: [0.35, 0.8, 0.48] as Vec3,
  },
  // Staged dark coffee stain painted right at the center of Bedroom_Carpet_0 in move-out
  carpetStain: {
    position: [0.0, 0.016, 0.382] as Vec3,
    normal: [0, 1, 0] as Vec3,
  },
  // Wall / baseboard area near right side of bedroom
  wallScuffs: {
    position: [1.15, 0.36, -0.35] as Vec3,
    normal: [-1, 0.1, 0.2] as Vec3,
  },
};
