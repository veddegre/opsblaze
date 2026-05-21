import { describe, it, expect } from "vitest";
import { parseOpenWebUiModelsResponse } from "../openwebui-models.js";

describe("parseOpenWebUiModelsResponse", () => {
  it("parses OpenAI-style data array", () => {
    const models = parseOpenWebUiModelsResponse({
      data: [
        { id: "llama3.1", object: "model" },
        { id: "gemma4:31b", name: "Gemma 4" },
      ],
    });
    expect(models).toEqual([
      { id: "gemma4:31b", label: "Gemma 4" },
      { id: "llama3.1", label: "llama3.1" },
    ]);
  });

  it("parses items array (Open WebUI v1 style)", () => {
    const models = parseOpenWebUiModelsResponse({
      items: [
        { id: "custom-model", name: "Custom", is_active: true },
        { id: "other", name: "Other" },
      ],
      total: 2,
    });
    expect(models.map((m) => m.id)).toEqual(["custom-model", "other"]);
  });

  it("parses Ollama-style models array", () => {
    const models = parseOpenWebUiModelsResponse({
      models: [{ name: "mistral:latest", model: "mistral:latest" }],
    });
    expect(models[0].id).toBe("mistral:latest");
  });

  it("deduplicates by id", () => {
    const models = parseOpenWebUiModelsResponse({
      data: [{ id: "a" }, { id: "a" }],
    });
    expect(models).toHaveLength(1);
  });

  it("returns empty for unknown shape", () => {
    expect(parseOpenWebUiModelsResponse({ ok: true })).toEqual([]);
  });
});
