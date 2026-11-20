"use client";

import { useState } from "react";
import { Receipt } from "lucide-react";
import { DetailsDrawer, type ReceiptLink } from "./DetailsDrawer";
import { usePasskeySession } from "./usePasskeySession";

interface AppNavProps {
  receipts?: ReceiptLink[];
}

/**
 * Primary navigation now lives in the persistent AppShell (desktop sidebar + mobile bottom tabs).
 * When a screen passes sealed receipts, this renders a compact contextual Receipts trigger.
 */
export function AppNav({ receipts = [] }: AppNavProps) {
  const session = usePasskeySession();
  const [drawerOpen, setDrawerOpen] = useState(false);

  if (receipts.length === 0) return null;

  return (
    <>
      <div className="w-full bg-surface">
        <div className="mx-auto flex max-w-6xl justify-end px-4 pt-1">
          <button
            type="button"
            onClick={() => setDrawerOpen(true)}
            aria-haspopup="dialog"
            className="group inline-flex h-11 items-center px-1 cursor-pointer [-webkit-tap-highlight-color:transparent] focus-visible:outline-none"
          >
            <span className="inline-flex h-8 items-center gap-1.5 rounded-full border border-border bg-surface pl-2.5 pr-1.5 text-xs font-medium text-foreground shadow-xs transition-colors group-hover:bg-muted group-active:bg-border/60 group-focus-visible:ring-2 group-focus-visible:ring-accent/60">
              <Receipt className="h-3.5 w-3.5 text-accent" />
              <span>Sealed receipts</span>
              <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-accent/10 px-1.5 text-[11px] font-semibold tabular-nums text-accent">
                {receipts.length}
              </span>
            </span>
          </button>
        </div>
      </div>
      <DetailsDrawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        session={session}
        receipts={receipts}
      />
    </>
  );
}
