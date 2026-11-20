"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import type { Hex } from "viem";
import {
  CheckCircle2,
  Download,
  ExternalLink,
  FileCheck2,
  ShieldAlert,
  ShieldCheck,
  Upload,
} from "lucide-react";
import { AppNav } from "@/components/AppNav";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { createArcPublicClient, explorerTxUrl, getRegistryAddress } from "@/lib/chain/arc";
import { sha256Blob } from "@/lib/evidence/hash";
import {
  verifyFileAgainstArc,
  type VerificationResult,
} from "@/lib/evidence/manifest";
import {
  REFERENCE_MOVE_IN_URL,
  REFERENCE_TAMPERED_URL,
} from "@/lib/sample/reference";

interface StoredRecordLookup {
  record_id: string;
  manifest_json: string;
  tx_hash: string | null;
  block_number: number | null;
}

/**
 * Returns the tx hash and block number only if that transaction's receipt really contains
 * KeyprintRegistry's RecordSealed log for this record id (topic 1). Otherwise returns null,
 * so a wrong link from the index is never shown next to a green result.
 */
async function confirmSealTx(
  recordId: string,
  txHash: string | null,
): Promise<{ txHash: string | null; blockNumber: number | null } | null> {
  const registry = getRegistryAddress();
  if (!txHash || !registry || !/^0x[0-9a-fA-F]{64}$/.test(txHash)) return null;
  try {
    const receipt = await createArcPublicClient().getTransactionReceipt({ hash: txHash as Hex });
    const sealed = receipt.logs.some(
      (log) =>
        log.address.toLowerCase() === registry.toLowerCase() &&
        (log.topics[1] ?? "").toLowerCase() === recordId.toLowerCase(),
    );
    return sealed ? { txHash, blockNumber: Number(receipt.blockNumber) } : null;
  } catch {
    return null;
  }
}

