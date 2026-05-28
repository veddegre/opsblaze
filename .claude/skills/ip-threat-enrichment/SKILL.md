---
name: ip-threat-enrichment
description: Enriches public IPv4 addresses from Splunk investigations using VirusTotal and/or AbuseIPDB MCP tools. Use when the user asks to check IP reputation, validate sources, or investigate suspicious external IPs found in search results.
---

# IP threat enrichment

Use this skill **when the user explicitly asks** to check IP reputation or when an investigation has identified a **small set of external IPs** worth validating (e.g. top failed-login sources, firewall denies).

## Tools (opsblaze-threat-intel)

Only call tools that exist in the current session. Typical names:

- `opsblaze-threat-intel__enrich_ips` — preferred for multiple IPs (one batch call)
- `opsblaze-threat-intel__virustotal_ip_lookup` — single IP when only VirusTotal is enabled
- `opsblaze-threat-intel__abuseipdb_ip_check` — single IP when only AbuseIPDB is enabled

If a provider was disabled by the administrator, do not call its tools; use `enrich_ips` without a `providers` filter so only enabled backends run.

## Workflow

1. Run Splunk first to identify candidate **public** IPv4 addresses (not RFC1918 or organization-internal ranges unless the user insists).
2. Deduplicate and limit to **at most 25** IPs per `enrich_ips` call (fewer is better).
3. Call **`enrich_ips`** once with the list. Do not repeat the same IPs in a loop.
4. Summarize in prose: high-confidence malicious, suspicious, clean, and links for analysts.
5. If enrichment fails (rate limit, API error), say so once and continue with Splunk-only findings.

## Do not

- Enrich every row of a large result set automatically.
- Re-run identical IPs after a successful enrichment.
- Treat private IPs (`10.x`, `192.168.x`, `127.x`) or **organization internal** ranges (configured in Settings → Runtime or `THREAT_INTEL_INTERNAL_CIDRS`) as threat-intel targets unless the user insists.
