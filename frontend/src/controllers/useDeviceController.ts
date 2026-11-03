import { useCallback, useState, type Dispatch, type SetStateAction } from "react";

import type { UuDeviceGroups } from "@uurc/shared/devices";

export function useDeviceController() {
  const [devices, setDevices] = useState<UuDeviceGroups>(createEmptyDeviceGroups);
  const [devicesLoaded, setDevicesLoaded] = useState(false);
  const [selectedDeviceIdState, setSelectedDeviceIdState] = useState("");
  const setSelectedDeviceId = useCallback<Dispatch<SetStateAction<string>>>((next) => {
    setSelectedDeviceIdState((current) => (typeof next === "function" ? next(current) : next));
  }, []);
  const [forceJoin, setForceJoin] = useState(false);
  const [assistanceConnectId, setAssistanceConnectId] = useState("");
  const [assistanceConnectCode, setAssistanceConnectCode] = useState("");
  const [assistanceNotice, setAssistanceNotice] = useState("");

  const resetDevices = useCallback(() => {
    setDevices(createEmptyDeviceGroups());
    setDevicesLoaded(false);
    setSelectedDeviceIdState("");
    setForceJoin(false);
    setAssistanceConnectId("");
    setAssistanceConnectCode("");
    setAssistanceNotice("");
  }, []);

  return {
    devices,
    setDevices,
    devicesLoaded,
    setDevicesLoaded,
    selectedDeviceIdState,
    setSelectedDeviceId,
    forceJoin,
    setForceJoin,
    assistanceConnectId,
    setAssistanceConnectId,
    assistanceConnectCode,
    setAssistanceConnectCode,
    assistanceNotice,
    setAssistanceNotice,
    resetDevices,
  };
}

function createEmptyDeviceGroups(): UuDeviceGroups {
  return { desktopDevices: [], mobileDevices: [], tvDevices: [] };
}
