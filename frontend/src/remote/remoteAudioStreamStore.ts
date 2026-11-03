import { useSyncExternalStore } from "react";

/**
 * 远端音频流的存活位置（模块级）。
 *
 * 理由与 `remoteVideoStreamsStore` 相同：远控页会随路由卸载，而音轨一直连着。
 * 把 `MediaStream` 放在页面 state 里，切回来时页面手里是 null，
 * 界面上「音频」一栏就变回不可用，需要等被控端再推一次 track 才恢复 —— 而那可能永远不会发生。
 */

type Listener = () => void;

let stream: MediaStream | null = null;
const listeners = new Set<Listener>();

function publish(next: MediaStream | null): void {
  stream = next;
  for (const listener of listeners) listener();
}

function subscribe(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function getRemoteAudioStream(): MediaStream | null {
  return stream;
}

export function setRemoteAudioStream(next: MediaStream | null): void {
  publish(next);
}

/** 测试用。 */
export function resetRemoteAudioStreamStore(): void {
  publish(null);
}

export function useRemoteAudioStream(): MediaStream | null {
  return useSyncExternalStore(subscribe, getRemoteAudioStream, () => null);
}
