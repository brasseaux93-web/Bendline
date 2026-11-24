import type { Transition, Variants } from "motion/react";

export const EASE_SNAPPY = [0.22, 1, 0.36, 1] as const;

/**
 * Interactive transition durations in seconds (all strictly <= 300ms / 0.3s).
 */
export const MOTION_DURATION = {
  instant: 0.1,
  fast: 0.14,
  normal: 0.18,
  max: 0.24,
} as const;

/**
 * Bounded spring presets used across Bendline interactive surfaces.
 */
export const MOTION_SPRING = {
  snappy: {
    type: "spring",
    stiffness: 460,
    damping: 34,
    mass: 0.7,
  } satisfies Transition,
  gentle: {
    type: "spring",
    stiffness: 380,
    damping: 30,
    mass: 0.75,
  } satisfies Transition,
  layout: {
    type: "spring",
    stiffness: 420,
    damping: 32,
    mass: 0.8,
  } satisfies Transition,
} as const;

export const questionSwap: Variants = {
  initial: { opacity: 0, x: 14 },
  animate: {
    opacity: 1,
    x: 0,
    transition: { duration: MOTION_DURATION.fast, ease: EASE_SNAPPY },
  },
  exit: {
    opacity: 0,
    x: -14,
    transition: { duration: MOTION_DURATION.instant, ease: EASE_SNAPPY },
  },
};

export const pageTransition: Variants = {
  initial: { opacity: 0, y: 6 },
  animate: {
    opacity: 1,
    y: 0,
    transition: { duration: MOTION_DURATION.fast, ease: EASE_SNAPPY },
  },
};

/**
 * Transform- and opacity-only animation variants (never animates layout-thrashing CSS properties).
 */
export const MOTION_VARIANTS = {
  staggerContainer: {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: {
        staggerChildren: 0.025,
      },
    },
  } satisfies Variants,
  bentoCard: {
    hidden: { opacity: 0, y: 8 },
    visible: {
      opacity: 1,
      y: 0,
      transition: MOTION_SPRING.snappy,
    },
  } satisfies Variants,
  stepSlide: {
    initial: { opacity: 0, y: 8 },
    animate: {
      opacity: 1,
      y: 0,
      transition: { duration: MOTION_DURATION.fast, ease: EASE_SNAPPY },
    },
    exit: {
      opacity: 0,
      y: -6,
      transition: { duration: MOTION_DURATION.instant, ease: EASE_SNAPPY },
    },
  },
  overlayFade: {
    initial: { opacity: 0 },
    animate: {
      opacity: 1,
      transition: { duration: MOTION_DURATION.fast, ease: EASE_SNAPPY },
    },
    exit: {
      opacity: 0,
      transition: { duration: MOTION_DURATION.instant, ease: EASE_SNAPPY },
    },
  },
  questionSwap,
  pageTransition,
} as const;
