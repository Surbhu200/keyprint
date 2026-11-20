"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight, Fingerprint, ShieldCheck } from "lucide-react";
import { AppNav } from "@/components/AppNav";
import { usePasskeySession } from "@/components/usePasskeySession";
import { Button, buttonVariants } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  loginPasskeyAccount,
  newPasskeySuffix,
  prefetchPasskeyOptions,
  registerPasskeyAccount,
  toCircleUsername,
  type PasskeyStep,
} from "@/lib/chain/wallet";
import { cn } from "@/lib/utils";

const DEFAULT_NAME = "Renter";

const STEP_LABEL: Record<PasskeyStep, string> = {
  preparing: "Getting ready…",
  faceid: "Confirm with Face ID, Touch ID or Windows Hello…",
  verifying: "Checking your passkey…",
  account: "Setting up your account…",
};

/** Plain-words passkey errors, plus the raw reason for troubleshooting. */
function describePasskeyError(err: unknown): { message: string; detail: string } {
  const name = err instanceof Error ? err.name : "";
  // viem wraps Circle's errors; its `details` holds Circle's own words.
  const wrapped = err as { details?: unknown; shortMessage?: unknown } | null;
  const raw =
    (typeof wrapped?.details === "string" && wrapped.details) ||
    (typeof wrapped?.shortMessage === "string" && wrapped.shortMessage) ||
    (err instanceof Error ? err.message : String(err ?? ""));
  const detail = `${name ? `${name}: ` : ""}${raw}`.slice(0, 220);
  const text = `${name} ${raw}`.toLowerCase();
  let message = raw.length > 0 && raw.length <= 160 ? raw : "The passkey didn't finish. Try again.";
  if (text.includes("notallowederror") || text.includes("not allowed") || text.includes("cancel")) {
    message =
      "Face ID didn't open or was cancelled. On iPhone, open this page in Safari itself (not inside another app) and make sure iCloud Keychain is on (Settings → your name → iCloud → Passwords), then try again.";
  } else if (text.includes("invalidstateerror")) {
    message = "This device already has a Keyprint passkey. Tap “I already have a passkey”.";
  } else if (text.includes("securityerror") || text.includes("relying party")) {
    message = "This address can't use passkeys. Open keyprint-two.vercel.app directly in Safari or Chrome.";
  } else if (text.includes("credential management api not supported")) {
    message = "This browser can't use passkeys. Open the page in Safari or Chrome.";
  } else if (text.includes("username is invalid")) {
    message = "That name can't be used for a passkey. Try letters and numbers only.";
  } else if (text.includes("fetch") || text.includes("network")) {
    message = "Couldn't reach the passkey service. Check your connection and try again.";
  }
  return { message, detail };
}

export default function StartPage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const session = usePasskeySession();
  const [busy, setBusy] = useState<"register" | "login" | null>(null);
  const [step, setStep] = useState<PasskeyStep | null>(null);
  const [error, setError] = useState<{ message: string; detail: string } | null>(null);
  const effectiveName = name.trim() || DEFAULT_NAME;
  // The Circle username doesn't depend on what's typed, so typing never invalidates the
  // prefetched passkey options; a fresh suffix per sign-up attempt avoids reusing a username.
  const [suffix, setSuffix] = useState(newPasskeySuffix);
  const circleUsername = toCircleUsername("keyprint", suffix);

  // Fetch passkey options before the tap, and keep them fresh while this page is open:
  // iPhone Safari only opens Face ID if the passkey call happens right after the tap.
  useEffect(() => {
    if (session || busy) return;
    const prefetch = () => {
      void prefetchPasskeyOptions("register", circleUsername);
      void prefetchPasskeyOptions("login");
    };
    const onVisible = () => {
      if (document.visibilityState === "visible") prefetch();
    };
    const first = setTimeout(prefetch, 300);
    const refresh = setInterval(prefetch, 40_000);
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", prefetch);
    return () => {
      clearTimeout(first);
      clearInterval(refresh);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", prefetch);
    };
  }, [circleUsername, session, busy]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setBusy("register");
    try {
      await registerPasskeyAccount(circleUsername, setStep, effectiveName);
      router.push("/home");
    } catch (err) {
      setError(describePasskeyError(err));
      setSuffix(newPasskeySuffix()); // the next attempt gets a fresh username (and prefetch)
    } finally {
      setBusy(null);
      setStep(null);
    }
  };

  const handleReturning = async () => {
    setError(null);
    setBusy("login");
    try {
      await loginPasskeyAccount(name.trim() || undefined, setStep);
      router.push("/home");
    } catch (err) {
      setError(describePasskeyError(err));
      void prefetchPasskeyOptions("login");
    } finally {
      setBusy(null);
      setStep(null);
    }
  };

  return (
    <div className="min-h-screen flex flex-col">
      <AppNav />

      <main className="flex-1 flex items-center justify-center px-5 py-8 sm:py-12">
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
                    Your name <span className="text-muted-foreground font-normal">(optional)</span>
                  </label>
                  <input
                    id="name"
                    type="text"
                    autoComplete="name"
                    autoCapitalize="words"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Alex Rivera"
                    className="w-full h-12 sm:h-11 rounded-lg border border-border bg-background px-3.5 text-base sm:text-sm focus:outline-none focus:ring-2 focus:ring-accent"
                  />
                </div>

                {error && (
                  <div
                    role="alert"
                    className="rounded-xl border border-claim/30 bg-claim/10 px-3.5 py-2.5 text-sm leading-snug text-claim space-y-1"
                  >
                    <p>{error.message}</p>
                    {error.detail && error.detail !== error.message && (
                      <p className="text-xs opacity-80 break-words">Details: {error.detail}</p>
                    )}
                  </div>
                )}

                <Button
                  type="submit"
                  size="lg"
                  className="w-full h-auto min-h-12 whitespace-normal py-3 text-center leading-snug"
                  disabled={busy !== null}
                >
                  <Fingerprint className="h-4 w-4 shrink-0" />
                  {busy === "register"
                    ? STEP_LABEL[step ?? "preparing"]
                    : "Create account with one touch"}
                </Button>

                <Button
                  type="button"
                  variant="secondary"
                  className="w-full h-auto min-h-11 whitespace-normal py-2.5 text-center leading-snug"
                  disabled={busy !== null}
                  onClick={handleReturning}
                >
                  {busy === "login" ? STEP_LABEL[step ?? "preparing"] : "I already have a passkey"}
                </Button>
              </form>
            )}

            <div className="rounded-xl bg-muted/60 p-3.5 flex items-start gap-2.5 text-sm text-muted-foreground">
              <ShieldCheck className="h-4 w-4 text-sealed shrink-0 mt-0.5" />
              <span>
                Your passkey stays on your device; Keyprint never holds it.
                <span className="mt-1 block text-xs">
                  Testing both sides? Open the landlord in a second browser profile.
                </span>
              </span>
            </div>
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
