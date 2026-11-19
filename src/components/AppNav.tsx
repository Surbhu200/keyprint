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
      <div className="w-full border-b border-border/60 bg-surface/80 px-5 py-2 flex justify-end">
        <button
          type="button"
          onClick={() => setDrawerOpen(true)}
          className="inline-flex items-center gap-1.5 rounded-full border border-border bg-surface hover:bg-muted px-3 py-1 text-xs font-medium text-foreground cursor-pointer"
        >
          <Receipt className="h-3.5 w-3.5 text-accent" />
          <span>View sealed receipts ({receipts.length})</span>
        </button>
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
