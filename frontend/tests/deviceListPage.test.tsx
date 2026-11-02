import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { DeviceListPage } from "../src/components/DeviceListPage.js";

const emptyDevices = {
  desktopDevices: [],
  mobileDevices: [],
  tvDevices: [],
};

const callbacks = {
  onLoadDevices: vi.fn(),
  onSelectDevice: vi.fn(),
  onOpenDevice: vi.fn(),
  onAssistanceConnectIdChange: vi.fn(),
  onStartRemoteAssistance: vi.fn(),
};

describe("DeviceListPage", () => {
  it("shows a failed device load inside the content column without keeping the loading message", () => {
    render(
      <DeviceListPage
        authStatus={null}
        devices={emptyDevices}
        devicesLoaded={false}
        assistanceConnectId=""
        error="Web Crypto is unavailable in this browser"
        busy={null}
        {...callbacks}
      />,
    );

    const alert = screen.getByRole("alert");
    expect(alert.parentElement).toHaveClass("shell-page-body-wide");
    expect(screen.queryByText("正在加载设备…")).not.toBeInTheDocument();
    expect(screen.queryByText("暂无设备")).not.toBeInTheDocument();
  });

  it("keeps the loading message while the initial request is pending", () => {
    render(
      <DeviceListPage
        authStatus={null}
        devices={emptyDevices}
        devicesLoaded={false}
        assistanceConnectId=""
        error=""
        busy="devices"
        {...callbacks}
      />,
    );

    expect(screen.getByText("正在加载设备…")).toBeInTheDocument();
  });
});
