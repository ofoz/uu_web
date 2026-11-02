import { StrictMode } from "react";
import { createRoot, hydrateRoot } from "react-dom/client";

import App from "./App.js";

const rootElement = document.getElementById("root") as HTMLElement;
const hasPrerenderedLanding = window.location.pathname === "/" && rootElement.dataset.prerendered === "landing";
const app = (
  <StrictMode>
    <App initialLandingLoggedIn={hasPrerenderedLanding ? false : undefined} />
  </StrictMode>
);

if (hasPrerenderedLanding) {
  hydrateRoot(rootElement, app);
} else {
  rootElement.replaceChildren();
  createRoot(rootElement).render(app);
}
