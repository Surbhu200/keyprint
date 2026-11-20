"use client";

import { useState } from "react";
import Link from "next/link";
import {
  ArrowRight,
  CheckCircle2,
  Download,
  Info,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import { AppNav } from "@/components/AppNav";
import { TimeSliderScene } from "@/components/three/TimeSliderScene";
import type { SpatialPinItem } from "@/components/three/PinMarker";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  REFERENCE_ALIGNMENT,
  REFERENCE_MOVE_IN_URL,
  REFERENCE_MOVE_OUT_URL,
  REFERENCE_SPOTS,
  REFERENCE_TAMPERED_URL,
  REFERENCE_VERIFIED_LEASE_ID,
  REFERENCE_VERIFIED_MOVE_IN_RECORD_ID,
} from "@/lib/sample/reference";
import { cn } from "@/lib/utils";

const SAMPLE_PINS: SpatialPinItem[] = [
  {
    id: "desk-scratch",
    position: REFERENCE_SPOTS.deskScratch.position,
    normal: REFERENCE_SPOTS.deskScratch.normal,
    label: "Desk scratch (co-signed move-in)",
    variant: "sealed",
  },
  {
    id: "carpet-stain",
    position: REFERENCE_SPOTS.carpetStain.position,
    normal: REFERENCE_SPOTS.carpetStain.normal,
    label: "Carpet stain",
    priceTag: "$40",
    variant: "claim",
  },
  {
    id: "wall-scuffs",
    position: REFERENCE_SPOTS.wallScuffs.position,
    normal: REFERENCE_SPOTS.wallScuffs.normal,
    label: "Wall scuffs (wear suggestion)",
    variant: "ai",
  },
];

