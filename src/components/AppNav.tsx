"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Info, ShieldCheck, User } from "lucide-react";
import { loadSavedSession, type SavedPasskeySession } from "@/lib/chain/wallet";
import { cn } from "@/lib/utils";
import { DetailsDrawer, type ReceiptLink } from "./DetailsDrawer";
import { buttonVariants } from "./ui/button";

interface AppNavProps {
  receipts?: ReceiptLink[];
}

export function AppNav({ receipts }: AppNavProps) {
  const pathname = usePathname();
  const [session, setSession] = useState<SavedPasskeySession | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);

  useEffect(() => {
    setSession(loadSavedSession());
  }, [pathname]);

  const navItems = [
    { href: "/home", label: "Home" },
    { href: "/unit/new", label: "Solo scan" },
    { href: "/sample", label: "Sample" },
    { href: "/verify", label: "Verify" },
  ];

  return (
    <>
      <header className="w-full border-b border-border/70 bg-background/90 backdrop-blur-sm sticky top-0 z-30">
        <div className="mx-auto max-w-6xl px-5 h-16 flex items-center justify-between gap-4">
          <div className="flex items-center gap-6">
            <Link
              href="/"
              className="flex items-center gap-2 font-semibold tracking-tight text-foreground"
            >
              <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-accent text-accent-foreground">
                <ShieldCheck className="h-4 w-4" />
              </span>
              <span>Keyprint</span>
            </Link>

            <nav className="hidden sm:flex items-center gap-1">
              {navItems.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    "px-3 py-1.5 rounded-lg text-sm font-medium transition-colors",
                    pathname === item.href
                      ? "bg-muted text-foreground"
                      : "text-muted-foreground hover:text-foreground hover:bg-muted/60",
                  )}
                >
                  {item.label}
                </Link>
              ))}
            </nav>
          </div>

          <div className="flex items-center gap-2">
            {session ? (
              <button
                type="button"
                onClick={() => setDrawerOpen(true)}
                className="inline-flex items-center gap-2 rounded-full border border-border bg-surface px-3.5 py-1.5 text-sm font-medium hover:bg-muted transition-colors cursor-pointer"
              >
                <User className="h-3.5 w-3.5 text-accent" />
                <span>{session.username}</span>
                <Info className="h-3.5 w-3.5 text-muted-foreground" />
              </button>
            ) : (
              <>
                <button
                  type="button"
                  onClick={() => setDrawerOpen(true)}
                  className={cn(buttonVariants({ variant: "ghost", size: "sm" }))}
                >
                  Details
                </button>
                <Link
                  href="/start"
                  className={cn(buttonVariants({ variant: "default", size: "sm" }))}
                >
                  Sign in
                </Link>
              </>
            )}
          </div>
        </div>
      </header>

      <DetailsDrawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        session={session}
        onSessionCleared={() => setSession(null)}
        receipts={receipts}
      />
    </>
  );
}
