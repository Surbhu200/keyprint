"use client";

import { use, useMemo, useState } from "react";
import Link from "next/link";
import { encodeFunctionData, parseUnits, type Hex } from "viem";
import {
  AlertTriangle,
  CheckCircle2,
  DollarSign,
  MapPin,
  Plus,
  ShieldAlert,
  Trash2,
} from "lucide-react";
import { LeaseShell } from "@/components/LeaseShell";
import { Countdown } from "@/components/Countdown";
import { useLeaseLiveState } from "@/components/useLeaseLiveState";
import { usePasskeySession } from "@/components/usePasskeySession";
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
  friendlyError,
  sendSponsoredCalls,
} from "@/lib/chain/wallet";
import {
  canonicalizeAndHash,
  type AlignmentManifestV1,
  type ClaimManifestV1,
  type PinManifestV1,
} from "@/lib/evidence/manifest";
import { countsAsMoveInPin } from "@/lib/evidence/pin-rules";
import { saveRecordManifests } from "@/lib/evidence/record-store";
import { REFERENCE_SPOTS } from "@/lib/sample/reference";
import { cn } from "@/lib/utils";

interface DraftClaimPin {
  id: string;
  position: [number, number, number];
  normal: [number, number, number];
  title: string;
  dollars: string;
}

/** The verified Alignment record whose manifest names this lease's move-in and move-out scans. */
function findSealedAlignment(
  records: ReadonlyArray<{ kind: number; record_id: string; manifest_json: string }>,
  lease: { moveInRecordId: string; moveOutRecordId: string } | null,
): { recordId: Hex; matrix: number[] } | null {
  if (!lease) return null;
  for (const r of records) {
    if (r.kind !== RecordKind.Alignment) continue;
    let m: AlignmentManifestV1;
    try {
      m = JSON.parse(r.manifest_json) as AlignmentManifestV1;
    } catch {
      continue;
    }
    if (
      m.type === "keyprint.alignment.v1" &&
      Array.isArray(m.matrix) &&
      m.matrix.length === 16 &&
      String(m.moveInRecordId).toLowerCase() === lease.moveInRecordId.toLowerCase() &&
      String(m.moveOutRecordId).toLowerCase() === lease.moveOutRecordId.toLowerCase()
    ) {
      return { recordId: r.record_id as Hex, matrix: m.matrix };
    }
  }
  return null;
}

