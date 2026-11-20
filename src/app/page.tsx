"use client";

import Link from "next/link";
import {
  ArrowRight,
  Box,
  CheckCircle2,
  CircleDollarSign,
  Columns2,
  ExternalLink,
  Fingerprint,
  GripVertical,
  MapPin,
  ScanLine,
  ShieldCheck,
} from "lucide-react";
import { TimeSliderScene } from "@/components/three/TimeSliderScene";
import type { SpatialPinItem } from "@/components/three/PinMarker";
import { buttonVariants } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
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

// Zillow Consumer Housing Trends Report 2024 (renters). Use no other figures here.
const PROBLEM_STATS = [
  { value: "$750", label: "typical security deposit" },
  {
    value: "24%",
    label: "of renters who moved out got none of their deposit back",
  },
  {
    value: "19%",
    label: "disagreed with their landlord over damage or repairs",
  },
] as const;

const ZILLOW_CHTR_2024_URL =
  "https://www.zillow.com/research/renters-housing-trends-report-2024/";

const HOW_IT_WORKS = [
  {
    icon: ScanLine,
    step: "Move-in",
    title: "Seal what’s already there",
    body: "Import a 3D scan from your phone, pin the damage that’s already there, and seal it with one Face ID touch. The same touch puts your deposit in an escrow neither side controls.",
  },
  {
    icon: Columns2,
    step: "Move-out",
    title: "Compare the same wall",
    body: "Tap 4 matching corners and Keyprint fine-tunes the line-up. Drag one slider to see move-in and move-out on the same wall. AI suggests what changed; it never prices anything.",
  },
  {
    icon: CircleDollarSign,
    step: "Settle",
    title: "Every dollar needs a pin and a price",
    body: "Your landlord can only claim what they pin to a spot and price, and you approve or dispute each line. No claim by the deadline? Your full deposit comes back automatically.",
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
    <main className="flex-1 w-full max-w-7xl mx-auto px-5 sm:px-8 pt-6 sm:pt-10 pb-12 space-y-16 sm:space-y-24">
      {/* Hero: pitch on the left, sample 3D apartment on the right */}
      <div className="grid gap-8 xl:grid-cols-12 items-stretch">
        <div className="xl:col-span-5 flex flex-col justify-center gap-6 motion-safe:animate-rise">
          <span className="inline-flex w-fit items-center gap-2 rounded-full border border-accent/20 bg-accent/10 px-3 py-1 text-xs font-semibold text-accent">
            <ShieldCheck className="h-3.5 w-3.5" />
            3D move-in record + protected deposit
          </span>

          <h1 className="text-4xl sm:text-5xl 2xl:text-6xl font-semibold tracking-tight leading-[1.04] text-foreground">
            Your apartment.
            <br />
            Its history.
            <br />
            <span className="text-accent">Your proof.</span>
          </h1>

          <p className="max-w-xl text-base sm:text-lg leading-relaxed text-muted-foreground text-pretty">
            One Face ID touch seals a 3D record of your place and puts your
            deposit in an escrow neither side controls. Your landlord can only
            keep what they pin to a spot in the room and price. No claim by the
            deadline? It all comes back to you.
          </p>

          {/* sm:flex-wrap: the two buttons need ~487px, wider than the ~374-480px xl column */}
          <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap">
            <Link
              href="/start"
              className={cn(
                buttonVariants({ variant: "default", size: "lg" }),
                "w-full sm:w-auto",
              )}
            >
              <Fingerprint className="h-4 w-4" />
              Protect my deposit
            </Link>
            <Link
              href="/sample"
              className={cn(
                buttonVariants({ variant: "secondary", size: "lg" }),
                "w-full sm:w-auto",
              )}
            >
              See a sample apartment
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>

          <div className="flex flex-col gap-1 text-sm sm:flex-row sm:flex-wrap sm:items-center sm:gap-x-6">
            <span className="inline-flex items-center gap-1.5 text-muted-foreground">
              <Fingerprint className="h-4 w-4 text-accent" />
              Face ID, Windows Hello or fingerprint · no app to install
            </span>
            <Link
              href="/verify"
              className="inline-flex min-h-11 items-center gap-1.5 font-medium text-accent hover:underline"
            >
              <ShieldCheck className="h-4 w-4" />
              Don&apos;t trust us? Verify a sealed file
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </div>

        {/* Sample 3D apartment preview (public research scan until real scans replace it) */}
        <div className="xl:col-span-7 flex flex-col gap-3">
          <div className="flex items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2 text-sm font-medium text-foreground">
              <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-muted px-2.5 py-0.5 text-xs font-semibold">
                <Box className="h-3.5 w-3.5" />
                Illustrative sample
              </span>
              <span>
                Same room, move-in vs. move-out
                <span className="hidden md:inline"> · drag the handle to compare</span>
              </span>
            </div>
            <Link
              href="/sample"
              className="hidden md:inline-flex shrink-0 items-center gap-1 text-sm font-semibold text-accent hover:underline"
            >
              Explore the full sample
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>

          {/* From 768px up: the live viewer. Below that it is display:none, so the
              canvas never sizes up and the two ~16 MB scans are never fetched. */}
          <div className="max-md:hidden md:contents">
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

          {/* Phones: a lightweight poster; the whole card opens the full sample. */}
          <Link
            href="/sample"
            aria-label="Open the interactive 3D sample apartment"
            className="relative block h-[340px] overflow-hidden rounded-2xl border border-border bg-[#ebe6de] md:hidden"
          >
            <div aria-hidden="true" className="absolute inset-0">
              <div className="absolute inset-y-0 left-0 w-1/2 bg-linear-to-br from-[#f4efe7] to-[#e2d9cb]" />
              <div className="absolute inset-y-0 right-0 w-1/2 bg-linear-to-bl from-[#eee7dc] to-[#d8cdbd]" />
              <div className="absolute inset-x-0 bottom-0 h-[42%] bg-[#cfc3b2]/55" />
              <div className="absolute inset-y-0 left-1/2 w-0.5 -translate-x-1/2 bg-white shadow-[0_0_8px_rgba(0,0,0,0.35)]" />
              <div className="absolute left-1/2 top-[34%] flex h-11 w-11 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border-2 border-foreground/80 bg-surface shadow-lg">
                <GripVertical className="h-4 w-4" />
              </div>
              <span className="absolute left-3 top-3 rounded-full border border-border bg-surface/90 px-3 py-1 text-xs font-semibold">
                Move-in
              </span>
              <span className="absolute right-3 top-3 rounded-full border border-border bg-surface/90 px-3 py-1 text-xs font-semibold">
                Move-out
              </span>
              <span className="absolute left-[7%] top-[50%] inline-flex items-center gap-1 rounded-full bg-sealed px-2.5 py-1 text-xs font-semibold text-white shadow-sm">
                <ShieldCheck className="h-3 w-3" />
                Co-signed
              </span>
              <span className="absolute right-[7%] top-[58%] inline-flex items-center gap-1 rounded-full bg-claim px-2.5 py-1 text-xs font-semibold text-white shadow-sm">
                <MapPin className="h-3 w-3" />
                $40 stain
              </span>
            </div>
            <div className="absolute inset-x-3 bottom-3 space-y-2 rounded-xl border border-border bg-surface/95 p-3 shadow-sm">
              <span className={cn(buttonVariants(), "w-full")}>
                <Box className="h-4 w-4" />
                Open the 3D sample
              </span>
              <p className="text-center text-xs text-muted-foreground">
                Two 3D scans, about 32 MB. Best on Wi-Fi.
              </p>
            </div>
          </Link>

          <p className="text-sm text-muted-foreground">
            Public research scan of a real apartment (Meta&apos;s Replica
            dataset). The move-out copy has a staged stain, and the pins are an
            example.
          </p>
        </div>
      </div>

      {/* The problem, sourced from Zillow's 2024 renters report */}
      <section aria-labelledby="problem-title" className="space-y-6">
        <div className="max-w-3xl space-y-2">
          <p className="text-xs font-semibold uppercase tracking-wider text-accent">
            The problem
          </p>
          <h2
            id="problem-title"
            className="text-2xl sm:text-4xl font-semibold tracking-tight text-balance"
          >
            Only 40% of renters who moved out got their whole deposit back.
          </h2>
        </div>

        <dl className="grid gap-3 sm:grid-cols-3">
          {PROBLEM_STATS.map(({ value, label }) => (
            <div
              key={value}
              className="flex items-center gap-4 rounded-2xl border border-border bg-surface p-4 shadow-xs sm:flex-col sm:items-start sm:gap-1 sm:p-5"
            >
              <dt className="text-sm leading-snug text-muted-foreground">
                {label}
              </dt>
              <dd className="order-first w-20 shrink-0 text-3xl font-semibold tracking-tight tabular-nums text-foreground sm:w-auto sm:text-4xl">
                {value}
              </dd>
            </div>
          ))}
        </dl>

        <a
          href={ZILLOW_CHTR_2024_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex min-h-11 items-center gap-1.5 text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
        >
          Source: Zillow Consumer Housing Trends Report 2024
          <ExternalLink className="h-3.5 w-3.5" />
        </a>
      </section>

      {/* Today vs Keyprint */}
      <section aria-labelledby="flip-title" className="space-y-6">
        <div className="max-w-3xl space-y-2">
          <p className="text-xs font-semibold uppercase tracking-wider text-accent">
            The flip
          </p>
          <h2
            id="flip-title"
            className="text-2xl sm:text-4xl font-semibold tracking-tight text-balance"
          >
            Today your landlord holds the money and the photos. Keyprint flips
            that.
          </h2>
        </div>

        <Card className="overflow-hidden">
          <div
            aria-hidden="true"
            className="hidden sm:grid sm:grid-cols-[9rem_1fr_1.4fr] gap-6 border-b border-border bg-muted/60 px-6 py-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground"
          >
            <span>Rule</span>
            <span>Today</span>
            <span className="text-foreground">With Keyprint</span>
          </div>
          <ul className="divide-y divide-border">
            {COMPARISON_ROWS.map((row) => (
              <li
                key={row.question}
                className="grid gap-1.5 px-5 py-4 sm:grid-cols-[9rem_1fr_1.4fr] sm:gap-6 sm:px-6"
              >
                <span className="text-sm font-semibold text-foreground">
                  {row.question}
                </span>
                <span className="text-sm text-muted-foreground">
                  <span className="font-medium sm:sr-only">Today: </span>
                  {row.today}
                </span>
                <span className="flex items-start gap-2 text-sm font-medium text-foreground">
                  <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-accent" />
                  <span>
                    <span className="sr-only">With Keyprint: </span>
                    {row.keyprint}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        </Card>
      </section>

      {/* How it works */}
      <section
        id="how-it-works"
        aria-labelledby="how-title"
        className="scroll-mt-20 space-y-6"
      >
        <div className="max-w-3xl space-y-2">
          <p className="text-xs font-semibold uppercase tracking-wider text-accent">
            How it works
          </p>
          <h2
            id="how-title"
            className="text-2xl sm:text-4xl font-semibold tracking-tight text-balance"
          >
            Three moments. One record nobody can quietly edit.
          </h2>
        </div>

        <ol className="grid gap-4 md:grid-cols-3">
          {HOW_IT_WORKS.map(({ icon: Icon, step, title, body }, i) => (
            <li
              key={step}
              className="flex flex-col gap-3 rounded-2xl border border-border bg-surface p-5 sm:p-6 shadow-xs"
            >
              <div className="flex items-center gap-3">
                <span className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-accent/10 text-accent">
                  <Icon className="h-5 w-5" />
                </span>
                <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Step {i + 1} · {step}
                </span>
              </div>
              <h3 className="text-lg font-semibold tracking-tight">{title}</h3>
              <p className="text-sm sm:text-base leading-relaxed text-muted-foreground">
                {body}
              </p>
            </li>
          ))}
        </ol>

        <p className="flex items-start gap-2 rounded-2xl border border-sealed/25 bg-sealed/5 p-4 text-sm text-foreground">
          <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-sealed" />
          <span>
            Under the hood: every file&apos;s fingerprint is sealed on Arc, and
            the deposit sits in USDC in a contract with no admin key. Not even
            Keyprint can take it. This demo runs on Arc Testnet with test USDC,
            so no real money moves.
          </span>
        </p>
      </section>
    </main>
  );
}
