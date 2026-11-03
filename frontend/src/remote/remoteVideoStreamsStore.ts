import { useSyncExternalStore } from "react";

import type { RemoteVideoStream } from "../app/remoteControlTypes.js";

/**
 * 远端画面源的存活位置（按设备分片）。
 *
 * 和会话本身一样，画面源也必须活过远控页：用户退回设备列表时页面会卸载，
 * 若流列表存在页面的 useState 里，切回来就是空数组 —— 界面显示"暂无画面源"。
 * 更糟的是 `MediaStream`/`MediaStreamTrack` 对象会随页面一起被丢弃，而会话那边
 * 并不会重新推一次 track（连接一直是好的）。
 *
 * 为什么按设备分片：多连接下 A 和 B 各有各的画面源。全局一份的话，
 * 连上 B 的瞬间 B 的流（或空列表）会覆盖 A 的，A 的页面切回去就没有画面了。
 */

type Listener = () => void;

const EMPTY: readonly RemoteVideoStream[] = [];
const streamsByDevice = new Map<string, readonly RemoteVideoStream[]>();
const listeners = new Map<string, Set<Listener>>();

function publish(deviceId: string, next: readonly RemoteVideoStream[]): void {
  streamsByDevice.set(deviceId, next);
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

export function getRemoteVideoStreams(deviceId: string): readonly RemoteVideoStream[] {
  return streamsByDevice.get(deviceId) ?? EMPTY;
}

export function setRemoteVideoStreams(deviceId: string, next: RemoteVideoStream[]): void {
  publish(deviceId, next);
}

export function clearRemoteVideoStreams(deviceId: string): void {
  publish(deviceId, EMPTY);
}

/** 登出用：清掉所有设备的画面源。 */
export function clearAllRemoteVideoStreams(): void {
  for (const deviceId of [...streamsByDevice.keys()]) publish(deviceId, EMPTY);
}

/** 测试用。 */
export function resetRemoteVideoStreamsStore(): void {
  streamsByDevice.clear();
  for (const set of listeners.values()) {
    for (const listener of set) listener();
  }
}

export function useRemoteVideoStreams(deviceId: string): readonly RemoteVideoStream[] {
  return useSyncExternalStore(subscribe(deviceId), () => getRemoteVideoStreams(deviceId), () => EMPTY);
}
