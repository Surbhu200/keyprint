"use client";

import { use, useMemo, useState } from "react";
import Link from "next/link";
import { encodeFunctionData, type Hex } from "viem";
import {
  Check,
  CheckCircle2,
  Eye,
  Plus,
  Sparkles,
  Upload,
  X,
} from "lucide-react";
import { LeaseShell } from "@/components/LeaseShell";
import { SealAnimation } from "@/components/SealAnimation";
import { useLeaseLiveState } from "@/components/useLeaseLiveState";
import { usePasskeySession } from "@/components/usePasskeySession";
import {
  AlignmentTool,
  type AlignmentOutput,
} from "@/components/three/AlignmentTool";
import { TimeSliderScene } from "@/components/three/TimeSliderScene";
import { renderBeforeAfterPairs } from "@/components/three/OffscreenRenderer";
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
  findMatchingMoveInPin,
  mergeNearbyChanges,
  type DetectedChange,
  type MoveInPinRef,
} from "@/lib/ai/matching";
import {
  getEscrowAddress,
  KEYPRINT_ESCROW_ABI,
  RecordKind,
} from "@/lib/chain/arc";
import {
  buildUnsealedRegistryCalls,
  sendSponsoredCalls,
  type SealInput,
} from "@/lib/chain/wallet";
import { sha256Blob } from "@/lib/evidence/hash";
import {
  canonicalizeAndHash,
  type AlignmentManifestV1,
  type EvidenceManifestV1,
  type PinManifestV1,
  type ReportManifestV1,
} from "@/lib/evidence/manifest";
import {
  REFERENCE_MOVE_IN_LANDMARKS,
  REFERENCE_MOVE_IN_URL,
  REFERENCE_MOVE_OUT_LANDMARKS,
  REFERENCE_MOVE_OUT_URL,
} from "@/lib/sample/reference";
import { uploadToPrivateStorage } from "@/lib/supabase/upload";
import { cn } from "@/lib/utils";

interface ReviewableChange extends DetectedChange {
  id: string;
  reviewState: "pending" | "confirmed" | "dismissed";
  manual?: boolean;
}

