import { describe, it, expect, vi, beforeEach } from "vitest";
import { streamChat, type SSECallbacks } from "../sse.js";

function mockFetchResponse(chunks: string[]): Response {
  const encoder = new TextEncoder();
  let idx = 0;
  const stream = new ReadableStream<Uint8Array>({
    pull(controller) {
      if (idx < chunks.length) {
        controller.enqueue(encoder.encode(chunks[idx]));
        idx++;
      } else {
        controller.close();
      }
    },
  });

  return {
    ok: true,
    status: 200,
    body: stream,
    text: async () => "",
  } as unknown as Response;
}

function makeCallbacks(overrides: Partial<SSECallbacks> = {}): SSECallbacks {
  return {
    onText: vi.fn(),
    onActivity: vi.fn(),
    onThreatIntel: vi.fn(),
    onChart: vi.fn(),
    onSkill: vi.fn(),
    onUsage: vi.fn(),
    onContext: vi.fn(),
    onError: vi.fn(),
    onLimit: vi.fn(),
    onDone: vi.fn(),
    ...overrides,
  };
}

describe("streamChat SSE parser", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("parses text events", async () => {
    const chunks = [
      'event: text\ndata: {"content":"Hello "}\n\n',
      'event: text\ndata: {"content":"world"}\n\n',
      "event: done\ndata: {}\n\n",
    ];

    vi.stubGlobal("fetch", async () => mockFetchResponse(chunks));

    const texts: string[] = [];
    const cb = makeCallbacks({ onText: (t) => texts.push(t) });

    await streamChat("hi", cb);
    expect(texts).toEqual(["Hello ", "world"]);
    expect(cb.onDone).toHaveBeenCalled();
  });

  it("parses chart events", async () => {
    const chartData = {
      vizType: "bar",
      dataSources: { primary: { data: { fields: [], columns: [] } } },
      width: 800,
      height: 400,
    };

    const chunks = [
      `event: chart\ndata: ${JSON.stringify(chartData)}\n\n`,
      "event: done\ndata: {}\n\n",
    ];

    vi.stubGlobal("fetch", async () => mockFetchResponse(chunks));

    const charts: unknown[] = [];
    const cb = makeCallbacks({ onChart: (d) => charts.push(d) });

    await streamChat("q", cb);
    expect(charts).toHaveLength(1);
    expect(charts[0]).toEqual(chartData);
  });

  it("parses activity events", async () => {
    const activities: Array<{ id: string; label: string; status: string }> = [];
    const cb = makeCallbacks({
      onActivity: (data) => activities.push(data),
    });

    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      mockFetchResponse([
        'event: activity\ndata: {"id":"mcp","label":"Connecting…","status":"active"}\n\n',
        'event: activity\ndata: {"id":"mcp","label":"Ready","status":"done"}\n\n',
        "event: done\ndata: {}\n\n",
      ])
    );

    await streamChat("q", cb);

    expect(activities).toEqual([
      { id: "mcp", label: "Connecting…", status: "active" },
      { id: "mcp", label: "Ready", status: "done" },
    ]);
  });

  it("parses skill events", async () => {
    const chunks = [
      'event: skill\ndata: {"skill":"splunk-analyst"}\n\n',
      "event: done\ndata: {}\n\n",
    ];

    vi.stubGlobal("fetch", async () => mockFetchResponse(chunks));

    const skills: string[] = [];
    const cb = makeCallbacks({ onSkill: (s) => skills.push(s) });

    await streamChat("q", cb);
    expect(skills).toEqual(["splunk-analyst"]);
  });

  it("parses error events", async () => {
    const chunks = [
      'event: error\ndata: {"message":"Something broke"}\n\n',
      "event: done\ndata: {}\n\n",
    ];

    vi.stubGlobal("fetch", async () => mockFetchResponse(chunks));

    const errors: string[] = [];
    const cb = makeCallbacks({ onError: (m) => errors.push(m) });

    await streamChat("q", cb);
    expect(errors).toEqual(["Something broke"]);
  });

  it("handles split chunks across read boundaries", async () => {
    const chunks = ['event: text\ndata: {"con', 'tent":"split"}\n\nevent: done\ndata: {}\n\n'];

    vi.stubGlobal("fetch", async () => mockFetchResponse(chunks));

    const texts: string[] = [];
    const cb = makeCallbacks({ onText: (t) => texts.push(t) });

    await streamChat("q", cb);
    expect(texts).toEqual(["split"]);
  });

  it("skips malformed JSON data gracefully", async () => {
    const chunks = [
      "event: text\ndata: {invalid json}\n\n",
      'event: text\ndata: {"content":"valid"}\n\n',
      "event: done\ndata: {}\n\n",
    ];

    vi.stubGlobal("fetch", async () => mockFetchResponse(chunks));

    const texts: string[] = [];
    const cb = makeCallbacks({ onText: (t) => texts.push(t) });

    await streamChat("q", cb);
    expect(texts).toEqual(["valid"]);
  });

  it("stops processing on done event", async () => {
    const chunks = [
      'event: text\ndata: {"content":"before"}\n\n',
      "event: done\ndata: {}\n\n",
      'event: text\ndata: {"content":"after"}\n\n',
    ];

    vi.stubGlobal("fetch", async () => mockFetchResponse(chunks));

    const texts: string[] = [];
    const cb = makeCallbacks({ onText: (t) => texts.push(t) });

    await streamChat("q", cb);
    expect(texts).toEqual(["before"]);
  });

  it("handles empty content gracefully", async () => {
    const chunks = ["event: text\ndata: {}\n\n", "event: done\ndata: {}\n\n"];

    vi.stubGlobal("fetch", async () => mockFetchResponse(chunks));

    const texts: string[] = [];
    const cb = makeCallbacks({ onText: (t) => texts.push(t) });

    await streamChat("q", cb);
    expect(texts).toEqual([""]);
  });

  it("throws on non-ok HTTP response", async () => {
    vi.stubGlobal(
      "fetch",
      async () =>
        ({
          ok: false,
          status: 500,
          text: async () => "Internal Server Error",
        }) as unknown as Response
    );

    const cb = makeCallbacks();
    await expect(streamChat("q", cb)).rejects.toThrow("Server error (500)");
  });

  it("throws when response body is missing", async () => {
    vi.stubGlobal(
      "fetch",
      async () =>
        ({
          ok: true,
          status: 200,
          body: null,
          text: async () => "",
        }) as unknown as Response
    );

    const cb = makeCallbacks();
    await expect(streamChat("q", cb)).rejects.toThrow("No response body");
  });

  it("includes conversationId when provided", async () => {
    const chunks = ["event: done\ndata: {}\n\n"];
    let capturedBody: Record<string, unknown> = {};

    vi.stubGlobal("fetch", async (_url: string, init: RequestInit) => {
      capturedBody = JSON.parse(init.body as string);
      return mockFetchResponse(chunks);
    });

    const cb = makeCallbacks();
    await streamChat("q", cb, undefined, undefined, undefined, "conv-abc-123");

    expect(capturedBody.conversationId).toBe("conv-abc-123");
    expect(capturedBody).not.toHaveProperty("history");
  });

  it("includes skills in request body when provided", async () => {
    const chunks = ["event: done\ndata: {}\n\n"];
    let capturedBody: Record<string, unknown> = {};

    vi.stubGlobal("fetch", async (_url: string, init: RequestInit) => {
      capturedBody = JSON.parse(init.body as string);
      return mockFetchResponse(chunks);
    });

    const cb = makeCallbacks();
    await streamChat("q", cb, undefined, ["splunk-analyst", "splunk-login-activity-investigation"]);

    expect(capturedBody.skills).toEqual(["splunk-analyst", "splunk-login-activity-investigation"]);
    expect(capturedBody.message).toBe("q");
  });

  it("omits skills from request body when not provided", async () => {
    const chunks = ["event: done\ndata: {}\n\n"];
    let capturedBody: Record<string, unknown> = {};

    vi.stubGlobal("fetch", async (_url: string, init: RequestInit) => {
      capturedBody = JSON.parse(init.body as string);
      return mockFetchResponse(chunks);
    });

    const cb = makeCallbacks();
    await streamChat("q", cb);

    expect(capturedBody).not.toHaveProperty("skills");
  });

  it("omits skills when explicitly passed as undefined (advisory mode path)", async () => {
    const chunks = ["event: done\ndata: {}\n\n"];
    let capturedBody: Record<string, unknown> = {};

    vi.stubGlobal("fetch", async (_url: string, init: RequestInit) => {
      capturedBody = JSON.parse(init.body as string);
      return mockFetchResponse(chunks);
    });

    const cb = makeCallbacks();
    await streamChat("q", cb, undefined, undefined);

    expect(capturedBody).not.toHaveProperty("skills");
    expect(capturedBody.message).toBe("q");
  });

  it("includes skills in strict mode path", async () => {
    const chunks = ["event: done\ndata: {}\n\n"];
    let capturedBody: Record<string, unknown> = {};

    vi.stubGlobal("fetch", async (_url: string, init: RequestInit) => {
      capturedBody = JSON.parse(init.body as string);
      return mockFetchResponse(chunks);
    });

    const cb = makeCallbacks();
    await streamChat("q", cb, undefined, ["skill-a", "skill-b"], true);

    expect(capturedBody.skills).toEqual(["skill-a", "skill-b"]);
    expect(capturedBody.skillsStrict).toBe(true);
    expect(capturedBody.message).toBe("q");
  });

  it("sends skillsStrict false for prefer-all-skills mode", async () => {
    const chunks = ["event: done\ndata: {}\n\n"];
    let capturedBody: Record<string, unknown> = {};

    vi.stubGlobal("fetch", async (_url: string, init: RequestInit) => {
      capturedBody = JSON.parse(init.body as string);
      return mockFetchResponse(chunks);
    });

    const cb = makeCallbacks();
    await streamChat("q", cb, undefined, ["skill-a"], false);

    expect(capturedBody.skills).toEqual(["skill-a"]);
    expect(capturedBody.skillsStrict).toBe(false);
  });

  it("omits skills from request body when array is empty", async () => {
    const chunks = ["event: done\ndata: {}\n\n"];
    let capturedBody: Record<string, unknown> = {};

    vi.stubGlobal("fetch", async (_url: string, init: RequestInit) => {
      capturedBody = JSON.parse(init.body as string);
      return mockFetchResponse(chunks);
    });

    const cb = makeCallbacks();
    await streamChat("q", cb, undefined, []);

    expect(capturedBody).not.toHaveProperty("skills");
  });

  describe("limit events", () => {
    it("parses limit events and calls onLimit with correct payload", async () => {
      const limitData = {
        reason: "max_turns",
        message: "This investigation reached the 30-turn limit.",
        setting: "Max Turns",
      };
      const chunks = [
        `event: limit\ndata: ${JSON.stringify(limitData)}\n\n`,
        "event: done\ndata: {}\n\n",
      ];

      vi.stubGlobal("fetch", async () => mockFetchResponse(chunks));

      const limits: Array<{ reason: string; message: string; setting: string }> = [];
      const cb = makeCallbacks({ onLimit: (d) => limits.push(d) });

      await streamChat("q", cb);
      expect(limits).toHaveLength(1);
      expect(limits[0]).toEqual(limitData);
    });

    it("handles limit event before done correctly (both fire in order)", async () => {
      const chunks = [
        'event: text\ndata: {"content":"Analysis"}\n\n',
        'event: limit\ndata: {"reason":"stream_timeout","message":"Timed out after 5 minutes.","setting":"Timeout"}\n\n',
        "event: done\ndata: {}\n\n",
      ];

      vi.stubGlobal("fetch", async () => mockFetchResponse(chunks));

      const order: string[] = [];
      const cb = makeCallbacks({
        onText: () => order.push("text"),
        onLimit: () => order.push("limit"),
        onDone: () => order.push("done"),
      });

      await streamChat("q", cb);
      expect(order).toEqual(["text", "limit", "done"]);
    });

    it("handles limit event with partial/split chunks across read boundaries", async () => {
      const json = JSON.stringify({
        reason: "max_turns",
        message: "Hit the 30-turn limit.",
        setting: "Max Turns",
      });
      const mid = Math.floor(json.length / 2);
      const chunks = [
        `event: limit\ndata: ${json.slice(0, mid)}`,
        `${json.slice(mid)}\n\n`,
        "event: done\ndata: {}\n\n",
      ];

      vi.stubGlobal("fetch", async () => mockFetchResponse(chunks));

      const limits: Array<{ reason: string; message: string; setting: string }> = [];
      const cb = makeCallbacks({ onLimit: (d) => limits.push(d) });

      await streamChat("q", cb);
      expect(limits).toHaveLength(1);
      expect(limits[0].reason).toBe("max_turns");
      expect(limits[0].setting).toBe("Max Turns");
    });
  });
});
