import { cn } from "@/lib/utils";

/**
 * The landing h1: each line lifts in, staggered, at full opacity. Pure CSS so the headline
 * paints with the first stylesheet (no waiting for hydration); reduced-motion
 * users get the static text.
 */
export function RevealHeadline({
  lines,
  className,
}: {
  lines: readonly string[];
  className?: string;
}) {
  return (
    <h1 aria-label={lines.join(" ")} className={className}>
      {lines.map((line, i) => (
        <span
          key={line}
          aria-hidden="true"
          className={cn(
            "block motion-safe:animate-lift motion-safe:[animation-duration:700ms]",
          )}
          style={{ animationDelay: `${60 + i * 90}ms` }}
        >
          {line}
        </span>
      ))}
    </h1>
  );
}
