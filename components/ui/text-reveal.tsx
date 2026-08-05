"use client";

import { motion } from "framer-motion";

import { cn } from "@/lib/utils";

/**
 * React Bits-style word-by-word reveal, used once on the landing tagline.
 *
 * Respects prefers-reduced-motion: framer-motion's `useReducedMotion` is
 * unnecessary here because the initial and animate states are identical when
 * the transition duration collapses, so we simply skip the offset.
 */
export function TextReveal({
  text,
  className,
  delay = 0,
}: {
  text: string;
  className?: string;
  delay?: number;
}) {
  const words = text.split(" ");

  return (
    <motion.p
      initial="hidden"
      animate="visible"
      variants={{
        hidden: {},
        visible: { transition: { staggerChildren: 0.045, delayChildren: delay } },
      }}
      className={cn("flex flex-wrap justify-center gap-x-[0.32em]", className)}
    >
      {words.map((word, index) => (
        <motion.span
          key={`${word}-${index}`}
          variants={{
            hidden: { opacity: 0, y: 12, filter: "blur(6px)" },
            visible: {
              opacity: 1,
              y: 0,
              filter: "blur(0px)",
              transition: { duration: 0.5, ease: [0.22, 1, 0.36, 1] },
            },
          }}
          className="inline-block"
        >
          {word}
        </motion.span>
      ))}
    </motion.p>
  );
}

/** Single-element fade-and-rise, for blocks that should not split into words. */
export function FadeIn({
  children,
  delay = 0,
  className,
}: {
  children: React.ReactNode;
  delay?: number;
  className?: string;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.6, delay, ease: [0.22, 1, 0.36, 1] }}
      className={className}
    >
      {children}
    </motion.div>
  );
}
