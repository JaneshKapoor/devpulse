import { cn } from "@/lib/utils";

/**
 * Entrance animations for the landing hero.
 *
 * These are CSS-driven rather than JS-driven, and the choice is deliberate:
 * an earlier framer-motion implementation left the hero at `opacity: 0`
 * indefinitely whenever the browser throttled its rAF loop (backgrounded or
 * occluded window), so the page's headline could simply never appear. Content
 * visibility must not depend on an animation frame ever being scheduled.
 *
 * The CSS here degrades safely: `animation-fill-mode: backwards` holds the
 * hidden state only for the brief stagger delay, and if animations are
 * disabled outright — including under `prefers-reduced-motion` — the element
 * renders at its natural, fully visible state.
 *
 * These are Server Components: no "use client", no JS shipped for them.
 */

/** Stagger delays are capped low so the hero is fully readable in under 0.6s. */
const DELAY_CLASS: Record<string, string> = {
  "0": "",
  "1": "[animation-delay:60ms]",
  "2": "[animation-delay:120ms]",
  "3": "[animation-delay:180ms]",
  "4": "[animation-delay:240ms]",
  "5": "[animation-delay:300ms]",
  "6": "[animation-delay:360ms]",
  "7": "[animation-delay:420ms]",
};

const BASE =
  "motion-safe:animate-[reveal_0.5s_cubic-bezier(0.22,1,0.36,1)_backwards]";

export function FadeIn({
  children,
  step = 0,
  className,
}: {
  children: React.ReactNode;
  /** Stagger position, 0–7. Not a raw duration, so delays stay bounded. */
  step?: number;
  className?: string;
}) {
  return (
    <div className={cn(BASE, DELAY_CLASS[String(step)] ?? "", className)}>
      {children}
    </div>
  );
}

/**
 * Word-by-word reveal for the tagline.
 *
 * Each word is its own span with an incremental delay. Words past the cap all
 * share the final delay rather than trailing indefinitely, so a long tagline
 * still finishes promptly.
 */
export function TextReveal({
  text,
  className,
  startStep = 0,
}: {
  text: string;
  className?: string;
  startStep?: number;
}) {
  const words = text.split(" ");

  return (
    <p className={cn("flex flex-wrap justify-center gap-x-[0.32em]", className)}>
      {words.map((word, index) => (
        <span
          key={`${word}-${index}`}
          className={cn(
            "inline-block",
            "motion-safe:animate-[reveal_0.45s_cubic-bezier(0.22,1,0.36,1)_backwards]"
          )}
          // Per-word delay is data, not a fixed set of classes, so it is
          // written inline rather than as an arbitrary-value utility.
          style={{ animationDelay: `${Math.min(startStep + index * 28, 520)}ms` }}
        >
          {word}
        </span>
      ))}
    </p>
  );
}
