import { describe, it, expect } from "vitest";
import {
  extractGroupsFromClaims,
  parseCsvEnvSet,
  resolveIsAdmin,
} from "../auth/roles.js";

describe("parseCsvEnvSet", () => {
  it("normalizes to lowercase", () => {
    const set = parseCsvEnvSet("IT-Security, OpsBlaze-Admins");
    expect(set.has("it-security")).toBe(true);
    expect(set.has("opsblaze-admins")).toBe(true);
  });
});

describe("extractGroupsFromClaims", () => {
  it("reads string arrays and object names", () => {
    const groups = extractGroupsFromClaims({
      groups: ["IT-Security", { name: "OpsBlaze-Admins" }],
      roles: "Analyst",
    });
    expect(groups).toContain("it-security");
    expect(groups).toContain("opsblaze-admins");
    expect(groups).toContain("analyst");
  });
});

describe("resolveIsAdmin", () => {
  const admins = parseCsvEnvSet("admin@example.edu");
  const adminGroups = parseCsvEnvSet("it-security");

  it("grants admin when allUsersAdmin is true", () => {
    expect(
      resolveIsAdmin({
        adminEmails: admins,
        adminGroups,
        allUsersAdmin: true,
        email: "anyone@example.edu",
        groups: [],
      })
    ).toBe(true);
  });

  it("matches admin email case-insensitively", () => {
    expect(
      resolveIsAdmin({
        adminEmails: admins,
        adminGroups,
        allUsersAdmin: false,
        email: "Admin@Example.edu",
        groups: [],
      })
    ).toBe(true);
  });

  it("matches admin group membership", () => {
    expect(
      resolveIsAdmin({
        adminEmails: admins,
        adminGroups,
        allUsersAdmin: false,
        email: "user@example.edu",
        groups: ["IT-Security"],
      })
    ).toBe(true);
  });

  it("denies when no rule matches", () => {
    expect(
      resolveIsAdmin({
        adminEmails: admins,
        adminGroups,
        allUsersAdmin: false,
        email: "user@example.edu",
        groups: ["other-group"],
      })
    ).toBe(false);
  });
});
