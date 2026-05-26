---
name: splunk-search-activity
description: Investigates who ran searches, scheduled jobs, and expensive or unusual search activity using _audit and _internal. Use for search audit, abuse detection, capacity troubleshooting, or “who queried what?”
---

# Splunk Search Activity Investigation

You are analyzing **search and job activity** on a Splunk deployment: who searched, how often, failures, scheduled vs interactive work, and signs of expensive or abusive queries.

## Primary Data Sources

| Source | Typical content |
|--------|-----------------|
| `index=_audit` | Search-related audit events (`action=search`, saved search changes, sometimes `scheduled_search`) |
| `index=_internal` `sourcetype=scheduler` | Scheduled search execution, skipped runs, queue pressure |
| `index=_internal` `sourcetype=splunkd` / `metrics` | Search process load, dispatch issues (supporting context) |

**Do not assume field names.** Discover available `action` values in `_audit` before filtering:

```
index=_audit earliest=-7d@d latest=now
| stats count BY action
| sort -count
| head 25
```

Look for actions such as `search`, `scheduled_search`, `save_search`, or deployment-specific variants.

## Investigation Stages

### Stage 1: Search event landscape

After discovering actions, filter to search-related ones and measure volume:

```
index=_audit action=search earliest=-7d@d latest=now
| stats count BY user
| sort -count
| head 20
```

If `action=search` returns nothing, use the actions found in Stage 1.

Present top users with a **horizontal bar** chart. Separate `splunk-system-user` and other service accounts from human users in your narrative.

### Stage 2: Activity over time

```
index=_audit action=search earliest=-14d@d latest=now
| timechart span=1d count BY user limit=5
```

Or total volume:

```
index=_audit action=search earliest=-14d@d latest=now
| timechart span=4h count
```

Use **area** or **line** chart. Call out spikes, quiet periods, and whether activity tracks business hours.

### Stage 3: Expensive or long-running searches (audit)

When `search` events expose runtime or scan fields (varies by version), aggregate:

```
index=_audit action=search earliest=-7d@d latest=now
| stats count avg(totalRunTime) max(totalRunTime) AS max_runtime BY user
| sort -max_runtime
| head 15
```

If `totalRunTime` is absent, use available duration fields from `fieldsummary` on a small sample first.

For search strings (when `search` or `savedsearch_name` exists):

```
index=_audit action=search earliest=-1d@d latest=now
| stats count BY user, search
| sort -count
| head 20
```

Use a **table**; truncate very long SPL in prose, not in fabricated summaries.

### Stage 4: Scheduled search health

```
index=_internal sourcetype=scheduler earliest=-7d@d latest=now
| stats count BY status
| sort -count
```

Timeline of failures/skips:

```
index=_internal sourcetype=scheduler earliest=-7d@d latest=now
| timechart span=1d count BY status
```

Top scheduled searches by volume or failures:

```
index=_internal sourcetype=scheduler earliest=-7d@d latest=now
| stats count BY savedsearch_name, status
| sort -count
| head 20
```

Interpret: rising `skipped` or `continued` counts may indicate scheduler overload or resource limits.

### Stage 5: Off-hours and anomaly checks

Hour-of-day for human users (exclude known service accounts):

```
index=_audit action=search earliest=-14d@d latest=now NOT user IN ("splunk-system-user")
| eval hour=strftime(_time, "%H")
| stats count BY hour, user
| sort hour
```

Flag unexpected overnight activity or a single user dominating volume.

### Stage 6: Summary assessment

Deliver:

1. **Metrics table** — total searches, distinct users, top user share %, scheduled failure count if available.
2. **Traffic-light findings**
   - 🟢 Normal team usage, expected service accounts, healthy scheduler
   - 🟡 Concentrated usage, growing skipped schedules, repetitive broad `index=*` searches
   - 🔴 Unknown users running heavy searches, off-hours bulk export patterns, scheduler failing consistently
3. **Recommended follow-ups** — e.g. review specific saved search, cap user, inspect KV store or lookup abuse.

## Visualization Guide

| Intent | Viz type |
|--------|----------|
| Top searchers | bar (horizontal) |
| Volume over time | area or line |
| Scheduler status mix | pie or bar |
| Expensive searches / SPL samples | table |
| Hour-of-day pattern | column |

Scale `span=` to the window: `span=4h` for ~2 weeks, `span=1d` for months.

## SPL Conventions

- Bound all tables with `| sort -count | head N`.
- Use `limit=5` on `timechart ... BY user` to keep legends readable.
- Prefer `_audit` for **who** searched; `_internal` scheduler for **what ran on a schedule** and **whether it succeeded**.

## Pitfalls

- **`splunk-system-user` dominates counts** — filter or segment it; it reflects scheduled automation, not interactive abuse.
- **Audit search events ≠ full SPL telemetry** on all Splunk versions; discover fields before aggregating runtime.
- **The current investigation may generate audit noise** — note that API/MCP searches might appear in recent `_audit` data.
- **Do not confuse `action=search` with login or admin actions** — keep search scope explicit.

## Important

- **ALWAYS call `splunk_query` for every data claim.**
- Tie conclusions to actual users, counts, and time ranges from query results.
- If search audit data is missing, say so and report what scheduler/internal data *is* available.
