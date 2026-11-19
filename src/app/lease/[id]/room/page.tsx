"use client";

import { use, useMemo, useState } from "react";
import { CheckCircle2, MapPin } from "lucide-react";
import type { Hex } from "viem";
import { LeaseShell } from "@/components/LeaseShell";
import { useLeaseLiveState } from "@/components/useLeaseLiveState";
import { usePasskeySession } from "@/components/usePasskeySession";
import { RoomViewer, type SurfaceTapEvent } from "@/components/three/RoomViewer";
import type { SpatialPinItem } from "@/components/three/PinMarker";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { RecordKind } from "@/lib/chain/arc";
import {
  buildUnsealedRegistryCalls,
  friendlyError,
  sendSponsoredCalls,
} from "@/lib/chain/wallet";
import { canonicalizeAndHash, type PinManifestV1 } from "@/lib/evidence/manifest";
import { countsAsMoveInPin } from "@/lib/evidence/pin-rules";
import { saveRecordManifest } from "@/lib/evidence/record-store";

export default function LeaseRoomPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: leaseId } = use(params);
  const live = useLeaseLiveState(leaseId);
  const session = usePasskeySession();
  const [pendingTap, setPendingTap] = useState<SurfaceTapEvent | null>(null);
  const [pinText, setPinText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [flyTo, setFlyTo] = useState<{
    position: [number, number, number];
    normal?: [number, number, number];
    nonce: number;
  } | null>(null);

  const isParty =
    Boolean(session && live.lease) &&
    [live.lease!.renter.toLowerCase(), live.lease!.landlord.toLowerCase()].includes(
      session!.address.toLowerCase(),
    );

  const moveInCreatedAt = useMemo(() => {
    if (!live.lease) return null;
    const row = live.records.find(
      (r) => r.record_id.toLowerCase() === live.lease!.moveInRecordId.toLowerCase(),
    );
    return row?.chain_created_at ?? null;
  }, [live.records, live.lease]);

  const sealedPins = useMemo(() => {
    return live.records
      .filter((r) => r.kind === RecordKind.Pin)
      .map((r) => {
        try {
          const m = JSON.parse(r.manifest_json) as PinManifestV1;
          const coSignedTs = live.coSignedMap[r.record_id.toLowerCase()] || 0;
          const countsAsMoveIn = countsAsMoveInPin({
            pinAuthor: r.author,
            pinCreatedAt: r.chain_created_at,
            coSignedByLandlord: coSignedTs > 0,
            lease: live.lease,
            moveInCreatedAt,
          });
          const isLandlordPin =
            live.lease &&
            r.author.toLowerCase() === live.lease.landlord.toLowerCase();
          return {
            record: r,
            manifest: m,
            coSigned: coSignedTs > 0,
            countsAsMoveIn,
            isLandlordPin: Boolean(isLandlordPin),
          };
        } catch {
          return null;
        }
      })
      .filter((x): x is NonNullable<typeof x> => x !== null);
  }, [live.records, live.coSignedMap, live.lease, moveInCreatedAt]);

  const viewerPins: SpatialPinItem[] = [
    ...sealedPins.map((p) => ({
      id: p.record.record_id,
      position: p.manifest.position,
      normal: p.manifest.normal,
      label: p.manifest.text,
      variant: p.coSigned
        ? ("sealed" as const)
        : p.isLandlordPin
          ? ("landlord" as const)
          : ("renter" as const),
    })),
    ...(pendingTap
      ? [
          {
            id: "draft-pin",
            position: pendingTap.point,
            normal: pendingTap.normal,
            label: "New pin",
            variant: "renter" as const,
            selected: true,
          },
        ]
      : []),
  ];

  const handleSealPin = async () => {
    if (!session || !live.lease || !pendingTap || !pinText.trim()) return;
    setError(null);
    setBusy(true);
    try {
      const pinManifest: PinManifestV1 = {
        type: "keyprint.pin.v1",
        leaseId: leaseId as Hex,
        scanRecordId: live.lease.moveInRecordId,
        position: pendingTap.point,
        normal: pendingTap.normal,
        text: pinText.trim(),
        photoSha256: null,
        author: session.address,
      };
      const canon = await canonicalizeAndHash(pinManifest);
      const { calls, recordIds } = await buildUnsealedRegistryCalls(session.address, [
        {
          unitId: live.lease.unitId,
          leaseId: leaseId as Hex,
          kind: RecordKind.Pin,
          contentHash: canon.contentHash,
        },
      ]);
      // An identical pin that's already sealed (a retry) needs no new transaction.
      const op = calls.length > 0 ? await sendSponsoredCalls(session, calls) : null;
      const saved = await saveRecordManifest({
        record_id: recordIds[0],
        lease_id: leaseId,
        manifest_json: canon.canonicalJson,
        tx_hash: op?.txHash ?? null,
        gas_cost_wei: op ? op.actualGasCost.toString() : "0",
      });
      if (!saved.ok) {
        setError(
          "Pin sealed on Arc, but its details haven't reached Keyprint's index yet. This page will retry next time it opens.",
        );
      }
      setPendingTap(null);
      setPinText("");
      await live.refresh();
    } catch (err) {
      setError(friendlyError(err, "Could not seal this pin. Nothing was sent."));
    } finally {
      setBusy(false);
    }
  };

  return (
    <LeaseShell leaseId={leaseId} live={live}>
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          {live.signedUrls.moveInScan ? (
            <RoomViewer
              url={live.signedUrls.moveInScan}
              pins={viewerPins}
              flyTo={flyTo}
              onSurfaceTap={isParty ? (tap) => setPendingTap(tap) : undefined}
              onPinSelect={(pin) =>
                setFlyTo({
                  position: pin.position,
                  normal: pin.normal,
                  nonce: Date.now(),
                })
              }
              heightClassName="h-[55vh] max-h-[520px] min-h-[320px]"
              hint={
                isParty
                  ? "Tap any spot in the room to leave a timestamped pin"
                  : "Sign in as the renter or landlord to add pins"
              }
            />
          ) : (
            <div className="rounded-2xl border border-border bg-muted/40 p-6 text-sm text-muted-foreground">
              The move-in scan for this lease isn&apos;t available yet.
            </div>
          )}
        </div>

        <div className="space-y-4">
          {pendingTap && (
            <Card className="border-accent/40">
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-1.5">
                  <MapPin className="h-4 w-4 text-accent" />
                  Seal a new pin
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <input
                  type="text"
                  value={pinText}
                  onChange={(e) => setPinText(e.target.value)}
                  placeholder="e.g. Leak under sink, reported"
                  className="w-full h-10 rounded-lg border border-border bg-background px-3 text-sm"
                />
                {error && <p className="text-xs text-claim">{error}</p>}
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    disabled={busy || !pinText.trim()}
                    onClick={handleSealPin}
                    className="flex-1"
                  >
                    {busy ? "Sealing…" : "Seal pin"}
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
                Sealed pins ({sealedPins.length})
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2.5">
              {sealedPins.length === 0 ? (
                <p className="text-xs text-muted-foreground">
                  {isParty
                    ? "No pins yet. Tap anything that's already damaged."
                    : "No pins sealed yet."}
                </p>
              ) : (
                sealedPins.map((p) => {
                  const dateStr = new Date(p.record.sealed_at).toLocaleDateString(
                    "en-US",
                    { month: "short", day: "numeric" },
                  );
                  return (
                    <button
                      key={p.record.record_id}
                      type="button"
                      onClick={() =>
                        setFlyTo({
                          position: p.manifest.position,
                          normal: p.manifest.normal,
                          nonce: Date.now(),
                        })
                      }
                      className="w-full text-left rounded-xl border border-border bg-muted/40 hover:bg-muted p-3 space-y-1.5 transition-colors cursor-pointer"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <span className="text-sm font-medium text-foreground">
                          {p.manifest.text}
                        </span>
                        {p.coSigned && (
                          <Badge variant="sealed">
                            <CheckCircle2 className="h-3 w-3" />
                            Co-signed
                          </Badge>
                        )}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {p.countsAsMoveIn
                          ? `Move-in evidence · Sealed ${dateStr}`
                          : `Pinned during lease · ${dateStr}`}
                      </div>
                    </button>
                  );
                })
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </LeaseShell>
  );
}
