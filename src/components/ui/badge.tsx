import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex min-h-6 items-center gap-1.5 rounded-full border border-transparent px-2.5 py-0.5 text-[12px] font-medium tabular-nums",
  {
    variants: {
      variant: {
        default: "bg-muted text-foreground",
        sealed: "bg-sealed/10 text-sealed",
        suggestion: "bg-suggestion/10 text-suggestion",
        claim: "bg-claim/10 text-claim",
        accent: "bg-accent/10 text-accent",
        ink: "bg-ink text-white",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  },
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {}

export function Badge({ className, variant, ...props }: BadgeProps) {
  return <span className={cn(badgeVariants({ variant }), className)} {...props} />;
}
