import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { MemoryRouter } from "react-router";

import { AppContent } from "../src/App.js";

describe("prerendered landing auth state", () => {
  afterEach(() => {
    cleanup();
    window.localStorage.clear();
  });

  it("updates the prerendered login links after reading a stored account", async () => {
    window.localStorage.setItem(
      "uurc.loginState",
      JSON.stringify({ token: "synthetic-token", userId: "synthetic-user", deviceId: "synthetic-device" }),
    );

    render(
      <MemoryRouter initialEntries={["/"]}>
        <AppContent initialLandingLoggedIn={false} />
      </MemoryRouter>,
    );

    await waitFor(() => {
      for (const link of screen.getAllByRole("link", { name: /进入控制台/ })) {
        expect(link).toHaveAttribute("href", "/devices");
      }
    });
  });
});
