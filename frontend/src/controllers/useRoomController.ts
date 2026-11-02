import { useCallback, useState } from "react";

import type { RemoteControlBootstrap } from "@uurc/shared/remoteBootstrap";
import type { RoomJoinResult } from "@uurc/shared/roomSession";

import type { RemoteControlHandoff, RoomJoinContext } from "../app/remoteControlTypes.js";

export function useRoomController(initial: RemoteControlHandoff | null = null) {
  const [roomResponse, setRoomResponse] = useState<RoomJoinResult | null>(() => initial?.roomResponse ?? null);
  const [roomJoinContext, setRoomJoinContext] = useState<RoomJoinContext | null>(
    () => initial?.roomJoinContext ?? null,
  );
  const [remoteBootstrap, setRemoteBootstrap] = useState<RemoteControlBootstrap | null>(
    () => initial?.remoteBootstrap ?? null,
  );

  const resetRoom = useCallback(() => {
    setRoomResponse(null);
    setRoomJoinContext(null);
    setRemoteBootstrap(null);
  }, []);

  return {
    roomResponse,
    setRoomResponse,
    roomJoinContext,
    setRoomJoinContext,
    remoteBootstrap,
    setRemoteBootstrap,
    resetRoom,
  };
}
