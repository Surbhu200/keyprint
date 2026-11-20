import { determinant, Matrix, SingularValueDecomposition, solve } from "ml-matrix";
import * as THREE from "three";
import { MeshBVH } from "three-mesh-bvh";
import type { Vec3 } from "./umeyama";

export interface SurfaceAgreementMetrics {
  sampledCount: number;
  inlierCountUnder10cm: number;
  /** Median closest-surface distance (meters) among vertices within 10 cm. */
  medianGapMeters: number;
  /** Fraction (0..1) of all sampled vertices within 5 cm of the move-in surface. */
  shareWithin5cm: number;
  passedGate: boolean;
  summaryText: string;
}

export interface SurfaceGateConfig {
  /** Maximum median gap (meters) to pass the gate (spec default: 0.02 m = 2 cm). */
  maxMedianGapMeters?: number;
  /** Minimum fraction of sampled vertices within 5 cm (spec default: 0.60 = 60%). */
  minShareWithin5cm?: number;
  /** Target number of vertices sampled from the move-out mesh (spec: ~5000). */
  sampleCount?: number;
}

/**
 * Merges all meshes inside an Object3D into a single world-space position-only BufferGeometry
 * so three-mesh-bvh can answer closestPointToPoint queries across multi-mesh GLBs.
 */
export function mergeSceneToWorldGeometry(root: THREE.Object3D): THREE.BufferGeometry {
  root.updateMatrixWorld(true);

  const positions: number[] = [];
  const v = new THREE.Vector3();

  root.traverse((obj) => {
    if (!(obj instanceof THREE.Mesh) || !obj.geometry) return;
    const geom = obj.geometry as THREE.BufferGeometry;
    const pos = geom.getAttribute("position");
    if (!pos) return;

    const index = geom.getIndex();
    if (index) {
      const idxArr = index.array;
      for (let i = 0; i < idxArr.length; i++) {
        v.fromBufferAttribute(pos, idxArr[i]).applyMatrix4(obj.matrixWorld);
        positions.push(v.x, v.y, v.z);
      }
    } else {
      for (let i = 0; i < pos.count; i++) {
        v.fromBufferAttribute(pos, i).applyMatrix4(obj.matrixWorld);
        positions.push(v.x, v.y, v.z);
      }
    }
  });

  if (positions.length < 9) {
    throw new Error("3D scene contains no triangulated mesh geometry.");
  }

  const merged = new THREE.BufferGeometry();
  merged.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  return merged;
}

/**
 * Computes surface agreement between move-in and aligned move-out scenes using three-mesh-bvh:
 *   - Samples ~5,000 vertices evenly across the move-out meshes
 *   - Transforms each sampled vertex by alignmentMatrix (move-out -> move-in)
 *   - Finds closest point on the move-in MeshBVH
 *   - Reports median gap among those < 10 cm, plus share < 5 cm
 */
