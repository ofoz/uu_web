export const FRONTEND_APP_SHELL_PATH = "/app";
export const FRONTEND_APP_SHELL_FILE = "app.html";

const FRONTEND_APP_ROUTES = new Set(["/login", "/devices", "/partner", "/account"]);
const REMOTE_CONTROL_ROUTE = /^\/devices\/[^/]+\/control$/;

export function isFrontendAppRoute(pathname: string): boolean {
  const normalizedPath = pathname.length > 1 && pathname.endsWith("/") ? pathname.slice(0, -1) : pathname;
  return FRONTEND_APP_ROUTES.has(normalizedPath) || REMOTE_CONTROL_ROUTE.test(normalizedPath);
}
