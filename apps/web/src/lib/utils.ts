import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

// shadcn/ui's class helper: clsx for conditionals, twMerge so a later utility wins over an earlier
// conflicting one (`cn("p-2", "p-4")` is "p-4").
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
