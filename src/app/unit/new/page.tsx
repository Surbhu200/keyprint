"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { MapPin, ShieldCheck, Trash2, Upload } from "lucide-react";
import { AppNav } from "@/components/AppNav";
import { SealAnimation } from "@/components/SealAnimation";
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
  loadSavedSession,
  sendSponsoredCalls,
  type SavedPasskeySession,
} from "@/lib/chain/wallet";
import { sha256Blob } from "@/lib/evidence/hash";
import {
  canonicalizeAndHash,
  ZERO_BYTES32,
  type EvidenceManifestV1,
  type PinManifestV1,
} from "@/lib/evidence/manifest";
import { REFERENCE_MOVE_IN_URL } from "@/lib/sample/reference";
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
  const [session, setSession] = useState<SavedPasskeySession | null>(null);
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
  const [sealedRecord, setSealedRecord] = useState<{
    recordId: string;
    txHash: string;
    sealedAt: string;
    manifestJson: string;
  } | null>(null);

  useEffect(() => {
    setSession(loadSavedSession());
  }, []);

  const handleScanChange = (file: File) => {
    setScanFile(file);
    setScanName(file.name);
    setScanUrl(URL.createObjectURL(file));
    setPins([]);
    setSealedRecord(null);
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
    setError(null);
    setBusy("Hashing your 3D scan…");

    try {
      const scanBlob: Blob =
        scanFile ?? (await fetch(scanUrl).then((r) => r.blob()));
      const scanSha256 = await sha256Blob(scanBlob, (pct) =>
        setBusy(`Hashing 3D scan… ${pct}%`),
      );

      // Upload privately if Supabase is configured (graceful if testing locally without Supabase)
      let scanPath = scanUrl;
      try {
        setBusy("Uploading 3D scan privately…");
        const uploaded = await uploadToPrivateStorage({
          file: scanBlob,
          filename: scanName,
          contentType: "model/gltf-binary",
          scope: "solo",
        });
        scanPath = uploaded.path;
      } catch {
        // Still allow sealing if using built-in reference scan without Supabase configured
        if (scanFile) {
          throw new Error(
            "Private storage upload failed. Check your Supabase env vars in .env.local.",
          );
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
      const op = await sendSponsoredCalls(session, allCalls);

      // Persist exact canonical manifests in index (best-effort; chain is source of truth)
      await fetch("/api/records", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          record_id: moveInRecordId,
          unit_id: unitId,
          lease_id: ZERO_BYTES32,
          kind: RecordKind.MoveInScan,
          content_hash: scanCanon.contentHash,
          author: session.address,
          manifest_json: scanCanon.canonicalJson,
          file_paths: [scanPath],
          tx_hash: op.txHash,
          block_number: Number(op.blockNumber),
          gas_cost_wei: op.actualGasCost.toString(),
        }),
      }).catch(() => null);

      for (let i = 0; i < pinPrepared.length; i++) {
        await fetch("/api/records", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            record_id: pinRecordIds[i],
            unit_id: unitId,
            lease_id: ZERO_BYTES32,
            kind: RecordKind.Pin,
            content_hash: pinPrepared[i].contentHash,
            author: session.address,
            manifest_json: pinPrepared[i].canonicalJson,
            file_paths: pinPrepared[i].photoPath ? [pinPrepared[i].photoPath] : [],
            tx_hash: op.txHash,
            block_number: Number(op.blockNumber),
          }),
        }).catch(() => null);
      }

      setSealedRecord({
        recordId: moveInRecordId,
        txHash: op.txHash,
        sealedAt: new Date().toISOString(),
        manifestJson: scanCanon.canonicalJson,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not seal apartment.");
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

      <main className="flex-1 mx-auto w-full max-w-6xl px-5 py-8 space-y-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="space-y-1">
            <Badge variant="sealed">Solo mode · Free · No landlord needed</Badge>
            <h1 className="text-2xl font-semibold tracking-tight">
              Seal your apartment on move-in day
            </h1>
            <p className="text-sm text-muted-foreground">
              Import your 3D scan, tap anything that&apos;s already damaged, and seal the timestamped proof in one touch.
            </p>
          </div>

          {!session && (
            <Link
              href="/start"
              className={cn(buttonVariants({ variant: "default" }))}
            >
              Sign in with passkey to seal
            </Link>
          )}
        </div>

        {sealedRecord && (
          <SealAnimation
            title={`${unitName} · ${pins.length} move-in pin${pins.length === 1 ? "" : "s"}`}
            subtitle="Anyone with the file and manifest can verify it existed today without trusting Keyprint."
            sealedAtIso={sealedRecord.sealedAt}
            recordId={sealedRecord.recordId}
          />
        )}

        <div className="grid gap-6 lg:grid-cols-3">
          <div className="lg:col-span-2 space-y-4">
            <RoomViewer
              url={scanUrl}
              pins={viewerPins}
              onSurfaceTap={(tap) => setPendingTap(tap)}
              heightClassName="h-[480px]"
              hint="Tap any wall, desk, or floor spot to pin existing damage"
            />
          </div>

          <div className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Apartment &amp; 3D scan</CardTitle>
                <CardDescription>
                  Using {scanName}. Export `.glb` from Scaniverse or Polycam, or test with the built-in room scan.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <input
                  type="text"
                  value={unitName}
                  onChange={(e) => setUnitName(e.target.value)}
                  className="w-full h-10 rounded-lg border border-border bg-background px-3 text-sm"
                  placeholder="Unit name"
                />
                <label className="flex items-center justify-center gap-2 h-10 rounded-lg border border-dashed border-border bg-muted/40 px-3 text-xs font-medium cursor-pointer hover:bg-muted">
                  <Upload className="h-3.5 w-3.5" />
                  <span>Import .glb scan from device</span>
                  <input
                    type="file"
                    accept=".glb,model/gltf-binary"
                    className="hidden"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) handleScanChange(f);
                    }}
                  />
                </label>
              </CardContent>
            </Card>

            {pendingTap && (
              <Card className="border-accent/40">
                <CardHeader className="pb-3">
                  <CardTitle className="text-base flex items-center gap-1.5">
                    <MapPin className="h-4 w-4 text-accent" />
                    Add move-in pin
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <input
                    type="text"
                    value={pinText}
                    onChange={(e) => setPinText(e.target.value)}
                    placeholder="e.g. Scratch on desk, already here"
                    className="w-full h-10 rounded-lg border border-border bg-background px-3 text-sm"
                  />
                  <label className="block text-xs text-muted-foreground">
                    Optional close-up photo
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

            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">
                  Move-in pins ({pins.length})
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2.5">
                {pins.length === 0 ? (
                  <p className="text-xs text-muted-foreground">
                    No pins yet. Tap anything in the 3D room that&apos;s already damaged.
                  </p>
                ) : (
                  pins.map((p) => (
                    <div
                      key={p.id}
                      className="flex items-start justify-between gap-2 rounded-lg border border-border bg-muted/40 p-2.5 text-xs"
                    >
                      <div>
                        <div className="font-medium text-foreground">{p.text}</div>
                        <div className="text-muted-foreground">
                          {p.photoFile ? `Photo: ${p.photoFile.name}` : "Spatial pin"}
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() =>
                          setPins((prev) => prev.filter((item) => item.id !== p.id))
                        }
                        className="text-muted-foreground hover:text-claim p-1 cursor-pointer"
                        aria-label="Remove pin"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  ))
                )}

                {error && <p className="text-xs text-claim pt-1">{error}</p>}

                <Button
                  className="w-full mt-2"
                  size="lg"
                  disabled={busy !== null || !session}
                  onClick={handleSealSolo}
                >
                  <ShieldCheck className="h-4 w-4" />
                  {busy ?? "Seal my apartment"}
                </Button>
              </CardContent>
            </Card>
          </div>
        </div>
      </main>
    </div>
  );
}
