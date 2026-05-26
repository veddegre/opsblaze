---
name: investigating-okta-events
description: Investigates Okta authentication and session activity on index=okta while excluding group membership and provisioning noise. Use for login patterns, MFA, session failures, and auth anomalies—not for group add/remove unless the user explicitly asks.
---

# Investigating Okta Authentication (Excluding Group Activity)

Primary data: **`index=okta`**.

**Default scope for this skill:** authentication and session events only. **Exclude group membership activity** unless the user explicitly asks about groups or provisioning.

## Excluding group / membership events

In this environment, **`lastMembershipUpdated` is populated when a group is added or removed**. Those rows are **not** authentication events. For login/session investigations:

- **Always exclude** events where `lastMembershipUpdated` is present.
- Do **not** chart, count failures on, or narrate spikes driven primarily by membership lifecycle.
- After discovery, also exclude obvious provisioning/group `eventType` or `eventCode` values (validate names on sample data—do not guess).

**Auth base filter** (apply to every authentication-focused query after optional discovery):

```spl
index=okta earliest=-24h@h latest=now
| where isnull(lastMembershipUpdated)
```

If `isnull()` misses nested fields, add:

```spl
| search NOT lastMembershipUpdated=*
```

Optional hardening once schema is known (examples—replace with discovered values):

```spl
| where NOT match(eventType, "(?i)group") AND NOT match(eventType, "(?i)provisioning")
```

## Analytical Methodology

1. **Quick discovery (optional)** — sourcetype mix on `index=okta` only; note how much volume has `lastMembershipUpdated` so you can explain what was excluded.
2. **Validate auth fields** on rows **without** `lastMembershipUpdated`: `outcome.result`, `status`, `eventCode`, `actor.*`, session-related types.
3. **Auth outcome analysis** — success/failure/challenge counts, top users, source IPs, only on the filtered auth stream.
4. **Temporal patterns** — timechart auth events; bursts on excluded membership stream should be labeled sync noise, not login attacks.
5. **Conclude** on authentication only—do not blend group add/remove stats into auth conclusions.

## Domain Heuristics

- High event volume with `lastMembershipUpdated` = **group sync / membership churn**. Mention it was excluded; do not treat as failed logins.
- System accounts (`import.*`, `agent.*`, `system.*`) on **auth-filtered** data may still appear; distinguish from membership bulk on the excluded set.
- One interactive login may produce multiple auth-related event codes (credential, MFA, policy, session)—normal cascade.
- Authentication events should have interpretable outcome/session semantics; if outcomes are null after exclusion, refine `eventType` filters from a validated sample.

## Query and Tool Patterns

**Discovery with exclusion split** (shows how much noise was removed):

```spl
index=okta earliest=-24h@h latest=now
| eval stream=if(isnotnull(lastMembershipUpdated), "membership_lifecycle", "auth_candidate")
| stats count BY stream, sourcetype
| sort -count
```

**Schema validation (auth candidates only)**

```spl
index=okta earliest=-24h@h latest=now
| where isnull(lastMembershipUpdated)
| head 20
| fieldsummary maxvals=15
```

**Auth outcomes**

```spl
index=okta earliest=-24h@h latest=now
| where isnull(lastMembershipUpdated)
| eval semantic_outcome=coalesce('outcome.result', status, "unknown")
| stats count BY semantic_outcome
| sort -count
```

**Top users (auth only)**

```spl
index=okta earliest=-7d@d latest=now
| where isnull(lastMembershipUpdated)
| stats count BY actor.alternateId
| sort -count
| head 20
```

**Auth activity over time**

```spl
index=okta earliest=-7d@d latest=now
| where isnull(lastMembershipUpdated)
| timechart span=1h count
```

**Failed auth focus** (after confirming failure field on sample):

```spl
index=okta earliest=-7d@d latest=now
| where isnull(lastMembershipUpdated)
| search outcome.result=failure OR status=failure OR outcome.result=FAILURE
| stats count BY actor.alternateId, client.ipAddress
| sort -count
| head 25
```

Adjust failure predicates to match discovered values.

## Visualization Strategy

| Intent | Viz type |
|--------|----------|
| Auth vs excluded membership volume | table (`stream` split) |
| Success/failure mix (auth only) | pie or bar |
| Top users or IPs (auth only) | bar or table |
| Auth trend | line or area |
| Failed login triage | table |

Do **not** build membership or group-add charts unless the user explicitly requests group investigation.

## Pitfalls

- **Including `lastMembershipUpdated` rows in auth metrics** — invalidates failure rates and volume alerts.
- **Describing a membership spike as brute force** — check exclusion filter first.
- **Assuming vendor field names** — validate on auth-filtered samples only.
- **ISO timestamps** — use relative `earliest`/`latest`.

## When the user asks about groups (only then)

If they explicitly want group add/remove analysis, run **separate** queries on `lastMembershipUpdated=*` and do not mix results into auth conclusions. That is outside the default path for this skill.

## Important (OpsBlaze)

- **ALWAYS call `splunk_query` for every data claim.**
- Default: `index=okta` + **exclude** `lastMembershipUpdated` for authentication investigations.
