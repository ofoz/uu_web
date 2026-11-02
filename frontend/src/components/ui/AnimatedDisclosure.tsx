import { AnimatePresence, useIsPresent } from "motion/react";
import * as m from "motion/react-m";
import { useId, useState, type ReactNode } from "react";

const disclosureVariants = {
  closed: {
    height: 0,
    opacity: 0,
    y: -4,
    transition: { duration: 0.14, ease: [0.4, 0, 1, 1] },
  },
  open: {
    height: "auto",
    opacity: 1,
    y: 0,
    transition: { duration: 0.2, ease: [0.22, 1, 0.36, 1] },
  },
} as const;

export function AnimatedDisclosure({
  children,
  className = "",
  contentClassName = "",
  defaultOpen = false,
  summary,
}: {
  children: ReactNode;
  className?: string;
  contentClassName?: string;
  defaultOpen?: boolean;
  summary: ReactNode;
}) {
  const disclosureId = useId();
  const [expanded, setExpanded] = useState(defaultOpen);
  const [present, setPresent] = useState(defaultOpen);
  const summaryId = `${disclosureId}-summary`;
  const contentId = `${disclosureId}-content`;

  function toggleDisclosure() {
    if (expanded) {
      setExpanded(false);
      return;
    }

    setPresent(true);
    setExpanded(true);
  }

  return (
    <details className={className} open={present} data-expanded={expanded ? "true" : "false"}>
      <summary
        id={summaryId}
        aria-controls={contentId}
        aria-expanded={expanded}
        onClick={(event) => {
          event.preventDefault();
          toggleDisclosure();
        }}
      >
        {summary}
      </summary>
      <AnimatePresence
        initial={false}
        onExitComplete={() => {
          if (!expanded) setPresent(false);
        }}
      >
        {expanded ? (
          <DisclosureContent id={contentId} labelledBy={summaryId} className={contentClassName}>
            {children}
          </DisclosureContent>
        ) : null}
      </AnimatePresence>
    </details>
  );
}

function DisclosureContent({
  children,
  className,
  id,
  labelledBy,
}: {
  children: ReactNode;
  className: string;
  id: string;
  labelledBy: string;
}) {
  const isPresent = useIsPresent();

  return (
    <m.div
      id={id}
      className={`animated-disclosure-content${className ? ` ${className}` : ""}`}
      role="region"
      aria-labelledby={labelledBy}
      aria-hidden={isPresent ? undefined : true}
      inert={isPresent ? undefined : true}
      style={{ overflow: "hidden", pointerEvents: isPresent ? undefined : "none" }}
      variants={disclosureVariants}
      initial="closed"
      animate="open"
      exit="closed"
    >
      {children}
    </m.div>
  );
}
