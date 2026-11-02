import { useCallback, useMemo, useState, type RefObject } from "react";

import type { RemoteVideoSamplesById, RemoteVideoSourceInfo, RemoteVideoStream } from "../app/remoteControlTypes.js";
import type { BrowserRemoteSession } from "../remote/browserRemoteSession.js";
import type {
  BrowserRemoteSessionState,
  BrowserRemoteVideoElementSample,
} from "../remote/browserRemoteSessionTypes.js";
import { createSingleTrackMediaStream, resolvePrimaryRemoteVideoId } from "../remote/remoteVideoModel.js";

export function useRemoteVideoController({
  browserSessionRef,
  onSessionStateChange,
}: {
  browserSessionRef: RefObject<BrowserRemoteSession | null>;
  onSessionStateChange(state: BrowserRemoteSessionState): void;
}) {
  const [remoteVideoStreams, setRemoteVideoStreams] = useState<RemoteVideoStream[]>([]);
  const [remoteVideoSamplesById, setRemoteVideoSamplesById] = useState<RemoteVideoSamplesById>({});
  const [selectedRemoteVideoId, setSelectedRemoteVideoId] = useState("");

  const primaryRemoteVideoId = useMemo(
    () => resolvePrimaryRemoteVideoId(remoteVideoStreams, remoteVideoSamplesById, selectedRemoteVideoId),
    [remoteVideoSamplesById, remoteVideoStreams, selectedRemoteVideoId],
  );

  const handleRemoteMediaStream = useCallback((stream: MediaStream) => {
    const tracks =
      typeof stream.getVideoTracks === "function"
        ? stream.getVideoTracks().filter((track) => track.readyState !== "ended")
        : [];
    setRemoteVideoStreams(
      tracks.map((track, index) => ({
        id: track.id || `video-${index + 1}`,
        stream: createSingleTrackMediaStream(track),
      })),
    );
    setRemoteVideoSamplesById({});
  }, []);

  const handleRemoteVideoSample = useCallback(
    (videoId: string, sample: BrowserRemoteVideoElementSample) => {
      setRemoteVideoSamplesById((current) => ({ ...current, [videoId]: sample }));
      if (videoId !== primaryRemoteVideoId) return;
      const nextState = browserSessionRef.current?.recordVideoElementSample(sample);
      if (nextState) onSessionStateChange(nextState);
    },
    [browserSessionRef, onSessionStateChange, primaryRemoteVideoId],
  );

  const resetRemoteVideos = useCallback(() => {
    setRemoteVideoStreams([]);
    setRemoteVideoSamplesById({});
    setSelectedRemoteVideoId("");
  }, []);

  const remoteVideoSources = useMemo<RemoteVideoSourceInfo[]>(
    () =>
      remoteVideoStreams.map((video, index) => {
        const sample = remoteVideoSamplesById[video.id];
        const active = Boolean(sample) && (sample?.width ?? 0) > 0 && (sample?.height ?? 0) > 0;
        return {
          id: video.id,
          index,
          resolution: active ? `${sample?.width}×${sample?.height}` : "",
          hasSignal: !sample || active,
        };
      }),
    [remoteVideoSamplesById, remoteVideoStreams],
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
