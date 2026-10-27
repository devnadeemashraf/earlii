import { formatRole } from "@/lib/format-role";

export function headline(title: string, city: string, minutesAgo: number): string {
  return `${formatRole(title, city)} (${minutesAgo} min ago)`;
}
