import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  normalizeOpenWebUiBaseUrl,
  getLlmProvider,
  isOpenWebUiMode,
  getOpenWebUiConfig,
  resolveOpenWebUiChatApiBase,
  resetOpenWebUiChatApiCache,
  getChatApiPrefixFromEnv,
} from "../llm-config.js";

describe("normalizeOpenWebUiBaseUrl", () => {
  it("strips trailing slashes", () => {
    expect(normalizeOpenWebUiBaseUrl("https://openwebui.example.com/")).toBe(
      "https://openwebui.example.com"
    );
  });

  it("strips /api suffix", () => {
    expect(normalizeOpenWebUiBaseUrl("https://openwebui.example.com/api/")).toBe(
      "https://openwebui.example.com"
    );
  });
});

describe("getLlmProvider", () => {
  beforeEach(() => {
    vi.stubEnv("OPENWEBUI_BASE_URL", "");
    vi.stubEnv("OPENWEBUI_API_KEY", "");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("returns claude when Open WebUI URL is unset", () => {
    expect(getLlmProvider()).toBe("claude");
    expect(isOpenWebUiMode()).toBe(false);
  });

  it("returns openwebui when base URL is set", () => {
    vi.stubEnv("OPENWEBUI_BASE_URL", "https://openwebui.example.edu");
    expect(getLlmProvider()).toBe("openwebui");
    expect(isOpenWebUiMode()).toBe(true);
  });
});

describe("getOpenWebUiConfig", () => {
  beforeEach(() => {
    vi.stubEnv("OPENWEBUI_BASE_URL", "https://openwebui.example.edu/");
    vi.stubEnv("OPENWEBUI_API_KEY", "test-key");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("returns api base and key", () => {
    const config = getOpenWebUiConfig();
    expect(config).toEqual({
      baseUrl: "https://openwebui.example.edu",
      apiBase: "https://openwebui.example.edu/api",
      apiKey: "test-key",
    });
  });

  it("throws when API key is missing", () => {
    vi.stubEnv("OPENWEBUI_API_KEY", "");
    expect(() => getOpenWebUiConfig()).toThrow(/OPENWEBUI_API_KEY/);
  });
});

describe("resolveOpenWebUiChatApiBase", () => {
  const config = {
    baseUrl: "https://openwebui.example.edu",
    apiBase: "https://openwebui.example.edu/api",
    apiKey: "test-key",
  };

  beforeEach(() => {
    resetOpenWebUiChatApiCache();
    vi.stubEnv("OPENWEBUI_CHAT_API_PREFIX", "");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    resetOpenWebUiChatApiCache();
  });

  it("uses OPENWEBUI_CHAT_API_PREFIX when set", async () => {
    vi.stubEnv("OPENWEBUI_CHAT_API_PREFIX", "ollama/v1");
    const base = await resolveOpenWebUiChatApiBase(config);
    expect(base).toBe("https://openwebui.example.edu/ollama/v1");
    expect(getChatApiPrefixFromEnv()).toBe("ollama/v1");
  });

  it("probes candidates and caches the first working prefix", async () => {
    const mockFetch = vi.fn(async (url: string) => {
      if (url.endsWith("/ollama/v1/chat/completions")) {
        return { ok: true, status: 200 };
      }
      return { ok: false, status: 404 };
    });
    const base = await resolveOpenWebUiChatApiBase(config, {
      _fetch: mockFetch as unknown as typeof fetch,
    });
    expect(base).toBe("https://openwebui.example.edu/ollama/v1");
    const base2 = await resolveOpenWebUiChatApiBase(config, {
      _fetch: mockFetch as unknown as typeof fetch,
    });
    expect(base2).toBe(base);
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });
});
