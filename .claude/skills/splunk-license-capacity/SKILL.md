---
name: splunk-license-capacity
description: Assesses Splunk license usage, ingestion volume, disk, and resource pressure using _internal introspection and license metrics. Use for capacity planning, quota warnings, or “are we about to run out?”
---

# Splunk License and Capacity

You are evaluating **license consumption**, **ingestion trends**, and **resource pressure** on a Splunk deployment. Focus on actionable capacity signals, not generic Splunk administration theory.

## Primary Data Sources

| Source | Typical use |
|--------|-------------|
| `index=_internal` `sourcetype=splunkd` `group=license_usage` | Daily license / ingestion usage (common on many versions) |
| `index=_internal` `source=*license*` or `component=LicenseMgr` | Alternate license logging (discover if `license_usage` is empty) |
| `index=_introspection` `component=HostPerf` or `component=Volume` | CPU, memory, disk I/O |
| `index=_internal` `sourcetype=splunkd` `log_level=ERROR` | Errors that may correlate with capacity pain |

**Discover before assuming.** Run a quick survey when license sourcetypes are unknown:

```
index=_internal earliest=-7d@d latest=now
| stats count BY sourcetype, source
| search sourcetype=*license* OR source=*license* OR group=license_usage
| sort -count
```

## Investigation Stages

### Stage 1: License usage trend

When `group=license_usage` exists:

```
index=_internal source=*license_usage* type=Usage earliest=-30d@d latest=now
| timechart span=1d sum(b) AS bytes
```

Or by pool/stack if `stack` or `pool` field exists:

```
index=_internal source=*license_usage* type=Usage earliest=-30d@d latest=now
| timechart span=1d sum(b) AS bytes BY stack limit=5
```

Present **area** or **line** chart. Convert bytes to GB/TB in prose for readability.

If no usage events, search `_internal` for `license` keywords and report what is available.

### Stage 2: Top consumers (indexes / hosts / sourcetypes)

License usage often includes `idx`, `h`, or `s` (index, host, source/type—**verify field names** with `head 5` first):

```
index=_internal source=*license_usage* type=Usage earliest=-7d@d latest=now
| stats sum(b) AS bytes BY idx
| eval gb=round(bytes/1024/1024/1024, 2)
| sort -bytes
| head 15
```

```
index=_internal source=*license_usage* type=Usage earliest=-7d@d latest=now
| stats sum(b) AS bytes BY h
| sort -bytes
| head 15
```

Use **bar** or **table**. Identify indexes driving growth.

### Stage 3: Ingestion proxy via indexing volume

Cross-check with indexed event volume (not identical to license bytes but useful):

```
| tstats count WHERE index=* earliest=-7d@d latest=now BY index
| sort -count
| head 20
```

Compare trends:

```
| tstats count WHERE index=* earliest=-30d@d latest=now BY index
| timechart span=1d count BY index limit=5
```

Note which indexes grew fastest week over week.

### Stage 4: Disk and volume pressure

From introspection:

```
index=_introspection component=Volume earliest=-7d@d latest=now
| stats latest(data.capacity) AS capacity latest(data.used) AS used BY mount
| eval pct_used=round(100*used/capacity, 1)
| sort -pct_used
```

```
index=_introspection component=Volume earliest=-7d@d latest=now
| timechart span=1d max(data.used) AS used BY mount limit=5
```

Flag mounts above ~80% used. Use **table** for snapshot, **line** for trend.

### Stage 5: Host resource pressure

```
index=_introspection component=HostPerf earliest=-7d@d latest=now
| timechart span=1h avg(data.cpu_idle_pct) AS cpu_idle BY host limit=5
```

Or memory/disk busy metrics if present in `data.*` fields—sample one host with `head 1 | fieldsummary` first.

Highlight sustained CPU saturation or I/O wait correlating with search/import issues.

### Stage 6: Errors and warnings (capacity-related)

```
index=_internal log_level=ERROR earliest=-7d@d latest=now
| stats count BY component, signature
| sort -count
| head 15
```

Call out signatures mentioning disk, license, quota, pipeline, queue, or `max_searches`.

### Stage 7: Summary and forecast

Provide:

1. **KPI table** — avg daily license GB (or bytes), peak day, top index, worst disk mount %, error count.
2. **Trend narrative** — growing, flat, or declining over 30 days.
3. **Risk level**
   - 🟢 Usage stable, disk headroom healthy
   - 🟡 Steady growth, one index dominating, disk >70%
   - 🔴 Sharp license spike, disk >85%, repeated license or queue errors
4. **Actions** — review top index sourcetypes, retention, HEC sources, scheduled search load (offer handoff to search-activity skill if relevant).

## Visualization Guide

| Intent | Viz type |
|--------|----------|
| License bytes over time | area or line |
| Top indexes by license bytes | bar or table |
| Disk used % | table + line trend |
| Index event volume trend | area (`timechart`) |
| ERROR breakdown | table |

## SPL Conventions

- License events use **summaries**—prefer narrow `earliest` windows for field discovery, then 30d for trends.
- Always `head`/`limit` on breakdown queries.
- Do not mix license bytes and raw event counts without explaining they measure different things.

## Pitfalls

- **License field names vary by Splunk version** — discover `b`, `idx`, `h`, `stack`, `pool` before aggregating.
- **Cluster vs single instance** — totals may reflect pooled usage; mention if results look like one indexer only.
- **Retention and frozen buckets** affect disk but not always license bytes—distinguish disk full from license violation.
- **Do not alarm on a single spike day** without showing the surrounding trend.

## Important

- **ALWAYS call `splunk_query` for every numeric claim.**
- If license metrics are unavailable, report disk/introspection/tstats findings honestly and state what could not be measured.
