import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { sanitizeUserId, LOCAL_USER_ID } from "../auth/types.js";
import { isPublicApiPath } from "../auth/middleware.js";
import { resolveIsAdmin, resolveAdminDetails, parseCsvEnvSet } from "../auth/roles.js";

describe("sanitizeUserId", () => {
  it("keeps safe characters", () => {
    expect(sanitizeUserId("abc-123._X")).toBe("abc-123._X");
  });

  it("replaces unsafe characters", () => {
    expect(sanitizeUserId("user@org/path")).toBe("user_org_path");
  });

  it("falls back to local for empty", () => {
    expect(sanitizeUserId("   ")).toBe(LOCAL_USER_ID);
  });
});

describe("isPublicApiPath", () => {
  it("allows health and auth routes", () => {
    expect(isPublicApiPath("/health")).toBe(true);
    expect(isPublicApiPath("/auth/login")).toBe(true);
    expect(isPublicApiPath("/auth/me")).toBe(true);
  });

  it("blocks protected routes", () => {
    expect(isPublicApiPath("/chat")).toBe(false);
    expect(isPublicApiPath("/conversations")).toBe(false);
  });
});

describe("resolveAdminDetails", () => {
  it("reports admin_email source", () => {
    const admins = parseCsvEnvSet("admin@example.edu");
    expect(
      resolveAdminDetails({
        adminEmails: admins,
        adminGroups: new Set(),
        allUsersAdmin: false,
        email: "Admin@Example.edu",
        groups: [],
      })
    ).toEqual({ isAdmin: true, source: "admin_email" });
  });

  it("reports admin_group with matched name", () => {
    expect(
      resolveAdminDetails({
        adminEmails: new Set(),
        adminGroups: parseCsvEnvSet("IT-Security"),
        allUsersAdmin: false,
        email: "user@example.edu",
        groups: ["IT-Security"],
      })
    ).toEqual({
      isAdmin: true,
      source: "admin_group",
      matchedAdminGroup: "IT-Security",
    });
  });

  it("reports admin_username source", () => {
    expect(
      resolveAdminDetails({
        adminEmails: new Set(),
        adminGroups: new Set(),
        adminUsernames: new Set(["admin"]),
        allUsersAdmin: false,
        username: "admin",
        groups: [],
      })
    ).toEqual({ isAdmin: true, source: "admin_username" });
  });

  it("reports all_users_admin", () => {
    expect(
      resolveAdminDetails({
        adminEmails: new Set(),
        adminGroups: new Set(),
        allUsersAdmin: true,
        email: "user@example.edu",
        groups: [],
      }).source
    ).toBe("all_users_admin");
  });
});

describe("resolveIsAdmin", () => {
  it("matches admin emails case-insensitively", () => {
    const admins = parseCsvEnvSet("admin@example.edu");
    expect(
      resolveIsAdmin({
        adminEmails: admins,
        adminGroups: new Set(),
        allUsersAdmin: false,
        email: "Admin@Example.edu",
        groups: [],
      })
    ).toBe(true);
    expect(
      resolveIsAdmin({
        adminEmails: admins,
        adminGroups: new Set(),
        allUsersAdmin: false,
        email: "user@example.edu",
        groups: [],
      })
    ).toBe(false);
  });
});

describe("conversation user isolation", () => {
  let tmpDir: string;
  let mod: typeof import("../conversations.js");

  beforeEach(async () => {
    const { mkdtemp, rm } = await import("fs/promises");
    const path = await import("path");
    const os = await import("os");
    tmpDir = await mkdtemp(path.join(os.tmpdir(), "opsblaze-auth-"));
    vi.stubEnv("OPSBLAZE_DATA_DIR", tmpDir);
    mod = await import("../conversations.js");
  });

  afterEach(async () => {
    vi.unstubAllEnvs();
    const { rm } = await import("fs/promises");
    await rm(tmpDir, { recursive: true, force: true });
    vi.resetModules();
  });

  it("does not expose another user's conversation", async () => {
    await mod.saveConversation("alice", {
      id: "secret-1",
      title: "Alice only",
      messages: [],
      createdAt: "2026-01-01T00:00:00Z",
      updatedAt: "2026-01-01T00:00:00Z",
    });

    expect(await mod.getConversation("bob", "secret-1")).toBeNull();
    expect(await mod.listConversations("bob")).toEqual([]);
  });
});
