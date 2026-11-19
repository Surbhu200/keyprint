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
import { explorerTxUrl, getRegistryAddress } from "@/lib/chain/arc";
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

function VerifyContent() {
  const searchParams = useSearchParams();
  const initialRecordId = searchParams.get("recordId") || "";

  const [recordIdInput, setRecordIdInput] = useState(initialRecordId);
  const [manifestJsonInput, setManifestJsonInput] = useState("");
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
      .then((r) => r.json())
      .then((data: { record?: StoredRecordLookup | null }) => {
        if (data.record) {
          setManifestJsonInput(data.record.manifest_json);
          setTxMeta({
            txHash: data.record.tx_hash,
            blockNumber: data.record.block_number,
          });
        }
      })
      .catch(() => null);
  }, [initialRecordId]);

  const runVerifyFile = async (file: Blob, fileName: string) => {
    setError(null);
    setResult(null);
    setSelectedFileName(fileName);
    setHashProgress(0);

    try {
      let rid = recordIdInput.trim();
      let mJson = manifestJsonInput.trim();
      let lookupTx = txMeta;

      // If no manifest/recordId pasted, hash locally first and check if our index has a matching sealed manifest
      if (!rid || !mJson) {
        const localSha = await sha256Blob(file, (pct) => setHashProgress(pct));
        const res = await fetch(
          rid
            ? `/api/records?recordId=${encodeURIComponent(rid)}`
            : `/api/records?fileSha256=${encodeURIComponent(localSha)}`,
        );
        const data = (await res.json()) as {
          record?: StoredRecordLookup | null;
          records?: StoredRecordLookup[];
        };
        const found = data.record || data.records?.[0] || null;

        if (!found) {
          setHashProgress(null);
          setResult({
            valid: false,
            reason: "This file does not match any sealed record.",
            fileSha256: localSha,
          });
          return;
        }
        rid = found.record_id;
        mJson = found.manifest_json;
        lookupTx = { txHash: found.tx_hash, blockNumber: found.block_number };
        setRecordIdInput(rid);
        setManifestJsonInput(mJson);
        setTxMeta(lookupTx);
      }

      if (!/^0x[0-9a-fA-F]{64}$/.test(rid)) {
        throw new Error("Record ID must be a valid 32-byte 0x hex string.");
      }

      const verified = await verifyFileAgainstArc({
        file,
        manifestJson: mJson,
        recordId: rid as Hex,
        onHashProgress: (pct) => setHashProgress(pct),
      });
      setHashProgress(null);
      setResult(verified);
    } catch (err) {
      setHashProgress(null);
      setError(err instanceof Error ? err.message : "Verification failed.");
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
        setTxMeta({
          txHash: parsed.records[0].txHash ?? null,
          blockNumber: parsed.records[0].blockNumber ?? null,
        });
      } else if (parsed.canonicalManifestJson && parsed.recordId) {
        setRecordIdInput(parsed.recordId);
        setManifestJsonInput(parsed.canonicalManifestJson);
      } else {
        setManifestJsonInput(text);
      }
    } catch {
      setManifestJsonInput(text);
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
    <main className="flex-1 mx-auto w-full max-w-3xl px-5 py-10 space-y-6">
      <div className="space-y-1.5">
        <Badge variant="sealed">
          <ShieldCheck className="h-3.5 w-3.5" />
          Public proof check · No login · File never leaves your device
        </Badge>
        <h1 className="text-3xl font-semibold tracking-tight">
          Don&apos;t trust Keyprint. Verify it.
        </h1>
        <p className="text-sm text-muted-foreground">
          Drop any 3D scan or photo here. Your browser hashes the file locally and checks its manifest fingerprint directly against the immutable record on Arc. Change one single byte and it fails.
        </p>
      </div>

      {!registryConfigured && (
        <div className="rounded-xl border border-suggestion/30 bg-suggestion/10 px-4 py-3 text-xs text-suggestion">
          Deploy <code className="font-mono">KeyprintRegistry</code> and set{" "}
          <code className="font-mono">NEXT_PUBLIC_KEYPRINT_REGISTRY_ADDRESS</code> in{" "}
          <code className="font-mono">.env.local</code> to verify against live Arc Testnet records.
        </div>
      )}

      {/* Drop zone */}
      <Card>
        <CardContent className="p-6 space-y-4">
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
              <p className="text-xs text-muted-foreground">
                Hashing file locally… {hashProgress}%
              </p>
            </div>
          )}

          {/* Quick reference file test buttons */}
          <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-border text-xs">
            <span className="text-muted-foreground">
              Test with reference scans:
            </span>
            <div className="flex flex-wrap gap-2">
              <Button
                size="sm"
                variant="secondary"
                onClick={async () => {
                  const blob = await fetch(REFERENCE_MOVE_IN_URL).then((r) =>
                    r.blob(),
                  );
                  await runVerifyFile(blob, "apartment-move-in.glb");
                }}
              >
                Check original scan
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={async () => {
                  const blob = await fetch(REFERENCE_TAMPERED_URL).then((r) =>
                    r.blob(),
                  );
                  await runVerifyFile(blob, "apartment-move-in-tampered.glb");
                }}
              >
                Check 1-byte-changed copy
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

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
              ? "border-sealed/40 bg-sealed/5"
              : "border-claim/40 bg-claim/5"
          }
        >
          <CardContent className="p-6 space-y-3">
            <div className="flex items-start gap-3">
              {result.valid ? (
                <CheckCircle2 className="h-6 w-6 text-sealed shrink-0 mt-0.5" />
              ) : (
                <ShieldAlert className="h-6 w-6 text-claim shrink-0 mt-0.5" />
              )}
              <div className="space-y-1">
                <h2
                  className={`text-lg font-semibold ${
                    result.valid ? "text-sealed" : "text-claim"
                  }`}
                >
                  {result.valid
                    ? "Verified — untouched since sealing"
                    : "No match — file was altered or never sealed"}
                </h2>
                <p className="text-sm text-foreground">
                  {result.valid ? verdictLine : result.reason}
                </p>
              </div>
            </div>

            <div className="rounded-xl bg-surface border border-border p-3.5 space-y-1.5 text-xs font-mono">
              <div className="break-all">
                <span className="text-muted-foreground font-sans">
                  File SHA-256:{" "}
                </span>
                {result.fileSha256}
              </div>
              {result.recordId && (
                <div className="break-all">
                  <span className="text-muted-foreground font-sans">
                    Sealed Record ID:{" "}
                  </span>
                  {result.recordId}
                </div>
              )}
              {txMeta?.txHash && (
                <div>
                  <a
                    href={explorerTxUrl(txMeta.txHash)}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 font-sans font-medium text-accent hover:underline"
                  >
                    Inspect sealed proof on Arc Testnet Explorer
                    <ExternalLink className="h-3 w-3" />
                  </a>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      )}

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
            onChange={(e) => setRecordIdInput(e.target.value)}
            placeholder="Record ID (0x…)"
            className="w-full h-10 rounded-lg border border-border bg-background px-3 text-xs font-mono"
          />
          <textarea
            rows={4}
            value={manifestJsonInput}
            onChange={(e) => setManifestJsonInput(e.target.value)}
            placeholder="Exact canonical manifest.json bytes (auto-filled when opened from a Verify link)"
            className="w-full rounded-lg border border-border bg-background p-3 text-xs font-mono"
          />
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
