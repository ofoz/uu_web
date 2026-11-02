import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { DebugEventList } from "../src/components/DebugEventList.js";
import type { BrowserRemoteDebugEvent } from "../src/remote/browserRemoteSessionTypes.js";

describe("DebugEventList", () => {
  it("shows every retained diagnostic event with the newest event first", () => {
    const events: BrowserRemoteDebugEvent[] = Array.from({ length: 20 }, (_, index) => ({
      id: index + 1,
      atMs: index * 1000,
      kind: "session",
      summary: `调试事件 ${index + 1}`,
    }));

    render(<DebugEventList events={events} />);

    const items = screen.getAllByRole("listitem");
    expect(items).toHaveLength(20);
    expect(items[0]).toHaveTextContent("调试事件 20");
    expect(items.at(-1)).toHaveTextContent("调试事件 1");
  });
});
