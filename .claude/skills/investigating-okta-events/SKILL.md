---
name: investigating-okta-events
description: Investigates Okta authentication and session activity on index=okta while excluding group membership noise. Use for login failures, MFA, session issues—not group add/remove unless explicitly requested. Follows a fixed query budget; do not re-run discovery in a loop.
---

# Investigating Okta Authentication (Excluding Group Activity)

Primary data: **`index=okta`**.

**Default scope:** authentication and session events only. **Exclude group membership activity** unless the user explicitly asks about groups or provisioning.

## Critical: avoid investigation loops

These rules override generic “narrative investigation” pacing when `splunk-analyst` is also loaded:

1. **Query budget:** Use at most **6** `splunk_query` calls for a standard question (e.g. “failed logins last 24 hours”). Prefer **4–5**.
2. **Discovery split runs once:** The `stream` / `membership_lifecycle` vs `auth_candidate` stats query runs **at most one time** per investigation. Never repeat it to “confirm” or refresh numbers.
3. **One final report:** After the planned queries, write **one** cohesive answer. Do **not** start a second report with a new “Executive Summary”, “Investigation:”, or “Let me start by discovering…”.
4. **Reuse tool output:** If a prior query in this conversation already returned counts or tables, **cite those numbers**—do not re-run the same SPL.
5. **Stop calling tools** when you have: (a) membership vs auth volume (once), (b) auth outcome breakdown, (c) failure-focused breakdown or timechart, (d) top failure actors. Then **synthesize in prose only**—no more `splunk_query` until the user asks a follow-up.
6. **No filler turns:** Do not emit “Waiting for analysis to complete…”, “Let me now produce the comprehensive report”, or “OK, I have all the data” followed by more queries. Either query or write the conclusion—not both in sequence across many turns.
7. **Invalid SPL:** Do not pipe `stats` into another `stats`/`sum` on the same field without raw events in between. If a query fails, fix the SPL once; do not restart the whole investigation.

## Excluding group / membership events

**`lastMembershipUpdated` populated = group add/remove**, not login. For authentication investigations:

- **Always exclude** `lastMembershipUpdated` on every auth query (after the one-time discovery split).
- Mention membership noise **once** in the opening paragraph; do not re-query it every section.

**Auth base filter** (every authentication query except the one-time discovery split):

```spl
index=okta earliest=-24h@h latest=now
| where isnull(lastMembershipUpdated)
```

If `isnull()` misses nested fields:

```spl
| search NOT lastMembershipUpdated=*
```

## Standard playbook: failed logins (last 24 hours)

Run these in order, then **stop querying** and write the final answer.

| Step | Purpose | Run once? |
|------|---------|-----------|
| 1 | Discovery split (membership vs auth volume) | Yes — only step that omits the auth filter |
| 2 | Auth outcomes (`semantic_outcome` or `outcome.result`) | Yes |
| 3 | Failures only: count + `timechart span=1h` | Yes |
| 4 | Top failure actors: `actor.alternateId`, `actor.type`, `client.ipAddress` | Yes |
| 5 | Optional: only if step 3 shows a clear spike hour—drill that hour | At most once |

**Step 1 — discovery split (once only):**

```spl
index=okta earliest=-24h@h latest=now
| eval stream=if(isnotnull(lastMembershipUpdated), "membership_lifecycle", "auth_candidate")
| stats count BY stream, sourcetype
| sort -count
```

**Step 2 — auth outcomes:**

```spl
index=okta earliest=-24h@h latest=now
| where isnull(lastMembershipUpdated)
| eval semantic_outcome=coalesce('outcome.result', status, "unknown")
| stats count BY semantic_outcome
| sort -count
```

**Step 3 — failures over time:**

```spl
index=okta earliest=-24h@h latest=now
| where isnull(lastMembershipUpdated)
| search outcome.result=failure OR status=failure OR outcome.result=FAILURE
| timechart span=1h count
```

Add a `| stats count` in the same query only if the tool allows one result set; otherwise run a separate single-value count query **once** before the timechart.

**Step 4 — top failure actors:**

```spl
index=okta earliest=-24h@h latest=now
| where isnull(lastMembershipUpdated)
| search outcome.result=failure OR status=failure OR outcome.result=FAILURE
| stats count BY actor.alternateId, actor.type, client.ipAddress
| sort -count
| head 25
```

Adjust failure predicates only if step 2 shows different failure field values on a **single** `| head 5` sample—not repeated fieldsummary loops.

## Domain heuristics

- High volume with `lastMembershipUpdated` = **group sync**; excluded from auth metrics—not failed logins.
- **`AD_AGENT`** and **`PublicClientApp`** dominating failure counts often indicate **directory sync or app integration** issues, not human credential spray—say so explicitly.
- Do not hunt for `eventCode` / `reason` if a quick sample shows they are absent; use `outcome.result`, `status`, and `eventType` from validated rows.
- Use the user’s time window consistently (`-24h@h` unless they specify otherwise).

## Visualization strategy

| Intent | Viz |
|--------|-----|
| Membership vs auth volume (step 1) | table |
| Outcome mix (step 2) | pie or bar |
| Failure trend (step 3) | line or area |
| Top actors (step 4) | bar or table |

Aim for **3–4 charts total**, not 8+. Do not chart membership lifecycle unless the user asked about groups.

## Final report structure (single pass)

1. **Answer first** — total failed auth events (and window), in one sentence.
2. **Data quality** — one short paragraph on membership noise excluded (numbers from step 1 only).
3. **Findings** — outcomes, timeline spike if any, top actors (numbers from steps 2–4).
4. **Assessment** — likely cause (sync vs human attack) and 1–3 recommended next steps.

Do not repeat the discovery table in every subsection.

## When the user asks about groups (only then)

Run **separate** queries on `lastMembershipUpdated=*`. Do not mix into auth conclusions. That path is outside this skill’s default playbook.

## Important (OpsBlaze)

- Ground claims in `splunk_query` results, but **do not** re-query for numbers you already have in this thread.
- Default: `index=okta` + exclude `lastMembershipUpdated` for all auth steps after the one-time discovery split.
