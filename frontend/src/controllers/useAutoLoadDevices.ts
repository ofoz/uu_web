import { useEffect, useRef } from "react";

export function useAutoLoadDevices({
  loggedIn,
  devicesLoaded,
  busy,
  loadDevices,
}: {
  loggedIn: boolean;
  devicesLoaded: boolean;
  busy: unknown;
  loadDevices: () => void;
}) {
  const attemptedRef = useRef(false);
  const loadDevicesRef = useRef(loadDevices);
  loadDevicesRef.current = loadDevices;

  useEffect(() => {
    if (!loggedIn) {
      attemptedRef.current = false;
      return;
    }
    if (devicesLoaded || busy !== null || attemptedRef.current) return;
    attemptedRef.current = true;
    loadDevicesRef.current();
  }, [loggedIn, devicesLoaded, busy]);
}
