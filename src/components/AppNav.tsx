"use client";

import { useState } from "react";
import { createPortal } from "react-dom";
import { Receipt } from "lucide-react";
import { DetailsDrawer, type ReceiptLink } from "./DetailsDrawer";
import { usePasskeySession } from "./usePasskeySession";

interface AppNavProps {
  receipts?: ReceiptLink[];
  /**
   * "bar" (default): a full-width row with a right-aligned "Sealed receipts" pill.
   * "inline": a compact trigger that sits inside another row (an icon with a count on
   * phones, the labelled pill from `sm` up).
   */
  variant?: "bar" | "inline";
}

/**
 * Primary navigation now lives in the persistent AppShell (desktop sidebar + mobile bottom tabs).
 * When a screen passes sealed receipts, this renders a compact contextual Receipts trigger.
 */
export function AppNav({ receipts = [], variant = "bar" }: AppNavProps) {
  const session = usePasskeySession();
  const [drawerOpen, setDrawerOpen] = useState(false);

  if (receipts.length === 0) return null;

  // The drawer only exists while open (it renders nothing when closed), so it is mounted on
  // document.body: an inline trigger can live inside a sticky header without trapping the
  // full-screen drawer in that header's stacking context.
  const drawer = drawerOpen
    ? createPortal(
        <DetailsDrawer
          open={drawerOpen}
          onClose={() => setDrawerOpen(false)}
          session={session}
          receipts={receipts}
        />,
        document.body,
      )
    : null;

  if (variant === "inline") {
    const count = receipts.length;
    return (
      <>
        <button
          type="button"
          onClick={() => setDrawerOpen(true)}
          aria-haspopup="dialog"
          aria-label={`Sealed receipts (${count})`}
          className="group relative -m-1 inline-flex h-11 shrink-0 items-center justify-center p-1 cursor-pointer [-webkit-tap-highlight-color:transparent] focus-visible:outline-none"
        >
          {/* Phone: icon with a count dot. */}
          <span className="relative inline-flex h-9 w-9 items-center justify-center rounded-full bg-surface text-foreground ring-1 ring-black/5 shadow-[0_1px_2px_rgba(11,19,36,0.04)] transition-colors group-hover:bg-muted group-active:bg-border/60 group-focus-visible:ring-2 group-focus-visible:ring-accent/60 sm:hidden">
            <Receipt className="h-4 w-4 text-accent" />
            <span
              aria-hidden="true"
              className="absolute -right-1 -top-1 inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-ink px-1 text-[12px] font-semibold leading-none tabular-nums text-white ring-2 ring-background"
            >
              {count}
            </span>
          </span>
          {/* Larger screens: the labelled pill. */}
          <span
            aria-hidden="true"
            className="hidden h-8 items-center gap-1.5 rounded-full bg-surface pl-2.5 pr-1.5 text-[13px] font-medium text-foreground ring-1 ring-black/5 shadow-[0_1px_2px_rgba(11,19,36,0.04)] transition-colors group-hover:bg-muted group-active:bg-border/60 group-focus-visible:ring-2 group-focus-visible:ring-accent/60 sm:inline-flex"
          >
            <Receipt className="h-3.5 w-3.5 text-accent" />
            <span>Sealed receipts</span>
            <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-ink px-1.5 text-[12px] font-semibold tabular-nums text-white">
              {count}
            </span>
          </span>
        </button>
        {drawer}
      </>
    );
  }

  return (
    <>
      <div className="w-full">
        <div className="mx-auto flex max-w-6xl justify-end px-4 pt-1">
          <button
            type="button"
            onClick={() => setDrawerOpen(true)}
            aria-haspopup="dialog"
            className="group inline-flex h-11 items-center px-1 cursor-pointer [-webkit-tap-highlight-color:transparent] focus-visible:outline-none"
          >
            <span className="inline-flex h-8 items-center gap-1.5 rounded-full bg-surface pl-2.5 pr-1.5 text-[13px] font-medium text-foreground shadow-[0_1px_2px_rgba(11,19,36,0.04),0_8px_24px_-12px_rgba(11,19,36,0.10)] ring-1 ring-black/5 transition-colors group-hover:bg-muted group-active:bg-border/60 group-focus-visible:ring-2 group-focus-visible:ring-accent/60">
              <Receipt className="h-3.5 w-3.5 text-accent" />
              <span>Sealed receipts</span>
              <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-ink px-1.5 text-[12px] font-semibold tabular-nums text-white">
                {receipts.length}
              </span>
            </span>
          </button>
        </div>
      </div>
      {drawer}
    </>
  );
}
