import { Matrix, SingularValueDecomposition, determinant } from "ml-matrix";

export type Vec3 = [number, number, number];

export interface UmeyamaOptions {
  /** Minimum RMS distance from best-fit line in meters (spec: 0.20 m = 20 cm). */
  minCollinearityRmsMeters?: number;
  /** Expected LiDAR scale range (spec: 0.98–1.02). */
  scaleRange?: [number, number];
  /** Expected max floor tilt in degrees (spec: 1.0 deg). */
  maxFloorTiltDeg?: number;
}

export interface UmeyamaResult {
  scale: number;
  /** 3x3 row-major rotation matrix R (det = +1). */
  rotation: [
    [number, number, number],
    [number, number, number],
    [number, number, number],
  ];
  translation: Vec3;
  /** 16-element column-major 4x4 matrix (Three.js Matrix4.fromArray order): maps move-out -> move-in. */
  matrix4ColumnMajor: number[];
  /** RMS residual across the tapped control points in meters. */
  tapRmsErrorMeters: number;
  /** RMS distance of move-in taps from their best-fit line (meters). */
  collinearityRmsMeters: number;
  /** Angle (degrees) between R * (0,1,0) and (0,1,0). */
  floorTiltDeg: number;
  warnings: string[];
}

function meanVec3(pts: Vec3[]): Vec3 {
  const n = pts.length;
  let sx = 0;
  let sy = 0;
  let sz = 0;
  for (const [x, y, z] of pts) {
    sx += x;
    sy += y;
    sz += z;
  }
  return [sx / n, sy / n, sz / n];
}

/**
 * Computes RMS perpendicular distance of a point set from its best-fit 3D line
 * using SVD of centered coordinates (the two smallest singular values give orthogonal variance).
 */
export function computeCollinearityRms(pts: Vec3[]): number {
  const n = pts.length;
  if (n < 3) return 0;
  const mu = meanVec3(pts);
  const centered = new Matrix(
    pts.map(([x, y, z]) => [x - mu[0], y - mu[1], z - mu[2]]),
  );
  const svd = new SingularValueDecomposition(centered, { autoTranspose: true });
  const s = svd.diagonal; // descending singular values s[0] >= s[1] >= s[2]
  const s1 = s[1] ?? 0;
  const s2 = s[2] ?? 0;
  return Math.sqrt((s1 * s1 + s2 * s2) / n);
}

/**
 * Solves the Umeyama similarity transform mapping move-out points `p` onto move-in points `q`:
 *   min_{s, R, t} sum_i || q_i - (s R p_i + t) ||^2
 *
 * Follows docs/BUILD.md exactly:
 *   Sigma = (1/n) sum_i (q_i - q_bar)(p_i - p_bar)^T
 *   Sigma = U D V^T
 *   S = diag(1, 1, sign(det(U V^T)))
 *   R = U S V^T
 *   s = tr(D S) / sigma_p^2
 *   t = q_bar - s R p_bar
 */
