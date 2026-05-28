import { describe, it, expect } from "vitest";
import { validateOrganizationIpZones } from "../threat-intel-zones.js";

describe("threat-intel-zones", () => {
  it("rejects invalid zone names and cidrs", () => {
    expect(
      validateOrganizationIpZones([
        { name: "Campus", defaultPosture: "trusted", cidrs: ["203.0.113.0/24"] },
      ])
    ).not.toEqual([]);
    expect(
      validateOrganizationIpZones([
        { name: "campus", defaultPosture: "trusted", cidrs: ["not-a-cidr"] },
      ])
    ).not.toEqual([]);
  });

  it("accepts valid zones", () => {
    expect(
      validateOrganizationIpZones([
        { name: "campus", defaultPosture: "trusted", cidrs: ["203.0.113.0/24"] },
        { name: "vpn", defaultPosture: "neutral", cidrs: ["10.8.0.0/24"] },
      ])
    ).toEqual([]);
  });
});
