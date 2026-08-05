import {
  GitPullRequest,
  Hash,
  Mail,
  FileText,
  CircleDot,
  Database,
  type LucideIcon,
} from "lucide-react";

import { cn } from "@/lib/utils";

/**
 * Provider glyphs + brand-ish tints, used anywhere a source is attributed so
 * cross-source answers are scannable at a glance.
 *
 * lucide-react v1 removed brand marks (there is no longer a `Github` icon), so
 * these are semantic stand-ins: a pull-request glyph for GitHub, a channel hash
 * for Slack, an issue dot for Linear.
 */
const ICONS: Record<string, { Icon: LucideIcon; tint: string; label: string }> =
  {
    github: { Icon: GitPullRequest, tint: "text-zinc-300", label: "GitHub" },
    slack: { Icon: Hash, tint: "text-emerald-400", label: "Slack" },
    linear: { Icon: CircleDot, tint: "text-indigo-400", label: "Linear" },
    notion: { Icon: FileText, tint: "text-zinc-200", label: "Notion" },
    gmail: { Icon: Mail, tint: "text-red-400", label: "Gmail" },
    docs: { Icon: FileText, tint: "text-amber-400", label: "Document" },
    file: { Icon: FileText, tint: "text-amber-400", label: "Document" },
  };

export function providerLabel(provider?: string): string {
  if (!provider) return "Source";
  return ICONS[provider.toLowerCase()]?.label ?? provider;
}

export function ProviderIcon({
  provider,
  className,
}: {
  provider?: string;
  className?: string;
}) {
  const entry = ICONS[(provider ?? "").toLowerCase()];
  const Icon = entry?.Icon ?? Database;
  return (
    <Icon
      aria-hidden
      className={cn("h-4 w-4 shrink-0", entry?.tint ?? "text-muted-foreground", className)}
    />
  );
}
