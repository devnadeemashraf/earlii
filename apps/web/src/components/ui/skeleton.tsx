import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";

// shadcn/ui Skeleton (radix-nova), plus motion-reduce so it stays still for users who ask for
// reduced motion (SPEC O accessibility).
function Skeleton({ className, ...props }: ComponentProps<"div">) {
  return (
    <div
      data-slot="skeleton"
      className={cn("animate-pulse rounded-md bg-muted motion-reduce:animate-none", className)}
      {...props}
    />
  );
}

export { Skeleton };
