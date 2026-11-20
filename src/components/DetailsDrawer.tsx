"use client";

import { useEffect, useState } from "react";
import {
  Check,
  ChevronDown,
  Copy,
  ExternalLink,
  LogOut,
  ShieldCheck,
  X,
} from "lucide-react";
import {
  ARC_USDC_ADDRESS,
  explorerAddressUrl,
  explorerTxUrl,
  formatDollars,
  getEscrowAddress,
  getRegistryAddress,
} from "@/lib/chain/arc";
import {
  clearSession,
  readUsdcBalance,
  type SavedPasskeySession,
} from "@/lib/chain/wallet";
import { Button } from "./ui/button";

export interface ReceiptLink {
  label: string;
  txHash: string;
  gasFeeLabel?: string;
}

interface DetailsDrawerProps {
  open: boolean;
  onClose: () => void;
  session: SavedPasskeySession | null;
  onSessionCleared?: () => void;
  receipts?: ReceiptLink[];
}

export function DetailsDrawer({
  open,
  onClose,
  session,
  onSessionCleared,
  receipts = [],
}: DetailsDrawerProps) {
  const [balance, setBalance] = useState<bigint | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  const registry = getRegistryAddress();
  const escrow = getEscrowAddress();

  useEffect(() => {
    if (!open || !session?.address) return;
    let active = true;
    readUsdcBalance(session.address)
      .then((b) => {
        if (active) setBalance(b);
      })
      .catch(() => {
        if (active) setBalance(null);
      });
    return () => {
      active = false;
    };
  }, [open, session?.address]);

  if (!open) return null;

  const copyValue = (key: string, val: string) => {
    navigator.clipboard.writeText(val);
    setCopied(key);
    setTimeout(() => setCopied(null), 1500);
  };

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/40 backdrop-blur-[2px] transition-colors duration-300 starting:bg-black/0 motion-reduce:transition-none">
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Account and proof details"
        className="flex h-full w-full flex-col bg-surface shadow-2xl translate-y-0 transition-[translate] duration-300 ease-out starting:translate-y-full motion-reduce:transition-none sm:max-w-md sm:border-l sm:border-border sm:starting:translate-x-full sm:starting:translate-y-0"
      >
        <div className="shrink-0 border-b border-border pt-[env(safe-area-inset-top)]">
          <div className="flex h-14 items-center justify-between gap-3 pl-5 pr-2 sm:pl-6">
            <h2 className="flex min-w-0 items-center gap-2 text-base font-semibold">
              <ShieldCheck className="h-4 w-4 shrink-0 text-accent" />
              <span className="truncate">Account &amp; proof details</span>
            </h2>
            <button
              type="button"
              onClick={onClose}
              autoFocus
              className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground active:bg-border/60 [-webkit-tap-highlight-color:transparent] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60 cursor-pointer"
              aria-label="Close details"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        <div className="flex-1 space-y-6 overflow-y-auto overscroll-contain px-5 pt-5 pb-[calc(1.5rem+env(safe-area-inset-bottom))] text-sm sm:px-6">
          {receipts.length > 0 && (
            <section className="space-y-3">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Sealed receipts
              </h3>
              <div className="overflow-hidden rounded-2xl border border-border divide-y divide-border">
                {receipts.map((r) => (
                  <a
                    key={r.txHash}
                    href={explorerTxUrl(r.txHash)}
                    target="_blank"
                    rel="noreferrer"
                    title={r.txHash}
                    className="flex min-h-14 items-center justify-between gap-3 px-4 py-3 transition-colors hover:bg-muted active:bg-muted [-webkit-tap-highlight-color:transparent] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent/60"
                  >
                    <span className="min-w-0">
                      <span className="block text-sm font-medium text-foreground">
                        {r.label}
                      </span>
                      <span className="block truncate text-xs text-muted-foreground">
                        <span className="font-mono">
                          {r.txHash.slice(0, 10)}…{r.txHash.slice(-8)}
                        </span>
                        {r.gasFeeLabel && <> · Fee {r.gasFeeLabel} (sponsored)</>}
                      </span>
                    </span>
                    <ExternalLink className="h-4 w-4 shrink-0 text-accent" />
                  </a>
                ))}
              </div>
            </section>
          )}

          {session ? (
            <section className="space-y-3">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Your account
              </h3>
              <div className="divide-y divide-border/70 rounded-2xl border border-border bg-muted/40">
                <div className="flex items-center justify-between gap-3 px-4 py-3">
                  <span className="text-muted-foreground">Name</span>
                  <span className="min-w-0 truncate font-medium">{session.username}</span>
                </div>
                <div className="flex items-center justify-between gap-3 px-4 py-3">
                  <span className="text-muted-foreground">Available balance</span>
                  <span className="font-semibold tabular-nums">
                    {balance !== null ? formatDollars(balance) : "Loading…"}
                  </span>
                </div>
                <div className="space-y-3 px-4 py-4">
                  <div className="font-medium text-foreground">Account ID</div>
                  <p className="text-xs leading-relaxed text-muted-foreground">
                    Share this so you can be added to a lease.
                  </p>
                  <code className="block break-all rounded-xl border border-border bg-surface px-3 py-2.5 font-mono text-[13px] leading-relaxed text-foreground">
                    {session.address}
                  </code>
                  <Button
                    type="button"
                    variant="secondary"
                    className="w-full"
                    onClick={() => copyValue("account", session.address)}
                  >
                    {copied === "account" ? (
                      <>
                        <Check className="h-4 w-4 text-sealed" />
                        Copied
                      </>
                    ) : (
                      <>
                        <Copy className="h-4 w-4" />
                        Copy account ID
                      </>
                    )}
                  </Button>
                  <span className="sr-only" aria-live="polite">
                    {copied === "account" ? "Account ID copied" : ""}
                  </span>
                  <a
                    href={explorerAddressUrl(session.address)}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex min-h-11 items-center gap-1.5 rounded-md text-xs font-medium text-accent hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60"
                  >
                    View on Arc Testnet Explorer
                    <ExternalLink className="h-3.5 w-3.5" />
                  </a>
                </div>
              </div>

              <Button
                variant="outline"
                className="w-full"
                onClick={() => {
                  clearSession();
                  onSessionCleared?.();
                  onClose();
                }}
              >
                <LogOut className="h-4 w-4" />
                Sign out of this browser profile
              </Button>
            </section>
          ) : (
            <p className="rounded-2xl border border-border bg-muted/40 px-4 py-3 leading-relaxed text-muted-foreground">
              Not signed in yet. Sign in with your passkey to view your account details.
            </p>
          )}

          <details className="group overflow-hidden rounded-2xl border border-border">
            <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between gap-3 px-4 text-sm font-medium hover:bg-muted [-webkit-tap-highlight-color:transparent] [&::-webkit-details-marker]:hidden focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent/60">
              Contracts on Arc Testnet
              <ChevronDown className="h-4 w-4 text-muted-foreground transition-transform group-open:rotate-180 motion-reduce:transition-none" />
            </summary>
            <div className="divide-y divide-border border-t border-border text-xs">
              {[
                { label: "USDC (ERC-20, 6 decimals)", addr: ARC_USDC_ADDRESS },
                { label: "KeyprintRegistry", addr: registry },
                { label: "KeyprintEscrow", addr: escrow },
              ].map((item) => (
                <div key={item.label} className="space-y-1 px-4 py-3">
                  <div className="font-medium text-foreground">{item.label}</div>
                  {item.addr ? (
                    <a
                      href={explorerAddressUrl(item.addr)}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex min-h-11 items-center gap-1 font-mono text-accent hover:underline break-all"
                    >
                      {item.addr}
                      <ExternalLink className="h-3 w-3 shrink-0" />
                    </a>
                  ) : (
                    <span className="text-muted-foreground">
                      Not connected on this deployment
                    </span>
                  )}
                </div>
              ))}
              <p className="px-4 py-3 text-muted-foreground">Chain ID 5042002</p>
            </div>
          </details>
        </div>
      </div>
    </div>
  );
}
