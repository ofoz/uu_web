import { lazy, Suspense, useEffect, useState } from "react";
import { BrowserRouter, useLocation } from "react-router";

import { LandingPage } from "./components/LandingPage.js";
import { PageMetadata } from "./components/PageMetadata.js";
import { DesktopWindowDock } from "./desktop/DesktopWindowDock.js";
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
      {/*
        桌面壳的窗口按钮挂在根节点：首页、登录页、设备页、远控页都能用。

        必须排在路由内容**之后**：frameless 窗口的 `-webkit-app-region` 由 Blink
        按 DOM 顺序收集矩形（后来的覆盖先前的），停靠区写在前面时会被首页顶栏、
        侧栏这些 drag 区域覆盖回去，按钮就只剩好看、点不动（点击被当成拖窗口）。
      */}
      <DesktopWindowDock />
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
