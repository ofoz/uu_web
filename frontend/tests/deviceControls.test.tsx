import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { DeviceList } from "../src/components/DeviceControls.js";

const routeLoaderMocks = vi.hoisted(() => ({
  preloadRemoteControlRoute: vi.fn(),
}));

vi.mock("../src/routeLoaders.js", () => ({
  preloadRemoteControlRoute: routeLoaderMocks.preloadRemoteControlRoute,
}));

describe("DeviceList", () => {
  beforeEach(() => routeLoaderMocks.preloadRemoteControlRoute.mockReset());

  it("keeps the offline device group as an accessible disclosure", async () => {
    const user = userEvent.setup();

    render(
      <DeviceList
        devices={{
          desktopDevices: [],
          mobileDevices: [{ deviceId: "phone-1", alias: "iPhone 17", controllable: false, status: "OFFLINE", raw: {} }],
          tvDevices: [],
        }}
        onSelect={vi.fn()}
        onConnect={vi.fn()}
      />,
    );

    const summary = screen.getByText("离线 · 1").closest("summary");
    if (!summary) throw new Error("离线设备组缺少 summary 元素");
    const disclosure = summary.closest("details");
    if (!disclosure) throw new Error("离线设备组缺少 details 元素");
    expect(summary).toHaveAttribute("aria-expanded", "true");
    expect(disclosure).toHaveAttribute("data-expanded", "true");

    await user.click(summary);

    expect(summary).toHaveAttribute("aria-expanded", "false");
    expect(disclosure).toHaveAttribute("data-expanded", "false");
  });

  it("only exposes a connect action for controllable non-local online devices", async () => {
    const onSelect = vi.fn();
    const onConnect = vi.fn();
    const user = userEvent.setup();

    render(
      <DeviceList
        devices={{
          desktopDevices: [
            { deviceId: "mac-1", alias: "Office Mac", controllable: true, status: "CONNECTED", raw: {} },
            { deviceId: "web-device-1", alias: "本机控制端", controllable: true, status: "CONNECTED", raw: {} },
          ],
          mobileDevices: [{ deviceId: "phone-1", alias: "iPhone 17", controllable: false, status: "OFFLINE", raw: {} }],
          tvDevices: [],
        }}
        currentDeviceId="web-device-1"
        onSelect={onSelect}
        onConnect={onConnect}
      />,
    );

    expect(screen.getByRole("button", { name: /连接 Office Mac/ })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /连接 iPhone 17/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /连接 本机控制端/ })).not.toBeInTheDocument();

    const connectButton = screen.getByRole("button", { name: /连接 Office Mac/ });
    fireEvent.mouseEnter(connectButton);
    fireEvent.focus(connectButton);
    fireEvent.pointerDown(connectButton);
    expect(routeLoaderMocks.preloadRemoteControlRoute).toHaveBeenCalledTimes(3);

    await user.click(connectButton);
    expect(onSelect).toHaveBeenCalledWith("mac-1");
    expect(onConnect).toHaveBeenCalledWith("mac-1");
  });
});
