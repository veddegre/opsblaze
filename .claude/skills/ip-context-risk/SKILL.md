---
name: ip-context-risk
description: Classifies source IPs against organization zones and adjusts investigation risk by activity type (e.g. payroll from campus vs admin abuse). Use when interpreting Splunk results involving src_ip, client_ip, or IP reputation questions.
---

# IP context and contextual risk

Use this skill when Splunk results include IP addresses and the user cares about **whether activity is expected** for that location—not only external reputation.

## Tools (opsblaze-threat-intel)

1. **`opsblaze-threat-intel__classify_organization_ips`** — call first for distinct IPs (no API quota). Returns:
   - `zone` — configured name (`campus`, `vpn`, `internal`, …) or `null` (external)
   - `defaultPosture` — `trusted` | `neutral` | `sensitive`
   - `threatIntelSkipped` — do not call VirusTotal/AbuseIPDB when true

2. **`opsblaze-threat-intel__enrich_ips`** — only for **external** IPs when the user asks for reputation (after classify).

Zones are configured in **Settings → Runtime → IP zones** (or `THREAT_INTEL_INTERNAL_CIDRS` in `.env`).

## Workflow

1. Run Splunk to gather events with IP fields (`src`, `src_ip`, `client_ip`, etc.).
2. Collect **unique** IPs (cap at ~50 for classify; fewer is better).
3. Call **`classify_organization_ips`** once with the list.
4. For each finding, combine:
   - **Zone + default posture** from classify
   - **Activity** from Splunk (index, sourcetype, `action`, app, data sensitivity)
5. Apply the risk adjustment table below in your narrative.
6. Call **`enrich_ips`** only for IPs that are external (`zone: null`) and still suspicious after contextual review.

## Risk adjustment (default posture → final severity)

| Zone posture | Example activity | Adjustment |
|--------------|------------------|------------|
| **trusted** | Payroll/HR changes, expected campus apps, scheduled jobs from known roles | **Lower** — note why it is expected; still flag volume/user anomalies |
| **trusted** | First-time admin, MFA failures, bulk export, impossible travel | **Raise** — trusted location does not excuse sensitive abuse |
| **neutral** | Routine auth success, normal business apps | **Neutral** — describe baseline |
| **neutral** | Off-hours privileged access, new service accounts | **Raise slightly** — investigate further |
| **sensitive** | Any privileged or data-exfil pattern | **Raise** — treat as high-value location |
| **external** (`zone: null`) | Sensitive actions, auth failures, C2 indicators | **Raise** — prefer `enrich_ips` if user wants reputation |

Always state in conclusions: **IP → zone → posture → activity → adjusted risk**.

## Splunk helpers (optional)

Tag rows in SPL when repeating analysis:

```spl
| eval ip_zone=case(
    cidrmatch("203.0.113.0/24", src_ip), "campus",
    cidrmatch("10.8.0.0/24", src_ip), "vpn",
    true(), "other"
  )
```

Prefer **`classify_organization_ips`** so CIDRs stay in sync with OpsBlaze settings.

## Playbooks

- **Payroll / HR review** — enable this skill; emphasize lowering risk for `trusted` campus + payroll sourcetypes.
- **Privileged access / exfil** — enable this skill + **ip-threat-enrichment**; do not lower risk for admin actions solely due to campus IP.

## Do not

- Call threat-intel APIs for IPs where `threatIntelSkipped` is true unless the user explicitly insists.
- Treat `trusted` posture as “ignore”—only reduce priority when **activity** matches.
- Re-classify the same IP list repeatedly in one turn.
