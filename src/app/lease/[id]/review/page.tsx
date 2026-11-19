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
import { sendSponsoredCalls } from "@/lib/chain/wallet";
import { sha256HexToBytes32, sha256Text } from "@/lib/evidence/hash";
import type { PinManifestV1 } from "@/lib/evidence/manifest";
import { REFERENCE_MOVE_IN_URL } from "@/lib/sample/reference";

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

  const moveInRecords = useMemo(() => {
    return live.records.filter(
      (r) => r.kind === RecordKind.MoveInScan || r.kind === RecordKind.Pin,
    );
  }, [live.records]);

  const pinItems = useMemo(() => {
    return live.records
      .filter((r) => r.kind === RecordKind.Pin)
      .map((r) => {
        try {
          const m = JSON.parse(r.manifest_json) as PinManifestV1;
          return {
            recordId: r.record_id,
            manifest: m,
            coSigned: (live.coSignedMap[r.record_id.toLowerCase()] || 0) > 0,
            sealedAt: r.sealed_at,
          };
        } catch {
          return null;
        }
      })
      .filter((x): x is NonNullable<typeof x> => x !== null);
  }, [live.records, live.coSignedMap]);

  const unacknowledgedIds = useMemo(() => {
    const ids = new Set<string>();
    if (
      live.lease?.moveInRecordId &&
      live.lease.moveInRecordId !==
        "0x0000000000000000000000000000000000000000000000000000000000000000"
    ) {
      ids.add(live.lease.moveInRecordId.toLowerCase());
    }
    for (const r of moveInRecords) {
      ids.add(r.record_id.toLowerCase());
    }
    return Array.from(ids).filter((id) => !(live.coSignedMap[id] > 0));
  }, [live.lease, moveInRecords, live.coSignedMap]);

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
      setError(err instanceof Error ? err.message : "Co-sign failed.");
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
      setError(err instanceof Error ? err.message : "Could not contest pin.");
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
            title="Move-in record co-signed by the landlord"
            subtitle="Both sides now share the exact same agreed move-in baseline."
            recordId={live.lease?.moveInRecordId}
          />
        )}

        <div className="grid gap-6 lg:grid-cols-3">
          <div className="lg:col-span-2">
            <RoomViewer
              url={live.signedUrls.moveInScan || REFERENCE_MOVE_IN_URL}
              pins={viewerPins}
              flyTo={flyTo}
              onPinSelect={(pin) =>
                setFlyTo({
                  position: pin.position,
                  normal: pin.normal,
                  nonce: Date.now(),
                })
              }
              heightClassName="h-[500px]"
              hint="Click any renter pin to inspect it in 3D"
            />
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
                {error && <p className="text-xs text-claim">{error}</p>}

                {!allCoSigned ? (
                  isLandlord ? (
                    <Button
                      size="lg"
                      className="w-full"
                      disabled={busy !== null || unacknowledgedIds.length === 0}
                      onClick={handleCoSignAll}
                    >
                      <CheckCircle2 className="h-4 w-4" />
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
                        <div className="flex items-start justify-between gap-2">
                          <button
                            type="button"
                            onClick={() =>
                              setFlyTo({
                                position: p.manifest.position,
                                normal: p.manifest.normal,
                                nonce: Date.now(),
                              })
                            }
                            className="font-medium text-foreground text-left hover:text-accent cursor-pointer"
                          >
                            {p.manifest.text}
                          </button>
                          <Badge variant={p.coSigned ? "sealed" : "default"}>
                            {p.coSigned ? "Co-signed" : "Pending"}
                          </Badge>
                        </div>

                        {isLandlord && !p.coSigned && (
                          <div>
                            {contestingId === p.recordId ? (
                              <div className="space-y-2 pt-1">
                                <input
                                  type="text"
                                  value={contestNote}
                                  onChange={(e) => setContestNote(e.target.value)}
                                  placeholder="Counter-note for this spot"
                                  className="w-full h-9 rounded-md border border-border bg-background px-2.5 text-xs"
                                />
                                <div className="flex gap-2">
                                  <Button
                                    size="sm"
                                    variant="destructive"
                                    disabled={busy !== null || !contestNote.trim()}
                                    onClick={() => handleContestPin(p.recordId)}
                                  >
                                    Submit contest
                                  </Button>
                                  <Button
                                    size="sm"
                                    variant="ghost"
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
                                className="inline-flex items-center gap-1 text-claim hover:underline cursor-pointer"
                              >
                                <AlertTriangle className="h-3 w-3" />
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
