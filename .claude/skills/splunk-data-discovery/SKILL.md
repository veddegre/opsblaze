---
name: splunk-data-discovery
description: Maps indexes, sourcetypes, hosts, and sources when data location is unknown. Use for “what data do we have?”, first touch on a new source, or scoping before a deeper investigation.
---

# Splunk Data Discovery

You are mapping what exists in Splunk before a focused investigation. The goal is a clear inventory: which indexes and sourcetypes hold data, how much volume they have, how fresh they are, and which fields matter for follow-up questions.

## When to Use This Skill

- The user asks what indexes, sourcetypes, or sources exist.
- You do not know which index holds the data for their question.
- They name a vague source (“our firewall”, “VPN logs”, “the app logs”) without an index.
- You need to confirm data recency or whether an index is empty before drilling in.

Do **not** use this skill as the whole investigation when the user already named a specific index and question—switch to a domain skill (login, search activity, etc.) after discovery.

## Investigation Stages

### Stage 1: Index and sourcetype landscape

Start with a fast volume map across the deployment:

```
| tstats count WHERE index=* BY index, sourcetype
| sort -count
| head 30
```

Present as a **table** (index, sourcetype, count). Call out the top 3–5 by volume and any surprising names.

If `tstats` is slow or restricted, fall back to:

```
index=* earliest=-24h@h latest=now
| stats count BY index, sourcetype
| sort -count
| head 30
```

Narrow the time window (`-7d`, `-30d`) if the user asked about a specific period.

### Stage 2: Recency and time coverage

For indexes that matter to the user’s question, establish whether data is current:

```
| tstats min(_time) AS earliest max(_time) AS latest WHERE index=<idx> BY sourcetype
| eval earliest=strftime(earliest, "%Y-%m-%d %H:%M"), latest=strftime(latest, "%Y-%m-%d %H:%M")
| sort sourcetype
```

Or per index:

```
index=<idx> earliest=-90d@d latest=now
| stats min(_time) AS first_seen max(_time) AS last_seen count BY sourcetype
| eval first_seen=strftime(first_seen, "%Y-%m-%d"), last_seen=strftime(last_seen, "%Y-%m-%d")
```

Use a **table**. Note gaps (“no events in the last 7 days”) explicitly.

### Stage 3: Host and source breakdown (for chosen sourcetypes)

Once the user cares about one or two sourcetypes, show where events come from:

```
index=<idx> sourcetype=<st> earliest=-7d@d latest=now
| stats count BY host, source
| sort -count
| head 20
```

Use a **horizontal bar** for top hosts or a **table** if many distinct sources.

### Stage 4: Field sampling

For the target sourcetype, surface useful fields without dumping raw events:

```
index=<idx> sourcetype=<st> earliest=-1d@d latest=now
| head 1
| fieldsummary
```

Or:

```
index=<idx> sourcetype=<st> earliest=-1d@d latest=now
| head 500
| fieldsummary maxvals=20
```

Summarize in prose: timestamp field, user/host/IP fields, action/status fields, and anything domain-specific. Do not paste huge field lists—group by theme (identity, network, outcome).

### Stage 5: Optional keyword hunt

If the user gave a keyword (product name, hostname fragment, app name):

```
| tstats count WHERE index=* AND ("<keyword>" OR host="*<keyword>*") BY index, sourcetype
| sort -count
| head 20
```

Adjust syntax if keyword search is too broad; prefer `index=*` with `host`, `source`, or `sourcetype` filters when you know the pattern.

### Stage 6: Recommend next steps

Close with a short assessment:

| Finding | Recommendation |
|--------|----------------|
| Clear winning index/sourcetype | Name them and suggest a focused investigation |
| Multiple candidates | List tradeoffs (volume vs. recency vs. field richness) |
| No data / stale data | State the window searched and suggest widening time or checking ingestion |
| Only `_internal` / `_audit` | Say so; custom data may be missing or under another cluster |

## Visualization Guide

| Stage | Viz type | Size hint |
|-------|----------|-----------|
| Index/sourcetype volume | table | width 1100, height 500 |
| Recency by sourcetype | table | width 1100, height 400 |
| Top hosts | bar | width 1100, height 500 |
| Volume over time (optional) | line or area | span scaled to range |

Optional timeline for one index:

```
index=<idx> earliest=-30d@d latest=now
| timechart span=1d count BY sourcetype limit=5
```

## SPL Conventions

- Prefer `tstats` for cross-index summaries; use `stats` on raw events when you need `host`, `source`, or `fieldsummary`.
- Always bound results: `| head 20` or `| head 30` on discovery tables.
- Use relative time in `earliest`/`latest` for tool calls—never ISO date strings.
- Default discovery window: `-7d` or `-30d` unless the user specified otherwise.

## Pitfalls

- **Do not treat `_internal` and `_audit` as the user’s “application data.”** Mention them, but distinguish Splunk platform telemetry from business/security logs.
- **Zero rows ≠ no data forever.** Widen time, check summary index lag, or try alternate indexes before concluding absence.
- **High count from one noisy sourcetype** can hide useful low-volume sources—show both top volume and user-relevant matches.
- **Do not run discovery in a loop.** After 4–6 useful visualizations, stop and hand off a concrete index/sourcetype recommendation.

## Important

- **ALWAYS call `splunk_query` for every data claim.** Never invent index names, counts, or field names.
- Discovery is for orientation; end with “investigate X in `index=Y` sourcetype=Z” when possible.
