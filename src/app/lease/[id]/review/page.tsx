"use client";

import { use, useMemo, useState } from "react";
import { encodeFunctionData, type Hex } from "viem";
import { AlertTriangle, CheckCircle2, UserCheck } from "lucide-react";
import { LeaseShell } from "@/components/LeaseShell";
import { SealAnimation } from "@/components/SealAnimation";
import { useLeaseLiveState } from "@/components/useLeaseLiveState";
import { usePasskeySession } from "@/components/usePasskeySession";
import { RoomViewer } from "@/components/three/RoomViewer";
import type { SpatialPinItem } from "@/components/three/PinMarker";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  getRegistryAddress,
  KEYPRINT_REGISTRY_ABI,
  RecordKind,
} from "@/lib/chain/arc";
import { friendlyError, sendSponsoredCalls } from "@/lib/chain/wallet";
import { sha256HexToBytes32, sha256Text } from "@/lib/evidence/hash";
import type { PinManifestV1 } from "@/lib/evidence/manifest";
import { countsAsMoveInPin } from "@/lib/evidence/pin-rules";

export default function LeaseReviewPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: leaseId } = use(params);
  const live = useLeaseLiveState(leaseId);
  const session = usePasskeySession();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [contestingId, setContestingId] = useState<string | null>(null);
  const [contestNote, setContestNote] = useState("");
  const [flyTo, setFlyTo] = useState<{
    position: [number, number, number];
    normal?: [number, number, number];
    nonce: number;
  } | null>(null);

  const isLandlord =
    session &&
    live.lease &&
    session.address.toLowerCase() === live.lease.landlord.toLowerCase();

  // Onchain seal time of the lease's move-in record (records here are verified against Arc).
  const moveInCreatedAt = useMemo(() => {
    if (!live.lease) return null;
    const row = live.records.find(
      (r) => r.record_id.toLowerCase() === live.lease!.moveInRecordId.toLowerCase(),
    );
    return row?.chain_created_at ?? null;
  }, [live.records, live.lease]);

  // Renter pins only. A pin can be co-signed as move-in evidence only if it was sealed in the
  // review window after move-in; later pins are shown for context but never co-signed here.
  const pinItems = useMemo(() => {
    const lease = live.lease;
    return live.records
      .filter(
        (r) =>
          r.kind === RecordKind.Pin &&
          lease &&
          r.author.toLowerCase() === lease.renter.toLowerCase(),
      )
      .map((r) => {
        try {
          const m = JSON.parse(r.manifest_json) as PinManifestV1;
          return {
            recordId: r.record_id,
            manifest: m,
            coSigned: (live.coSignedMap[r.record_id.toLowerCase()] || 0) > 0,
            sealedAt: r.sealed_at,
            inMoveInWindow: countsAsMoveInPin({
              pinAuthor: r.author,
              pinCreatedAt: r.chain_created_at,
              coSignedByLandlord: false,
              lease,
              moveInCreatedAt,
            }),
          };
        } catch {
          return null;
        }
      })
      .filter((x): x is NonNullable<typeof x> => x !== null);
  }, [live.records, live.coSignedMap, live.lease, moveInCreatedAt]);

  // Exactly what "Co-sign" will sign: the lease's move-in record plus renter pins from the
  // move-in window that aren't co-signed yet. Every id here is a verified, existing record.
  const unacknowledgedIds = useMemo(() => {
    const ids = new Set<string>();
    const moveInId = live.lease?.moveInRecordId?.toLowerCase();
    if (
      moveInId &&
      moveInId !== "0x0000000000000000000000000000000000000000000000000000000000000000"
    ) {
      ids.add(moveInId);
    }
    for (const p of pinItems) {
      if (p.inMoveInWindow) ids.add(p.recordId.toLowerCase());
    }
    return Array.from(ids).filter((id) => !(live.coSignedMap[id] > 0));
  }, [live.lease, pinItems, live.coSignedMap]);

  const allCoSigned =
    Boolean(live.lease?.moveInRecordId) &&
    live.lease!.moveInRecordId !==
      "0x0000000000000000000000000000000000000000000000000000000000000000" &&
    unacknowledgedIds.length === 0;

  // Prompt 2 (batched): landlord acknowledges move-in manifest + every move-in pin in one prompt
  const handleCoSignAll = async () => {
    if (!session || unacknowledgedIds.length === 0) return;
    const registry = getRegistryAddress();
    if (!registry) {
      setError("Registry contract address is not configured.");
      return;
    }

    setError(null);
    setBusy("Confirm with one touch to co-sign move-in record…");
    try {
      const calls = unacknowledgedIds.map((recordId) => ({
        to: registry,
        data: encodeFunctionData({
          abi: KEYPRINT_REGISTRY_ABI,
          functionName: "acknowledge",
          args: [recordId as Hex],
        }),
      }));

      const op = await sendSponsoredCalls(session, calls);
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
      setError(friendlyError(err, "Co-sign didn't go through. Nothing was sent."));
    } finally {
      setBusy(null);
    }
  };

  const handleContestPin = async (recordId: string) => {
    if (!session || !contestNote.trim()) return;
    const registry = getRegistryAddress();
    if (!registry) return;
    setError(null);
    setBusy("Filing counter-note…");
    try {
      const noteHash = sha256HexToBytes32(await sha256Text(contestNote.trim()));
      const data = encodeFunctionData({
        abi: KEYPRINT_REGISTRY_ABI,
        functionName: "contest",
        args: [recordId as Hex, noteHash],
      });
      await sendSponsoredCalls(session, [{ to: registry, data }]);
      setContestingId(null);
      setContestNote("");
      await live.refresh();
    } catch (err) {
      setError(friendlyError(err, "Could not contest this pin. Nothing was sent."));
    } finally {
      setBusy(null);
    }
  };

  const viewerPins: SpatialPinItem[] = pinItems.map((p) => ({
    id: p.recordId,
    position: p.manifest.position,
    normal: p.manifest.normal,
    label: p.manifest.text,
    variant: p.coSigned ? "sealed" : "renter",
  }));

  return (
    <LeaseShell leaseId={leaseId} live={live}>
      <div className="space-y-6">
        {allCoSigned && (
          <SealAnimation
            verb="Co-signed"
            title="Move-in record co-signed by the landlord"
            subtitle="Both sides now share the exact same agreed move-in baseline."
            sealedAtIso={
              live.lease &&
              (live.coSignedMap[live.lease.moveInRecordId.toLowerCase()] || 0) > 0
                ? new Date(
                    live.coSignedMap[live.lease.moveInRecordId.toLowerCase()] * 1000,
                  ).toISOString()
                : null
            }
            recordId={live.lease?.moveInRecordId}
          />
        )}

        <div className="grid gap-6 lg:grid-cols-3">
          <div className="lg:col-span-2">
            {live.signedUrls.moveInScan ? (
              <RoomViewer
                url={live.signedUrls.moveInScan}
                pins={viewerPins}
                flyTo={flyTo}
                onPinSelect={(pin) =>
                  setFlyTo({
                    position: pin.position,
                    normal: pin.normal,
                    nonce: Date.now(),
                  })
                }
                heightClassName="h-[55vh] max-h-[500px] min-h-[320px]"
                hint="Click any renter pin to inspect it in 3D"
              />
            ) : (
              <div className="rounded-2xl border border-border bg-muted/40 p-6 text-sm text-muted-foreground">
                The renter&apos;s move-in scan isn&apos;t available yet.
              </div>
            )}
          </div>

          <div className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <UserCheck className="h-4 w-4 text-landlord" />
                  Landlord move-in review
                </CardTitle>
                <CardDescription>
                  Review the renter&apos;s move-in scan and pins. Co-signing turns the record into shared agreement; silence after the review window counts as acceptance.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {error && <p className="text-sm text-claim">{error}</p>}

                {!allCoSigned ? (
                  isLandlord ? (
                    <Button
                      size="lg"
                      className="w-full h-auto min-h-12 whitespace-normal py-3 leading-snug"
                      disabled={busy !== null || unacknowledgedIds.length === 0}
                      onClick={handleCoSignAll}
                    >
                      <CheckCircle2 className="h-4 w-4 shrink-0" />
                      {busy ??
                        `Co-sign move-in record (${unacknowledgedIds.length} item${unacknowledgedIds.length === 1 ? "" : "s"})`}
                    </Button>
                  ) : (
                    <div className="rounded-xl bg-muted/60 p-3 text-xs text-muted-foreground">
                      Switch to the landlord&apos;s browser profile to co-sign or contest these move-in pins.
                    </div>
                  )
                ) : (
                  <div className="rounded-xl border border-sealed/25 bg-sealed/5 p-3 text-xs font-medium text-sealed flex items-center gap-2">
                    <CheckCircle2 className="h-4 w-4" />
                    <span>Move-in scan and all pins are co-signed.</span>
                  </div>
                )}

                <div className="space-y-2.5 pt-1">
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Renter move-in pins ({pinItems.length})
                  </h3>
                  {pinItems.length === 0 ? (
                    <p className="text-xs text-muted-foreground">
                      No move-in pins filed by the renter.
                    </p>
                  ) : (
                    pinItems.map((p) => (
                      <div
                        key={p.recordId}
                        className="rounded-xl border border-border bg-muted/35 p-3 space-y-2 text-xs"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <button
                            type="button"
                            onClick={() =>
                              setFlyTo({
                                position: p.manifest.position,
                                normal: p.manifest.normal,
                                nonce: Date.now(),
                              })
                            }
                            className="min-h-11 text-sm font-medium text-foreground text-left hover:text-accent cursor-pointer"
                          >
                            {p.manifest.text}
                          </button>
                          <Badge variant={p.coSigned ? "sealed" : "default"}>
                            {p.coSigned
                              ? "Co-signed"
                              : p.inMoveInWindow
                                ? "Pending"
                                : "Pinned after move-in"}
                          </Badge>
                        </div>

                        {isLandlord && !p.coSigned && p.inMoveInWindow && (
                          <div>
                            {contestingId === p.recordId ? (
                              <div className="space-y-2 pt-1">
                                <input
                                  type="text"
                                  value={contestNote}
                                  onChange={(e) => setContestNote(e.target.value)}
                                  placeholder="Counter-note for this spot"
                                  className="w-full h-11 rounded-md border border-border bg-background px-3 text-base sm:h-9 sm:text-sm"
                                />
                                <div className="flex gap-2">
                                  <Button
                                    size="sm"
                                    variant="destructive"
                                    className="max-sm:h-11 max-sm:flex-1 max-sm:text-sm"
                                    disabled={busy !== null || !contestNote.trim()}
                                    onClick={() => handleContestPin(p.recordId)}
                                  >
                                    Submit contest
                                  </Button>
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    className="max-sm:h-11 max-sm:flex-1 max-sm:text-sm"
                                    onClick={() => setContestingId(null)}
                                  >
                                    Cancel
                                  </Button>
                                </div>
                              </div>
                            ) : (
                              <button
                                type="button"
                                onClick={() => setContestingId(p.recordId)}
                                className="inline-flex min-h-11 items-center gap-1.5 text-sm font-medium text-claim hover:underline cursor-pointer"
                              >
                                <AlertTriangle className="h-3.5 w-3.5" />
                                Contest this pin
                              </button>
                            )}
                          </div>
                        )}
                      </div>
                    ))
                  )}
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </LeaseShell>
  );
}
