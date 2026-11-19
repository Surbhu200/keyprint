import * as THREE from "three";
import { MeshBVH } from "three-mesh-bvh";

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
  const summaryText = `Half the room lines up within ${medianCm} cm; ${pct5cm}% within 5 cm`;

  return {
    sampledCount,
    inlierCountUnder10cm: under10cm.length,
    medianGapMeters,
    shareWithin5cm,
    passedGate,
    summaryText,
  };
}
