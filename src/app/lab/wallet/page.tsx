"use client";

import { useEffect, useState } from "react";
import type { Address } from "viem";
import {
  CheckCircle2,
  ExternalLink,
  Fingerprint,
  RefreshCw,
  Send,
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
import {
  explorerAddressUrl,
  explorerTxUrl,
  formatDollars,
  formatNativeUsdcFee,
} from "@/lib/chain/arc";
import {
  loadSavedSession,
  loginPasskeyAccount,
  readUsdcBalance,
  registerPasskeyAccount,
  sendSponsoredUsdcTransfer,
  type SavedPasskeySession,
  type UserOpResult,
} from "@/lib/chain/wallet";
import { sha256Blob } from "@/lib/evidence/hash";
import { getSignedReadUrl, uploadToPrivateStorage } from "@/lib/supabase/upload";

export default function WalletLabPage() {
  const [session, setSession] = useState<SavedPasskeySession | null>(null);
  const [username, setUsername] = useState("renter-demo");
  const [balance, setBalance] = useState<bigint | null>(null);
  const [recipient, setRecipient] = useState("");
  const [amount, setAmount] = useState("1");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [txResult, setTxResult] = useState<UserOpResult | null>(null);

  // Checkpoint 3 quick signed-upload test
  const [uploadStatus, setUploadStatus] = useState<string | null>(null);
  const [uploadResult, setUploadResult] = useState<{
    path: string;
    sha256: string;
    signedReadUrl: string;
  } | null>(null);

  useEffect(() => {
    const saved = loadSavedSession();
    setSession(saved);
    if (saved) {
      readUsdcBalance(saved.address).then(setBalance).catch(() => setBalance(null));
    }
  }, []);

  const refreshBalance = async (addr: Address) => {
    setBusy("balance");
    try {
      const b = await readUsdcBalance(addr);
      setBalance(b);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to read USDC balance.");
    } finally {
      setBusy(null);
    }
  };

  const handleRegister = async () => {
    setError(null);
    setBusy("register");
    try {
      const s = await registerPasskeyAccount(username);
      setSession(s);
      await refreshBalance(s.address);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Passkey registration failed.");
    } finally {
      setBusy(null);
    }
  };

  const handleLogin = async () => {
    setError(null);
    setBusy("login");
    try {
      const s = await loginPasskeyAccount(username || undefined);
      setSession(s);
      await refreshBalance(s.address);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Passkey sign-in failed.");
    } finally {
      setBusy(null);
    }
  };

  const handleSend = async () => {
    if (!session) return;
    if (!/^0x[0-9a-fA-F]{40}$/.test(recipient.trim())) {
      setError("Enter a valid 0x recipient address.");
      return;
    }
    setError(null);
    setBusy("send");
    try {
      const res = await sendSponsoredUsdcTransfer(
        session,
        recipient.trim() as Address,
        amount,
      );
      setTxResult(res);
      await refreshBalance(session.address);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sponsored transfer failed.");
    } finally {
      setBusy(null);
    }
  };

  const handleGlbUpload = async (file: File) => {
    setError(null);
    setUploadStatus("Hashing file in chunks (hash-wasm)…");
    try {
      const sha256 = await sha256Blob(file, (pct) =>
        setUploadStatus(`Hashing file… ${pct}%`),
      );
      setUploadStatus("Requesting Supabase signed upload URL & uploading…");
      const up = await uploadToPrivateStorage({
        file,
        filename: file.name,
        contentType: file.type || "model/gltf-binary",
        scope: "lab",
      });
      const signedReadUrl = await getSignedReadUrl(up.path);
      setUploadResult({ path: up.path, sha256, signedReadUrl });
      setUploadStatus(null);
    } catch (err) {
      setUploadStatus(null);
      setError(err instanceof Error ? err.message : "Upload failed.");
    }
  };

  return (
    <div className="min-h-screen flex flex-col">
      <AppNav />
      <main className="mx-auto w-full max-w-4xl px-5 py-10 space-y-6">
        <div className="space-y-1">
          <Badge variant="accent">Verification Lab · Checkpoints 2 &amp; 3</Badge>
          <h1 className="text-2xl font-semibold tracking-tight">
            Arc Testnet Passkey &amp; Private Storage Check
          </h1>
          <p className="text-sm text-muted-foreground">
            Verify Circle Modular Wallets passkey auth + gas-sponsored 1 USDC transfer on Arc Testnet (`chainId: 5042002`), and direct browser-to-Supabase `.glb` upload.
          </p>
        </div>

        {error && (
          <div className="rounded-xl border border-claim/30 bg-claim/10 px-4 py-3 text-sm text-claim">
            {error}
          </div>
        )}

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Fingerprint className="h-5 w-5 text-accent" />
              1. Circle Modular Wallet (Passkey on Arc Testnet)
            </CardTitle>
            <CardDescription>
              Passkeys are origin-bound: test on your configured localhost or production Vercel domain.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-col sm:flex-row gap-3">
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="Account label (e.g. renter-1)"
                className="flex-1 h-11 rounded-lg border border-border bg-background px-3.5 text-sm"
              />
              <Button onClick={handleRegister} disabled={busy !== null}>
                {busy === "register" ? "Prompting passkey…" : "Register new passkey"}
              </Button>
              <Button variant="secondary" onClick={handleLogin} disabled={busy !== null}>
                {busy === "login" ? "Signing in…" : "Sign in existing"}
              </Button>
            </div>

            {session && (
              <div className="rounded-xl border border-border bg-muted/40 p-4 space-y-2 text-sm">
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Smart Account</span>
                  <a
                    href={explorerAddressUrl(session.address)}
                    target="_blank"
                    rel="noreferrer"
                    className="font-mono text-xs text-accent hover:underline inline-flex items-center gap-1"
                  >
                    {session.address}
                    <ExternalLink className="h-3 w-3" />
                  </a>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Arc Testnet USDC (6 dec)</span>
                  <div className="flex items-center gap-2">
                    <span className="font-semibold">
                      {balance !== null ? formatDollars(balance) : "—"}
                    </span>
                    <button
                      type="button"
                      onClick={() => refreshBalance(session.address)}
                      className="p-1 rounded hover:bg-surface cursor-pointer"
                      title="Refresh balance"
                    >
                      <RefreshCw className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Send className="h-5 w-5 text-accent" />
              2. Gas-Sponsored Test Transfer (1 USDC on Arc Testnet)
            </CardTitle>
            <CardDescription>
              Sends 6-decimal ERC-20 USDC (`0x3600...0000`) with `paymaster: true`. Fund the sender via faucet.circle.com first.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid sm:grid-cols-4 gap-3">
              <input
                type="text"
                value={recipient}
                onChange={(e) => setRecipient(e.target.value)}
                placeholder="Recipient 0x… (second account)"
                className="sm:col-span-3 h-11 rounded-lg border border-border bg-background px-3.5 text-sm font-mono"
              />
              <input
                type="number"
                min="0.01"
                step="0.01"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className="h-11 rounded-lg border border-border bg-background px-3.5 text-sm"
              />
            </div>

            <Button onClick={handleSend} disabled={!session || busy !== null}>
              {busy === "send"
                ? "Submitting sponsored UserOp…"
                : `Send $${amount || "1"} USDC (gas sponsored)`}
            </Button>

            {txResult && (
              <div className="rounded-xl border border-sealed/30 bg-sealed/5 p-4 space-y-1.5 text-sm">
                <div className="flex items-center gap-2 font-semibold text-sealed">
                  <CheckCircle2 className="h-4 w-4" />
                  <span>Confirmed in block {txResult.blockNumber.toString()}</span>
                </div>
                <div className="text-xs text-muted-foreground">
                  Measured USDC gas cost (sponsored):{" "}
                  <span className="font-semibold text-foreground">
                    {formatNativeUsdcFee(txResult.actualGasCost)}
                  </span>
                </div>
                <a
                  href={explorerTxUrl(txResult.txHash)}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 text-xs font-mono text-accent hover:underline break-all"
                >
                  {txResult.txHash}
                  <ExternalLink className="h-3 w-3 shrink-0" />
                </a>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Upload className="h-5 w-5 text-accent" />
              3. Supabase Private Bucket Signed Upload (.glb)
            </CardTitle>
            <CardDescription>
              Hashes the file in streaming chunks (`hash-wasm`) and uploads directly to your private `keyprint-private` bucket via `/api/upload-url`.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <input
              type="file"
              accept=".glb,model/gltf-binary"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) handleGlbUpload(file);
              }}
              className="block w-full text-sm file:mr-4 file:rounded-lg file:border-0 file:bg-accent file:px-4 file:py-2 file:text-xs file:font-semibold file:text-white hover:file:bg-accent/90 cursor-pointer"
            />
            {uploadStatus && (
              <p className="text-xs text-muted-foreground">{uploadStatus}</p>
            )}
            {uploadResult && (
              <div className="rounded-xl border border-sealed/30 bg-sealed/5 p-4 space-y-1 text-xs">
                <div className="font-semibold text-sealed">Uploaded privately to Supabase</div>
                <div>
                  <span className="text-muted-foreground">Object path: </span>
                  <code className="font-mono">{uploadResult.path}</code>
                </div>
                <div className="break-all">
                  <span className="text-muted-foreground">SHA-256: </span>
                  <code className="font-mono">{uploadResult.sha256}</code>
                </div>
                <a
                  href={uploadResult.signedReadUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 text-accent hover:underline pt-1"
                >
                  Test 1-hour signed download URL
                  <ExternalLink className="h-3 w-3" />
                </a>
              </div>
            )}
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
