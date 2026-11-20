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
  friendlyError,
  sendSponsoredCalls,
  type SealInput,
} from "@/lib/chain/wallet";
import { sha256Blob } from "@/lib/evidence/hash";
import { countsAsMoveInPin } from "@/lib/evidence/pin-rules";
import { saveRecordManifests } from "@/lib/evidence/record-store";
import {
  canonicalizeAndHash,
  type AlignmentManifestV1,
  type EvidenceManifestV1,
  type PinManifestV1,
  type ReportManifestV1,
} from "@/lib/evidence/manifest";
import {
  REFERENCE_MOVE_IN_LANDMARKS,
  REFERENCE_MOVE_OUT_LANDMARKS,
  REFERENCE_MOVE_OUT_URL,
} from "@/lib/sample/reference";
import { uploadToPrivateStorage } from "@/lib/supabase/upload";
import { cn } from "@/lib/utils";

interface SavedAlignmentMetrics {
  medianGapMeters: number;
  shareWithin5cm: number;
  summaryText: string;
  passedGate: boolean;
  /** Identifies the exact move-out file this alignment was solved for. */
  moveOutKey?: string;
  scale?: number;
  floorTiltDeg?: number;
}

/** Scale and floor tilt implied by a column-major similarity matrix. */
function scaleAndTiltFromMatrix(m: number[]): { scale: number; floorTiltDeg: number } {
  const scale = Math.hypot(m[0], m[1], m[2]);
  const cos = Math.min(1, Math.max(-1, m[5] / (scale || 1)));
  return { scale, floorTiltDeg: (Math.acos(cos) * 180) / Math.PI };
}

/**
 * The change report sealed when this lease ended: a verified Report record naming the lease's
 * own move-in and move-out records (earliest one wins; records arrive sorted by seal time).
 */
function findSealedReport(
  records: ReadonlyArray<{ kind: number; manifest_json: string }>,
  lease: { state: number; moveInRecordId: string; moveOutRecordId: string } | null,
): ReportManifestV1 | null {
  if (!lease || lease.state < 2) return null;
  for (const r of records) {
    if (r.kind !== RecordKind.Report) continue;
    let m: ReportManifestV1;
    try {
      m = JSON.parse(r.manifest_json) as ReportManifestV1;
    } catch {
      continue;
    }
    if (
      m.type === "keyprint.report.v1" &&
      Array.isArray(m.changes) &&
      String(m.moveInRecordId).toLowerCase() === lease.moveInRecordId.toLowerCase() &&
      String(m.moveOutRecordId).toLowerCase() === lease.moveOutRecordId.toLowerCase()
    ) {
      return m;
    }
  }
  return null;
}

