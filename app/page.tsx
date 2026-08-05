import Link from "next/link";
import { ArrowRight, Gauge, GitBranch, Network, Zap } from "lucide-react";

import { Button } from "@/components/ui/button";
import { GridBackground, Spotlight } from "@/components/ui/spotlight";
import { FadeIn, TextReveal } from "@/components/ui/text-reveal";
import { ProviderIcon } from "@/components/ProviderIcon";
import { EXAMPLE_QUESTIONS } from "@/lib/example-questions";

const SOURCES = ["github", "slack", "linear", "notion", "gmail"];

const CAPABILITIES = [
  {
    Icon: Network,
    title: "One context graph",
    body: "Five connectors sync into a single HydraDB database, so a question can cross systems that share no common identifier.",
  },
  {
    Icon: Zap,
    title: "Deliberate mode routing",
    body: "Every question is classified before retrieval. Single-hop lookups stay on fast mode; only genuine multi-hop reasoning pays for thinking mode.",
  },
  {
    Icon: GitBranch,
    title: "Grounded, cited answers",
    body: "Answers cite the exact source behind each claim, and say so plainly when the retrieved context is not enough.",
  },
  {
    Icon: Gauge,
    title: "Measured, not asserted",
    body: "Routing decision, latency split and HydraDB call count are recorded for every question and shown in the dashboard.",
  },
];

export default function Home() {
  return (
    <main className="relative min-h-screen overflow-hidden bg-background">
      <GridBackground />
      <Spotlight className="-top-40 left-0 md:-top-20 md:left-60" fill="#22d3ee" />

      <div className="relative z-10">
        <header className="mx-auto flex h-16 max-w-6xl items-center justify-between px-6">
          <div className="flex items-center gap-2">
            <span className="relative flex h-2.5 w-2.5">
              <span className="absolute inline-flex h-full w-full rounded-full bg-pulse opacity-60 animate-pulse-ring" />
              <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-pulse" />
            </span>
            <span className="text-sm font-semibold tracking-tight">
              Dev<span className="text-pulse">Pulse</span>
            </span>
          </div>
          <nav className="flex items-center gap-1 text-sm">
            <Link
              href="/setup"
              className="rounded-md px-3 py-1.5 text-muted-foreground transition-colors hover:text-foreground"
            >
              Connectors
            </Link>
            <Link
              href="/dashboard"
              className="rounded-md px-3 py-1.5 text-muted-foreground transition-colors hover:text-foreground"
            >
              Dashboard
            </Link>
          </nav>
        </header>

        <section className="mx-auto max-w-4xl px-6 pb-20 pt-20 text-center sm:pt-28">
          <FadeIn>
            <span className="inline-flex items-center gap-2 rounded-full border border-pulse/25 bg-pulse/5 px-3 py-1 text-xs text-pulse">
              <span className="relative flex h-1.5 w-1.5">
                <span className="absolute inline-flex h-full w-full rounded-full bg-pulse opacity-75 animate-pulse-ring" />
                <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-pulse" />
              </span>
              HydraDB × Connectors Hackathon
            </span>
          </FadeIn>

          <FadeIn step={1}>
            <h1 className="mt-6 text-balance text-5xl font-semibold tracking-tight sm:text-7xl">
              Dev<span className="text-pulse">Pulse</span>
            </h1>
          </FadeIn>

          <TextReveal
            startStep={120}
            text="Ask one question. Get one answer, grounded across every tool your team actually works in."
            className="mx-auto mt-6 max-w-2xl text-balance text-lg text-muted-foreground sm:text-xl"
          />

          <FadeIn step={4}>
            <div className="mt-8 flex flex-wrap items-center justify-center gap-2">
              {SOURCES.map((source) => (
                <span
                  key={source}
                  className="flex items-center gap-1.5 rounded-full border border-border bg-card/60 px-3 py-1.5 text-xs capitalize text-muted-foreground backdrop-blur"
                >
                  <ProviderIcon provider={source} className="h-3.5 w-3.5" />
                  {source}
                </span>
              ))}
            </div>
          </FadeIn>

          <FadeIn step={5}>
            <div className="mt-10 flex flex-wrap items-center justify-center gap-3">
              <Button asChild size="lg">
                <Link href="/dashboard">
                  Open dashboard <ArrowRight className="h-4 w-4" />
                </Link>
              </Button>
              <Button asChild size="lg" variant="outline">
                <Link href="/setup">Connect your sources</Link>
              </Button>
            </div>
          </FadeIn>
        </section>

        {/* The hard questions, stated up front — this is the actual pitch. */}
        <section className="mx-auto max-w-5xl px-6 pb-20">
          <FadeIn step={6}>
            <p className="mb-4 text-center text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Questions no single tool can answer
            </p>
            <div className="grid gap-3 sm:grid-cols-2">
              {EXAMPLE_QUESTIONS.filter((q) => q.expectedMode === "thinking")
                .slice(0, 4)
                .map((example) => (
                  <div
                    key={example.id}
                    className="rounded-lg border border-border bg-card/60 p-4 backdrop-blur"
                  >
                    <p className="text-sm leading-relaxed">
                      &ldquo;{example.question}&rdquo;
                    </p>
                    <div className="mt-3 flex flex-wrap items-center gap-1.5">
                      {example.expectedSources.map((source) => (
                        <span
                          key={source}
                          className="flex items-center gap-1 rounded-full border border-border px-2 py-0.5 text-[10px] capitalize text-muted-foreground"
                        >
                          <ProviderIcon provider={source} className="h-3 w-3" />
                          {source}
                        </span>
                      ))}
                    </div>
                  </div>
                ))}
            </div>
          </FadeIn>
        </section>

        <section className="mx-auto max-w-6xl px-6 pb-24">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {CAPABILITIES.map(({ Icon, title, body }, index) => (
              <FadeIn key={title} step={Math.min(6 + index, 7)}>
                <div className="h-full rounded-lg border border-border bg-card/60 p-5 backdrop-blur transition-colors hover:border-pulse/30">
                  <Icon className="h-4 w-4 text-pulse" />
                  <h3 className="mt-3 text-sm font-medium">{title}</h3>
                  <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">
                    {body}
                  </p>
                </div>
              </FadeIn>
            ))}
          </div>
        </section>

        <footer className="border-t border-border">
          <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-6 py-6 text-xs text-muted-foreground">
            <span>
              DevPulse — built on HydraDB&apos;s context graph and Fireworks AI.
            </span>
            <a
              href="https://github.com/JaneshKapoor/devpulse"
              target="_blank"
              rel="noopener noreferrer"
              className="transition-colors hover:text-foreground"
            >
              github.com/JaneshKapoor/devpulse
            </a>
          </div>
        </footer>
      </div>
    </main>
  );
}
