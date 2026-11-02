import { useCallback, useEffect, useMemo, useRef, useState, type RefObject } from "react";

import type { RemoteAudioControlProps } from "../components/RemoteAudioControl.js";
import type { RemoteAudioPlaybackState } from "../app/remoteControlTypes.js";
import type { BrowserRemoteSession } from "../remote/browserRemoteSession.js";
import type {
  BrowserRemoteAudioElementSample,
  BrowserRemoteSessionState,
} from "../remote/browserRemoteSessionTypes.js";
import { createSingleTrackMediaStream } from "../remote/remoteVideoModel.js";

interface UseRemoteAudioControllerOptions {
  browserSessionRef: RefObject<BrowserRemoteSession | null>;
  onSessionStateChange(state: BrowserRemoteSessionState): void;
}

function clampVolume(volume: number): number {
  if (!Number.isFinite(volume)) return 1;
  return Math.min(1, Math.max(0, volume));
}

function getErrorName(error: unknown): string {
  if (error && typeof error === "object" && "name" in error && typeof error.name === "string") {
    return error.name;
  }
  return error instanceof Error ? error.name : "Error";
}

export function useRemoteAudioController({ browserSessionRef, onSessionStateChange }: UseRemoteAudioControllerOptions) {
  const audioElementRef = useRef<HTMLAudioElement | null>(null);
  const activeTrackRef = useRef<MediaStreamTrack | null>(null);
  const remoteAudioStreamRef = useRef<MediaStream | null>(null);
  const detachTrackListenerRef = useRef<() => void>(() => undefined);
  const playGenerationRef = useRef(0);
  const [remoteAudioStream, setRemoteAudioStream] = useState<MediaStream | null>(null);
  const [muted, setMuted] = useState(false);
  const [volume, setVolume] = useState(1);
  const [playbackState, setPlaybackState] = useState<RemoteAudioPlaybackState>("idle");
  const [playbackErrorName, setPlaybackErrorName] = useState("");

  const recordAudioElementSample = useCallback(
    (sample: BrowserRemoteAudioElementSample) => {
      const nextState = browserSessionRef.current?.recordAudioElementSample(sample);
      if (nextState) onSessionStateChange(nextState);
    },
    [browserSessionRef, onSessionStateChange],
  );

  const buildAudioElementSample = useCallback(
    (event: string, extra: Partial<BrowserRemoteAudioElementSample> = {}): BrowserRemoteAudioElementSample => {
      const element = audioElementRef.current;
      return {
        event,
        currentTimeMs: Math.round((element?.currentTime ?? 0) * 1000),
        readyState: element?.readyState,
        paused: element?.paused,
        ended: element?.ended,
        muted: element?.muted,
        volume: element?.volume,
        ...extra,
      };
    },
    [],
  );

  const handlePlaybackError = useCallback(
    (error: unknown, generation: number) => {
      if (generation !== playGenerationRef.current) return;
      const errorName = getErrorName(error);
      const autoplayBlocked = errorName === "NotAllowedError";
      setPlaybackState(autoplayBlocked ? "blocked" : "error");
      setPlaybackErrorName(errorName);
      recordAudioElementSample(
        buildAudioElementSample(autoplayBlocked ? "autoplay_blocked" : "play_error", {
          autoplayBlocked,
          errorName,
        }),
      );
    },
    [buildAudioElementSample, recordAudioElementSample],
  );

  const attemptPlayback = useCallback(() => {
    const element = audioElementRef.current;
    const stream = remoteAudioStreamRef.current;
    if (!element || !stream || element.srcObject !== stream) return;

    const generation = ++playGenerationRef.current;
    setPlaybackState("waiting");
    setPlaybackErrorName("");
    let playResult: Promise<void> | undefined;
    try {
      playResult = element.play();
    } catch (error) {
      handlePlaybackError(error, generation);
      return;
    }

    void Promise.resolve(playResult).then(
      () => {
        if (
          generation !== playGenerationRef.current ||
          remoteAudioStreamRef.current !== stream ||
          element.srcObject !== stream
        ) {
          return;
        }
        setPlaybackState("playing");
        setPlaybackErrorName("");
        recordAudioElementSample(buildAudioElementSample("playing"));
      },
      (error: unknown) => handlePlaybackError(error, generation),
    );
  }, [buildAudioElementSample, handlePlaybackError, recordAudioElementSample]);

  const clearAudioSink = useCallback(() => {
    playGenerationRef.current += 1;
    const element = audioElementRef.current;
    if (element) {
      if (element.srcObject) element.pause();
      element.srcObject = null;
    }
    remoteAudioStreamRef.current = null;
  }, []);

  const resetRemoteAudio = useCallback(() => {
    detachTrackListenerRef.current();
    detachTrackListenerRef.current = () => undefined;
    activeTrackRef.current = null;
    clearAudioSink();
    setRemoteAudioStream(null);
    setPlaybackState("idle");
    setPlaybackErrorName("");
  }, [clearAudioSink]);

  const handleRemoteAudioStream = useCallback(
    (stream: MediaStream) => {
      const tracks = typeof stream.getAudioTracks === "function" ? stream.getAudioTracks() : [];
      const nextTrack = tracks.find((track) => track.readyState !== "ended");
      if (!nextTrack) return;

      const currentTrack = activeTrackRef.current;
      if (
        currentTrack === nextTrack ||
        (currentTrack?.id && currentTrack.id === nextTrack.id && currentTrack.readyState !== "ended")
      ) {
        return;
      }

      detachTrackListenerRef.current();
      activeTrackRef.current = nextTrack;
      const handleTrackEnded = () => {
        if (activeTrackRef.current !== nextTrack) return;
        resetRemoteAudio();
      };
      nextTrack.addEventListener?.("ended", handleTrackEnded);
      detachTrackListenerRef.current = () => nextTrack.removeEventListener?.("ended", handleTrackEnded);

      const nextStream = createSingleTrackMediaStream(nextTrack);
      remoteAudioStreamRef.current = nextStream;
      setRemoteAudioStream(nextStream);
      setPlaybackState("waiting");
      setPlaybackErrorName("");
    },
    [resetRemoteAudio],
  );

  useEffect(() => {
    const element = audioElementRef.current;
    if (!element) return;

    if (element.srcObject && element.srcObject !== remoteAudioStream) element.pause();
    element.srcObject = remoteAudioStream;
    remoteAudioStreamRef.current = remoteAudioStream;
    if (remoteAudioStream) attemptPlayback();

    return () => {
      playGenerationRef.current += 1;
      if (!remoteAudioStream || element.srcObject !== remoteAudioStream) return;
      element.pause();
      element.srcObject = null;
    };
  }, [attemptPlayback, remoteAudioStream]);

  useEffect(() => {
    const element = audioElementRef.current;
    if (element) element.muted = muted;
  }, [muted]);

  useEffect(() => {
    const element = audioElementRef.current;
    if (element) element.volume = volume;
  }, [volume]);

  useEffect(
    () => () => {
      detachTrackListenerRef.current();
      clearAudioSink();
    },
    [clearAudioSink],
  );

  const toggleMuted = useCallback(() => {
    setMuted((current) => {
      const next = !current;
      if (audioElementRef.current) audioElementRef.current.muted = next;
      return next;
    });
  }, []);

  const changeVolume = useCallback((nextVolume: number) => {
    const next = clampVolume(nextVolume);
    if (audioElementRef.current) audioElementRef.current.volume = next;
    setVolume(next);
  }, []);

  const resumePlayback = useCallback(() => {
    const element = audioElementRef.current;
    if (element) element.muted = false;
    setMuted(false);
    attemptPlayback();
  }, [attemptPlayback]);

  const remoteAudio = useMemo<RemoteAudioControlProps>(
    () => ({
      elementRef: audioElementRef,
      available: remoteAudioStream !== null,
      muted,
      volume,
      playbackState,
      playbackErrorName,
      onToggleMuted: toggleMuted,
      onVolumeChange: changeVolume,
      onResumePlayback: resumePlayback,
    }),
    [changeVolume, muted, playbackErrorName, playbackState, remoteAudioStream, resumePlayback, toggleMuted, volume],
  );

  return {
    remoteAudio,
    handleRemoteAudioStream,
    resetRemoteAudio,
  };
}
