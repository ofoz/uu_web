import type { RemoteVideoSamplesById, RemoteVideoStream } from "../app/remoteControlTypes.js";
import type { BrowserRemoteVideoElementSample } from "./browserRemoteSessionTypes.js";

export function resolvePrimaryRemoteVideoId(
  videos: RemoteVideoStream[],
  samplesById: RemoteVideoSamplesById,
  selectedVideoId: string,
): string {
  if (
    selectedVideoId &&
    videos.some((video) => video.id === selectedVideoId && samplesById[video.id]?.ended !== true)
  ) {
    return selectedVideoId;
  }
  return selectPrimaryRemoteVideoId(videos, samplesById);
}

export function createSingleTrackMediaStream(track: MediaStreamTrack): MediaStream {
  try {
    return new MediaStream([track]);
  } catch {
    const stream = new MediaStream();
    stream.addTrack(track);
    return stream;
  }
}

function selectPrimaryRemoteVideoId(videos: RemoteVideoStream[], samplesById: RemoteVideoSamplesById): string {
  if (videos.length === 0) return "";

  const scoredVideos = videos
    .map((video, index) => ({
      id: video.id,
      index,
      score: scoreRemoteVideoSample(samplesById[video.id]),
    }))
    .filter((video) => samplesById[video.id]?.ended !== true)
    .filter((video) => video.score > 0)
    .sort((left, right) => right.score - left.score || left.index - right.index);

  return scoredVideos[0]?.id ?? videos.find((video) => samplesById[video.id]?.ended !== true)?.id ?? "";
}

function scoreRemoteVideoSample(sample: BrowserRemoteVideoElementSample | undefined): number {
  if (!sample) return 0;
  const area = positiveNumber(sample.width) * positiveNumber(sample.height);
  return (
    area +
    positiveNumber(sample.totalVideoFrames) * 1000 +
    positiveNumber(sample.currentTimeMs) +
    positiveNumber(sample.readyState) * 100
  );
}

function positiveNumber(value: number | undefined): number {
  return value && value > 0 ? value : 0;
}
