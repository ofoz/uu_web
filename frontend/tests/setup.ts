import "@testing-library/jest-dom/vitest";
import { vi } from "vitest";

// 生产代码对登出/返回设备等危险操作加入了 window.confirm 二次确认；
// jsdom 未实现 confirm，测试默认放行（happy-path）。需要验证“取消”路径时可在用例内覆盖。
if (typeof window !== "undefined") {
  window.confirm = vi.fn(() => true);

  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    value: vi.fn((query: string) => ({
      matches: query.includes("prefers-reduced-motion"),
      media: query,
      onchange: null,
      addEventListener: vi.fn(),
      addListener: vi.fn(),
      dispatchEvent: vi.fn(),
      removeEventListener: vi.fn(),
      removeListener: vi.fn(),
    })),
    writable: true,
  });
}
