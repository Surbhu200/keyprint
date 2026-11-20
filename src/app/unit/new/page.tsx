"use client";

import { useState } from "react";
import Link from "next/link";
import { Camera, MapPin, ScanFace, ShieldCheck, Trash2, Upload } from "lucide-react";
import { AppNav } from "@/components/AppNav";
import { SealAnimation } from "@/components/SealAnimation";
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
import {
  RecordKind,
  stringToBytes32,
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
  ZERO_BYTES32,
  type EvidenceManifestV1,
  type PinManifestV1,
} from "@/lib/evidence/manifest";
import { saveRecordManifests } from "@/lib/evidence/record-store";
import { REFERENCE_MOVE_IN_URL } from "@/lib/sample/reference";
import { isGlbFile, NOT_A_GLB_MESSAGE } from "@/lib/scan-file";
import { uploadToPrivateStorage } from "@/lib/supabase/upload";
import { cn } from "@/lib/utils";

interface DraftPin {
  id: string;
  position: [number, number, number];
  normal: [number, number, number];
  text: string;
  photoFile?: File | null;
}

export default function SoloNewUnitPage() {
  const session = usePasskeySession();
  const [unitName, setUnitName] = useState("My Apartment · Move-in");
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
  const [sealedRecord, setSealedRecord] = useState<{
    recordId: string;
    txHash: string;
    sealedAt: string;
    manifestJson: string;
  } | null>(null);

  const handleScanChange = (file: File) => {
    setScanFile(file);
    setScanName(file.name);
    setScanUrl(URL.createObjectURL(file));
    setPins([]);
    setPendingTap(null);
    setSealedRecord(null);
    setNotice(null);
    setError(null);
  };

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

  const handleSealSolo = async () => {
    if (!session) {
      setError("Sign in with your passkey first to seal your apartment.");
      return;
    }
    if (sealedRecord) return;
    setError(null);
    setNotice(null);
    setBusy("Hashing your 3D scan…");

    try {
      const scanBlob: Blob =
        scanFile ?? (await fetch(scanUrl).then((r) => r.blob()));
      const scanSha256 = await sha256Blob(scanBlob, (pct) =>
        setBusy(`Hashing 3D scan… ${pct}%`),
      );

      // Your own scan is kept in private storage. The bundled sample model is public already,
      // so it is sealed by its fingerprint without uploading another copy.
      let scanPath: string | null = null;
      if (scanFile) {
        setBusy("Uploading 3D scan privately…");
        try {
          const uploaded = await uploadToPrivateStorage({
            file: scanBlob,
            filename: scanName,
            contentType: "model/gltf-binary",
            scope: "solo",
          });
          scanPath = uploaded.path;
        } catch {
          throw new Error("Could not upload your scan to private storage. Nothing was sealed.");
        }
      }

      const unitId = stringToBytes32(`${unitName}-${session.address}-${Date.now()}`);
      const evidenceManifest: EvidenceManifestV1 = {
        type: "keyprint.evidence.v1",
        leaseId: ZERO_BYTES32,
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

      const scanCanon = await canonicalizeAndHash(evidenceManifest);

      // Compute MoveInScan recordId before building pin manifests
      const { calls: scanCalls, recordIds: scanIds } =
        await buildUnsealedRegistryCalls(session.address, [
          {
            unitId,
            leaseId: ZERO_BYTES32,
            kind: RecordKind.MoveInScan,
            contentHash: scanCanon.contentHash,
          },
        ]);
      const moveInRecordId = scanIds[0];

      // Build each pin manifest
      const pinPrepared: Array<{
        manifest: PinManifestV1;
        canonicalJson: string;
        contentHash: `0x${string}`;
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
              scope: "solo-photos",
            });
            photoPath = up.path;
          } catch {
            // Optional photo storage fallback
          }
        }

        const pinManifest: PinManifestV1 = {
          type: "keyprint.pin.v1",
          leaseId: ZERO_BYTES32,
          scanRecordId: moveInRecordId,
          position: p.position,
          normal: p.normal,
          text: p.text,
          photoSha256,
          author: session.address,
        };
        const pinCanon = await canonicalizeAndHash(pinManifest);
        pinPrepared.push({
          manifest: pinManifest,
          canonicalJson: pinCanon.canonicalJson,
          contentHash: pinCanon.contentHash,
          photoPath,
        });
      }

      const { calls: pinCalls, recordIds: pinRecordIds } =
        await buildUnsealedRegistryCalls(
          session.address,
          pinPrepared.map((p) => ({
            unitId,
            leaseId: ZERO_BYTES32,
            kind: RecordKind.Pin,
            contentHash: p.contentHash,
          })),
        );

      const allCalls = [...scanCalls, ...pinCalls];
      setBusy("Confirm with one touch to seal…");
      const op = await sendSponsoredCalls(session, allCalls, {
        onSubmitted: () => setBusy("Sealing record…"),
      });

      // Save the exact manifest bytes (local backup + retries; see record-store).
      // Arc is the source of truth; the index is how the Verify page finds them by file.
      const failedSaves = await saveRecordManifests([
        {
          record_id: moveInRecordId,
          lease_id: ZERO_BYTES32,
          manifest_json: scanCanon.canonicalJson,
          file_paths: scanPath ? [scanPath] : [],
          tx_hash: op.txHash,
          gas_cost_wei: op.actualGasCost.toString(),
        },
        ...pinPrepared.map((p, i) => ({
          record_id: pinRecordIds[i],
          lease_id: ZERO_BYTES32,
          manifest_json: p.canonicalJson,
          file_paths: p.photoPath ? [p.photoPath] : [],
          tx_hash: op.txHash,
        })),
      ]);

      setSealedRecord({
        recordId: moveInRecordId,
        txHash: op.txHash,
        sealedAt: await sealTimeIso(op.blockNumber),
        manifestJson: scanCanon.canonicalJson,
      });
      if (failedSaves > 0) {
        setNotice(
          "Sealed. Some details haven't reached Keyprint's index yet; they'll sync the next time you open Keyprint in this browser.",
        );
      }
    } catch (err) {
      setError(friendlyError(err, "Your apartment wasn't sealed. Nothing was sent."));
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
      variant: sealedRecord ? ("sealed" as const) : ("renter" as const),
    })),
    ...(pendingTap
      ? [
          {
            id: "pending",
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
    <div className="min-h-screen flex flex-col">
      <AppNav
        receipts={
          sealedRecord
            ? [{ label: "Solo move-in sealed", txHash: sealedRecord.txHash }]
            : []
        }
      />

      <main
        className={cn(
          "flex-1 mx-auto w-full max-w-6xl px-4 py-6 space-y-6 sm:px-5 sm:py-8",
          !sealedRecord && "max-lg:pb-24",
        )}
      >
        <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-4">
          <div className="max-w-2xl space-y-3">
            <Badge variant="sealed" className="min-h-7 px-3 text-[13px]">
              Solo mode, free, no landlord needed
            </Badge>
            <h1 className="font-display text-[32px] leading-[1.05] font-semibold tracking-[-0.03em] text-balance sm:text-[40px]">
              Seal your apartment on move-in day
            </h1>
            <p className="max-w-[56ch] text-[15px] leading-relaxed text-muted-foreground sm:text-base">
              Import your 3D scan, tap anything that&apos;s already damaged, and seal the timestamped proof in one touch.
            </p>
          </div>

          {!session && (
            <Link
              href="/start"
              className={cn(
                buttonVariants({ variant: "default" }),
                "h-12 rounded-2xl bg-ink px-5 text-[15px] text-white hover:bg-ink-2 max-lg:hidden",
              )}
            >
              Sign in with passkey to seal
            </Link>
          )}
        </div>

        {sealedRecord && (
          <section className="card-soft px-4 sm:px-8">
            <SealAnimation
              size="hero"
              // Keep a " · " in the name from starting a new line on its own.
              title={unitName.replace(/ · /g, "\u00a0· ")}
              subtitle={`${pins.length} move-in pin${pins.length === 1 ? "" : "s"} sealed with the scan. Anyone with the file and manifest can verify it existed today without trusting Keyprint.`}
              sealedAtIso={sealedRecord.sealedAt}
              recordId={sealedRecord.recordId}
            />
          </section>
        )}

        <div className="grid gap-6 lg:grid-cols-3">
          <div className="lg:col-span-2 space-y-4">
            <RoomViewer
              url={scanUrl}
              pins={viewerPins}
              onSurfaceTap={sealedRecord ? undefined : (tap) => setPendingTap(tap)}
              heightClassName="h-[55vh] max-h-[520px] min-h-[320px]"
              hint={
                sealedRecord
                  ? "Sealed. Drag to look around."
                  : "Tap any wall, desk, or floor spot to pin existing damage"
              }
            />
          </div>

          <div className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Apartment &amp; 3D scan</CardTitle>
                <CardDescription>
                  {scanFile
                    ? `Using your scan: ${scanName}.`
                    : "Showing a sample scan (a public research scan of a real apartment), not your home. Import a .glb exported from Scaniverse or Polycam to seal your own."}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <input
                  type="text"
                  value={unitName}
                  onChange={(e) => setUnitName(e.target.value)}
                  disabled={Boolean(sealedRecord)}
                  aria-label="Apartment name"
                  className="w-full h-14 rounded-2xl border-0 bg-muted px-4 text-[17px] text-foreground placeholder:text-muted-foreground/70 transition-shadow duration-200 focus:outline-none focus:ring-2 focus:ring-accent disabled:opacity-60"
                  placeholder="Unit name"
                />
                <label className="flex min-h-14 cursor-pointer items-center justify-center gap-2 rounded-2xl border border-dashed border-border bg-surface px-4 text-[15px] font-medium text-foreground transition-colors duration-200 hover:bg-muted focus-within:ring-2 focus-within:ring-accent">
                  <Upload className="h-4 w-4 shrink-0 text-accent" />
                  <span>Import .glb scan from device</span>
                  <input
                    type="file"
                    className="sr-only"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f && !isGlbFile(f)) {
                        window.alert(NOT_A_GLB_MESSAGE);
                        e.target.value = "";
                        return;
                      }
                      if (f) handleScanChange(f);
                    }}
                  />
                </label>
              </CardContent>
            </Card>

            {pendingTap && (
              // Phones: a bottom sheet over the tab bar that slides up via @starting-style (no JS);
              // instant with Reduce Motion. Desktop keeps it in the side column.
              <Card className="border-accent/40 transition-[translate,opacity] duration-200 ease-out motion-reduce:transition-none max-lg:fixed max-lg:inset-x-0 max-lg:bottom-0 max-lg:z-40 max-lg:max-h-[80svh] max-lg:overflow-y-auto max-lg:rounded-b-none max-lg:rounded-t-[28px] max-lg:border-x-0 max-lg:border-b-0 max-lg:pb-[env(safe-area-inset-bottom)] max-lg:shadow-[0_-12px_40px_-8px_rgba(14,17,22,0.25)] max-lg:starting:translate-y-6 max-lg:starting:opacity-0">
                <div aria-hidden="true" className="mx-auto mt-2 h-1 w-10 rounded-full bg-border lg:hidden" />
                <CardHeader className="pb-3 max-lg:px-4 max-lg:pt-2 max-lg:pb-2">
                  <CardTitle className="text-base flex items-center gap-1.5">
                    <MapPin className="h-4 w-4 text-accent" />
                    Add move-in pin
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3 max-lg:space-y-2.5 max-lg:px-4 max-lg:pb-4">
                  <input
                    type="text"
                    value={pinText}
                    onChange={(e) => setPinText(e.target.value)}
                    placeholder="e.g. Scratch on desk, already here"
                    aria-label="Describe this spot"
                    className="w-full h-14 rounded-2xl border-0 bg-muted px-4 text-[17px] text-foreground placeholder:text-muted-foreground/70 transition-shadow duration-200 focus:outline-none focus:ring-2 focus:ring-accent"
                  />
                  <label className="flex min-h-12 cursor-pointer items-center justify-center gap-2 rounded-2xl border border-dashed border-border bg-surface px-4 text-[15px] font-medium text-foreground transition-colors duration-200 hover:bg-muted focus-within:ring-2 focus-within:ring-accent">
                    <Camera className="h-4 w-4 shrink-0 text-accent" />
                    <span className="min-w-0 truncate">
                      {pinPhoto ? `Photo added · ${pinPhoto.name}` : "Optional close-up photo"}
                    </span>
                    <input
                      type="file"
                      accept="image/*"
                      onChange={(e) => setPinPhoto(e.target.files?.[0] ?? null)}
                      className="sr-only"
                    />
                  </label>
                  <div className="flex gap-2">
                    <Button
                      onClick={handleAddPin}
                      className="h-12 flex-1 rounded-2xl bg-ink text-[15px] text-white hover:bg-ink-2"
                    >
                      Already here
                    </Button>
                    <Button
                      variant="ghost"
                      className="h-12 rounded-2xl px-5 text-[15px]"
                      onClick={() => setPendingTap(null)}
                    >
                      Cancel
                    </Button>
                  </div>
                </CardContent>
              </Card>
            )}

            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">
                  Move-in pins ({pins.length})
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2.5">
                {pins.length === 0 ? (
                  <p className="text-[13px] leading-snug text-muted-foreground">
                    No pins yet. Tap anything in the 3D room that&apos;s already damaged.
                  </p>
                ) : (
                  pins.map((p) => (
                    <div
                      key={p.id}
                      className="flex items-center justify-between gap-2 rounded-2xl bg-muted py-2 pl-4 pr-1.5 text-[13px] leading-snug"
                    >
                      <div className="min-w-0">
                        <div className="text-[15px] font-medium text-foreground break-words">{p.text}</div>
                        <div className="text-muted-foreground">
                          {p.photoFile ? `Photo: ${p.photoFile.name}` : "Spatial pin"}
                        </div>
                      </div>
                      {!sealedRecord && (
                        <button
                          type="button"
                          onClick={() =>
                            setPins((prev) => prev.filter((item) => item.id !== p.id))
                          }
                          className="inline-flex h-11 w-11 shrink-0 cursor-pointer items-center justify-center rounded-xl text-muted-foreground transition-colors hover:bg-surface hover:text-claim"
                          aria-label={`Remove pin: ${p.text}`}
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      )}
                    </div>
                  ))
                )}

                {error && (
                  <p className="text-sm text-claim pt-1 max-lg:hidden" role="alert">
                    {error}
                  </p>
                )}
                {notice && <p className="text-[13px] leading-snug text-muted-foreground pt-1">{notice}</p>}

                <Button
                  className={cn(
                    "w-full mt-2 h-auto min-h-14 whitespace-normal rounded-[18px] bg-ink py-3.5 text-center text-[17px] leading-snug text-white hover:bg-ink-2",
                    !sealedRecord && "max-lg:hidden",
                  )}
                  size="lg"
                  disabled={busy !== null || !session || Boolean(sealedRecord)}
                  onClick={handleSealSolo}
                >
                  <ScanFace className="h-5 w-5 shrink-0" />
                  {busy ?? (sealedRecord ? "Sealed" : "Seal my apartment")}
                </Button>
                {sealedRecord && (
                  <Link
                    href={`/verify?recordId=${sealedRecord.recordId}`}
                    className={cn(
                      buttonVariants({ variant: "outline" }),
                      "h-12 w-full rounded-2xl text-[15px]",
                    )}
                  >
                    <ShieldCheck className="h-4 w-4 text-sealed" />
                    Check it on Verify
                  </Link>
                )}
              </CardContent>
            </Card>
          </div>
        </div>

        {/* Phones: the seal action stays in reach (desktop keeps the in-card button). */}
        {!sealedRecord && !pendingTap && (
          <div className="lg:hidden fixed inset-x-3 bottom-3 z-40 rounded-[28px] bg-surface/90 p-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] ring-1 ring-black/5 shadow-[0_12px_40px_-12px_rgba(14,17,22,0.35)] backdrop-blur-xl">
            {error && (
              <p className="mb-2 px-1 text-sm leading-snug text-claim" role="alert">
                {error}
              </p>
            )}
            <div className="flex items-baseline justify-between px-1 pb-2">
              <span className="text-[13px] text-muted-foreground">Move-in pins</span>
              <span className="text-[15px] font-semibold tabular-nums text-foreground">
                {pins.length}
              </span>
            </div>
            {session ? (
              <Button
                size="lg"
                className="w-full h-auto min-h-14 whitespace-normal rounded-[18px] bg-ink py-3.5 text-center text-[17px] font-semibold leading-snug text-white hover:bg-ink-2"
                disabled={busy !== null}
                onClick={handleSealSolo}
              >
                <ScanFace className="h-5 w-5 shrink-0" />
                {busy ?? "Seal my apartment"}
              </Button>
            ) : (
              <Link
                href="/start"
                className={cn(
                  buttonVariants({ size: "lg" }),
                  "w-full h-auto min-h-14 whitespace-normal rounded-[18px] bg-ink py-3.5 text-center text-[17px] font-semibold leading-snug text-white hover:bg-ink-2",
                )}
              >
                <ScanFace className="h-5 w-5 shrink-0" />
                Sign in with passkey to seal
              </Link>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
