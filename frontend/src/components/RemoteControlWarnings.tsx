import { Info, TriangleAlert } from "lucide-react";

export interface RemoteControlWarningsProps {
  browserWebRtcUnavailableReason: string;
  forceJoin: boolean;
  normalJoinTakeoverHint: string;
  occupiedBySelfClient: boolean;
  occupyingParticipantLabel: string;
  roomJoinFailureMessage: string;
  selectedDeviceOccupied: boolean;
  selfDeviceBlockedReason: string;
  signalGatewayErrorHint: string;
}

export function RemoteControlWarnings({
  browserWebRtcUnavailableReason,
  forceJoin,
  normalJoinTakeoverHint,
  occupiedBySelfClient,
  occupyingParticipantLabel,
  roomJoinFailureMessage,
  selectedDeviceOccupied,
  selfDeviceBlockedReason,
  signalGatewayErrorHint,
}: RemoteControlWarningsProps) {
  return (
    <>
      {browserWebRtcUnavailableReason ? (
        <div className="occupancy-callout takeover">
          <TriangleAlert size={17} />
          <span>{browserWebRtcUnavailableReason}</span>
        </div>
      ) : null}
      {occupiedBySelfClient ? (
        <div className="occupancy-callout info">
          <Info size={17} />
          <span>检测到你之前的会话仍在占用这台设备，将自动接管，无需额外操作。</span>
        </div>
      ) : selectedDeviceOccupied && !forceJoin ? (
        <div className="occupancy-callout takeover">
          <TriangleAlert size={17} />
          <span>该设备正被{occupyingParticipantLabel}占用。点击「接管并开始连接」可强制接管，对方将被断开。</span>
        </div>
      ) : null}
      {roomJoinFailureMessage ? (
        <div className="occupancy-callout takeover">
          <TriangleAlert size={17} />
          <span>{roomJoinFailureMessage}</span>
        </div>
      ) : null}
      {selfDeviceBlockedReason ? (
        <div className="occupancy-callout">
          <TriangleAlert size={17} />
          <span>{selfDeviceBlockedReason}</span>
        </div>
      ) : null}
      {normalJoinTakeoverHint ? (
        <div className="occupancy-callout takeover">
          <TriangleAlert size={17} />
          <span>{normalJoinTakeoverHint}</span>
        </div>
      ) : null}
      {signalGatewayErrorHint ? (
        <div className="occupancy-callout takeover">
          <TriangleAlert size={17} />
          <span>{signalGatewayErrorHint}</span>
        </div>
      ) : null}
    </>
  );
}
