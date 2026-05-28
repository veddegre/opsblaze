#!/usr/bin/env node

import "dotenv/config";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import {
  getActiveThreatIntelProviders,
  hasOrganizationIpConfig,
  isThreatIntelProviderConfigured,
} from "../../server/threat-intel-config.js";
import {
  classifyOrganizationIpsForTool,
  formatClassifySummary,
} from "./classify-org-ips.js";
import { enrichIps, formatEnrichSummary } from "./enrich.js";
import { lookupAbuseIpdb } from "./abuseipdb.js";
import { classifyIpForThreatIntel } from "./ip-utils.js";
import { lookupVirustotalIp } from "./virustotal.js";
import { log } from "./logger.js";

const server = new McpServer({
  name: "opsblaze-threat-intel",
  version: "0.1.0",
});

const providerEnum = z.enum(["virustotal", "abuseipdb"]);

function toolResult(payload: unknown) {
  return {
    content: [{ type: "text" as const, text: JSON.stringify(payload, null, 2) }],
  };
}

server.tool(
  "classify_organization_ips",
  "Classify IPv4 addresses against configured organization zones (campus, VPN, etc.). " +
    "Returns zone name, default posture (trusted/neutral/sensitive), and whether threat-intel APIs should be skipped. " +
    "No external API calls. Use during Splunk investigations before adjusting risk or calling enrich_ips.",
  {
    ips: z
      .array(z.string())
      .min(1)
      .max(100)
      .describe("IPv4 addresses from Splunk fields such as src, src_ip, client_ip"),
  },
  async ({ ips }) => {
    const payload = classifyOrganizationIpsForTool(ips);
    return {
      content: [
        {
          type: "text" as const,
          text: JSON.stringify(
            {
              summary: formatClassifySummary(payload),
              ...payload,
            },
            null,
            2
          ),
        },
      ],
    };
  }
);

if (isThreatIntelProviderConfigured("virustotal")) {
  server.tool(
    "virustotal_ip_lookup",
    "Look up a single public IPv4 address on VirusTotal. Returns a compact JSON summary for analysis.",
    { ip: z.string().describe("Public IPv4 address to look up") },
    async ({ ip }) => {
      const check = classifyIpForThreatIntel(ip);
      if (check.skip) {
        return toolResult({
          provider: "virustotal",
          ip: check.ip ?? ip,
          ok: false,
          summary: check.summary,
          error: check.reason,
          zone: check.zone,
          defaultPosture: check.defaultPosture,
        });
      }
      return toolResult(await lookupVirustotalIp(check.ip!));
    }
  );
}

if (isThreatIntelProviderConfigured("abuseipdb")) {
  server.tool(
    "abuseipdb_ip_check",
    "Check a single public IPv4 address on AbuseIPDB. Returns abuse confidence score and report counts.",
    { ip: z.string().describe("Public IPv4 address to check") },
    async ({ ip }) => {
      const check = classifyIpForThreatIntel(ip);
      if (check.skip) {
        return toolResult({
          provider: "abuseipdb",
          ip: check.ip ?? ip,
          ok: false,
          summary: check.summary,
          error: check.reason,
          zone: check.zone,
          defaultPosture: check.defaultPosture,
        });
      }
      return toolResult(await lookupAbuseIpdb(check.ip!));
    }
  );
}

const activeProviders = getActiveThreatIntelProviders();
if (activeProviders.length > 0) {
  server.tool(
    "enrich_ips",
    "Enrich multiple public IPv4 addresses using all enabled threat intelligence providers " +
      `(currently: ${activeProviders.join(", ")}). Organization internal, private, and duplicate IPs are skipped. ` +
      "Use after Splunk investigations when the user asks to check IPs or assess reputation.",
    {
      ips: z
        .array(z.string())
        .min(1)
        .max(100)
        .describe("List of IPv4 addresses from Splunk or other sources"),
      providers: z
        .array(providerEnum)
        .optional()
        .describe(
          "Optional subset of providers (virustotal, abuseipdb). Omit to use all enabled providers."
        ),
    },
    async ({ ips, providers }) => {
      const payload = await enrichIps(ips, providers);
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(
              {
                summary: formatEnrichSummary(payload),
                ...payload,
              },
              null,
              2
            ),
          },
        ],
      };
    }
  );
}

async function main() {
  const providers = getActiveThreatIntelProviders();
  const orgIp = hasOrganizationIpConfig();
  if (providers.length === 0 && !orgIp) {
    log.error(
      "Threat-intel MCP needs at least one provider API key or organization IP zones. " +
        "Set VIRUSTOTAL_API_KEY / ABUSEIPDB_API_KEY, or configure zones in Settings → Runtime / THREAT_INTEL_INTERNAL_CIDRS."
    );
    process.exit(1);
  }

  const parts: string[] = [];
  if (orgIp) parts.push("classify_organization_ips");
  if (providers.length) parts.push(`providers: ${providers.join(", ")}`);
  log.info(`Starting threat-intel MCP (${parts.join("; ")})`);

  const transport = new StdioServerTransport();
  await server.connect(transport);
  log.info("MCP server connected via stdio");
}

main().catch((err) => {
  log.fatal(String(err));
  process.exit(1);
});
