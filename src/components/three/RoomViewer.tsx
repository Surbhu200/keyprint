"use client";

import { Suspense, useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { Canvas, type ThreeEvent } from "@react-three/fiber";
import { CameraControls, useGLTF, useProgress } from "@react-three/drei";
import type CameraControlsImpl from "camera-controls";
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
}

function LoadedRoom({
  url,
  pins,
  onSurfaceTap,
  onPinSelect,
  onModelLoaded,
  flyTo,
}: ModelSceneProps) {
  const { scene } = useGLTF(url);
  // Clone so two side-by-side viewers never mutate each other's scene graph,
  // while keeping world coordinates strictly identical to the file's coordinates.
  const cloned = useMemo(() => scene.clone(true), [scene]);
  const controlsRef = useRef<CameraControlsImpl | null>(null);
  const pointerDownRef = useRef<{ x: number; y: number } | null>(null);
  const fittedRef = useRef<string | null>(null);

  useEffect(() => {
    cloned.updateMatrixWorld(true);
    onModelLoaded?.(cloned);

    if (controlsRef.current && fittedRef.current !== url) {
      const box = new THREE.Box3().setFromObject(cloned);
      if (!box.isEmpty()) {
        // Never move or re-center the model; frame it with CameraControls.fitToBox
        const center = box.getCenter(new THREE.Vector3());
        const size = box.getSize(new THREE.Vector3());
        controlsRef.current.setLookAt(
          center.x + size.x * 0.65,
          center.y + size.y * 0.65,
          center.z + size.z * 0.95,
          center.x,
          center.y * 0.85,
          center.z,
          false,
        );
        controlsRef.current.fitToBox(box, false, {
          paddingLeft: 0.15,
          paddingRight: 0.15,
          paddingTop: 0.15,
          paddingBottom: 0.15,
        });
        fittedRef.current = url;
      }
    }
  }, [cloned, url, onModelLoaded]);

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

    onSurfaceTap({
      point: [p.x, p.y, p.z],
      normal: [n.x, n.y, n.z],
    });
  };

  return (
    <>
      <CameraControls ref={controlsRef} makeDefault smoothTime={0.35} />
      <ambientLight intensity={0.9} />
      <directionalLight position={[5, 8, 6]} intensity={0.95} />
      <directionalLight position={[-4, 5, -3]} intensity={0.4} />
      <primitive
        object={cloned}
        onPointerDown={handlePointerDown}
        onPointerUp={handlePointerUp}
      />
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
}: RoomViewerProps) {
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
          />
        </Suspense>
      </Canvas>
    </div>
  );
}
