"use client";

import { Suspense, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { Canvas, type ThreeEvent } from "@react-three/fiber";
import { CameraControls, useGLTF, useProgress } from "@react-three/drei";
import type CameraControlsImpl from "camera-controls";
import { RotateCcw } from "lucide-react";
import { PinMarker, type SpatialPinItem } from "./PinMarker";

export interface SurfaceTapEvent {
  point: [number, number, number];
  normal: [number, number, number];
}

interface ModelSceneProps {
  url: string;
  pins: SpatialPinItem[];
  onSurfaceTap?: (tap: SurfaceTapEvent) => void;
  onPinSelect?: (pin: SpatialPinItem) => void;
  onModelLoaded?: (scene: THREE.Object3D) => void;
  flyTo?: {
    position: [number, number, number];
    normal?: [number, number, number];
    nonce: number;
  } | null;
  resetNonce?: number;
  /**
   * Optional 4x4 column-major matrix applied to the whole model, e.g. the sealed alignment
   * ("maps move-out coordinates to move-in coordinates"). With it, a move-out scan is shown
   * in move-in coordinates, so taps and pins share one frame.
   */
  modelMatrix?: number[] | null;
}

function LoadedRoom({
  url,
  pins,
  onSurfaceTap,
  onPinSelect,
  onModelLoaded,
  flyTo,
  resetNonce,
  modelMatrix,
}: ModelSceneProps) {
  const { scene } = useGLTF(url);
  // Clone so two side-by-side viewers never mutate each other's scene graph,
  // while keeping world coordinates strictly identical to the file's coordinates.
  const cloned = useMemo(() => scene.clone(true), [scene]);
  const groupRef = useRef<THREE.Group | null>(null);
  const matrixKey = modelMatrix && modelMatrix.length === 16 ? modelMatrix.join(",") : "";

  useLayoutEffect(() => {
    const g = groupRef.current;
    if (!g) return;
    g.matrixAutoUpdate = false;
    if (matrixKey) {
      g.matrix.fromArray(matrixKey.split(",").map(Number));
    } else {
      g.matrix.identity();
    }
    g.matrixWorldNeedsUpdate = true;
    g.updateMatrixWorld(true);
  }, [matrixKey]);

  const controlsRef = useRef<CameraControlsImpl | null>(null);
  const pointerDownRef = useRef<{ x: number; y: number } | null>(null);
  const fittedRef = useRef<string | null>(null);

  const frameInterior = (smooth: boolean) => {
    if (!controlsRef.current) return;
    const box = new THREE.Box3().setFromObject(cloned);
    if (box.isEmpty()) return;
    const center = box.getCenter(new THREE.Vector3());
    const size = box.getSize(new THREE.Vector3());
    controlsRef.current.setLookAt(
      center.x + size.x * 0.16,
      box.min.y + size.y * 0.62,
      box.max.z - Math.min(0.25, size.z * 0.08),
      center.x - size.x * 0.05,
      box.min.y + size.y * 0.28,
      center.z + size.z * 0.02,
      smooth,
    );
  };

  useEffect(() => {
    groupRef.current?.updateMatrixWorld(true);
    onModelLoaded?.(cloned);

    const fitKey = `${url}|${matrixKey}`;
    if (controlsRef.current && fittedRef.current !== fitKey) {
      frameInterior(false);
      fittedRef.current = fitKey;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cloned, url, matrixKey, onModelLoaded]);

  useEffect(() => {
    if (resetNonce && resetNonce > 0) {
      frameInterior(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resetNonce]);

  useEffect(() => {
    if (!flyTo || !controlsRef.current) return;
    const [tx, ty, tz] = flyTo.position;
    const [nx, ny, nz] = flyTo.normal ?? [0, 0.35, 1];
    const dir = new THREE.Vector3(nx, ny, nz).normalize();
    const camPos = new THREE.Vector3(tx, ty, tz).addScaledVector(dir, 1.35);
    // Lift slightly if normal points straight up or down
    if (Math.abs(dir.y) > 0.85) {
      camPos.z += 0.85;
      camPos.y += 0.35;
    }
    controlsRef.current.setLookAt(camPos.x, camPos.y, camPos.z, tx, ty, tz, true);
  }, [flyTo]);

  const handlePointerDown = (e: ThreeEvent<PointerEvent>) => {
    pointerDownRef.current = { x: e.clientX, y: e.clientY };
  };

  const handlePointerUp = (e: ThreeEvent<PointerEvent>) => {
    if (!onSurfaceTap || !pointerDownRef.current) return;
    const dx = e.clientX - pointerDownRef.current.x;
    const dy = e.clientY - pointerDownRef.current.y;
    pointerDownRef.current = null;
    // Ignore drags (camera orbit)
    if (Math.hypot(dx, dy) > 6) return;
    e.stopPropagation();

    const p = e.point;
    const n = e.face
      ? e.face.normal.clone().transformDirection(e.object.matrixWorld).normalize()
      : new THREE.Vector3(0, 1, 0);
    // Scans are double-sided: make the stored normal face the camera that tapped it.
    if (n.dot(e.ray.direction) > 0) n.negate();

    onSurfaceTap({
      point: [p.x, p.y, p.z],
      normal: [n.x, n.y, n.z],
    });
  };

  return (
    <>
      <CameraControls ref={controlsRef} makeDefault smoothTime={0.35} />
      <hemisphereLight args={["#fff8f0", "#7c7268", 1.1]} />
      <ambientLight intensity={0.65} />
      <directionalLight position={[4, 7, 5]} intensity={1.1} />
      <directionalLight position={[-4, 4, -3]} intensity={0.45} />
      <group ref={groupRef}>
        <primitive
          object={cloned}
          onPointerDown={handlePointerDown}
          onPointerUp={handlePointerUp}
        />
      </group>
      {pins.map((pin) => (
        <PinMarker key={pin.id} pin={pin} onSelect={onPinSelect} />
      ))}
    </>
  );
}

function LoadOverlay() {
  const { active, progress } = useProgress();
  if (!active) return null;
  return (
    <div className="pointer-events-none absolute inset-0 z-10 flex flex-col items-center justify-center bg-muted/80 backdrop-blur-[2px]">
      <div className="w-44 h-2 rounded-full bg-border overflow-hidden">
        <div
          className="h-full bg-accent transition-all duration-150"
          style={{ width: `${Math.round(progress)}%` }}
        />
      </div>
      <span className="mt-2 text-xs font-medium text-muted-foreground">
        Loading 3D room… {Math.round(progress)}%
      </span>
    </div>
  );
}

export interface RoomViewerProps {
  url: string;
  pins?: SpatialPinItem[];
  onSurfaceTap?: (tap: SurfaceTapEvent) => void;
  onPinSelect?: (pin: SpatialPinItem) => void;
  onModelLoaded?: (scene: THREE.Object3D) => void;
  flyTo?: {
    position: [number, number, number];
    normal?: [number, number, number];
    nonce: number;
  } | null;
  heightClassName?: string;
  hint?: string;
  /** See ModelSceneProps.modelMatrix. */
  modelMatrix?: number[] | null;
}

export function RoomViewer({
  url,
  pins = [],
  onSurfaceTap,
  onPinSelect,
  onModelLoaded,
  flyTo,
  heightClassName = "h-[460px]",
  hint,
  modelMatrix,
}: RoomViewerProps) {
  const [resetNonce, setResetNonce] = useState(0);

  return (
    <div
      className={`relative w-full overflow-hidden rounded-2xl border border-border bg-[#ebe6de] ${heightClassName}`}
    >
      <LoadOverlay />
      {hint && (
        <div className="pointer-events-none absolute top-3 left-3 z-10 rounded-full bg-surface/90 backdrop-blur-xs border border-border px-3 py-1 text-xs font-medium text-foreground shadow-xs">
          {hint}
        </div>
      )}
      <button
        type="button"
        onClick={() => setResetNonce((n) => n + 1)}
        title="Reset camera view"
        aria-label="Reset camera view"
        className="absolute top-3 right-3 z-10 inline-flex items-center gap-1 rounded-full bg-surface/90 hover:bg-surface backdrop-blur-xs border border-border px-2.5 py-1 text-xs font-medium text-foreground shadow-xs cursor-pointer"
      >
        <RotateCcw className="h-3 w-3" />
        <span>Reset</span>
      </button>
      <Canvas
        dpr={[1, 1.5]}
        camera={{ fov: 48, near: 0.05, far: 100 }}
        gl={{ antialias: true, preserveDrawingBuffer: true }}
      >
        <color attach="background" args={["#ebe6de"]} />
        <Suspense fallback={null}>
          <LoadedRoom
            url={url}
            pins={pins}
            onSurfaceTap={onSurfaceTap}
            onPinSelect={onPinSelect}
            onModelLoaded={onModelLoaded}
            flyTo={flyTo}
            resetNonce={resetNonce}
            modelMatrix={modelMatrix}
          />
        </Suspense>
      </Canvas>
    </div>
  );
}
