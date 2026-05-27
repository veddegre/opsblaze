import { describe, it, expect } from "vitest";
import { adminSourceLabel } from "../admin-source-labels";

describe("adminSourceLabel", () => {
  it("describes group-based admin", () => {
    expect(adminSourceLabel("admin_group", "IT-Security")).toContain("IT-Security");
  });

  it("describes local mode", () => {
    expect(adminSourceLabel("local_mode")).toContain("Local mode");
  });

  it("describes admin_username", () => {
    expect(adminSourceLabel("admin_username")).toContain("OPSBLAZE_LOCAL_AUTH_ADMIN_USERS");
  });
});
