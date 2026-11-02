import { renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { useAutoLoadDevices } from "../src/controllers/useAutoLoadDevices.js";

describe("useAutoLoadDevices", () => {
  it("attempts automatic loading once until the user logs in again", () => {
    const loadDevices = vi.fn();
    const { rerender } = renderHook(
      ({ loggedIn, busy }) =>
        useAutoLoadDevices({
          loggedIn,
          devicesLoaded: false,
          busy,
          loadDevices,
        }),
      { initialProps: { loggedIn: true, busy: null as unknown } },
    );

    expect(loadDevices).toHaveBeenCalledTimes(1);
    rerender({ loggedIn: true, busy: "devices" });
    rerender({ loggedIn: true, busy: null });
    expect(loadDevices).toHaveBeenCalledTimes(1);

    rerender({ loggedIn: false, busy: null });
    rerender({ loggedIn: true, busy: null });
    expect(loadDevices).toHaveBeenCalledTimes(2);
  });
});
