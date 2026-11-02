// @vitest-environment jsdom
import { act, fireEvent, render, renderHook, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useEffect, useRef, type RefObject } from "react";

import { RemoteAudioControl } from "../src/components/RemoteAudioControl.js";
import { useRemoteAudioController } from "../src/controllers/useRemoteAudioController.js";
import type { BrowserRemoteSession } from "../src/remote/browserRemoteSession.js";

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("remote audio playback", () => {
  it("recovers from an autoplay block and applies mute and volume controls", async () => {
    vi.stubGlobal("MediaStream", FakeMediaStream);
    const blockedError = new Error("play() requires a user gesture");
    blockedError.name = "NotAllowedError";
    const play = vi
      .spyOn(HTMLMediaElement.prototype, "play")
      .mockRejectedValueOnce(blockedError)
      .mockResolvedValue(undefined);
    const pause = vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(() => undefined);
    const user = userEvent.setup();
    const audioTrack = new FakeMediaStreamTrack("remote-audio", "audio");
    const stream = new FakeMediaStream([audioTrack]);

    const view = render(<RemoteAudioHarness stream={stream as unknown as MediaStream} />);

    const audio = view.container.querySelector("audio");
    expect(audio).toBeInstanceOf(HTMLAudioElement);
    await waitFor(() => expect(play).toHaveBeenCalledTimes(1));
    expect(audio?.srcObject).toBeInstanceOf(FakeMediaStream);
    expect((audio?.srcObject as unknown as FakeMediaStream).getAudioTracks()).toEqual([audioTrack]);
    expect(audio?.muted).toBe(false);
    expect(audio?.volume).toBe(1);

    await user.click(await screen.findByRole("button", { name: "播放远程声音" }));
    await waitFor(() => expect(play).toHaveBeenCalledTimes(2));
    expect(screen.getByRole("button", { name: "静音远程声音" })).toBeTruthy();

    await user.click(screen.getByRole("button", { name: "静音远程声音" }));
    expect(audio?.muted).toBe(true);
    expect(screen.getByRole("button", { name: "开启远程声音" })).toBeTruthy();

    fireEvent.change(screen.getByRole("slider", { name: "远程音量" }), { target: { value: "0.35" } });
    expect(audio?.volume).toBe(0.35);

    view.unmount();
    expect(pause).toHaveBeenCalled();
    expect(audio?.srcObject).toBeNull();
  });

  it("keeps one sink stream for repeated aggregate callbacks and clears it when the track ends", async () => {
    vi.stubGlobal("MediaStream", FakeMediaStream);
    const play = vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue(undefined);
    vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(() => undefined);
    const sessionRef = { current: null } as RefObject<BrowserRemoteSession | null>;
    const onSessionStateChange = vi.fn();
    const audioTrack = new FakeMediaStreamTrack("remote-audio", "audio");
    const stream = new FakeMediaStream([audioTrack]);
    const { result } = renderHook(() =>
      useRemoteAudioController({
        browserSessionRef: sessionRef,
        onSessionStateChange,
      }),
    );
    const audio = document.createElement("audio");
    result.current.remoteAudio.elementRef.current = audio;

    act(() => result.current.handleRemoteAudioStream(stream as unknown as MediaStream));
    await waitFor(() => expect(play).toHaveBeenCalledTimes(1));
    const sinkStream = audio.srcObject;

    act(() => result.current.handleRemoteAudioStream(stream as unknown as MediaStream));
    expect(play).toHaveBeenCalledTimes(1);
    expect(audio.srcObject).toBe(sinkStream);

    act(() => audioTrack.end());
    expect(result.current.remoteAudio.available).toBe(false);
    expect(result.current.remoteAudio.playbackState).toBe("idle");
    expect(audio.srcObject).toBeNull();
  });
});

function RemoteAudioHarness({ stream }: { stream: MediaStream }) {
  const sessionRef = useRef<BrowserRemoteSession | null>(null);
  const controller = useRemoteAudioController({
    browserSessionRef: sessionRef,
    onSessionStateChange: ignoreSessionStateChange,
  });
  const { handleRemoteAudioStream, remoteAudio } = controller;

  useEffect(() => handleRemoteAudioStream(stream), [handleRemoteAudioStream, stream]);
  return <RemoteAudioControl {...remoteAudio} />;
}

function ignoreSessionStateChange(): void {
  // The UI behavior under test does not need a live BrowserRemoteSession.
}

class FakeMediaStreamTrack extends EventTarget {
  readyState: MediaStreamTrackState = "live";

  constructor(
    readonly id: string,
    readonly kind: string,
  ) {
    super();
  }

  end(): void {
    this.readyState = "ended";
    this.dispatchEvent(new Event("ended"));
  }
}

class FakeMediaStream {
  private readonly tracks: FakeMediaStreamTrack[];

  constructor(tracks: FakeMediaStreamTrack[] = []) {
    this.tracks = [...tracks];
  }

  addTrack(track: FakeMediaStreamTrack): void {
    this.tracks.push(track);
  }

  getTracks(): FakeMediaStreamTrack[] {
    return [...this.tracks];
  }

  getAudioTracks(): FakeMediaStreamTrack[] {
    return this.tracks.filter((track) => track.kind === "audio");
  }

  getVideoTracks(): FakeMediaStreamTrack[] {
    return this.tracks.filter((track) => track.kind === "video");
  }
}