export function solveUmeyama(
  moveOutPoints: Vec3[],
  moveInPoints: Vec3[],
  options: UmeyamaOptions = {},
): UmeyamaResult {
  const n = moveOutPoints.length;
  if (n !== moveInPoints.length || n < 3) {
    throw new Error("Provide at least 3 matching point pairs (4 recommended).");
  }

  const minLineRms = options.minCollinearityRmsMeters ?? 0.2;
  const [minScale, maxScale] = options.scaleRange ?? [0.98, 1.02];
  const maxFloorTiltDeg = options.maxFloorTiltDeg ?? 1.0;

  // Reject nearly collinear taps (RMS distance from best-fit line < 20 cm)
  const lineRmsIn = computeCollinearityRms(moveInPoints);
  const lineRmsOut = computeCollinearityRms(moveOutPoints);
  const collinearityRmsMeters = Math.min(lineRmsIn, lineRmsOut);
  if (collinearityRmsMeters < minLineRms) {
    throw new Error(
      `Tapped points are too close to a straight line (${(collinearityRmsMeters * 100).toFixed(1)} cm RMS; need at least ${(minLineRms * 100).toFixed(0)} cm across at least two walls).`,
    );
  }

  const pBar = meanVec3(moveOutPoints);
  const qBar = meanVec3(moveInPoints);

  // Covariance Sigma = (1/n) sum (q_i - qBar)(p_i - pBar)^T, and sigma_p^2
  const sigmaArr = [
    [0, 0, 0],
    [0, 0, 0],
    [0, 0, 0],
  ];
  let sigmaP2 = 0;

  for (let i = 0; i < n; i++) {
    const dp = [
      moveOutPoints[i][0] - pBar[0],
      moveOutPoints[i][1] - pBar[1],
      moveOutPoints[i][2] - pBar[2],
    ];
    const dq = [
      moveInPoints[i][0] - qBar[0],
      moveInPoints[i][1] - qBar[1],
      moveInPoints[i][2] - qBar[2],
    ];
    sigmaP2 += dp[0] * dp[0] + dp[1] * dp[1] + dp[2] * dp[2];

    for (let r = 0; r < 3; r++) {
      for (let c = 0; c < 3; c++) {
        sigmaArr[r][c] += dq[r] * dp[c];
      }
    }
  }
  sigmaP2 /= n;
  if (sigmaP2 < 1e-10) {
    throw new Error("Move-out points are degenerate (zero spread).");
  }
  for (let r = 0; r < 3; r++) {
    for (let c = 0; c < 3; c++) {
      sigmaArr[r][c] /= n;
    }
  }

  const sigma = new Matrix(sigmaArr);
  const svd = new SingularValueDecomposition(sigma);
  const U = svd.leftSingularVectors;
  const V = svd.rightSingularVectors;
  const Vt = V.transpose();
  const d = svd.diagonal; // [d0, d1, d2]

  // Proper rotation sign guard: S = diag(1, 1, sign(det(U * V^T)))
  const detUVt = determinant(U.mmul(Vt));
  const signDet = detUVt < 0 ? -1 : 1;
  const S = Matrix.diag([1, 1, signDet]);

  const Rmat = U.mmul(S).mmul(Vt);
  const traceDS = d[0] + d[1] + d[2] * signDet;
  const scale = traceDS / sigmaP2;

  const rotation: UmeyamaResult["rotation"] = [
    [Rmat.get(0, 0), Rmat.get(0, 1), Rmat.get(0, 2)],
    [Rmat.get(1, 0), Rmat.get(1, 1), Rmat.get(1, 2)],
    [Rmat.get(2, 0), Rmat.get(2, 1), Rmat.get(2, 2)],
  ];

  // t = q_bar - s * R * p_bar
  const rp0 =
    rotation[0][0] * pBar[0] + rotation[0][1] * pBar[1] + rotation[0][2] * pBar[2];
  const rp1 =
    rotation[1][0] * pBar[0] + rotation[1][1] * pBar[1] + rotation[1][2] * pBar[2];
  const rp2 =
    rotation[2][0] * pBar[0] + rotation[2][1] * pBar[1] + rotation[2][2] * pBar[2];

  const translation: Vec3 = [
    qBar[0] - scale * rp0,
    qBar[1] - scale * rp1,
    qBar[2] - scale * rp2,
  ];

  // Three.js Matrix4 uses column-major layout
  const matrix4ColumnMajor = [
    scale * rotation[0][0],
    scale * rotation[1][0],
    scale * rotation[2][0],
    0,
    scale * rotation[0][1],
    scale * rotation[1][1],
    scale * rotation[2][1],
    0,
    scale * rotation[0][2],
    scale * rotation[1][2],
    scale * rotation[2][2],
    0,
    translation[0],
    translation[1],
    translation[2],
    1,
  ];

  // Tap residual RMS
  let errSum = 0;
  for (let i = 0; i < n; i++) {
    const mapped = applyMatrix4ColumnMajor(matrix4ColumnMajor, moveOutPoints[i]);
    const dx = mapped[0] - moveInPoints[i][0];
    const dy = mapped[1] - moveInPoints[i][1];
    const dz = mapped[2] - moveInPoints[i][2];
    errSum += dx * dx + dy * dy + dz * dz;
  }
  const tapRmsErrorMeters = Math.sqrt(errSum / n);

  // Floor tilt: angle between R * (0,1,0) and (0,1,0) => arccos(clamp(R[1][1], -1, 1))
  const cosTilt = Math.max(-1, Math.min(1, rotation[1][1]));
  const floorTiltDeg = (Math.acos(cosTilt) * 180) / Math.PI;

  const warnings: string[] = [];
  if (scale < minScale || scale > maxScale) {
    warnings.push(
      `Solved scale ${scale.toFixed(4)} is outside ${minScale}–${maxScale}. Check that all 4 taps match the same spots.`,
    );
  }
  if (floorTiltDeg > maxFloorTiltDeg) {
    warnings.push(
      `Floor tilt is ${floorTiltDeg.toFixed(2)}° (above ${maxFloorTiltDeg.toFixed(1)}°). Re-tap corners on two different walls if this looks tilted.`,
    );
  }

  return {
    scale,
    rotation,
    translation,
    matrix4ColumnMajor,
    tapRmsErrorMeters,
    collinearityRmsMeters,
    floorTiltDeg,
    warnings,
  };
}

export function applyMatrix4ColumnMajor(m: number[], p: Vec3): Vec3 {
  const [x, y, z] = p;
  return [
    m[0] * x + m[4] * y + m[8] * z + m[12],
    m[1] * x + m[5] * y + m[9] * z + m[13],
    m[2] * x + m[6] * y + m[10] * z + m[14],
  ];
}
