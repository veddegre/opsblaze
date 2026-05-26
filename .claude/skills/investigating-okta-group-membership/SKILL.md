---
name: investigating-okta-group-membership
description: Investigates Okta group membership and provisioning changes on index=okta when the user asks about groups, roles, or membership—not routine login/MFA. Use a tight query budget; do not mix with auth-only investigations unless requested.
---

# Investigating Okta Group Membership

Use when the user explicitly asks about **groups**, **membership**, **provisioning**, or **role changes** in Okta.

Primary data: **`index=okta`**.

## Scope

- **Include** events where `lastMembershipUpdated` is populated, or Okta event types clearly about group/user membership.
- **Exclude** routine authentication unless the user also asks for login context—in that case run a short auth slice after membership findings.

## Query budget

1. At most **5** `splunk_query` calls per question.
2. One discovery query for membership volume and top event types.
3. One breakdown by group or target user.
4. One timechart or recent-sample table.
5. Synthesize in **one** final report—no second executive summary pass.

## Base SPL

```spl
index=okta earliest=-7d@d latest=now
| where isnotnull(lastMembershipUpdated) OR match(_raw, "(?i)group\\.member|user\\.lifecycle|application\\.user")
```

Adjust `earliest`/`latest` to the user’s window.

## Output

- State the time range and whether results are membership-focused only.
- Name the top groups or actors driving volume.
- Call out anomalies (bulk adds, after-hours changes, privileged groups).
- Do not re-run identical SPL; cite prior tool output in the thread.
