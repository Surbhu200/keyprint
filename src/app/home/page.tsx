"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  ArrowRight,
  Clock,
  Home,
  Plus,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import {
  decodeEventLog,
  encodeFunctionData,
  parseUnits,
  type Address,
  type Hex,
} from "viem";
import { AppNav } from "@/components/AppNav";
import { Countdown } from "@/components/Countdown";
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
  formatDollars,
  getEscrowAddress,
  KEYPRINT_ESCROW_ABI,
  LeaseStateLabel,
  stringToBytes32,
} from "@/lib/chain/arc";
import { friendlyError, readUsdcBalance, sendSponsoredCalls } from "@/lib/chain/wallet";
import { DEFAULT_DEMO_REVIEWER } from "@/lib/sample/reference";
import { cn } from "@/lib/utils";
import type { OnchainLease, StoredLeaseMeta } from "@/components/useLeaseLiveState";

interface EnrichedLease {
  meta: StoredLeaseMeta;
  onchain: OnchainLease | null;
}

export default function HomePage() {
  const session = usePasskeySession();
  const [leases, setLeases] = useState<EnrichedLease[]>([]);
  const [chainNowSec, setChainNowSec] = useState<number>(() =>
    Math.floor(Date.now() / 1000),
  );
  const [loading, setLoading] = useState(true);

  // Create lease form (used by landlord before renter Seal & pay)
  const [showCreate, setShowCreate] = useState(false);
  const [unitName, setUnitName] = useState("Apt 302 · Oak Street");
  const [renterAddr, setRenterAddr] = useState("");
  const [reviewerAddr, setReviewerAddr] = useState(DEFAULT_DEMO_REVIEWER);
  const [depositDollars, setDepositDollars] = useState("200");
  const [windowMinutes, setWindowMinutes] = useState("10");
  const [leaseEndOffsetMin, setLeaseEndOffsetMin] = useState("0");
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [releasingId, setReleasingId] = useState<string | null>(null);
  const [releaseError, setReleaseError] = useState<{ leaseId: string; message: string } | null>(null);
  const [lastCreated, setLastCreated] = useState<{ leaseId: Hex; indexed: boolean } | null>(null);
  const [linkCopied, setLinkCopied] = useState(false);
  const [availableBalance, setAvailableBalance] = useState<bigint | null>(null);
  // One list request at a time, and never show one account's list after switching accounts.
  const loadInFlight = useRef(false);
  const loadAddr = useRef<string | undefined>(undefined);

  useEffect(() => {
    if (!session?.address) return;
    let active = true;
    readUsdcBalance(session.address)
      .then((b) => {
        if (active) setAvailableBalance(b);
      })
      .catch(() => {
        if (active) setAvailableBalance(null);
      });
    return () => {
      active = false;
    };
  }, [session?.address, leases.length]);

  const loadLeases = useCallback(async (addr?: Address, force = false) => {
    loadAddr.current = addr?.toLowerCase();
    if (!addr) {
      // The list is per account; signed out there is nothing to show.
      setLeases([]);
      setLoading(false);
      return;
    }
    if (loadInFlight.current && !force) return;
    loadInFlight.current = true;
    const stillCurrent = () => loadAddr.current === addr.toLowerCase();
    try {
      const res = await fetch(`/api/leases?address=${encodeURIComponent(addr)}`, {
        cache: "no-store",
      });
      if (!res.ok) throw new Error("lease list unavailable");
      const data = (await res.json()) as { leases?: StoredLeaseMeta[] };
      const rows = data.leases ?? [];
      if (!stillCurrent()) return;

      const escrow = getEscrowAddress();
      if (!escrow || rows.length === 0) {
        setLeases(rows.map((meta) => ({ meta, onchain: null })));
        setLoading(false);
        return;
      }

      const client = createArcPublicClient();
      const [block, ...onchainList] = await Promise.all([
        client.getBlock({ blockTag: "latest" }),
        ...rows.map((row) =>
          client
            .readContract({
              address: escrow,
              abi: KEYPRINT_ESCROW_ABI,
              functionName: "getLease",
              args: [row.lease_id as Hex],
            })
            .catch(() => null),
        ),
      ]);

      if (!stillCurrent()) return;
      setChainNowSec(Number(block.timestamp));
      setLeases(
        rows.map((meta, i) => {
          const r = onchainList[i];
          const onchain: OnchainLease | null =
            r && r.landlord !== "0x0000000000000000000000000000000000000000"
              ? {
                  leaseId: r.leaseId,
                  landlord: r.landlord,
                  renter: r.renter,
                  reviewer: r.reviewer,
                  deposit: r.deposit,
                  unitId: r.unitId,
                  leaseEnd: Number(r.leaseEnd),
                  reviewWindow: Number(r.reviewWindow),
                  claimWindow: Number(r.claimWindow),
                  responseWindow: Number(r.responseWindow),
                  resolveWindow: Number(r.resolveWindow),
                  state: Number(r.state),
                  moveInRecordId: r.moveInRecordId,
                  moveOutRecordId: r.moveOutRecordId,
                  fundedAt: Number(r.fundedAt),
                  endedAt: Number(r.endedAt),
                  claimsClosed: r.claimsClosed,
                  activeClaimedTotal: r.activeClaimedTotal,
                  landlordPayout: r.landlordPayout,
                  renterPayout: r.renterPayout,
                }
              : null;
          return { meta, onchain };
        }),
      );
    } catch {
      // Keep last good view on transient network error
    } finally {
      loadInFlight.current = false;
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const addr = session?.address;
    const first = setTimeout(() => {
      void loadLeases(addr);
    }, 0);
    const timer = setInterval(() => {
      void loadLeases(addr);
    }, 2000);
    return () => {
      clearTimeout(first);
      clearInterval(timer);
    };
  }, [loadLeases, session?.address]);

  const totalProtected = leases.reduce((acc, item) => {
    if (item.onchain && (item.onchain.state === 1 || item.onchain.state === 2)) {
      return acc + item.onchain.deposit;
    }
    return acc;
  }, 0n);

  const handleCreateLease = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!session) return;
    setCreateError(null);

    const escrow = getEscrowAddress();
    if (!escrow) {
      setCreateError("Escrow contract address is not configured yet.");
      return;
    }
    const renter = renterAddr.trim();
    const reviewer = reviewerAddr.trim();
    const me = session.address.toLowerCase();
    if (!/^0x[0-9a-fA-F]{40}$/.test(renter)) {
      setCreateError("Enter the renter's account ID from their Details drawer.");
      return;
    }
    if (!/^0x[0-9a-fA-F]{40}$/.test(reviewer)) {
      setCreateError("Enter an independent reviewer account ID.");
      return;
    }
    if (renter.toLowerCase() === me) {
      setCreateError("The renter has to be a different account than yours.");
      return;
    }
    if (reviewer.toLowerCase() === me || reviewer.toLowerCase() === renter.toLowerCase()) {
      setCreateError("The reviewer can't be you or the renter.");
      return;
    }
    const depositNum = Number(depositDollars);
    const windowNum = Number(windowMinutes);
    const endOffsetNum = Number(leaseEndOffsetMin);
    if (!Number.isFinite(depositNum) || depositNum <= 0) {
      setCreateError("Enter a deposit above $0.");
      return;
    }
    if (!Number.isFinite(windowNum) || windowNum < 1) {
      setCreateError("Each window has to be at least 1 minute.");
      return;
    }
    if (!Number.isFinite(endOffsetNum) || endOffsetNum < 0) {
      setCreateError("The lease end can't be in the past.");
      return;
    }

    setCreating(true);
    setLastCreated(null);
    try {
      const unitId = stringToBytes32(`${unitName}-${Date.now()}`);
      const deposit = parseUnits(String(depositNum), 6);
      const winSec = BigInt(Math.max(60, Math.round(windowNum * 60)));
      // Deadlines are judged by Arc's clock, so start from the latest block, not this device.
      const latest = await createArcPublicClient().getBlock({ blockTag: "latest" });
      const leaseEnd = latest.timestamp + BigInt(Math.round(endOffsetNum * 60));

      const data = encodeFunctionData({
        abi: KEYPRINT_ESCROW_ABI,
        functionName: "createLease",
        args: [
          {
            renter: renter as Address,
            reviewer: reviewer as Address,
            deposit,
            unitId,
            leaseEnd,
            reviewWindow: winSec,
            claimWindow: winSec,
            responseWindow: winSec,
            resolveWindow: winSec,
          },
        ],
      });

      const op = await sendSponsoredCalls(session, [{ to: escrow, data }]);

      // Parse LeaseCreated event from receipt to get the exact onchain leaseId
      const client = createArcPublicClient();
      const receipt = await client.getTransactionReceipt({ hash: op.txHash });
      let createdLeaseId: Hex | null = null;
      for (const log of receipt.logs) {
        if (log.address.toLowerCase() !== escrow.toLowerCase()) continue;
        try {
          const parsed = decodeEventLog({
            abi: KEYPRINT_ESCROW_ABI,
            data: log.data,
            topics: log.topics,
          });
          if (parsed.eventName === "LeaseCreated") {
            createdLeaseId = parsed.args.leaseId;
            break;
          }
        } catch {
          // Ignore non-matching logs
        }
      }

      if (!createdLeaseId) {
        throw new Error("Lease was submitted, but LeaseCreated log was not found.");
      }

      // Parties and unit are read from Arc by the server; the body only names the lease.
      const indexRes = await fetch("/api/leases", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          lease_id: createdLeaseId,
          unit_name: unitName.trim() || "Apartment",
          created_tx_hash: op.txHash,
        }),
      }).catch(() => null);

      setShowCreate(false);
      setLinkCopied(false);
      setLastCreated({ leaseId: createdLeaseId, indexed: Boolean(indexRes?.ok) });
      await loadLeases(session.address, true);
    } catch (err) {
      setCreateError(friendlyError(err, "The lease wasn't created. Nothing was sent."));
    } finally {
      setCreating(false);
    }
  };

  const handleManualRelease = async (leaseId: Hex) => {
    if (!session) return;
    const escrow = getEscrowAddress();
    if (!escrow) return;
    setReleasingId(leaseId);
    setReleaseError(null);
    try {
      const data = encodeFunctionData({
        abi: KEYPRINT_ESCROW_ABI,
        functionName: "settle",
        args: [leaseId],
      });
      const op = await sendSponsoredCalls(session, [{ to: escrow, data }]);
      await fetch(`/api/leases/${encodeURIComponent(leaseId)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          settled_tx_hash: op.txHash,
          add_gas_cost_wei: op.actualGasCost.toString(),
          add_tx_count: 1,
        }),
      }).catch(() => null);
      await loadLeases(session.address, true);
    } catch (err) {
      setReleaseError({
        leaseId,
        message: friendlyError(err, "The deposit wasn't released yet. Try again in a moment."),
      });
    } finally {
      setReleasingId(null);
    }
  };

  const shareLink = lastCreated
    ? `${typeof window !== "undefined" ? window.location.origin : ""}/lease/${lastCreated.leaseId}/capture`
    : "";

  return (
    <div className="min-h-screen flex flex-col">
      <AppNav />

      <main className="flex-1 mx-auto w-full max-w-5xl px-5 py-8 space-y-6">
        {/* Hero deposit card */}
        <Card className="border-sealed/20 bg-surface">
          <CardContent className="p-6 sm:p-8 flex flex-col sm:flex-row sm:items-center justify-between gap-6">
            <div className="space-y-1.5">
              <div className="inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-sealed">
                <ShieldCheck className="h-4 w-4" />
                <span>Protected Deposits</span>
              </div>
              <div className="text-4xl font-semibold tracking-tight flex flex-wrap items-baseline gap-3">
                <span>
                  {formatDollars(totalProtected)}{" "}
                  <span className="text-lg font-normal text-muted-foreground">
                    protected
                  </span>
                </span>
                {session && availableBalance !== null && (
                  <Badge variant="default" className="text-xs font-medium">
                    {formatDollars(availableBalance)} available
                  </Badge>
                )}
              </div>
              <p className="text-sm text-muted-foreground">
                {session
                  ? `Signed in as ${session.username}. Neither your landlord nor Keyprint can move protected funds outside the lease rules.`
                  : "Sign in with your passkey to protect a deposit or seal a solo move-in scan."}
              </p>
            </div>

            <div className="flex flex-wrap gap-2.5">
              <Link
                href="/unit/new"
                className={cn(buttonVariants({ variant: "default" }))}
              >
                <Sparkles className="h-4 w-4" />
                Start solo scan
              </Link>
              {session && (
                <Button
                  variant="secondary"
                  onClick={() => setShowCreate((v) => !v)}
                >
                  <Plus className="h-4 w-4" />
                  New lease (landlord)
                </Button>
              )}
              {!session && (
                <Link
                  href="/start"
                  className={cn(buttonVariants({ variant: "secondary" }))}
                >
                  Sign in
                </Link>
              )}
            </div>
          </CardContent>
        </Card>

        {showCreate && session && (
          <Card>
            <CardHeader>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <CardTitle>Create a protected lease</CardTitle>
                  <CardDescription>
                    Propose the deposit, deadlines, and independent reviewer. Your renter sees every term before paying.
                  </CardDescription>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      setUnitName("Lease A · Apt 302");
                      setDepositDollars("200");
                      setWindowMinutes("10");
                      setLeaseEndOffsetMin("0");
                    }}
                  >
                    Demo A: full flow ($200 · 10-min windows)
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      setUnitName("Lease B · Apt 404 (no-claim refund)");
                      setDepositDollars("100");
                      setWindowMinutes("1");
                      setLeaseEndOffsetMin("0");
                    }}
                  >
                    Demo B: no-claim refund ($100 · 1-min windows)
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleCreateLease} className="space-y-4">
                <div className="grid sm:grid-cols-2 gap-4">
                  <label className="space-y-1 text-xs font-medium block">
                    <span>Apartment name</span>
                    <input
                      type="text"
                      required
                      value={unitName}
                      onChange={(e) => setUnitName(e.target.value)}
                      className="w-full h-10 rounded-lg border border-border bg-background px-3 text-sm"
                    />
                  </label>
                  <label className="space-y-1 text-xs font-medium block">
                    <span>Security deposit ($)</span>
                    <input
                      type="number"
                      min="1"
                      step="1"
                      required
                      value={depositDollars}
                      onChange={(e) => setDepositDollars(e.target.value)}
                      className="w-full h-10 rounded-lg border border-border bg-background px-3 text-sm"
                    />
                  </label>
                  <label className="space-y-1 text-xs font-medium block">
                    <span>Renter account ID (from their Details drawer)</span>
                    <input
                      type="text"
                      required
                      value={renterAddr}
                      onChange={(e) => setRenterAddr(e.target.value)}
                      placeholder="Paste renter account ID"
                      className="w-full h-10 rounded-lg border border-border bg-background px-3 text-sm font-mono"
                    />
                  </label>
                  <label className="space-y-1 text-xs font-medium block">
                    <span>Dispute reviewer account ID (prefilled with the demo reviewer)</span>
                    <input
                      type="text"
                      required
                      value={reviewerAddr}
                      onChange={(e) => setReviewerAddr(e.target.value)}
                      placeholder="Paste neutral reviewer ID"
                      className="w-full h-10 rounded-lg border border-border bg-background px-3 text-sm font-mono"
                    />
                  </label>
                  <label className="space-y-1 text-xs font-medium block">
                    <span>Claim / response / review windows (minutes, min 1)</span>
                    <input
                      type="number"
                      min="1"
                      required
                      value={windowMinutes}
                      onChange={(e) => setWindowMinutes(e.target.value)}
                      className="w-full h-10 rounded-lg border border-border bg-background px-3 text-sm"
                    />
                  </label>
                  <label className="space-y-1 text-xs font-medium block">
                    <span>Lease ends in (minutes from now; 0 = move-out allowed right away)</span>
                    <input
                      type="number"
                      min="0"
                      required
                      value={leaseEndOffsetMin}
                      onChange={(e) => setLeaseEndOffsetMin(e.target.value)}
                      className="w-full h-10 rounded-lg border border-border bg-background px-3 text-sm"
                    />
                  </label>
                </div>

                {createError && (
                  <p className="text-xs text-claim">{createError}</p>
                )}

                <div className="flex items-center gap-2">
                  <Button type="submit" disabled={creating}>
                    {creating ? "Creating lease…" : "Create lease with one touch"}
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={() => setShowCreate(false)}
                  >
                    Cancel
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>
        )}

        {lastCreated && (
          <Card className="border-sealed/25">
            <CardContent className="p-5 space-y-2.5 text-sm">
              <p className="font-medium">Lease created.</p>
              <p className="text-muted-foreground">
                Send this link to your renter. They&apos;ll see every term before paying the deposit.
              </p>
              <div className="flex flex-wrap items-center gap-2">
                <code className="flex-1 min-w-0 truncate rounded-md border border-border bg-muted/50 px-2.5 py-1.5 text-xs">
                  {shareLink}
                </code>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    void navigator.clipboard
                      ?.writeText(shareLink)
                      .then(() => setLinkCopied(true))
                      .catch(() => setLinkCopied(false));
                  }}
                >
                  {linkCopied ? "Copied" : "Copy link"}
                </Button>
                <Link
                  href={`/lease/${lastCreated.leaseId}/capture`}
                  className={cn(buttonVariants({ size: "sm" }))}
                >
                  Open lease
                </Link>
              </div>
              {!lastCreated.indexed && (
                <p className="text-xs text-muted-foreground">
                  It may take a moment to show up in your list below. The link works now.
                </p>
              )}
            </CardContent>
          </Card>
        )}

        {/* Leases list */}
        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold tracking-tight">Your apartments</h2>
            <Link
              href="/sample"
              className="text-xs font-medium text-accent hover:underline"
            >
              View sample apartment
            </Link>
          </div>

          {!session ? (
            <Card>
              <CardContent className="p-8 text-center space-y-3">
                <p className="text-sm font-medium">Sign in to see your apartments.</p>
                <p className="text-xs text-muted-foreground max-w-sm mx-auto">
                  Your leases and sealed scans are listed by your passkey account.
                </p>
                <div className="flex justify-center gap-2 pt-1">
                  <Link href="/start" className={cn(buttonVariants({ size: "sm" }))}>
                    Sign in
                  </Link>
                  <Link
                    href="/sample"
                    className={cn(buttonVariants({ variant: "secondary", size: "sm" }))}
                  >
                    See a sample apartment
                  </Link>
                </div>
              </CardContent>
            </Card>
          ) : loading ? (
            <Card>
              <CardContent className="p-8 text-center text-sm text-muted-foreground">
                Loading apartments…
              </CardContent>
            </Card>
          ) : leases.length === 0 ? (
            <Card>
              <CardContent className="p-8 text-center space-y-3">
                <div className="mx-auto inline-flex h-11 w-11 items-center justify-center rounded-xl bg-muted text-muted-foreground">
                  <Home className="h-5 w-5" />
                </div>
                <p className="text-sm font-medium">No leases yet.</p>
                <p className="text-xs text-muted-foreground max-w-sm mx-auto">
                  Seal a solo apartment scan with no landlord needed, or look around the sample apartment.
                </p>
                <div className="flex justify-center gap-2 pt-1">
                  <Link href="/unit/new" className={cn(buttonVariants({ size: "sm" }))}>
                    Start solo scan
                  </Link>
                  <Link
                    href="/sample"
                    className={cn(buttonVariants({ variant: "secondary", size: "sm" }))}
                  >
                    See sample apartment
                  </Link>
                </div>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-4">
              {leases.map(({ meta, onchain }) => {
                const state = onchain?.state ?? 0;
                const role =
                  session && onchain
                    ? session.address.toLowerCase() === onchain.renter.toLowerCase()
                      ? "Renter"
                      : session.address.toLowerCase() === onchain.landlord.toLowerCase()
                        ? "Landlord"
                        : "Viewer"
                    : null;

                const nextHref =
                  state === 0
                    ? `/lease/${meta.lease_id}/capture`
                    : state === 1
                      ? role === "Landlord"
                        ? `/lease/${meta.lease_id}/review`
                        : `/lease/${meta.lease_id}/room`
                      : state === 2
                        ? `/lease/${meta.lease_id}/claims`
                        : `/lease/${meta.lease_id}/settle`;

                // The "nothing filed, money comes back" clock only applies while no claims are open.
                const claimDeadline =
                  onchain &&
                  state === 2 &&
                  !onchain.claimsClosed &&
                  onchain.activeClaimedTotal === 0n
                    ? onchain.endedAt + onchain.claimWindow
                    : null;
                const hasOpenClaims =
                  onchain !== null && state === 2 && onchain.activeClaimedTotal > 0n;

                return (
                  <Card key={meta.lease_id}>
                    <CardContent className="p-6 space-y-4">
                      <div className="flex flex-wrap items-start justify-between gap-4">
                        <div className="space-y-1">
                          <div className="flex items-center gap-2">
                            <h3 className="text-lg font-semibold">{meta.unit_name}</h3>
                            {role && <Badge variant="accent">{role}</Badge>}
                            {onchain && (
                              <Badge
                                variant={
                                  state === 3
                                    ? "sealed"
                                    : state === 2
                                      ? "suggestion"
                                      : "default"
                                }
                              >
                                {
                                  LeaseStateLabel[
                                    state as keyof typeof LeaseStateLabel
                                  ]
                                }
                              </Badge>
                            )}
                          </div>
                          <p className="text-sm text-muted-foreground">
                            {onchain
                              ? state === 3
                                ? `${formatDollars(onchain.renterPayout)} returned to renter · ${formatDollars(onchain.landlordPayout)} paid to landlord`
                                : `${formatDollars(onchain.deposit)} deposit`
                              : "Waiting for live status"}
                          </p>
                        </div>

                        <Link
                          href={nextHref}
                          className={cn(buttonVariants({ variant: "default", size: "sm" }))}
                        >
                          Open apartment
                          <ArrowRight className="h-3.5 w-3.5" />
                        </Link>
                      </div>

                      {claimDeadline && onchain && (
                        <Countdown
                          deadlineSec={claimDeadline}
                          chainNowSec={chainNowSec}
                          leaseId={meta.lease_id}
                          activeMessage={
                            role === "Landlord"
                              ? `You have until the clock hits zero to file claims. If you file none, the full ${formatDollars(onchain.deposit)} goes back to your renter.`
                              : role === "Renter"
                                ? `Your landlord has until the clock hits zero to file claims. If nothing is filed, your ${formatDollars(onchain.deposit)} comes back.`
                                : `The landlord has until the clock hits zero to file claims. If nothing is filed, the ${formatDollars(onchain.deposit)} goes back to the renter.`
                          }
                          expiredMessage={
                            role === "Renter"
                              ? `No claims were filed in time. Your full ${formatDollars(onchain.deposit)} can come back now.`
                              : `No claims were filed in time. The full ${formatDollars(onchain.deposit)} can go back to the renter now.`
                          }
                          onManualRelease={
                            session ? () => handleManualRelease(meta.lease_id as Hex) : undefined
                          }
                          manualReleaseLabel={role === "Renter" ? "Release my deposit" : "Release the deposit"}
                          releasing={releasingId === meta.lease_id}
                          onKeeperSettled={() => loadLeases(session?.address, true)}
                        />
                      )}

                      {hasOpenClaims && onchain && (
                        <div className="rounded-xl border border-claim/25 bg-claim/5 px-4 py-3 text-sm flex flex-wrap items-center justify-between gap-2">
                          <span>
                            {formatDollars(onchain.activeClaimedTotal)} in claims filed. The deposit settles once each claim is answered or its deadline passes.
                          </span>
                          <Link
                            href={`/lease/${meta.lease_id}/claims`}
                            className="text-xs font-medium text-accent hover:underline"
                          >
                            See claims
                          </Link>
                        </div>
                      )}

                      {releaseError?.leaseId === meta.lease_id && (
                        <p className="text-xs text-claim">{releaseError.message}</p>
                      )}

                      {state === 3 && onchain && onchain.landlordPayout === 0n && (
                        <div className="rounded-xl border border-sealed/25 bg-sealed/5 px-4 py-3 text-sm text-sealed flex items-center gap-2 font-medium">
                          <Clock className="h-4 w-4" />
                          <span>
                            {formatDollars(onchain.renterPayout)} went back to the renter. Nothing was deducted.
                          </span>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
