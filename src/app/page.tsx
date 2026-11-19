"use client";

import Link from "next/link";
import {
  ArrowRight,
  CheckCircle2,
  Fingerprint,
  ScanLine,
  ShieldCheck,
} from "lucide-react";
import { TimeSliderScene } from "@/components/three/TimeSliderScene";
import type { SpatialPinItem } from "@/components/three/PinMarker";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  REFERENCE_ALIGNMENT,
  REFERENCE_MOVE_IN_URL,
  REFERENCE_MOVE_OUT_URL,
  REFERENCE_SPOTS,
} from "@/lib/sample/reference";
import { cn } from "@/lib/utils";

const COMPARISON_ROWS = [
  {
    question: "Deposit",
    today: "Held by landlord",
    keyprint: "Protected escrow neither side controls",
  },
  {
    question: "Evidence",
    today: "Landlord's phone",
    keyprint: "3D record sealed by the renter, co-signed by the landlord",
  },
  {
    question: "Burden of proof",
    today: "Renter sues to get it back",
    keyprint: "Every dollar claimed needs a pin and a price",
  },
  {
    question: "No claim by deadline",
    today: "Landlord keeps it",
    keyprint: "Full deposit goes back to the renter",
  },
] as const;

const PREVIEW_PINS: SpatialPinItem[] = [
  {
    id: "scratch",
    position: REFERENCE_SPOTS.deskScratch.position,
    normal: REFERENCE_SPOTS.deskScratch.normal,
    label: "Pre-existing scratch · Co-signed",
    variant: "sealed",
  },
  {
    id: "stain",
    position: REFERENCE_SPOTS.carpetStain.position,
    normal: REFERENCE_SPOTS.carpetStain.normal,
    label: "Carpet stain",
    priceTag: "$40",
    variant: "claim",
  },
];

export default function AppLaunchPage() {
  return (
    <main className="flex-1 p-5 sm:p-8 max-w-7xl w-full mx-auto space-y-6">
      {/* Split App Workspace: Actions on left, Live 3D Apartment Scene on right */}
      <div className="grid gap-6 xl:grid-cols-12 items-stretch">
        <div className="xl:col-span-5 flex flex-col justify-between gap-5">
          <div className="space-y-4">
            <div className="inline-flex items-center gap-2 rounded-full border border-sealed/25 bg-sealed/10 px-3 py-1 text-xs font-semibold text-sealed">
              <CheckCircle2 className="h-3.5 w-3.5" />
              <span>Every dollar claimed needs a pin and a price</span>
            </div>

            <h1 className="text-3xl sm:text-4xl font-semibold tracking-tight text-foreground leading-[1.1]">
              Your apartment. Its history. Your proof.
            </h1>

            <p className="text-sm sm:text-base text-muted-foreground leading-relaxed">
              Your deposit sits in protected escrow, every deduction must be
              pinned to a spot in your apartment&apos;s 3D record, and if your
              landlord doesn&apos;t claim in time, it comes back to you.
            </p>

            <div className="flex flex-wrap gap-2.5 pt-1">
              <Link
                href="/start"
                className={cn(buttonVariants({ variant: "default", size: "lg" }))}
              >
                <Fingerprint className="h-4 w-4" />
                Protect my deposit
              </Link>
              <Link
                href="/unit/new"
                className={cn(buttonVariants({ variant: "secondary", size: "lg" }))}
              >
                <ScanLine className="h-4 w-4" />
                Solo scan
              </Link>
            </div>
          </div>

          <Card>
            <CardContent className="p-0 overflow-hidden">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="border-b border-border bg-muted/60 font-semibold uppercase tracking-wider text-muted-foreground">
                    <th className="py-2.5 px-3.5">Rule</th>
                    <th className="py-2.5 px-3.5">Today</th>
                    <th className="py-2.5 px-3.5 text-foreground">Keyprint</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {COMPARISON_ROWS.map((row) => (
                    <tr key={row.question}>
                      <td className="py-2.5 px-3.5 font-medium text-foreground">
                        {row.question}
                      </td>
                      <td className="py-2.5 px-3.5 text-muted-foreground">
                        {row.today}
                      </td>
                      <td className="py-2.5 px-3.5 font-medium text-foreground">
                        {row.keyprint}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </CardContent>
          </Card>
        </div>

        {/* Sample 3D apartment preview (public research scan until real scans replace it) */}
        <div className="xl:col-span-7 flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-xs font-semibold text-foreground">
              <ShieldCheck className="h-4 w-4 text-sealed" />
              <span>Sample 3D apartment · drag the slider to compare move-in and move-out</span>
            </div>
            <Link
              href="/sample"
              className="inline-flex items-center gap-1 text-xs font-semibold text-accent hover:underline"
            >
              See the sample apartment
              <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </div>

          <TimeSliderScene
            moveInUrl={REFERENCE_MOVE_IN_URL}
            moveOutUrl={REFERENCE_MOVE_OUT_URL}
            alignmentMatrix={REFERENCE_ALIGNMENT.matrix4ColumnMajor}
            moveInLabel="Move-in"
            moveOutLabel="Move-out"
            pins={PREVIEW_PINS}
            heightClassName="h-[460px] xl:h-full xl:min-h-[500px]"
          />
        </div>
      </div>
    </main>
  );
}
