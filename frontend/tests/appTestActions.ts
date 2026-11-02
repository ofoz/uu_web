import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect } from "vitest";

export async function openOfficeMacControl(
  user: ReturnType<typeof userEvent.setup>,
  options: { waitForReady?: boolean } = {},
): Promise<void> {
  await screen.findByRole("heading", { name: "我的设备" });
  await user.click(await screen.findByRole("button", { name: /连接 Office Mac/ }));
  await screen.findByRole("heading", { name: "Office Mac" });
  if (options.waitForReady === true) {
    await screen.findByText("已就绪");
  }
}

export function expectSignalState(expected: string): void {
  const signalStateLabel = screen.getByText("信令状态");
  expect(signalStateLabel.closest(".status-row")).toHaveTextContent(expected);
}

export function getPrimaryAction(name: string): HTMLElement {
  return within(screen.getByLabelText("远控主流程")).getByRole("button", { name });
}

export async function openSettingsTab(user: ReturnType<typeof userEvent.setup>): Promise<void> {
  const tab = screen.getByRole("tab", { name: "设置" });
  if (tab.getAttribute("aria-selected") !== "true") {
    await user.click(tab);
  }
}

export async function startCompatibleConnection(user: ReturnType<typeof userEvent.setup>): Promise<void> {
  await openSettingsTab(user);
  await openAdvancedSettings(user);
  await user.click(screen.getByRole("radio", { name: "兼容模式" }));
  await user.click(getPrimaryAction("开始连接"));
}

export async function openAdvancedSettings(user: ReturnType<typeof userEvent.setup>): Promise<void> {
  await openSettingsTab(user);
  const advanced = screen.getByText("高级设置（调试用）");
  const advancedDetails = advanced.closest("details");
  if (advancedDetails?.getAttribute("data-expanded") !== "true") {
    await user.click(advanced);
  }
  const debugInfo = screen.getByText("调试信息");
  const details = debugInfo.closest("details");
  if (details?.getAttribute("data-expanded") !== "true") {
    await user.click(debugInfo);
  }
}
