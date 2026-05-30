import { describe, it, expect } from "vitest";
import { formatJsonParseError, lineColAtOffset } from "../json-syntax-error.js";

describe("lineColAtOffset", () => {
  it("counts line and column for multiline source", () => {
    const src = '{\n  "a": 1\n}';
    expect(lineColAtOffset(src, 0)).toEqual({ line: 1, column: 1 });
    expect(lineColAtOffset(src, 5)).toEqual({ line: 2, column: 4 });
  });
});

describe("formatJsonParseError", () => {
  it("includes line, column, and caret for a missing comma", () => {
    const raw = `{
  "users": [
    {
      "username": "a"
      "passwordHash": "x"
    }
  ]
}`;
    let err: unknown;
    try {
      JSON.parse(raw);
    } catch (e) {
      err = e;
    }
    const msg = formatJsonParseError(raw, err, "./data/local-auth.json");
    expect(msg).toContain("./data/local-auth.json");
    expect(msg).toMatch(/line 5/i);
    expect(msg).toContain('"passwordHash"');
    expect(msg).toContain("^");
  });
});