export function computeSurfaceAgreement(
  moveInRoot: THREE.Object3D,
  moveOutRoot: THREE.Object3D,
  alignmentMatrixColumnMajor: number[],
  config: SurfaceGateConfig = {},
): SurfaceAgreementMetrics {
  const maxMedianGapMeters = config.maxMedianGapMeters ?? 0.02;
  const minShareWithin5cm = config.minShareWithin5cm ?? 0.6;
  const targetSamples = config.sampleCount ?? 5000;

  const moveInGeom = mergeSceneToWorldGeometry(moveInRoot);
  const bvh = new MeshBVH(moveInGeom);

  moveOutRoot.updateMatrixWorld(true);
  const alignMat = new THREE.Matrix4().fromArray(alignmentMatrixColumnMajor);

  // Collect all unique-ish move-out world vertices
  const allOutVerts: number[] = [];
  const tmp = new THREE.Vector3();
  moveOutRoot.traverse((obj) => {
    if (!(obj instanceof THREE.Mesh) || !obj.geometry) return;
    const pos = (obj.geometry as THREE.BufferGeometry).getAttribute("position");
    if (!pos) return;
    for (let i = 0; i < pos.count; i++) {
      tmp.fromBufferAttribute(pos, i).applyMatrix4(obj.matrixWorld);
      allOutVerts.push(tmp.x, tmp.y, tmp.z);
    }
  });

  const totalVerts = allOutVerts.length / 3;
  if (totalVerts === 0) {
    throw new Error("Move-out model has no vertices.");
  }

  const stride = Math.max(1, Math.floor(totalVerts / targetSamples));
  const under10cm: number[] = [];
  let under5cm = 0;
  let sampledCount = 0;

  const target = {
    point: new THREE.Vector3(),
    distance: 0,
    faceIndex: 0,
  };
  const queryPt = new THREE.Vector3();

  for (let idx = 0; idx < totalVerts; idx += stride) {
    queryPt
      .set(allOutVerts[idx * 3], allOutVerts[idx * 3 + 1], allOutVerts[idx * 3 + 2])
      .applyMatrix4(alignMat);

    const hit = bvh.closestPointToPoint(queryPt, target, 0, 0.25);
    sampledCount++;

    if (hit) {
      const dist = hit.distance;
      if (dist < 0.1) under10cm.push(dist);
      if (dist < 0.05) under5cm++;
    }
  }

  moveInGeom.dispose();

  under10cm.sort((a, b) => a - b);
  const medianGapMeters =
    under10cm.length > 0
      ? under10cm[Math.floor(under10cm.length / 2)]
      : 0.25;
  const shareWithin5cm = sampledCount > 0 ? under5cm / sampledCount : 0;
  const passedGate =
    under10cm.length > 0 &&
    medianGapMeters <= maxMedianGapMeters &&
    shareWithin5cm >= minShareWithin5cm;

  const medianCm = (medianGapMeters * 100).toFixed(1);
  const pct5cm = Math.round(shareWithin5cm * 100);
  const summaryText = `Median surface gap ${medianCm} cm; ${pct5cm}% of the scan within 5 cm`;

  return {
    sampledCount,
    inlierCountUnder10cm: under10cm.length,
    medianGapMeters,
    shareWithin5cm,
    passedGate,
    summaryText,
  };
}

type Rotation3 = [[number, number, number], [number, number, number], [number, number, number]];

export interface FitStats {
  /** Fraction of sampled move-out vertices within 5 cm of the move-in surface. */
  shareWithin5cm: number;
  /** Median gap among sampled vertices within 10 cm (same rule as the gate). */
  medianGapMeters: number;
}

export interface AlignmentRefinement {
  matrixColumnMajor: number[];
  /** Uniform scale of the returned matrix (1.0 = true size; LiDAR scans are metric). */
  scale: number;
  rotation: Rotation3;
  translation: Vec3;
  floorTiltDeg: number;
  /** True when fine-tuning improved the fit (otherwise the tap-based matrix is returned). */
  improved: boolean;
  iterations: number;
  before: FitStats;
  after: FitStats;
}

/** Evenly strided world-space vertices of every mesh under `root` (x, y, z triples). */
function sampleWorldVertices(root: THREE.Object3D, maxSamples: number): Float32Array {
  root.updateMatrixWorld(true);
  const all: number[] = [];
  const v = new THREE.Vector3();
  root.traverse((obj) => {
    if (!(obj instanceof THREE.Mesh) || !obj.geometry) return;
    const pos = (obj.geometry as THREE.BufferGeometry).getAttribute("position");
    if (!pos) return;
    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i).applyMatrix4(obj.matrixWorld);
      all.push(v.x, v.y, v.z);
    }
  });
  const total = all.length / 3;
  const stride = Math.max(1, Math.floor(total / maxSamples));
  const out: number[] = [];
  for (let i = 0; i < total; i += stride) out.push(all[i * 3], all[i * 3 + 1], all[i * 3 + 2]);
  return new Float32Array(out);
}

function measureFit(bvh: MeshBVH, samples: Float32Array, m: THREE.Matrix4): FitStats {
  const q = new THREE.Vector3();
  const target = { point: new THREE.Vector3(), distance: 0, faceIndex: 0 };
  const under10: number[] = [];
  let under5 = 0;
  const n = samples.length / 3;
  for (let i = 0; i < samples.length; i += 3) {
    q.set(samples[i], samples[i + 1], samples[i + 2]).applyMatrix4(m);
    const hit = bvh.closestPointToPoint(q, target, 0, 0.25);
    if (!hit) continue;
    if (hit.distance < 0.1) under10.push(hit.distance);
    if (hit.distance < 0.05) under5++;
  }
  under10.sort((a, b) => a - b);
  return {
    shareWithin5cm: n > 0 ? under5 / n : 0,
    medianGapMeters: under10.length > 0 ? under10[Math.floor(under10.length / 2)] : 0.25,
  };
}

