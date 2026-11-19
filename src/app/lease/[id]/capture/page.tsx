"use client";

import { use, useState } from "react";
import Link from "next/link";
import { encodeFunctionData, erc20Abi, type Hex } from "viem";
import {
  CheckCircle2,
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
        { onSubmitted: () => setBusy("Sealing on Arc…") },
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
          "Sealed on Arc. Some details haven't reached Keyprint's index yet; this page retries them the next time it opens.",
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
      <div className="space-y-6">
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
              <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
                <span>Loaded: {scanName}</span>
                <div className="flex items-center gap-2">
                  {!scanFile && (
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      title="Demo shortcut for the bundled sample model"
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
                  <label className="inline-flex items-center gap-1.5 rounded-md border border-border bg-surface px-3 py-1.5 font-medium text-foreground cursor-pointer hover:bg-muted">
                    <Upload className="h-3.5 w-3.5" />
                    Import custom .glb
                    <input
                      type="file"
                      accept=".glb,model/gltf-binary"
                      className="hidden"
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
                </div>
              </div>
            )}
          </div>

          <div className="space-y-4">
            {pendingTap && !alreadyFunded && (
              <Card className="border-accent/40">
                <CardHeader className="pb-3">
                  <CardTitle className="text-base flex items-center gap-1.5">
                    <MapPin className="h-4 w-4 text-accent" />
                    Pin existing damage
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <input
                    type="text"
                    value={pinText}
                    onChange={(e) => setPinText(e.target.value)}
                    placeholder="Scratch on desk, already here"
                    className="w-full h-10 rounded-lg border border-border bg-background px-3 text-sm"
                  />
                  <label className="block text-xs text-muted-foreground">
                    Attach photo (hashed into proof)
                    <input
                      type="file"
                      accept="image/*"
                      onChange={(e) => setPinPhoto(e.target.files?.[0] ?? null)}
                      className="mt-1 block w-full text-xs"
                    />
                  </label>
                  <div className="flex gap-2">
                    <Button size="sm" onClick={handleAddPin} className="flex-1">
                      Already here
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => setPendingTap(null)}
                    >
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
                    <p className="text-xs text-muted-foreground">
                      Sign in with the renter&apos;s passkey to seal and protect this deposit.
                    </p>
                  ) : (
                    <Button
                      size="lg"
                      className="w-full"
                      disabled={busy !== null || !live.lease}
                      onClick={handleSealAndPay}
                    >
                      <CheckCircle2 className="h-4 w-4" />
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
      </div>
    </LeaseShell>
  );
}
