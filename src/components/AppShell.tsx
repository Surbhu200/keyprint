"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Box,
  Download,
  Fingerprint,
  Home,
  Info,
  ScanLine,
  ShieldCheck,
  Sparkles,
  User,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { DetailsDrawer } from "./DetailsDrawer";
import { usePasskeySession } from "./usePasskeySession";
import { Button } from "./ui/button";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

const PRIMARY_NAV = [
  { href: "/home", label: "Home", shortLabel: "Home", icon: Home },
  { href: "/unit/new", label: "Solo scan", shortLabel: "Scan", icon: ScanLine },
  { href: "/sample", label: "Sample apartment", shortLabel: "Sample", icon: Box },
  { href: "/verify", label: "Verify", shortLabel: "Verify", icon: ShieldCheck },
] as const;

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const session = usePasskeySession();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [installPrompt, setInstallPrompt] =
    useState<BeforeInstallPromptEvent | null>(null);

  // Register lightweight PWA service worker & capture desktop/mobile install prompt
  useEffect(() => {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(() => null);
    }
    const onPrompt = (e: Event) => {
      e.preventDefault();
      setInstallPrompt(e as BeforeInstallPromptEvent);
    };
    window.addEventListener("beforeinstallprompt", onPrompt);
    return () => window.removeEventListener("beforeinstallprompt", onPrompt);
  }, []);

  const handleInstall = async () => {
    if (!installPrompt) return;
    await installPrompt.prompt();
    await installPrompt.userChoice;
    setInstallPrompt(null);
  };

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col lg:flex-row">
      {/* Desktop Native-Style Left Application Sidebar */}
      <aside
        aria-label="Sidebar"
        className="hidden lg:fixed lg:inset-y-0 lg:flex lg:w-64 lg:flex-col z-30 border-r border-border bg-surface"
      >
        <div className="h-16 px-5 flex items-center justify-between border-b border-border/70">
          <Link
            href="/"
            className="-mx-1.5 flex items-center gap-2.5 rounded-xl px-1.5 py-1 font-semibold tracking-tight text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60"
          >
            <span className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-accent text-accent-foreground shadow-xs">
              <ShieldCheck className="h-4 w-4" />
            </span>
            <div>
              <div className="text-[15px] font-semibold leading-none">Keyprint</div>
              <div className="text-xs text-muted-foreground font-normal mt-0.5">
                3D Deposit Protection
              </div>
            </div>
          </Link>
        </div>

        <nav aria-label="Main" className="flex-1 overflow-y-auto px-3 py-4">
          <div className="px-3 pb-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            Workspace
          </div>
          <div className="space-y-0.5">
            {PRIMARY_NAV.map((item) => {
              const Icon = item.icon;
              const active =
                pathname === item.href ||
                (item.href === "/home" && pathname.startsWith("/lease/"));
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "group flex h-10 items-center gap-3 rounded-xl px-3 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60",
                    active
                      ? "bg-accent/10 text-accent"
                      : "text-muted-foreground hover:bg-muted hover:text-foreground active:bg-border/60",
                  )}
                >
                  <Icon
                    className="h-[18px] w-[18px] shrink-0"
                    strokeWidth={active ? 2.25 : 2}
                  />
                  <span>{item.label}</span>
                </Link>
              );
            })}

            <hr className="mx-3 my-3 border-border/70" />

            <Link
              href="/"
              aria-current={pathname === "/" ? "page" : undefined}
              className={cn(
                "group flex h-10 items-center gap-3 rounded-xl px-3 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60",
                pathname === "/"
                  ? "bg-accent/10 text-accent"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground active:bg-border/60",
              )}
            >
              <Sparkles
                className="h-[18px] w-[18px] shrink-0"
                strokeWidth={pathname === "/" ? 2.25 : 2}
              />
              <span>Overview</span>
            </Link>
          </div>
        </nav>

        <div className="p-3 border-t border-border/70 space-y-2">
          {installPrompt && (
            <Button
              size="sm"
              variant="secondary"
              className="w-full justify-start"
              onClick={handleInstall}
            >
              <Download className="h-3.5 w-3.5 text-accent" />
              Install Keyprint app
            </Button>
          )}

          {session ? (
            <button
              type="button"
              onClick={() => setDrawerOpen(true)}
              aria-haspopup="dialog"
              className="w-full flex items-center justify-between gap-2 rounded-xl border border-border bg-muted/45 hover:bg-muted active:bg-border/60 px-3 py-2.5 text-left transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60"
            >
              <div className="flex items-center gap-2.5 min-w-0">
                <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-accent/15 text-accent">
                  <User className="h-4 w-4" />
                </span>
                <div className="min-w-0">
                  <div className="text-xs font-semibold truncate">
                    {session.username}
                  </div>
                  <div className="text-[11px] text-muted-foreground">
                    Passkey active · Details
                  </div>
                </div>
              </div>
              <Info className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
            </button>
          ) : (
            <div className="flex gap-1.5">
              <Link
                href="/start"
                className="flex-1 inline-flex items-center justify-center gap-2 rounded-xl bg-foreground text-background hover:bg-foreground/90 h-11 px-3 text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60"
              >
                <Fingerprint className="h-4 w-4" />
                Sign in with passkey
              </Link>
              <button
                type="button"
                onClick={() => setDrawerOpen(true)}
                aria-haspopup="dialog"
                className="inline-flex items-center justify-center rounded-xl border border-border bg-surface hover:bg-muted h-11 w-11 text-muted-foreground cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60"
                title="Verification details"
                aria-label="Verification details"
              >
                <Info className="h-4 w-4" />
              </button>
            </div>
          )}
        </div>
      </aside>

      {/* Mobile Compact App Header */}
      <header className="lg:hidden sticky top-0 z-30 border-b border-border/70 bg-background/85 backdrop-blur-xl backdrop-saturate-150 pt-[env(safe-area-inset-top)] pl-[max(0.75rem,env(safe-area-inset-left))] pr-[max(1rem,env(safe-area-inset-right))]">
        <div className="flex h-14 items-center justify-between gap-2">
          <Link
            href="/"
            className="flex h-11 shrink-0 items-center gap-2 rounded-xl px-2 font-semibold tracking-tight text-foreground [-webkit-tap-highlight-color:transparent] active:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60"
          >
            <span className="inline-flex h-8 w-8 items-center justify-center rounded-[10px] bg-accent text-accent-foreground shadow-xs">
              <ShieldCheck className="h-4 w-4" />
            </span>
            <span className="text-[15px] font-semibold">Keyprint</span>
          </Link>

          <div className="flex min-w-0 items-center">
            {installPrompt && (
              <button
                type="button"
                onClick={handleInstall}
                className="group inline-flex h-11 shrink-0 items-center px-1 cursor-pointer [-webkit-tap-highlight-color:transparent] focus-visible:outline-none"
              >
                <span className="inline-flex h-8 items-center gap-1.5 rounded-full border border-border bg-surface px-3 text-xs font-semibold text-foreground transition-colors group-active:bg-muted group-focus-visible:ring-2 group-focus-visible:ring-accent/60">
                  <Download className="h-3.5 w-3.5 text-accent" />
                  Install
                </span>
              </button>
            )}
            <button
              type="button"
              onClick={() => setDrawerOpen(true)}
              aria-haspopup="dialog"
              className="group inline-flex h-11 min-w-0 items-center px-1 cursor-pointer [-webkit-tap-highlight-color:transparent] focus-visible:outline-none"
            >
              <span className="inline-flex h-9 min-w-0 max-w-[11rem] items-center gap-1.5 rounded-full border border-border bg-surface pl-1 pr-3 text-[13px] font-medium text-foreground shadow-xs transition-colors group-active:bg-muted group-focus-visible:ring-2 group-focus-visible:ring-accent/60">
                <span className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-accent/10 text-accent">
                  {session ? <User className="h-4 w-4" /> : <Info className="h-4 w-4" />}
                </span>
                <span className="truncate">{session ? session.username : "Details"}</span>
              </span>
            </button>
          </div>
        </div>
      </header>

      {/* Main Application Viewport */}
      <div className="flex-1 lg:pl-64 pb-[calc(5rem+env(safe-area-inset-bottom))] lg:pb-0 flex flex-col min-h-screen min-w-0">
        {children}
      </div>

      {/* Mobile Native-Style Fixed Bottom Tab Bar */}
      <nav
        aria-label="Primary"
        className="lg:hidden fixed bottom-0 inset-x-0 z-30 border-t border-border/70 bg-surface/85 backdrop-blur-xl backdrop-saturate-150 pb-[max(0.25rem,env(safe-area-inset-bottom))] pl-[env(safe-area-inset-left)] pr-[env(safe-area-inset-right)]"
      >
        <div className="mx-auto grid max-w-lg grid-cols-5 px-1">
          {PRIMARY_NAV.map((item) => {
            const Icon = item.icon;
            const active =
              pathname === item.href ||
              (item.href === "/home" && pathname.startsWith("/lease/"));
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "group flex min-h-[3.25rem] flex-col items-center justify-center gap-1 rounded-xl pt-1.5 pb-1 text-[11px] font-medium leading-none select-none [-webkit-tap-highlight-color:transparent] [-webkit-touch-callout:none] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent/60",
                  active ? "text-accent" : "text-muted-foreground active:text-foreground",
                )}
              >
                <span
                  className={cn(
                    "relative flex h-7 w-12 items-center justify-center rounded-full transition-colors",
                    active ? "bg-accent/10" : "group-active:bg-muted",
                  )}
                >
                  <Icon className="h-5 w-5" strokeWidth={active ? 2.25 : 1.75} />
                </span>
                <span>{item.shortLabel}</span>
              </Link>
            );
          })}
          <Link
            href="/start"
            aria-current={pathname === "/start" ? "page" : undefined}
            className={cn(
              "group flex min-h-[3.25rem] flex-col items-center justify-center gap-1 rounded-xl pt-1.5 pb-1 text-[11px] font-medium leading-none select-none [-webkit-tap-highlight-color:transparent] [-webkit-touch-callout:none] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent/60",
              pathname === "/start"
                ? "text-accent"
                : "text-muted-foreground active:text-foreground",
            )}
          >
            <span
              className={cn(
                "relative flex h-7 w-12 items-center justify-center rounded-full transition-colors",
                pathname === "/start" ? "bg-accent/10" : "group-active:bg-muted",
              )}
            >
              <Fingerprint
                className="h-5 w-5"
                strokeWidth={pathname === "/start" ? 2.25 : 1.75}
              />
              {session && (
                <span
                  aria-hidden="true"
                  className="absolute right-2.5 top-0.5 h-2 w-2 rounded-full bg-sealed ring-2 ring-surface"
                />
              )}
            </span>
            <span>{session ? "Passkey" : "Sign in"}</span>
          </Link>
        </div>
      </nav>

      <DetailsDrawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        session={session}
      />
    </div>
  );
}
