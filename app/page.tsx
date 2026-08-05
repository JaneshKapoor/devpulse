import Link from "next/link";

import { Button } from "@/components/ui/button";

// Placeholder landing page — replaced with the animated hero in a later commit.
export default function Home() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6 p-8">
      <h1 className="text-4xl font-bold tracking-tight">
        Dev<span className="text-pulse">Pulse</span>
      </h1>
      <p className="max-w-md text-center text-muted-foreground">
        AI engineering intelligence across GitHub, Slack, Linear, Notion and
        Gmail — grounded in HydraDB&apos;s context graph.
      </p>
      <div className="flex gap-3">
        <Button asChild>
          <Link href="/setup">Set up connectors</Link>
        </Button>
        <Button asChild variant="outline">
          <Link href="/dashboard">Open dashboard</Link>
        </Button>
      </div>
    </main>
  );
}
