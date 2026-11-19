"use client";

import Link from "next/link";
import { motion } from "framer-motion";
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
    <motion.div
      initial={{ opacity: 0, scale: 0.96 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.35 }}
      className="rounded-2xl border border-sealed/25 bg-sealed/5 p-5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4"
    >
      <div className="flex items-center gap-4">
        <div className="relative h-12 w-12 shrink-0 flex items-center justify-center">
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
          <p className="text-sm font-medium text-foreground mt-0.5">{title}</p>
          {subtitle && (
            <p className="text-xs text-muted-foreground mt-0.5">{subtitle}</p>
          )}
        </div>
      </div>

      {recordId && (
        <Link
          href={`/verify?recordId=${encodeURIComponent(recordId)}`}
          className="inline-flex items-center gap-1.5 rounded-full border border-sealed/30 bg-surface px-3.5 py-1.5 text-xs font-semibold text-sealed hover:bg-sealed/10 transition-colors shrink-0"
        >
          <ShieldCheck className="h-3.5 w-3.5" />
          Verify proof
        </Link>
      )}
    </motion.div>
  );
}
