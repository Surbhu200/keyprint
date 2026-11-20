import * as React from "react";
import { cn } from "@/lib/utils";

export function Card({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "rounded-[20px] border border-border/70 bg-surface text-foreground shadow-[0_1px_2px_rgba(11,19,36,0.04),0_8px_24px_-12px_rgba(11,19,36,0.10)]",
        // Phone defaults step aside when the caller sets its own radius (bottom
        // sheets) or a base border colour (tinted cards), since a max-sm:
        // default would otherwise beat the caller's classes on phones.
        !className?.includes("rounded") && "max-sm:rounded-[24px]",
        !className?.split(/\s+/).some((t) => t.startsWith("border-")) && "max-sm:border-transparent",
        className,
      )}
      {...props}
    />
  );
}

type Side = "t" | "b" | "l" | "r";

/**
 * Sides the caller pads with an unprefixed utility (p-8, px-4, pb-3...).
 * The responsive defaults below must skip those sides: a base `pb-3` from the
 * caller cannot beat a default `sm:pb-6`, so it would be ignored from sm up.
 */
function paddedSides(className?: string): Set<Side> {
  const sides = new Set<Side>();
  if (!className) return sides;
  for (const token of className.split(/\s+/)) {
    const m = /^p([xytblr]?)-/.exec(token);
    if (!m) continue;
    const axis = m[1];
    if (axis === "" || axis === "y" || axis === "t") sides.add("t");
    if (axis === "" || axis === "y" || axis === "b") sides.add("b");
    if (axis === "" || axis === "x" || axis === "l") sides.add("l");
    if (axis === "" || axis === "x" || axis === "r") sides.add("r");
  }
  return sides;
}

// Full literal class strings so Tailwind generates every one of them.
const HEADER_PAD: Record<Side, string> = {
  t: "pt-5 sm:pt-6",
  b: "pb-5 sm:pb-6",
  l: "pl-5 sm:pl-6",
  r: "pr-5 sm:pr-6",
};
const CONTENT_PAD: Record<Side, string> = {
  t: "pt-0",
  b: "pb-5 sm:pb-6",
  l: "pl-5 sm:pl-6",
  r: "pr-5 sm:pr-6",
};

function defaultPadding(pad: Record<Side, string>, className?: string) {
  const taken = paddedSides(className);
  return (Object.keys(pad) as Side[])
    .filter((side) => !taken.has(side))
    .map((side) => pad[side])
    .join(" ");
}

export function CardHeader({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn("flex flex-col space-y-1.5", defaultPadding(HEADER_PAD, className), className)}
      {...props}
    />
  );
}

export function CardTitle({
  className,
  ...props
}: React.HTMLAttributes<HTMLHeadingElement>) {
  return (
    <h3
      className={cn(
        "font-semibold leading-snug tracking-[-0.01em]",
        // A caller's base text size (text-base, text-[36px]...) must win at
        // every width, so the responsive default only applies without one.
        className && /(?:^|\s)text-(?:xs|sm|base|lg|\d?xl|\[\d)/.test(className)
          ? "text-lg"
          : "text-[17px] sm:text-lg",
        className,
      )}
      {...props}
    />
  );
}

export function CardDescription({
  className,
  ...props
}: React.HTMLAttributes<HTMLParagraphElement>) {
  return (
    <p className={cn("text-[14px] text-muted-foreground", className)} {...props} />
  );
}

export function CardContent({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn(defaultPadding(CONTENT_PAD, className), className)} {...props} />;
}
