import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router";

import type { UuDeviceGroups } from "@uurc/shared/devices";

export function useCommandPaletteController({
  devices,
  onOpenDevice,
  onLoadDevices,
}: {
  devices: UuDeviceGroups;
  onOpenDevice: (deviceId: string) => void;
  onLoadDevices: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const navigate = useNavigate();

  // 全局 ⌘K / Ctrl+K 呼出命令面板；Esc 关闭。
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setOpen((prev) => !prev);
        return;
      }
      if (event.key === "Escape") setOpen(false);
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  useEffect(() => {
    if (!open) setQuery("");
  }, [open]);

  const allDevices = useMemo(
    () => [...devices.desktopDevices, ...devices.mobileDevices, ...devices.tvDevices],
    [devices],
  );

  const matches = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return allDevices;
    return allDevices.filter((device) => device.alias.toLowerCase().includes(needle));
  }, [allDevices, query]);

  function onSelectDevice(deviceId: string) {
    setOpen(false);
    onOpenDevice(deviceId);
  }

  function onConnectByIdFromQuery() {
    const trimmed = query.trim();
    setOpen(false);
    navigate(trimmed ? `/partner?id=${encodeURIComponent(trimmed)}` : "/partner");
  }

  function onRefresh() {
    onLoadDevices();
  }

  return {
    open,
    query,
    matches,
    setOpen,
    setQuery,
    onSelectDevice,
    onConnectByIdFromQuery,
    onRefresh,
  };
}

export type CommandPaletteController = ReturnType<typeof useCommandPaletteController>;
