"use client";

import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import {
  boxCenterToNdc,
  type BoundingBoxPx,
  type MoveInPinRef,
  type ProjectedPin2D,
} from "@/lib/ai/matching";

export interface ViewpointSpec {
  viewId: string;
  cameraPos: [number, number, number];
  lookAt: [number, number, number];
}

export interface RenderedViewPair {
  viewId: string;
  beforeBlob: Blob;
  afterBlob: Blob;
  beforeDataUrl: string;
  afterDataUrl: string;
  pins: ProjectedPin2D[];
  cameraPos: [number, number, number];
  lookAt: [number, number, number];
}

const WIDTH = 1024;
const HEIGHT = 768;
const FOV = 50;

function loadGlb(url: string): Promise<THREE.Group> {
  return new Promise((resolve, reject) => {
    const loader = new GLTFLoader();
    loader.load(url, (gltf) => resolve(gltf.scene), undefined, reject);
  });
}

function buildCamera(pos: [number, number, number], lookAt: [number, number, number]) {
  const cam = new THREE.PerspectiveCamera(FOV, WIDTH / HEIGHT, 0.05, 50);
  cam.position.set(pos[0], pos[1], pos[2]);
  cam.lookAt(lookAt[0], lookAt[1], lookAt[2]);
  cam.updateMatrixWorld(true);
  cam.updateProjectionMatrix();
  return cam;
}

/**
 * Generates up to 12 matching viewpoints per docs/BUILD.md:
 *   - One view per move-in pin (1.2 m out along pin normal looking at pin)
 *   - Coverage ring at eye height around the room center
 */
export function buildDefaultViewpoints(
  moveInRoot: THREE.Object3D,
  moveInPins: Array<{
    id: string;
    position: [number, number, number];
    normal?: [number, number, number];
  }>,
): ViewpointSpec[] {
  const views: ViewpointSpec[] = [];

  for (const pin of moveInPins.slice(0, 6)) {
    const [nx, ny, nz] = pin.normal ?? [0, 0.35, 1];
    const dir = new THREE.Vector3(nx, ny, nz).normalize();
    const camPos = new THREE.Vector3(...pin.position).addScaledVector(dir, 1.2);
    if (Math.abs(dir.y) > 0.85) {
      camPos.z += 0.65;
      camPos.y += 0.25;
    }
    views.push({
      viewId: `pin-${pin.id}`,
      cameraPos: [camPos.x, camPos.y, camPos.z],
      lookAt: [...pin.position],
    });
  }

  const box = new THREE.Box3().setFromObject(moveInRoot);
  const center = box.getCenter(new THREE.Vector3());
  const size = box.getSize(new THREE.Vector3());

  // Coverage views pointing at key surfaces (carpet/floor, back wall, left wall, desk)
  const coverage: ViewpointSpec[] = [
    {
      viewId: "overview-floor-rug",
      cameraPos: [center.x + size.x * 0.25, Math.min(2.1, size.y * 0.72), center.z + size.z * 0.45],
      lookAt: [center.x + 0.2, 0.1, center.z + 0.2],
    },
    {
      viewId: "overview-left-wall",
      cameraPos: [center.x + size.x * 0.35, 1.25, center.z + size.z * 0.25],
      lookAt: [box.min.x + 0.05, 0.75, center.z + 0.15],
    },
    {
      viewId: "overview-back-wall",
      cameraPos: [center.x, 1.35, center.z + size.z * 0.42],
      lookAt: [center.x, 1.1, box.min.z + 0.05],
    },
    {
      viewId: "overview-desk-corner",
      cameraPos: [center.x - size.x * 0.1, 1.45, center.z + size.z * 0.15],
      lookAt: [box.min.x + size.x * 0.3, 0.78, box.min.z + size.z * 0.18],
    },
  ];

  for (const c of coverage) {
    if (views.length < 12) views.push(c);
  }
  return views.slice(0, 12);
}

/** Projects 3D move-in pins into 1024x768 pixel coordinates (origin top-left, y down). */
function projectPinsTo2D(
  cam: THREE.PerspectiveCamera,
  pins: MoveInPinRef[],
): ProjectedPin2D[] {
  const projected: ProjectedPin2D[] = [];
  const v = new THREE.Vector3();
  for (const p of pins) {
    if (!p.countsAsMoveIn) continue;
    v.set(p.position[0], p.position[1], p.position[2]).project(cam);
    if (v.z >= -1 && v.z <= 1 && v.x >= -1 && v.x <= 1 && v.y >= -1 && v.y <= 1) {
      const x = ((v.x + 1) / 2) * WIDTH;
      const y = ((1 - v.y) / 2) * HEIGHT;
      projected.push({ id: p.id, x: Math.round(x), y: Math.round(y) });
    }
  }
  return projected;
}

/**
 * Renders matching BEFORE & AFTER 1024x768 JPEG pairs from a single dedicated
 * 4:3 camera into an offscreen WebGLRenderTarget (flipping bottom-up rows!).
 */
