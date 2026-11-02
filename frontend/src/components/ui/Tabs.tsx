import { AnimatePresence, LayoutGroup } from "motion/react";
import * as m from "motion/react-m";
import { useId, useRef, type KeyboardEvent, type ReactNode } from "react";

import { tabIndicatorTransition, tabPanelVariants } from "../../motion/presets.js";

interface TabItem {
  value: string;
  label: ReactNode;
  content: ReactNode;
}

export function Tabs({
  items,
  value,
  onChange,
  variant = "pill",
  ariaLabel,
  trailingAction,
}: {
  items: TabItem[];
  value: string;
  onChange: (value: string) => void;
  variant?: "pill" | "segmented";
  ariaLabel: string;
  trailingAction?: ReactNode;
}) {
  const tabsId = useId();
  const tabRefs = useRef(new Map<string, HTMLButtonElement>());
  const active = items.find((item) => item.value === value) ?? items[0];

  function focusTab(index: number) {
    const target = items[index];
    if (!target) return;
    onChange(target.value);
    tabRefs.current.get(target.value)?.focus();
  }

  function handleKeyDown(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    if (items.length < 2) return;

    let targetIndex: number | null = null;
    if (event.key === "ArrowRight") targetIndex = (index + 1) % items.length;
    if (event.key === "ArrowLeft") targetIndex = (index - 1 + items.length) % items.length;
    if (event.key === "Home") targetIndex = 0;
    if (event.key === "End") targetIndex = items.length - 1;
    if (targetIndex === null) return;

    event.preventDefault();
    focusTab(targetIndex);
  }

  return (
    <LayoutGroup id={tabsId}>
      <div className="tabs">
        <div className={`tabs-list tabs-list-${variant}`} role="tablist" aria-label={ariaLabel}>
          {items.map((item, index) => {
            const isActive = item.value === active?.value;
            const tabId = `${tabsId}-tab-${item.value}`;
            const panelId = `${tabsId}-tabpanel-${item.value}`;

            return (
              <m.button
                key={item.value}
                ref={(element) => {
                  if (element) tabRefs.current.set(item.value, element);
                  else tabRefs.current.delete(item.value);
                }}
                type="button"
                role="tab"
                id={tabId}
                aria-selected={isActive}
                aria-controls={panelId}
                tabIndex={isActive ? 0 : -1}
                className={isActive ? "is-active" : ""}
                onClick={() => onChange(item.value)}
                onKeyDown={(event) => handleKeyDown(event, index)}
              >
                <AnimatePresence initial={false}>
                  {isActive ? (
                    <m.span
                      className="tabs-active-indicator"
                      layoutId="tabs-active-indicator"
                      transition={tabIndicatorTransition}
                      aria-hidden="true"
                    />
                  ) : null}
                </AnimatePresence>
                <span className="tabs-label">{item.label}</span>
              </m.button>
            );
          })}
          {trailingAction ? <span className="tabs-trailing">{trailingAction}</span> : null}
        </div>
        {active ? (
          <div
            className="tabs-panel"
            role="tabpanel"
            id={`${tabsId}-tabpanel-${active.value}`}
            aria-labelledby={`${tabsId}-tab-${active.value}`}
          >
            <AnimatePresence initial={false} mode="sync">
              <m.div
                key={active.value}
                className="tabs-panel-content"
                variants={tabPanelVariants}
                initial="initial"
                animate="animate"
              >
                {active.content}
              </m.div>
            </AnimatePresence>
          </div>
        ) : null}
      </div>
    </LayoutGroup>
  );
}
