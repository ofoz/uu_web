import { Monitor, X } from "lucide-react";

import { useRemoteConnections } from "../remote/remoteConnectionsStore.js";

/**
 * 设备列表顶部的「正在连接」页签条。
 *
 * 每个页签对应一条**真实存在的连接**（连接仓里的一等公民，不随页面卸载）。
 * 点页签是切视图，点 × 才是拆连接 —— 这样用户能随时离开远控页回来看设备列表、
 * 发起新连接，再切回任意一台，不必断开。
 *
 * 导航通过 onSwitch 注入，组件本身不调 useNavigate：它是纯展示块，要能被单独
 * 渲染（组件测试里没有 Router 上下文，硬依赖 useNavigate 会直接抛错）。
 */
export function RemoteConnectionTabs({
  activeDeviceId,
  onClose,
  onSwitch,
}: {
  activeDeviceId?: string;
  onClose: (deviceId: string) => void;
  onSwitch: (deviceId: string) => void;
}) {
  const connections = useRemoteConnections();

  if (connections.length === 0) return null;

  return (
    <section className="remote-connection-tabs" aria-label="正在连接的设备">
      <span className="remote-connection-tabs-label">正在连接</span>
      <div className="remote-connection-tab-list" role="tablist">
        {connections.map((connection) => {
          const active = connection.deviceId === activeDeviceId;
          return (
            <span
              key={connection.deviceId}
              className={`remote-connection-tab${active ? " is-active" : ""}`}
              role="presentation"
            >
              <button
                type="button"
                role="tab"
                aria-selected={active}
                className="remote-connection-tab-main"
                onClick={() => onSwitch(connection.deviceId)}
              >
                <Monitor size={13} aria-hidden />
                <span className="remote-connection-tab-name">{connection.deviceName}</span>
              </button>
              <button
                type="button"
                className="remote-connection-tab-close"
                aria-label={`断开并关闭 ${connection.deviceName}`}
                title="断开并关闭这条连接"
                onClick={() => onClose(connection.deviceId)}
              >
                <X size={12} aria-hidden />
              </button>
            </span>
          );
        })}
      </div>
    </section>
  );
}