export default function LeaseComparePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: leaseId } = use(params);
  const live = useLeaseLiveState(leaseId);
  const session = usePasskeySession();

  const [moveOutFile, setMoveOutFile] = useState<File | null>(null);
  const [moveOutName, setMoveOutName] = useState("apartment-move-out.glb");
  const [moveOutUrl, setMoveOutUrl] = useState(REFERENCE_MOVE_OUT_URL);
  const [usingReferenceOut, setUsingReferenceOut] = useState(true);

  const [alignment, setAlignment] = useState<AlignmentOutput | null>(null);
  const [changes, setChanges] = useState<ReviewableChange[]>([]);
  const [aiSource, setAiSource] = useState<string | null>(null);
  const [promptVersion, setPromptVersion] = useState("keyprint-diff-v1");
  const [viewIds, setViewIds] = useState<string[]>([]);
  const [showFiltered, setShowFiltered] = useState(false);

  // Manual "Add change" fallback
  const [manualTitle, setManualTitle] = useState("");
  const [manualCategory, setManualCategory] = useState<
    "possible_damage" | "possible_wear"
  >("possible_damage");

  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [flyTo, setFlyTo] = useState<{
    position: [number, number, number];
    normal?: [number, number, number];
    nonce: number;
  } | null>(null);

  const moveInUrl = live.signedUrls.moveInScan || REFERENCE_MOVE_IN_URL;
  const effectiveMoveOutUrl =
    moveOutFile ? moveOutUrl : live.signedUrls.moveOutScan || moveOutUrl;

  const activeMatrix =
    alignment?.umeyama.matrix4ColumnMajor ?? live.meta?.alignment_matrix ?? null;
  const alignmentPassed =
    alignment?.agreement.passedGate ?? live.meta?.alignment_metrics?.passedGate ?? false;
  const alignmentSummary =
    alignment?.agreement.summaryText ?? live.meta?.alignment_metrics?.summaryText ?? null;

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

  // Persist alignment locally to Supabase cache when solved so stage demo loads instantly
  const handleAligned = async (output: AlignmentOutput) => {
    setAlignment(output);
    if (output.agreement.passedGate) {
      await fetch(`/api/leases/${encodeURIComponent(leaseId)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          alignment_matrix: output.umeyama.matrix4ColumnMajor,
          alignment_metrics: {
            medianGapMeters: output.agreement.medianGapMeters,
            shareWithin5cm: output.agreement.shareWithin5cm,
            summaryText: output.agreement.summaryText,
            passedGate: output.agreement.passedGate,
          },
        }),
      }).catch(() => null);
    }
  };

  // Run offscreen renders -> signed upload -> /api/analyze (Claude Opus 5.5) -> code pin matching
  const handleRunAiCompare = async (forceRefresh = false) => {
    if (!activeMatrix || !alignmentPassed) {
      setError("Pass the 4-point surface-agreement alignment gate first.");
      return;
    }
    setError(null);
    setBusy("Rendering matching 4:3 before & after viewpoints…");

    try {
      const { pairs, raycastBox } = await renderBeforeAfterPairs({
        moveInUrl,
        moveOutUrl: effectiveMoveOutUrl,
        alignmentMatrix: activeMatrix,
        moveInPins,
      });

      setBusy(`Uploading ${pairs.length} render pairs for comparison…`);
      const uploadedPairs = await Promise.all(
        pairs.map(async (p) => {
          try {
            const [bUp, aUp] = await Promise.all([
              uploadToPrivateStorage({
                file: p.beforeBlob,
                filename: `${p.viewId}-before.jpg`,
                contentType: "image/jpeg",
                scope: `leases/${leaseId}/renders`,
              }),
              uploadToPrivateStorage({
                file: p.afterBlob,
                filename: `${p.viewId}-after.jpg`,
                contentType: "image/jpeg",
                scope: `leases/${leaseId}/renders`,
              }),
            ]);
            return {
              viewId: p.viewId,
              pins: p.pins,
              beforePath: bUp.path,
              afterPath: aUp.path,
            };
          } catch {
            // If Supabase storage isn't configured yet, send inline base64 (<= 12 compact JPEGs)
            return {
              viewId: p.viewId,
              pins: p.pins,
              beforeBase64: p.beforeDataUrl,
              afterBase64: p.afterDataUrl,
            };
          }
        }),
      );

      setBusy("Comparing views with Claude Opus 5.5…");
      const res = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          leaseId,
          moveInRecordId: live.lease?.moveInRecordId || "move-in",
          moveOutRecordId: live.lease?.moveOutRecordId || moveOutName,
          pairs: uploadedPairs,
          forceRefresh,
        }),
      });
      const data = (await res.json()) as {
        source?: string;
        promptVersion?: string;
        report?: { changes: DetectedChange[] } | null;
        note?: string;
        error?: string;
      };

      setAiSource(data.source || "manual-fallback");
      if (data.promptVersion) setPromptVersion(data.promptVersion);
      setViewIds(pairs.map((p) => p.viewId));

      if (!data.report) {
        setError(
          data.note ||
            data.error ||
            "AI report unavailable — add changes manually below.",
        );
        return;
      }

      // Match changes to move-in pins IN CODE (raycast box center + 2D/15cm check + 10cm merge)
      const enriched: DetectedChange[] = data.report.changes.map((c) => {
        const pair = pairs.find((p) => p.viewId === c.view_id);
        const worldPosition = raycastBox(c.view_id, c.box) ?? undefined;
        const matchedMoveInPin = findMatchingMoveInPin({
          box: c.box,
          projectedPins: pair?.pins,
          worldPosition,
          moveInPins,
        });
        return { ...c, worldPosition, matchedMoveInPin };
      });

      const merged = mergeNearbyChanges(enriched);
      setChanges(
        merged.map((c, idx) => ({
          ...c,
          id: `chg-${idx}-${Date.now()}`,
          reviewState: "pending",
        })),
      );
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Comparison failed; you can still add changes manually.",
      );
    } finally {
      setBusy(null);
    }
  };

  // Prompt 3 (batched): seal MoveOutScan + Alignment + AI Report (if present) + escrow.endLease
  const handleEndLease = async () => {
    if (!session || !live.lease) return;
    if (!activeMatrix || !alignmentPassed) {
      setError("Align the move-out scan and pass the surface-agreement gate first.");
      return;
    }
    const escrow = getEscrowAddress();
    if (!escrow) {
      setError("Escrow contract address is not configured.");
      return;
    }

    setError(null);
    setBusy("Hashing move-out scan…");
    try {
      const scanBlob: Blob = moveOutFile
        ? moveOutFile
        : await (await fetch(effectiveMoveOutUrl)).blob();
      const scanSha256 = await sha256Blob(scanBlob, (pct) =>
        setBusy(`Hashing move-out scan… ${pct}%`),
      );

      let scanPath = effectiveMoveOutUrl;
      try {
        setBusy("Uploading move-out scan privately…");
        const up = await uploadToPrivateStorage({
          file: scanBlob,
          filename: moveOutName,
          contentType: "model/gltf-binary",
          scope: `leases/${leaseId}`,
        });
        scanPath = up.path;
      } catch {
        if (moveOutFile) {
          throw new Error("Could not upload custom move-out .glb to private storage.");
        }
      }

      const unitId = live.lease.unitId;
      const moveOutManifest: EvidenceManifestV1 = {
        type: "keyprint.evidence.v1",
        leaseId: leaseId as Hex,
        unitId,
        kind: "MoveOutScan",
        files: [
          {
            role: "model",
            sha256: scanSha256,
            bytes: scanBlob.size,
            mime: "model/gltf-binary",
            name: moveOutName,
          },
        ],
        capturedAtClient: new Date().toISOString(),
        app: "keyprint-web/0.1",
      };
      const outCanon = await canonicalizeAndHash(moveOutManifest);

      const { calls: outCalls, recordIds: outIds } =
        await buildUnsealedRegistryCalls(session.address, [
          {
            unitId,
            leaseId: leaseId as Hex,
            kind: RecordKind.MoveOutScan,
            contentHash: outCanon.contentHash,
          },
        ]);
      const moveOutRecordId = outIds[0];

      const alignManifest: AlignmentManifestV1 = {
        type: "keyprint.alignment.v1",
        leaseId: leaseId as Hex,
        moveInRecordId: live.lease.moveInRecordId,
        moveOutRecordId,
        label: "maps move-out coordinates to move-in coordinates",
        matrix: activeMatrix,
        scale: alignment?.umeyama.scale ?? 1,
        floorTiltDeg: alignment?.umeyama.floorTiltDeg ?? 0,
        medianGapMeters:
          alignment?.agreement.medianGapMeters ??
          live.meta?.alignment_metrics?.medianGapMeters ??
          0,
        shareWithin5cm:
          alignment?.agreement.shareWithin5cm ??
          live.meta?.alignment_metrics?.shareWithin5cm ??
          1,
      };
      const alignCanon = await canonicalizeAndHash(alignManifest);

      const sealsToBatch: SealInput[] = [
        {
          unitId,
          leaseId: leaseId as Hex,
          kind: RecordKind.Alignment,
          contentHash: alignCanon.contentHash,
        },
      ];

      let reportCanon: Awaited<ReturnType<typeof canonicalizeAndHash>> | null = null;
      const keptChanges = changes.filter((c) => c.reviewState !== "dismissed");
      if (keptChanges.length > 0) {
        const reportManifest: ReportManifestV1 = {
          type: "keyprint.report.v1",
          leaseId: leaseId as Hex,
          moveInRecordId: live.lease.moveInRecordId,
          moveOutRecordId,
          promptVersion,
          viewIds,
          changes: keptChanges.map((c) => ({
            view_id: c.view_id,
            box: c.box,
            title: c.title,
            description: c.description,
            category: c.category,
            confidence: c.confidence,
            worldPosition: c.worldPosition,
            matchedMoveInPinId: c.matchedMoveInPin?.id ?? null,
          })),
        };
        reportCanon = await canonicalizeAndHash(reportManifest);
        sealsToBatch.push({
          unitId,
          leaseId: leaseId as Hex,
          kind: RecordKind.Report,
          contentHash: reportCanon.contentHash,
        });
      }

      const { calls: extraSealCalls, recordIds: extraIds } =
        await buildUnsealedRegistryCalls(session.address, sealsToBatch);
      const alignmentRecordId = extraIds[0];
      const reportRecordId = reportCanon ? extraIds[1] : null;

      const endLeaseCall = {
        to: escrow,
        data: encodeFunctionData({
          abi: KEYPRINT_ESCROW_ABI,
          functionName: "endLease",
          args: [leaseId as Hex, moveOutRecordId],
        }),
      };

      setBusy("Confirm with one touch to seal move-out & end lease…");
      const op = await sendSponsoredCalls(session, [
        ...outCalls,
        ...extraSealCalls,
        endLeaseCall,
      ]);

      // Persist manifests
      await Promise.all([
        fetch("/api/records", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            record_id: moveOutRecordId,
            unit_id: unitId,
            lease_id: leaseId,
            kind: RecordKind.MoveOutScan,
            content_hash: outCanon.contentHash,
            author: session.address,
            manifest_json: outCanon.canonicalJson,
            file_paths: [scanPath],
            tx_hash: op.txHash,
            block_number: Number(op.blockNumber),
            gas_cost_wei: op.actualGasCost.toString(),
          }),
        }),
        fetch("/api/records", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            record_id: alignmentRecordId,
            unit_id: unitId,
            lease_id: leaseId,
            kind: RecordKind.Alignment,
            content_hash: alignCanon.contentHash,
            author: session.address,
            manifest_json: alignCanon.canonicalJson,
            tx_hash: op.txHash,
            block_number: Number(op.blockNumber),
          }),
        }),
        reportCanon && reportRecordId
          ? fetch("/api/records", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                record_id: reportRecordId,
                unit_id: unitId,
                lease_id: leaseId,
                kind: RecordKind.Report,
                content_hash: reportCanon.contentHash,
                author: session.address,
                manifest_json: reportCanon.canonicalJson,
                tx_hash: op.txHash,
                block_number: Number(op.blockNumber),
              }),
            })
          : Promise.resolve(),
        fetch(`/api/leases/${encodeURIComponent(leaseId)}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            move_out_scan_path: scanPath,
            move_out_record_id: moveOutRecordId,
            alignment_record_id: alignmentRecordId,
            report_record_id: reportRecordId,
            alignment_matrix: activeMatrix,
            ended_tx_hash: op.txHash,
            add_gas_cost_wei: op.actualGasCost.toString(),
            add_tx_count: 1,
          }),
        }),
      ]).catch(() => null);

      await live.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "End lease failed.");
    } finally {
      setBusy(null);
    }
  };

  const visibleChanges = changes.filter(
    (c) =>
      c.reviewState !== "dismissed" &&
      (showFiltered || c.category !== "not_a_real_change"),
  );
  const filteredCount = changes.filter(
    (c) => c.category === "not_a_real_change",
  ).length;

  const sliderPins: SpatialPinItem[] = [
    ...moveInPins.map((p) => ({
      id: p.id,
      position: p.position,
      label: p.text,
      variant: p.coSigned ? ("sealed" as const) : ("renter" as const),
    })),
    ...visibleChanges
      .filter((c) => c.worldPosition)
      .map((c) => ({
        id: c.id,
        position: c.worldPosition!,
        label: c.title,
        variant: "ai" as const,
      })),
  ];

  const leaseEnded = (live.lease?.state ?? 0) >= 2;

  return (
    <LeaseShell leaseId={leaseId} live={live}>
      <div className="space-y-6">
        {leaseEnded && (
          <SealAnimation
            title="Move-out scan and alignment sealed · Lease ended"
            subtitle="The landlord's claim window is now open. Every dollar claimed requires a priced pin."
            recordId={live.lease?.moveOutRecordId}
          />
        )}

        {/* Hero Time Slider (shown once alignment passes) */}
        {activeMatrix && alignmentPassed && (
          <Card>
            <CardHeader className="pb-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <div>
                <CardTitle>Same room, before and after</CardTitle>
                <CardDescription>
                  {alignmentSummary || "Aligned move-out comparison"} · Drag the handle to sweep from move-in to move-out.
                </CardDescription>
              </div>

              <div className="flex flex-wrap gap-2">
                {!leaseEnded && live.lease?.state === 1 && (
                  <Button
                    disabled={busy !== null || !session}
                    onClick={handleEndLease}
                  >
                    <CheckCircle2 className="h-4 w-4" />
                    {busy ?? "End lease & seal move-out"}
                  </Button>
                )}
                {leaseEnded && (
                  <Link
                    href={`/lease/${leaseId}/claims`}
                    className={cn(buttonVariants({ variant: "default" }))}
                  >
                    Go to claims
                  </Link>
                )}
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <TimeSliderScene
                moveInUrl={moveInUrl}
                moveOutUrl={effectiveMoveOutUrl}
                alignmentMatrix={activeMatrix}
                moveInLabel="Move-in"
                moveOutLabel="Move-out"
                pins={sliderPins}
                flyTo={flyTo}
                onPinSelect={(pin) =>
                  setFlyTo({ position: pin.position, nonce: Date.now() })
                }
              />
            </CardContent>
          </Card>
        )}

        {/* AI Suggestions + Manual Fallback (unlocked once alignment passes) */}
        <Card>
          <CardHeader className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div>
              <CardTitle className="flex items-center gap-2 text-base">
                <Sparkles className="h-4 w-4 text-suggestion" />
                Change suggestions
              </CardTitle>
              <CardDescription>
                AI compares matched before-and-after views and suggests physical changes. It never prices anything; people decide what is chargeable.
              </CardDescription>
            </div>

            <div className="flex items-center gap-2">
              {filteredCount > 0 && (
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => setShowFiltered((v) => !v)}
                >
                  <Eye className="h-3.5 w-3.5" />
                  {showFiltered
                    ? "Hide filtered"
                    : `Show filtered (${filteredCount})`}
                </Button>
              )}
              <Button
                size="sm"
                disabled={!alignmentPassed || busy !== null}
                onClick={() => handleRunAiCompare(false)}
              >
                <Sparkles className="h-3.5 w-3.5" />
                {busy && busy.includes("Claude")
                  ? "Comparing…"
                  : "Run AI comparison"}
              </Button>
            </div>
          </CardHeader>

          <CardContent className="space-y-4">
            {!alignmentPassed && (
              <p className="text-xs text-muted-foreground">
                Complete the 4-point alignment below and pass the surface-agreement gate to unlock AI comparison.
              </p>
            )}

            {error && (
              <div className="rounded-xl border border-claim/30 bg-claim/10 px-4 py-2.5 text-xs text-claim">
                {error}
              </div>
            )}

            {aiSource && (
              <div className="text-xs text-muted-foreground">
                Report source: <span className="font-medium text-foreground">{aiSource}</span>
              </div>
            )}

            {visibleChanges.length > 0 && (
              <div className="grid gap-3 sm:grid-cols-2">
                {visibleChanges.map((item) => (
                  <div
                    key={item.id}
                    className="rounded-xl border border-border bg-muted/30 p-4 space-y-2.5"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <div className="flex flex-wrap items-center gap-1.5 mb-1">
                          <Badge variant="suggestion">
                            {item.manual ? "Added manually" : "AI suggestion"}
                          </Badge>
                          <Badge
                            variant={
                              item.category === "possible_damage"
                                ? "claim"
                                : "default"
                            }
                          >
                            {item.category === "possible_damage"
                              ? "Possible damage"
                              : item.category === "possible_wear"
                                ? "Possibly normal wear"
                                : "Filtered artifact"}
                          </Badge>
                        </div>
                        <h4 className="font-semibold text-sm">{item.title}</h4>
                      </div>

                      {item.worldPosition && (
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() =>
                            setFlyTo({
                              position: item.worldPosition!,
                              nonce: Date.now(),
                            })
                          }
                        >
                          Focus
                        </Button>
                      )}
                    </div>

                    <p className="text-xs text-muted-foreground leading-relaxed">
                      {item.description}
                    </p>

                    {item.matchedMoveInPin && (
                      <div className="rounded-lg border border-sealed/30 bg-sealed/5 px-3 py-2 text-xs text-sealed font-medium">
                        Matches a move-in pin (&ldquo;{item.matchedMoveInPin.text}&rdquo;)
                        {item.matchedMoveInPin.coSigned
                          ? ", co-signed by your landlord."
                          : "."}
                      </div>
                    )}

                    <div className="flex items-center gap-2 pt-1">
                      <Button
                        size="sm"
                        variant={
                          item.reviewState === "confirmed" ? "default" : "secondary"
                        }
                        onClick={() =>
                          setChanges((prev) =>
                            prev.map((c) =>
                              c.id === item.id
                                ? { ...c, reviewState: "confirmed" }
                                : c,
                            ),
                          )
                        }
                      >
                        <Check className="h-3.5 w-3.5" />
                        Looks right
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() =>
                          setChanges((prev) =>
                            prev.map((c) =>
                              c.id === item.id
                                ? { ...c, reviewState: "dismissed" }
                                : c,
                            ),
                          )
                        }
                      >
                        <X className="h-3.5 w-3.5" />
                        Dismiss
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Manual "Add change" fallback */}
            <div className="pt-2 border-t border-border flex flex-col sm:flex-row gap-2">
              <input
                type="text"
                value={manualTitle}
                onChange={(e) => setManualTitle(e.target.value)}
                placeholder="Add a change manually (e.g. Dark stain on carpet)"
                className="flex-1 h-10 rounded-lg border border-border bg-background px-3 text-sm"
              />
              <select
                value={manualCategory}
                onChange={(e) =>
                  setManualCategory(
                    e.target.value as "possible_damage" | "possible_wear",
                  )
                }
                className="h-10 rounded-lg border border-border bg-background px-3 text-sm"
              >
                <option value="possible_damage">Possible damage</option>
                <option value="possible_wear">Possibly normal wear</option>
              </select>
              <Button
                variant="secondary"
                disabled={!manualTitle.trim()}
                onClick={() => {
                  setChanges((prev) => [
                    ...prev,
                    {
                      id: `manual-${Date.now()}`,
                      view_id: "manual",
                      box: { x: 0, y: 0, w: 0, h: 0 },
                      title: manualTitle.trim(),
                      description: "Added manually by a lease party for review.",
                      category: manualCategory,
                      confidence: "high",
                      reviewState: "confirmed",
                      manual: true,
                    },
                  ]);
                  setManualTitle("");
                }}
              >
                <Plus className="h-4 w-4" />
                Add change
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Move-out Scan Import & 4-Point Alignment */}
        <Card>
          <CardHeader className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div>
              <CardTitle className="text-base">
                Line up the move-out scan (4-point alignment)
              </CardTitle>
              <CardDescription>
                Move-out file: {moveOutName}. Tap 4 matching spots on two walls so both scans line up to within 2 cm.
              </CardDescription>
            </div>

            <label className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-surface px-3 py-2 text-xs font-medium cursor-pointer hover:bg-muted">
              <Upload className="h-3.5 w-3.5" />
              Import move-out .glb
              <input
                type="file"
                accept=".glb,model/gltf-binary"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) {
                    setMoveOutFile(f);
                    setMoveOutName(f.name);
                    setMoveOutUrl(URL.createObjectURL(f));
                    setUsingReferenceOut(false);
                    setAlignment(null);
                  }
                }}
              />
            </label>
          </CardHeader>
          <CardContent>
            <AlignmentTool
              moveInUrl={moveInUrl}
              moveOutUrl={effectiveMoveOutUrl}
              onAligned={handleAligned}
              presetLandmarks={
                usingReferenceOut
                  ? {
                      moveIn: REFERENCE_MOVE_IN_LANDMARKS,
                      moveOut: REFERENCE_MOVE_OUT_LANDMARKS,
                    }
                  : undefined
              }
            />
          </CardContent>
        </Card>
      </div>
    </LeaseShell>
  );
}
