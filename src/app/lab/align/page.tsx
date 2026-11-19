"use client";

import { useState } from "react";
import { Upload } from "lucide-react";
import { AppNav } from "@/components/AppNav";
import {
  AlignmentTool,
  type AlignmentOutput,
} from "@/components/three/AlignmentTool";
import { TimeSliderScene } from "@/components/three/TimeSliderScene";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  REFERENCE_MOVE_IN_LANDMARKS,
  REFERENCE_MOVE_IN_URL,
  REFERENCE_MOVE_OUT_LANDMARKS,
  REFERENCE_MOVE_OUT_URL,
} from "@/lib/sample/reference";

export default function AlignLabPage() {
  const [moveInUrl, setMoveInUrl] = useState(REFERENCE_MOVE_IN_URL);
  const [moveOutUrl, setMoveOutUrl] = useState(REFERENCE_MOVE_OUT_URL);
  const [usingReference, setUsingReference] = useState(true);
  const [alignment, setAlignment] = useState<AlignmentOutput | null>(null);

  const handleLocalFile = (slot: "in" | "out", file: File) => {
    const objectUrl = URL.createObjectURL(file);
    setUsingReference(false);
    setAlignment(null);
    if (slot === "in") setMoveInUrl(objectUrl);
    else setMoveOutUrl(objectUrl);
  };

  return (
    <div className="min-h-screen flex flex-col">
      <AppNav />
      <main className="mx-auto w-full max-w-6xl px-5 py-8 space-y-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="space-y-1">
            <Badge variant="accent">Alignment Lab · Checkpoint 4</Badge>
            <h1 className="text-2xl font-semibold tracking-tight">
              4-Point Umeyama Alignment &amp; Surface Agreement Gate
            </h1>
            <p className="text-sm text-muted-foreground">
              Load any two `.glb` scans (or use the built-in metric reference apartment scans), tap 4 matching points on at least two walls, solve the similarity transform (`ml-matrix`), and measure surface agreement with `three-mesh-bvh`.
            </p>
          </div>
          {!usingReference && (
            <Button
              variant="secondary"
              size="sm"
              onClick={() => {
                setMoveInUrl(REFERENCE_MOVE_IN_URL);
                setMoveOutUrl(REFERENCE_MOVE_OUT_URL);
                setUsingReference(true);
                setAlignment(null);
              }}
            >
              Load reference apartment scans
            </Button>
          )}
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Upload className="h-4 w-4 text-accent" />
              Scan Inputs
            </CardTitle>
            <CardDescription>
              Currently loaded:{" "}
              {usingReference
                ? "Built-in metric reference apartment scans (move-out has a 14° yaw + translation + 0.4% scale offset)"
                : "Custom uploaded .glb scans"}
            </CardDescription>
          </CardHeader>
          <CardContent className="grid sm:grid-cols-2 gap-4">
            <label className="block space-y-1.5 text-xs font-medium">
              <span>Move-in `.glb`</span>
              <input
                type="file"
                accept=".glb,model/gltf-binary"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) handleLocalFile("in", f);
                }}
                className="block w-full text-xs file:mr-3 file:rounded-md file:border-0 file:bg-muted file:px-3 file:py-1.5 file:font-medium cursor-pointer"
              />
            </label>
            <label className="block space-y-1.5 text-xs font-medium">
              <span>Move-out `.glb`</span>
              <input
                type="file"
                accept=".glb,model/gltf-binary"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) handleLocalFile("out", f);
                }}
                className="block w-full text-xs file:mr-3 file:rounded-md file:border-0 file:bg-muted file:px-3 file:py-1.5 file:font-medium cursor-pointer"
              />
            </label>
          </CardContent>
        </Card>

        <AlignmentTool
          moveInUrl={moveInUrl}
          moveOutUrl={moveOutUrl}
          onAligned={setAlignment}
          presetLandmarks={
            usingReference
              ? {
                  moveIn: REFERENCE_MOVE_IN_LANDMARKS,
                  moveOut: REFERENCE_MOVE_OUT_LANDMARKS,
                }
              : undefined
          }
        />

        {alignment && (
          <div className="space-y-3">
            <h2 className="text-lg font-semibold tracking-tight">
              Aligned Time Slider Preview (Scissor Split)
            </h2>
            <TimeSliderScene
              moveInUrl={moveInUrl}
              moveOutUrl={moveOutUrl}
              alignmentMatrix={alignment.umeyama.matrix4ColumnMajor}
              moveInLabel="Move-in"
              moveOutLabel="Move-out (aligned)"
            />
          </div>
        )}
      </main>
    </div>
  );
}