export default function SampleApartmentPage() {
  const [flyTo, setFlyTo] = useState<{
    position: [number, number, number];
    normal?: [number, number, number];
    nonce: number;
  } | null>(null);

  const focusSpot = (
    position: [number, number, number],
    normal: [number, number, number],
  ) => {
    setFlyTo({ position, normal, nonce: Date.now() });
  };

  return (
    <div className="min-h-screen flex flex-col">
      <AppNav />

      <main className="flex-1 mx-auto w-full max-w-6xl px-5 py-8 space-y-6">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-2xl space-y-3">
            <Badge variant="sealed">
              <ShieldCheck className="h-3.5 w-3.5" />
              Illustrative sample · not a live lease
            </Badge>
            <h1 className="text-3xl sm:text-4xl font-semibold tracking-tight text-balance">
              Sample: how a $200 deposit gets settled without court
            </h1>
            <p className="text-base text-muted-foreground">
              Drag the slider across the room to compare move-in and move-out on
              the exact same wall. Tap any pin or claim to fly the camera there.
            </p>
            <p className="flex items-start gap-2 text-sm text-muted-foreground">
              <Info className="mt-0.5 h-4 w-4 shrink-0" />
              <span>
                Public research scan of a real apartment (Meta&apos;s Replica
                dataset). The move-out copy has a staged stain, and the claims
                below are an example.
              </span>
            </p>
          </div>

          <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap lg:justify-end">
            <Link
              href="/unit/new"
              className={cn(
                buttonVariants({ variant: "default" }),
                "w-full sm:w-auto",
              )}
            >
              Try solo seal yourself
              <ArrowRight className="h-4 w-4" />
            </Link>
            <Link
              href={`/verify?recordId=${REFERENCE_VERIFIED_MOVE_IN_RECORD_ID}`}
              className={cn(
                buttonVariants({ variant: "secondary" }),
                "w-full sm:w-auto",
              )}
            >
              Verify live proof
            </Link>
            <Link
              href={`/lease/${REFERENCE_VERIFIED_LEASE_ID}/settle`}
              className={cn(
                buttonVariants({ variant: "outline" }),
                "w-full sm:w-auto",
              )}
            >
              Real $2 test lease on Arc (scripted)
            </Link>
          </div>
        </div>

        {/* Hero Time Slider over real Umeyama-aligned move-in & move-out GLBs.
            Phones get a 360px canvas (the child selector beats h-[500px]) so the
            page still has room to scroll past it. */}
        <div className="max-sm:[&>div]:h-[360px]">
          <TimeSliderScene
            moveInUrl={REFERENCE_MOVE_IN_URL}
            moveOutUrl={REFERENCE_MOVE_OUT_URL}
            alignmentMatrix={REFERENCE_ALIGNMENT.matrix4ColumnMajor}
            moveInLabel="Move-in"
            moveOutLabel="Move-out"
            pins={SAMPLE_PINS}
            flyTo={flyTo}
            onPinSelect={(p) =>
              setFlyTo({
                position: p.position,
                normal: p.normal,
                nonce: Date.now(),
              })
            }
            heightClassName="h-[500px]"
          />
        </div>

        <div className="grid gap-6 lg:grid-cols-3">
          {/* Claims & Disproved Scratch Story */}
          <Card className="lg:col-span-2">
            <CardHeader>
              <CardTitle className="text-base">
                Every dollar claimed pinned to the 3D record
              </CardTitle>
              <CardDescription>
                Example: two landlord claims against a $200 deposit. One is fair; the other is disproved by the landlord&apos;s own move-in co-sign.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {/* Fair $40 stain claim */}
              <div className="rounded-xl border border-border bg-surface p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-semibold text-sm">
                      Dark stain on carpet
                    </span>
                    <Badge variant="claim">$40 claimed</Badge>
                    <Badge variant="sealed">Approved by renter</Badge>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    AI suggested possible damage; no move-in pin existed at this spot.
                  </p>
                </div>
                <Button
                  size="sm"
                  variant="secondary"
                  className="h-11 w-full px-4 text-sm sm:h-9 sm:w-auto sm:px-3.5 sm:text-xs"
                  onClick={() =>
                    focusSpot(
                      REFERENCE_SPOTS.carpetStain.position,
                      REFERENCE_SPOTS.carpetStain.normal,
                    )
                  }
                >
                  Fly to stain
                </Button>
              </div>

              {/* Disproved $120 desk scratch claim */}
              <div className="rounded-xl border border-sealed/35 bg-sealed/5 p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="space-y-1.5">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-semibold text-sm">Desk scratch</span>
                    <Badge variant="default" className="line-through">
                      $120 claimed
                    </Badge>
                    <Badge variant="sealed">Withdrawn ($0)</Badge>
                  </div>
                  <div className="inline-flex items-center gap-1.5 text-sm font-medium text-sealed">
                    <ShieldCheck className="h-4 w-4 shrink-0" />
                    <span>
                      Matched move-in pin (&ldquo;Scratch on desk, already here&rdquo;), co-signed by the landlord.
                    </span>
                  </div>
                </div>
                <Button
                  size="sm"
                  variant="secondary"
                  className="h-11 w-full px-4 text-sm sm:h-9 sm:w-auto sm:px-3.5 sm:text-xs"
                  onClick={() =>
                    focusSpot(
                      REFERENCE_SPOTS.deskScratch.position,
                      REFERENCE_SPOTS.deskScratch.normal,
                    )
                  }
                >
                  Fly to scratch
                </Button>
              </div>

              {/* AI Wear suggestion (never priced) */}
              <div className="rounded-xl border border-border bg-muted/35 p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant="suggestion">
                      <Sparkles className="h-3 w-3" />
                      AI suggestion
                    </Badge>
                    <span className="font-semibold text-sm">
                      Shin-height scuffs on left wall
                    </span>
                    <Badge variant="default">Possibly normal wear</Badge>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    AI never prices items; people decide what is chargeable.
                  </p>
                </div>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-11 w-full px-4 text-sm sm:h-9 sm:w-auto sm:px-3.5 sm:text-xs"
                  onClick={() =>
                    focusSpot(
                      REFERENCE_SPOTS.wallScuffs.position,
                      REFERENCE_SPOTS.wallScuffs.normal,
                    )
                  }
                >
                  Fly to wall
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Settled Split + Sample Verify Downloads */}
          <div className="space-y-4">
            <Card className="border-sealed/25">
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-sealed" />
                  Example settlement split
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="rounded-xl bg-sealed/5 border border-sealed/20 p-4">
                  <div className="text-xs font-semibold uppercase tracking-wider text-sealed">
                    Returned to renter
                  </div>
                  <div className="text-3xl font-semibold mt-1">$160</div>
                </div>
                <div className="rounded-xl bg-muted/40 border border-border p-4">
                  <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Paid to landlord
                  </div>
                  <div className="text-2xl font-semibold mt-1">$40</div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Test Verify yourself</CardTitle>
                <CardDescription>
                  Download both files and drop them into Verify: the original passes, the copy with one byte changed fails.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-2.5">
                <a
                  href={REFERENCE_MOVE_IN_URL}
                  download="apartment-move-in.glb"
                  className={cn(
                    buttonVariants({ variant: "secondary", size: "default" }),
                    "w-full justify-start h-auto min-h-11 whitespace-normal text-left",
                  )}
                >
                  <Download className="h-3.5 w-3.5" />
                  {/* Wraps instead of overflowing in the narrow column (375px phones, 1280-1400px laptops) */}
                  <span>
                    Original move-in scan{" "}
                    <span className="whitespace-nowrap">(.glb, 16 MB)</span>
                  </span>
                </a>
                <a
                  href={REFERENCE_TAMPERED_URL}
                  download="apartment-move-in-tampered.glb"
                  className={cn(
                    buttonVariants({ variant: "outline", size: "default" }),
                    "w-full justify-start h-auto min-h-11 whitespace-normal text-left",
                  )}
                >
                  <Download className="h-3.5 w-3.5" />
                  <span>
                    1-byte-changed copy{" "}
                    <span className="whitespace-nowrap">(.glb, 16 MB)</span>
                  </span>
                </a>
                <Link
                  href={`/verify?recordId=${REFERENCE_VERIFIED_MOVE_IN_RECORD_ID}`}
                  className={cn(
                    buttonVariants({ variant: "default", size: "default" }),
                    "w-full mt-1 h-auto min-h-11 whitespace-normal text-center text-balance",
                  )}
                >
                  Verify the sealed sample scan
                </Link>
              </CardContent>
            </Card>
          </div>
        </div>
      </main>
    </div>
  );
}
