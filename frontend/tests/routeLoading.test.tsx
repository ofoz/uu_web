import { act, fireEvent, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { MemoryRouter } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ProductRoutes } from "../src/components/ProductRoutes.js";
import { cleanupAppTest, setupAppTest } from "./appTestEnvironment.js";

const remoteRouteModule = vi.hoisted(() => {
  let resolveModule!: (module: { default: () => ReactNode }) => void;
  const promise = new Promise<{ default: () => ReactNode }>((resolve) => {
    resolveModule = resolve;
  });

  return {
    preload: vi.fn(),
    promise,
    resolve: resolveModule,
  };
});

vi.mock("../src/routeLoaders.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../src/routeLoaders.js")>();
  return {
    ...actual,
    loadRemoteControlRoute: () => remoteRouteModule.promise,
    preloadRemoteControlRoute: remoteRouteModule.preload,
  };
});

describe("route loading", () => {
  beforeEach(() => {
    setupAppTest();
    remoteRouteModule.preload.mockReset();
  });

  afterEach(cleanupAppTest);

  it("keeps the current shell visible while the first remote-control route load is pending", async () => {
    render(
      <MemoryRouter initialEntries={["/devices"]}>
        <ProductRoutes />
      </MemoryRouter>,
    );

    await screen.findByRole("heading", { name: "我的设备" });
    fireEvent.click(await screen.findByRole("button", { name: /连接 Office Mac/ }));

    expect(remoteRouteModule.preload).toHaveBeenCalled();
    expect(screen.getByRole("heading", { name: "我的设备" })).toBeInTheDocument();
    expect(screen.queryByText("正在加载页面...")).not.toBeInTheDocument();

    await act(async () => {
      remoteRouteModule.resolve({ default: () => <main>远控模块已就绪</main> });
      await remoteRouteModule.promise;
    });

    expect(await screen.findByText("远控模块已就绪")).toBeInTheDocument();
  });
});
