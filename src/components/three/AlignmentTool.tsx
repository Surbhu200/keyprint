"use client";

import { useCallback, useRef, useState } from "react";
import type * as THREE from "three";
import { AlertTriangle, CheckCircle2, RotateCcw, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  solveUmeyama,
  type UmeyamaResult,
  type Vec3,
} from "@/lib/three/umeyama";
import {
  computeSurfaceAgreement,
  type SurfaceAgreementMetrics,
} from "@/lib/three/bvh";
import { RoomViewer, type SurfaceTapEvent } from "./RoomViewer";
import type { SpatialPinItem } from "./PinMarker";

export interface AlignmentOutput {
  umeyama: UmeyamaResult;
  agreement: SurfaceAgreementMetrics;
  moveInPoints: Vec3[];
  moveOutPoints: Vec3[];
}

interface AlignmentToolProps {
  moveInUrl: string;
  moveOutUrl: string;
  onAligned?: (result: AlignmentOutput) => void;
  /** Default reference landmarks for instant 1-click test on reference scans. */
  presetLandmarks?: {
    moveIn: Vec3[];
    moveOut: Vec3[];
  };
  maxMedianGapMeters?: number;
  minShareWithin5cm?: number;
}

export function AlignmentTool({
  moveInUrl,
  moveOutUrl,
  onAligned,
  presetLandmarks,
  maxMedianGapMeters = 0.02,
  minShareWithin5cm = 0.6,
}: AlignmentToolProps) {
  const [moveInPts, setMoveInPts] = useState<Vec3[]>([]);
  const [moveOutPts, setMoveOutPts] = useState<Vec3[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [computing, setComputing] = useState(false);
  const [result, setResult] = useState<AlignmentOutput | null>(null);

  const moveInSceneRef = useRef<THREE.Object3D | null>(null);
  const moveOutSceneRef = useRef<THREE.Object3D | null>(null);

  const handleMoveInLoaded = useCallback((scene: THREE.Object3D) => {
    moveInSceneRef.current = scene;
  }, []);

  const handleMoveOutLoaded = useCallback((scene: THREE.Object3D) => {
    moveOutSceneRef.current = scene;
  }, []);

  const runAlignment = useCallback(
    (inPts: Vec3[], outPts: Vec3[]) => {
      setError(null);
      if (inPts.length < 4 || outPts.length < 4) {
        setError("Tap 4 matching distinctive points in both scans (on at least two walls).");
        return;
      }
      if (!moveInSceneRef.current || !moveOutSceneRef.current) {
        setError("Wait for both 3D scans to finish loading before aligning.");
        return;
      }

      setComputing(true);
      try {
        // Order strictly matches docs/BUILD.md: p = moveOutPoints, q = moveInPoints
        const umeyama = solveUmeyama(outPts, inPts);
        const agreement = computeSurfaceAgreement(
          moveInSceneRef.current,
          moveOutSceneRef.current,
          umeyama.matrix4ColumnMajor,
          { maxMedianGapMeters, minShareWithin5cm, sampleCount: 5000 },
        );
        const output: AlignmentOutput = {
          umeyama,
          agreement,
          moveInPoints: inPts,
          moveOutPoints: outPts,
        };
        setResult(output);
        onAligned?.(output);
      } catch (err) {
        setResult(null);
        setError(err instanceof Error ? err.message : "Alignment failed.");
      } finally {
        setComputing(false);
      }
    },
    [maxMedianGapMeters, minShareWithin5cm, onAligned],
  );

  const addMoveInTap = (tap: SurfaceTapEvent) => {
    if (moveInPts.length >= 4) return;
    const next = [...moveInPts, tap.point];
    setMoveInPts(next);
    setError(null);
    if (next.length === 4 && moveOutPts.length === 4) {
      runAlignment(next, moveOutPts);
    }
  };

  const addMoveOutTap = (tap: SurfaceTapEvent) => {
    if (moveOutPts.length >= 4) return;
    const next = [...moveOutPts, tap.point];
    setMoveOutPts(next);
    setError(null);
    if (moveInPts.length === 4 && next.length === 4) {
      runAlignment(moveInPts, next);
    }
  };

  const reset = () => {
    setMoveInPts([]);
    setMoveOutPts([]);
    setResult(null);
    setError(null);
  };

  const toPins = (pts: Vec3[]): SpatialPinItem[] =>
    pts.map((p, idx) => ({
      id: `tap-${idx}`,
      position: p,
      label: `#${idx + 1}`,
      variant: "tap",
    }));

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="text-sm text-muted-foreground">
          Tap the same 4 distinctive spots (door corner, outlet, window edge, desk corner) in each scan, across at least two walls.
        </div>
        <div className="flex items-center gap-2">
          {presetLandmarks && (
            <Button
              variant="secondary"
              size="sm"
              onClick={() => {
                setMoveInPts(presetLandmarks.moveIn);
                setMoveOutPts(presetLandmarks.moveOut);
                runAlignment(presetLandmarks.moveIn, presetLandmarks.moveOut);
              }}
            >
              <Sparkles className="h-3.5 w-3.5" />
              Tap 4 reference corners
            </Button>
          )}
          <Button variant="outline" size="sm" onClick={reset}>
            <RotateCcw className="h-3.5 w-3.5" />
            Reset taps
          </Button>
          <Button
            size="sm"
            disabled={moveInPts.length < 4 || moveOutPts.length < 4 || computing}
            onClick={() => runAlignment(moveInPts, moveOutPts)}
          >
            {computing ? "Measuring…" : "Solve & measure"}
          </Button>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="space-y-2">
          <div className="flex items-center justify-between text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            <span>Move-in scan (reference)</span>
            <span>{moveInPts.length} / 4 taps</span>
          </div>
          <RoomViewer
            url={moveInUrl}
            pins={toPins(moveInPts)}
            onSurfaceTap={addMoveInTap}
            onModelLoaded={handleMoveInLoaded}
            heightClassName="h-[360px]"
            hint={`Tap point #${Math.min(4, moveInPts.length + 1)} on move-in`}
          />
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            <span>Move-out scan (to align)</span>
            <span>{moveOutPts.length} / 4 taps</span>
          </div>
          <RoomViewer
            url={moveOutUrl}
            pins={toPins(moveOutPts)}
            onSurfaceTap={addMoveOutTap}
            onModelLoaded={handleMoveOutLoaded}
            heightClassName="h-[360px]"
            hint={`Tap matching point #${Math.min(4, moveOutPts.length + 1)} on move-out`}
          />
        </div>
      </div>

      {error && (
        <div className="rounded-xl border border-claim/30 bg-claim/10 px-4 py-3 text-sm text-claim flex items-start gap-2.5">
          <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}

      {result && (
        <div
          className={`rounded-2xl border p-5 space-y-3 ${
            result.agreement.passedGate
              ? "border-sealed/30 bg-sealed/5"
              : "border-claim/30 bg-claim/5"
          }`}
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2 font-semibold">
              {result.agreement.passedGate ? (
                <CheckCircle2 className="h-5 w-5 text-sealed" />
              ) : (
                <AlertTriangle className="h-5 w-5 text-claim" />
              )}
              <span>{result.agreement.summaryText}</span>
            </div>
            <Badge variant={result.agreement.passedGate ? "sealed" : "claim"}>
              {result.agreement.passedGate
                ? "Alignment gate passed"
                : "Below gate — re-tap 4 points"}
            </Badge>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
            <div className="rounded-lg bg-surface border border-border p-2.5">
              <div className="text-muted-foreground">Median surface gap</div>
              <div className="text-sm font-semibold mt-0.5">
                {(result.agreement.medianGapMeters * 100).toFixed(2)} cm
              </div>
            </div>
            <div className="rounded-lg bg-surface border border-border p-2.5">
              <div className="text-muted-foreground">Within 5 cm</div>
              <div className="text-sm font-semibold mt-0.5">
                {Math.round(result.agreement.shareWithin5cm * 100)}% ({result.agreement.sampledCount.toLocaleString()} pts)
              </div>
            </div>
            <div className="rounded-lg bg-surface border border-border p-2.5">
              <div className="text-muted-foreground">Solved scale</div>
              <div className="text-sm font-semibold mt-0.5">
                {result.umeyama.scale.toFixed(4)}×
              </div>
            </div>
            <div className="rounded-lg bg-surface border border-border p-2.5">
              <div className="text-muted-foreground">Floor tilt</div>
              <div className="text-sm font-semibold mt-0.5">
                {result.umeyama.floorTiltDeg.toFixed(2)}°
              </div>
            </div>
          </div>

          {result.umeyama.warnings.length > 0 && (
            <ul className="space-y-1 text-xs text-suggestion">
              {result.umeyama.warnings.map((w) => (
                <li key={w} className="flex items-start gap-1.5">
                  <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                  <span>{w}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
