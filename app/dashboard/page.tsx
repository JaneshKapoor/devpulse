"use client";

import { useCallback, useState } from "react";
import { BarChart3, MessageSquare, Sunrise } from "lucide-react";

import { AppShell } from "@/components/AppShell";
import { AskDevPulse } from "@/components/AskDevPulse";
import { MetricsTable } from "@/components/MetricsTable";
import { StandupBrief } from "@/components/StandupBrief";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";

export default function DashboardPage() {
  // Bumped whenever a query completes so the Metrics tab refetches on open
  // rather than showing a stale table.
  const [metricsVersion, setMetricsVersion] = useState(0);
  const bumpMetrics = useCallback(() => setMetricsVersion((v) => v + 1), []);

  return (
    <AppShell active="dashboard">
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Grounded answers across your team&apos;s tools, with the routing and
            latency behind every one of them on show.
          </p>
        </div>

        <Tabs defaultValue="ask">
          <TabsList>
            <TabsTrigger value="standup">
              <Sunrise className="h-3.5 w-3.5" />
              Standup Brief
            </TabsTrigger>
            <TabsTrigger value="ask">
              <MessageSquare className="h-3.5 w-3.5" />
              Ask DevPulse
            </TabsTrigger>
            <TabsTrigger value="metrics">
              <BarChart3 className="h-3.5 w-3.5" />
              Metrics
            </TabsTrigger>
          </TabsList>

          <TabsContent value="standup">
            <StandupBrief onGenerated={bumpMetrics} />
          </TabsContent>

          <TabsContent value="ask">
            <AskDevPulse onAnswered={bumpMetrics} />
          </TabsContent>

          <TabsContent value="metrics">
            <MetricsTable version={metricsVersion} />
          </TabsContent>
        </Tabs>
      </div>
    </AppShell>
  );
}
