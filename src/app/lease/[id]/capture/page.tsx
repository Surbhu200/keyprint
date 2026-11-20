"use client";

import { use, useState } from "react";
import Link from "next/link";
import { encodeFunctionData, erc20Abi, type Hex } from "viem";
import {
  Camera,
  CheckCircle2,
  Fingerprint,
  MapPin,
  ShieldCheck,
  Trash2,
  Upload,
} from "lucide-react";
import { LeaseShell } from "@/components/LeaseShell";
import { SealAnimation } from "@/components/SealAnimation";
import { useLeaseLiveState } from "@/components/useLeaseLiveState";
import { usePasskeySession } from "@/components/usePasskeySession";
import { RoomViewer, type SurfaceTapEvent } from "@/components/three/RoomViewer";
import type { SpatialPinItem } from "@/components/three/PinMarker";
import { Button, buttonVariants } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  ARC_USDC_ADDRESS,
  formatDollars,
  getEscrowAddress,
  KEYPRINT_ESCROW_ABI,
  RecordKind,
} from "@/lib/chain/arc";
import {
  buildUnsealedRegistryCalls,
  friendlyError,
  sealTimeIso,
  sendSponsoredCalls,
} from "@/lib/chain/wallet";
import { sha256Blob } from "@/lib/evidence/hash";
import {
  canonicalizeAndHash,
  type EvidenceManifestV1,
  type PinManifestV1,
} from "@/lib/evidence/manifest";
import { saveRecordManifests } from "@/lib/evidence/record-store";
import { REFERENCE_MOVE_IN_URL, REFERENCE_SPOTS } from "@/lib/sample/reference";
import { uploadToPrivateStorage } from "@/lib/supabase/upload";
import { cn } from "@/lib/utils";

interface DraftPin {
  id: string;
  position: [number, number, number];
  normal: [number, number, number];
  text: string;
  photoFile?: File | null;
}

function formatDuration(seconds: number): string {
  const unit = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;
  if (seconds >= 86400) return unit(Math.round(seconds / 86400), "day");
  if (seconds >= 3600) return unit(Math.round(seconds / 3600), "hour");
  return unit(Math.max(1, Math.round(seconds / 60)), "minute");
}

