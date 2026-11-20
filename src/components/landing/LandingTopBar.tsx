"use client";

import { useSyncExternalStore } from "react";
import Link from "next/link";
import { ShieldCheck } from "lucide-react";
import { cn } from "@/lib/utils";

function subscribe(onChange: () => void) {
  window.addEventListener("scroll", onChange, { passive: true });
  window.addEventListener("resize", onChange, { passive: true });
  return () => {
    window.removeEventListener("scroll", onChange);
    window.removeEventListener("resize", onChange);
  };
}

/** Light look once the reader has scrolled past most of the ink hero. */
function pastHero() {
  return window.scrollY >= window.innerHeight * 0.7;
}

export function LandingTopBar() {
  const light = useSyncExternalStore(subscribe, pastHero, () => false);

  const link =
    "h-11 items-center rounded-full px-3 text-[14px] font-medium opacity-75 transition-opacity duration-200 hover:opacity-100";

  return (
    <header className="pointer-events-none fixed inset-x-0 top-0 z-50 pt-[env(safe-area-inset-top)]">
      <div
        className={cn(
          "pointer-events-auto mx-auto mt-3 flex h-14 w-[calc(100%-24px)] max-w-[1100px] items-center justify-between rounded-full border pl-2 pr-1.5 backdrop-blur-xl backdrop-saturate-150 transition-colors duration-200",
          light
            ? "border-black/5 bg-surface/80 text-foreground shadow-[0_12px_40px_-16px_rgba(10,26,51,0.25)]"
            : "border-white/10 bg-ink/60 text-on-ink",
        )}
      >
        <Link
          href="/"
          className="flex h-11 items-center gap-2.5 rounded-full pl-1 pr-3"
        >
          <span
            className={cn(
              "inline-flex h-8 w-8 items-center justify-center rounded-[10px] transition-colors duration-200",
              light ? "bg-ink text-sealed-bright" : "bg-on-ink text-ink",
            )}
          >
            <ShieldCheck className="h-4 w-4" />
          </span>
          <span className="font-display text-[20px] font-semibold leading-none tracking-[-0.02em]">
            Keyprint
          </span>
        </Link>

        <nav aria-label="Landing" className="flex items-center gap-0.5">
          <a href="#how-it-works" className={cn(link, "hidden sm:inline-flex")}>
            How it works
          </a>
          <Link href="/sample" className={cn(link, "inline-flex")}>
            Sample
          </Link>
          <Link href="/verify" className={cn(link, "hidden sm:inline-flex")}>
            Verify
          </Link>
          <Link
            href="/start"
            className={cn(
              "ml-1 inline-flex h-11 items-center rounded-full px-5 text-[14px] font-semibold transition-colors duration-200 active:scale-[0.98]",
              light
                ? "bg-ink text-on-ink hover:bg-ink-2"
                : "bg-on-ink text-ink hover:bg-white",
            )}
          >
            Start
          </Link>
        </nav>
      </div>
    </header>
  );
}
