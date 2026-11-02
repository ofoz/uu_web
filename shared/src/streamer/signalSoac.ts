export const STREAMER_SOAC_EVENT = "soac" as const;
export const STREAMER_SOAC_TYPES = ["offer", "answer", "candidate", "restart_ice"] as const;
export type StreamerSoacType = (typeof STREAMER_SOAC_TYPES)[number];
export const STREAMER_CONTROLLER_INBOUND_SOAC_TYPES = ["answer", "candidate", "restart_ice"] as const;

export const STREAMER_ICE_NETWORK_TYPES = {
  eth: 1,
  wlan: 2,
  v4Wlan: 2,
  appAuto: 3,
  mobile: 4,
  vpn: 8,
  loopback: 16,
} as const;

export type StreamerIceNetworkType = (typeof STREAMER_ICE_NETWORK_TYPES)[keyof typeof STREAMER_ICE_NETWORK_TYPES];

export interface StreamerSoacCandidatePayload {
  candidate: string;
  sdpMid?: string;
  sdpMLineIndex?: number;
}

export interface BuildStreamerSoacPayloadInput {
  type: StreamerSoacType;
  clientId?: string;
  appControlId?: string;
  iceId?: string;
  sdp?: string;
  gzipSdp?: boolean;
  iceNetworkType?: StreamerIceNetworkType;
  candidate?: StreamerSoacCandidatePayload;
}

export interface StreamerSoacPayload {
  client_id?: string;
  data: {
    type: StreamerSoacType;
    sdp?: string;
    ice_id?: string;
    app_control_id?: string;
    gzip_sdp?: unknown;
    ice_network_type?: StreamerIceNetworkType;
    candidate?: StreamerSoacCandidatePayload;
  };
}

export function buildStreamerSoacPayload(input: BuildStreamerSoacPayloadInput): StreamerSoacPayload {
  const data: StreamerSoacPayload["data"] = { type: input.type };
  if (input.sdp !== undefined) data.sdp = input.sdp;
  if (input.iceId !== undefined) data.ice_id = input.iceId;
  if (input.appControlId !== undefined) data.app_control_id = input.appControlId;
  if (input.type !== "candidate" && input.iceNetworkType !== undefined) {
    data.ice_network_type = input.iceNetworkType;
  }
  if (input.candidate !== undefined) data.candidate = input.candidate;

  return input.clientId === undefined ? { data } : { client_id: input.clientId, data };
}
