/**
 * @vitest-environment jsdom
 */
import { describe, it, expect } from "vitest";
import "@testing-library/jest-dom/vitest";
import { render, screen } from "@testing-library/react";
import React from "react";
import { UsageBar } from "../UsageBar";
import type { UsageData, ContextData } from "../../lib/sse";

function makeUsage(overrides: Partial<UsageData> = {}): UsageData {
  return {
    inputTokens: 1500,
    outputTokens: 800,
    cacheReadTokens: 0,
    cacheCreationTokens: 0,
    totalCostUsd: 0.042,
    modelUsage: {},
    ...overrides,
  };
}

function makeContext(overrides: Partial<ContextData> = {}): ContextData {
  return {
    totalTokens: 45000,
    maxTokens: 200000,
    percentage: 22.5,
    categories: {},
    ...overrides,
  };
}

describe("UsageBar", () => {
  it("returns null when both props are null", () => {
    const { container } = render(<UsageBar queryUsage={null} contextUsage={null} />);
    expect(container.firstChild).toBeNull();
  });

  describe("token formatting", () => {
    it("formats small numbers as-is", () => {
      render(<UsageBar queryUsage={makeUsage({ inputTokens: 42 })} contextUsage={null} />);
      expect(screen.getByTitle("Input tokens")).toHaveTextContent("42");
    });

    it("formats thousands with k suffix", () => {
      render(<UsageBar queryUsage={makeUsage({ inputTokens: 1500 })} contextUsage={null} />);
      expect(screen.getByTitle("Input tokens")).toHaveTextContent("1.5k");
    });

    it("formats millions with M suffix", () => {
      render(<UsageBar queryUsage={makeUsage({ inputTokens: 2_500_000 })} contextUsage={null} />);
      expect(screen.getByTitle("Input tokens")).toHaveTextContent("2.5M");
    });

    it("shows output tokens", () => {
      render(<UsageBar queryUsage={makeUsage({ outputTokens: 3200 })} contextUsage={null} />);
      expect(screen.getByTitle("Output tokens")).toHaveTextContent("3.2k");
    });
  });

  describe("cost formatting", () => {
    it("shows 4 decimal places for costs under $0.01", () => {
      render(<UsageBar queryUsage={makeUsage({ totalCostUsd: 0.0035 })} contextUsage={null} />);
      expect(screen.getByTitle("Query cost")).toHaveTextContent("$0.0035");
    });

    it("shows 2 decimal places for costs >= $0.01", () => {
      render(<UsageBar queryUsage={makeUsage({ totalCostUsd: 1.5 })} contextUsage={null} />);
      expect(screen.getByTitle("Query cost")).toHaveTextContent("$1.50");
    });
  });

  describe("cache tokens", () => {
    it("hides cache section when both cache values are zero", () => {
      render(
        <UsageBar
          queryUsage={makeUsage({ cacheReadTokens: 0, cacheCreationTokens: 0 })}
          contextUsage={null}
        />
      );
      expect(screen.queryByTitle("Cache tokens (read / created)")).not.toBeInTheDocument();
    });

    it("shows cache read tokens when non-zero", () => {
      render(<UsageBar queryUsage={makeUsage({ cacheReadTokens: 5000 })} contextUsage={null} />);
      const el = screen.getByTitle("Cache tokens (read / created)");
      expect(el).toHaveTextContent("5.0k");
      expect(el).toHaveTextContent("r");
    });

    it("shows both read and write cache tokens", () => {
      render(
        <UsageBar
          queryUsage={makeUsage({ cacheReadTokens: 5000, cacheCreationTokens: 1200 })}
          contextUsage={null}
        />
      );
      const el = screen.getByTitle("Cache tokens (read / created)");
      expect(el).toHaveTextContent("5.0k");
      expect(el).toHaveTextContent("1.2k");
    });
  });

  describe("context bar", () => {
    it("renders context percentage and progress bar", () => {
      render(<UsageBar queryUsage={null} contextUsage={makeContext({ percentage: 45 })} />);
      expect(screen.getByText("ctx")).toBeInTheDocument();
      expect(screen.getByText("45%")).toBeInTheDocument();
    });

    it("hides context when maxTokens is 0", () => {
      render(<UsageBar queryUsage={null} contextUsage={makeContext({ maxTokens: 0 })} />);
      expect(screen.queryByText("ctx")).not.toBeInTheDocument();
    });

    it("caps progress bar width at 100%", () => {
      const { container } = render(
        <UsageBar queryUsage={null} contextUsage={makeContext({ percentage: 120 })} />
      );
      const bar = container.querySelector("[style]");
      expect(bar).toHaveStyle({ width: "100%" });
    });

    it("uses red color at >= 90%", () => {
      const { container } = render(
        <UsageBar queryUsage={null} contextUsage={makeContext({ percentage: 95 })} />
      );
      const bar = container.querySelector("[style]");
      expect(bar?.className).toContain("bg-red-500");
    });

    it("uses amber color at >= 70%", () => {
      const { container } = render(
        <UsageBar queryUsage={null} contextUsage={makeContext({ percentage: 75 })} />
      );
      const bar = container.querySelector("[style]");
      expect(bar?.className).toContain("bg-amber-500");
    });

    it("uses accent color below 70%", () => {
      const { container } = render(
        <UsageBar queryUsage={null} contextUsage={makeContext({ percentage: 30 })} />
      );
      const bar = container.querySelector("[style]");
      expect(bar?.className).toContain("bg-accent");
    });

    it("shows tooltip with token counts", () => {
      render(
        <UsageBar
          queryUsage={null}
          contextUsage={makeContext({ totalTokens: 45000, maxTokens: 200000 })}
        />
      );
      const el = screen.getByTitle("Context: 45.0k / 200.0k");
      expect(el).toBeInTheDocument();
    });
  });

  it("shows both usage and context simultaneously", () => {
    render(<UsageBar queryUsage={makeUsage()} contextUsage={makeContext()} />);
    expect(screen.getByTitle("Input tokens")).toBeInTheDocument();
    expect(screen.getByText("ctx")).toBeInTheDocument();
  });

  it("handles zero values gracefully (0 tokens, 0 cost)", () => {
    const zeroUsage = makeUsage({
      inputTokens: 0,
      outputTokens: 0,
      cacheReadTokens: 0,
      cacheCreationTokens: 0,
      totalCostUsd: 0,
    });
    const { container } = render(<UsageBar queryUsage={zeroUsage} contextUsage={null} />);
    expect(container.firstChild).not.toBeNull();
    expect(screen.getByTitle("Input tokens")).toHaveTextContent("0");
    expect(screen.getByTitle("Output tokens")).toHaveTextContent("0");
  });
});