export default function LeaseClaimsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: leaseId } = use(params);
  const live = useLeaseLiveState(leaseId);
  const session = usePasskeySession();

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

  const isLandlord =
    session &&
    live.lease &&
    session.address.toLowerCase() === live.lease.landlord.toLowerCase();
  const isRenter =
    session &&
    live.lease &&
    session.address.toLowerCase() === live.lease.renter.toLowerCase();

  // Onchain seal time of the lease's move-in record (records from the hook are verified against Arc).
  const moveInCreatedAt = useMemo(() => {
    if (!live.lease) return null;
    const row = live.records.find(
      (r) => r.record_id.toLowerCase() === live.lease!.moveInRecordId.toLowerCase(),
    );
    return row?.chain_created_at ?? null;
  }, [live.records, live.lease]);

  // Move-in pins: renter pins sealed within the review window after move-in, or co-signed.
  const moveInPins: MoveInPinRef[] = useMemo(() => {
    return live.records
      .filter((r) => r.kind === RecordKind.Pin)
      .map((r): MoveInPinRef | null => {
        try {
          const m = JSON.parse(r.manifest_json) as PinManifestV1;
          const sealedSec = r.chain_created_at ?? 0;
          const coSigned = (live.coSignedMap[r.record_id.toLowerCase()] || 0) > 0;
          return {
            id: r.record_id,
            position: m.position,
            normal: m.normal,
            sealedAt: sealedSec,
            coSigned,
            text: m.text,
            countsAsMoveIn: countsAsMoveInPin({
              pinAuthor: r.author,
              pinCreatedAt: r.chain_created_at,
              coSignedByLandlord: coSigned,
              lease: live.lease,
              moveInCreatedAt,
            }),
          };
        } catch {
          return null;
        }
      })
      .filter((x): x is MoveInPinRef => x !== null);
  }, [live.records, live.coSignedMap, live.lease, moveInCreatedAt]);

  // Signed links to move-in pin close-up photos (signed server-side; paths never reach the page).
  const pinPhotoUrls = live.signedUrls.pinPhotos;

  // The sealed alignment for this lease's move-in/move-out pair (maps move-out → move-in).
  const sealedAlignment = useMemo(
    () => findSealedAlignment(live.records, live.lease),
    [live.records, live.lease],
  );

  // Map onchain claims (source of truth: KeyprintEscrow.getClaims) to keyprint.claim.v1 manifests.
  // A claim is a priced pin only if its evidence was sealed by the landlord for this lease and
  // states the same amount the contract holds.
  const claimCards = useMemo(() => {
    return live.claims.map((c) => {
      const rec = live.records.find(
        (r) => r.record_id.toLowerCase() === c.evidenceRecordId.toLowerCase(),
      );
      let manifest: ClaimManifestV1 | null = null;
      if (
        rec &&
        live.lease &&
        rec.kind === RecordKind.ClaimEvidence &&
        rec.author.toLowerCase() === live.lease.landlord.toLowerCase()
      ) {
        try {
          const parsed = JSON.parse(rec.manifest_json) as ClaimManifestV1;
          if (
            parsed.type === "keyprint.claim.v1" &&
            parsed.leaseId.toLowerCase() === leaseId.toLowerCase() &&
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
  }, [live.claims, live.records, live.lease, leaseId, moveInPins]);

  const claimWindowOpen =
    live.lease?.state === 2 &&
    !live.lease.claimsClosed &&
    live.chainNowSec <= live.lease.endedAt + live.lease.claimWindow;

  // Claims are only filed against the lined-up scans, so every pin shares move-in coordinates.
  const canFileMore = Boolean(isLandlord) && claimWindowOpen && Boolean(sealedAlignment);

  // Demo shortcuts only make sense on the bundled placeholder model.
  const usesPlaceholderModel = Boolean(
    live.meta?.move_in_scan_path?.startsWith("/models/") ||
      live.meta?.move_out_scan_path?.startsWith("/models/"),
  );

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

    if (!sealedAlignment) {
      setError("The move-in and move-out scans aren't lined up and sealed yet, so claims can't be filed.");
      return;
    }

    setError(null);
    setBusy("Preparing priced-pin evidence…");
    try {
      const alignmentRecordId = sealedAlignment.recordId;
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
      const op = await sendSponsoredCalls(
        session,
        [...sealCalls, ...fileCalls, closeCall],
        { onSubmitted: () => setBusy("Filing priced claims…") },
      );

      const [failed] = await Promise.all([
        saveRecordManifests(
          prepared.map((p, i) => ({
            record_id: recordIds[i],
            lease_id: leaseId,
            manifest_json: p.canonicalJson,
            tx_hash: op.txHash,
            gas_cost_wei: i === 0 ? op.actualGasCost.toString() : "0",
          })),
        ),
        fetch(`/api/leases/${encodeURIComponent(leaseId)}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            add_gas_cost_wei: op.actualGasCost.toString(),
            add_tx_count: 1,
          }),
        }).catch(() => null),
      ]);
      if (failed > 0) {
        setError(
          "Claims are filed. Their pin details are syncing and will appear automatically.",
        );
      }

      setDraftClaims([]);
      await live.refresh();
    } catch (err) {
      setError(friendlyError(err, "Could not file claims. Nothing was sent."));
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
      setError(friendlyError(err, "Could not dispute this claim. Nothing was sent."));
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
      setError(friendlyError(err, "Could not withdraw this claim. Nothing was sent."));
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
      setError(friendlyError(err, "Could not approve this claim. Nothing was sent."));
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
      setError(friendlyError(err, "The lease isn't ready to settle yet."));
      await live.refresh().catch(() => undefined);
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

  // Once claims are closed, settlement waits for the last answer/ruling deadline.
  // Show that clock too, so the keeper is asked to settle right when silence rules kick in.
  const lastAnswerDeadline = useMemo(() => {
    const lease = live.lease;
    if (!lease || lease.state !== 2 || !claimsClosedOrExpired) return null;
    let latest = 0;
    let anyOpen = false;
    for (const c of live.claims) {
      if (c.state === 0) {
        anyOpen = true;
        latest = Math.max(latest, c.filedAt + lease.responseWindow);
      } else if (c.state === 2) {
        anyOpen = true;
        latest = Math.max(latest, c.disputedAt + lease.resolveWindow);
      }
    }
    return anyOpen && latest > live.chainNowSec - 1 ? latest : null;
  }, [live.lease, live.claims, live.chainNowSec, claimsClosedOrExpired]);

  // Show the move-out scan lined up into move-in coordinates when the alignment is sealed,
  // so taps and move-in pins share one frame. Otherwise show the move-in scan itself.
  const moveOutScanUrl = live.signedUrls.moveOutScan || null;
  const moveInScanUrl = live.signedUrls.moveInScan || null;
  const viewerUrl =
    moveOutScanUrl && sealedAlignment ? moveOutScanUrl : moveInScanUrl ?? null;
  const viewerMatrix =
    viewerUrl && viewerUrl === moveOutScanUrl && sealedAlignment ? sealedAlignment.matrix : null;

  const depositText = live.lease ? formatDollars(live.lease.deposit) : "the deposit";
  // Display only: share of the deposit currently claimed, in tenths of a percent (bigint math).
  const claimedPct = live.lease
    ? Math.min(
        100,
        live.lease.deposit > 0n
          ? Number((live.lease.activeClaimedTotal * 1000n) / live.lease.deposit) / 10
          : 0,
      )
    : 0;
  const claimCountdownActive = isLandlord
    ? `You have until zero to file priced claims. If you file nothing, the full ${depositText} goes back to your renter.`
    : `Your landlord has until zero to file priced claims. If nothing is filed, your full ${depositText} comes back.`;
  const claimCountdownExpired =
    live.claims.length === 0
      ? `Claim deadline passed with no claims. The full ${depositText} is on its way back to the renter.`
      : "Claim deadline passed. Settlement runs once every claim is final.";

  return (
    <LeaseShell leaseId={leaseId} live={live}>
      <div className="space-y-6">
        {live.lease?.state === 3 && (
          <section className="vault p-5 sm:p-6">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-start gap-3">
                <CheckCircle2 className="mt-0.5 h-6 w-6 shrink-0 text-sealed-bright" />
                <div>
                  <div className="text-[17px] font-semibold text-white">Deposit settled</div>
                  <p className="mt-0.5 text-[14px] leading-snug text-white/70 tabular-nums">
                    {formatDollars(live.lease.landlordPayout)} paid to landlord,{" "}
                    {formatDollars(live.lease.renterPayout)} returned to renter.
                  </p>
                </div>
              </div>
              <Link
                href={`/lease/${leaseId}/settle`}
                className={cn(
                  buttonVariants({ variant: "default" }),
                  "h-12 shrink-0 rounded-2xl bg-white px-5 text-[15px] text-ink hover:bg-white/90 max-sm:w-full",
                )}
              >
                Open settlement receipt
              </Link>
            </div>
          </section>
        )}

        {claimWindowDeadline && live.lease && (
          <Countdown
            deadlineSec={claimWindowDeadline}
            chainNowSec={live.chainNowSec}
            leaseId={leaseId}
            activeMessage={claimCountdownActive}
            expiredMessage={claimCountdownExpired}
            onManualRelease={isRenter || isLandlord ? handleSettleNow : undefined}
            manualReleaseLabel={isRenter ? "Release my deposit" : "Settle now"}
            releasing={busy !== null}
            onKeeperSettled={() => void live.refresh()}
          />
        )}

        {!claimWindowDeadline && lastAnswerDeadline && live.lease && (
          <Countdown
            deadlineSec={lastAnswerDeadline}
            chainNowSec={live.chainNowSec}
            leaseId={leaseId}
            activeMessage="Waiting for answers. Any claim left unanswered counts as accepted, and any dispute the reviewer leaves unresolved goes back to the renter."
            expiredMessage="Every answer deadline has passed. Settlement can run now."
            onManualRelease={isRenter || isLandlord ? handleSettleNow : undefined}
            manualReleaseLabel="Settle now"
            releasing={busy !== null}
            onKeeperSettled={() => void live.refresh()}
          />
        )}

        <div className="grid gap-6 lg:grid-cols-3">
          <div className="lg:col-span-2 space-y-4">
            {live.lease && (
              <section className="card-soft p-5 sm:p-6">
                <div className="text-[13px] text-muted-foreground">Claimed</div>
                <div className="mt-1.5 flex flex-wrap items-baseline gap-x-2 gap-y-1">
                  <span className="money font-display text-[34px] text-claim">
                    {formatDollars(live.lease.activeClaimedTotal)}
                  </span>
                  <span className="text-[15px] text-muted-foreground tabular-nums">
                    of {formatDollars(live.lease.deposit)}
                  </span>
                </div>
                <div
                  role="img"
                  aria-label={`${formatDollars(live.lease.activeClaimedTotal)} of ${formatDollars(live.lease.deposit)} claimed`}
                  className="mt-4 h-2.5 w-full overflow-hidden rounded-full bg-[#b8892a]"
                >
                  <div
                    className="h-full bg-claim shadow-[1px_0_0_0_var(--color-surface)] transition-[width] duration-500 ease-out-expo motion-reduce:transition-none"
                    style={{ width: `${claimedPct}%` }}
                  />
                </div>
                <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-[13px] text-muted-foreground">
                  <span className="inline-flex items-center gap-1.5">
                    <span aria-hidden="true" className="h-2 w-2 rounded-full bg-claim" />
                    Claimed by landlord
                  </span>
                  <span className="inline-flex items-center gap-1.5">
                    <span aria-hidden="true" className="h-2 w-2 rounded-full bg-[#b8892a]" />
                    Back to renter
                  </span>
                </div>
              </section>
            )}

            {viewerUrl ? (
              <RoomViewer
                url={viewerUrl}
                modelMatrix={viewerMatrix}
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
                heightClassName="h-[55vh] max-h-[520px] min-h-[320px]"
                hint={
                  canFileMore
                    ? "Landlord: tap a spot in the 3D room to drop a priced claim pin"
                    : "Every dollar claimed is pinned to its spot beside move-in pins"
                }
              />
            ) : (
              <div className="rounded-[20px] bg-muted p-6 text-[14px] text-muted-foreground">
                The 3D record for this lease isn&apos;t available yet.
              </div>
            )}

            {isLandlord && claimWindowOpen && !sealedAlignment && (
              <div className="rounded-2xl bg-suggestion/10 px-4 py-3 text-[13px] leading-snug text-foreground">
                The move-in and move-out scans haven&apos;t been lined up and sealed for this lease yet, so claims
                can&apos;t be pinned. Line them up on the Compare screen first.
              </div>
            )}

            {canFileMore && usesPlaceholderModel && (
              <div className="flex flex-wrap items-center gap-2 text-[13px]">
                <span className="w-full text-muted-foreground sm:w-auto">Demo shortcuts (sample model):</span>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-11 rounded-full px-4 sm:h-9"
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
                  className="h-11 rounded-full px-4 sm:h-9"
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
              <Card className="rounded-[24px] border-claim/25 shadow-[0_1px_2px_rgba(14,17,22,0.04),0_16px_40px_-16px_rgba(185,28,28,0.25)] max-lg:rounded-[28px]">
                <CardHeader className="pb-3">
                  <CardTitle className="flex items-center gap-2">
                    <span className="flex h-8 w-8 items-center justify-center rounded-full bg-claim/10">
                      <DollarSign className="h-4 w-4 text-claim" />
                    </span>
                    File priced-pin claims
                  </CardTitle>
                  <CardDescription>
                    Every dollar claimed must be pinned to a spot in the 3D room. Stage all claims and submit in one touch.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  {pendingTap && (
                    <div className="rounded-[20px] bg-claim/5 p-3 space-y-2.5">
                      <input
                        type="text"
                        value={claimTitle}
                        onChange={(e) => setClaimTitle(e.target.value)}
                        placeholder="Describe damage at this spot"
                        className="w-full h-12 rounded-2xl border-0 bg-surface px-4 text-[16px] ring-1 ring-border focus:outline-none focus:ring-2 focus:ring-accent"
                      />
                      <div className="flex items-center gap-2">
                        <span className="text-[16px] font-semibold">$</span>
                        <input
                          type="number"
                          inputMode="numeric"
                          min="1"
                          step="1"
                          value={claimDollars}
                          onChange={(e) => setClaimDollars(e.target.value)}
                          placeholder="40"
                          className="w-24 h-12 rounded-2xl border-0 bg-surface px-4 text-[16px] tabular-nums ring-1 ring-border focus:outline-none focus:ring-2 focus:ring-accent"
                        />
                        <Button
                          onClick={handleStageClaim}
                          className="h-12 flex-1 rounded-2xl text-[15px]"
                        >
                          <Plus className="h-3.5 w-3.5" />
                          Stage pin
                        </Button>
                      </div>
                    </div>
                  )}

                  {draftClaims.map((d) => (
                    <div
                      key={d.id}
                      className="flex items-center justify-between gap-2 rounded-[14px] bg-muted py-1 pl-4 pr-1 text-[14px]"
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
                        aria-label={`Remove staged claim: ${d.title}`}
                        className="inline-flex h-11 w-11 items-center justify-center rounded-xl text-muted-foreground hover:text-claim cursor-pointer"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  ))}

                  <Button
                    variant="destructive"
                    className="w-full h-auto min-h-12 rounded-2xl whitespace-normal py-3 text-[15px] leading-snug"
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
              <div className="rounded-2xl bg-claim/10 px-4 py-3 text-[13px] text-claim">
                {error}
              </div>
            )}

            {/* Live claims list (always read from KeyprintEscrow.getClaims) */}
            <section className="space-y-3">
              <h2 className="px-1 text-[17px] font-semibold tracking-[-0.01em]">
                Filed claims ({claimCards.length})
              </h2>
              <div className="space-y-3">
                {claimCards.length === 0 ? (
                  <p className="card-soft p-5 text-[14px] text-muted-foreground">
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
                          className="card-soft rounded-[20px] p-4 space-y-3"
                        >
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
                              className="group flex w-full min-h-11 items-center gap-3 text-left cursor-pointer"
                            >
                              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-claim/10 text-claim">
                                <MapPin className="h-[18px] w-[18px]" />
                              </span>
                              <span className="min-w-0 flex-1">
                                <span className="block truncate text-[15px] font-semibold text-foreground group-hover:text-accent">
                                  {manifest?.title || `Claim #${claim.claimId.toString()}`}
                                </span>
                                <Badge
                                  className="mt-1"
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
                              </span>
                              <span className="money shrink-0 text-[20px] text-claim">
                                {formatDollars(claim.amount)}
                              </span>
                            </button>

                          {/* Flag off-app claims without keyprint.claim.v1 priced-pin evidence */}
                          {!isPricedPin && (
                            <div className="rounded-[14px] bg-claim/10 px-3 py-2.5 text-[13px] leading-snug text-claim flex items-start gap-2">
                              <ShieldAlert className="h-4 w-4 shrink-0 mt-0.5" />
                              <span>
                                <strong>Not a priced pin:</strong> filed without matching 3D pin evidence.
                                {isRenter && live.lease?.state === 2 && claim.state === 0
                                  ? " You can dispute this claim."
                                  : ""}
                              </span>
                            </div>
                          )}

                          {/* Hero demo beat: claim lands on a co-signed move-in pin */}
                          {matchedMoveInPin && (
                            <div className="rounded-[14px] bg-sealed/10 px-3 py-3 text-[13px] leading-snug text-sealed space-y-1.5">
                              <div className="font-semibold flex items-center gap-1.5">
                                <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                                <span>
                                  On a move-in pin
                                  {matchedMoveInPin.coSigned
                                    ? ", co-signed by your landlord"
                                    : ""}
                                </span>
                              </div>
                              <div className="text-foreground/85">
                                Move-in note: &ldquo;{matchedMoveInPin.text}&rdquo;
                              </div>
                              {matchedMoveInPin.sealedAt > 0 && (
                                <div className="text-[12px] text-muted-foreground">
                                  Sealed{" "}
                                  {new Date(matchedMoveInPin.sealedAt * 1000).toLocaleDateString(
                                    "en-US",
                                    { month: "short", day: "numeric", year: "numeric" },
                                  )}
                                  {matchedMoveInPin.coSigned &&
                                  live.coSignedMap[matchedMoveInPin.id.toLowerCase()]
                                    ? ` · Co-signed ${new Date(
                                        live.coSignedMap[matchedMoveInPin.id.toLowerCase()] * 1000,
                                      ).toLocaleDateString("en-US", {
                                        month: "short",
                                        day: "numeric",
                                      })}`
                                    : ""}
                                </div>
                              )}
                              {pinPhotoUrls[matchedMoveInPin.id.toLowerCase()] && (
                                /* eslint-disable-next-line @next/next/no-img-element */
                                <img
                                  src={pinPhotoUrls[matchedMoveInPin.id.toLowerCase()]}
                                  alt={`Move-in evidence: ${matchedMoveInPin.text}`}
                                  className="w-full max-h-36 object-cover rounded-[10px] mt-1"
                                />
                              )}
                            </div>
                          )}

                          {/* Renter actions (Pending claim) */}
                          {isRenter &&
                            live.lease?.state === 2 &&
                            claim.state === 0 && (
                              <div className="space-y-2">
                                <div className="grid grid-cols-2 gap-2 pt-1 sm:flex sm:flex-wrap">
                                  <Button
                                    className="h-auto min-h-12 rounded-2xl whitespace-normal px-3 py-2 text-[15px] leading-snug sm:min-h-10 sm:text-[14px]"
                                    disabled={busy !== null}
                                    onClick={() =>
                                      handleAccept(claim.claimId, batchSettle)
                                    }
                                  >
                                    {batchSettle ? "Approve & settle" : "Approve"}
                                  </Button>
                                  <Button
                                    variant="destructive"
                                    className="h-auto min-h-12 rounded-2xl whitespace-normal px-3 py-2 text-[15px] leading-snug sm:min-h-10 sm:text-[14px]"
                                    disabled={busy !== null}
                                    onClick={() => handleDispute(claim.claimId)}
                                  >
                                    Dispute
                                  </Button>
                                </div>
                                {live.lease &&
                                  (live.chainNowSec > claim.filedAt + live.lease.responseWindow ? (
                                    <p className="text-[13px] text-muted-foreground">
                                      The time to answer has passed, so this claim now counts as accepted.
                                    </p>
                                  ) : (
                                    <p className="text-[13px] text-muted-foreground">
                                      Answer by{" "}
                                      {new Date(
                                        (claim.filedAt + live.lease.responseWindow) * 1000,
                                      ).toLocaleString("en-US", {
                                        month: "short",
                                        day: "numeric",
                                        hour: "numeric",
                                        minute: "2-digit",
                                      })}
                                      . If you don&apos;t, this claim counts as accepted.
                                    </p>
                                  ))}
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
                                  className="rounded-xl max-sm:h-11 max-sm:w-full"
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
                    className="w-full mt-2 h-12 rounded-2xl text-[15px]"
                    disabled={busy !== null}
                    onClick={handleSettleNow}
                  >
                    <CheckCircle2 className="h-4 w-4" />
                    {busy ?? "Settle deposit now"}
                  </Button>
                )}
              </div>
            </section>
          </div>
        </div>
      </div>
    </LeaseShell>
  );
}
