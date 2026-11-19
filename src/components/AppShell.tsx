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
  { href: "/home", label: "Apartments", shortLabel: "Home", icon: Home },
  { href: "/unit/new", label: "Solo Scan", shortLabel: "Scan", icon: ScanLine },
  { href: "/sample", label: "3D Demo", shortLabel: "3D Demo", icon: Box },
  { href: "/verify", label: "Verify Proof", shortLabel: "Verify", icon: ShieldCheck },
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
      <aside className="hidden lg:flex lg:w-64 lg:flex-col lg:fixed lg:inset-y-0 border-r border-border bg-surface/95 backdrop-blur-md z-30">
        <div className="h-16 px-5 flex items-center justify-between border-b border-border/70">
          <Link
            href="/"
            className="flex items-center gap-2.5 font-semibold tracking-tight text-foreground"
          >
            <span className="inline-flex h-8 w-8 items-center justify-center rounded-xl bg-accent text-accent-foreground shadow-xs">
              <ShieldCheck className="h-4 w-4" />
            </span>
            <div>
              <div className="text-sm font-semibold leading-none">Keyprint</div>
              <div className="text-[11px] text-muted-foreground font-normal mt-0.5">
                3D Deposit Protection
              </div>
            </div>
          </Link>
        </div>

        <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
          <div className="px-2.5 pb-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            Workspace
          </div>
          {PRIMARY_NAV.map((item) => {
            const Icon = item.icon;
            const active =
              pathname === item.href ||
              (item.href === "/home" && pathname.startsWith("/lease/"));
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors",
                  active
                    ? "bg-accent text-accent-foreground shadow-xs"
                    : "text-muted-foreground hover:text-foreground hover:bg-muted/80",
                )}
              >
                <Icon className="h-4 w-4 shrink-0" />
                <span>{item.label}</span>
              </Link>
            );
          })}

          <Link
            href="/"
            className={cn(
              "flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors",
              pathname === "/"
                ? "bg-muted text-foreground"
                : "text-muted-foreground hover:text-foreground hover:bg-muted/80",
            )}
          >
            <Sparkles className="h-4 w-4 shrink-0" />
            <span>Overview</span>
          </Link>
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
              Install Keyprint App
            </Button>
          )}

          {session ? (
            <button
              type="button"
              onClick={() => setDrawerOpen(true)}
              className="w-full flex items-center justify-between gap-2 rounded-xl border border-border bg-muted/45 hover:bg-muted px-3 py-2.5 text-left transition-colors cursor-pointer"
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
                className="flex-1 inline-flex items-center justify-center gap-2 rounded-xl bg-foreground text-background hover:bg-foreground/90 h-10 px-3 text-xs font-semibold transition-colors"
              >
                <Fingerprint className="h-4 w-4" />
                Sign in with passkey
              </Link>
              <button
                type="button"
                onClick={() => setDrawerOpen(true)}
                className="inline-flex items-center justify-center rounded-xl border border-border bg-surface hover:bg-muted h-10 w-10 text-muted-foreground cursor-pointer"
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
      <header className="lg:hidden sticky top-0 z-30 h-14 px-4 flex items-center justify-between border-b border-border/80 bg-surface/95 backdrop-blur-md">
        <Link
          href="/"
          className="flex items-center gap-2 font-semibold tracking-tight text-foreground"
        >
          <span className="inline-flex h-7 w-7 items-center justify-center rounded-lg bg-accent text-accent-foreground">
            <ShieldCheck className="h-4 w-4" />
          </span>
          <span className="text-sm font-semibold">Keyprint</span>
        </Link>

        <div className="flex items-center gap-2">
          {installPrompt && (
            <button
              type="button"
              onClick={handleInstall}
              className="inline-flex items-center gap-1 rounded-full border border-border bg-muted px-2.5 py-1 text-[11px] font-medium cursor-pointer"
            >
              <Download className="h-3 w-3 text-accent" />
              Install
            </button>
          )}
          <button
            type="button"
            onClick={() => setDrawerOpen(true)}
            className="inline-flex items-center gap-1.5 rounded-full border border-border bg-surface px-2.5 py-1 text-xs font-medium cursor-pointer"
          >
            <User className="h-3.5 w-3.5 text-accent" />
            <span>{session ? session.username : "Details"}</span>
          </button>
        </div>
      </header>

      {/* Main Application Viewport */}
      <div className="flex-1 lg:pl-64 pb-20 lg:pb-0 flex flex-col min-h-screen">
        {children}
      </div>

      {/* Mobile Native-Style Fixed Bottom Tab Bar */}
      <nav className="lg:hidden fixed bottom-0 inset-x-0 z-30 border-t border-border bg-surface/95 backdrop-blur-md px-2 py-1.5 grid grid-cols-5 gap-1">
        {PRIMARY_NAV.map((item) => {
          const Icon = item.icon;
          const active =
            pathname === item.href ||
            (item.href === "/home" && pathname.startsWith("/lease/"));
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex flex-col items-center justify-center gap-0.5 rounded-xl py-1.5 text-[10px] font-medium transition-colors",
                active ? "text-accent" : "text-muted-foreground",
              )}
            >
              <Icon className="h-4 w-4" />
              <span>{item.shortLabel}</span>
            </Link>
          );
        })}
        <Link
          href="/start"
          className={cn(
            "flex flex-col items-center justify-center gap-0.5 rounded-xl py-1.5 text-[10px] font-medium transition-colors",
            pathname === "/start" ? "text-accent" : "text-muted-foreground",
          )}
        >
          <Fingerprint className="h-4 w-4" />
          <span>{session ? "Passkey" : "Sign in"}</span>
        </Link>
      </nav>

      <DetailsDrawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        session={session}
      />
    </div>
  );
}
