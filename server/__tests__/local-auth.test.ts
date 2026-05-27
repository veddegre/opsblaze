import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { mkdir, writeFile, rm } from "fs/promises";
import path from "path";
import os from "os";
import { hashPassword } from "../auth/password.js";

describe("local authentication", () => {
  let tmpDir: string;
  let authFile: string;

  beforeEach(async () => {
    tmpDir = await mkdtemp(path.join(os.tmpdir(), "opsblaze-local-auth-"));
    authFile = path.join(tmpDir, "local-auth.json");
    const hash = hashPassword("pass123");
    await writeFile(
      authFile,
      JSON.stringify({
        users: [
          {
            username: "analyst",
            passwordHash: hash,
            name: "Analyst",
            groups: ["investigators"],
          },
          {
            username: "admin",
            passwordHash: hash,
            groups: ["admins"],
          },
        ],
      }),
      "utf-8"
    );
    vi.stubEnv("OPSBLAZE_LOCAL_AUTH_FILE", authFile);
    vi.stubEnv("OPSBLAZE_ADMIN_GROUPS", "admins");
    vi.resetModules();
  });

  afterEach(async () => {
    vi.unstubAllEnvs();
    vi.resetModules();
    await rm(tmpDir, { recursive: true, force: true });
  });

  it("authenticates valid credentials and resolves admin via group", async () => {
    const mod = await import("../auth/local-auth.js");
    const user = await mod.authenticateLocalUser("admin", "pass123");
    expect(user?.id).toBe("admin");
    expect(user?.isAdmin).toBe(true);
    expect(user?.adminSource).toBe("admin_group");
    expect(user?.groups).toContain("admins");
  });

  it("rejects invalid password", async () => {
    const mod = await import("../auth/local-auth.js");
    expect(await mod.authenticateLocalUser("analyst", "wrong")).toBeNull();
  });

  it("non-admin user has standard access", async () => {
    const mod = await import("../auth/local-auth.js");
    const user = await mod.authenticateLocalUser("analyst", "pass123");
    expect(user?.isAdmin).toBe(false);
    expect(user?.adminSource).toBe("none");
  });
});

async function mkdtemp(prefix: string) {
  const { mkdtemp: mk } = await import("fs/promises");
  return mk(prefix);
}
