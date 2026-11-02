import { describe, expect, it } from "vitest";

import { getFrontendRobotsHeader, getStaticCacheControl } from "../src/app.js";

describe("static asset cache policy", () => {
  it("keeps hashed assets immutable and the SPA shell revalidating", () => {
    expect(getStaticCacheControl("/app/frontend/dist/assets/index-Bz19xK8p.js")).toBe(
      "public, max-age=31536000, immutable",
    );
    expect(getStaticCacheControl("/app/frontend/dist/index.html")).toBe("no-cache");
    expect(getStaticCacheControl("/app/frontend/dist/app.html")).toBe("no-cache");
    expect(getStaticCacheControl("/app/frontend/dist/404.html")).toBe("no-cache");
    expect(getStaticCacheControl("/app/frontend/dist/favicon.svg")).toBeUndefined();
  });

  it("keeps private app routes out of search results", () => {
    expect(getFrontendRobotsHeader("/")).toBeUndefined();
    expect(getFrontendRobotsHeader("/product/social-preview.png")).toBeUndefined();
    expect(getFrontendRobotsHeader("/login")).toBe("noindex, nofollow, noarchive");
    expect(getFrontendRobotsHeader("/devices")).toBe("noindex, nofollow, noarchive");
    expect(getFrontendRobotsHeader("/devices/device-1/control")).toBe("noindex, nofollow, noarchive");
    expect(getFrontendRobotsHeader("/app")).toBe("noindex, nofollow, noarchive");
    expect(getFrontendRobotsHeader("/app.html")).toBe("noindex, nofollow, noarchive");
    expect(getFrontendRobotsHeader("/partner")).toBe("noindex, nofollow, noarchive");
    expect(getFrontendRobotsHeader("/account")).toBe("noindex, nofollow, noarchive");
  });
});
