import { UsersRound } from "lucide-react";

import type { UuDevice } from "@uurc/shared/devices";

import { formatParticipantMeta } from "../devices/deviceLabels.js";

export function ParticipantList({ participants }: { participants: NonNullable<UuDevice["participantsInfo"]> }) {
  if (!participants.length) {
    return (
      <div className="participant-empty">
        <UsersRound size={17} />
        <span>暂无控制端占用</span>
      </div>
    );
  }

  return (
    <div className="participant-list" aria-label="当前控制端">
      {participants.map((participant, index) => (
        <div
          className="participant-card"
          key={`${participant.clientId || participant.deviceId || "participant"}-${index}`}
        >
          <UsersRound size={17} />
          <div>
            <strong>{participant.alias || "未知控制端"}</strong>
            <span>{formatParticipantMeta(participant)}</span>
          </div>
        </div>
      ))}
    </div>
  );
}
