"use client";

import { use, useEffect, useState } from "react";
import Link from "next/link";
import { encodeFunctionData, formatUnits } from "viem";
import { MotionConfig, motion } from "framer-motion";
import {
  Check,
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
import { Button, buttonVariants } from "@/components/ui/button";
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
import { cn } from "@/lib/utils";

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
  // Display only: each side's share of the payout, for the split bar (bigint math, tenths of a percent).
  const payoutTotal = (live.lease?.renterPayout ?? 0n) + (live.lease?.landlordPayout ?? 0n);
  const renterSharePct =
    payoutTotal > 0n ? Number(((live.lease?.renterPayout ?? 0n) * 1000n) / payoutTotal) / 10 : 100;
  const isSettled = live.lease?.state === 3;
  const leaseState = live.lease?.state ?? 0;

  return (
    <LeaseShell leaseId={leaseId} live={live}>
      <div className="max-w-3xl mx-auto space-y-6">
        <Card className={isSettled ? "border-transparent" : ""}>
          <CardHeader>
            <div className="flex items-center justify-between gap-2">
              <Badge variant={isSettled ? "sealed" : "default"}>
                <CheckCircle2 className="h-3.5 w-3.5" />
                {isSettled ? "Settled" : "Awaiting settlement"}
              </Badge>
              {live.lease && (
                <span className="text-[13px] tabular-nums text-muted-foreground">
                  Deposit: {formatDollars(live.lease.deposit)}
                </span>
              )}
            </div>
            <CardTitle className="pt-2 font-display text-[30px] font-semibold leading-[1.1] tracking-[-0.03em] text-balance sm:text-[36px]">
              {isSettled
                ? "The deposit is settled."
                : leaseState === 2
                  ? "Settlement runs as soon as every claim is final."
                  : "Settlement happens after move-out."}
            </CardTitle>
            <CardDescription className="text-[15px] leading-[1.55]">
              {isSettled
                ? live.meta?.settled_by === "keeper"
                  ? "Released automatically by Keyprint once the deadline passed."
                  : live.meta?.settled_by === "party"
                    ? "Released with one tap by the renter or landlord."
                    : "Paid out according to the lease rules."
                : leaseState === 2
                  ? "Accept, dispute, or wait out the deadlines on the Claims tab."
                  : "Once the move-out scan is sealed, the landlord gets a claim window. No claims means the full deposit goes back."}
            </CardDescription>
            {!isSettled && live.lease && (
              <Link
                href={
                  leaseState === 2
                    ? `/lease/${leaseId}/claims`
                    : leaseState === 1
                      ? `/lease/${leaseId}/compare`
                      : `/lease/${leaseId}/capture`
                }
                className={cn(buttonVariants(), "mt-3 h-12 w-full rounded-2xl text-[15px] sm:w-auto sm:self-start")}
              >
                {leaseState === 2
                  ? "Go to claims"
                  : leaseState === 1
                    ? "Go to move-out compare"
                    : "Go to move-in"}
              </Link>
            )}
          </CardHeader>

          {isSettled && live.lease && (
            <CardContent className="space-y-6">
              <MotionConfig reducedMotion="user">
                <section className="vault p-6 sm:p-8">
                  <div className="eyebrow text-white/60">Returned to renter</div>
                  <div className="money mt-3 font-display text-[56px] text-white sm:text-[64px]">
                    {renterDisplay}
                  </div>

                  <div
                    aria-hidden="true"
                    className="mt-5 flex h-2.5 overflow-hidden rounded-full bg-white/10"
                  >
                    <motion.div
                      className="h-full bg-sealed-bright"
                      initial={{ width: "0%" }}
                      animate={{ width: `${renterSharePct}%` }}
                      transition={{ duration: 0.9, ease: [0.22, 1, 0.36, 1] }}
                    />
                    <motion.div
                      className="h-full bg-[#f87171]"
                      initial={{ width: "0%" }}
                      animate={{ width: `${100 - renterSharePct}%` }}
                      transition={{ duration: 0.9, ease: [0.22, 1, 0.36, 1] }}
                    />
                  </div>

                  <dl className="mt-5 divide-y divide-white/10 border-t border-white/10">
                    <div className="flex items-center justify-between gap-4 py-3">
                      <dt className="flex items-center gap-2 text-[13px] text-white/60">
                        <span aria-hidden="true" className="h-2 w-2 shrink-0 rounded-full bg-sealed-bright" />
                        Back to renter
                      </dt>
                      <dd className="money text-[20px] text-white">{renterDisplay}</dd>
                    </div>
                    <div className="flex items-center justify-between gap-4 pt-3">
                      <dt className="flex items-start gap-2 text-[13px] text-white/60">
                        <span aria-hidden="true" className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-[#f87171]" />
                        <span>Paid to landlord (accepted or awarded claims)</span>
                      </dt>
                      <dd className="money shrink-0 text-[20px] text-white">{landlordDisplay}</dd>
                    </div>
                  </dl>
                </section>
              </MotionConfig>

              {/* Plain-language outcome, landing as the count-up finishes. */}
              <MotionConfig reducedMotion="user">
                <motion.div
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.9, duration: 0.35 }}
                  className="flex items-start gap-3 rounded-2xl border-0 bg-sealed/10 p-4"
                >
                  <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-sealed" />
                  <p className="text-[15px] font-medium leading-snug text-foreground">
                    {live.lease.landlordPayout === 0n
                      ? session?.address.toLowerCase() === live.lease.renter.toLowerCase()
                        ? `Nothing was deducted: all ${formatDollars(live.lease.renterPayout)} came back to you.`
                        : `Nothing was deducted: all ${formatDollars(live.lease.renterPayout)} went back to the renter.`
                      : `${formatDollars(live.lease.landlordPayout)} went to the landlord for accepted or awarded claims; ${formatDollars(live.lease.renterPayout)} went back to the renter.`}
                  </p>
                </motion.div>
              </MotionConfig>

              {owedAmount > 0n && (
                <div className="rounded-2xl bg-suggestion/10 p-4 flex flex-wrap items-center justify-between gap-3">
                  <div className="text-[14px]">
                    <span className="font-semibold">
                      {formatDollars(owedAmount)} ready to claim:
                    </span>{" "}
                    a direct transfer could not complete, so your payout was held safely for manual withdrawal.
                  </div>
                  <Button onClick={handleWithdrawOwed} disabled={withdrawing} className="h-12 rounded-2xl max-sm:w-full">
                    {withdrawing ? "Withdrawing…" : "Withdraw payout"}
                  </Button>
                  {withdrawError && (
                    <p className="w-full text-[13px] text-claim" role="alert">
                      {withdrawError}
                    </p>
                  )}
                </div>
              )}

              <div className="flex flex-wrap gap-3">
                <Button
                  variant="secondary"
                  onClick={handleDownloadEvidence}
                  className="h-12 w-full rounded-2xl text-[15px] sm:w-auto"
                >
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
            <CardTitle className="flex items-center gap-2">
              <Receipt className="h-4 w-4 text-accent" />
              Receipt and proof
            </CardTitle>
            <CardDescription>
              Measured Arc Testnet network fees (sponsored for the renter and landlord).
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-5 text-sm">
            <div className="grid grid-cols-2 gap-3 text-[13px]">
              <div className="rounded-2xl bg-muted p-4">
                <div className="text-muted-foreground">Operations recorded</div>
                <div className="money mt-2 text-[20px]">
                  {live.meta?.tx_count || receipts.length}
                </div>
              </div>
              <div className="rounded-2xl bg-muted p-4">
                <div className="text-muted-foreground">Network fees (paid by Keyprint)</div>
                <div className="money mt-2 text-[20px]">
                  {formatNativeUsdcFee(totalGasWei)}
                </div>
              </div>
            </div>

            {receipts.length > 0 && (
              <ul className="relative space-y-4 pl-9">
                <span
                  aria-hidden="true"
                  className="absolute left-[11px] top-3 bottom-3 w-0.5 rounded-full bg-border"
                />
                {receipts.map((r) => (
                  <li key={r.txHash} className="relative">
                    <span
                      aria-hidden="true"
                      className="absolute -left-9 top-0.5 flex h-6 w-6 items-center justify-center rounded-full bg-sealed text-white ring-4 ring-surface"
                    >
                      <Check className="h-3.5 w-3.5" strokeWidth={3} />
                    </span>
                    <div className="text-[15px] font-medium leading-snug text-foreground">{r.label}</div>
                    <a
                      href={explorerTxUrl(r.txHash)}
                      target="_blank"
                      rel="noreferrer"
                      aria-label={`${r.label}: view on the Arc explorer`}
                      className="-my-2 inline-flex min-h-11 items-center gap-1 text-[13px] font-medium text-accent hover:underline"
                    >
                      View on Arc
                      <ExternalLink className="h-3 w-3" />
                    </a>
                  </li>
                ))}
              </ul>
            )}

            <div className="flex items-start gap-2 border-t border-border pt-4 text-[13px] leading-relaxed text-muted-foreground">
              <ShieldCheck className="h-4 w-4 text-sealed shrink-0 mt-0.5" />
              <span>
                Paid out in USDC on Arc according to the lease rules, with no admin key. Every seal&apos;s fingerprint and every payout is recorded there, and anyone can check the downloaded evidence bundle against Arc on the Verify page.
              </span>
            </div>
          </CardContent>
        </Card>
      </div>
    </LeaseShell>
  );
}
