"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { AlertTriangle, ChevronRight, ShieldCheck } from "lucide-react";
import { formatDollars, getEscrowAddress, LeaseStateLabel } from "@/lib/chain/arc";
import { cn } from "@/lib/utils";
import { AppNav } from "./AppNav";
import { Badge } from "./ui/badge";
import type { ReceiptLink } from "./DetailsDrawer";
import type { LeaseLiveState } from "./useLeaseLiveState";
import { usePasskeySession } from "./usePasskeySession";

interface LeaseShellProps {
  leaseId: string;
  live: LeaseLiveState;
  children: React.ReactNode;
}

export function LeaseShell({ leaseId, live, children }: LeaseShellProps) {
  const pathname = usePathname();
  const session = usePasskeySession();

  // Any open lease screen asks Keyprint's keeper to settle once the claim deadline has passed
  // (anyone may settle; the keeper re-checks every contract rule before sending anything).
  const { lease, chainNowSec, refresh } = live;
  const keeperBusy = useRef(false);
  const lastKeeperCall = useRef(0);
  useEffect(() => {
    if (!lease || lease.state !== 2) return;
    const deadlinePassed = lease.claimsClosed || chainNowSec > lease.endedAt + lease.claimWindow;
    if (!deadlinePassed || keeperBusy.current) return;
    const now = Date.now();
    if (now - lastKeeperCall.current < 15_000) return;
    keeperBusy.current = true;
    lastKeeperCall.current = now;
    fetch("/api/keeper/settle", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ leaseId }),
    })
      .then(() => refresh())
      .catch(() => undefined)
      .finally(() => {
        keeperBusy.current = false;
      });
  }, [lease, chainNowSec, leaseId, refresh]);
  const base = `/lease/${leaseId}`;

  const tabs = [
    { href: `${base}/capture`, label: "1. Move in", short: "Move in" },
    { href: `${base}/room`, label: "2. Room & pins", short: "Room" },
    { href: `${base}/review`, label: "3. Landlord review", short: "Review" },
    { href: `${base}/compare`, label: "4. Move-out compare", short: "Compare" },
    { href: `${base}/claims`, label: "5. Claims", short: "Claims" },
    { href: `${base}/settle`, label: "6. Settle", short: "Settle" },
  ];
  const activeIndex = tabs.findIndex((t) => t.href === pathname);

  // Keep the current step's chip in view when the step row scrolls sideways on phones.
  const navRef = useRef<HTMLElement>(null);
  useEffect(() => {
    const nav = navRef.current;
    if (!nav || nav.scrollWidth <= nav.clientWidth) return;
    const chip = nav.querySelector<HTMLElement>('[data-active="true"]');
    if (!chip) return;
    const target = chip.offsetLeft - (nav.clientWidth - chip.offsetWidth) / 2;
    nav.scrollTo({ left: Math.max(0, target), behavior: "instant" });
  }, [pathname]);

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

  // One clear next step for whoever is looking, so nobody has to guess which tab comes next.
  const me = session?.address?.toLowerCase();
  const isRenter = Boolean(me && live.lease && live.lease.renter.toLowerCase() === me);
  const isLandlord = Boolean(me && live.lease && live.lease.landlord.toLowerCase() === me);
  let nextStep: { text: string; href?: string } | null = null;
  if (live.lease) {
    const s = live.lease.state;
    if (s === 0) {
      nextStep = isRenter
        ? { text: "Next: import your move-in scan and tap Seal & protect", href: `${base}/capture` }
        : { text: "Waiting for the renter to seal the move-in scan and protect the deposit" };
    } else if (s === 1) {
      nextStep = { text: "Next, at move-out: line up the move-out scan on Compare", href: `${base}/compare` };
    } else if (s === 2) {
      nextStep = isLandlord
        ? { text: "Next: pin and price any damage on Claims", href: `${base}/claims` }
        : { text: "Next: review the landlord's claims", href: `${base}/claims` };
    } else if (s === 3) {
      nextStep = { text: "Settled: see who got what", href: `${base}/settle` };
    }
    if (nextStep?.href === pathname) nextStep = null;
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
      <div className="sticky top-[calc(3.5rem+env(safe-area-inset-top))] z-20 border-b border-border/60 bg-background lg:top-0">
        <div className="mx-auto flex max-w-6xl flex-col gap-1.5 px-4 pt-1.5 pb-2 sm:gap-3 sm:px-5 sm:py-4">
          <div className="flex min-h-9 items-center justify-between gap-2.5 sm:gap-3">
            <div className="min-w-0 flex-1">
              <h1 className="line-clamp-2 break-words font-display text-[16px] font-semibold leading-[1.15] tracking-[-0.02em] text-pretty sm:line-clamp-1 sm:text-xl sm:leading-tight">
                {live.meta?.unit_name || "Apartment Lease"}
              </h1>
              <p className="hidden items-center gap-1.5 text-[12px] text-muted-foreground sm:flex">
                <span
                  aria-hidden="true"
                  className="h-1.5 w-1.5 shrink-0 rounded-full bg-accent motion-safe:animate-pulse"
                />
                Live record
                <span className="hidden sm:inline"> · updates automatically every few seconds</span>
              </p>
            </div>

            <div className="flex shrink-0 items-center gap-2">
              {depositBadge && (
                <Badge
                  variant="default"
                  title={depositBadge}
                  className={cn(
                    "h-7 whitespace-nowrap rounded-full px-2.5 text-[13px] font-semibold tabular-nums sm:px-3 sm:text-[12px]",
                    live.lease?.state === 0
                      ? "border-transparent bg-muted text-foreground"
                      : "border-transparent bg-ink text-white",
                  )}
                >
                  {live.lease?.state === 0 ? (
                    <ShieldCheck className="h-3.5 w-3.5 text-muted-foreground" />
                  ) : (
                    <span aria-hidden="true" className="h-1.5 w-1.5 shrink-0 rounded-full bg-sealed-bright" />
                  )}
                  {/* Phones show just the amount; the full sentence is in the title and on larger screens. */}
                  <span className="sm:hidden">{live.lease ? formatDollars(live.lease.deposit) : null}</span>
                  <span className="sr-only sm:not-sr-only">{depositBadge}</span>
                </Badge>
              )}
              <Badge
                variant="default"
                className="hidden h-7 whitespace-nowrap rounded-full border-transparent bg-muted px-3 text-[12px] sm:inline-flex"
              >
                {stateName}
              </Badge>
              <AppNav receipts={receipts} variant="inline" />
            </div>
          </div>

          {/* Phones: all six steps in one row, no sideways scrolling. Larger screens: labelled chips. */}
          <nav
            ref={navRef}
            aria-label="Lease steps"
            className="grid grid-cols-6 gap-1 sm:no-scrollbar sm:flex sm:gap-1.5 sm:overflow-x-auto"
          >
            {tabs.map((tab, i) => {
              const active = pathname === tab.href;
              return (
                <Link
                  key={tab.href}
                  href={tab.href}
                  aria-current={active ? "page" : undefined}
                  aria-label={tab.label}
                  data-active={active ? "true" : undefined}
                  className={cn(
                    "group flex min-h-12 min-w-0 flex-col items-center justify-center gap-1 rounded-xl px-0.5 py-1 text-[12px] font-medium leading-none transition-colors duration-200 [-webkit-tap-highlight-color:transparent] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60",
                    "sm:h-8 sm:min-h-0 sm:shrink-0 sm:flex-row sm:gap-1.5 sm:rounded-full sm:px-3 sm:py-0 sm:text-[13px]",
                    active ? "bg-ink text-white" : "bg-muted text-muted-foreground hover:text-foreground",
                  )}
                >
                  <span
                    aria-hidden="true"
                    className={cn(
                      "flex h-5 w-5 items-center justify-center rounded-full text-[12px] font-semibold tabular-nums sm:hidden",
                      active ? "bg-white/15" : "bg-surface text-foreground",
                    )}
                  >
                    {i + 1}
                  </span>
                  <span className="max-w-full truncate sm:hidden">{tab.short}</span>
                  <span className="hidden whitespace-nowrap sm:inline">{tab.label}</span>
                </Link>
              );
            })}
          </nav>
        </div>
        {/* Phone progress track doubles as the header's bottom edge. */}
        <div aria-hidden="true" className="absolute inset-x-0 -bottom-px h-0.5 bg-border sm:hidden">
          <div
            className="h-full bg-ink transition-[width] duration-300 ease-out-expo motion-reduce:transition-none"
            style={{ width: `${(Math.max(0, activeIndex + 1) / tabs.length) * 100}%` }}
          />
        </div>
      </div>

      <main className="flex-1 mx-auto w-full max-w-6xl px-5 py-6 space-y-4">
        {nextStep &&
          (nextStep.href ? (
            <Link
              href={nextStep.href}
              className="flex min-h-12 items-center justify-between gap-3 rounded-2xl bg-ink px-4 py-3 text-[15px] font-semibold text-white transition-colors hover:bg-ink-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60"
            >
              <span>{nextStep.text}</span>
              <ChevronRight aria-hidden="true" className="h-5 w-5 shrink-0 text-sealed-bright" />
            </Link>
          ) : (
            <p className="rounded-2xl bg-muted px-4 py-3 text-[14px] text-muted-foreground">{nextStep.text}</p>
          ))}
        {notice && (
          <div
            role="status"
            className="flex items-start gap-2 rounded-2xl bg-muted px-4 py-3 text-[14px]"
          >
            <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0 text-claim" />
            <span>{notice}</span>
          </div>
        )}
        {live.unverifiedRecordCount > 0 && (
          <p className="text-[13px] text-muted-foreground">
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
