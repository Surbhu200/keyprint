import type { CSSProperties, ReactNode } from "react";
import { cn } from "@/lib/utils";

/*
 * Scroll-driven, CSS only: the block rises in as it enters the viewport, tied
 * to a view() timeline. Nothing waits on JavaScript, so content is never left
 * hidden by a slow hydrate. Browsers without view timelines play the same rise
 * once on load; reduced-motion users get static content (motion-safe).
 */
const SCROLL_TIMELINE = {
  animationTimeline: "view()",
  animationRange: "cover 0% cover 22%",
} as CSSProperties;

/** Fades a section header or grid up once as it scrolls into view. */
export function Reveal({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "motion-safe:animate-rise motion-safe:[animation-duration:auto]",
        className,
      )}
      style={SCROLL_TIMELINE}
    >
      {children}
    </div>
  );
}
