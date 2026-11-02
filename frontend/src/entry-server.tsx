import { StrictMode } from "react";
import { renderToString } from "react-dom/server";
import { MemoryRouter } from "react-router";

import { AppContent } from "./App.js";

export function renderLandingPage(): string {
  return renderToString(
    <StrictMode>
      <MemoryRouter initialEntries={["/"]}>
        <AppContent initialLandingLoggedIn={false} />
      </MemoryRouter>
    </StrictMode>,
  );
}
