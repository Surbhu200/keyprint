"use client";

import { useEffect, useRef, useState } from "react";
import { Clock, ShieldCheck } from "lucide-react";
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
  /** Lease ID for polling POST /api/keeper/settle every 2s once at zero. */
  leaseId?: string;
  /** Optional passkey fallback release callback ("Release my deposit"). */
  onManualRelease?: () => Promise<void>;
  releasing?: boolean;
  /** Called if the keeper settles the lease automatically. */
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

export function Countdown({
  deadlineSec,
  chainNowSec,
  activeMessage,
  expiredMessage,
  leaseId,
  onManualRelease,
  releasing,
  onKeeperSettled,
}: CountdownProps) {
  const [tickOffset, setTickOffset] = useState(0);
  const [keeperStatus, setKeeperStatus] = useState<string | null>(null);
  const settledRef = useRef(false);

  // Reset local interpolation whenever a fresh block timestamp arrives
  useEffect(() => {
    setTickOffset(0);
    const id = setInterval(() => setTickOffset((t) => t + 1), 1000);
    return () => clearInterval(id);
  }, [chainNowSec]);

  const remaining = Math.max(0, deadlineSec - (chainNowSec + tickOffset));
  const isExpired = remaining <= 0;

  // Poll /api/keeper/settle every 2 seconds once countdown reaches zero
  useEffect(() => {
    if (!isExpired || !leaseId || settledRef.current) return;

    let cancelled = false;
    const poll = async () => {
      try {
        const res = await fetch("/api/keeper/settle", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ leaseId }),
        });
        const data = (await res.json()) as {
          settled?: boolean;
          txHash?: string;
          reason?: string;
        };
        if (cancelled) return;
        if (data.settled && data.txHash) {
          settledRef.current = true;
          setKeeperStatus("Refund released automatically.");
          onKeeperSettled?.(data.txHash);
        } else if (data.reason) {
          setKeeperStatus("Releasing deposit…");
        }
      } catch {
        // Retry on next tick
      }
    };

    poll();
    const timer = setInterval(poll, 2000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [isExpired, leaseId, onKeeperSettled]);

  return (
    <div className="rounded-2xl border border-border bg-surface p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
      <div className="space-y-1">
        <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">
          {isExpired ? (
            <ShieldCheck className="h-3.5 w-3.5 text-sealed" />
          ) : (
            <Clock className="h-3.5 w-3.5 text-accent" />
          )}
          <span>{isExpired ? "Deadline reached" : "Countdown"}</span>
        </div>
        <p className="text-sm text-foreground">
          {isExpired ? expiredMessage : activeMessage}
        </p>
        {keeperStatus && (
          <p className="text-xs text-sealed font-medium">{keeperStatus}</p>
        )}
      </div>

      <div className="flex items-center gap-4 shrink-0">
        <div className="text-3xl sm:text-4xl font-semibold tabular-nums tracking-tight text-foreground">
          {formatRemaining(remaining)}
        </div>
        {isExpired && onManualRelease && (
          <Button onClick={onManualRelease} disabled={releasing}>
            {releasing ? "Releasing…" : "Release my deposit"}
          </Button>
        )}
      </div>
    </div>
  );
}
