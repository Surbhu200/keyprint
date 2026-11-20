"use client";

import { useEffect, useState } from "react";
import {
  AnimatePresence,
  MotionConfig,
  motion,
  useReducedMotion,
} from "framer-motion";
import { Check, ScanFace } from "lucide-react";
import { cn } from "@/lib/utils";

const STATES = [
  "2 pins added",
  "Sealed with one touch",
  "Held in escrow neither side controls",
] as const;

const RAIL = ["Sealed", "Compared", "Comes back"] as const;

/**
 * A pure-DOM phone (no WebGL, no images) showing a deposit being scanned,
 * sealed and held. Decorative: the whole screen is aria-hidden.
 */
export function HeroPhone() {
  const reduce = useReducedMotion();
  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (reduce) return;
    const id = window.setInterval(() => setTick((t) => (t + 1) % 3), 2600);
    return () => window.clearInterval(id);
  }, [reduce]);

  // Reduced motion: no loop, show the final "held" state.
  const state = reduce ? 2 : tick;
  const sealed = state >= 1;
  // Rail position: state 1 lights "Sealed", state 2 adds "Compared".
  const railStep = Math.max(0, state - 1);

  return (
    <MotionConfig reducedMotion="user">
      <div
        aria-hidden="true"
        className="relative aspect-[9/19.5] w-[264px] select-none rounded-[48px] bg-[#040a16] p-[10px] shadow-[0_50px_120px_-30px_rgba(47,107,255,0.55)] ring-1 ring-white/15 sm:w-[300px]"
      >
        <div className="absolute left-1/2 top-[18px] z-10 h-[24px] w-[84px] -translate-x-1/2 rounded-full bg-black" />

        <div className="relative flex h-full flex-col gap-3 overflow-hidden rounded-[38px] bg-background px-4 pb-4 pt-12 text-foreground">
          <div className="flex items-center justify-between">
            <span className="text-[13px] font-medium text-muted-foreground">
              Sample apartment
            </span>
            <span className="rounded-full bg-muted px-2 py-0.5 text-[12px] font-medium text-muted-foreground">
              Example
            </span>
          </div>

          {/* Scan tile: measured floor grid, brass scan line, one priced pin */}
          <div className="relative h-[132px] shrink-0 sm:h-[156px] overflow-hidden rounded-[18px] bg-stage">
            <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,.07)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,.07)_1px,transparent_1px)] bg-[size:18px_18px]" />
            <div className="absolute inset-x-0 bottom-0 h-1/2 bg-linear-to-t from-[#2f6bff]/15 to-transparent" />
            <div className="absolute inset-x-0 top-0 h-px bg-sealed-bright shadow-[0_0_16px_4px_rgba(227,185,95,.45)] motion-safe:animate-scan" />

            <div className="absolute left-[56%] top-[44%] flex items-center gap-1.5">
              <span className="relative flex h-3 w-3 items-center justify-center">
                <span className="relative h-2.5 w-2.5 rounded-full bg-claim ring-2 ring-white" />
              </span>
              <span className="rounded-full bg-white/90 px-2 py-0.5 text-[12px] font-semibold text-foreground shadow-sm">
                Stain $40
              </span>
            </div>

            <span className="absolute bottom-2 left-2 rounded-full bg-black/55 px-2.5 py-1 text-[12px] font-medium text-white">
              Move-in scan
            </span>
          </div>

          {/* Deposit vault */}
          <div className="vault shrink-0 p-4">
            <p className="text-[13px] font-medium text-white/65">
              Security deposit
            </p>
            <p className="money mt-1.5 text-[40px] tabular-nums text-white">
              $200
              <span className="ml-0.5 align-[0.62em] text-[0.5em] text-white/60">
                .00
              </span>
            </p>
            <div className="relative mt-3 flex min-h-[44px] items-start">
              <AnimatePresence mode="popLayout" initial={false}>
                <motion.span
                  key={state}
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -6 }}
                  transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
                  className="inline-flex items-center gap-1.5 rounded-[12px] bg-white/10 px-2.5 py-1 text-[12px] font-medium leading-[16px] text-white/90"
                >
                  {state === 2 ? (
                    <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-sealed-bright" />
                  ) : state === 1 ? (
                    <Check className="h-3 w-3 shrink-0 text-sealed-bright" />
                  ) : null}
                  {STATES[state]}
                </motion.span>
              </AnimatePresence>
            </div>
          </div>

          {/* 3-step rail: lights up with the loop (pins, sealed, held) */}
          <div className="relative flex items-start justify-between whitespace-nowrap text-[12px] font-medium text-muted-foreground">
            <span className="absolute left-[3px] right-[3px] top-[3px] h-px bg-border" />
            <span
              className="absolute left-[3px] top-[3px] h-px bg-sealed motion-safe:transition-[width] motion-safe:duration-500 motion-safe:ease-out"
              style={{ width: `calc(${(railStep / (RAIL.length - 1)) * 100}% - 6px)` }}
            />
            {RAIL.map((label, i) => {
              const done = i <= railStep && sealed;
              return (
                <span
                  key={label}
                  className={cn(
                    "relative flex flex-col gap-1.5",
                    i === 0 ? "items-start" : i === RAIL.length - 1 ? "items-end" : "items-center",
                  )}
                >
                  <span
                    className={cn(
                      "h-[7px] w-[7px] rounded-full ring-2 ring-background transition-colors duration-300",
                      done ? "bg-sealed" : "bg-border",
                    )}
                  />
                  <span
                    className={cn(
                      "transition-colors duration-300",
                      done && "text-foreground",
                    )}
                  >
                    {label}
                  </span>
                </span>
              );
            })}
          </div>

          {/* Return date row: fills the band above the button */}
          <div className="mt-auto flex items-baseline justify-between border-t border-border pt-3 text-[13px]">
            <span className="text-muted-foreground">Back to you by</span>
            <span className="money text-[15px] tabular-nums text-foreground">
              Aug 31
            </span>
          </div>

          {/* Button lookalike */}
          <div
            className={cn(
              "flex h-12 shrink-0 items-center justify-center gap-2 rounded-[16px] text-[14px] font-semibold text-white transition-[transform,background-color] duration-200",
              state === 1
                ? "scale-[0.97] bg-sealed"
                : sealed
                  ? "bg-sealed"
                  : "bg-ink",
            )}
          >
            {sealed ? (
              <>
                <Check className="h-4 w-4" />
                Sealed
              </>
            ) : (
              <>
                <ScanFace className="h-4 w-4" />
                Seal & protect $200
              </>
            )}
          </div>
        </div>
      </div>
    </MotionConfig>
  );
}
