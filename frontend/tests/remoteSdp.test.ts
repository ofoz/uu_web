import { describe, expect, it } from "vitest";

import { applyOpusReceiverPreferencesToSdp } from "../src/remote/remoteSdp.js";

const OPUS_RECEIVER_FMTP = "minptime=10;stereo=1;useinbandfec=1;maxplaybackrate=48000;maxaveragebitrate=128000";

describe("applyOpusReceiverPreferencesToSdp", () => {
  it("updates only the dynamic Opus payload in an audio media section", () => {
    const input =
      [
        "v=0",
        "m=video 9 UDP/TLS/RTP/SAVPF 111",
        "a=rtpmap:111 H264/90000",
        "a=fmtp:111 profile-level-id=42e01f",
        "m=audio 9 UDP/TLS/RTP/SAVPF 109 63",
        "a=rtpmap:109 opus/48000/2",
        "a=fmtp:109 minptime=20;stereo=0;useinbandfec=0;maxplaybackrate=16000;maxaveragebitrate=32000;STEREO=0;x-google-min-bitrate=32",
        "a=rtpmap:63 red/48000/2",
        "a=fmtp:63 109/109",
      ].join("\r\n") + "\r\n";

    const expected = [
      "v=0",
      "m=video 9 UDP/TLS/RTP/SAVPF 111",
      "a=rtpmap:111 H264/90000",
      "a=fmtp:111 profile-level-id=42e01f",
      "m=audio 9 UDP/TLS/RTP/SAVPF 109 63",
      "a=rtpmap:109 opus/48000/2",
      `a=fmtp:109 ${OPUS_RECEIVER_FMTP};x-google-min-bitrate=32`,
      "a=rtpmap:63 red/48000/2",
      "a=fmtp:63 109/109",
      "",
    ].join("\r\n");

    expect(applyOpusReceiverPreferencesToSdp(input)).toBe(expected);
    expect(applyOpusReceiverPreferencesToSdp(expected)).toBe(expected);
  });

  it("inserts preferences for every LF-delimited audio Opus payload without fmtp", () => {
    const input = [
      "v=0",
      "m=audio 9 UDP/TLS/RTP/SAVPF 120",
      "a=rtpmap:120 OPUS/48000/2",
      "a=rtcp-mux",
      "m=audio 9 UDP/TLS/RTP/SAVPF 121",
      "a=rtpmap:121 opus/48000/2",
    ].join("\n");

    expect(applyOpusReceiverPreferencesToSdp(input)).toBe(
      [
        "v=0",
        "m=audio 9 UDP/TLS/RTP/SAVPF 120",
        "a=rtpmap:120 OPUS/48000/2",
        `a=fmtp:120 ${OPUS_RECEIVER_FMTP}`,
        "a=rtcp-mux",
        "m=audio 9 UDP/TLS/RTP/SAVPF 121",
        "a=rtpmap:121 opus/48000/2",
        `a=fmtp:121 ${OPUS_RECEIVER_FMTP}`,
      ].join("\n"),
    );
  });

  it("leaves SDP without an offered audio Opus payload unchanged", () => {
    const input = ["v=0", "m=audio 9 UDP/TLS/RTP/SAVPF 0", "a=rtpmap:111 opus/48000/2", "a=rtpmap:0 PCMU/8000"].join(
      "\r\n",
    );

    expect(applyOpusReceiverPreferencesToSdp(input)).toBe(input);
    expect(applyOpusReceiverPreferencesToSdp(undefined)).toBeUndefined();
  });
});
