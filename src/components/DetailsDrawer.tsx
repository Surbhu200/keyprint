"use client";

import { useEffect, useState } from "react";
import { Check, Copy, ExternalLink, LogOut, ShieldCheck, X } from "lucide-react";
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
    <div className="fixed inset-0 z-50 flex justify-end bg-black/35 backdrop-blur-[1px]">
      <div className="w-full max-w-md bg-surface h-full shadow-2xl border-l border-border flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
          <div className="flex items-center gap-2 font-semibold">
            <ShieldCheck className="h-4 w-4 text-accent" />
            <span>Verification &amp; Account Details</span>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 hover:bg-muted text-muted-foreground cursor-pointer"
            aria-label="Close details"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-6 text-sm">
          {session ? (
            <section className="space-y-3">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Signed-in Passkey Account
              </h3>
              <div className="rounded-xl border border-border bg-muted/50 p-4 space-y-2.5">
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Name</span>
                  <span className="font-medium">{session.username}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Available balance</span>
                  <span className="font-semibold">
                    {balance !== null ? formatDollars(balance) : "Loading…"}
                  </span>
                </div>
                <div className="pt-1 border-t border-border/70">
                  <div className="text-xs text-muted-foreground mb-1">
                    Arc Smart Account Address
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <code className="text-xs break-all font-mono text-foreground">
                      {session.address}
                    </code>
                    <button
                      type="button"
                      onClick={() => copyValue("account", session.address)}
                      className="shrink-0 p-1.5 rounded-md hover:bg-surface border border-border cursor-pointer"
                      title="Copy address"
                    >
                      {copied === "account" ? (
                        <Check className="h-3.5 w-3.5 text-sealed" />
                      ) : (
                        <Copy className="h-3.5 w-3.5" />
                      )}
                    </button>
                  </div>
                  <a
                    href={explorerAddressUrl(session.address)}
                    target="_blank"
                    rel="noreferrer"
                    className="mt-2 inline-flex items-center gap-1 text-xs text-accent hover:underline"
                  >
                    View on Arc Testnet Explorer
                    <ExternalLink className="h-3 w-3" />
                  </a>
                </div>
              </div>

              <Button
                variant="outline"
                size="sm"
                className="w-full"
                onClick={() => {
                  clearSession();
                  onSessionCleared?.();
                  onClose();
                }}
              >
                <LogOut className="h-3.5 w-3.5" />
                Sign out of this browser profile
              </Button>
            </section>
          ) : (
            <p className="text-muted-foreground">
              Not signed in yet. Sign in with your passkey to view your account details.
            </p>
          )}

          <section className="space-y-3">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Arc Testnet Contracts (Chain ID 5042002)
            </h3>
            <div className="rounded-xl border border-border divide-y divide-border text-xs">
              {[
                { label: "USDC (ERC-20, 6 decimals)", addr: ARC_USDC_ADDRESS },
                { label: "KeyprintRegistry", addr: registry },
                { label: "KeyprintEscrow", addr: escrow },
              ].map((item) => (
                <div key={item.label} className="p-3 space-y-1">
                  <div className="font-medium text-foreground">{item.label}</div>
                  {item.addr ? (
                    <a
                      href={explorerAddressUrl(item.addr)}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1 font-mono text-accent hover:underline break-all"
                    >
                      {item.addr}
                      <ExternalLink className="h-3 w-3 shrink-0" />
                    </a>
                  ) : (
                    <span className="text-muted-foreground">Not configured in .env.local</span>
                  )}
                </div>
              ))}
            </div>
          </section>

          {receipts.length > 0 && (
            <section className="space-y-3">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Sealed Receipts
              </h3>
              <div className="rounded-xl border border-border divide-y divide-border text-xs">
                {receipts.map((r) => (
                  <div key={r.txHash} className="p-3 space-y-1">
                    <div className="flex items-center justify-between">
                      <span className="font-medium">{r.label}</span>
                      {r.gasFeeLabel && (
                        <span className="text-muted-foreground">
                          Fee: {r.gasFeeLabel} (sponsored)
                        </span>
                      )}
                    </div>
                    <a
                      href={explorerTxUrl(r.txHash)}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1 font-mono text-accent hover:underline break-all"
                    >
                      {r.txHash}
                      <ExternalLink className="h-3 w-3 shrink-0" />
                    </a>
                  </div>
                ))}
              </div>
            </section>
          )}
        </div>
      </div>
    </div>
  );
}
