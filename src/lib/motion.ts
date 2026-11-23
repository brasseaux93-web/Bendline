import type { Transition, Variants } from "motion/react";

/**
 * Interactive transition durations in seconds (all strictly <= 300ms / 0.3s).
 */
export const MOTION_DURATION = {
  instant: 0.12,
  fast: 0.18,
  normal: 0.24,
  max: 0.3,
} as const;

/**
 * Bounded spring presets used across Bendline interactive surfaces.
 */
export const MOTION_SPRING = {
  snappy: {
    type: "spring",
    stiffness: 420,
    damping: 34,
    mass: 0.8,
  } satisfies Transition,
  gentle: {
    type: "spring",
    stiffness: 360,
    damping: 30,
    mass: 0.8,
  } satisfies Transition,
  layout: {
    type: "spring",
    stiffness: 380,
    damping: 32,
    mass: 0.85,
  } satisfies Transition,
} as const;

export const questionSwap: Variants = {
  initial: { opacity: 0, x: 18 },
  animate: {
    opacity: 1,
    x: 0,
    transition: { duration: MOTION_DURATION.normal },
  },
  exit: {
    opacity: 0,
    x: -18,
    transition: { duration: MOTION_DURATION.fast },
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
        staggerChildren: 0.04,
      },
    },
  } satisfies Variants,
  bentoCard: {
    hidden: { opacity: 0, y: 12 },
    visible: {
      opacity: 1,
      y: 0,
      transition: MOTION_SPRING.gentle,
    },
  } satisfies Variants,
  stepSlide: {
    initial: { opacity: 0, y: 10 },
    animate: {
      opacity: 1,
      y: 0,
      transition: { duration: MOTION_DURATION.normal },
    },
    exit: {
      opacity: 0,
      y: -8,
      transition: { duration: MOTION_DURATION.fast },
    },
  },
  overlayFade: {
    initial: { opacity: 0 },
    animate: {
      opacity: 1,
      transition: { duration: MOTION_DURATION.fast },
    },
    exit: {
      opacity: 0,
      transition: { duration: MOTION_DURATION.fast },
    },
  },
  questionSwap,
} as const;