export async function renderBeforeAfterPairs(params: {
  moveInUrl: string;
  moveOutUrl: string;
  alignmentMatrix: number[];
  moveInPins: MoveInPinRef[];
  customViewpoints?: ViewpointSpec[];
}): Promise<{
  pairs: RenderedViewPair[];
  raycastBox: (viewId: string, box: BoundingBoxPx) => [number, number, number] | null;
}> {
  const [moveInRoot, moveOutRoot] = await Promise.all([
    loadGlb(params.moveInUrl),
    loadGlb(params.moveOutUrl),
  ]);

  moveInRoot.updateMatrixWorld(true);
  const alignedMoveOut = new THREE.Group();
  alignedMoveOut.add(moveOutRoot);
  alignedMoveOut.matrixAutoUpdate = false;
  alignedMoveOut.matrix.fromArray(params.alignmentMatrix);
  alignedMoveOut.updateMatrixWorld(true);

  const viewpoints =
    params.customViewpoints ?? buildDefaultViewpoints(moveInRoot, params.moveInPins);

  const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
  renderer.setSize(WIDTH, HEIGHT, false);
  renderer.setPixelRatio(1);
  renderer.outputColorSpace = THREE.SRGBColorSpace;

  const target = new THREE.WebGLRenderTarget(WIDTH, HEIGHT);
  const pixelBuf = new Uint8Array(WIDTH * HEIGHT * 4);

  const canvas2d = document.createElement("canvas");
  canvas2d.width = WIDTH;
  canvas2d.height = HEIGHT;
  const ctx = canvas2d.getContext("2d");
  if (!ctx) throw new Error("2D canvas unavailable for offscreen JPEG encoding.");
  const imageData = ctx.createImageData(WIDTH, HEIGHT);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color("#ebe6de");
  scene.add(new THREE.AmbientLight(0xffffff, 0.95));
  const dir1 = new THREE.DirectionalLight(0xffffff, 0.95);
  dir1.position.set(5, 8, 6);
  scene.add(dir1);
  const dir2 = new THREE.DirectionalLight(0xffffff, 0.4);
  dir2.position.set(-4, 5, -3);
  scene.add(dir2);

  scene.add(moveInRoot);
  scene.add(alignedMoveOut);

  const captureJpeg = async (
    cam: THREE.PerspectiveCamera,
  ): Promise<{ blob: Blob; dataUrl: string }> => {
    renderer.setRenderTarget(target);
    renderer.render(scene, cam);
    renderer.readRenderTargetPixels(target, 0, 0, WIDTH, HEIGHT, pixelBuf);
    renderer.setRenderTarget(null);

    // Flip WebGL bottom-up rows to top-down ImageData
    const rowBytes = WIDTH * 4;
    for (let y = 0; y < HEIGHT; y++) {
      const srcOffset = (HEIGHT - 1 - y) * rowBytes;
      const dstOffset = y * rowBytes;
      imageData.data.set(pixelBuf.subarray(srcOffset, srcOffset + rowBytes), dstOffset);
    }
    ctx.putImageData(imageData, 0, 0);

    const dataUrl = canvas2d.toDataURL("image/jpeg", 0.85);
    const blob = await new Promise<Blob>((resolve, reject) =>
      canvas2d.toBlob(
        (b) => (b ? resolve(b) : reject(new Error("JPEG encode failed"))),
        "image/jpeg",
        0.85,
      ),
    );
    return { blob, dataUrl };
  };

  const pairs: RenderedViewPair[] = [];
  const cameraMap = new Map<string, THREE.PerspectiveCamera>();

  for (const vp of viewpoints) {
    const cam = buildCamera(vp.cameraPos, vp.lookAt);
    cameraMap.set(vp.viewId, cam);

    moveInRoot.visible = true;
    alignedMoveOut.visible = false;
    const before = await captureJpeg(cam);

    moveInRoot.visible = false;
    alignedMoveOut.visible = true;
    const after = await captureJpeg(cam);

    pairs.push({
      viewId: vp.viewId,
      beforeBlob: before.blob,
      afterBlob: after.blob,
      beforeDataUrl: before.dataUrl,
      afterDataUrl: after.dataUrl,
      pins: projectPinsTo2D(cam, params.moveInPins),
      cameraPos: vp.cameraPos,
      lookAt: vp.lookAt,
    });
  }

  target.dispose();
  renderer.dispose();

  // Keep alignedMoveOut ready for raycasting Claude's returned bounding boxes directly
  // in move-in coordinates (never apply the inverse transform!).
  const raycaster = new THREE.Raycaster();
  const raycastBox = (
    viewId: string,
    box: BoundingBoxPx,
  ): [number, number, number] | null => {
    const cam = cameraMap.get(viewId);
    if (!cam) return null;
    const ndc = boxCenterToNdc(box, WIDTH, HEIGHT);
    raycaster.setFromCamera(new THREE.Vector2(ndc.x, ndc.y), cam);
    const hits = raycaster.intersectObject(alignedMoveOut, true);
    if (hits.length === 0) return null;
    const pt = hits[0].point;
    return [pt.x, pt.y, pt.z];
  };

  return { pairs, raycastBox };
}
