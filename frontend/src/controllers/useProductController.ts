import { startTransition, useEffect } from "react";
import { useNavigate } from "react-router";

import type { RemoteAssistanceJoinResult } from "@uurc/shared/roomSession";

import type {
  BusyAction,
  RemoteControlContext,
  RemoteControlHandoff,
  RoomJoinContext,
} from "../app/remoteControlTypes.js";
import {
  clearAuthState,
  createMobileDevice,
  exportAuthState,
  getAuthStatus,
  importAuthState,
  loginByMobile,
  sendMobileCode,
} from "../uu/accountApi.js";
import { getDeviceGroups, getRemoteBootstrap } from "../uu/roomApi.js";
import {
  cancelRemoteAssistance,
  getRemoteAssistanceControlMode,
  joinRemoteAssistanceByCode,
  joinRemoteAssistanceByConfirmation,
} from "../uu/remoteAssistanceApi.js";
import { stopRemoteSignalGateway } from "../api/remoteSignalApi.js";
import { writeLocalClipboardText } from "../browser/clipboard.js";
import { pickControllableDesktop } from "../devices/deviceSummary.js";
import {
  closeConnection,
  getConnection,
  listConnections,
  openConnection,
  refreshConnectionHandoff,
} from "../remote/remoteConnectionsStore.js";
import { formatRemoteAssistanceMode } from "../remote/remoteRoomUiModel.js";
import { resetAllSignalPolling, stopSignalPolling } from "../remote/signalPolling.js";
import { preloadRemoteControlRoute } from "../routeLoaders.js";
import { useAccountController } from "./useAccountController.js";
import { useAutoLoadDevices } from "./useAutoLoadDevices.js";
import { useBusyAction } from "./useBusyAction.js";
import { useDeviceController } from "./useDeviceController.js";
import { useToastController } from "./useToastController.js";

