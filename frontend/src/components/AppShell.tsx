import { Github, Handshake, KeyRound, Monitor, Search, type LucideIcon } from "lucide-react";
import { AnimatePresence, LayoutGroup, type Variants } from "motion/react";
import * as m from "motion/react-m";
import { Link, NavLink, useLocation, useOutlet } from "react-router";

import type { UuDeviceGroups } from "@uurc/shared/devices";

import { useCommandPaletteController } from "../controllers/useCommandPaletteController.js";
import { tabIndicatorTransition } from "../motion/presets.js";
import { CommandPalette } from "./CommandPalette.js";

const SHELL_PAGE_VARIANTS = {
  initial: { opacity: 0, x: 8 },
  animate: {
    opacity: 1,
    x: 0,
    transition: { duration: 0.18, ease: [0.22, 1, 0.36, 1] },
  },
  exit: {
    opacity: 0,
    x: -6,
    transition: { duration: 0.14, ease: [0.4, 0, 1, 1] },
  },
} satisfies Variants;

function AppSidebarNavItem({
  to,
  icon: Icon,
  label,
  count,
}: {
  to: string;
  icon: LucideIcon;
  label: string;
  count?: number;
}) {
  return (
    <NavLink to={to} className={({ isActive }) => `app-sidebar-nav-item${isActive ? " is-active" : ""}`}>
      {({ isActive }) => (
        <>
          {isActive ? (
            <m.span
              className="app-sidebar-nav-active-indicator"
              layoutId="app-sidebar-active-navigation"
              transition={tabIndicatorTransition}
              aria-hidden="true"
            />
          ) : null}
          <Icon size={15} aria-hidden="true" />
          <span className="app-sidebar-nav-label">{label}</span>
          {count === undefined ? null : <span className="app-sidebar-nav-count">{count}</span>}
        </>
      )}
    </NavLink>
  );
}

export function AppShell({
  identityDeviceLabel,
  devices,
  onOpenDevice,
  onLoadDevices,
}: {
  identityDeviceLabel: string;
  devices: UuDeviceGroups;
  onOpenDevice: (deviceId: string) => void;
  onLoadDevices: () => void;
}) {
  const palette = useCommandPaletteController({ devices, onOpenDevice, onLoadDevices });
  const deviceCount = devices.desktopDevices.length + devices.mobileDevices.length + devices.tvDevices.length;
  const location = useLocation();
  const outlet = useOutlet();

  return (
    <div className="app-shell">
      <aside className="app-sidebar">
        <Link className="app-sidebar-brand" to="/" aria-label="返回 UU Remote Web 首页">
          <span className="app-sidebar-logo" aria-hidden="true">
            <Monitor size={13} />
          </span>
          <span className="app-sidebar-wordmark">UU Remote</span>
          <span className="app-sidebar-badge">WEB</span>
        </Link>

        <button type="button" className="app-sidebar-search" onClick={() => palette.setOpen(true)}>
          <Search size={14} />
          <span>搜索设备</span>
          <kbd>⌘K</kbd>
        </button>

        <LayoutGroup id="app-shell-navigation">
          <nav className="app-sidebar-nav" aria-label="主导航">
            <AppSidebarNavItem to="/devices" icon={Monitor} label="我的设备" count={deviceCount} />
            <AppSidebarNavItem to="/partner" icon={Handshake} label="远控伙伴" />
            <AppSidebarNavItem to="/account" icon={KeyRound} label="账号与凭证" />
          </nav>
        </LayoutGroup>

        <div className="app-sidebar-spacer" />

        <div className="app-sidebar-identity">
          <span className="app-sidebar-identity-dot" aria-hidden="true" />
          <div className="app-sidebar-identity-text">
            <div className="app-sidebar-identity-label">网页控制端</div>
            <div className="app-sidebar-identity-id">{identityDeviceLabel}</div>
          </div>
          <a
            className="app-sidebar-repo-link"
            href="https://github.com/iola1999/uurc-web"
            target="_blank"
            rel="noreferrer"
            aria-label="在 GitHub 查看源码"
          >
            <Github size={14} />
          </a>
        </div>
      </aside>

      <div className="app-shell-content">
        <AnimatePresence initial={false} mode="popLayout">
          <m.div
            key={location.pathname}
            className="app-shell-page-transition"
            variants={SHELL_PAGE_VARIANTS}
            initial="initial"
            animate="animate"
            exit="exit"
          >
            {outlet}
          </m.div>
        </AnimatePresence>
      </div>

      <CommandPalette {...palette} />
    </div>
  );
}
