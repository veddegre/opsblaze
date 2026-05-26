import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mkdtemp, rm, mkdir, writeFile } from "fs/promises";
import path from "path";
import os from "os";
import { DEFAULT_SKILL_PACKS, validateSkillPacks } from "../skill-packs.js";

describe("validateSkillPacks", () => {
  it("rejects duplicate pack ids", () => {
    expect(() =>
      validateSkillPacks([
        { id: "a", name: "A", skills: ["splunk-analyst"] },
        { id: "a", name: "B", skills: ["splunk-analyst"] },
      ])
    ).toThrow(/Duplicate/);
  });

  it("accepts valid packs", () => {
    const packs = validateSkillPacks([
      { id: "login", name: "Login activity", skills: ["splunk-analyst"], strict: true },
    ]);
    expect(packs).toHaveLength(1);
  });
});

describe("getSkillPacks", () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await mkdtemp(path.join(os.tmpdir(), "opsblaze-packs-"));
    const skillsDir = path.join(tmpDir, ".claude", "skills");
    await mkdir(skillsDir, { recursive: true });
    for (const name of ["investigating-splunk-login-activity", "splunk-analyst"]) {
      await mkdir(path.join(skillsDir, name), { recursive: true });
      await writeFile(
        path.join(skillsDir, name, "SKILL.md"),
        "---\ndescription: test\n---\n# Test",
        "utf-8"
      );
    }
    vi.stubEnv("HOME", tmpDir);
  });

  afterEach(async () => {
    vi.unstubAllEnvs();
    await rm(tmpDir, { recursive: true, force: true });
    vi.resetModules();
  });

  it("filters defaults to enabled skills only", async () => {
    const origCwd = process.cwd;
    process.cwd = () => tmpDir;
    vi.resetModules();
    const mod = await import("../skill-packs.js");
    process.cwd = origCwd;

    const packs = await mod.getSkillPacks(null);
    expect(packs.length).toBeGreaterThan(0);
    for (const pack of packs) {
      expect(pack.skills.length).toBeGreaterThan(0);
    }
    const login = packs.find((p) => p.id === "splunk-login-activity");
    expect(login?.skills).toContain("investigating-splunk-login-activity");
  });

  it("ships built-in default pack ids", () => {
    expect(DEFAULT_SKILL_PACKS.some((p) => p.id === "splunk-login-activity")).toBe(true);
    expect(DEFAULT_SKILL_PACKS.some((p) => p.id === "okta-authentication")).toBe(false);
  });
});
