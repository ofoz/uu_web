import { useSyncExternalStore } from "react";

/**
 * 远端音频流的存活位置（按设备分片）。
 *
 * 理由与 `remoteVideoStreamsStore` 相同：远控页会随路由卸载，而音轨一直连着。
 * 把 `MediaStream` 放在页面 state 里，切回来时页面手里是 null，
 * 界面上「音频」一栏就变回不可用，需要等被控端再推一次 track 才恢复 ——
 * 而那可能永远不会发生。
 *
 * 按设备分片：多连接下 A 和 B 各有各的音轨，全局一份会互相覆盖。
 */

type Listener = () => void;

const streamByDevice = new Map<string, MediaStream | null>();
const listeners = new Map<string, Set<Listener>>();

function publish(deviceId: string, next: MediaStream | null): void {
  streamByDevice.set(deviceId, next);
  for (const listener of listeners.get(deviceId) ?? []) listener();
}

function subscribe(deviceId: string): (listener: Listener) => () => void {
  return (listener) => {
    let set = listeners.get(deviceId);
    if (!set) {
      set = new Set();
      listeners.set(deviceId, set);
    }
    set.add(listener);
    return () => {
      set?.delete(listener);
    };
  };
}

export function getRemoteAudioStream(deviceId: string): MediaStream | null {
  return streamByDevice.get(deviceId) ?? null;
}

export function setRemoteAudioStream(deviceId: string, next: MediaStream | null): void {
  publish(deviceId, next);
}

/** 登出用：清掉所有设备的音轨。 */
export function clearAllRemoteAudioStreams(): void {
  for (const deviceId of [...streamByDevice.keys()]) publish(deviceId, null);
}

/** 测试用。 */
export function resetRemoteAudioStreamStore(): void {
  streamByDevice.clear();
  for (const set of listeners.values()) {
    for (const listener of set) listener();
  }
}

export function useRemoteAudioStream(deviceId: string): MediaStream | null {
  return useSyncExternalStore(subscribe(deviceId), () => getRemoteAudioStream(deviceId), () => null);
}
