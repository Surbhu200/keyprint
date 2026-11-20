"use client";

import * as THREE from "three";
import { MeshBVH } from "three-mesh-bvh";

/**
 * A spot where the aligned move-out scan looks clearly different from the move-in scan
 * (for example a new stain or mark). Used to point extra AI camera views at real changes:
 * fixed overview cameras can miss a mark on a wall they don't face.
 */
export interface ChangeSpot {
  position: [number, number, number];
  /** Surface normal of the move-in wall/floor there, pointing into the room. */
  normal: [number, number, number];
  score: number;
  samples: number;
}

type Sampler = (u: number, v: number) => [number, number, number];

const MAX_SAMPLES = 60000;
const SAMPLE_SPACING = 0.025; // ~one sample per 2.5 x 2.5 cm of move-out surface
const MAX_SURFACE_GAP = 0.04; // compare colours only where the two surfaces coincide
const CELL = 0.2; // clustering grid (m)

/** Reads base-colour textures once (downscaled) so colours can be looked up by UV. */
function makeSamplerFactory(textureSize: number) {
  const cache = new Map<THREE.Texture, Sampler | null>();
  return (mesh: THREE.Mesh): Sampler | null => {
    const material = (Array.isArray(mesh.material) ? mesh.material[0] : mesh.material) as
      | THREE.MeshStandardMaterial
      | undefined;
    const map = material?.map ?? null;
    if (!map) return null;
    if (cache.has(map)) return cache.get(map) ?? null;
    let sampler: Sampler | null = null;
    const image = map.image as (CanvasImageSource & { width?: number; height?: number }) | undefined;
    if (image && (image.width ?? 0) > 0 && typeof document !== "undefined") {
      const canvas = document.createElement("canvas");
      canvas.width = textureSize;
      canvas.height = textureSize;
      const ctx = canvas.getContext("2d", { willReadFrequently: true });
      if (ctx) {
        ctx.drawImage(image, 0, 0, textureSize, textureSize);
        const px = ctx.getImageData(0, 0, textureSize, textureSize).data;
        const flip = map.flipY;
        sampler = (u, v) => {
          const uu = u - Math.floor(u);
          let vv = v - Math.floor(v);
          if (flip) vv = 1 - vv;
          const x = Math.min(textureSize - 1, Math.floor(uu * textureSize));
          const y = Math.min(textureSize - 1, Math.floor(vv * textureSize));
          const i = (y * textureSize + x) * 4;
          return [px[i], px[i + 1], px[i + 2]];
        };
      }
    }
    cache.set(map, sampler);
    return sampler;
  };
}

function countTextures(root: THREE.Object3D): number {
  const maps = new Set<THREE.Texture>();
  root.traverse((obj) => {
    if (!(obj instanceof THREE.Mesh)) return;
    const m = (Array.isArray(obj.material) ? obj.material[0] : obj.material) as THREE.MeshStandardMaterial | undefined;
    if (m?.map) maps.add(m.map);
  });
  return maps.size;
}

const luminance = (c: [number, number, number]) => 0.299 * c[0] + 0.587 * c[1] + 0.114 * c[2];
const saturation = (c: [number, number, number]) => {
  const max = Math.max(c[0], c[1], c[2]);
  return max <= 0 ? 0 : (max - Math.min(c[0], c[1], c[2])) / max;
};

/**
 * Finds up to `maxSpots` places where the aligned move-out surface's colour clearly differs
 * from the move-in surface at the same spot (brightness-normalised, so a darker re-scan isn't a
 * "change"; colourful differences weigh more than grey scan noise). Returns [] when the scans
 * have no textures. Both roots must already have their world matrices (move-out incl. alignment).
 */
