import Link from "next/link";

import { cn } from "@/lib/utils";

/** Shared chrome for the working pages (setup, upload, dashboard). */
export function AppShell({
  children,
  active,
}: {
  children: React.ReactNode;
  active?: "setup" | "upload" | "dashboard";
}) {
  const links: Array<{ href: string; label: string; key: NonNullable<typeof active> }> = [
    { href: "/dashboard", label: "Dashboard", key: "dashboard" },
    { href: "/setup", label: "Connectors", key: "setup" },
    { href: "/upload", label: "Documents", key: "upload" },
  ];

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-40 border-b border-border bg-background/80 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-7xl items-center justify-between gap-4 px-4 sm:px-6">
          <Link href="/" className="flex items-center gap-2">
            <span className="relative flex h-2.5 w-2.5">
              <span className="absolute inline-flex h-full w-full rounded-full bg-pulse opacity-60 animate-pulse-ring" />
              <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-pulse" />
            </span>
            <span className="text-sm font-semibold tracking-tight">
              Dev<span className="text-pulse">Pulse</span>
            </span>
          </Link>

          <nav className="flex items-center gap-1">
            {links.map((link) => (
              <Link
                key={link.key}
                href={link.href}
                className={cn(
                  "rounded-md px-3 py-1.5 text-sm transition-colors",
                  active === link.key
                    ? "bg-secondary text-foreground"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                {link.label}
              </Link>
            ))}
          </nav>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6">{children}</main>
    </div>
  );
}
