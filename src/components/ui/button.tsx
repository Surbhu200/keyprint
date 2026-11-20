import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-xl text-sm font-semibold transition-[color,background-color,border-color,box-shadow,opacity,scale] duration-100 ease-out motion-safe:active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 cursor-pointer select-none touch-manipulation [-webkit-tap-highlight-color:transparent] [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default:
          "bg-ink text-white shadow-[0_1px_2px_rgba(11,19,36,0.2)] hover:bg-ink-2 active:bg-ink-2",
        accent:
          "bg-accent text-accent-foreground shadow-xs hover:bg-accent/90 active:bg-accent/80",
        secondary:
          "bg-surface text-foreground ring-1 ring-border shadow-xs hover:bg-muted active:bg-border/60",
        outline:
          "border border-border bg-transparent text-foreground hover:bg-muted active:bg-border/60",
        ghost: "text-foreground hover:bg-muted active:bg-border/60",
        destructive:
          "bg-claim text-white shadow-xs hover:bg-claim/90 active:bg-claim/80",
      },
      size: {
        default: "h-11 px-5 py-2.5",
        sm: "h-9 px-3.5 text-xs pointer-coarse:h-11",
        lg: "h-12 rounded-2xl px-6 text-[15px]",
        xl: "h-14 rounded-[18px] px-6 text-[17px] tracking-[-0.01em]",
        icon: "size-10 pointer-coarse:size-11",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, ...props }, ref) => {
    return (
      <button
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        {...props}
      />
    );
  },
);
Button.displayName = "Button";

export { buttonVariants };