export function useProductController() {
  const accountState = useAccountController();
  const deviceState = useDeviceController();
  const { busy, error, run, setError } = useBusyAction("status");
  const { toast, showToast, dismissToast } = useToastController();
  const navigate = useNavigate();

  const loggedIn = Boolean(accountState.authStatus?.hasState);
  const canSubmitMobile = accountState.mobile.trim().length > 0 && busy === null && accountState.smsCountdown === 0;
  const canLogin = accountState.mobile.trim().length > 0 && accountState.smsCode.trim().length > 0 && busy === null;
  const identitySourceLabel = accountState.authStatus?.deviceId ? "主控端" : "待创建设备";
  const identityDeviceLabel = accountState.authStatus?.deviceId ?? "-";

  useEffect(() => {
    void loadStatus();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 仅在产品路由挂载时恢复一次账号凭证
  }, []);

  useAutoLoadDevices({
    loggedIn,
    devicesLoaded: deviceState.devicesLoaded,
    busy,
    loadDevices: () => void loadDevices(),
  });

  async function runProductAction(action: Exclude<BusyAction, null>, task: () => Promise<void>) {
    const succeeded = await run(action, task);
    if (!succeeded && action === "assistance") deviceState.setAssistanceNotice("");
  }

  async function loadStatus() {
    await runProductAction("status", async () => {
      accountState.setAuthStatus(await getAuthStatus());
    });
  }

  async function handleImport() {
    await runProductAction("import", async () => {
      const status = await importAuthState(accountState.authJson);
      accountState.setAuthStatus(status);
      if (!status.hasState) {
        const fieldLabels: Record<string, string> = { token: "令牌", userId: "用户 ID", deviceId: "设备 ID" };
        const missing = (status.missingFields ?? []).map((field) => fieldLabels[field] ?? field).join("、");
        throw new Error(missing ? `导入失败：账号凭证缺少 ${missing}` : "导入失败：账号凭证不完整");
      }
      accountState.setLoginNotice("已导入");
      deviceState.setDevicesLoaded(false);
      navigate("/devices", { replace: true });
    });
  }

  async function handleCopyAuthJson() {
    let authJson: string;
    try {
      authJson = JSON.stringify(exportAuthState(), null, 2);
      accountState.setAuthJson(authJson);
    } catch {
      showToast("未找到可复制的账号凭证");
      return;
    }
    try {
      await writeLocalClipboardText(authJson);
      showToast("已复制账号凭证到剪贴板");
    } catch {
      showToast("复制失败，请手动选择下方文本复制");
    }
  }

  async function handleLogout() {
    if (
      typeof window !== "undefined" &&
      !window.confirm("退出后需重新登录。若未备份账号凭证，建议先复制保存。确定退出？")
    ) {
      return;
    }
    await runProductAction("logout", async () => {
      await stopRemoteSignalGateway().catch(() => undefined);
      // 所有已建立的连接都要收掉，不能只处理"当前这一个"。
      for (const connection of listConnections()) {
        if (connection.handoff.roomJoinContext.kind !== "remote_assistance") continue;
        const { connectId, deviceId } = connection.handoff.roomJoinContext;
        await cancelRemoteAssistance(connectId ?? deviceId).catch(() => undefined);
      }
      accountState.setAuthStatus(await clearAuthState());
      accountState.setAuthJson("");
      accountState.setLoginNotice("");
      accountState.setCodeSent(false);
      accountState.setSmsCountdown(0);
      deviceState.resetDevices();
      resetAllSignalPolling();
      for (const connection of listConnections()) closeConnection(connection.deviceId);
      navigate("/login", { replace: true });
    });
  }

  /**
   * 关掉一条在途连接（页签上的 ×）。
   *
   * 与远控页里的「断开」等价：停网关、关本地会话，再从连接仓移除。
   * 刻意不做二次确认——页签上的 × 已经是明确的关闭意图。
   */
  async function closeRemoteConnection(deviceId: string) {
    await stopRemoteSignalGateway().catch(() => undefined);
    // 轮询属于连接，连接没了就必须停，否则会一直对着已释放的会话发请求。
    stopSignalPolling(deviceId);
    closeConnection(deviceId);
  }

  async function ensureMobileDevice() {
    if (accountState.authStatus?.deviceId) return;
    const result = await createMobileDevice();
    accountState.setAuthStatus(result.status);
  }

  async function handleSendMobileCode() {
    await runProductAction("send-mobile-code", async () => {
      if (!isValidMobileNumber(accountState.regionCode, accountState.mobile)) {
        throw new Error(
          accountState.regionCode.trim() === "86" || !accountState.regionCode.trim()
            ? "请输入 11 位有效手机号。"
            : "请输入有效的手机号。",
        );
      }
      await ensureMobileDevice();
      const result = await sendMobileCode({
        regionCode: accountState.regionCode.trim() || "86",
        mobile: accountState.mobile,
      });
      accountState.setAuthStatus(result.status);
      accountState.setCodeSent(true);
      accountState.setSmsCountdown(60);
      accountState.setLoginNotice("验证码已发送");
    });
  }

  async function handleMobileLogin() {
    await runProductAction("mobile-login", async () => {
      await ensureMobileDevice();
      const result = await loginByMobile({
        regionCode: accountState.regionCode.trim() || "86",
        mobile: accountState.mobile,
        code: accountState.smsCode,
      });
      accountState.setAuthStatus(result.status);
      accountState.setLoginNotice("已登录");
      deviceState.setDevicesLoaded(false);
      navigate("/devices", { replace: true });
    });
  }

  async function loadDevices() {
    await runProductAction("devices", async () => {
      const devices = await getDeviceGroups();
      deviceState.setDevices(devices);
      deviceState.setDevicesLoaded(true);
      // 只更新"用户已选中的那台"：选中项现在是要跨页面存活的，
      // 远控页里刷新设备、或从别的页面刷新列表，都不能把它重置掉。
      const target = pickControllableDesktop(devices.desktopDevices, accountState.authStatus?.deviceId);
      const fallback = target?.deviceId ?? devices.desktopDevices[0]?.deviceId ?? "";
      setSelectedDeviceIdIfMissing(fallback);
    });
  }

  /**
   * 选中设备为空时才填默认值。
   *
   * 选中项从"局部 state"升格成 controller 级就能一直存活，这样离开远控页
   * 不会丢掉"连的是哪台"，远控页本身也能在设备列表尚未刷新时就知道目标。
   */
  function setSelectedDeviceIdIfMissing(fallback: string) {
    if (!fallback) return;
    deviceState.setSelectedDeviceId((current) => current || fallback);
  }

  /**
   * 打开一台设备的远控页。
   *
   * 关键语义：这个函数**只负责切换视图**，不代表建立连接。连接已经存在
   * （之前连过、只是退回了列表）就直接复用那一份，页面上的断开/重连都作用在
   * 同一个连接对象上；因此来回切设备不会拆掉任何一路。
   */
  function handleOpenDevice(deviceId: string) {
    preloadRemoteControlRoute();
    deviceState.setSelectedDeviceId(deviceId);
    startTransition(() => navigate(`/devices/${encodeURIComponent(deviceId)}/control`));
  }

  async function handleStartRemoteAssistance() {
    if (busy !== null) return;
    if (!loggedIn) {
      setError("远程协助需要先登录 UU 账号。");
      return;
    }

    preloadRemoteControlRoute();
    deviceState.setAssistanceNotice("");
    await runProductAction("assistance", async () => {
      const connectId = deviceState.assistanceConnectId.trim();
      const connectCode = deviceState.assistanceConnectCode.trim();
      const modeResult = await getRemoteAssistanceControlMode(connectId);
      if (modeResult.upstream.body.code !== undefined && modeResult.upstream.body.code !== 0) {
        throw new Error(modeResult.upstream.body.msg ?? `远程协助模式返回 ${modeResult.upstream.body.code}`);
      }
      if (!modeResult.canRemoteControl) throw new Error("伙伴设备当前不允许远程协助");
      if (!modeResult.controlMode) throw new Error("伙伴设备未返回可识别的验证方式");

      let joined: RemoteAssistanceJoinResult;
      if (connectCode) {
        joined = await joinRemoteAssistanceByCode({ connectId, connectCode, controlMode: modeResult.controlMode });
        if (!joined.roomConfigSummary && joined.assistance.confirmationRequired) {
          deviceState.setAssistanceNotice("伙伴设备要求二次确认，正在等待对方确认...");
          joined = await joinRemoteAssistanceByConfirmation({
            connectId,
            connectCode,
            controlId: joined.assistance.controlId,
            controlMode: modeResult.controlMode,
          });
        }
      } else if (modeResult.controlMode === "by_confirmation" || modeResult.controlMode === "password_confirmation") {
        deviceState.setAssistanceNotice("正在等待伙伴设备确认...");
        joined = await joinRemoteAssistanceByConfirmation({ connectId, controlMode: modeResult.controlMode });
      } else {
        throw new Error("伙伴设备当前要求输入设备验证码");
      }

      if (!joined.roomConfigSummary) {
        throw new Error(joined.upstream.body.msg ?? "远程协助未返回可用房间配置");
      }
      if (joined.assistance.targetPlatform === undefined) {
        throw new Error("伙伴设备未返回设备系统，已取消本次远程协助");
      }

      const roomJoinContext: RoomJoinContext = {
        kind: "remote_assistance",
        deviceId: joined.assistance.connectId,
        forceJoin: false,
        occupiedAtJoin: false,
        connectId: joined.assistance.connectId,
        connectCodeProvided: joined.assistance.connectCodeProvided,
        controlId: joined.assistance.controlId,
        controlMode: joined.assistance.controlMode,
        deviceName: joined.assistance.deviceName,
        targetPlatform: joined.assistance.targetPlatform,
      };
      deviceState.setSelectedDeviceId(joined.assistance.connectId);
      const assistanceHandoff: RemoteControlHandoff = {
        roomResponse: joined,
        roomJoinContext,
        remoteBootstrap: await getRemoteBootstrap(),
      };
      openConnection({
        deviceId: joined.assistance.connectId,
        deviceName: joined.assistance.deviceName ?? "远程协助",
        handoff: assistanceHandoff,
      });
      deviceState.setForceJoin(false);
      deviceState.setAssistanceNotice(`已进入远程协助：${formatRemoteAssistanceMode(modeResult.controlMode)}`);
      startTransition(() => navigate(`/devices/${encodeURIComponent(joined.assistance.connectId)}/control`));
    });
  }

  return {
    authLoading: accountState.authStatus === null && busy === "status",
    loggedIn,
    toast,
    onDismissToast: dismissToast,
    login: {
      authJson: accountState.authJson,
      regionCode: accountState.regionCode,
      mobile: accountState.mobile,
      smsCode: accountState.smsCode,
      loginNotice: accountState.loginNotice,
      codeSent: accountState.codeSent,
      smsCountdown: accountState.smsCountdown,
      error,
      busy,
      canSubmitMobile,
      canLogin,
      onAuthJsonChange: accountState.setAuthJson,
      onRegionCodeChange: accountState.setRegionCode,
      onMobileChange: accountState.setMobile,
      onSmsCodeChange: accountState.setSmsCode,
      onSendMobileCode: () => void handleSendMobileCode(),
      onMobileLogin: () => void handleMobileLogin(),
      onImport: () => void handleImport(),
    },
    shell: {
      identityDeviceLabel,
      devices: deviceState.devices,
      onOpenDevice: handleOpenDevice,
      onLoadDevices: () => void loadDevices(),
    },
    devices: {
      authStatus: accountState.authStatus,
      devices: deviceState.devices,
      devicesLoaded: deviceState.devicesLoaded,
      assistanceConnectId: deviceState.assistanceConnectId,
      error,
      busy,
      onLoadDevices: () => void loadDevices(),
      onSelectDevice: deviceState.setSelectedDeviceId,
      onOpenDevice: handleOpenDevice,
      onAssistanceConnectIdChange: deviceState.setAssistanceConnectId,
      onStartRemoteAssistance: () => void handleStartRemoteAssistance(),
      onCloseRemoteConnection: (deviceId: string) => void closeRemoteConnection(deviceId),
    },
    assistance: {
      busy,
      connectCode: deviceState.assistanceConnectCode,
      connectId: deviceState.assistanceConnectId,
      error,
      notice: deviceState.assistanceNotice,
      onConnectCodeChange: deviceState.setAssistanceConnectCode,
      onConnectIdChange: deviceState.setAssistanceConnectId,
      onStart: () => void handleStartRemoteAssistance(),
    },
    account: {
      authJson: accountState.authJson,
      authStatus: accountState.authStatus,
      busy,
      identityDeviceLabel,
      identitySourceLabel,
      onCopyAuthJson: () => void handleCopyAuthJson(),
      onLogout: () => void handleLogout(),
    },
    control: {
      authStatus: accountState.authStatus,
      devices: deviceState.devices,
      devicesLoaded: deviceState.devicesLoaded,
      selectedDeviceId: deviceState.selectedDeviceIdState,
      // 连接不再由"当前页面"持有，而是存在连接仓里按 deviceId 索引；
      // 页面只是视图，切走再切回来仍是同一个连接。
      getConnection: (deviceId) => getConnection(deviceId)?.handoff ?? null,
      openConnection: (deviceId, handoff, deviceName) =>
        openConnection({
          deviceId,
          deviceName: deviceName ?? handoff.roomJoinContext.deviceName ?? findDeviceName(deviceId),
          handoff,
        }),
      closeConnection: (deviceId) => closeConnection(deviceId),
      refreshConnection: (deviceId, update) => refreshConnectionHandoff(deviceId, update),
      onDevicesChange: deviceState.setDevices,
    } satisfies RemoteControlContext,
  };

  function findDeviceName(deviceId: string): string {
    const all = [
      ...deviceState.devices.desktopDevices,
      ...deviceState.devices.mobileDevices,
      ...deviceState.devices.tvDevices,
    ];
    return all.find((device) => device.deviceId === deviceId)?.alias ?? deviceId;
  }
}

function isValidMobileNumber(regionCode: string, mobile: string): boolean {
  const digits = mobile.trim();
  if (!/^\d+$/.test(digits)) return false;
  const region = regionCode.trim() || "86";
  if (region === "86") return /^1\d{10}$/.test(digits);
  return digits.length >= 5 && digits.length <= 15;
}