export function findChangeSpots(
  moveInRoot: THREE.Object3D,
  alignedMoveOutRoot: THREE.Object3D,
  maxSpots = 2,
): ChangeSpot[] {
  moveInRoot.updateMatrixWorld(true);
  alignedMoveOutRoot.updateMatrixWorld(true);
  const textures = countTextures(moveInRoot) + countTextures(alignedMoveOutRoot);
  if (textures === 0) return [];
  const textureSize = textures <= 2 ? 2048 : textures <= 6 ? 1024 : 512;
  const samplerFor = makeSamplerFactory(textureSize);

  // Move-in surface as one world-space geometry (with UVs) + which mesh each triangle came from.
  const positions: number[] = [];
  const uvs: number[] = [];
  const triMesh: number[] = [];
  const inSamplers: Array<Sampler | null> = [];
  const v = new THREE.Vector3();
  moveInRoot.traverse((obj) => {
    if (!(obj instanceof THREE.Mesh) || !obj.geometry) return;
    const geom = obj.geometry as THREE.BufferGeometry;
    const pos = geom.getAttribute("position");
    const uv = geom.getAttribute("uv");
    if (!pos || !uv) return;
    const meshIndex = inSamplers.length;
    inSamplers.push(samplerFor(obj));
    const index = geom.getIndex();
    const count = index ? index.count : pos.count;
    for (let k = 0; k < count; k++) {
      const vi = index ? index.getX(k) : k;
      v.fromBufferAttribute(pos, vi).applyMatrix4(obj.matrixWorld);
      positions.push(v.x, v.y, v.z);
      uvs.push(uv.getX(vi), uv.getY(vi));
      if (k % 3 === 0) triMesh.push(meshIndex);
    }
  });
  if (positions.length < 9 || inSamplers.every((s) => !s)) return [];
  const surface = new THREE.BufferGeometry();
  surface.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  surface.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  const bvh = new MeshBVH(surface);
  const index = surface.getIndex()!.array as ArrayLike<number>; // MeshBVH adds/reorders it
  const box = new THREE.Box3().setFromBufferAttribute(surface.getAttribute("position") as THREE.BufferAttribute);
  const center = box.getCenter(new THREE.Vector3());

  // Sample points spread across the move-out surface (area-weighted, not just triangle corners:
  // scanners use large triangles on flat walls, so a small mark can sit inside one triangle).
  let totalArea = 0;
  const ta = new THREE.Vector3();
  const tb = new THREE.Vector3();
  const tc = new THREE.Vector3();
  alignedMoveOutRoot.traverse((obj) => {
    if (!(obj instanceof THREE.Mesh) || !obj.geometry) return;
    const geom = obj.geometry as THREE.BufferGeometry;
    const pos = geom.getAttribute("position");
    if (!pos) return;
    const idx = geom.getIndex();
    const triCount = (idx ? idx.count : pos.count) / 3;
    for (let t = 0; t < triCount; t++) {
      ta.fromBufferAttribute(pos, idx ? idx.getX(t * 3) : t * 3).applyMatrix4(obj.matrixWorld);
      tb.fromBufferAttribute(pos, idx ? idx.getX(t * 3 + 1) : t * 3 + 1).applyMatrix4(obj.matrixWorld);
      tc.fromBufferAttribute(pos, idx ? idx.getX(t * 3 + 2) : t * 3 + 2).applyMatrix4(obj.matrixWorld);
      totalArea += new THREE.Triangle(ta, tb, tc).getArea();
    }
  });
  const spacing = Math.max(SAMPLE_SPACING, Math.sqrt(totalArea / MAX_SAMPLES));
  const cellArea = spacing * spacing;

  type Sample = { p: THREE.Vector3; n: THREE.Vector3; co: [number, number, number]; ci: [number, number, number] };
  const samples: Sample[] = [];
  const target = { point: new THREE.Vector3(), distance: 0, faceIndex: 0 };
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  const c = new THREE.Vector3();
  const bary = new THREE.Vector3();
  const tri = new THREE.Triangle();
  const posAttr = surface.getAttribute("position") as THREE.BufferAttribute;

  const sa = new THREE.Vector3();
  const sb = new THREE.Vector3();
  const sc = new THREE.Vector3();
  let seed = 12345;
  const rand = () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296;
  alignedMoveOutRoot.traverse((obj) => {
    if (!(obj instanceof THREE.Mesh) || !obj.geometry) return;
    const geom = obj.geometry as THREE.BufferGeometry;
    const pos = geom.getAttribute("position");
    const uv = geom.getAttribute("uv");
    const outSampler = uv ? samplerFor(obj) : null;
    if (!pos || !uv || !outSampler) return;
    const idx = geom.getIndex();
    const triCount = (idx ? idx.count : pos.count) / 3;
    for (let t = 0; t < triCount; t++) {
      const i0 = idx ? idx.getX(t * 3) : t * 3;
      const i1 = idx ? idx.getX(t * 3 + 1) : t * 3 + 1;
      const i2 = idx ? idx.getX(t * 3 + 2) : t * 3 + 2;
      sa.fromBufferAttribute(pos, i0).applyMatrix4(obj.matrixWorld);
      sb.fromBufferAttribute(pos, i1).applyMatrix4(obj.matrixWorld);
      sc.fromBufferAttribute(pos, i2).applyMatrix4(obj.matrixWorld);
      const area = new THREE.Triangle(sa, sb, sc).getArea();
      // Expected samples = area / cellArea; the fractional part is sampled at random.
      const expected = area / cellArea;
      let n = Math.floor(expected);
      if (rand() < expected - n) n += 1;
      for (let k = 0; k < n; k++) {
        let r1 = rand();
        let r2 = rand();
        if (r1 + r2 > 1) {
          r1 = 1 - r1;
          r2 = 1 - r2;
        }
        const r0 = 1 - r1 - r2;
        v.set(
          r0 * sa.x + r1 * sb.x + r2 * sc.x,
          r0 * sa.y + r1 * sb.y + r2 * sc.y,
          r0 * sa.z + r1 * sb.z + r2 * sc.z,
        );
        const su = r0 * uv.getX(i0) + r1 * uv.getX(i1) + r2 * uv.getX(i2);
        const sv = r0 * uv.getY(i0) + r1 * uv.getY(i1) + r2 * uv.getY(i2);
      const hit = bvh.closestPointToPoint(v, target, 0, MAX_SURFACE_GAP);
      if (!hit || hit.distance > MAX_SURFACE_GAP) continue;
      const f = hit.faceIndex * 3;
      const ia = index[f];
      const ib = index[f + 1];
      const ic = index[f + 2];
      const inSampler = inSamplers[triMesh[Math.floor(ia / 3)]];
      if (!inSampler) continue;
      a.fromBufferAttribute(posAttr, ia);
      b.fromBufferAttribute(posAttr, ib);
      c.fromBufferAttribute(posAttr, ic);
      tri.set(a, b, c);
      tri.getBarycoord(hit.point, bary);
      const u = bary.x * uvs[ia * 2] + bary.y * uvs[ib * 2] + bary.z * uvs[ic * 2];
      const w = bary.x * uvs[ia * 2 + 1] + bary.y * uvs[ib * 2 + 1] + bary.z * uvs[ic * 2 + 1];
      if (!Number.isFinite(u) || !Number.isFinite(w)) continue;
      const n = tri.getNormal(new THREE.Vector3());
      if (n.dot(new THREE.Vector3().subVectors(center, hit.point)) < 0) n.negate();
      samples.push({
        p: hit.point.clone(),
        n,
        co: outSampler(su, sv),
        ci: inSampler(u, w),
      });
      }
    }
  });
  surface.dispose();
  if (samples.length < 50) return [];

  // Brightness normalisation: a whole re-scan being darker or brighter isn't a change.
  const ratios = samples
    .map((s) => luminance(s.co) / Math.max(1, luminance(s.ci)))
    .filter((r) => Number.isFinite(r))
    .sort((x, y) => x - y);
  const gain = Math.min(1.6, Math.max(0.6, ratios[Math.floor(ratios.length / 2)] ?? 1));

  // Score each sample: colour distance after normalisation, weighted toward colourful changes.
  const cells = new Map<string, { score: number; count: number; p: THREE.Vector3; n: THREE.Vector3 }>();
  for (const s of samples) {
    const ci: [number, number, number] = [s.ci[0] * gain, s.ci[1] * gain, s.ci[2] * gain];
    const d = Math.hypot(s.co[0] - ci[0], s.co[1] - ci[1], s.co[2] - ci[2]) / 255;
    if (d < 0.25) continue;
    // A new colourful mark on a plainer surface weighs most; grey scan noise least.
    const newColour = Math.max(0, saturation(s.co) - saturation(ci));
    const score = d * (0.3 + saturation(s.co) + 2 * newColour);
    const key = `${Math.floor(s.p.x / CELL)},${Math.floor(s.p.y / CELL)},${Math.floor(s.p.z / CELL)}`;
    const cell = cells.get(key) ?? { score: 0, count: 0, p: new THREE.Vector3(), n: new THREE.Vector3() };
    cell.score += score;
    cell.count += 1;
    cell.p.addScaledVector(s.p, score);
    cell.n.addScaledVector(s.n, score);
    cells.set(key, cell);
  }

  // Rank by how strong and concentrated a change is (mean x sqrt(size)), so one bright new mark
  // beats a large but faint patch of scan-coverage noise.
  const strength = (cell: { score: number; count: number }) => (cell.score / cell.count) * Math.sqrt(cell.count);
  const ranked = [...cells.values()]
    .filter((cell) => cell.count >= 3 && cell.score >= 1)
    .sort((x, y) => strength(y) - strength(x));
  const spots: ChangeSpot[] = [];
  for (const cell of ranked) {
    const p = cell.p.clone().divideScalar(cell.score);
    if (spots.some((s) => p.distanceTo(new THREE.Vector3(...s.position)) < 0.5)) continue;
    const n = cell.n.lengthSq() > 1e-12 ? cell.n.clone().normalize() : new THREE.Vector3(0, 1, 0);
    spots.push({
      position: [p.x, p.y, p.z],
      normal: [n.x, n.y, n.z],
      score: cell.score,
      samples: cell.count,
    });
    if (spots.length >= maxSpots) break;
  }
  return spots;
}
