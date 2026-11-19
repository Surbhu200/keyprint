"use client";

import { use, useEffect, useState } from "react";
import { encodeFunctionData, formatUnits } from "viem";
import {
  CheckCircle2,
  Download,
  ExternalLink,
  Receipt,
  ShieldCheck,
} from "lucide-react";
import { LeaseShell } from "@/components/LeaseShell";
import { useLeaseLiveState } from "@/components/useLeaseLiveState";
import { usePasskeySession } from "@/components/usePasskeySession";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  createArcPublicClient,
  explorerTxUrl,
  formatDollars,
  formatNativeUsdcFee,
  getEscrowAddress,
  KEYPRINT_ESCROW_ABI,
} from "@/lib/chain/arc";
import { friendlyError, sendSponsoredCalls } from "@/lib/chain/wallet";

const RECORD_KIND_NAMES = [
  "MoveInScan",
  "Pin",
  "MoveOutScan",
  "Alignment",
  "Report",
  "ClaimEvidence",
] as const;

/** Parses a stored wei total; anything malformed counts as zero instead of crashing the page. */
function parseWei(value: unknown): bigint {
  const text = String(value ?? "").trim();
  return /^\d{1,40}$/.test(text) ? BigInt(text) : 0n;
}

function useCountUpDollars(target6: bigint, durationMs = 900): string {
  const [val, setVal] = useState(0);
  const targetNum = Number(formatUnits(target6, 6));

  useEffect(() => {
    let raf = 0;
    const start = performance.now();
    const step = (now: number) => {
      const t = Math.min(1, (now - start) / durationMs);
      const eased = 1 - Math.pow(1 - t, 3);
      setVal(targetNum * eased);
      if (t < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    // Animation frames pause in background tabs; make sure the real amount still shows.
    const settle = setTimeout(() => setVal(targetNum), durationMs + 50);
    return () => {
      cancelAnimationFrame(raf);
      clearTimeout(settle);
    };
  }, [targetNum, durationMs]);

  if (Number.isInteger(targetNum)) {
    return `$${Math.round(val).toLocaleString("en-US")}`;
  }
  return `$${val.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

export default function LeaseSettlePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: leaseId } = use(params);
  const live = useLeaseLiveState(leaseId);
  const session = usePasskeySession();
  const [owedAmount, setOwedAmount] = useState<bigint>(0n);
  const [withdrawing, setWithdrawing] = useState(false);
  const [withdrawError, setWithdrawError] = useState<string | null>(null);

  useEffect(() => {
    const escrow = getEscrowAddress();
    if (!session || !escrow) return;
    let active = true;
    createArcPublicClient()
      .readContract({
        address: escrow,
        abi: KEYPRINT_ESCROW_ABI,
        functionName: "owed",
        args: [session.address],
      })
      .then((amt) => {
        if (active) setOwedAmount(amt);
      })
      .catch(() => {
        if (active) setOwedAmount(0n);
      });
    return () => {
      active = false;
    };
  }, [session, live.lease?.state]);

  const renterDisplay = useCountUpDollars(live.lease?.renterPayout ?? 0n);
  const landlordDisplay = useCountUpDollars(live.lease?.landlordPayout ?? 0n);

  const handleDownloadEvidence = () => {
    const lease = live.lease;
    const bundle = {
      type: "keyprint.evidence-bundle.v1",
      howToVerify:
        "For each record: SHA-256 of canonicalManifestJson must equal KeyprintRegistry.getRecord(recordId).contentHash on Arc Testnet (chain 5042002). Drop any original file plus its manifest into the Verify page to check it.",
      exportedAt: new Date().toISOString(),
      leaseId,
      unitName: live.meta?.unit_name ?? "Apartment",
      lease: lease
        ? {
            landlord: lease.landlord,
            renter: lease.renter,
            reviewer: lease.reviewer,
            deposit: formatDollars(lease.deposit),
            state: lease.state,
            renterPayout: formatDollars(lease.renterPayout),
            landlordPayout: formatDollars(lease.landlordPayout),
          }
        : null,
      // Only records that matched Arc are included (the page drops anything that doesn't).
      records: live.records.map((r) => ({
        recordId: r.record_id,
        kind: RECORD_KIND_NAMES[r.kind] ?? r.kind,
        contentHash: r.content_hash,
        author: r.author,
        sealedAtOnArc: r.chain_created_at
          ? new Date(r.chain_created_at * 1000).toISOString()
          : null,
        txHash: r.tx_hash,
        explorerUrl: r.tx_hash ? explorerTxUrl(r.tx_hash) : null,
        canonicalManifestJson: r.manifest_json,
      })),
    };
    const blob = new Blob([JSON.stringify(bundle, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `keyprint-evidence-${leaseId.slice(0, 10)}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    // Revoke after the browser has started the download.
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
  };

  const handleWithdrawOwed = async () => {
    if (!session) return;
    const escrow = getEscrowAddress();
    if (!escrow) return;
    setWithdrawing(true);
    setWithdrawError(null);
    try {
      await sendSponsoredCalls(session, [
        {
          to: escrow,
          data: encodeFunctionData({
            abi: KEYPRINT_ESCROW_ABI,
            functionName: "withdraw",
            args: [],
          }),
        },
      ]);
      setOwedAmount(0n);
      await live.refresh();
    } catch (err) {
      setWithdrawError(friendlyError(err, "The payout wasn't withdrawn. Nothing was sent."));
    } finally {
      setWithdrawing(false);
    }
  };

  const receipts = [
    { label: "Lease created", txHash: live.meta?.created_tx_hash },
    { label: "Move-in sealed & deposit protected", txHash: live.meta?.funded_tx_hash },
    { label: "Move-out sealed & lease ended", txHash: live.meta?.ended_tx_hash },
    { label: "Final settlement payout", txHash: live.meta?.settled_tx_hash },
  ].filter((r): r is { label: string; txHash: string } => Boolean(r.txHash));

  const totalGasWei = parseWei(live.meta?.total_gas_cost_wei);
  const isSettled = live.lease?.state === 3;
  const leaseState = live.lease?.state ?? 0;

  return (
    <LeaseShell leaseId={leaseId} live={live}>
      <div className="max-w-3xl mx-auto space-y-6">
        <Card className={isSettled ? "border-sealed/30" : ""}>
          <CardHeader>
            <div className="flex items-center justify-between gap-2">
              <Badge variant={isSettled ? "sealed" : "default"}>
                <CheckCircle2 className="h-3.5 w-3.5" />
                {isSettled ? "Settled" : "Awaiting settlement"}
              </Badge>
              {live.lease && (
                <span className="text-xs text-muted-foreground">
                  Deposit: {formatDollars(live.lease.deposit)}
                </span>
              )}
            </div>
            <CardTitle className="text-2xl pt-1">
              {isSettled
                ? "The deposit is settled."
                : leaseState === 2
                  ? "Settlement runs as soon as every claim is final."
                  : "Settlement happens after move-out."}
            </CardTitle>
            <CardDescription>
              {isSettled
                ? "Paid out in USDC by the escrow contract, following the lease rules. The contract has no owner or admin key."
                : leaseState === 2
                  ? "Accept, dispute, or wait out the deadlines on the Claims tab."
                  : "Once the move-out scan is sealed, the landlord gets a claim window. No claims means the full deposit goes back."}
            </CardDescription>
          </CardHeader>

          {isSettled && live.lease && (
            <CardContent className="space-y-6">
              <div className="grid sm:grid-cols-2 gap-4">
                <div className="rounded-2xl border border-sealed/30 bg-sealed/5 p-6">
                  <div className="text-xs font-semibold uppercase tracking-wider text-sealed">
                    Returned to renter
                  </div>
                  <div className="text-4xl font-semibold tabular-nums tracking-tight mt-2 text-foreground">
                    {renterDisplay}
                  </div>
                </div>

                <div className="rounded-2xl border border-border bg-muted/40 p-6">
                  <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Paid to landlord (accepted or awarded claims)
                  </div>
                  <div className="text-4xl font-semibold tabular-nums tracking-tight mt-2 text-foreground">
                    {landlordDisplay}
                  </div>
                </div>
              </div>

              {owedAmount > 0n && (
                <div className="rounded-xl border border-suggestion/30 bg-suggestion/10 p-4 flex flex-wrap items-center justify-between gap-3">
                  <div className="text-sm">
                    <span className="font-semibold">
                      {formatDollars(owedAmount)} ready to claim:
                    </span>{" "}
                    a direct transfer could not complete, so your payout was held safely for manual withdrawal.
                  </div>
                  <Button onClick={handleWithdrawOwed} disabled={withdrawing}>
                    {withdrawing ? "Withdrawing…" : "Withdraw payout"}
                  </Button>
                  {withdrawError && (
                    <p className="w-full text-xs text-claim" role="alert">
                      {withdrawError}
                    </p>
                  )}
                </div>
              )}

              <div className="flex flex-wrap gap-3">
                <Button variant="secondary" onClick={handleDownloadEvidence}>
                  <Download className="h-4 w-4" />
                  Download my evidence
                </Button>
              </div>
            </CardContent>
          )}
        </Card>

        {/* Settlement Receipt (explorer links + measured USDC network fees belong here per spec) */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Receipt className="h-4 w-4 text-accent" />
              Receipt &amp; Network Proof
            </CardTitle>
            <CardDescription>
              Measured Arc Testnet network fees (sponsored for the renter and landlord).
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4 text-sm">
            <div className="grid sm:grid-cols-2 gap-3 text-xs">
              <div className="rounded-xl border border-border bg-muted/40 p-3">
                <div className="text-muted-foreground">Operations recorded</div>
                <div className="text-base font-semibold mt-0.5">
                  {live.meta?.tx_count || receipts.length}
                </div>
              </div>
              <div className="rounded-xl border border-border bg-muted/40 p-3">
                <div className="text-muted-foreground">
                  Total Arc network fees (USDC, sponsored)
                </div>
                <div className="text-base font-semibold mt-0.5">
                  {formatNativeUsdcFee(totalGasWei)}
                </div>
              </div>
            </div>

            {receipts.length > 0 && (
              <div className="rounded-xl border border-border divide-y divide-border text-xs">
                {receipts.map((r) => (
                  <div
                    key={r.txHash}
                    className="p-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2"
                  >
                    <span className="font-medium text-foreground">{r.label}</span>
                    <a
                      href={explorerTxUrl(r.txHash)}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1 font-mono text-accent hover:underline"
                    >
                      {r.txHash.slice(0, 14)}…{r.txHash.slice(-8)}
                      <ExternalLink className="h-3 w-3" />
                    </a>
                  </div>
                ))}
              </div>
            )}

            <div className="flex items-start gap-2 text-xs text-muted-foreground pt-1">
              <ShieldCheck className="h-4 w-4 text-sealed shrink-0 mt-0.5" />
              <span>
                Every seal&apos;s fingerprint and every payout is on Arc, in contracts with no admin key. Anyone can check the downloaded evidence bundle against Arc on the Verify page.
              </span>
            </div>
          </CardContent>
        </Card>
      </div>
    </LeaseShell>
  );
}