function VerifyContent() {
  const searchParams = useSearchParams();
  const initialRecordId = searchParams.get("recordId") || "";

  const [recordIdInput, setRecordIdInput] = useState(initialRecordId);
  const [manifestJsonInput, setManifestJsonInput] = useState("");
  const [manualManifestOverride, setManualManifestOverride] = useState(
    Boolean(initialRecordId),
  );
  const [txMeta, setTxMeta] = useState<{
    txHash: string | null;
    blockNumber: number | null;
  } | null>(null);

  const [hashProgress, setHashProgress] = useState<number | null>(null);
  const [selectedFileName, setSelectedFileName] = useState<string | null>(null);
  const [result, setResult] = useState<VerificationResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  // If opened via /verify?recordId=0x..., fetch its saved canonical manifest JSON bytes
  // (we still re-hash those exact bytes and check directly against Arc in the browser).
  useEffect(() => {
    if (!initialRecordId) return;
    fetch(`/api/records?recordId=${encodeURIComponent(initialRecordId)}`)
      .then(async (r) => (r.ok ? r.json() : Promise.reject(new Error("index unavailable"))))
      .then((data: { record?: StoredRecordLookup | null }) => {
        if (data.record) {
          setManifestJsonInput(data.record.manifest_json);
          setTxMeta({
            txHash: data.record.tx_hash,
            blockNumber: data.record.block_number,
          });
        }
      })
      .catch(() =>
        setError(
          "Couldn't load this record's manifest from Keyprint's index. You can still load it from an evidence bundle below.",
        ),
      );
  }, [initialRecordId]);

  const runVerifyFile = async (file: Blob, fileName: string) => {
    setError(null);
    setResult(null);
    setSelectedFileName(fileName);
    setHashProgress(0);

    try {
      const rid = manualManifestOverride ? recordIdInput.trim() : "";
      const mJson = manualManifestOverride ? manifestJsonInput.trim() : "";

      // A specific manifest was loaded (record link or evidence bundle): check exactly that one.
      let candidates: StoredRecordLookup[] =
        rid && mJson ? [{ record_id: rid, manifest_json: mJson, tx_hash: null, block_number: null }] : [];

      if (candidates.length === 0) {
        // Otherwise find every sealed record whose manifest lists this file's fingerprint.
        const localSha = await sha256Blob(file, (pct) => setHashProgress(pct));
        let data: {
          record?: StoredRecordLookup | null;
          records?: StoredRecordLookup[];
          error?: string;
          configured?: boolean;
        } | null = null;
        let ok = false;
        try {
          const res = await fetch(
            rid
              ? `/api/records?recordId=${encodeURIComponent(rid)}`
              : `/api/records?fileSha256=${encodeURIComponent(localSha)}`,
          );
          ok = res.ok;
          data = await res.json().catch(() => null);
        } catch {
          ok = false;
        }

        // An index that can't be reached says nothing about the file: never show red for it.
        if (!ok || !data || data.error || data.configured === false) {
          setHashProgress(null);
          setError(
            "Couldn't reach Keyprint's record index, so nothing was checked. If you have the evidence bundle, load its manifest below and try again.",
          );
          return;
        }

        candidates = data.record ? [data.record] : (data.records ?? []);
        if (candidates.length === 0) {
          setHashProgress(null);
          setTxMeta(null);
          setResult({
            valid: false,
            reason: "This file does not match any sealed record.",
            fileSha256: localSha,
          });
          return;
        }
      }

      // Every candidate is checked against Arc in this browser; the first that passes wins.
      let best: VerificationResult | null = null;
      let bestCandidate: StoredRecordLookup | null = null;
      for (const c of candidates) {
        if (!/^0x[0-9a-fA-F]{64}$/.test(c.record_id)) continue;
        const v = await verifyFileAgainstArc({
          file,
          manifestJson: c.manifest_json,
          recordId: c.record_id as Hex,
          onHashProgress: (pct) => setHashProgress(pct),
        });
        if (!best || v.valid) {
          best = v;
          bestCandidate = c;
        }
        if (v.valid) break;
      }
      setHashProgress(null);
      if (!best || !bestCandidate) {
        throw new Error("Record ID must be a valid 32-byte 0x hex string.");
      }

      setRecordIdInput(bestCandidate.record_id);
      setManifestJsonInput(bestCandidate.manifest_json);
      // Show a block and explorer link only if that transaction really sealed this record.
      setTxMeta(
        best.valid
          ? await confirmSealTx(bestCandidate.record_id, bestCandidate.tx_hash ?? txMeta?.txHash ?? null)
          : null,
      );
      setResult(best);
    } catch (err) {
      setHashProgress(null);
      setError(
        err instanceof Error && /fetch|network|http/i.test(err.message)
          ? "Couldn't reach Arc right now, so nothing was checked. Try again in a moment."
          : err instanceof Error
            ? err.message
            : "Verification failed.",
      );
    }
  };

  const handleLoadManifestFile = async (file: File) => {
    const text = await file.text();
    try {
      const parsed = JSON.parse(text) as {
        canonicalManifestJson?: string;
        recordId?: string;
        records?: Array<{
          recordId: string;
          canonicalManifestJson: string;
          txHash?: string | null;
          blockNumber?: number | null;
        }>;
      };
      // Supports either raw manifest.json OR a downloaded keyprint-evidence bundle
      if (parsed.records?.[0]) {
        setRecordIdInput(parsed.records[0].recordId);
        setManifestJsonInput(parsed.records[0].canonicalManifestJson);
        setManualManifestOverride(true);
        setTxMeta({
          txHash: parsed.records[0].txHash ?? null,
          blockNumber: parsed.records[0].blockNumber ?? null,
        });
      } else if (parsed.canonicalManifestJson && parsed.recordId) {
        setRecordIdInput(parsed.recordId);
        setManifestJsonInput(parsed.canonicalManifestJson);
        setManualManifestOverride(true);
      } else {
        setManifestJsonInput(text);
        setManualManifestOverride(true);
      }
    } catch {
      setManifestJsonInput(text);
      setManualManifestOverride(true);
    }
  };

  const registryConfigured = Boolean(getRegistryAddress());

  const verdictLine = (() => {
    if (!result?.valid) return null;
    const when = result.sealedAt
      ? new Date(result.sealedAt * 1000).toLocaleString("en-US", {
          month: "short",
          day: "numeric",
          year: "numeric",
          hour: "numeric",
          minute: "2-digit",
        })
      : "Unknown time";
    const blockPart = txMeta?.blockNumber
      ? `, block ${txMeta.blockNumber.toLocaleString("en-US")}`
      : "";
    if (result.isSolo) {
      return `Matches the record sealed ${when}${blockPart}, by this account.`;
    }
    const byWho =
      result.authorRole === "renter"
        ? "by the renter"
        : result.authorRole === "landlord"
          ? "by the landlord"
          : "by this account";
    const coSignPart = result.coSignedByLandlord
      ? ", co-signed by the landlord"
      : "";
    return `Matches the record sealed ${when}${blockPart}, ${byWho}${coSignPart}.`;
  })();

  return (
    <main className="flex-1 mx-auto w-full max-w-3xl xl:max-w-5xl px-5 py-6 sm:py-10 space-y-6">
      <div className="max-w-2xl space-y-3">
        <div className="flex flex-wrap gap-2">
          <Badge variant="sealed">
            <ShieldCheck className="h-3.5 w-3.5" />
            Public proof check
          </Badge>
          <Badge>No login</Badge>
          <Badge>File never leaves your device</Badge>
        </div>
        <h1 className="text-3xl sm:text-4xl font-semibold tracking-tight text-balance">
          Don&apos;t trust Keyprint. Verify it.
        </h1>
        <p className="text-base leading-relaxed text-muted-foreground">
          Drop any 3D scan or photo. Your browser fingerprints it on this device
          (SHA-256) and checks that fingerprint against the record sealed on
          Arc. Change one single byte and it fails.
        </p>
      </div>

      {!registryConfigured && (
        <div className="rounded-xl border border-suggestion/30 bg-suggestion/10 px-4 py-3 text-xs text-suggestion">
          Deploy <code className="font-mono">KeyprintRegistry</code> and set{" "}
          <code className="font-mono">NEXT_PUBLIC_KEYPRINT_REGISTRY_ADDRESS</code> in{" "}
          <code className="font-mono">.env.local</code> to verify against live Arc Testnet records.
        </div>
      )}

      {/* Drop zone and verdict: side by side from xl, stacked below */}
      <div className="grid gap-6 xl:grid-cols-2 xl:items-start">
        <Card>
          <CardContent className="p-4 sm:p-6 space-y-4">
            <label
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                const f = e.dataTransfer.files?.[0];
                if (f) runVerifyFile(f, f.name);
              }}
              className="flex flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed border-border bg-muted/35 hover:bg-muted/60 transition-colors p-10 text-center cursor-pointer"
            >
              <div className="inline-flex h-12 w-12 items-center justify-center rounded-xl bg-surface border border-border text-accent shadow-xs">
                <Upload className="h-5 w-5" />
              </div>
              <div>
                <p className="font-semibold text-sm text-foreground">
                  Drop a 3D scan (.glb) or photo to verify
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  {selectedFileName
                    ? `Last checked: ${selectedFileName}`
                    : "Hashed locally in your browser with SHA-256"}
                </p>
              </div>
              <input
                type="file"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) runVerifyFile(f, f.name);
                }}
              />
            </label>

            {hashProgress !== null && (
              <div className="space-y-1">
                <div className="h-2 w-full rounded-full bg-muted overflow-hidden">
                  <div
                    className="h-full bg-accent transition-all duration-150"
                    style={{ width: `${hashProgress}%` }}
                  />
                </div>
                <p className="text-sm text-muted-foreground tabular-nums">
                  Hashing file locally… {hashProgress}%
                </p>
              </div>
            )}

            {/* Quick reference file test buttons */}
            <div className="space-y-3 border-t border-border pt-4">
              <p className="text-sm font-semibold text-foreground">
                No file handy? Test with the sample apartment
              </p>
              <p className="text-sm text-muted-foreground">
                The original should turn green. The copy with one byte changed
                should turn red. Each check downloads a 16 MB file first.
              </p>
              <div className="grid gap-2.5">
                <Button
                  variant="secondary"
                  className="w-full"
                  onClick={async () => {
                    const blob = await fetch(REFERENCE_MOVE_IN_URL).then((r) =>
                      r.blob(),
                    );
                    await runVerifyFile(blob, "apartment-move-in.glb");
                  }}
                >
                  <ShieldCheck className="h-4 w-4 text-sealed" />
                  Check original scan
                </Button>
                <Button
                  variant="outline"
                  className="w-full"
                  onClick={async () => {
                    const blob = await fetch(REFERENCE_TAMPERED_URL).then((r) =>
                      r.blob(),
                    );
                    await runVerifyFile(blob, "apartment-move-in-tampered.glb");
                  }}
                >
                  <ShieldAlert className="h-4 w-4 text-claim" />
                  Check 1-byte-changed copy
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        <div className="space-y-4" aria-live="polite">
          {error && (
            <div className="rounded-xl border border-claim/30 bg-claim/10 px-4 py-3 text-sm text-claim">
              {error}
            </div>
          )}

          {/* Verdict banner */}
          {result && (
            <Card
              className={
                result.valid
                  ? "border-2 border-sealed/50 bg-sealed/5 motion-safe:animate-rise"
                  : "border-2 border-claim/50 bg-claim/5 motion-safe:animate-rise"
              }
            >
              <CardContent className="p-5 sm:p-6 space-y-4">
                <div className="flex items-start gap-4">
                  {result.valid ? (
                    <span className="inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-full text-white bg-sealed">
                      <CheckCircle2 className="h-6 w-6" />
                    </span>
                  ) : (
                    <span className="inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-full text-white bg-claim">
                      <ShieldAlert className="h-6 w-6" />
                    </span>
                  )}
                  <div className="space-y-1">
                    <h2
                      className={`text-xl sm:text-2xl font-semibold tracking-tight ${
                        result.valid ? "text-sealed" : "text-claim"
                      }`}
                    >
                      {result.valid
                        ? "Verified — untouched since sealing"
                        : "No match — file was altered or never sealed"}
                    </h2>
                    <p className="text-sm sm:text-base text-foreground">
                      {result.valid ? verdictLine : result.reason}
                    </p>
                  </div>
                </div>

                <div className="space-y-3 rounded-xl border border-border bg-surface p-4">
                  <dl className="space-y-3 text-xs">
                    <div className="space-y-1">
                      <dt className="font-semibold uppercase tracking-wider text-muted-foreground">
                        File fingerprint (SHA-256)
                      </dt>
                      <dd className="break-all font-mono text-foreground">
                        {result.fileSha256}
                      </dd>
                    </div>
                    {result.recordId && (
                      <div className="space-y-1">
                        <dt className="font-semibold uppercase tracking-wider text-muted-foreground">
                          Sealed record ID
                        </dt>
                        <dd className="break-all font-mono text-foreground">
                          {result.recordId}
                        </dd>
                      </div>
                    )}
                  </dl>
                  {txMeta?.txHash && (
                    <a
                      href={explorerTxUrl(txMeta.txHash)}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex min-h-11 items-center gap-1.5 text-sm font-medium text-accent hover:underline"
                    >
                      Inspect sealed proof on Arc Testnet Explorer
                      <ExternalLink className="h-3.5 w-3.5" />
                    </a>
                  )}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Desktop-only empty state, so the verdict lands beside the drop zone */}
          {!result && !error && (
            <div className="hidden xl:flex min-h-[300px] flex-col justify-center gap-4 rounded-2xl border-2 border-dashed border-border bg-surface/60 p-8">
              <p className="text-sm font-semibold text-foreground">
                Your result appears here
              </p>
              <div className="flex items-center gap-3 text-sm text-muted-foreground">
                <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-sealed/10 text-sealed">
                  <CheckCircle2 className="h-4 w-4" />
                </span>
                Green: the file matches its sealed record, byte for byte
              </div>
              <div className="flex items-center gap-3 text-sm text-muted-foreground">
                <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-claim/10 text-claim">
                  <ShieldAlert className="h-4 w-4" />
                </span>
                Red: it was changed, even by one byte, or never sealed
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Optional zero-trust offline manifest inputs */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <FileCheck2 className="h-4 w-4 text-accent" />
            Offline / downloaded manifest (optional)
          </CardTitle>
          <CardDescription>
            Have a downloaded evidence bundle or{" "}
            <code className="font-mono">manifest.json</code>? Load it here to verify without touching Keyprint&apos;s index at all.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <label className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-surface px-3 py-1.5 text-xs font-medium cursor-pointer hover:bg-muted">
              <Upload className="h-3.5 w-3.5" />
              Load manifest.json / evidence bundle
              <input
                type="file"
                accept=".json,application/json"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) handleLoadManifestFile(f);
                }}
              />
            </label>
            <a
              href={REFERENCE_MOVE_IN_URL}
              download="apartment-move-in.glb"
              className="inline-flex items-center gap-1 text-xs text-accent hover:underline ml-auto"
            >
              <Download className="h-3.5 w-3.5" />
              Download original .glb
            </a>
            <a
              href={REFERENCE_TAMPERED_URL}
              download="apartment-move-in-tampered.glb"
              className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground hover:underline"
            >
              <Download className="h-3.5 w-3.5" />
              1-byte-changed .glb
            </a>
          </div>

          <input
            type="text"
            value={recordIdInput}
            onChange={(e) => {
              setRecordIdInput(e.target.value);
              setManualManifestOverride(Boolean(e.target.value.trim()));
            }}
            placeholder="Record ID (0x…)"
            className="w-full h-10 rounded-lg border border-border bg-background px-3 text-xs font-mono"
          />
          <textarea
            rows={4}
            value={manifestJsonInput}
            onChange={(e) => {
              setManifestJsonInput(e.target.value);
              setManualManifestOverride(Boolean(e.target.value.trim()));
            }}
            placeholder="Exact canonical manifest.json bytes (auto-filled when opened from a Verify link)"
            className="w-full rounded-lg border border-border bg-background p-3 text-xs font-mono"
          />
          {(recordIdInput || manifestJsonInput) && (
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                setRecordIdInput("");
                setManifestJsonInput("");
                setManualManifestOverride(false);
                setTxMeta(null);
                setResult(null);
              }}
            >
              Clear loaded manifest
            </Button>
          )}
        </CardContent>
      </Card>
    </main>
  );
}

export default function VerifyPage() {
  return (
    <div className="min-h-screen flex flex-col">
      <AppNav />
      <Suspense
        fallback={
          <main className="flex-1 flex items-center justify-center p-10 text-sm text-muted-foreground">
            Loading verifier…
          </main>
        }
      >
        <VerifyContent />
      </Suspense>
    </div>
  );
}