const CATEGORY_LABEL: Record<string, string> = {
  possible_damage: "Possible damage",
  possible_wear: "Possibly normal wear",
  not_a_real_change: "Filtered artifact",
};

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
  const [promptVersion, setPromptVersion] = useState("keyprint-diff-v2");
  const [viewIds, setViewIds] = useState<string[]>([]);
  const [viewSnapshots, setViewSnapshots] = useState<
    Record<string, { before: string; after: string }>
  >({});
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

  const moveInUrl = live.signedUrls.moveInScan || null;
  const effectiveMoveOutUrl =
    moveOutFile ? moveOutUrl : live.signedUrls.moveOutScan || moveOutUrl;
  // After the lease ends, only show the sealed move-out scan (never the bundled sample under a
  // matrix that was sealed for a different file).
  const sliderMoveOutUrl =
    (live.lease?.state ?? 0) >= 2
      ? live.signedUrls.moveOutScan || (moveOutFile ? moveOutUrl : null)
      : effectiveMoveOutUrl;

  // Which exact move-out file is on screen. A saved alignment is reused only for the same file.
  const currentMoveOutKey = moveOutFile
    ? `file:${moveOutFile.name}:${moveOutFile.size}`
    : live.meta?.move_out_scan_path
      ? `path:${live.meta.move_out_scan_path}`
      : `path:${REFERENCE_MOVE_OUT_URL}`;
  const savedMetrics = (live.meta?.alignment_metrics ?? null) as SavedAlignmentMetrics | null;
  const savedAlignmentUsable =
    !alignment &&
    Boolean(live.meta?.alignment_matrix?.length === 16) &&
    savedMetrics?.moveOutKey === currentMoveOutKey;

  // After the lease ends, the sealed Alignment record (verified against Arc) is the source of truth.
  const sealedAlignment = useMemo(() => {
    const lease = live.lease;
    if (!lease || lease.state < 2) return null;
    for (const r of live.records) {
      if (r.kind !== RecordKind.Alignment) continue;
      try {
        const m = JSON.parse(r.manifest_json) as AlignmentManifestV1;
        if (
          m.type === "keyprint.alignment.v1" &&
          m.matrix?.length === 16 &&
          m.moveInRecordId.toLowerCase() === lease.moveInRecordId.toLowerCase() &&
          m.moveOutRecordId.toLowerCase() === lease.moveOutRecordId.toLowerCase()
        ) {
          return m;
        }
      } catch {
        // ignore unparsable rows
      }
    }
    return null;
  }, [live.records, live.lease]);

  const activeMatrix =
    alignment?.umeyama.matrix4ColumnMajor ??
    sealedAlignment?.matrix ??
    (savedAlignmentUsable ? live.meta!.alignment_matrix : null);
  const alignmentPassed =
    alignment?.agreement.passedGate ??
    (sealedAlignment ? true : savedAlignmentUsable ? Boolean(savedMetrics?.passedGate) : false);
  const alignmentSummary =
    alignment?.agreement.summaryText ??
    (sealedAlignment
      ? `Sealed line-up: half the room within ${(sealedAlignment.medianGapMeters * 100).toFixed(1)} cm; ${Math.round(sealedAlignment.shareWithin5cm * 100)}% within 5 cm`
      : savedAlignmentUsable
        ? savedMetrics?.summaryText ?? null
        : null);

  const moveInCreatedAt = useMemo(() => {
    if (!live.lease) return null;
    const row = live.records.find(
      (r) => r.record_id.toLowerCase() === live.lease!.moveInRecordId.toLowerCase(),
    );
    return row?.chain_created_at ?? null;
  }, [live.records, live.lease]);

  const moveInPins: MoveInPinRef[] = useMemo(() => {
    return live.records
      .filter((r) => r.kind === RecordKind.Pin)
      .map((r): MoveInPinRef | null => {
        try {
          const m = JSON.parse(r.manifest_json) as PinManifestV1;
          const coSigned = (live.coSignedMap[r.record_id.toLowerCase()] || 0) > 0;
          return {
            id: r.record_id,
            position: m.position,
            normal: m.normal,
            sealedAt: r.chain_created_at ?? 0,
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

  // Persist a passing alignment (with the move-out file it belongs to) so a reload can reuse it.
  const handleAligned = async (output: AlignmentOutput) => {
    setAlignment(output);
    if (output.agreement.passedGate) {
      const metrics: SavedAlignmentMetrics = {
        medianGapMeters: output.agreement.medianGapMeters,
        shareWithin5cm: output.agreement.shareWithin5cm,
        summaryText: output.agreement.summaryText,
        passedGate: output.agreement.passedGate,
        moveOutKey: currentMoveOutKey,
        scale: output.umeyama.scale,
        floorTiltDeg: output.umeyama.floorTiltDeg,
      };
      await fetch(`/api/leases/${encodeURIComponent(leaseId)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          alignment_matrix: output.umeyama.matrix4ColumnMajor,
          alignment_metrics: metrics,
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
    if (!moveInUrl || !live.lease) {
      setError("The move-in scan for this lease isn't available yet.");
      return;
    }
    setError(null);
    setBusy("Rendering matching 4:3 before & after viewpoints…");

    try {
      // Only move-in pins (sealed in the review window, or co-signed) are shown to the matcher.
      const eligiblePins = moveInPins.filter((p) => p.countsAsMoveIn);
      const { pairs, raycastBox } = await renderBeforeAfterPairs({
        moveInUrl,
        moveOutUrl: effectiveMoveOutUrl,
        alignmentMatrix: activeMatrix,
        moveInPins: eligiblePins,
      });
      setViewSnapshots(
        Object.fromEntries(
          pairs.map((p) => [
            p.viewId,
            { before: p.beforeDataUrl, after: p.afterDataUrl },
          ]),
        ),
      );

      // Cache identity: sealed record ids once they exist; before move-out is sealed, the
      // move-out file's own fingerprint, so a different scan can never reuse a stale report.
      const zeroId = /^0x0{64}$/i;
      let moveOutKeyForCache = live.lease.moveOutRecordId;
      if (zeroId.test(moveOutKeyForCache)) {
        setBusy("Fingerprinting move-out scan…");
        const outBlob = moveOutFile ?? (await (await fetch(effectiveMoveOutUrl)).blob());
        moveOutKeyForCache = `sha256:${await sha256Blob(outBlob)}` as Hex;
      }

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

      setBusy("Comparing views with AI…");
      const res = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          leaseId,
          moveInRecordId: live.lease.moveInRecordId,
          moveOutRecordId: moveOutKeyForCache,
          pairs: uploadedPairs,
          forceRefresh,
        }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        source?: string;
        model?: string;
        promptVersion?: string;
        report?: { changes: DetectedChange[] } | null;
        note?: string;
        error?: string;
      };
      if (!res.ok && !data.report) {
        setError("The AI comparison isn't available right now. You can still add changes manually below.");
        return;
      }

      setAiSource(
        data.model ? `${data.source} (${data.model})` : data.source || "manual-fallback",
      );
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
      setError(friendlyError(err, "Comparison failed; you can still add changes manually."));
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

      // Seal only measurements that were actually taken for this move-out file.
      const measured = alignment
        ? {
            medianGapMeters: alignment.agreement.medianGapMeters,
            shareWithin5cm: alignment.agreement.shareWithin5cm,
          }
        : savedAlignmentUsable && savedMetrics
          ? {
              medianGapMeters: savedMetrics.medianGapMeters,
              shareWithin5cm: savedMetrics.shareWithin5cm,
            }
          : null;
      if (!measured) {
        throw new Error("Line up the scans again before ending the lease, so real measurements are sealed.");
      }
      const derived = scaleAndTiltFromMatrix(activeMatrix);
      const alignManifest: AlignmentManifestV1 = {
        type: "keyprint.alignment.v1",
        leaseId: leaseId as Hex,
        moveInRecordId: live.lease.moveInRecordId,
        moveOutRecordId,
        label: "maps move-out coordinates to move-in coordinates",
        matrix: activeMatrix,
        scale: alignment?.umeyama.scale ?? derived.scale,
        floorTiltDeg: alignment?.umeyama.floorTiltDeg ?? derived.floorTiltDeg,
        medianGapMeters: measured.medianGapMeters,
        shareWithin5cm: measured.shareWithin5cm,
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

      // Seal every suggestion, including dismissed ones, with who produced it and what
      // people decided, so the sealed report shows exactly what the AI said.
      let reportCanon: Awaited<ReturnType<typeof canonicalizeAndHash>> | null = null;
      if (changes.length > 0) {
        const reportManifest: ReportManifestV1 = {
          type: "keyprint.report.v1",
          leaseId: leaseId as Hex,
          moveInRecordId: live.lease.moveInRecordId,
          moveOutRecordId,
          promptVersion,
          viewIds,
          source: aiSource ?? "manual",
          changes: changes.map((c) => ({
            view_id: c.view_id,
            box: c.box,
            title: c.title,
            description: c.description,
            category: c.category,
            confidence: c.confidence,
            worldPosition: c.worldPosition,
            matchedMoveInPinId: c.matchedMoveInPin?.id ?? null,
            origin: c.manual ? ("manual" as const) : ("ai" as const),
            reviewState: c.reviewState,
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
      const op = await sendSponsoredCalls(
        session,
        [...outCalls, ...extraSealCalls, endLeaseCall],
        { onSubmitted: () => setBusy("Sealing move-out…") },
      );

      // Persist manifests (with a local backup and retries; see record-store).
      const [failedSaves] = await Promise.all([
        saveRecordManifests([
          {
            record_id: moveOutRecordId,
            lease_id: leaseId,
            manifest_json: outCanon.canonicalJson,
            file_paths: [scanPath],
            tx_hash: op.txHash,
            gas_cost_wei: op.actualGasCost.toString(),
          },
          {
            record_id: alignmentRecordId,
            lease_id: leaseId,
            manifest_json: alignCanon.canonicalJson,
            tx_hash: op.txHash,
          },
          ...(reportCanon && reportRecordId
            ? [
                {
                  record_id: reportRecordId,
                  lease_id: leaseId,
                  manifest_json: reportCanon.canonicalJson,
                  tx_hash: op.txHash,
                },
              ]
            : []),
        ]),
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
        }).catch(() => null),
      ]);
      if (failedSaves > 0) {
        setError(
          "Move-out is sealed. Details are syncing and will appear automatically.",
        );
      }

      await live.refresh();
    } catch (err) {
      setError(friendlyError(err, "Ending the lease didn't go through. Nothing was sent."));
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
  const sealedReport = findSealedReport(live.records, live.lease);
  const moveOutSealedAt = live.lease
    ? live.records.find(
        (r) => r.record_id.toLowerCase() === live.lease!.moveOutRecordId.toLowerCase(),
      )?.sealed_at
    : undefined;
  const claimWindowOpen =
    live.lease?.state === 2 &&
    !live.lease.claimsClosed &&
    live.chainNowSec <= live.lease.endedAt + live.lease.claimWindow;
  const endedSubtitle =
    live.lease?.state === 3
      ? "The deposit has been settled. The receipt is on the Settle tab."
      : claimWindowOpen
        ? "The landlord's claim window is open. Every dollar claimed needs a priced pin."
        : "The claim window has closed. Settlement runs once every claim is final.";

  return (
    <LeaseShell leaseId={leaseId} live={live}>
      <div className="space-y-6">
        {leaseEnded && (
          <SealAnimation
            title={
              sealedAlignment
                ? "Move-out scan and alignment sealed · Lease ended"
                : "Move-out scan sealed · Lease ended"
            }
            subtitle={endedSubtitle}
            sealedAtIso={moveOutSealedAt}
            recordId={live.lease?.moveOutRecordId}
          />
        )}

        {!moveInUrl && !live.loading && (
          <div className="rounded-2xl border border-border bg-muted/40 p-6 text-sm text-muted-foreground">
            The move-in scan for this lease isn&apos;t available yet, so there&apos;s nothing to compare against.
          </div>
        )}

        {/* Hero Time Slider (shown once alignment passes) */}
        {moveInUrl && sliderMoveOutUrl && activeMatrix && alignmentPassed && (
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
                moveOutUrl={sliderMoveOutUrl}
                alignmentMatrix={activeMatrix}
                moveInLabel={
                  moveInCreatedAt
                    ? `Move-in ${new Date(moveInCreatedAt * 1000).toLocaleDateString("en-US", { month: "short", day: "numeric" })}`
                    : "Move-in"
                }
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
                {leaseEnded ? "Sealed change report" : "Change suggestions"}
              </CardTitle>
              <CardDescription>
                {leaseEnded
                  ? "Sealed when the lease ended, including what people confirmed or dismissed. AI never prices anything."
                  : "AI compares matched before-and-after views and suggests physical changes. It never prices anything; people decide what is chargeable."}
              </CardDescription>
            </div>

            {!leaseEnded && (
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
                {busy && busy.includes("AI")
                  ? "Comparing…"
                  : "Run AI comparison"}
                </Button>
              </div>
            )}
          </CardHeader>

          {leaseEnded ? (
            <CardContent className="space-y-3">
              {!sealedReport ? (
                <p className="text-xs text-muted-foreground">
                  No change report was sealed for this lease.
                </p>
              ) : sealedReport.changes.length === 0 ? (
                <p className="text-xs text-muted-foreground">
                  The sealed report lists no changes.
                </p>
              ) : (
                <div className="grid gap-3 sm:grid-cols-2">
                  {sealedReport.changes.map((item, i) => (
                    <div
                      key={`${item.view_id}-${i}`}
                      className={cn(
                        "rounded-xl border border-border bg-muted/30 p-4 space-y-2",
                        item.reviewState === "dismissed" && "opacity-60",
                      )}
                    >
                      <div className="flex flex-wrap items-center gap-1.5">
                        <Badge variant="suggestion">
                          {item.origin === "manual" ? "Added manually" : "AI suggestion"}
                        </Badge>
                        <Badge variant={item.category === "possible_damage" ? "suggestion" : "default"}>
                          {CATEGORY_LABEL[item.category] ?? item.category}
                        </Badge>
                        <Badge variant={item.reviewState === "confirmed" ? "sealed" : "default"}>
                          {item.reviewState === "confirmed"
                            ? "Confirmed"
                            : item.reviewState === "dismissed"
                              ? "Dismissed"
                              : "Not reviewed"}
                        </Badge>
                      </div>
                      <div className="flex items-start justify-between gap-2">
                        <h4 className="font-semibold text-sm">{item.title}</h4>
                        {item.worldPosition && activeMatrix && alignmentPassed && (
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() =>
                              setFlyTo({ position: item.worldPosition!, nonce: Date.now() })
                            }
                          >
                            Focus
                          </Button>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground leading-relaxed">
                        {item.description}
                      </p>
                      {item.matchedMoveInPinId && (
                        <p className="text-xs font-medium text-sealed">Matches a move-in pin.</p>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          ) : (
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
                  {aiSource.startsWith("live")
                    ? `Fresh AI run on these scans${aiSource.includes("(") ? ` ${aiSource.slice(aiSource.indexOf("("))}` : ""}.`
                    : aiSource.startsWith("cache")
                      ? "From an earlier AI run on these exact scans."
                      : "AI wasn't available; add changes by hand below."}
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
                                  ? "suggestion"
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

                      {viewSnapshots[item.view_id] && (
                        <div className="grid grid-cols-2 gap-2">
                          <figure className="space-y-1">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img
                              src={viewSnapshots[item.view_id].before}
                              alt={`Before: ${item.title}`}
                              className="w-full aspect-[4/3] object-cover rounded-lg border border-border"
                            />
                            <figcaption className="text-[10px] text-muted-foreground text-center">
                              Before (move-in)
                            </figcaption>
                          </figure>
                          <figure className="space-y-1">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img
                              src={viewSnapshots[item.view_id].after}
                              alt={`After: ${item.title}`}
                              className="w-full aspect-[4/3] object-cover rounded-lg border border-border"
                            />
                            <figcaption className="text-[10px] text-muted-foreground text-center">
                              After (move-out)
                            </figcaption>
                          </figure>
                        </div>
                      )}

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
          )}
        </Card>

        {leaseEnded && !sealedAlignment && (
          <p className="text-xs text-muted-foreground">
            No sealed line-up for this lease is in Keyprint&apos;s index, so the before/after view
            isn&apos;t shown here.
          </p>
        )}

        {/* Move-out Scan Import & 4-Point Alignment (only before the lease ends) */}
        {!leaseEnded && (
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
              {moveInUrl ? (
                <AlignmentTool
                  // A new move-out file starts a fresh line-up: no stale taps, scene or result.
                  key={`${moveInUrl}|${effectiveMoveOutUrl}`}
                  moveInUrl={moveInUrl}
                  moveOutUrl={effectiveMoveOutUrl}
                  onAligned={handleAligned}
                  presetLandmarks={
                    // Saved demo points only fit the bundled placeholder pair.
                    usingReferenceOut && moveInUrl.startsWith("/models/")
                      ? {
                          moveIn: REFERENCE_MOVE_IN_LANDMARKS,
                          moveOut: REFERENCE_MOVE_OUT_LANDMARKS,
                        }
                      : undefined
                  }
                />
              ) : (
                <p className="text-sm text-muted-foreground">Waiting for the move-in scan…</p>
              )}
            </CardContent>
          </Card>
        )}
      </div>
    </LeaseShell>
  );
}
