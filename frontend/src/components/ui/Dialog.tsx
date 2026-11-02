import type { ReactNode } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, useIsPresent } from "motion/react";
import * as m from "motion/react-m";
import { useEffect } from "react";

import { dialogCardVariants, dialogScrimVariants } from "../../motion/presets.js";

export function Dialog({
  open,
  onClose,
  children,
  ariaLabel,
  className = "",
}: {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
  ariaLabel: string;
  className?: string;
}) {
  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);

  if (typeof document === "undefined") return null;

  return createPortal(
    <AnimatePresence>
      {open ? (
        <DialogSurface ariaLabel={ariaLabel} className={className} onClose={onClose}>
          {children}
        </DialogSurface>
      ) : null}
    </AnimatePresence>,
    document.body,
  );
}

function DialogSurface({
  onClose,
  children,
  ariaLabel,
  className,
}: {
  onClose: () => void;
  children: ReactNode;
  ariaLabel: string;
  className: string;
}) {
  const isPresent = useIsPresent();

  return (
    <m.div
      className="dialog-scrim"
      data-motion-state={isPresent ? "entered" : "exiting"}
      aria-hidden={isPresent ? undefined : true}
      inert={isPresent ? undefined : true}
      style={{ pointerEvents: isPresent ? undefined : "none" }}
      variants={dialogScrimVariants}
      initial="initial"
      animate="animate"
      exit="exit"
      onMouseDown={(event) => {
        if (isPresent && event.target === event.currentTarget) onClose();
      }}
    >
      <m.div
        className={`dialog-card ${className}`}
        role="dialog"
        aria-modal="true"
        aria-label={ariaLabel}
        variants={dialogCardVariants}
      >
        {children}
      </m.div>
    </m.div>
  );
}
