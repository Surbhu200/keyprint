"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  ChevronRight,
  Clock,
  Home,
  Plus,
  ScanFace,
  ShieldCheck,
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
        <section className="vault p-6 sm:p-8 motion-safe:animate-rise">
          <div className="relative flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between">
            <div className="space-y-3">
              <div className="eyebrow inline-flex items-center gap-1.5 text-white/60">
                <ShieldCheck className="h-4 w-4 text-sealed-bright" />
                <span>Protected deposits</span>
              </div>
              {session ? (
                <div className="space-y-2">
                  <div className="money text-[52px] sm:text-[64px] text-white">
                    {formatDollars(totalProtected)}
                  </div>
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
                    <span className="text-[15px] text-white/65">protected</span>
                    {availableBalance !== null && (
                      <span className="rounded-full bg-white/10 px-3 py-1 text-[13px] font-medium text-white/85 tabular-nums">
                        {formatDollars(availableBalance)} available
                      </span>
                    )}
                  </div>
                </div>
              ) : (
                <h1 className="max-w-[18ch] font-display text-[34px] leading-[1.05] font-semibold tracking-[-0.03em] text-white text-balance sm:text-[44px]">
                  Seal your <span className="whitespace-nowrap">move-in</span> in one touch
                </h1>
              )}
              <p className="max-w-[46ch] text-[14px] leading-relaxed text-white/60">
                {session
                  ? `Signed in as ${session.username}. Neither your landlord nor Keyprint can move protected funds outside the lease rules.`
                  : "Sign in with your passkey to protect a deposit or seal a solo move-in scan."}
              </p>
            </div>

            <div className="grid gap-2 sm:flex sm:shrink-0 sm:flex-wrap sm:justify-end">
              <Link
                href="/unit/new"
                className="inline-flex h-12 items-center justify-center gap-2 rounded-2xl bg-white px-5 text-[15px] font-semibold text-ink transition-[transform,background-color] duration-100 hover:bg-white/90 motion-safe:active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70"
              >
                <ScanFace className="h-4 w-4" />
                Start solo scan
              </Link>
              {session && (
                <Button
                  variant="secondary"
                  className="h-12 w-full rounded-2xl border-0 bg-white/10 px-5 text-[15px] text-white shadow-none ring-0 hover:bg-white/15 sm:w-auto"
                  onClick={() => setShowCreate((v) => !v)}
                >
                  <Plus className="h-4 w-4" />
                  New lease (landlord)
                </Button>
              )}
              {!session && (
                <Link
                  href="/start"
                  className={cn(
                    buttonVariants({ variant: "secondary" }),
                    "h-12 w-full rounded-2xl border-0 bg-white/10 px-5 text-[15px] text-white shadow-none ring-0 hover:bg-white/15 sm:w-auto",
                  )}
                >
                  Sign in
                </Link>
              )}
            </div>
          </div>
        </section>

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
                <div className="grid w-full gap-2 sm:flex sm:w-auto sm:flex-wrap sm:gap-1.5">
                  <Button
                    type="button"
                    variant="outline"
                    className="h-auto min-h-11 w-full justify-start whitespace-normal rounded-full border-0 bg-surface px-4 py-2 text-left text-[14px] font-medium leading-snug ring-1 ring-border hover:bg-muted sm:min-h-10 sm:w-auto"
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
                    variant="outline"
                    className="h-auto min-h-11 w-full justify-start whitespace-normal rounded-full border-0 bg-surface px-4 py-2 text-left text-[14px] font-medium leading-snug ring-1 ring-border hover:bg-muted sm:min-h-10 sm:w-auto"
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
                  <label className="space-y-1.5 text-[13px] font-medium block text-muted-foreground">
                    <span>Apartment name</span>
                    <input
                      type="text"
                      required
                      value={unitName}
                      onChange={(e) => setUnitName(e.target.value)}
                      className="w-full h-12 rounded-2xl border-0 bg-muted px-4 text-[16px] text-foreground focus:outline-none focus:ring-2 focus:ring-accent"
                    />
                  </label>
                  <label className="space-y-1.5 text-[13px] font-medium block text-muted-foreground">
                    <span>Security deposit ($)</span>
                    <input
                      type="number"
                      min="1"
                      step="1"
                      required
                      value={depositDollars}
                      onChange={(e) => setDepositDollars(e.target.value)}
                      className="w-full h-12 rounded-2xl border-0 bg-muted px-4 text-[16px] text-foreground focus:outline-none focus:ring-2 focus:ring-accent"
                    />
                  </label>
                  <label className="space-y-1.5 text-[13px] font-medium block text-muted-foreground">
                    <span>Renter account ID (from their Details drawer)</span>
                    <input
                      type="text"
                      required
                      value={renterAddr}
                      onChange={(e) => setRenterAddr(e.target.value)}
                      placeholder="Paste renter account ID"
                      autoCapitalize="none"
                      autoCorrect="off"
                      spellCheck={false}
                      className="w-full h-12 rounded-2xl border-0 bg-muted px-4 text-[16px] text-foreground font-mono focus:outline-none focus:ring-2 focus:ring-accent"
                    />
                  </label>
                  <label className="space-y-1.5 text-[13px] font-medium block text-muted-foreground">
                    <span>Dispute reviewer account ID (prefilled with the demo reviewer)</span>
                    <input
                      type="text"
                      required
                      value={reviewerAddr}
                      onChange={(e) => setReviewerAddr(e.target.value)}
                      placeholder="Paste neutral reviewer ID"
                      autoCapitalize="none"
                      autoCorrect="off"
                      spellCheck={false}
                      className="w-full h-12 rounded-2xl border-0 bg-muted px-4 text-[16px] text-foreground font-mono focus:outline-none focus:ring-2 focus:ring-accent"
                    />
                  </label>
                  <label className="space-y-1.5 text-[13px] font-medium block text-muted-foreground">
                    <span>Claim / response / review windows (minutes, min 1)</span>
                    <input
                      type="number"
                      min="1"
                      required
                      value={windowMinutes}
                      onChange={(e) => setWindowMinutes(e.target.value)}
                      className="w-full h-12 rounded-2xl border-0 bg-muted px-4 text-[16px] text-foreground focus:outline-none focus:ring-2 focus:ring-accent"
                    />
                  </label>
                  <label className="space-y-1.5 text-[13px] font-medium block text-muted-foreground">
                    <span>Lease ends in (minutes from now; 0 = move-out allowed right away)</span>
                    <input
                      type="number"
                      min="0"
                      required
                      value={leaseEndOffsetMin}
                      onChange={(e) => setLeaseEndOffsetMin(e.target.value)}
                      className="w-full h-12 rounded-2xl border-0 bg-muted px-4 text-[16px] text-foreground focus:outline-none focus:ring-2 focus:ring-accent"
                    />
                  </label>
                </div>

                {createError && (
                  <p className="text-[13px] text-claim">{createError}</p>
                )}

                <div className="flex flex-col-reverse gap-2 sm:flex-row sm:items-center">
                  <Button type="submit" disabled={creating} className="h-12 w-full rounded-2xl px-6 text-[15px] sm:w-auto">
                    {creating ? "Creating lease…" : "Create lease with one touch"}
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    className="h-12 w-full rounded-2xl sm:w-auto"
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
                {/* Phones: the link gets its own row and the two buttons split the next one. */}
                <code className="flex-1 basis-full sm:basis-0 min-w-0 truncate rounded-md border border-border bg-muted/50 px-2.5 py-1.5 text-xs">
                  {shareLink}
                </code>
                <Button
                  type="button"
                  variant="outline"
                  className="flex-1 sm:flex-none"
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
                  className={cn(buttonVariants(), "flex-1 sm:flex-none")}
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
            <h2 className="text-[20px] font-semibold tracking-[-0.01em]">Your apartments</h2>
            <Link
              href="/sample"
              className="inline-flex min-h-11 items-center text-[13px] font-medium text-accent hover:underline"
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
            <div role="status" className="space-y-4">
              <span className="sr-only">Loading apartments…</span>
              {[0, 1].map((i) => (
                <div
                  key={i}
                  className="card-soft space-y-3 p-6"
                >
                  <div className="h-5 w-1/2 rounded-md bg-muted motion-safe:animate-pulse" />
                  <div className="h-4 w-1/3 rounded-md bg-muted motion-safe:animate-pulse" />
                  <div className="h-11 w-full rounded-lg bg-muted motion-safe:animate-pulse sm:w-40" />
                </div>
              ))}
            </div>
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

                const railClass =
                  state === 3
                    ? "bg-sealed"
                    : state === 2
                      ? "bg-suggestion"
                      : state === 1
                        ? "bg-accent"
                        : "bg-border";

                return (
                  <Card
                    key={meta.lease_id}
                    className="relative overflow-hidden card-soft motion-safe:animate-rise"
                  >
                    <span
                      aria-hidden="true"
                      className={cn("absolute inset-y-0 left-0 w-1", railClass)}
                    />
                    <CardContent className="p-5 pl-6 sm:p-6 sm:pl-7 space-y-4">
                      <div className="flex flex-wrap items-start justify-between gap-4">
                        <div className="space-y-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <h3 className="text-[17px] font-semibold tracking-[-0.01em]">{meta.unit_name}</h3>
                            {role && (
                              <Badge variant="accent" className="whitespace-nowrap">
                                {role}
                              </Badge>
                            )}
                            {onchain && (
                              <Badge
                                className="whitespace-nowrap"
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
                            {onchain ? (
                              state === 3 ? (
                                `${formatDollars(onchain.renterPayout)} returned to renter · ${formatDollars(onchain.landlordPayout)} paid to landlord`
                              ) : (
                                <span className="inline-flex items-baseline gap-1.5 pt-1">
                                  <span className="money text-[22px] text-foreground">
                                    {formatDollars(onchain.deposit)}
                                  </span>
                                  <span>deposit</span>
                                </span>
                              )
                            ) : (
                              "Waiting for live status"
                            )}
                          </p>
                        </div>

                        <Link
                          href={nextHref}
                          className={cn(
                            buttonVariants({ variant: "default" }),
                            "h-12 rounded-2xl bg-foreground px-5 text-[15px] text-background hover:bg-foreground/90 max-sm:w-full",
                          )}
                        >
                          Open apartment
                          <ChevronRight className="h-4 w-4" />
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
