"use client";

import Link from "next/link";
import { MotionConfig } from "framer-motion";
import {
  Box,
  Check,
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
import { HeroPhone } from "@/components/landing/HeroPhone";
import { LandingTopBar } from "@/components/landing/LandingTopBar";
import { Reveal } from "@/components/landing/Reveal";
import { RevealHeadline } from "@/components/landing/RevealHeadline";
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

const HEADLINE = ["Your apartment.", "Its history.", "Your proof."] as const;

const CONTAINER = "mx-auto w-full max-w-[1200px] px-4 sm:px-8";
const SECTION_PAD = "py-20 sm:py-28";
const H2 =
  "font-display font-semibold text-[clamp(1.875rem,5vw,3.5rem)] leading-[1.04] tracking-[-0.03em] text-balance";

/** Blueprint grid + one survey-blue light. Used on the ink hero and closing. */
function BlueprintBackdrop({ lightAt }: { lightAt: "phone" | "bottom" }) {
  return (
    <>
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 -z-10 bg-[linear-gradient(rgba(255,255,255,0.055)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.055)_1px,transparent_1px)] bg-[size:40px_40px] [mask-image:radial-gradient(ellipse_70%_60%_at_50%_35%,black_30%,transparent_75%)]"
      />
      <div
        aria-hidden="true"
        className={cn(
          "pointer-events-none absolute inset-0 -z-10",
          lightAt === "phone"
            ? "bg-[radial-gradient(45%_45%_at_75%_55%,rgba(47,107,255,0.28),transparent_70%)] max-lg:bg-[radial-gradient(70%_40%_at_50%_85%,rgba(47,107,255,0.28),transparent_70%)]"
            : "bg-[radial-gradient(60%_60%_at_50%_100%,rgba(47,107,255,0.28),transparent_70%)]",
        )}
      />
    </>
  );
}

/** The two landing CTAs, on ink. Labels are fixed by the demo script. */
function CtaPair({ centered = false }: { centered?: boolean }) {
  return (
    <div
      className={cn(
        "flex flex-col gap-3 sm:flex-row",
        centered && "sm:justify-center",
      )}
    >
      <Link
        href="/start"
        className="inline-flex h-12 items-center justify-center gap-2 rounded-full bg-on-ink px-6 text-[15px] font-semibold text-ink transition-[transform,background-color] duration-100 hover:bg-white active:scale-[0.98] sm:h-[52px]"
      >
        <Fingerprint className="h-[18px] w-[18px]" />
        Protect my deposit
      </Link>
      <Link
        href="/sample"
        className="inline-flex h-12 items-center justify-center gap-2 rounded-full border border-white/15 px-6 text-[15px] font-semibold text-on-ink transition-[transform,background-color] duration-100 hover:bg-white/5 active:scale-[0.98] sm:h-[52px]"
      >
        <Box className="h-[18px] w-[18px] opacity-80" />
        See a sample apartment
      </Link>
    </div>
  );
}

