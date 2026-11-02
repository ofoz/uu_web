import type { Transition, Variants } from "motion/react";

export const tabIndicatorTransition: Transition = {
  type: "spring",
  stiffness: 520,
  damping: 38,
  mass: 0.72,
};

export const tabPanelVariants = {
  initial: { opacity: 0, y: 6 },
  animate: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.18, ease: [0.22, 1, 0.36, 1] },
  },
} satisfies Variants;

export const dialogScrimVariants = {
  initial: { opacity: 0 },
  animate: { opacity: 1, transition: { duration: 0.18, ease: [0.22, 1, 0.36, 1] } },
  exit: { opacity: 0, transition: { duration: 0.14, ease: [0.4, 0, 1, 1] } },
} satisfies Variants;

export const dialogCardVariants = {
  initial: { opacity: 0, y: 12, scale: 0.98 },
  animate: {
    opacity: 1,
    y: 0,
    scale: 1,
    transition: { type: "spring", stiffness: 440, damping: 34, mass: 0.78 },
  },
  exit: {
    opacity: 0,
    y: 8,
    scale: 0.985,
    transition: { duration: 0.14, ease: [0.4, 0, 1, 1] },
  },
} satisfies Variants;