/** Best rotation taking centered `src` onto centered `dst` (Kabsch; same R as Umeyama). */
function kabsch(src: number[], dst: number[]): { R: Rotation3; srcMean: Vec3; dstMean: Vec3 } {
  const n = src.length / 3;
  const ps: Vec3 = [0, 0, 0];
  const qs: Vec3 = [0, 0, 0];
  for (let i = 0; i < n; i++) {
    for (let k = 0; k < 3; k++) {
      ps[k] += src[i * 3 + k];
      qs[k] += dst[i * 3 + k];
    }
  }
  for (let k = 0; k < 3; k++) {
    ps[k] /= n;
    qs[k] /= n;
  }
  const cov = [
    [0, 0, 0],
    [0, 0, 0],
    [0, 0, 0],
  ];
  for (let i = 0; i < n; i++) {
    for (let r = 0; r < 3; r++) {
      const dq = dst[i * 3 + r] - qs[r];
      for (let c = 0; c < 3; c++) cov[r][c] += dq * (src[i * 3 + c] - ps[c]);
    }
  }
  const svd = new SingularValueDecomposition(new Matrix(cov));
  const U = svd.leftSingularVectors;
  const Vt = svd.rightSingularVectors.transpose();
  const sign = determinant(U.mmul(Vt)) < 0 ? -1 : 1;
  const Rm = U.mmul(Matrix.diag([1, 1, sign])).mmul(Vt);
  const R: Rotation3 = [
    [Rm.get(0, 0), Rm.get(0, 1), Rm.get(0, 2)],
    [Rm.get(1, 0), Rm.get(1, 1), Rm.get(1, 2)],
    [Rm.get(2, 0), Rm.get(2, 1), Rm.get(2, 2)],
  ];
  return { R, srcMean: ps, dstMean: qs };
}

function composeMatrix(R: Rotation3, scale: number, t: Vec3): THREE.Matrix4 {
  return new THREE.Matrix4().set(
    scale * R[0][0], scale * R[0][1], scale * R[0][2], t[0],
    scale * R[1][0], scale * R[1][1], scale * R[1][2], t[1],
    scale * R[2][0], scale * R[2][1], scale * R[2][2], t[2],
    0, 0, 0, 1,
  );
}

/** Is fit `a` better than fit `b`? More surface within 5 cm first, then a smaller median gap. */
function betterFit(a: FitStats, b: FitStats): boolean {
  if (a.shareWithin5cm > b.shareWithin5cm + 0.005) return true;
  if (a.shareWithin5cm < b.shareWithin5cm - 0.005) return false;
  return a.medianGapMeters < b.medianGapMeters;
}

/**
 * Fine-tunes a rough alignment (from 4 hand taps) with ICP: pair sampled move-out vertices
 * with their closest points on the move-in surface, re-solve the rigid fit, and repeat with a
 * shrinking pairing distance (point-to-plane first, which suits walls and floors). The scale
 * from the taps is kept, so the scan can't shrink to fake a match. If the first pass doesn't
 * land a clearly good fit, more passes start from point-to-point pairing, a leveled
 * (gravity-aligned) start, a wider pairing distance, one-step shifts (stairs and shelves repeat)
 * and small turns, and the best fit wins.
 * If nothing beats the tap-based matrix, that matrix is returned unchanged.
 */
