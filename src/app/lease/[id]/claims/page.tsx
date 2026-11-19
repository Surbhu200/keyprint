"use client";

import { use, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { encodeFunctionData, parseUnits, type Hex } from "viem";
import {
  AlertTriangle,
  CheckCircle2,
  DollarSign,
  Plus,
  ShieldAlert,
  Trash2,
} from "lucide-react";
import { LeaseShell } from "@/components/LeaseShell";
import { Countdown } from "@/components/Countdown";
import { useLeaseLiveState } from "@/components/useLeaseLiveState";
import { RoomViewer, type SurfaceTapEvent } from "@/components/three/RoomViewer";
import type { SpatialPinItem } from "@/components/three/PinMarker";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { findMatchingMoveInPin, type MoveInPinRef } from "@/lib/ai/matching";
import {
  ClaimStateLabel,
  formatDollars,
  getEscrowAddress,
  KEYPRINT_ESCROW_ABI,
  RecordKind,
} from "@/lib/chain/arc";
import {
  buildUnsealedRegistryCalls,
  loadSavedSession,
  sendSponsoredCalls,
  type SavedPasskeySession,
} from "@/lib/chain/wallet";
import {
  canonicalizeAndHash,
  ZERO_BYTES32,
  type ClaimManifestV1,
  type PinManifestV1,
} from "@/lib/evidence/manifest";
import { REFERENCE_MOVE_IN_URL, REFERENCE_SPOTS } from "@/lib/sample/reference";
import { cn } from "@/lib/utils";

interface DraftClaimPin {
  id: string;
  position: [number, number, number];
  normal: [number, number, number];
  title: string;
  dollars: string;
}

export default function LeaseClaimsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: leaseId } = use(params);
  const live = useLeaseLiveState(leaseId);
  const [session, setSession] = useState<SavedPasskeySession | null>(null);

  // Landlord claim composer
  const [draftClaims, setDraftClaims] = useState<DraftClaimPin[]>([]);
  const [pendingTap, setPendingTap] = useState<SurfaceTapEvent | null>(null);
  const [claimTitle, setClaimTitle] = useState("Dark stain on carpet");
  const [claimDollars, setClaimDollars] = useState("40");

  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [flyTo, setFlyTo] = useState<{
    position: [number, number, number];
    normal?: [number, number, number];
    nonce: number;
  } | null>(null);

  useEffect(() => {
    setSession(loadSavedSession());
  }, []);

  const isLandlord =
    session &&
    live.lease &&
    session.address.toLowerCase() === live.lease.landlord.toLowerCase();
  const isRenter =
    session &&
    live.lease &&
    session.address.toLowerCase() === live.lease.renter.toLowerCase();

  // Move-in pins (only pins sealed in reviewWindow or co-signed count as move-in evidence)
  const moveInPins: MoveInPinRef[] = useMemo(() => {
    return live.records
      .filter((r) => r.kind === RecordKind.Pin)
      .map((r) => {
        try {
          const m = JSON.parse(r.manifest_json) as PinManifestV1;
          const sealedSec = Math.floor(new Date(r.sealed_at).getTime() / 1000);
          const coSigned = (live.coSignedMap[r.record_id.toLowerCase()] || 0) > 0;
          const inWindow =
            live.lease && live.lease.fundedAt > 0
              ? sealedSec <= live.lease.fundedAt + live.lease.reviewWindow
              : true;
          return {
            id: r.record_id,
            position: m.position,
            sealedAt: sealedSec,
            coSigned,
            text: m.text,
            countsAsMoveIn: Boolean(coSigned || inWindow),
          };
        } catch {
          return null;
        }
      })
      .filter((x): x is MoveInPinRef => x !== null);
  }, [live.records, live.coSignedMap, live.lease]);

  // Map onchain claims (source of truth: KeyprintEscrow.getClaims) to keyprint.claim.v1 manifests
  const claimCards = useMemo(() => {
    return live.claims.map((c) => {
      const rec = live.records.find(
        (r) => r.record_id.toLowerCase() === c.evidenceRecordId.toLowerCase(),
      );
      let manifest: ClaimManifestV1 | null = null;
      if (rec) {
        try {
          const parsed = JSON.parse(rec.manifest_json) as ClaimManifestV1;
          if (
            parsed.type === "keyprint.claim.v1" &&
            Array.isArray(parsed.position) &&
            parsed.amount === c.amount.toString()
          ) {
            manifest = parsed;
          }
        } catch {
          manifest = null;
        }
      }

      const matchedMoveInPin = manifest
        ? findMatchingMoveInPin({
            worldPosition: manifest.position,
            moveInPins,
          })
        : null;

      return {
        claim: c,
        manifest,
        isPricedPin: Boolean(manifest),
        matchedMoveInPin,
      };
    });
  }, [live.claims, live.records, moveInPins]);

  const canFileMore =
    Boolean(isLandlord) &&
    live.lease?.state === 2 &&
    !live.lease.claimsClosed &&
    live.chainNowSec <= live.lease.endedAt + live.lease.claimWindow;

  const handleStageClaim = () => {
    if (!pendingTap || !claimTitle.trim() || Number(claimDollars) < 1) return;
    setDraftClaims((prev) => [
      ...prev,
      {
        id: `draft-${Date.now()}`,
        position: pendingTap.point,
        normal: pendingTap.normal,
        title: claimTitle.trim(),
        dollars: claimDollars,
      },
    ]);
    setPendingTap(null);
    setClaimTitle("");
    setClaimDollars("");
  };

  // Prompt 4 (batched): seal ClaimEvidence × N + fileClaim × N + closeClaims
  const handleFileClaimsAndClose = async () => {
    if (!session || !live.lease || draftClaims.length === 0) return;
    const escrow = getEscrowAddress();
    if (!escrow) return;

    setError(null);
    setBusy("Preparing priced-pin evidence…");
    try {
      const alignmentRecordId =
        (live.meta?.alignment_record_id as Hex | null) || ZERO_BYTES32;
      const prepared: Array<{
        canonicalJson: string;
        contentHash: Hex;
        amount6: bigint;
      }> = [];

      for (const d of draftClaims) {
        const amount6 = parseUnits(d.dollars, 6);
        const manifest: ClaimManifestV1 = {
          type: "keyprint.claim.v1",
          leaseId: leaseId as Hex,
          alignmentRecordId,
          position: d.position,
          normal: d.normal,
          amount: amount6.toString(),
          title: d.title,
          photoSha256: null,
        };
        const canon = await canonicalizeAndHash(manifest);
        prepared.push({
          canonicalJson: canon.canonicalJson,
          contentHash: canon.contentHash,
          amount6,
        });
      }

      const { calls: sealCalls, recordIds } = await buildUnsealedRegistryCalls(
        session.address,
        prepared.map((p) => ({
          unitId: live.lease!.unitId,
          leaseId: leaseId as Hex,
          kind: RecordKind.ClaimEvidence,
          contentHash: p.contentHash,
        })),
      );

      const fileCalls = prepared.map((p, i) => ({
        to: escrow,
        data: encodeFunctionData({
          abi: KEYPRINT_ESCROW_ABI,
          functionName: "fileClaim",
          args: [leaseId as Hex, recordIds[i], p.amount6],
        }),
      }));

      const closeCall = {
        to: escrow,
        data: encodeFunctionData({
          abi: KEYPRINT_ESCROW_ABI,
          functionName: "closeClaims",
          args: [leaseId as Hex],
        }),
      };

      setBusy("Confirm with one touch to file priced claims & close window…");
      const op = await sendSponsoredCalls(session, [
        ...sealCalls,
        ...fileCalls,
        closeCall,
      ]);

      await Promise.all([
        ...prepared.map((p, i) =>
          fetch("/api/records", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              record_id: recordIds[i],
              unit_id: live.lease!.unitId,
              lease_id: leaseId,
              kind: RecordKind.ClaimEvidence,
              content_hash: p.contentHash,
              author: session.address,
              manifest_json: p.canonicalJson,
              tx_hash: op.txHash,
              block_number: Number(op.blockNumber),
              gas_cost_wei: i === 0 ? op.actualGasCost.toString() : "0",
            }),
          }),
        ),
        fetch(`/api/leases/${encodeURIComponent(leaseId)}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            add_gas_cost_wei: op.actualGasCost.toString(),
            add_tx_count: 1,
          }),
        }),
      ]).catch(() => null);

      setDraftClaims([]);
      await live.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not file claims.");
    } finally {
      setBusy(null);
    }
  };

  // Prompt 5: Renter Dispute
  const handleDispute = async (claimId: bigint) => {
    if (!session) return;
    const escrow = getEscrowAddress();
    if (!escrow) return;
    setError(null);
    setBusy("Disputing claim…");
    try {
      const op = await sendSponsoredCalls(session, [
        {
          to: escrow,
          data: encodeFunctionData({
            abi: KEYPRINT_ESCROW_ABI,
            functionName: "disputeClaim",
            args: [claimId],
          }),
        },
      ]);
      await fetch(`/api/leases/${encodeURIComponent(leaseId)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          add_gas_cost_wei: op.actualGasCost.toString(),
          add_tx_count: 1,
        }),
      }).catch(() => null);
      await live.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not dispute claim.");
    } finally {
      setBusy(null);
    }
  };

  // Prompt 6: Landlord Withdraw (works on Pending or Disputed claims!)
  const handleWithdraw = async (claimId: bigint) => {
    if (!session) return;
    const escrow = getEscrowAddress();
    if (!escrow) return;
    setError(null);
    setBusy("Withdrawing claim…");
    try {
      const op = await sendSponsoredCalls(session, [
        {
          to: escrow,
          data: encodeFunctionData({
            abi: KEYPRINT_ESCROW_ABI,
            functionName: "withdrawClaim",
            args: [claimId],
          }),
        },
      ]);
      await fetch(`/api/leases/${encodeURIComponent(leaseId)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          add_gas_cost_wei: op.actualGasCost.toString(),
          add_tx_count: 1,
        }),
      }).catch(() => null);
      await live.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not withdraw claim.");
    } finally {
      setBusy(null);
    }
  };

  // Prompt 7: Renter Approve (and atomically batch settle() if this finalizes the lease!)
  const handleAccept = async (claimId: bigint, alsoSettle: boolean) => {
    if (!session) return;
    const escrow = getEscrowAddress();
    if (!escrow) return;
    setError(null);
    setBusy(alsoSettle ? "Approving & settling deposit…" : "Approving claim…");
    try {
      const calls = [
        {
          to: escrow,
          data: encodeFunctionData({
            abi: KEYPRINT_ESCROW_ABI,
            functionName: "acceptClaim",
            args: [claimId],
          }),
        },
      ];
      if (alsoSettle) {
        calls.push({
          to: escrow,
          data: encodeFunctionData({
            abi: KEYPRINT_ESCROW_ABI,
            functionName: "settle",
            args: [leaseId as Hex],
          }),
        });
      }

      const op = await sendSponsoredCalls(session, calls);
      await fetch(`/api/leases/${encodeURIComponent(leaseId)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...(alsoSettle ? { settled_tx_hash: op.txHash } : {}),
          add_gas_cost_wei: op.actualGasCost.toString(),
          add_tx_count: 1,
        }),
      }).catch(() => null);
      await live.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not approve claim.");
    } finally {
      setBusy(null);
    }
  };

  const handleSettleNow = async () => {
    if (!session) return;
    const escrow = getEscrowAddress();
    if (!escrow) return;
    setError(null);
    setBusy("Settling deposit…");
    try {
      const op = await sendSponsoredCalls(session, [
        {
          to: escrow,
          data: encodeFunctionData({
            abi: KEYPRINT_ESCROW_ABI,
            functionName: "settle",
            args: [leaseId as Hex],
          }),
        },
      ]);
      await fetch(`/api/leases/${encodeURIComponent(leaseId)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          settled_tx_hash: op.txHash,
          add_gas_cost_wei: op.actualGasCost.toString(),
          add_tx_count: 1,
        }),
      }).catch(() => null);
      await live.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Lease is not ready to settle yet.");
    } finally {
      setBusy(null);
    }
  };

  const viewerPins: SpatialPinItem[] = [
    ...moveInPins.map((p) => ({
      id: p.id,
      position: p.position,
      label: p.text,
      variant: p.coSigned ? ("sealed" as const) : ("renter" as const),
    })),
    ...claimCards
      .filter((c) => c.manifest && c.claim.state !== 4)
      .map((c) => ({
        id: `claim-${c.claim.claimId.toString()}`,
        position: c.manifest!.position,
        normal: c.manifest!.normal,
        label: c.manifest!.title,
        priceTag: formatDollars(c.claim.amount),
        variant: "claim" as const,
      })),
    ...draftClaims.map((d) => ({
      id: d.id,
      position: d.position,
      normal: d.normal,
      label: d.title,
      priceTag: `$${d.dollars}`,
      variant: "claim" as const,
    })),
    ...(pendingTap
      ? [
          {
            id: "pending-claim",
            position: pendingTap.point,
            normal: pendingTap.normal,
            label: "New claim pin",
            variant: "claim" as const,
            selected: true,
          },
        ]
      : []),
  ];

  // Check if accepting a single Pending claim will leave ALL claims final & claims closed
  const claimsClosedOrExpired =
    Boolean(live.lease?.claimsClosed) ||
    (live.lease !== null &&
      live.lease.state === 2 &&
      live.chainNowSec > live.lease.endedAt + live.lease.claimWindow);

  const isClaimFinal = (c: (typeof live.claims)[number]) => {
    if (!live.lease) return false;
    if (c.state === 1 || c.state === 3 || c.state === 4) return true;
    if (c.state === 0) return live.chainNowSec > c.filedAt + live.lease.responseWindow;
    if (c.state === 2) return live.chainNowSec > c.disputedAt + live.lease.resolveWindow;
    return false;
  };

  const canBatchAcceptAndSettle = (targetClaimId: bigint) => {
    if (!claimsClosedOrExpired || live.lease?.state !== 2) return false;
    return live.claims.every(
      (c) => c.claimId === targetClaimId || isClaimFinal(c),
    );
  };

  const allClaimsFinalAndClosed =
    live.lease?.state === 2 &&
    claimsClosedOrExpired &&
    live.claims.every((c) => isClaimFinal(c));

  const claimWindowDeadline =
    live.lease?.state === 2 && !live.lease.claimsClosed
      ? live.lease.endedAt + live.lease.claimWindow
      : null;

  return (
    <LeaseShell leaseId={leaseId} live={live}>
      <div className="space-y-6">
        {live.lease?.state === 3 && (
          <Card className="border-sealed/30 bg-sealed/5">
            <CardContent className="p-5 flex flex-wrap items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <CheckCircle2 className="h-5 w-5 text-sealed" />
                <div>
                  <div className="font-semibold text-sealed">Deposit settled</div>
                  <p className="text-sm text-foreground">
                    {formatDollars(live.lease.landlordPayout)} paid to landlord ·{" "}
                    {formatDollars(live.lease.renterPayout)} returned to renter.
                  </p>
                </div>
              </div>
              <Link
                href={`/lease/${leaseId}/settle`}
                className={cn(buttonVariants({ variant: "default" }))}
              >
                Open settlement receipt
              </Link>
            </CardContent>
          </Card>
        )}

        {claimWindowDeadline && live.lease && (
          <Countdown
            deadlineSec={claimWindowDeadline}
            chainNowSec={live.chainNowSec}
            leaseId={leaseId}
            activeMessage={`Your landlord has until zero to file priced claims. If nothing is filed, your full ${formatDollars(live.lease.deposit)} comes back.`}
            expiredMessage={`Claim deadline passed. Releasing your ${formatDollars(live.lease.deposit)} refund.`}
            onManualRelease={session ? handleSettleNow : undefined}
            releasing={busy !== null}
            onKeeperSettled={() => live.refresh()}
          />
        )}

        <div className="grid gap-6 lg:grid-cols-3">
          <div className="lg:col-span-2 space-y-4">
            <RoomViewer
              url={live.signedUrls.moveOutScan || live.signedUrls.moveInScan || REFERENCE_MOVE_IN_URL}
              pins={viewerPins}
              flyTo={flyTo}
              onSurfaceTap={canFileMore ? (tap) => setPendingTap(tap) : undefined}
              onPinSelect={(pin) =>
                setFlyTo({
                  position: pin.position,
                  normal: pin.normal,
                  nonce: Date.now(),
                })
              }
              heightClassName="h-[520px]"
              hint={
                canFileMore
                  ? "Landlord: tap a spot in the 3D room to drop a priced claim pin"
                  : "Every dollar claimed is pinned to its spot beside move-in pins"
              }
            />

            {canFileMore && (
              <div className="flex flex-wrap items-center gap-2 text-xs">
                <span className="text-muted-foreground">Quick pin spots:</span>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    setPendingTap({
                      point: REFERENCE_SPOTS.carpetStain.position,
                      normal: REFERENCE_SPOTS.carpetStain.normal,
                    });
                    setClaimTitle("Dark stain on carpet");
                    setClaimDollars("40");
                  }}
                >
                  Carpet stain ($40)
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    setPendingTap({
                      point: REFERENCE_SPOTS.deskScratch.position,
                      normal: REFERENCE_SPOTS.deskScratch.normal,
                    });
                    setClaimTitle("Desk scratch");
                    setClaimDollars("120");
                  }}
                >
                  Desk scratch ($120)
                </Button>
              </div>
            )}
          </div>

          <div className="space-y-4">
            {/* Landlord staged claim composer */}
            {canFileMore && (
              <Card className="border-claim/30">
                <CardHeader className="pb-3">
                  <CardTitle className="text-base flex items-center gap-1.5">
                    <DollarSign className="h-4 w-4 text-claim" />
                    File priced-pin claims
                  </CardTitle>
                  <CardDescription>
                    Every dollar claimed must be pinned to a spot in the 3D room. Stage all claims and submit in one touch.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  {pendingTap && (
                    <div className="rounded-xl border border-claim/25 bg-claim/5 p-3 space-y-2.5">
                      <input
                        type="text"
                        value={claimTitle}
                        onChange={(e) => setClaimTitle(e.target.value)}
                        placeholder="Describe damage at this spot"
                        className="w-full h-9 rounded-md border border-border bg-surface px-2.5 text-sm"
                      />
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-semibold">$</span>
                        <input
                          type="number"
                          min="1"
                          step="1"
                          value={claimDollars}
                          onChange={(e) => setClaimDollars(e.target.value)}
                          placeholder="40"
                          className="w-28 h-9 rounded-md border border-border bg-surface px-2.5 text-sm"
                        />
                        <Button size="sm" onClick={handleStageClaim} className="flex-1">
                          <Plus className="h-3.5 w-3.5" />
                          Stage pin
                        </Button>
                      </div>
                    </div>
                  )}

                  {draftClaims.map((d) => (
                    <div
                      key={d.id}
                      className="flex items-center justify-between gap-2 rounded-lg border border-border bg-muted/40 px-3 py-2 text-xs"
                    >
                      <span className="font-medium">
                        {d.title} ·{" "}
                        <span className="text-claim font-semibold">${d.dollars}</span>
                      </span>
                      <button
                        type="button"
                        onClick={() =>
                          setDraftClaims((prev) => prev.filter((x) => x.id !== d.id))
                        }
                        className="text-muted-foreground hover:text-claim cursor-pointer"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  ))}

                  <Button
                    variant="destructive"
                    className="w-full"
                    disabled={draftClaims.length === 0 || busy !== null}
                    onClick={handleFileClaimsAndClose}
                  >
                    {busy ??
                      `File ${draftClaims.length || ""} claim${draftClaims.length === 1 ? "" : "s"} & close claims`}
                  </Button>
                </CardContent>
              </Card>
            )}

            {error && (
              <div className="rounded-xl border border-claim/30 bg-claim/10 px-4 py-2.5 text-xs text-claim">
                {error}
              </div>
            )}

            {/* Live claims list (always read from KeyprintEscrow.getClaims) */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">
                  Filed claims ({claimCards.length})
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {claimCards.length === 0 ? (
                  <p className="text-xs text-muted-foreground">
                    No claims have been filed yet.
                  </p>
                ) : (
                  claimCards.map(
                    ({ claim, manifest, isPricedPin, matchedMoveInPin }) => {
                      const stateText =
                        ClaimStateLabel[
                          claim.state as keyof typeof ClaimStateLabel
                        ] || "Pending";
                      const batchSettle = canBatchAcceptAndSettle(claim.claimId);

                      return (
                        <div
                          key={claim.claimId.toString()}
                          className="rounded-xl border border-border bg-surface p-3.5 space-y-2.5"
                        >
                          <div className="flex items-start justify-between gap-2">
                            <button
                              type="button"
                              onClick={() => {
                                if (manifest) {
                                  setFlyTo({
                                    position: manifest.position,
                                    normal: manifest.normal,
                                    nonce: Date.now(),
                                  });
                                }
                              }}
                              className="text-left cursor-pointer"
                            >
                              <div className="text-sm font-semibold text-foreground hover:text-accent">
                                {manifest?.title || `Claim #${claim.claimId.toString()}`}
                              </div>
                              <div className="text-base font-bold text-claim">
                                {formatDollars(claim.amount)}
                              </div>
                            </button>

                            <Badge
                              variant={
                                claim.state === 1
                                  ? "sealed"
                                  : claim.state === 4
                                    ? "default"
                                    : claim.state === 2
                                      ? "suggestion"
                                      : "claim"
                              }
                            >
                              {stateText}
                            </Badge>
                          </div>

                          {/* Flag off-app claims without keyprint.claim.v1 priced-pin evidence */}
                          {!isPricedPin && (
                            <div className="rounded-lg border border-claim/30 bg-claim/10 px-3 py-2 text-xs text-claim flex items-start gap-2">
                              <ShieldAlert className="h-4 w-4 shrink-0 mt-0.5" />
                              <span>
                                <strong>Not a priced pin:</strong> filed without matching 3D pin evidence. You can dispute this claim.
                              </span>
                            </div>
                          )}

                          {/* Hero demo beat: claim lands on a co-signed move-in pin */}
                          {matchedMoveInPin && (
                            <div className="rounded-lg border border-sealed/30 bg-sealed/10 px-3 py-2 text-xs text-sealed space-y-0.5">
                              <div className="font-semibold flex items-center gap-1.5">
                                <AlertTriangle className="h-3.5 w-3.5" />
                                <span>
                                  On a move-in pin
                                  {matchedMoveInPin.coSigned
                                    ? ", co-signed by your landlord"
                                    : ""}
                                </span>
                              </div>
                              <div className="text-foreground/80">
                                Move-in note: &ldquo;{matchedMoveInPin.text}&rdquo;
                              </div>
                            </div>
                          )}

                          {/* Renter actions (Pending claim) */}
                          {isRenter &&
                            live.lease?.state === 2 &&
                            claim.state === 0 && (
                              <div className="flex flex-wrap gap-2 pt-1">
                                <Button
                                  size="sm"
                                  disabled={busy !== null}
                                  onClick={() =>
                                    handleAccept(claim.claimId, batchSettle)
                                  }
                                >
                                  {batchSettle ? "Approve & settle" : "Approve"}
                                </Button>
                                <Button
                                  size="sm"
                                  variant="destructive"
                                  disabled={busy !== null}
                                  onClick={() => handleDispute(claim.claimId)}
                                >
                                  Dispute
                                </Button>
                              </div>
                            )}

                          {/* Landlord withdraw action (Pending OR Disputed) */}
                          {isLandlord &&
                            live.lease?.state === 2 &&
                            (claim.state === 0 || claim.state === 2) && (
                              <div className="pt-1">
                                <Button
                                  size="sm"
                                  variant="outline"
                                  disabled={busy !== null}
                                  onClick={() => handleWithdraw(claim.claimId)}
                                >
                                  Withdraw claim
                                </Button>
                              </div>
                            )}
                        </div>
                      );
                    },
                  )
                )}

                {allClaimsFinalAndClosed && session && (
                  <Button
                    size="lg"
                    className="w-full mt-2"
                    disabled={busy !== null}
                    onClick={handleSettleNow}
                  >
                    <CheckCircle2 className="h-4 w-4" />
                    {busy ?? "Settle deposit now"}
                  </Button>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </LeaseShell>
  );
}
