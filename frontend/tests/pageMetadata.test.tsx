import { cleanup, render, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { MemoryRouter } from "react-router";

import { PageMetadata } from "../src/components/PageMetadata.js";

describe("PageMetadata", () => {
  afterEach(() => {
    cleanup();
    document.title = "";
    document.head.querySelectorAll("meta, link[rel='canonical']").forEach((element) => element.remove());
  });

  it("makes the landing page canonical and indexable", async () => {
    render(
      <MemoryRouter initialEntries={["/"]}>
        <PageMetadata />
      </MemoryRouter>,
    );

    await waitFor(() => expect(document.title).toBe("UU 远程桌面网页版（Web 版）- UU Remote Web"));
    expect(document.head.querySelector('meta[name="keywords"]')).toHaveAttribute(
      "content",
      expect.stringContaining("UU 远程桌面 Web 版"),
    );
    expect(document.head.querySelector('meta[name="robots"]')).toHaveAttribute(
      "content",
      "index, follow, max-image-preview:large",
    );
    expect(document.head.querySelector('meta[name="theme-color"]')).toHaveAttribute("content", "#fafafa");
    expect(document.head.querySelector('link[rel="canonical"]')).toHaveAttribute("href", "https://uurc.678234.xyz/");
    expect(document.head.querySelector('meta[property="og:url"]')).toHaveAttribute(
      "content",
      "https://uurc.678234.xyz/",
    );
  });

  it("keeps account and remote-control routes out of the index", async () => {
    render(
      <MemoryRouter initialEntries={["/devices/device-1/control"]}>
        <PageMetadata />
      </MemoryRouter>,
    );

    await waitFor(() => expect(document.title).toBe("远程控制 | UU Remote Web"));
    expect(document.head.querySelector('meta[name="robots"]')).toHaveAttribute(
      "content",
      "noindex, nofollow, noarchive",
    );
    expect(document.head.querySelector('link[rel="canonical"]')).toHaveAttribute(
      "href",
      "https://uurc.678234.xyz/devices/device-1/control",
    );
  });
});