export function refineAlignmentICP(
  moveInRoot: THREE.Object3D,
  moveOutRoot: THREE.Object3D,
  initialMatrixColumnMajor: number[],
  options: {
    iterations?: number;
    sampleCount?: number;
    startMaxDistMeters?: number;
    endMaxDistMeters?: number;
    /** Set false to run a single pass (faster; used by tests and searches). */
    retries?: boolean;
  } = {},
): AlignmentRefinement {
  const maxIterations = options.iterations ?? 30;
  const endMaxDist = options.endMaxDistMeters ?? 0.03;
  const firstStartDist = options.startMaxDistMeters ?? 0.3;

  const moveInGeom = mergeSceneToWorldGeometry(moveInRoot);
  const bvh = new MeshBVH(moveInGeom);
  const samples = sampleWorldVertices(moveOutRoot, options.sampleCount ?? 3000);
  const sampleTotal = samples.length / 3;

  const initial = new THREE.Matrix4().fromArray(initialMatrixColumnMajor);
  const scale = new THREE.Vector3().setFromMatrixScale(initial).x;

  const q = new THREE.Vector3();
  const target = { point: new THREE.Vector3(), distance: 0, faceIndex: 0 };

  const icpFrom = (start: THREE.Matrix4, startDist: number) => {
    let current = start.clone();
    let maxDist = startDist;
    let iterations = 0;
    for (; iterations < maxIterations; iterations++) {
      const src: number[] = [];
      const dst: number[] = [];
      for (let i = 0; i < samples.length; i += 3) {
        q.set(samples[i], samples[i + 1], samples[i + 2]).applyMatrix4(current);
        const hit = bvh.closestPointToPoint(q, target, 0, maxDist);
        // maxThreshold only prunes BVH nodes; a farther triangle can still come back.
        if (!hit || hit.distance > maxDist) continue;
        src.push(samples[i] * scale, samples[i + 1] * scale, samples[i + 2] * scale);
        dst.push(hit.point.x, hit.point.y, hit.point.z);
      }
      if (src.length / 3 < Math.max(30, sampleTotal * 0.05)) break;

      const { R, srcMean, dstMean } = kabsch(src, dst);
      // t = q_bar - R (s p_bar); src already holds s * p
      const t: Vec3 = [
        dstMean[0] - (R[0][0] * srcMean[0] + R[0][1] * srcMean[1] + R[0][2] * srcMean[2]),
        dstMean[1] - (R[1][0] * srcMean[0] + R[1][1] * srcMean[1] + R[1][2] * srcMean[2]),
        dstMean[2] - (R[2][0] * srcMean[0] + R[2][1] * srcMean[1] + R[2][2] * srcMean[2]),
      ];
      const next = composeMatrix(R, scale, t);
      const moved = new THREE.Vector3(1, 1, 1)
        .applyMatrix4(next)
        .distanceTo(new THREE.Vector3(1, 1, 1).applyMatrix4(current));
      current = next;
      const wasAtEnd = maxDist <= endMaxDist;
      maxDist = Math.max(endMaxDist, maxDist * 0.8);
      if (wasAtEnd && moved < 0.0002) break;
    }
    return { matrix: current, stats: measureFit(bvh, samples, current), iterations };
  };

  // Face normals of the move-in surface, for point-to-plane pairing. MeshBVH adds (and reorders)
  // an index when it builds, and hit.faceIndex refers to that index, so read triangles through it.
  let faceNormals: Float32Array | null = null;
  const getFaceNormals = () => {
    if (faceNormals) return faceNormals;
    const pos = moveInGeom.getAttribute("position").array as ArrayLike<number>;
    const index = moveInGeom.getIndex();
    const idx = index ? (index.array as ArrayLike<number>) : null;
    const faces = idx ? Math.floor(idx.length / 3) : Math.floor(pos.length / 9);
    const out = new Float32Array(faces * 3);
    for (let f = 0; f < faces; f++) {
      const a = (idx ? idx[f * 3] : f * 3) * 3;
      const b = (idx ? idx[f * 3 + 1] : f * 3 + 1) * 3;
      const c = (idx ? idx[f * 3 + 2] : f * 3 + 2) * 3;
      const ux = pos[b] - pos[a];
      const uy = pos[b + 1] - pos[a + 1];
      const uz = pos[b + 2] - pos[a + 2];
      const vx = pos[c] - pos[a];
      const vy = pos[c + 1] - pos[a + 1];
      const vz = pos[c + 2] - pos[a + 2];
      const nx = uy * vz - uz * vy;
      const ny = uz * vx - ux * vz;
      const nz = ux * vy - uy * vx;
      const len = Math.hypot(nx, ny, nz) || 1;
      out[f * 3] = nx / len;
      out[f * 3 + 1] = ny / len;
      out[f * 3 + 2] = nz / len;
    }
    faceNormals = out;
    return out;
  };

  /**
   * Point-to-plane ICP: each sample only has to land on the plane of the move-in triangle it is
   * closest to, so scans dominated by flat walls and floors stop "sliding" and converge quickly.
   * Solves a small linearized rigid update (rotation w, translation t) per iteration.
   */
  const planeIcpFrom = (start: THREE.Matrix4, startDist: number) => {
    const normals = getFaceNormals();
    let current = start.clone();
    let maxDist = startDist;
    let iterations = 0;
    for (; iterations < maxIterations; iterations++) {
      const A = Array.from({ length: 6 }, () => new Array<number>(6).fill(0));
      const b = new Array<number>(6).fill(0);
      let pairs = 0;
      for (let i = 0; i < samples.length; i += 3) {
        q.set(samples[i], samples[i + 1], samples[i + 2]).applyMatrix4(current);
        const hit = bvh.closestPointToPoint(q, target, 0, maxDist);
        if (!hit || hit.distance > maxDist) continue;
        const f = hit.faceIndex * 3;
        const nx = normals[f];
        const ny = normals[f + 1];
        const nz = normals[f + 2];
        // J = [s x n, n], residual r = (s - d) . n
        const J = [
          q.y * nz - q.z * ny,
          q.z * nx - q.x * nz,
          q.x * ny - q.y * nx,
          nx,
          ny,
          nz,
        ];
        const r = (q.x - hit.point.x) * nx + (q.y - hit.point.y) * ny + (q.z - hit.point.z) * nz;
        for (let a = 0; a < 6; a++) {
          b[a] -= J[a] * r;
          for (let c = 0; c < 6; c++) A[a][c] += J[a] * J[c];
        }
        pairs++;
      }
      if (pairs < Math.max(30, sampleTotal * 0.05)) break;
      const trace = A[0][0] + A[1][1] + A[2][2] + A[3][3] + A[4][4] + A[5][5];
      for (let a = 0; a < 6; a++) A[a][a] += 1e-6 * trace + 1e-12; // keeps the solve stable
      let x: number[];
      try {
        x = solve(new Matrix(A), Matrix.columnVector(b)).to1DArray();
      } catch {
        break;
      }
      if (!x.every((v) => Number.isFinite(v))) break;
      const w = new THREE.Vector3(x[0], x[1], x[2]);
      const angle = w.length();
      const step = new THREE.Matrix4().makeTranslation(x[3], x[4], x[5]);
      if (angle > 1e-12) step.multiply(new THREE.Matrix4().makeRotationAxis(w.normalize(), angle));
      current = step.multiply(current);
      const wasAtEnd = maxDist <= endMaxDist;
      maxDist = Math.max(endMaxDist, maxDist * 0.8);
      if (wasAtEnd && angle < 2e-5 && Math.hypot(x[3], x[4], x[5]) < 0.0002) break;
    }
    return { matrix: current, stats: measureFit(bvh, samples, current), iterations };
  };

  // Turn a matrix about the vertical axis through the aligned move-out scan's centre.
  const turned = (m: THREE.Matrix4, degrees: number) => {
    const c = new THREE.Vector3();
    for (let i = 0; i < samples.length; i += 3) {
      c.add(q.set(samples[i], samples[i + 1], samples[i + 2]).applyMatrix4(m));
    }
    c.divideScalar(Math.max(1, sampleTotal));
    return new THREE.Matrix4()
      .makeTranslation(c.x, c.y, c.z)
      .multiply(new THREE.Matrix4().makeRotationY((degrees * Math.PI) / 180))
      .multiply(new THREE.Matrix4().makeTranslation(-c.x, -c.y, -c.z))
      .multiply(m);
  };

  // Centre of the move-out samples (in move-out coordinates).
  const pBar = new THREE.Vector3();
  for (let i = 0; i < samples.length; i += 3) {
    pBar.x += samples[i];
    pBar.y += samples[i + 1];
    pBar.z += samples[i + 2];
  }
  pBar.divideScalar(Math.max(1, sampleTotal));

  /** Rebuild `m` with a new linear part, keeping where it puts the scan's centre. */
  const withLinear = (m: THREE.Matrix4, linear: THREE.Matrix4) => {
    const c = pBar.clone().applyMatrix4(m);
    const moved = pBar.clone().applyMatrix4(linear);
    return new THREE.Matrix4().makeTranslation(c.x - moved.x, c.y - moved.y, c.z - moved.z).multiply(linear);
  };
  // Pure rotation of m (three.js divides out each column's length).
  const rotationOf = (m: THREE.Matrix4) => new THREE.Matrix4().extractRotation(m);

  // The tap fit with its tilt removed: keep its heading (yaw) and where it puts the scan's centre.
  const leveled = (m: THREE.Matrix4, s = scale) => {
    const el = m.elements;
    const ms = new THREE.Vector3().setFromMatrixScale(m).x || 1;
    const yaw = Math.atan2(el[8] / ms, el[10] / ms); // R[0][2], R[2][2]
    return withLinear(m, new THREE.Matrix4().makeRotationY(yaw).multiply(new THREE.Matrix4().makeScale(s, s, s)));
  };

  // The tap fit at true size: 4 slightly-off taps can get the scale wrong by a few percent,
  // which no rigid fine-tune can undo, while phone LiDAR scans are already in real meters.
  const atTrueSize = (m: THREE.Matrix4) => withLinear(m, rotationOf(m));
  // The same seed moved by about one stair step / shelf: repeating geometry creates false fits
  // offset by one step, so retries also start one step away in each direction.
  const shifted = (m: THREE.Matrix4, d: Vec3) => new THREE.Matrix4().makeTranslation(d[0], d[1], d[2]).multiply(m);
  const STEP_SHIFTS: Vec3[] = [
    [0.2, 0, 0],
    [-0.2, 0, 0],
    [0, 0, 0.2],
    [0, 0, -0.2],
    [0, 0.18, 0],
    [0, -0.18, 0],
  ];

  const before = measureFit(bvh, samples, initial);
  let best = planeIcpFrom(initial, firstStartDist);
  let totalIterations = best.iterations;
  // Comfortably inside the 2 cm gate: stop early. Otherwise try other starts and keep the best.
  const clearlyGood = (f: FitStats) => f.medianGapMeters <= 0.018 && f.shareWithin5cm >= 0.65;
  if (options.retries !== false && !clearlyGood(best.stats)) {
    const level = leveled(initial);
    const nearTrueSize = Math.abs(scale - 1) <= 0.05;
    const retries: Array<() => ReturnType<typeof icpFrom>> = [
      ...(nearTrueSize
        ? [
            () => planeIcpFrom(atTrueSize(initial), firstStartDist),
            () => planeIcpFrom(leveled(initial, 1), firstStartDist),
          ]
        : []),
      () => icpFrom(initial, firstStartDist),
      () => planeIcpFrom(level, firstStartDist),
      () => planeIcpFrom(initial, 0.6),
      ...STEP_SHIFTS.map((d) => () => planeIcpFrom(shifted(level, d), firstStartDist)),
      () => planeIcpFrom(turned(level, 2), firstStartDist),
      () => planeIcpFrom(turned(level, -2), firstStartDist),
    ];
    const startedAt = typeof performance !== "undefined" ? performance.now() : 0;
    for (const run of retries) {
      const attempt = run();
      totalIterations += attempt.iterations;
      if (betterFit(attempt.stats, best.stats)) best = attempt;
      if (clearlyGood(best.stats)) break;
      // Keep the page responsive: stop retrying after ~2.5 s and use the best fit so far.
      if (typeof performance !== "undefined" && performance.now() - startedAt > 2500) break;
    }
  }
  moveInGeom.dispose();

  const improved = betterFit(best.stats, before);
  const chosen = improved ? best.matrix : initial;

  const e = chosen.elements; // column-major
  const chosenScale = new THREE.Vector3().setFromMatrixScale(chosen).x || scale;
  const rotation: Rotation3 = [
    [e[0] / chosenScale, e[4] / chosenScale, e[8] / chosenScale],
    [e[1] / chosenScale, e[5] / chosenScale, e[9] / chosenScale],
    [e[2] / chosenScale, e[6] / chosenScale, e[10] / chosenScale],
  ];
  const floorTiltDeg = (Math.acos(Math.max(-1, Math.min(1, rotation[1][1]))) * 180) / Math.PI;

  return {
    matrixColumnMajor: Array.from(e),
    scale: chosenScale,
    rotation,
    translation: [e[12], e[13], e[14]],
    floorTiltDeg,
    improved,
    iterations: totalIterations,
    before,
    after: improved ? best.stats : before,
  };
}
