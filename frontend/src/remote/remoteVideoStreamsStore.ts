import { useSyncExternalStore } from "react";

import type { RemoteVideoStream } from "../app/remoteControlTypes.js";

/**
 * 远端画面源的存活位置（模块级）。
 *
 * 和会话本身一样，画面源也必须活过远控页：用户退回设备列表时页面会卸载，
 * 若流列表存在页面的 useState 里，切回来就是空数组 —— 界面显示"暂无画面源"。
 * 更糟的是 `MediaStream`/`MediaStreamTrack` 对象会随页面一起被丢弃，而会话那边
 * 并不会重新推一次 track（连接一直是好的）。
 *
 * 所以这里把流列表放在模块级，页面只是订阅者。
 */

type Listener = () => void;

const EMPTY: readonly RemoteVideoStream[] = [];
let streams: readonly RemoteVideoStream[] = EMPTY;
const listeners = new Set<Listener>();

function publish(next: readonly RemoteVideoStream[]): void {
  streams = next;
  for (const listener of listeners) listener();
}

function subscribe(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function getRemoteVideoStreams(): readonly RemoteVideoStream[] {
  return streams;
}

export function setRemoteVideoStreams(next: RemoteVideoStream[]): void {
  publish(next);
}

export function clearRemoteVideoStreams(): void {
  publish(EMPTY);
}

/** 测试用。 */
export function resetRemoteVideoStreamsStore(): void {
  publish(EMPTY);
}

export function useRemoteVideoStreams(): readonly RemoteVideoStream[] {
  return useSyncExternalStore(subscribe, getRemoteVideoStreams, () => EMPTY);
}
