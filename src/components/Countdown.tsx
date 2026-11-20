"use client";

import { useEffect, useRef, useState } from "react";
import { Clock, ShieldCheck } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "./ui/button";

interface CountdownProps {
  /** Deadline unix timestamp (seconds) from the contract. */
  deadlineSec: number;
  /** Latest block timestamp (seconds) from Arc (never relies solely on device clock). */
  chainNowSec: number;
  /** Human message shown above digits while ticking. */
  activeMessage: string;
  /** Human message shown once clock reaches zero. */
  expiredMessage: string;
  /** Lease ID for asking POST /api/keeper/settle to settle once the deadline has passed. */
  leaseId?: string;
  /** Optional passkey fallback release callback ("Release my deposit"). */
  onManualRelease?: () => Promise<void>;
  /** Label for the manual button (defaults to "Release my deposit"). */
  manualReleaseLabel?: string;
  releasing?: boolean;
  /** Called if the keeper settles the lease. */
  onKeeperSettled?: (txHash: string) => void;
}

function formatRemaining(seconds: number): string {
  const clamped = Math.max(0, Math.floor(seconds));
  const days = Math.floor(clamped / 86400);
  const hours = Math.floor((clamped % 86400) / 3600);
  const mins = Math.floor((clamped % 3600) / 60);
  const secs = clamped % 60;

  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}:${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
  return `${mins}:${String(secs).padStart(2, "0")}`;
}

const KEEPER_GIVE_UP_HINT_MS = 20_000;

export function Countdown({
  deadlineSec,
  chainNowSec,
  activeMessage,
  expiredMessage,
  leaseId,
  onManualRelease,
  manualReleaseLabel = "Release my deposit",
  releasing,
  onKeeperSettled,
}: CountdownProps) {
  const [clock, setClock] = useState<{ base: number; elapsed: number }>({
    base: chainNowSec,
    elapsed: 0,
  });
  const [keeperStatus, setKeeperStatus] = useState<string | null>(null);
  const settledRef = useRef(false);
  const inFlightRef = useRef(false);
  // Keep the latest callback without restarting the polling effect on every parent render.
  const settledCbRef = useRef(onKeeperSettled);
  useEffect(() => {
    settledCbRef.current = onKeeperSettled;
  }, [onKeeperSettled]);

  // Advance local 1s interpolation anchored to the latest chain block timestamp
  useEffect(() => {
    const id = setInterval(() => {
      setClock((prev) =>
        prev.base === chainNowSec
          ? { base: chainNowSec, elapsed: prev.elapsed + 1 }
          : { base: chainNowSec, elapsed: 1 },
      );
    }, 1000);
    return () => clearInterval(id);
  }, [chainNowSec]);

  const elapsedForBase = clock.base === chainNowSec ? clock.elapsed : 0;
  const nowEstimate = chainNowSec + elapsedForBase;
  const remaining = Math.max(0, deadlineSec - nowEstimate);
  // The contract allows settling only strictly after the deadline.
  const isExpired = nowEstimate > deadlineSec;
  const displayExpired = remaining <= 0;

  const hasManualRelease = Boolean(onManualRelease);

  // Once the deadline has passed, ask Keyprint's keeper to settle every 2 seconds.
  // The keeper simulates first, so a call before the rules allow it costs nothing.
  useEffect(() => {
    if (!isExpired || !leaseId || settledRef.current) return;

    let cancelled = false;
    const startedAt = Date.now();
    const poll = async () => {
      if (inFlightRef.current || settledRef.current) return;
      inFlightRef.current = true;
      try {
        const res = await fetch("/api/keeper/settle", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ leaseId }),
        });
        const data = (await res.json().catch(() => ({}))) as {
          settled?: boolean;
          txHash?: string;
          reason?: string;
          keeperUnavailable?: boolean;
        };
        if (data.settled && data.txHash) {
          settledRef.current = true;
          if (!cancelled) setKeeperStatus("Keyprint released it.");
          settledCbRef.current?.(data.txHash);
        } else if (!cancelled) {
          const waitedLong = Date.now() - startedAt > KEEPER_GIVE_UP_HINT_MS;
          setKeeperStatus(
            data.keeperUnavailable || waitedLong
              ? hasManualRelease
                ? `Tap "${manualReleaseLabel}" to finish.`
                : "Waiting for the lease to be settled…"
              : "Confirming deadline…",
          );
        }
      } catch {
        // Retry on the next tick.
      } finally {
        inFlightRef.current = false;
      }
    };

    void poll();
    const timer = setInterval(() => void poll(), 2000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [isExpired, leaseId, hasManualRelease, manualReleaseLabel]);

  return (
    <div className="rounded-2xl border border-border bg-surface p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
      <div className="space-y-1">
        <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">
          {displayExpired ? (
            <ShieldCheck className="h-3.5 w-3.5 text-sealed" />
          ) : (
            <Clock className="h-3.5 w-3.5 text-accent" />
          )}
          <span>{displayExpired ? "Deadline reached" : "Time left"}</span>
        </div>
        <p className="text-sm text-foreground">
          {displayExpired ? expiredMessage : activeMessage}
        </p>
        {keeperStatus && (
          <p
            className={cn(
              "text-sm font-medium",
              keeperStatus === "Keyprint released it." ? "text-sealed" : "text-muted-foreground",
            )}
            aria-live="polite"
          >
            {keeperStatus}
          </p>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-3 sm:shrink-0 sm:flex-nowrap sm:gap-4">
        {/* Accent (not red: red means claim) in the final 10 seconds draws the eye. */}
        <div
          role="timer"
          className={cn(
            "text-4xl font-semibold tabular-nums tracking-tight transition-colors motion-reduce:transition-none",
            displayExpired
              ? "text-sealed"
              : remaining <= 10
                ? "text-accent"
                : "text-foreground",
          )}
        >
          {formatRemaining(remaining)}
        </div>
        {isExpired && onManualRelease && (
          <Button onClick={onManualRelease} disabled={releasing} className="w-full sm:w-auto">
            {releasing ? "Releasing…" : manualReleaseLabel}
          </Button>
        )}
      </div>
    </div>
  );
}
