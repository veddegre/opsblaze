/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from "vitest";
import "@testing-library/jest-dom/vitest";
import { render, screen } from "@testing-library/react";
import React from "react";
import type { Message } from "../../types";

vi.mock("react-markdown", () => ({
  default: ({ children }: { children: string }) => <div data-testid="markdown">{children}</div>,
}));
vi.mock("rehype-raw", () => ({ default: () => {} }));
vi.mock("rehype-sanitize", () => ({
  default: () => {},
  defaultSchema: { tagNames: [], attributes: {} },
}));
vi.mock("marked", () => ({
  marked: { parseInline: (text: string) => text },
}));
vi.mock("../SplunkChart", () => ({
  SplunkChart: () => <div data-testid="splunk-chart" />,
}));

import { MessageBubble } from "../MessageBubble";

function makeAssistantMessage(blocks: Message["blocks"]): Message {
  return { id: "msg-1", role: "assistant", blocks };
}

describe("MessageBubble: LimitBlock rendering", () => {
  it('renders a LimitBlock with reason "max_turns"', () => {
    const msg = makeAssistantMessage([
      {
        type: "limit",
        reason: "max_turns",
        message: "This investigation reached the 30-turn limit.",
        setting: "Max Turns",
      },
    ]);

    render(<MessageBubble message={msg} />);

    expect(screen.getByText("This investigation reached the 30-turn limit.")).toBeInTheDocument();
    expect(screen.getByText(/Settings > General > Max Turns/)).toBeInTheDocument();
  });

  it('renders a LimitBlock with reason "stream_timeout"', () => {
    const msg = makeAssistantMessage([
      {
        type: "limit",
        reason: "stream_timeout",
        message: "This investigation timed out after 5 minutes.",
        setting: "Timeout",
      },
    ]);

    render(<MessageBubble message={msg} />);

    expect(screen.getByText("This investigation timed out after 5 minutes.")).toBeInTheDocument();
    expect(screen.getByText(/Settings > General > Timeout/)).toBeInTheDocument();
  });

  it("does not render limit notice styling for regular TextBlocks", () => {
    const msg = makeAssistantMessage([{ type: "text", content: "Normal analysis text." }]);

    render(<MessageBubble message={msg} />);

    expect(screen.getByText("Normal analysis text.")).toBeInTheDocument();
    expect(screen.queryByText(/Settings > General/)).not.toBeInTheDocument();
  });

  it("limit block appears after text blocks in the message", () => {
    const msg = makeAssistantMessage([
      { type: "text", content: "Analysis results here." },
      { type: "limit", reason: "max_turns", message: "Reached the limit.", setting: "Max Turns" },
    ]);

    const { container } = render(<MessageBubble message={msg} />);

    const children = Array.from(container.querySelector(".max-w-full")?.children ?? []);
    expect(children.length).toBeGreaterThanOrEqual(2);

    const textIdx = children.findIndex((el) => el.textContent?.includes("Analysis results here."));
    const limitIdx = children.findIndex((el) => el.textContent?.includes("Reached the limit."));

    expect(textIdx).toBeGreaterThanOrEqual(0);
    expect(limitIdx).toBeGreaterThan(textIdx);
  });
});
