import type { ReactNode } from "react";
import { domMax, LazyMotion, MotionConfig } from "motion/react";

export function AppMotionProvider({ children }: { children: ReactNode }) {
  return (
    <MotionConfig reducedMotion="user">
      <LazyMotion features={domMax} strict>
        {children}
      </LazyMotion>
    </MotionConfig>
  );
}
