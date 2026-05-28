#!/usr/bin/env node

import "dotenv/config";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import {
  getActiveThreatIntelProviders,
  isThreatIntelProviderConfigured,
} from "../../server/threat-intel-config.js";
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
  if (providers.length === 0) {
    log.error(
      "No threat intelligence providers enabled. Set VIRUSTOTAL_API_KEY and/or ABUSEIPDB_API_KEY " +
        "(and VIRUSTOTAL_ENABLED / ABUSEIPDB_ENABLED if needed), or disable THREAT_INTEL_ENABLED."
    );
    process.exit(1);
  }

  log.info(`Starting threat-intel MCP (providers: ${providers.join(", ")})`);

  const transport = new StdioServerTransport();
  await server.connect(transport);
  log.info("MCP server connected via stdio");
}

main().catch((err) => {
  log.fatal(String(err));
  process.exit(1);
});
