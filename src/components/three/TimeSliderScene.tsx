"use client";

import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { Canvas, useFrame } from "@react-three/fiber";
import { CameraControls, useGLTF, useProgress } from "@react-three/drei";
import type CameraControlsImpl from "camera-controls";
import { GripVertical, RotateCcw } from "lucide-react";
import { PinMarker, type SpatialPinItem } from "./PinMarker";
import { STAGE_COLOR, makeScanUnlit } from "./RoomViewer";

interface ScissorContentProps {
  moveInUrl: string;
  moveOutUrl: string;
  alignmentMatrix: number[];
  splitRef: React.MutableRefObject<number>;
  pins: SpatialPinItem[];
  onPinSelect?: (pin: SpatialPinItem) => void;
  flyTo?: {
    position: [number, number, number];
    normal?: [number, number, number];
    nonce: number;
  } | null;
  resetNonce?: number;
}

function ScissorComparisonContent({
  moveInUrl,
  moveOutUrl,
  alignmentMatrix,
  splitRef,
  pins,
  onPinSelect,
  flyTo,
  resetNonce,
}: ScissorContentProps) {
  const gltfIn = useGLTF(moveInUrl);
  const gltfOut = useGLTF(moveOutUrl);

  const moveInClone = useMemo(() => makeScanUnlit(gltfIn.scene.clone(true)), [gltfIn.scene]);
  const moveOutClone = useMemo(() => makeScanUnlit(gltfOut.scene.clone(true)), [gltfOut.scene]);

  const moveInGroupRef = useRef<THREE.Group>(null);
  const moveOutGroupRef = useRef<THREE.Group>(null);
  const controlsRef = useRef<CameraControlsImpl | null>(null);
  const fittedRef = useRef(false);

  // Apply the exact 4x4 alignment transform (move-out -> move-in) without modifying vertices
  useEffect(() => {
    const grp = moveOutGroupRef.current;
    if (!grp) return;
    grp.matrixAutoUpdate = false;
    grp.matrix.fromArray(alignmentMatrix);
    grp.matrixWorldNeedsUpdate = true;
  }, [alignmentMatrix]);

  // Frame inside the move-in bedroom looking cleanly across the carpet, bed, and window
  const frameInterior = (smooth: boolean) => {
    if (!controlsRef.current) return;
    const box = new THREE.Box3().setFromObject(moveInClone);
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
    if (fittedRef.current || !controlsRef.current) return;
    frameInterior(false);
    fittedRef.current = true;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [moveInClone]);

  useEffect(() => {
    if (resetNonce && resetNonce > 0) {
      frameInterior(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resetNonce]);

  // Smooth fly-to-pin via CameraControls.setLookAt
  useEffect(() => {
    if (!flyTo || !controlsRef.current) return;
    const [tx, ty, tz] = flyTo.position;
    const [nx, ny, nz] = flyTo.normal ?? [0, 0.4, 1];
    const dir = new THREE.Vector3(nx, ny, nz).normalize();
    const camPos = new THREE.Vector3(tx, ty, tz).addScaledVector(dir, 1.35);
    if (Math.abs(dir.y) > 0.85) {
      camPos.z += 0.85;
      camPos.y += 0.4;
    }
    controlsRef.current.setLookAt(camPos.x, camPos.y, camPos.z, tx, ty, tz, true);
  }, [flyTo]);

  // Priority 1 takes over rendering: two scissor passes from the exact same camera.
  useFrame(({ gl, scene, camera, size }) => {
    const inGroup = moveInGroupRef.current;
    const outGroup = moveOutGroupRef.current;
    if (!inGroup || !outGroup) return;

    const width = size.width;
    const height = size.height;
    const splitPx = Math.max(0, Math.min(width, Math.round(width * splitRef.current)));

    gl.autoClear = false;
    gl.setScissorTest(true);

    // Left pass: Move-in scan only
    inGroup.visible = true;
    outGroup.visible = false;
    gl.setScissor(0, 0, splitPx, height);
    gl.setViewport(0, 0, width, height);
    gl.clear(true, true, true);
    gl.render(scene, camera);

    // Right pass: Aligned move-out scan only
    inGroup.visible = false;
    outGroup.visible = true;
    gl.setScissor(splitPx, 0, Math.max(0, width - splitPx), height);
    gl.setViewport(0, 0, width, height);
    gl.clear(true, true, true);
    gl.render(scene, camera);

    gl.setScissorTest(false);
    inGroup.visible = true;
    outGroup.visible = true;
  }, 1);

  return (
    <>
      <CameraControls ref={controlsRef} makeDefault smoothTime={0.35} />
      <hemisphereLight args={["#fff8f0", "#7c7268", 1.1]} />
      <ambientLight intensity={0.65} />
      <directionalLight position={[4, 7, 5]} intensity={1.1} />
      <directionalLight position={[-4, 4, -3]} intensity={0.45} />

      <group ref={moveInGroupRef}>
        <primitive object={moveInClone} />
      </group>
      <group ref={moveOutGroupRef}>
        <primitive object={moveOutClone} />
      </group>

      {pins.map((pin) => (
        <PinMarker key={pin.id} pin={pin} onSelect={onPinSelect} />
      ))}
    </>
  );
}

function SliderLoadOverlay() {
  const { active, progress } = useProgress();
  if (!active) return null;
  return (
    <div className="pointer-events-none absolute inset-0 z-30 flex flex-col items-center justify-center bg-stage/90">
      <div className="h-1 w-48 overflow-hidden rounded-full bg-white/10">
        <div
          className="h-full rounded-full bg-accent-bright transition-[width] duration-150"
          style={{ width: `${Math.round(progress)}%` }}
        />
      </div>
      <span className="mt-3 text-[13px] font-medium tabular-nums text-white/70">
        Preparing comparison… {Math.round(progress)}%
      </span>
    </div>
  );
}

export interface TimeSliderSceneProps {
  moveInUrl: string;
  moveOutUrl: string;
  alignmentMatrix: number[];
  moveInLabel?: string;
  moveOutLabel?: string;
  pins?: SpatialPinItem[];
  onPinSelect?: (pin: SpatialPinItem) => void;
  flyTo?: {
    position: [number, number, number];
    normal?: [number, number, number];
    nonce: number;
  } | null;
  heightClassName?: string;
}

export function TimeSliderScene({
  moveInUrl,
  moveOutUrl,
  alignmentMatrix,
  moveInLabel = "Move-in Nov 19",
  moveOutLabel = "Move-out",
  pins = [],
  onPinSelect,
  flyTo,
  heightClassName = "h-[500px]",
}: TimeSliderSceneProps) {
  const [split, setSplit] = useState(0.5);
  const [resetNonce, setResetNonce] = useState(0);
  const splitRef = useRef(0.5);
  const containerRef = useRef<HTMLDivElement>(null);
  const draggingRef = useRef(false);

  const updateSplitFromClientX = (clientX: number) => {
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect || rect.width <= 0) return;
    const ratio = Math.max(0.03, Math.min(0.97, (clientX - rect.left) / rect.width));
    splitRef.current = ratio;
    setSplit(ratio);
  };

  return (
    <div
      ref={containerRef}
      className={`relative isolate w-full overflow-hidden rounded-[20px] bg-stage ring-1 ring-white/10 shadow-[0_30px_80px_-20px_rgba(10,26,51,0.45)] select-none ${heightClassName}`}
      onPointerMove={(e) => {
        if (draggingRef.current) updateSplitFromClientX(e.clientX);
      }}
      onPointerUp={() => {
        draggingRef.current = false;
      }}
      onPointerLeave={() => {
        draggingRef.current = false;
      }}
    >
      <SliderLoadOverlay />

      <Canvas
        flat
        dpr={[1, 1.5]}
        camera={{ fov: 48, near: 0.05, far: 100 }}
        gl={{ antialias: true, autoClear: false, preserveDrawingBuffer: true }}
      >
        <color attach="background" args={[STAGE_COLOR]} />
        <Suspense fallback={null}>
          <ScissorComparisonContent
            moveInUrl={moveInUrl}
            moveOutUrl={moveOutUrl}
            alignmentMatrix={alignmentMatrix}
            splitRef={splitRef}
            pins={pins}
            onPinSelect={onPinSelect}
            flyTo={flyTo}
            resetNonce={resetNonce}
          />
        </Suspense>
      </Canvas>

      {/* Soft vignette so the scan sits on the stage; below every control. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(120%_90%_at_50%_40%,transparent_55%,rgba(0,0,0,0.5))]"
      />

      {/* Top left / right labels + Reset camera */}
      <div className="pointer-events-none absolute top-3 left-3 z-10 rounded-full border border-white/15 bg-black/55 px-3 py-1.5 text-[12px] font-medium text-white">
        {moveInLabel}
      </div>
      <div className="absolute top-1.5 right-1.5 z-10 flex items-center">
        <div className="pointer-events-none rounded-full border border-white/15 bg-black/55 px-3 py-1.5 text-[12px] font-medium text-white">
          {moveOutLabel}
        </div>
        <button
          type="button"
          onClick={() => {
            setResetNonce((n) => n + 1);
            splitRef.current = 0.5;
            setSplit(0.5);
          }}
          title="Reset camera & slider"
          aria-label="Reset camera and slider"
          className="group inline-flex h-11 w-11 cursor-pointer items-center justify-center focus-visible:outline-none"
        >
          <span className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-white/15 bg-black/55 text-white transition-colors duration-200 group-hover:bg-black/70 group-focus-visible:ring-2 group-focus-visible:ring-accent-bright">
            <RotateCcw className="h-3.5 w-3.5" />
          </span>
        </button>
      </div>

      {/* Vertical wipe bar + draggable handle */}
      <div
        className="absolute top-0 bottom-0 z-10 w-0.5 -translate-x-1/2 bg-white/90 shadow-[0_0_12px_rgba(0,0,0,0.5)] pointer-events-none"
        style={{ left: `${split * 100}%` }}
      />
      <button
        type="button"
        aria-label="Drag to compare move-in and move-out"
        onPointerDown={(e) => {
          e.stopPropagation();
          draggingRef.current = true;
          e.currentTarget.setPointerCapture(e.pointerId);
        }}
        onPointerMove={(e) => {
          if (draggingRef.current) {
            e.stopPropagation();
            updateSplitFromClientX(e.clientX);
          }
        }}
        onPointerUp={(e) => {
          draggingRef.current = false;
          e.currentTarget.releasePointerCapture(e.pointerId);
        }}
        style={{ left: `${split * 100}%` }}
        className="absolute top-1/2 -translate-x-1/2 -translate-y-1/2 z-20 flex h-11 w-11 items-center justify-center rounded-full bg-white text-ink ring-4 ring-white/20 shadow-[0_8px_24px_rgba(0,0,0,0.45)] cursor-ew-resize transition-transform duration-200 motion-safe:hover:scale-105 focus-visible:outline-none focus-visible:ring-accent-bright"
      >
        <GripVertical className="h-4 w-4" />
      </button>

      {/* Bottom accessible range slider fallback */}
      <div className="absolute bottom-3 left-1/2 -translate-x-1/2 md:bottom-4 md:left-4 md:translate-x-0 z-20 flex max-w-[calc(100%-1.5rem)] md:max-w-[calc(100%-2rem)] items-center gap-2.5 rounded-full border border-white/15 bg-black/55 px-3.5 py-2">
        <span className="hidden whitespace-nowrap text-[12px] font-medium text-white/75 sm:inline">
          {moveInLabel}
        </span>
        <input
          type="range"
          min={3}
          max={97}
          value={Math.round(split * 100)}
          onChange={(e) => {
            const v = Number(e.target.value) / 100;
            splitRef.current = v;
            setSplit(v);
          }}
          className="h-6 w-40 cursor-pointer accent-[#8fb0ff] sm:w-44"
          aria-label="Time comparison slider"
        />
        <span className="hidden whitespace-nowrap text-[12px] font-medium text-white/75 sm:inline">
          {moveOutLabel}
        </span>
      </div>
    </div>
  );
}
