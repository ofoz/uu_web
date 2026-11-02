import { lazy, Suspense, useEffect, useState } from "react";
import { BrowserRouter, useLocation } from "react-router";

import { LandingPage } from "./components/LandingPage.js";
import { PageMetadata } from "./components/PageMetadata.js";
import { loadProductRoutes } from "./routeLoaders.js";
import { getStoredAuthStatus } from "./uu/loginStateStore.js";
import "./styles/index.css";

const ProductRoutes = lazy(loadProductRoutes);

interface AppProps {
  initialLandingLoggedIn?: boolean;
}

export default function App({ initialLandingLoggedIn }: AppProps = {}) {
  return (
    <BrowserRouter>
      <AppContent initialLandingLoggedIn={initialLandingLoggedIn} />
    </BrowserRouter>
  );
}

export function AppContent({ initialLandingLoggedIn }: AppProps) {
  return (
    <>
      <PageMetadata />
      <RootRoutes initialLandingLoggedIn={initialLandingLoggedIn} />
    </>
  );
}

function RootRoutes({ initialLandingLoggedIn }: AppProps) {
  const location = useLocation();
  const [landingLoggedIn, setLandingLoggedIn] = useState(
    () => initialLandingLoggedIn ?? getStoredAuthStatus().hasState,
  );

  useEffect(() => {
    if (location.pathname === "/") setLandingLoggedIn(getStoredAuthStatus().hasState);
  }, [location.pathname]);

  if (location.pathname === "/") {
    return <LandingPage loggedIn={landingLoggedIn} />;
  }

  return (
    <Suspense
      fallback={
        <main className="product-shell">
          <p className="empty-text">正在加载页面...</p>
        </main>
      }
    >
      <ProductRoutes />
    </Suspense>
  );
}
