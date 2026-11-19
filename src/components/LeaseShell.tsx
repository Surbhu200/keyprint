"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { AlertTriangle, ShieldCheck } from "lucide-react";
import { formatDollars, getEscrowAddress, LeaseStateLabel } from "@/lib/chain/arc";
import { cn } from "@/lib/utils";
import { AppNav } from "./AppNav";
import { Badge } from "./ui/badge";
import type { ReceiptLink } from "./DetailsDrawer";
import type { LeaseLiveState } from "./useLeaseLiveState";

interface LeaseShellProps {
  leaseId: string;
  live: LeaseLiveState;
  children: React.ReactNode;
}

export function LeaseShell({ leaseId, live, children }: LeaseShellProps) {
  const pathname = usePathname();
  const base = `/lease/${leaseId}`;

  const tabs = [
    { href: `${base}/capture`, label: "1. Move in" },
    { href: `${base}/room`, label: "2. Room & pins" },
    { href: `${base}/review`, label: "3. Landlord review" },
    { href: `${base}/compare`, label: "4. Move-out compare" },
    { href: `${base}/claims`, label: "5. Claims" },
    { href: `${base}/settle`, label: "6. Settle" },
  ];

  const receipts: ReceiptLink[] = [];
  if (live.meta?.created_tx_hash) {
    receipts.push({ label: "Lease terms created", txHash: live.meta.created_tx_hash });
  }
  if (live.meta?.funded_tx_hash) {
    receipts.push({ label: "Move-in sealed & deposit protected", txHash: live.meta.funded_tx_hash });
  }
  if (live.meta?.ended_tx_hash) {
    receipts.push({ label: "Move-out sealed & lease ended", txHash: live.meta.ended_tx_hash });
  }
  if (live.meta?.settled_tx_hash) {
    receipts.push({ label: "Deposit settled", txHash: live.meta.settled_tx_hash });
  }

  const stateName =
    live.lease !== null
      ? LeaseStateLabel[live.lease.state as keyof typeof LeaseStateLabel] || "Active"
      : live.loading
        ? "Loading"
        : "Not found";

  // The money badge says what is actually true onchain right now.
  let depositBadge: string | null = null;
  if (live.lease) {
    const amount = formatDollars(live.lease.deposit);
    depositBadge =
      live.lease.state === 0
        ? `${amount} deposit · not paid yet`
        : live.lease.state === 3
          ? `${amount} deposit · settled`
          : `${amount} protected`;
  }

  let notice: string | null = null;
  if (!getEscrowAddress()) {
    notice = "This deployment isn't connected to the protection service yet, so lease details can't load.";
  } else if (live.error && !live.lease) {
    notice = "Can't reach the live record right now. Retrying every few seconds…";
  } else if (!live.loading && !live.lease) {
    notice = "This lease wasn't found. Check the link, or start a new lease from Home.";
  }

  return (
    <div className="min-h-screen flex flex-col">
      <AppNav receipts={receipts} />

      <div className="border-b border-border bg-surface">
        <div className="mx-auto max-w-6xl px-5 py-4 flex flex-col gap-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h1 className="text-xl font-semibold tracking-tight">
                {live.meta?.unit_name || "Apartment Lease"}
              </h1>
              <p className="text-xs text-muted-foreground">
                Live record · updates automatically every few seconds
              </p>
            </div>

            <div className="flex items-center gap-2">
              {depositBadge && (
                <Badge variant={live.lease?.state === 0 ? "default" : "sealed"}>
                  <ShieldCheck className="h-3.5 w-3.5" />
                  {depositBadge}
                </Badge>
              )}
              <Badge variant="default">{stateName}</Badge>
            </div>
          </div>

          <nav className="flex items-center gap-1 overflow-x-auto pb-0.5">
            {tabs.map((tab) => (
              <Link
                key={tab.href}
                href={tab.href}
                className={cn(
                  "px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-colors",
                  pathname === tab.href
                    ? "bg-accent text-accent-foreground"
                    : "text-muted-foreground hover:text-foreground hover:bg-muted",
                )}
              >
                {tab.label}
              </Link>
            ))}
          </nav>
        </div>
      </div>

      <main className="flex-1 mx-auto w-full max-w-6xl px-5 py-6 space-y-4">
        {notice && (
          <div
            role="status"
            className="flex items-start gap-2 rounded-lg border border-border bg-muted/50 px-3 py-2.5 text-sm"
          >
            <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0 text-claim" />
            <span>{notice}</span>
          </div>
        )}
        {live.unverifiedRecordCount > 0 && (
          <p className="text-xs text-muted-foreground">
            {live.unverifiedRecordCount} saved item{live.unverifiedRecordCount === 1 ? "" : "s"} didn&apos;t match
            {" "}what&apos;s sealed (or {live.unverifiedRecordCount === 1 ? "is" : "are"} still confirming), so{" "}
            {live.unverifiedRecordCount === 1 ? "it's" : "they're"} hidden.
          </p>
        )}
        {children}
      </main>
    </div>
  );
}
