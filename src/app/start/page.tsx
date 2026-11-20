"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AnimatePresence, MotionConfig, motion } from "framer-motion";
import { ArrowRight, ScanFace, ShieldCheck } from "lucide-react";
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

      <main className="flex-1 flex items-start justify-center px-4 py-6 sm:items-center sm:py-12">
        <Card className="w-full max-w-[460px] max-sm:bg-transparent max-sm:shadow-none">
          <CardHeader className="space-y-0 gap-4 max-sm:px-1 sm:gap-6 sm:px-10 sm:pt-10 sm:pb-7">
            <div className="inline-flex h-14 w-14 items-center justify-center rounded-[18px] bg-ink text-white shadow-[0_10px_24px_-10px_rgba(10,26,51,0.6)]">
              <ScanFace className="h-6 w-6" />
            </div>
            <CardTitle className="max-w-[14ch] font-display font-semibold text-[36px] leading-[1.05] tracking-[-0.03em] text-balance">
              {session ? `Welcome back, ${session.username}` : "Protect your deposit"}
            </CardTitle>
            <CardDescription className="-mt-1 text-[16px] leading-[1.5] sm:-mt-2">
              {session
                ? "Your passkey is ready on this device. One touch seals records and approves settlements."
                : "Sign in with Face ID, Touch ID, or Windows Hello. No passwords or recovery phrases."}
            </CardDescription>
          </CardHeader>

          <CardContent className="space-y-6 max-sm:px-1 sm:px-10 sm:pb-10">
            {session ? (
              <div className="space-y-3">
                <Link
                  href="/home"
                  className={cn(
                    buttonVariants({ size: "lg" }),
                    "w-full h-14 rounded-[18px] bg-ink text-white text-[17px] hover:bg-ink-2",
                  )}
                >
                  Open my apartments
                  <ArrowRight className="h-4 w-4" />
                </Link>
                <Link
                  href="/unit/new"
                  className={cn(
                    buttonVariants({ variant: "secondary" }),
                    "w-full h-12 rounded-2xl text-[15px]",
                  )}
                >
                  Seal a solo apartment scan
                </Link>
              </div>
            ) : (
              <form onSubmit={handleCreate} className="space-y-4">
                <ol className="space-y-3 pb-1">
                  {[
                    "Scan your apartment at move-in",
                    "Seal it with one Face ID touch",
                    "No claim by the deadline? It comes back to you",
                  ].map((line, i) => (
                    <li key={line} className="flex items-center gap-3 text-[15px] leading-snug">
                      <span className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-muted text-[13px] font-semibold tabular-nums text-foreground">
                        {i + 1}
                      </span>
                      {line}
                    </li>
                  ))}
                </ol>

                <div className="space-y-2">
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
                    className="w-full h-14 rounded-2xl border-0 bg-muted px-4 text-[17px] placeholder:text-muted-foreground/70 transition-shadow duration-200 focus:outline-none focus:ring-2 focus:ring-accent"
                  />
                </div>

                {error && (
                  <div
                    role="alert"
                    className="rounded-2xl border-0 bg-claim/8 p-3.5 text-[14px] leading-snug text-claim space-y-1"
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
                  className="w-full h-auto min-h-14 whitespace-normal rounded-[18px] bg-ink py-3.5 text-center text-[17px] leading-snug text-white hover:bg-ink-2"
                  disabled={busy !== null}
                >
                  <ScanFace className="h-5 w-5 shrink-0" />
                  <MotionConfig reducedMotion="user">
                  <AnimatePresence mode="wait" initial={false}>
                    <motion.span
                      key={busy === "register" ? (step ?? "preparing") : "idle"}
                      initial={{ opacity: 0, y: 6 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -6 }}
                      transition={{ duration: 0.15 }}
                    >
                      {busy === "register"
                        ? STEP_LABEL[step ?? "preparing"]
                        : "Create account with one touch"}
                    </motion.span>
                  </AnimatePresence>
                  </MotionConfig>
                </Button>

                <Button
                  type="button"
                  variant="ghost"
                  className="w-full h-auto min-h-12 whitespace-normal rounded-2xl py-2.5 text-center text-[15px] leading-snug text-accent hover:bg-accent/5 hover:text-accent"
                  disabled={busy !== null}
                  onClick={handleReturning}
                >
                  {busy === "login" ? STEP_LABEL[step ?? "preparing"] : "I already have a passkey"}
                </Button>
              </form>
            )}

            <div className="rounded-2xl bg-muted/70 p-4 flex items-start gap-2.5 text-[14px] leading-snug text-muted-foreground">
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
