import { TriangleAlert } from "lucide-react";

import type { UuParticipantInfo } from "@uurc/shared/devices";

import { ParticipantList } from "./ParticipantList.js";
import { Dialog } from "./ui/Dialog.js";

export function RemoteOccupiedDialog({
  open,
  deviceLabel,
  participants,
  onCancel,
  onJoinNormal,
  onTakeover,
}: {
  open: boolean;
  deviceLabel: string;
  participants: UuParticipantInfo[];
  onCancel: () => void;
  onJoinNormal: () => void;
  onTakeover: () => void;
}) {
  return (
    <Dialog open={open} onClose={onCancel} ariaLabel="该设备正被其他控制端占用" className="occupied-dialog">
      <div className="occupied-dialog-header">
        <span className="occupied-dialog-icon" aria-hidden="true">
          <TriangleAlert size={18} />
        </span>
        <div>
          <div className="occupied-dialog-title">该设备正被其他控制端占用</div>
          <p className="occupied-dialog-desc">选择加入方式后继续连接 {deviceLabel}。</p>
        </div>
      </div>

      <ParticipantList participants={participants} />

      <div className="occupied-dialog-options">
        <button type="button" className="occupied-dialog-option occupied-dialog-option-normal" onClick={onJoinNormal}>
          <span>普通加入</span>
          <small>请求加入，若对方仍在线可能需要接管才能继续</small>
        </button>
        <button type="button" className="occupied-dialog-option occupied-dialog-option-takeover" onClick={onTakeover}>
          <span>接管控制</span>
          <small>断开对方连接，独占控制</small>
        </button>
      </div>

      <div className="occupied-dialog-cancel">
        <button type="button" className="link-button" onClick={onCancel}>
          取消
        </button>
      </div>
    </Dialog>
  );
}
