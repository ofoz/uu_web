import { act, cleanup, fireEvent, render, renderHook, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { RemoteVideoSourcePanel } from "../src/components/RemoteVideoSourcePanel.js";
import type { RemoteVideoSourceInfo } from "../src/app/remoteControlTypes.js";
import type { BrowserRemoteVideoElementSample } from "../src/remote/browserRemoteSessionTypes.js";
import { useRemoteVideoController } from "../src/controllers/useRemoteVideoController.js";

class FakeMediaStream {
  tracks: MediaStreamTrack[];
  constructor(tracks: MediaStreamTrack[] = []) {
    this.tracks = tracks;
  }
  addTrack(track: MediaStreamTrack) {
    this.tracks.push(track);
  }
}

function fakeTrack(id: string): MediaStreamTrack {
  return { id, readyState: "live", kind: "video" } as unknown as MediaStreamTrack;
}

function fakeStream(trackIds: string[]): MediaStream {
  const tracks = trackIds.map(fakeTrack);
  return { getVideoTracks: () => tracks } as unknown as MediaStream;
}

function sampleOf(width: number, height: number): BrowserRemoteVideoElementSample {
  return { event: "sample", width, height } as unknown as BrowserRemoteVideoElementSample;
}

function renderVideoController() {
  return renderHook(() =>
    useRemoteVideoController({
      browserSessionRef: { current: null },
      onSessionStateChange: () => {},
    }),
  );
}

beforeEach(() => {
  vi.stubGlobal("MediaStream", FakeMediaStream);
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-11-02T10:00:00Z"));
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("useRemoteVideoController 画面源静默折叠", () => {
  it("把长期没有像素的 m-line 标成静默，只留真正出画面的那一路", () => {
    const { result } = renderVideoController();

    act(() => {
      result.current.handleRemoteMediaStream(fakeStream(["v1", "v2", "v3", "v4", "v5"]));
    });
    act(() => {
      result.current.handleRemoteVideoSample("v1", sampleOf(1920, 1080));
    });

    // 宽限期内谁都不折叠，避免连接初期误判。
    expect(result.current.remoteVideoSources.filter((source) => source.silent)).toHaveLength(0);

    act(() => {
      vi.advanceTimersByTime(4000);
    });
    expect(result.current.remoteVideoSources.filter((source) => source.silent)).toHaveLength(0);

    act(() => {
      vi.advanceTimersByTime(6000);
    });
    const silent = result.current.remoteVideoSources.filter((source) => source.silent);
    expect(silent.map((source) => source.id)).toEqual(["v2", "v3", "v4", "v5"]);
    expect(result.current.primaryRemoteVideoId).toBe("v1");
  });

  it("静默的画面源不参与主画面竞争", () => {
    const { result } = renderVideoController();

    act(() => {
      result.current.handleRemoteMediaStream(fakeStream(["v1", "v2"]));
    });
    act(() => {
      result.current.handleRemoteVideoSample("v1", sampleOf(1280, 720));
    });
    act(() => {
      result.current.setSelectedRemoteVideoId("v2");
    });
    expect(result.current.primaryRemoteVideoId).toBe("v2");

    act(() => {
      vi.advanceTimersByTime(9000);
    });
    expect(result.current.remoteVideoSources.find((source) => source.id === "v2")?.silent).toBe(true);
    expect(result.current.primaryRemoteVideoId).toBe("v1");
  });

  it("静默的源后来出了画面，会自动取消静默", () => {
    const { result } = renderVideoController();

    act(() => {
      result.current.handleRemoteMediaStream(fakeStream(["v1", "v2"]));
    });
    act(() => {
      result.current.handleRemoteVideoSample("v1", sampleOf(1920, 1080));
    });
    act(() => {
      vi.advanceTimersByTime(9000);
    });
    expect(result.current.remoteVideoSources.find((source) => source.id === "v2")?.silent).toBe(true);

    act(() => {
      result.current.handleRemoteVideoSample("v2", sampleOf(1920, 1080));
    });
    expect(result.current.remoteVideoSources.find((source) => source.id === "v2")?.silent).toBe(false);
    expect(result.current.remoteVideoSources.find((source) => source.id === "v2")?.resolution).toBe("1920×1080");
  });

  it("断开重连后重新计时，不会沿用上一次的首见时间", () => {
    const { result } = renderVideoController();

    act(() => {
      result.current.handleRemoteMediaStream(fakeStream(["v1"]));
    });
    act(() => {
      vi.advanceTimersByTime(9000);
    });
    expect(result.current.remoteVideoSources[0]?.silent).toBe(true);

    act(() => {
      result.current.resetRemoteVideos();
    });
    expect(result.current.remoteVideoSources).toHaveLength(0);

    act(() => {
      result.current.handleRemoteMediaStream(fakeStream(["v1"]));
    });
    expect(result.current.remoteVideoSources[0]?.silent).toBe(false);
  });
});

describe("RemoteVideoSourcePanel 默认折叠无画面源", () => {
  const sources: RemoteVideoSourceInfo[] = [
    { id: "v1", index: 0, resolution: "1920×1080", hasSignal: true, silent: false },
    { id: "v2", index: 1, resolution: "", hasSignal: false, silent: true },
    { id: "v3", index: 2, resolution: "", hasSignal: false, silent: true },
    { id: "v4", index: 3, resolution: "", hasSignal: false, silent: true },
    { id: "v5", index: 4, resolution: "", hasSignal: false, silent: true },
  ];

  it("只列有画面的源，并给出展开入口", () => {
    render(
      <RemoteVideoSourcePanel primaryRemoteVideoId="v1" remoteVideoSources={sources} onRemoteVideoSourceChange={() => {}} />,
    );

    expect(screen.getByText("画面源 · 1 路")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /画面 1/ })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /画面 2/ })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "+4 路无画面" }));
    expect(screen.getByText("画面源 · 5 路")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /画面 2/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "收起无画面" })).toBeInTheDocument();
  });

  it("全部源都没画面时不做折叠，避免面板看起来空掉", () => {
    const allSilent = sources.map((source) => ({ ...source, hasSignal: false, silent: true }));
    render(
      <RemoteVideoSourcePanel primaryRemoteVideoId="" remoteVideoSources={allSilent} onRemoteVideoSourceChange={() => {}} />,
    );

    expect(screen.getByText("画面源 · 5 路")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /路无画面/ })).not.toBeInTheDocument();
  });
});
