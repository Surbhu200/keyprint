"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ShieldCheck } from "lucide-react";
import { formatDollars, LeaseStateLabel } from "@/lib/chain/arc";
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
      : "Loading";

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
                Live record · updates automatically every 2 seconds
              </p>
            </div>

            <div className="flex items-center gap-2">
              {live.lease && (
                <Badge variant="sealed">
                  <ShieldCheck className="h-3.5 w-3.5" />
                  {formatDollars(live.lease.deposit)} protected
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

      <main className="flex-1 mx-auto w-full max-w-6xl px-5 py-6">
        {children}
      </main>
    </div>
  );
}
