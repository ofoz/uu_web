import { stopRemoteSignalGateway } from "../api/remoteSignalApi.js";
import {
  clearRemoteVideoStreams,
} from "../remote/remoteVideoStreamsStore.js";
import { setRemoteAudioStream } from "../remote/remoteAudioStreamStore.js";
import { closeRemoteSession } from "../remote/remoteSessionStore.js";
import { closeConnection, listConnections } from "../remote/remoteConnectionsStore.js";
import { stopSignalPolling } from "../remote/signalPolling.js";
import { clearRoomByDevice } from "../uu/roomApi.js";
import { cancelRemoteAssistance } from "../uu/remoteAssistanceApi.js";
import type { RoomJoinContext } from "../app/remoteControlTypes.js";

/**
 * 多连接下是否还有**这台设备之外**的远控连接活着。
 *
 * 后端信令网关是客户端级（按 X-UURC-Session 一份）、单房间、只服务于
 * 最后 join 的那台设备；只要还有别的连接在，就不能全局停网关，
 * 否则会把存活连接的信令一起带走。
 */
export function hasOtherLiveRemoteConnections(deviceId: string): boolean {
  return listConnections().some(
    (connection) =>
      connection.deviceId !== deviceId &&
      connection.handoff.roomJoinContext.kind === "remote_assistance",
  );
}

/**
 * 关掉一条连接（页签 × / 顶栏断开共用的收尾）。
 *
 * 关键语义：只清**这台设备**自己的资源——房间、轮询、本地会话、画面源、
 * 音轨、连接仓条目。网关只有在这是最后一条活跃连接时才停；
 * 其他设备的连接不受任何影响。
 */
export async function teardownRemoteConnection(deviceId: string): Promise<void> {
  const connection = listConnections().find((item) => item.deviceId === deviceId);
  const joinContext: RoomJoinContext | undefined = connection?.handoff.roomJoinContext;
  if (joinContext?.deviceId) {
    try {
      if (joinContext.kind === "remote_assistance") {
        await cancelRemoteAssistance(joinContext.connectId ?? joinContext.deviceId);
      } else {
        await clearRoomByDevice(joinContext.deviceId);
      }
    } catch {
      // 房间清理失败不阻塞本地关闭；后端有 TTL 兜底。
    }
  }
  if (!hasOtherLiveRemoteConnections(deviceId)) {
    await stopRemoteSignalGateway().catch(() => undefined);
  }
  // 轮询属于连接，连接没了就必须停，否则会一直对着已释放的会话发请求。
  stopSignalPolling(deviceId);
  closeRemoteSession(deviceId);
  clearRemoteVideoStreams(deviceId);
  setRemoteAudioStream(deviceId, null);
  closeConnection(deviceId);
}