export default function LeaseCapturePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: leaseId } = use(params);
  const live = useLeaseLiveState(leaseId);
  const session = usePasskeySession();

  const [scanUrl, setScanUrl] = useState(REFERENCE_MOVE_IN_URL);
  const [scanFile, setScanFile] = useState<File | null>(null);
  const [scanName, setScanName] = useState("apartment-move-in.glb");
  const [pins, setPins] = useState<DraftPin[]>([]);
  const [pendingTap, setPendingTap] = useState<SurfaceTapEvent | null>(null);
  const [pinText, setPinText] = useState("Scratch on desk, already here");
  const [pinPhoto, setPinPhoto] = useState<File | null>(null);

  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [sealedInfo, setSealedInfo] = useState<{
    recordId: string;
    txHash: string;
    sealedAt: string;
  } | null>(null);

  const isRenter =
    session &&
    live.lease &&
    session.address.toLowerCase() === live.lease.renter.toLowerCase();

  const alreadyFunded = (live.lease?.state ?? 0) >= 1;

  const handleAddPin = () => {
    if (!pendingTap || !pinText.trim()) return;
    setPins((prev) => [
      ...prev,
      {
        id: `pin-${Date.now()}`,
        position: pendingTap.point,
        normal: pendingTap.normal,
        text: pinText.trim(),
        photoFile: pinPhoto,
      },
    ]);
    setPendingTap(null);
    setPinText("");
    setPinPhoto(null);
  };

  // Prompt 1 (batched): seal MoveInScan + seal Pin(s) + USDC.approve + escrow.fund
  const handleSealAndPay = async () => {
    if (!session || !live.lease) return;
    const escrow = getEscrowAddress();
    if (!escrow) {
      setError("Escrow contract address is not configured.");
      return;
    }

    setError(null);
    setNotice(null);
    setBusy("Hashing move-in 3D scan…");
    try {
      const scanBlob: Blob =
        scanFile ?? (await fetch(scanUrl).then((r) => r.blob()));
      const scanSha256 = await sha256Blob(scanBlob, (pct) =>
        setBusy(`Hashing move-in scan… ${pct}%`),
      );

      // The bundled placeholder model is already public: point at it instead of re-uploading
      // ~16 MB for every lease. Imported scans go to this lease's private folder.
      let scanPath = REFERENCE_MOVE_IN_URL;
      if (scanFile) {
        setBusy("Uploading scan privately…");
        try {
          const up = await uploadToPrivateStorage({
            file: scanBlob,
            filename: scanName,
            contentType: "model/gltf-binary",
            scope: `leases/${leaseId}`,
          });
          scanPath = up.path;
        } catch {
          throw new Error("Could not upload your scan to private storage. Nothing was sealed.");
        }
      }

      const unitId = live.lease.unitId;
      const moveInManifest: EvidenceManifestV1 = {
        type: "keyprint.evidence.v1",
        leaseId: leaseId as Hex,
        unitId,
        kind: "MoveInScan",
        files: [
          {
            role: "model",
            sha256: scanSha256,
            bytes: scanBlob.size,
            mime: "model/gltf-binary",
            name: scanName,
          },
        ],
        capturedAtClient: new Date().toISOString(),
        app: "keyprint-web/0.1",
      };
      const scanCanon = await canonicalizeAndHash(moveInManifest);

      const { calls: scanCalls, recordIds: scanIds } =
        await buildUnsealedRegistryCalls(session.address, [
          {
            unitId,
            leaseId: leaseId as Hex,
            kind: RecordKind.MoveInScan,
            contentHash: scanCanon.contentHash,
          },
        ]);
      const moveInRecordId = scanIds[0];

      const pinPrepared: Array<{
        canonicalJson: string;
        contentHash: Hex;
        photoPath?: string;
      }> = [];

      for (const p of pins) {
        let photoSha256: string | null = null;
        let photoPath: string | undefined;
        if (p.photoFile) {
          photoSha256 = await sha256Blob(p.photoFile);
          try {
            const up = await uploadToPrivateStorage({
              file: p.photoFile,
              filename: p.photoFile.name,
              contentType: p.photoFile.type || "image/jpeg",
              scope: `leases/${leaseId}/pins`,
            });
            photoPath = up.path;
          } catch {
            // Optional photo storage
          }
        }
        const pinManifest: PinManifestV1 = {
          type: "keyprint.pin.v1",
          leaseId: leaseId as Hex,
          scanRecordId: moveInRecordId,
          position: p.position,
          normal: p.normal,
          text: p.text,
          photoSha256,
          author: session.address,
        };
        const canon = await canonicalizeAndHash(pinManifest);
        pinPrepared.push({
          canonicalJson: canon.canonicalJson,
          contentHash: canon.contentHash,
          photoPath,
        });
      }

      const { calls: pinCalls, recordIds: pinRecordIds } =
        await buildUnsealedRegistryCalls(
          session.address,
          pinPrepared.map((p) => ({
            unitId,
            leaseId: leaseId as Hex,
            kind: RecordKind.Pin,
            contentHash: p.contentHash,
          })),
        );

      const approveCall = {
        to: ARC_USDC_ADDRESS,
        data: encodeFunctionData({
          abi: erc20Abi,
          functionName: "approve",
          args: [escrow, live.lease.deposit],
        }),
      };

      const fundCall = {
        to: escrow,
        data: encodeFunctionData({
          abi: KEYPRINT_ESCROW_ABI,
          functionName: "fund",
          args: [leaseId as Hex, moveInRecordId],
        }),
      };

      setBusy("Confirm with one touch to seal & protect deposit…");
      const op = await sendSponsoredCalls(
        session,
        [...scanCalls, ...pinCalls, approveCall, fundCall],
        { onSubmitted: () => setBusy("Sealing & protecting deposit…") },
      );

      // Save the exact manifest bytes (local backup + retries; see record-store).
      const failedSaves = await saveRecordManifests([
        {
          record_id: moveInRecordId,
          lease_id: leaseId,
          manifest_json: scanCanon.canonicalJson,
          file_paths: scanPath.startsWith("leases/") ? [scanPath] : [],
          tx_hash: op.txHash,
          gas_cost_wei: op.actualGasCost.toString(),
        },
        ...pinPrepared.map((p, i) => ({
          record_id: pinRecordIds[i],
          lease_id: leaseId,
          manifest_json: p.canonicalJson,
          file_paths: p.photoPath ? [p.photoPath] : [],
          tx_hash: op.txHash,
        })),
      ]);
      if (failedSaves > 0) {
        setNotice(
          "Sealed. Some details haven't reached Keyprint's index yet; this page syncs them automatically.",
        );
      }

      await fetch(`/api/leases/${encodeURIComponent(leaseId)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          move_in_scan_path: scanPath,
          move_in_record_id: moveInRecordId,
          funded_tx_hash: op.txHash,
          add_gas_cost_wei: op.actualGasCost.toString(),
          add_tx_count: 1,
        }),
      }).catch(() => null);

      setSealedInfo({
        recordId: moveInRecordId,
        txHash: op.txHash,
        sealedAt: await sealTimeIso(op.blockNumber),
      });
      await live.refresh();
    } catch (err) {
      setError(friendlyError(err, "Seal & pay didn't go through. Nothing was sent."));
    } finally {
      setBusy(null);
    }
  };

  const viewerPins: SpatialPinItem[] = [
    ...pins.map((p) => ({
      id: p.id,
      position: p.position,
      normal: p.normal,
      label: p.text,
      variant: alreadyFunded ? ("sealed" as const) : ("renter" as const),
    })),
    ...(pendingTap
      ? [
          {
            id: "pending-tap",
            position: pendingTap.point,
            normal: pendingTap.normal,
            label: "New pin",
            variant: "renter" as const,
            selected: true,
          },
        ]
      : []),
  ];

  return (
    <LeaseShell leaseId={leaseId} live={live}>
      <div
        className={cn(
          "space-y-6",
          (sealedInfo || (isRenter && !alreadyFunded)) && "max-lg:pb-40",
        )}
      >
        {(sealedInfo || alreadyFunded) && (
          <SealAnimation
            title={
              live.lease
                ? `Move-in sealed & ${formatDollars(live.lease.deposit)} protected`
                : "Move-in sealed"
            }
            subtitle="Your landlord can now co-sign or contest specific pins during the review window."
            sealedAtIso={
              sealedInfo?.sealedAt ??
              (live.lease
                ? live.records.find(
                    (r) =>
                      r.record_id.toLowerCase() === live.lease!.moveInRecordId.toLowerCase(),
                  )?.sealed_at
                : null)
            }
            recordId={sealedInfo?.recordId || live.lease?.moveInRecordId}
          />
        )}
        {notice && <p className="text-xs text-muted-foreground">{notice}</p>}

        <div className="grid gap-6 lg:grid-cols-3">
          <div className="lg:col-span-2 space-y-4">
            <RoomViewer
              url={live.signedUrls.moveInScan || scanUrl}
              pins={viewerPins}
              onSurfaceTap={alreadyFunded ? undefined : (tap) => setPendingTap(tap)}
              heightClassName="h-[55vh] max-h-[520px] min-h-[320px]"
              hint={
                alreadyFunded
                  ? "Move-in scan is sealed"
                  : "Tap any existing scratch or damage to pin it before sealing"
              }
            />

            {!alreadyFunded && (
              <div className="space-y-2.5">
                <p className="text-sm text-muted-foreground">
                  {scanFile ? (
                    <>
                      Your scan:{" "}
                      <span className="break-all font-medium text-foreground">{scanName}</span>
                    </>
                  ) : (
                    "Showing the sample apartment (a public research scan), not your home. Import your own scan to seal your apartment."
                  )}
                </p>
                <div className="grid gap-2 sm:flex sm:flex-wrap sm:items-center">
                  <label
                    className={cn(
                      "flex min-h-12 cursor-pointer items-center justify-center gap-2 rounded-xl border-2 border-dashed px-4 text-sm font-semibold focus-within:ring-2 focus-within:ring-accent sm:min-h-10",
                      scanFile
                        ? "border-border bg-surface text-foreground hover:bg-muted"
                        : "border-accent/40 bg-accent/5 text-accent hover:bg-accent/10",
                    )}
                  >
                    <Upload className="h-4 w-4" />
                    Import custom .glb
                    <input
                      type="file"
                      accept=".glb,model/gltf-binary"
                      className="sr-only"
                      onChange={(e) => {
                        const f = e.target.files?.[0];
                        if (f) {
                          setScanFile(f);
                          setScanName(f.name);
                          setScanUrl(URL.createObjectURL(f));
                        }
                      }}
                    />
                  </label>
                  {!scanFile && (
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      title="Demo shortcut for the bundled sample model"
                      className="max-sm:h-11 max-sm:text-sm"
                      onClick={() =>
                        setPendingTap({
                          point: REFERENCE_SPOTS.deskScratch.position,
                          normal: REFERENCE_SPOTS.deskScratch.normal,
                        })
                      }
                    >
                      Demo: pin desk scratch
                    </Button>
                  )}
                </div>
              </div>
            )}
          </div>

          <div className="space-y-4">
            {pendingTap && !alreadyFunded && (
              <Card className="border-accent/40 transition-[translate,opacity] duration-200 ease-out motion-reduce:transition-none max-lg:fixed max-lg:inset-x-0 max-lg:bottom-0 max-lg:z-40 max-lg:mb-0 max-lg:max-h-[80svh] max-lg:overflow-y-auto max-lg:rounded-b-none max-lg:border-x-0 max-lg:border-b-0 max-lg:pb-[env(safe-area-inset-bottom)] max-lg:shadow-[0_-12px_32px_rgba(22,22,22,0.16)] max-lg:starting:translate-y-6 max-lg:starting:opacity-0">
                <div
                  aria-hidden="true"
                  className="mx-auto mt-2 h-1 w-10 rounded-full bg-border lg:hidden"
                />
                <CardHeader className="pb-3 max-lg:px-4 max-lg:pt-2 max-lg:pb-2">
                  <CardTitle className="text-base flex items-center gap-1.5">
                    <MapPin className="h-4 w-4 text-accent" />
                    Pin existing damage
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3 max-lg:space-y-2.5 max-lg:px-4 max-lg:pb-4">
                  <input
                    type="text"
                    value={pinText}
                    onChange={(e) => setPinText(e.target.value)}
                    placeholder="Scratch on desk, already here"
                    aria-label="Describe the existing damage"
                    className="w-full h-11 rounded-lg border border-border bg-background px-3 text-base sm:text-sm focus:outline-none focus:ring-2 focus:ring-accent"
                  />
                  <label className="flex min-h-11 cursor-pointer items-center justify-center gap-2 rounded-lg border border-dashed border-border bg-muted/40 px-3 text-sm font-medium text-foreground hover:bg-muted focus-within:ring-2 focus-within:ring-accent">
                    <Camera className="h-4 w-4 shrink-0 text-accent" />
                    <span className="min-w-0 truncate">
                      {pinPhoto
                        ? `Photo added · ${pinPhoto.name}`
                        : "Attach photo (hashed into proof)"}
                    </span>
                    <input
                      type="file"
                      accept="image/*"
                      onChange={(e) => setPinPhoto(e.target.files?.[0] ?? null)}
                      className="sr-only"
                    />
                  </label>
                  <div className="flex gap-2">
                    <Button onClick={handleAddPin} className="flex-1">
                      Already here
                    </Button>
                    <Button variant="ghost" onClick={() => setPendingTap(null)}>
                      Cancel
                    </Button>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Terms Card — required by docs/BUILD.md before renter pays */}
            {live.lease && (
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base flex items-center gap-2">
                    <ShieldCheck className="h-4 w-4 text-sealed" />
                    Deposit Terms
                  </CardTitle>
                  <CardDescription>
                    Paying means you accept these deadlines and the reviewer below. Not even Keyprint can move this deposit outside these rules.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-2.5 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Protected deposit</span>
                    <span className="font-semibold">
                      {formatDollars(live.lease.deposit)}
                    </span>
                  </div>
                  <div className="flex justify-between gap-3">
                    <span className="text-muted-foreground">Lease ends</span>
                    <span className="font-medium text-right">
                      {new Date(live.lease.leaseEnd * 1000).toLocaleString(undefined, {
                        dateStyle: "medium",
                        timeStyle: "short",
                      })}
                    </span>
                  </div>
                  <div className="flex justify-between gap-3">
                    <span className="text-muted-foreground">Dispute reviewer</span>
                    <span
                      className="font-medium text-right"
                      title="The account that rules on disputed claims. It can't be you or your landlord."
                    >
                      Account …{live.lease.reviewer.slice(-4)}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Move-in review window</span>
                    <span className="font-medium">
                      {formatDuration(live.lease.reviewWindow)}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Landlord claim window</span>
                    <span className="font-medium">
                      {formatDuration(live.lease.claimWindow)}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Renter response window</span>
                    <span className="font-medium">
                      {formatDuration(live.lease.responseWindow)}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Reviewer resolve window</span>
                    <span className="font-medium">
                      {formatDuration(live.lease.resolveWindow)}
                    </span>
                  </div>
                  <div className="pt-2 border-t border-border text-xs text-muted-foreground">
                    An unanswered claim counts as accepted after the response window; an unresolved dispute returns to you after the resolve window.
                  </div>
                </CardContent>
              </Card>
            )}

            {!alreadyFunded && (
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base">
                    Move-in pins ({pins.length})
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  {pins.length === 0 ? (
                    <p className="text-xs text-muted-foreground">
                      No pins yet. Tap anything that&apos;s already damaged.
                    </p>
                  ) : (
                    pins.map((p) => (
                      <div
                        key={p.id}
                        className="flex items-start justify-between gap-2 rounded-lg border border-border bg-muted/40 p-2.5 text-xs"
                      >
                        <span className="font-medium">{p.text}</span>
                        <button
                          type="button"
                          onClick={() =>
                            setPins((prev) => prev.filter((x) => x.id !== p.id))
                          }
                          aria-label={`Remove pin: ${p.text}`}
                          className="inline-flex h-9 w-9 items-center justify-center rounded-md text-muted-foreground hover:text-claim cursor-pointer"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    ))
                  )}

                  {error && (
                    <p className="text-xs text-claim" role="alert">
                      {error}
                    </p>
                  )}

                  {!isRenter && live.lease ? (
                    <div className="space-y-3">
                      <p className="text-sm text-muted-foreground">
                        {!session
                          ? "Only this lease’s renter can seal the move-in scan and pay the deposit. Sign in with your passkey, then open this lease again from Your apartments."
                          : session.address.toLowerCase() === live.lease.landlord.toLowerCase()
                            ? "Waiting for your renter to seal the move-in scan and protect the deposit. This page updates by itself."
                            : "Only this lease’s renter can seal the move-in scan and pay the deposit."}
                      </p>
                      {!session && (
                        <Link
                          href="/start"
                          className={cn(buttonVariants({ size: "lg" }), "w-full")}
                        >
                          <Fingerprint className="h-4 w-4" />
                          Sign in with your passkey
                        </Link>
                      )}
                    </div>
                  ) : (
                    <Button
                      size="lg"
                      className="w-full h-auto min-h-12 whitespace-normal py-3 leading-snug max-lg:hidden"
                      disabled={busy !== null || !live.lease}
                      onClick={handleSealAndPay}
                    >
                      <CheckCircle2 className="h-4 w-4 shrink-0" />
                      {busy ??
                        (live.lease
                          ? `Seal & protect ${formatDollars(live.lease.deposit)}`
                          : "Seal & pay")}
                    </Button>
                  )}
                </CardContent>
              </Card>
            )}

            {alreadyFunded && (
              <Link
                href={`/lease/${leaseId}/room`}
                className={cn(buttonVariants({ size: "lg" }), "w-full")}
              >
                Open 3D room &amp; pins
              </Link>
            )}
          </div>
        </div>

        {/* Phones: the seal action stays in reach (desktop keeps the in-card button). */}
        {isRenter && live.lease && !alreadyFunded && !sealedInfo && !pendingTap && (
          <div className="lg:hidden fixed inset-x-0 bottom-0 z-40 border-t border-border bg-surface/95 px-4 pt-2.5 pb-[calc(0.75rem+env(safe-area-inset-bottom))] shadow-[0_-8px_24px_rgba(22,22,22,0.08)] backdrop-blur-md">
            {error && <p className="mb-2 text-sm text-claim">{error}</p>}
            <p className="mb-2 text-center text-xs text-muted-foreground">
              Paying accepts the Deposit Terms on this page.
            </p>
            <Button
              size="lg"
              className="w-full h-auto min-h-12 whitespace-normal py-3 leading-snug"
              disabled={busy !== null || !live.lease}
              onClick={handleSealAndPay}
            >
              <CheckCircle2 className="h-4 w-4 shrink-0" />
              {busy ?? `Seal & protect ${formatDollars(live.lease.deposit)}`}
            </Button>
          </div>
        )}

        {/* Phones: confirm the seal right where the renter tapped. */}
        {sealedInfo && live.lease && (
          <div className="lg:hidden fixed inset-x-0 bottom-0 z-40 space-y-3 border-t border-border bg-surface px-4 pt-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] shadow-[0_-8px_24px_rgba(22,22,22,0.08)]">
            <SealAnimation
              title={`${formatDollars(live.lease.deposit)} deposit protected`}
              sealedAtIso={sealedInfo.sealedAt}
            />
            <Link
              href={`/lease/${leaseId}/room`}
              className={cn(buttonVariants({ size: "lg" }), "w-full")}
            >
              Open 3D room &amp; pins
            </Link>
          </div>
        )}
      </div>
    </LeaseShell>
  );
}