export default function AppLaunchPage() {
  return (
    <MotionConfig reducedMotion="user">
      <div className="min-h-svh overflow-x-clip bg-background text-foreground">
        <LandingTopBar />

        <main>
          {/* Hero (ink) */}
          <section className="relative isolate overflow-hidden bg-ink pb-0 pt-[calc(env(safe-area-inset-top)+6.5rem)] text-on-ink lg:flex lg:min-h-[min(100svh,980px)] lg:items-center lg:pb-24 lg:pt-[calc(env(safe-area-inset-top)+7.5rem)]">
            <BlueprintBackdrop lightAt="phone" />

            <div
              className={cn(
                CONTAINER,
                "grid gap-12 lg:grid-cols-12 lg:items-center",
              )}
            >
              <div className="lg:col-span-7">
                <span className="motion-safe:animate-lift inline-flex h-7 items-center gap-2 rounded-full border border-white/15 bg-white/5 px-3 text-[12px] font-medium text-on-ink/80"
                >
                  <span className="h-1.5 w-1.5 rounded-full bg-sealed-bright motion-safe:animate-pulse" />
                  3D move-in record + protected deposit
                </span>

                <RevealHeadline
                  lines={HEADLINE}
                  className="mt-6 font-display text-[clamp(2.25rem,8.5vw,5.25rem)] lg:text-[clamp(3.5rem,5.4vw,5rem)] font-semibold leading-[0.98] tracking-[-0.035em] text-on-ink"
                />

                <p className="motion-safe:animate-lift motion-safe:[animation-delay:340ms] motion-safe:[animation-duration:600ms] mt-6 max-w-[40ch] text-pretty text-[17px] leading-[1.55] text-on-ink-muted sm:text-[19px]"
                >
                  One Face ID touch seals a 3D record of your place and puts
                  your deposit in an escrow neither side controls. Your landlord
                  can only keep what they pin to a spot in the room and price.
                  No claim by the deadline? It all comes back to you.
                </p>

                <div className="motion-safe:animate-lift motion-safe:[animation-delay:440ms] motion-safe:[animation-duration:600ms] mt-8">
                  <CtaPair />

                  <div className="mt-6 flex flex-col gap-1 text-[13px] text-on-ink-muted sm:flex-row sm:flex-wrap sm:items-center sm:gap-x-6">
                    <span className="inline-flex min-h-11 items-center gap-1.5">
                      <Fingerprint className="h-4 w-4 shrink-0 text-accent-bright" />
                      Face ID, Windows Hello or fingerprint · no app to install
                    </span>
                    <Link
                      href="/verify"
                      className="inline-flex min-h-11 w-fit items-center gap-1.5 font-medium text-accent-bright underline-offset-4 hover:underline"
                    >
                      <ShieldCheck className="h-4 w-4 shrink-0" />
                      Don&apos;t trust us? Verify a sealed file
                    </Link>
                  </div>
                </div>
              </div>

              <div className="motion-safe:animate-lift motion-safe:[animation-delay:260ms] motion-safe:[animation-duration:900ms] flex justify-center max-lg:-mb-28 lg:col-span-5 lg:justify-end"
              >
                <HeroPhone />
              </div>
            </div>
          </section>

          {/* The problem, sourced from Zillow's 2024 renters report */}
          <section
            aria-labelledby="problem-title"
            className={cn("bg-background", SECTION_PAD)}
          >
            <div className={CONTAINER}>
              <Reveal>
                <h2 id="problem-title" className={cn(H2, "max-w-[18ch]")}>
                  Only 40% of renters who moved out got their whole deposit
                  back.
                </h2>
              </Reveal>

              <Reveal>
                <dl className="mt-12 grid border-t border-border sm:grid-cols-3">
                  {PROBLEM_STATS.map(({ value, label }) => (
                    <div
                      key={value}
                      className="flex flex-col border-b border-border py-6 last:border-0 sm:border-b-0 sm:border-r sm:py-10 sm:pr-8 sm:[&:not(:first-child)]:pl-8"
                    >
                      <dt className="mt-3 max-w-[26ch] text-[15px] leading-[1.5] text-muted-foreground">
                        {label}
                      </dt>
                      <dd className="order-first font-display text-[clamp(3rem,8vw,5.5rem)] font-semibold leading-none tracking-[-0.04em] tabular-nums text-foreground">
                        {value}
                      </dd>
                    </div>
                  ))}
                </dl>

                <a
                  href={ZILLOW_CHTR_2024_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-6 inline-flex min-h-11 items-center gap-1.5 text-[13px] text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
                >
                  Source: Zillow Consumer Housing Trends Report 2024
                  <ExternalLink className="h-3.5 w-3.5" />
                </a>
              </Reveal>
            </div>
          </section>

          {/* Today vs Keyprint */}
          <section
            aria-labelledby="flip-title"
            className={cn("bg-surface", SECTION_PAD)}
          >
            <div className={CONTAINER}>
              <Reveal>
                <h2 id="flip-title" className={cn(H2, "max-w-[22ch]")}>
                  Today your landlord holds the money and the photos. Keyprint
                  flips that.
                </h2>
              </Reveal>

              <Reveal className="mt-10">
                <div
                  aria-hidden="true"
                  className="hidden pb-3 text-[13px] font-medium text-muted-foreground sm:grid sm:grid-cols-[10rem_1fr_1.3fr] sm:gap-8"
                >
                  <span />
                  <span>Today</span>
                  <span className="text-foreground">With Keyprint</span>
                </div>
                <ul className="divide-y divide-border border-y border-border">
                  {COMPARISON_ROWS.map((row) => (
                    <li
                      key={row.question}
                      className="grid gap-2 py-5 sm:grid-cols-[10rem_1fr_1.3fr] sm:gap-8 sm:py-6"
                    >
                      <span className="pt-1 text-[13px] font-semibold text-foreground">
                        {row.question}
                      </span>
                      <span className="text-[15px] leading-[1.5] text-muted-foreground sm:pt-0.5">
                        <span className="font-medium sm:sr-only">Today: </span>
                        {row.today}
                      </span>
                      <span className="flex items-start gap-2.5 text-[17px] font-medium leading-[1.4] text-foreground">
                        <span className="mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-sealed/10 text-sealed">
                          <Check className="h-3 w-3" strokeWidth={3} />
                        </span>
                        <span>
                          <span className="sr-only">With Keyprint: </span>
                          {row.keyprint}
                        </span>
                      </span>
                    </li>
                  ))}
                </ul>
              </Reveal>
            </div>
          </section>

          {/* Sample stage (ink) */}
          <section
            aria-labelledby="sample-title"
            className={cn("bg-ink text-on-ink", SECTION_PAD)}
          >
            <div className={CONTAINER}>
              <Reveal className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
                <div className="flex flex-col items-start gap-4">
                  <span className="inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-white/5 px-2.5 py-0.5 text-xs font-semibold text-on-ink/85">
                    <Box className="h-3.5 w-3.5" />
                    Illustrative sample
                  </span>
                  <h2 id="sample-title" className={cn(H2, "max-w-[20ch]")}>
                    Same room,{" "}
                    <span className="whitespace-nowrap">move-in</span> vs.{" "}
                    <span className="whitespace-nowrap">move-out</span>
                  </h2>
                  <p className="hidden text-[15px] text-on-ink-muted md:block">
                    Drag the handle to compare.
                  </p>
                </div>
                <Link
                  href="/sample"
                  className="hidden min-h-11 shrink-0 items-center text-[15px] font-semibold text-accent-bright underline-offset-4 hover:underline md:inline-flex"
                >
                  Explore the full sample
                </Link>
              </Reveal>

              <Reveal className="mt-10 flex flex-col gap-4">
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
                    heightClassName="h-[520px] lg:h-[600px]"
                  />
                </div>

                {/* Phones: a lightweight poster; the whole card opens the full sample. */}
                <Link
                  href="/sample"
                  aria-label="Open the interactive 3D sample apartment"
                  className="relative block h-[360px] overflow-hidden rounded-[24px] border border-white/10 bg-stage md:hidden"
                >
                  <div aria-hidden="true" className="absolute inset-0">
                    <div className="absolute inset-y-0 left-0 w-1/2 bg-linear-to-br from-[#1d2b45] to-[#0e182c]" />
                    <div className="absolute inset-y-0 right-0 w-1/2 bg-linear-to-bl from-[#192741] to-[#0b1426]" />
                    <div className="absolute inset-x-0 bottom-0 h-[42%] bg-white/5" />
                    <div className="absolute inset-y-0 left-1/2 w-0.5 -translate-x-1/2 bg-white shadow-[0_0_8px_rgba(0,0,0,0.35)]" />
                    <div className="absolute left-1/2 top-[34%] flex h-11 w-11 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border-2 border-white/80 bg-ink text-white shadow-lg">
                      <GripVertical className="h-4 w-4" />
                    </div>
                    <span className="absolute left-3 top-3 rounded-full border border-white/15 bg-black/45 px-3 py-1 text-xs font-semibold text-white">
                      Move-in
                    </span>
                    <span className="absolute right-3 top-3 rounded-full border border-white/15 bg-black/45 px-3 py-1 text-xs font-semibold text-white">
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
                  <div className="absolute inset-x-3 bottom-3 space-y-2 rounded-[18px] border border-white/10 bg-ink-2/95 p-3">
                    <span className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-full bg-on-ink text-[15px] font-semibold text-ink">
                      <Box className="h-4 w-4" />
                      Open the 3D sample
                    </span>
                    <p className="text-center text-xs text-on-ink-muted">
                      Two 3D scans, about 32 MB. Best on Wi-Fi.
                    </p>
                  </div>
                </Link>

                <p className="max-w-[70ch] text-[13px] leading-[1.5] text-on-ink-muted">
                  Public research scan of a real apartment (Meta&apos;s Replica
                  dataset). The move-out copy has a staged stain, and the pins
                  are an example.
                </p>
              </Reveal>
            </div>
          </section>

          {/* How it works */}
          <section
            id="how-it-works"
            aria-labelledby="how-title"
            className={cn("scroll-mt-24 bg-background", SECTION_PAD)}
          >
            <div className={CONTAINER}>
              <Reveal>
                <h2 id="how-title" className={cn(H2, "max-w-[20ch]")}>
                  Three moments. One record nobody can quietly edit.
                </h2>
              </Reveal>

              <Reveal>
                <ol className="mt-10 grid gap-4 md:grid-cols-3">
                  {HOW_IT_WORKS.map(({ icon: Icon, step, title, body }, i) => (
                    <li
                      key={step}
                      className="card-soft flex flex-col gap-4 p-6 sm:p-7"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex items-baseline gap-3">
                          <span className="font-display text-[48px] font-semibold leading-none tracking-[-0.04em] text-accent tabular-nums">
                            {i + 1}
                          </span>
                          <span className="text-[13px] font-medium text-muted-foreground">
                            {step}
                          </span>
                        </div>
                        <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-ink text-sealed-bright">
                          <Icon className="h-5 w-5" />
                        </span>
                      </div>
                      <h3 className="text-[22px] font-semibold leading-[1.2] tracking-[-0.01em]">
                        {title}
                      </h3>
                      <p className="text-[15px] leading-[1.6] text-muted-foreground">
                        {body}
                      </p>
                    </li>
                  ))}
                </ol>

                <div className="vault mt-6 flex items-start gap-3 p-5 text-[15px] leading-[1.6] text-white/75 sm:p-6">
                  <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-sealed-bright" />
                  <div>
                    <p>
                      Under the hood: every file&apos;s fingerprint is sealed on
                      Arc, and the deposit sits in USDC in a contract with no
                      admin key. Not even Keyprint can take it. This demo runs
                      on Arc Testnet with test USDC, so no real money moves.
                    </p>
                    <Link
                      href="/verify"
                      className="mt-2 inline-flex min-h-11 items-center font-medium text-accent-bright underline-offset-4 hover:underline"
                    >
                      Verify a sealed file
                    </Link>
                  </div>
                </div>
              </Reveal>
            </div>
          </section>

          {/* Closing (ink) */}
          <section className="relative isolate overflow-hidden bg-ink pt-24 text-center text-on-ink sm:pt-32">
            <BlueprintBackdrop lightAt="bottom" />
            <div className={CONTAINER}>
              <Reveal>
                <h2 className="mx-auto max-w-[22ch] font-display text-[clamp(2.5rem,7vw,5rem)] font-semibold leading-none tracking-[-0.035em] text-balance">
                  <span className="whitespace-nowrap">Your apartment.</span>{" "}
                  <span className="whitespace-nowrap">Its history.</span>{" "}
                  <span className="whitespace-nowrap">Your proof.</span>
                </h2>
                <div className="mt-10">
                  <CtaPair centered />
                </div>
              </Reveal>

              <footer className="mt-20 border-t border-white/10 py-8 text-left text-[13px] text-on-ink-muted sm:mt-28">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                  <span className="font-display text-[22px] font-semibold leading-none tracking-[-0.02em] text-on-ink">
                    Keyprint
                  </span>
                  <nav
                    aria-label="Footer"
                    className="-ml-3 flex flex-wrap items-center sm:ml-0"
                  >
                    <Link
                      href="/sample"
                      className="inline-flex min-h-11 items-center px-3 hover:text-on-ink"
                    >
                      Sample apartment
                    </Link>
                    <Link
                      href="/verify"
                      className="inline-flex min-h-11 items-center px-3 hover:text-on-ink"
                    >
                      Verify
                    </Link>
                    <Link
                      href="/start"
                      className="inline-flex min-h-11 items-center px-3 hover:text-on-ink"
                    >
                      Start
                    </Link>
                  </nav>
                </div>
                <p className="mt-4">
                  Hackathon demo on Arc Testnet with test USDC. No real money
                  moves.
                </p>
              </footer>
            </div>
          </section>
        </main>
      </div>
    </MotionConfig>
  );
}
