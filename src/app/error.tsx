"use client"; // Error boundaries must be Client Components

import { useEffect } from "react";
import Link from "next/link";
import { Button, buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * Friendly fallback when a page crashes while rendering (for example a 3D view on a device
 * without WebGL). Uses Next 16's `retry` prop (see node_modules/next/dist/docs, error.md).
 */
export default function ErrorPage({
  error,
  retry,
}: {
  error: unknown;
  retry: () => void;
}) {
  useEffect(() => {
    console.error("[keyprint] page error", error);
  }, [error]);

  return (
    <main className="flex-1 mx-auto w-full max-w-lg px-5 py-16 text-center space-y-4">
      <h1 className="text-xl font-semibold tracking-tight">This screen hit a snag.</h1>
      <p className="text-sm text-muted-foreground">
        A display error can&apos;t change any sealed records or protected deposits
        stay exactly as they were.
      </p>
      <div className="flex flex-wrap justify-center gap-2">
        <Button onClick={() => retry()}>Try again</Button>
        <Link href="/home" className={cn(buttonVariants({ variant: "secondary" }))}>
          Go to Home
        </Link>
      </div>
    </main>
  );
}
