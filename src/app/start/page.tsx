"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight, Fingerprint, ShieldCheck } from "lucide-react";
import { AppNav } from "@/components/AppNav";
import { Button, buttonVariants } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  loadSavedSession,
  loginPasskeyAccount,
  registerPasskeyAccount,
  type SavedPasskeySession,
} from "@/lib/chain/wallet";
import { cn } from "@/lib/utils";

export default function StartPage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [session, setSession] = useState<SavedPasskeySession | null>(null);
  const [busy, setBusy] = useState<"register" | "login" | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setSession(loadSavedSession());
  }, []);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setBusy("register");
    try {
      const s = await registerPasskeyAccount(name.trim() || "Renter");
      setSession(s);
      router.push("/home");
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Passkey prompt was cancelled or could not finish.",
      );
    } finally {
      setBusy(null);
    }
  };

  const handleReturning = async () => {
    setError(null);
    setBusy("login");
    try {
      const s = await loginPasskeyAccount(name.trim() || undefined);
      setSession(s);
      router.push("/home");
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Could not find an existing passkey on this device.",
      );
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="min-h-screen flex flex-col">
      <AppNav />

      <main className="flex-1 flex items-center justify-center px-5 py-12">
        <Card className="w-full max-w-md">
          <CardHeader className="space-y-2">
            <div className="inline-flex h-11 w-11 items-center justify-center rounded-xl bg-accent/10 text-accent">
              <Fingerprint className="h-5 w-5" />
            </div>
            <CardTitle className="text-2xl">
              {session ? `Welcome back, ${session.username}` : "Protect your deposit"}
            </CardTitle>
            <CardDescription>
              {session
                ? "Your passkey is ready on this device. One touch seals records and approves settlements."
                : "Sign in with Face ID, Touch ID, or Windows Hello. No passwords or recovery phrases."}
            </CardDescription>
          </CardHeader>

          <CardContent className="space-y-5">
            {session ? (
              <div className="space-y-3">
                <Link
                  href="/home"
                  className={cn(buttonVariants({ size: "lg" }), "w-full")}
                >
                  Open my apartments
                  <ArrowRight className="h-4 w-4" />
                </Link>
                <Link
                  href="/unit/new"
                  className={cn(buttonVariants({ variant: "secondary" }), "w-full")}
                >
                  Seal a solo apartment scan
                </Link>
              </div>
            ) : (
              <form onSubmit={handleCreate} className="space-y-4">
                <div className="space-y-1.5">
                  <label
                    htmlFor="name"
                    className="text-sm font-medium text-foreground"
                  >
                    Your name
                  </label>
                  <input
                    id="name"
                    type="text"
                    required
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Alex Rivera"
                    className="w-full h-11 rounded-lg border border-border bg-background px-3.5 text-sm focus:outline-none focus:ring-2 focus:ring-accent"
                  />
                </div>

                {error && (
                  <div className="rounded-xl border border-claim/30 bg-claim/10 px-3.5 py-2.5 text-xs text-claim">
                    {error}
                  </div>
                )}

                <Button
                  type="submit"
                  size="lg"
                  className="w-full"
                  disabled={busy !== null}
                >
                  <Fingerprint className="h-4 w-4" />
                  {busy === "register"
                    ? "Waiting for passkey…"
                    : "Create account with one touch"}
                </Button>

                <Button
                  type="button"
                  variant="secondary"
                  className="w-full"
                  disabled={busy !== null}
                  onClick={handleReturning}
                >
                  {busy === "login" ? "Signing in…" : "I already have a passkey"}
                </Button>
              </form>
            )}

            <div className="rounded-xl bg-muted/60 p-3.5 flex items-start gap-2.5 text-xs text-muted-foreground">
              <ShieldCheck className="h-4 w-4 text-sealed shrink-0 mt-0.5" />
              <span>
                Your passkey stays on your device. Use a second browser profile if you want to test both renter and landlord side by side.
              </span>
            </div>
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
