import { useCallback, useEffect, useMemo, useRef, useState, type RefObject } from "react";

import type { RemoteVideoSamplesById, RemoteVideoSourceInfo } from "../app/remoteControlTypes.js";
import type { BrowserRemoteSession } from "../remote/browserRemoteSession.js";
import type {
  BrowserRemoteSessionState,
  BrowserRemoteVideoElementSample,
} from "../remote/browserRemoteSessionTypes.js";
import { createSingleTrackMediaStream, resolvePrimaryRemoteVideoId } from "../remote/remoteVideoModel.js";
import {
  clearRemoteVideoStreams,
  setRemoteVideoStreams as publishRemoteVideoStreams,
  useRemoteVideoStreams,
} from "../remote/remoteVideoStreamsStore.js";

/**
 * 被控端在 SDP 里往往挂着多路 video m-line（主屏、副屏、摄像头…），
 * 其中没启用的那几路永远不出画面。给它们一段宽限期，仍然没有像素就把它们
 * 从「画面源」里折叠起来，避免用户面对一串点不出内容的空画面。
 */
const VIDEO_SOURCE_SILENCE_GRACE_MS = 8000;
const VIDEO_SOURCE_SILENCE_POLL_MS = 2000;

function hasLivePixels(sample: BrowserRemoteVideoElementSample | undefined): boolean {
  return (sample?.width ?? 0) > 0 && (sample?.height ?? 0) > 0;
}

export function useRemoteVideoController({
  browserSessionRef,
  onSessionStateChange,
}: {
  browserSessionRef: RefObject<BrowserRemoteSession | null>;
  onSessionStateChange(state: BrowserRemoteSessionState): void;
}) {
  /*
   * 画面源放在模块级 store 里，不放在本组件 state。
   * 页面卸载后这些 MediaStream 还得留着，否则切回来就只剩"暂无画面源"。
   */
  const remoteVideoStreams = useRemoteVideoStreams();
  const [remoteVideoSamplesById, setRemoteVideoSamplesById] = useState<RemoteVideoSamplesById>({});
  const [selectedRemoteVideoId, setSelectedRemoteVideoId] = useState("");
  const firstSeenAtByIdRef = useRef(new Map<string, number>());
  const [silenceCheckedAt, setSilenceCheckedAt] = useState(() => Date.now());

  const handleRemoteMediaStream = useCallback((stream: MediaStream) => {
    const tracks =
      typeof stream.getVideoTracks === "function"
        ? stream.getVideoTracks().filter((track) => track.readyState !== "ended")
        : [];
    const now = Date.now();
    const firstSeenAtById = firstSeenAtByIdRef.current;
    const nextIds = new Set(tracks.map((track, index) => track.id || `video-${index + 1}`));
    for (const id of [...firstSeenAtById.keys()]) {
      if (!nextIds.has(id)) firstSeenAtById.delete(id);
    }
    for (const id of nextIds) {
      if (!firstSeenAtById.has(id)) firstSeenAtById.set(id, now);
    }
    publishRemoteVideoStreams(
      tracks.map((track, index) => ({
        id: track.id || `video-${index + 1}`,
        stream: createSingleTrackMediaStream(track),
      })),
    );
    setRemoteVideoSamplesById({});
  }, []);

  const resetRemoteVideos = useCallback(() => {
    firstSeenAtByIdRef.current.clear();
    clearRemoteVideoStreams();
    setRemoteVideoSamplesById({});
    setSelectedRemoteVideoId("");
  }, []);

  const remoteVideoSources = useMemo<RemoteVideoSourceInfo[]>(
    () =>
      remoteVideoStreams.map((video, index) => {
        const sample = remoteVideoSamplesById[video.id];
        const live = hasLivePixels(sample);
        const firstSeenAt = firstSeenAtByIdRef.current.get(video.id) ?? silenceCheckedAt;
        const silent = !live && silenceCheckedAt - firstSeenAt >= VIDEO_SOURCE_SILENCE_GRACE_MS;
        return {
          id: video.id,
          index,
          resolution: live ? `${sample?.width}×${sample?.height}` : "",
          hasSignal: silent ? false : !sample || live,
          silent,
        };
      }),
    [remoteVideoSamplesById, remoteVideoStreams, silenceCheckedAt],
  );

  // 只要还有源没出画面，就按节奏复查（宽限期到点才能判静默，之后某一路真出了画面也能自动回来）。
  const hasPendingSource = remoteVideoSources.some((source) => !hasLivePixels(remoteVideoSamplesById[source.id]));

  useEffect(() => {
    if (!hasPendingSource) return;
    const timer = window.setInterval(() => setSilenceCheckedAt(Date.now()), VIDEO_SOURCE_SILENCE_POLL_MS);
    return () => window.clearInterval(timer);
  }, [hasPendingSource]);

  const primaryRemoteVideoId = useMemo(() => {
    // 静默的画面源不参与主画面竞争，否则切过去只会看到一片黑。
    const liveStreams = remoteVideoStreams.filter(
      (video) => !remoteVideoSources.some((source) => source.id === video.id && source.silent),
    );
    return resolvePrimaryRemoteVideoId(
      liveStreams.length > 0 ? liveStreams : remoteVideoStreams,
      remoteVideoSamplesById,
      selectedRemoteVideoId,
    );
  }, [remoteVideoSamplesById, remoteVideoSources, remoteVideoStreams, selectedRemoteVideoId]);

  const handleRemoteVideoSample = useCallback(
    (videoId: string, sample: BrowserRemoteVideoElementSample) => {
      setRemoteVideoSamplesById((current) => ({ ...current, [videoId]: sample }));
      if (videoId !== primaryRemoteVideoId) return;
      const nextState = browserSessionRef.current?.recordVideoElementSample(sample);
      if (nextState) onSessionStateChange(nextState);
    },
    [browserSessionRef, onSessionStateChange, primaryRemoteVideoId],
  );

  const primaryRemoteVideoSample = remoteVideoSamplesById[primaryRemoteVideoId];
  const primaryRemoteVideoActive =
    !primaryRemoteVideoSample ||
    ((primaryRemoteVideoSample.width ?? 0) > 0 && (primaryRemoteVideoSample.height ?? 0) > 0);

  return {
    remoteVideoStreams,
    remoteVideoCount: remoteVideoStreams.length,
    remoteVideoSources,
    primaryRemoteVideoId,
    primaryRemoteVideoActive,
    setSelectedRemoteVideoId,
    handleRemoteMediaStream,
    handleRemoteVideoSample,
    resetRemoteVideos,
  };
}
