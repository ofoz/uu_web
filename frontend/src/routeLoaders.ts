type ProductRoutesModule = { default: (typeof import("./components/ProductRoutes.js"))["ProductRoutes"] };
type RemoteControlRouteModule = {
  default: (typeof import("./components/RemoteControlRoute.js"))["RemoteControlRoute"];
};

let productRoutesPromise: Promise<ProductRoutesModule> | undefined;
let remoteControlRoutePromise: Promise<RemoteControlRouteModule> | undefined;

export function loadProductRoutes(): Promise<ProductRoutesModule> {
  productRoutesPromise ??= import("./components/ProductRoutes.js").then((module) => ({
    default: module.ProductRoutes,
  }));
  return productRoutesPromise;
}

export function preloadProductRoutes(): void {
  const promise = loadProductRoutes();
  void promise.catch(() => {
    if (productRoutesPromise === promise) productRoutesPromise = undefined;
  });
}

export function loadRemoteControlRoute(): Promise<RemoteControlRouteModule> {
  remoteControlRoutePromise ??= import("./components/RemoteControlRoute.js").then((module) => ({
    default: module.RemoteControlRoute,
  }));
  return remoteControlRoutePromise;
}

export function preloadRemoteControlRoute(): void {
  const promise = loadRemoteControlRoute();
  void promise.catch(() => {
    if (remoteControlRoutePromise === promise) remoteControlRoutePromise = undefined;
  });
}
