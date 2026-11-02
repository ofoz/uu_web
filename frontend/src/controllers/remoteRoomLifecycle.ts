import type { Dispatch, SetStateAction } from "react";

import type { UuDevice, UuDeviceGroups } from "@uurc/shared/devices";
import type { RemoteControlBootstrap } from "@uurc/shared/remoteBootstrap";
import type { RemoteSignalGatewayStatus } from "@uurc/shared/signalGateway/model";
import type { RemoteSignalReadinessDiagnostics } from "@uurc/shared/streamer/readiness";
import type { RoomJoinResult } from "@uurc/shared/roomSession";

import type { BusyAction, RoomJoinContext } from "../app/remoteControlTypes.js";
import { SELF_DEVICE_BLOCKED_REASON } from "../app/remoteControlTypes.js";
import {
  getRemoteSignalDiagnostics,
  startRemoteSignalGateway,
  stopRemoteSignalGateway,
} from "../api/remoteSignalApi.js";
import { cancelRemoteAssistance } from "../uu/remoteAssistanceApi.js";
import { clearRoomByDevice, getDeviceGroups, getRemoteBootstrap, joinRoomByDevice } from "../uu/roomApi.js";

type RunAction = (action: Exclude<BusyAction, null>, task: () => Promise<void>) => Promise<boolean>;

interface RemoteRoomLifecycleOptions {
  allDevices: UuDevice[];
  authDeviceId: string | undefined;
  forceJoin: boolean;
  selectedDeviceId: string;
  sdpTransportMode: "gzip" | "plain";
  signalServerIndex: number;
  roomJoinContext: RoomJoinContext | null;
  run: RunAction;
  onDevicesChange(devices: UuDeviceGroups): void;
  onForceJoinChange(forceJoin: boolean): void;
  resetBrowserRemoteSession(): void;
  resetSignalEvents(): void;
  resetSignalGateway(): void;
  setRemoteBootstrap: Dispatch<SetStateAction<RemoteControlBootstrap | null>>;
  setRemoteSignalDiagnostics: Dispatch<SetStateAction<RemoteSignalReadinessDiagnostics | null>>;
  setRoomJoinContext: Dispatch<SetStateAction<RoomJoinContext | null>>;
  setRoomResponse: Dispatch<SetStateAction<RoomJoinResult | null>>;
  setSignalGatewayContext: Dispatch<SetStateAction<RoomJoinContext | null>>;
  setSignalGatewayStatus: Dispatch<SetStateAction<RemoteSignalGatewayStatus | null>>;
  showToast(message: string): void;
}

export function createRemoteRoomLifecycle(options: RemoteRoomLifecycleOptions) {
  async function joinRoomForDevice(
    deviceId: string,
    joinWithForce = options.forceJoin,
  ): Promise<RoomJoinContext | null> {
    if (!deviceId) return null;
    let nextContext: RoomJoinContext | null = null;
    await options.run("join", async () => {
      if (deviceId === options.authDeviceId) throw new Error(SELF_DEVICE_BLOCKED_REASON);
      const device = options.allDevices.find((item) => item.deviceId === deviceId) ?? null;
      const context: RoomJoinContext = {
        kind: "owned_device",
        deviceId,
        forceJoin: joinWithForce,
        occupiedAtJoin: (device?.participantsInfo?.length ?? 0) > 0,
      };
      const joined = await joinRoomByDevice(deviceId, joinWithForce);
      options.setRoomResponse(joined);
      options.setRoomJoinContext(context);
      options.onForceJoinChange(joinWithForce);
      options.resetSignalGateway();
      options.resetBrowserRemoteSession();
      options.setRemoteBootstrap(joined.roomConfigSummary ? await getRemoteBootstrap() : null);
      if (joined.roomConfigSummary) nextContext = context;
    });
    return nextContext;
  }

  async function startSignalGateway(context = options.roomJoinContext): Promise<RemoteSignalGatewayStatus | null> {
    let nextStatus: RemoteSignalGatewayStatus | null = null;
    await options.run("signal-start", async () => {
      if (!context || context.deviceId !== options.selectedDeviceId) throw new Error("请先加入房间");
      options.resetSignalEvents();
      const status = await startRemoteSignalGateway({
        gzipSdp: options.sdpTransportMode === "gzip",
        signalServerIndex: options.signalServerIndex > 0 ? options.signalServerIndex : undefined,
      });
      nextStatus = status;
      options.setSignalGatewayStatus(status);
      options.setSignalGatewayContext(status.status === "connected" ? context : null);
      options.setRemoteSignalDiagnostics(await getRemoteSignalDiagnostics());
    });
    return nextStatus;
  }

  async function stopSignalGateway(): Promise<void> {
    await options.run("signal-stop", async () => {
      options.resetBrowserRemoteSession();
      const stopped = await stopRemoteSignalGateway();
      let nextStatus = stopped;
      const clearContext = options.roomJoinContext;
      if (clearContext?.deviceId) {
        try {
          nextStatus = {
            ...stopped,
            roomClear:
              clearContext.kind === "remote_assistance"
                ? await cancelRemoteAssistance(clearContext.connectId ?? clearContext.deviceId)
                : await clearRoomByDevice(clearContext.deviceId),
            updatedAt: new Date().toISOString(),
          };
        } catch (caught) {
          nextStatus = {
            ...stopped,
            roomClearError: caught instanceof Error ? caught.message : String(caught),
            updatedAt: new Date().toISOString(),
          };
        }
      }
      options.setSignalGatewayStatus(nextStatus);
      options.setSignalGatewayContext(null);
      options.resetSignalEvents();
      options.showToast("已断开远控连接");
      if (
        nextStatus.roomClear &&
        (nextStatus.roomClear.body.code === undefined || nextStatus.roomClear.body.code === 0)
      ) {
        options.setRoomJoinContext((current) => (current ? { ...current, occupiedAtJoin: false } : current));
      }
      if (clearContext?.kind !== "remote_assistance") {
        try {
          options.onDevicesChange(await getDeviceGroups());
        } catch {
          // The active connection is already closed; a refresh failure must not undo that result.
        }
      }
    });
  }

  return { joinRoomForDevice, startSignalGateway, stopSignalGateway };
}
