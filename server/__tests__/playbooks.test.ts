import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mkdtemp, rm } from "fs/promises";
import path from "path";
import os from "os";

let tmpDir: string;

beforeEach(async () => {
  tmpDir = await mkdtemp(path.join(os.tmpdir(), "opsblaze-playbooks-"));
  vi.stubEnv("OPSBLAZE_DATA_DIR", path.join(tmpDir, "conversations"));
});

afterEach(async () => {
  vi.unstubAllEnvs();
  await rm(tmpDir, { recursive: true, force: true });
  vi.resetModules();
});

describe("playbooks", () => {
  it("creates and updates a playbook", async () => {
    const mod = await import("../playbooks.js");
    const created = await mod.createPlaybook({
      name: "Okta failures",
      prompt: "Check login failures",
      skills: ["splunk-analyst"],
      strict: true,
    });
    expect(created.id).toBeTruthy();
    expect(created.name).toBe("Okta failures");

    const updated = await mod.updatePlaybook(created.id, {
      name: "Okta failures (24h)",
      prompt: "Check login failures in the last 24 hours",
      skills: ["investigating-okta-events"],
      strict: false,
    });
    expect(updated?.name).toBe("Okta failures (24h)");
    expect(updated?.strict).toBe(false);
    expect(updated?.skills).toEqual(["investigating-okta-events"]);

    const list = await mod.listPlaybooks();
    expect(list).toHaveLength(1);
    expect(list[0].prompt).toContain("24 hours");
  });
});
