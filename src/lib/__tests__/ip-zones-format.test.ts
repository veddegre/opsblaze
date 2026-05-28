import { describe, it, expect } from "vitest";
import { formatIpZonesText, parseIpZonesText } from "../ip-zones-format";

describe("ip-zones-format", () => {
  it("parses and formats zone blocks", () => {
    const raw = `campus trusted
203.0.113.0/24

vpn neutral
10.8.0.0/24`;
    const zones = parseIpZonesText(raw);
    expect(zones).toHaveLength(2);
    expect(zones[0]).toEqual({
      name: "campus",
      defaultPosture: "trusted",
      cidrs: ["203.0.113.0/24"],
    });
    expect(formatIpZonesText(zones)).toContain("campus trusted");
  });
});
