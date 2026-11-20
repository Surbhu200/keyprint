"use client";

import Link from "next/link";
import { MotionConfig, motion } from "framer-motion";
import { Check, Fingerprint, ShieldCheck } from "lucide-react";

interface SealAnimationProps {
  title?: string;
  /** Arc time of the seal (or co-sign). Without it no time is shown: never this device's clock. */
  sealedAtIso?: string | null;
  recordId?: string;
  subtitle?: string;
  /** Word before the time, e.g. "Sealed" or "Co-signed". */
  verb?: string;
}

function formatSealTime(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function SealAnimation({
  title = "Record sealed",
  sealedAtIso,
  recordId,
  subtitle,
  verb = "Sealed",
}: SealAnimationProps) {
  const formattedTime = formatSealTime(sealedAtIso);

  return (
    // With Reduce Motion on, framer skips the scale/transform moves; the ring stroke and fades still show the seal.
    <MotionConfig reducedMotion="user">
      <motion.div
        role="status"
        aria-live="polite"
        initial={{ opacity: 0, scale: 0.96 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.35 }}
        className="rounded-2xl border border-sealed/25 bg-sealed/5 p-4 sm:p-5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 sm:gap-4"
      >
        <div className="flex items-center gap-4">
          <div className="relative h-12 w-12 shrink-0 flex items-center justify-center">
            {/* One-shot stamp ripple as the ring completes. */}
            <motion.span
              aria-hidden="true"
              className="absolute inset-0 rounded-full border-2 border-sealed/40"
              initial={{ scale: 0.85, opacity: 0 }}
              animate={{ scale: [0.85, 1.6], opacity: [0.6, 0] }}
              transition={{ delay: 0.75, duration: 0.7, ease: "easeOut" }}
            />
            <svg className="h-12 w-12 -rotate-90" viewBox="0 0 48 48">
              <circle
                cx="24"
                cy="24"
                r="21"
                fill="none"
                stroke="currentColor"
                strokeWidth="3"
                className="text-sealed/20"
              />
              <motion.circle
                cx="24"
                cy="24"
                r="21"
                fill="none"
                stroke="currentColor"
                strokeWidth="3"
                strokeLinecap="round"
                className="text-sealed"
                initial={{ pathLength: 0 }}
                animate={{ pathLength: 1 }}
                transition={{ duration: 0.75, ease: "easeOut" }}
              />
            </svg>
            <motion.div
              initial={{ scale: 0.5, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ delay: 0.45, duration: 0.25 }}
              className="absolute inset-0 flex items-center justify-center text-sealed"
            >
              <Fingerprint className="h-5 w-5" />
            </motion.div>
          </div>

          <div>
            <div className="flex items-center gap-1.5 font-semibold text-sealed">
              <Check className="h-4 w-4" />
              <span>{formattedTime ? `${verb} · ${formattedTime}` : `${verb} ✓`}</span>
            </div>
            <p className="text-base font-semibold leading-snug text-foreground mt-0.5">{title}</p>
            {subtitle && (
              <p className="text-sm leading-snug text-muted-foreground mt-0.5">{subtitle}</p>
            )}
          </div>
        </div>

        {recordId && (
          <Link
            href={`/verify?recordId=${encodeURIComponent(recordId)}`}
            className="inline-flex min-h-11 shrink-0 items-center gap-1.5 self-start rounded-full border border-sealed/30 bg-surface px-4 text-sm font-semibold text-sealed transition-colors hover:bg-sealed/10 max-sm:ml-16 sm:self-auto"
          >
            <ShieldCheck className="h-4 w-4" />
            Verify proof
          </Link>
        )}
      </motion.div>
    </MotionConfig>
  );
}
