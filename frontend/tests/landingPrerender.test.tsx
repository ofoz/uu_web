import { describe, expect, it } from "vitest";

import { renderLandingPage } from "../src/entry-server.js";

describe("landing page prerender", () => {
  it("puts the public landing content and crawlable links in the server markup", () => {
    const markup = renderLandingPage();

    expect(markup).toContain("<h1");
    expect(markup).toContain("UU 远程桌面网页版");
    expect(markup).toContain("从登录到远控");
    expect(markup).toContain('href="/login"');
    expect(markup).not.toContain('href="/devices"');
    expect(markup).toContain('href="https://github.com/iola1999/uurc-web"');
    expect(markup).toContain('src="/product/device-list.png"');
  });
});
