# OpsBlaze

[![CI](https://github.com/veddegre/opsblaze/actions/workflows/ci.yml/badge.svg)](https://github.com/veddegre/opsblaze/actions/workflows/ci.yml)
[![License](https://img.shields.io/badge/License-Apache%202.0-blue.svg)](LICENSE)
[![Node](https://img.shields.io/badge/node-%3E%3D20-brightgreen)](https://nodejs.org)

AI-driven narrative investigation for Splunk. Ask questions in natural language, and OpsBlaze queries your Splunk instance, analyzes the results, and presents findings as a rich narrative with interactive charts.

OpsBlaze connects to Splunk via its REST API and runs investigations through an LLM backend. **Open WebUI** is the recommended backend for institutional deployments (any model your Open WebUI instance exposes). **Claude** (via the Claude Agent SDK) remains supported when Open WebUI is not configured.

## Supported Platforms

| Platform | Status |
|---|---|
| macOS (Apple Silicon & Intel) | Fully supported |
| Linux (x64, arm64) | Fully supported |

## Prerequisites

| Requirement | How to get it |
|---|---|
| Node.js 20+ | [nodejs.org](https://nodejs.org) |
| LLM backend | **Open WebUI** (base URL + API key from Settings → Account) **or** Claude CLI / [Anthropic API key](https://console.anthropic.com/) |
| Splunk access | Management port (default 8089) |

### Open WebUI (recommended)

Point OpsBlaze at your Open WebUI instance. The Splunk MCP server runs locally inside OpsBlaze; the model calls `splunk_query` through Open WebUI’s tool-calling API.

1. Copy your API key from **Open WebUI → Settings → Account**
2. Find a model id (Settings → Models, or `GET /api/models` on your instance)
3. Set `OPENWEBUI_BASE_URL`, `OPENWEBUI_API_KEY`, and `OPENWEBUI_MODEL` in `.env`

Example:

```env
OPENWEBUI_BASE_URL=https://openwebui.example.edu
OPENWEBUI_API_KEY=your-api-key
OPENWEBUI_MODEL=your-model-id
```

### Claude (alternative)

If `OPENWEBUI_BASE_URL` is **not** set, OpsBlaze uses the Claude Agent SDK:

- **Default:** Claude CLI OAuth (`npm install -g @anthropic-ai/claude-code`, then `claude auth login`)
- **Alternative:** `ANTHROPIC_API_KEY` in `.env` for pay-per-use API billing

## Quick Start

```bash
# 1. Install and configure
node bin/setup.cjs

# 2. Start the server
node bin/opsblaze.cjs start

# 3. Open in your browser
open http://localhost:3000
```

The setup wizard walks you through the LLM backend, Splunk connection, and server port.

## Commands

All commands are run from the project root:

| Command | Description |
|---|---|
| `node bin/opsblaze.cjs start` | Start the server in production mode (daemonized) |
| `node bin/opsblaze.cjs stop` | Stop the server |
| `node bin/opsblaze.cjs restart` | Restart the server |
| `node bin/opsblaze.cjs status` | Show PID, uptime, memory, restart count |
| `node bin/opsblaze.cjs logs` | Tail server logs |
| `node bin/opsblaze.cjs check` | Validate environment and prerequisites |
| `node bin/opsblaze.cjs dev` | Start in development mode with hot reload |
| `node bin/opsblaze.cjs install-splunk-viz` | Install optional Splunk visualization packages |
| `node bin/opsblaze.cjs hash-password [password]` | Generate a `passwordHash` for `local-auth.json` |
| `node bin/setup.cjs` | Re-run the setup wizard |

## Visualizations

OpsBlaze uses **Chart.js** by default for rendering charts (line, area, bar, column, pie, single value, and table). No additional setup is required.

### Optional: Splunk Native Visualizations

If you have access to the `@splunk/visualizations` npm packages, you can install them for a premium chart experience:

```bash
node bin/opsblaze.cjs install-splunk-viz
```

This installs the `@splunk/visualizations` packages and rebuilds the app. The change is automatic -- the app detects which renderer is available at build time and uses it. To switch back to Chart.js, uninstall the Splunk packages and rebuild.

The setup wizard also offers this as an optional step during initial configuration.

> **Note:** The `@splunk/*` visualization packages are proprietary software published by Splunk Inc. and are subject to Splunk's own license terms. They are not included in or distributed with OpsBlaze. You are responsible for ensuring you have appropriate licensing before installing them.

## Configuration

All configuration lives in `.env` (created by the setup wizard). Key variables:

| Variable | Default | Description |
|---|---|---|
| `SPLUNK_HOST` | — | Splunk management host (required) |
| `SPLUNK_PORT` | `8089` | Splunk management port |
| `SPLUNK_SCHEME` | `https` | `https` or `http` |
| `SPLUNK_TOKEN` | — | Bearer auth token (use this or username/password) |
| `SPLUNK_USERNAME` | — | Splunk username (alternative to token) |
| `SPLUNK_PASSWORD` | — | Splunk password (alternative to token) |
| `SPLUNK_VERIFY_SSL` | `true` | Verify Splunk's SSL certificate |
| `OPENWEBUI_BASE_URL` | — | Open WebUI instance URL (enables Open WebUI backend when set) |
| `OPENWEBUI_API_KEY` | — | API key from Open WebUI Settings → Account (required with base URL) |
| `OPENWEBUI_MODEL` | — | Model id as shown in Open WebUI |
| `ANTHROPIC_API_KEY` | — | Anthropic API key (Claude backend only; optional alternative to CLI) |
| `PORT` | `3000` | Server port |
| `HOST` | `127.0.0.1` | Bind address (use `0.0.0.0` for LAN access) |
| `OPSBLAZE_RATE_LIMIT` | `10` | Max chat requests per minute per IP |
| `OPSBLAZE_STREAM_TIMEOUT_MS` | `300000` | Max streaming duration (5 minutes) |
| `CLAUDE_MODEL` | `claude-opus-4-6` | Model id (Open WebUI model when using Open WebUI; Claude model otherwise) |
| `CLAUDE_EFFORT` | `high` | Thinking effort for Claude backend only: `low`, `medium`, `high`, or `max` |
| `LOG_LEVEL` | `info` | Log verbosity: `fatal`, `error`, `warn`, `info`, `debug`, or `trace` |

When `OPENWEBUI_BASE_URL` is set, Claude CLI and `ANTHROPIC_API_KEY` are not required. The Settings UI **Model** field sets the Open WebUI model id in that mode.

See `.env.example` for the complete list of all available options with inline descriptions.

To configure manually instead of using the wizard, copy `.env.example` to `.env` and fill in the required values.

### Authentication

OpsBlaze supports three modes (only one login method at a time):

| Mode | How it is enabled | Sign-in | Best for |
|------|-------------------|---------|----------|
| **Open** | No `OPSBLAZE_OIDC_ISSUER` and no `OPSBLAZE_LOCAL_AUTH_FILE` | None (single shared “Local user”) | Localhost dev only, or `OPSBLAZE_LOCAL_MODE=true` lab |
| **Local** | `OPSBLAZE_LOCAL_AUTH_FILE` points at a JSON user database | Username + password | Lab / air-gapped / pre-OIDC network testing |
| **OIDC** | `OPSBLAZE_OIDC_ISSUER` and related vars | Organization SSO | Production multi-user |

In all authenticated modes, each user’s saved investigations live under `data/conversations/<user-id>/`. Open **Settings → Account** after login to see groups and how administrator access was granted.

#### Local authentication (`local-auth.json`)

Use this when you want **real logins and groups** on the network without standing up OIDC yet.

**1. Create the user database**

```bash
cp data/local-auth.example.json data/local-auth.json
chmod 600 data/local-auth.json
```

Point OpsBlaze at it in `.env`:

```env
OPSBLAZE_LOCAL_AUTH_FILE=./data/local-auth.json
OPSBLAZE_SESSION_SECRET=<see below>
HOST=0.0.0.0
PORT=3000
```

Generate a session secret (required — cookies are signed with it):

```bash
openssl rand -base64 32
```

**2. File format**

The file is a single JSON object with a `users` array. Each entry is one account:

| Field | Required | Description |
|-------|----------|-------------|
| `username` | Yes | Login name: letters, numbers, `.`, `_`, `-` only (max 64). Matched **case-insensitively** at login. Becomes the user id for conversation storage (sanitized). |
| `passwordHash` | Yes | **Not** the plain password — see [Generating `passwordHash`](#generating-passwordhash) below. |
| `name` | No | Display name in the UI (defaults to `username`). |
| `email` | No | Shown in Settings → Account; optional. |
| `groups` | No | String array of group names (e.g. `investigators`, `admins`). Used for **administrator** resolution — see below. Default `[]`. |
| `disabled` | No | If `true`, login is rejected (account kept on disk). |

Example (password hashes shortened for readability):

```json
{
  "users": [
    {
      "username": "analyst",
      "passwordHash": "scrypt:AbCdEfGh...:XyZ123...",
      "name": "Security Analyst",
      "email": "analyst@example.com",
      "groups": ["investigators"]
    },
    {
      "username": "admin",
      "passwordHash": "scrypt:IjKlMnOp...:987654...",
      "name": "OpsBlaze Admin",
      "groups": ["admins", "investigators"]
    }
  ]
}
```

Rules enforced at server startup:

- At least one user, at most 500.
- Usernames must be unique (case-insensitive).
- Invalid JSON or missing fields prevent the server from starting (`node bin/opsblaze.cjs check` / logs).

The file is re-read when its modification time changes (e.g. after you edit users), so you can add accounts without rebuilding — restart is only required for `.env` changes.

**3. Generating `passwordHash`**

Passwords are **never** stored in plain text. OpsBlaze uses **scrypt** (Node.js built-in) and stores a string in this format:

```text
scrypt:<base64-salt>:<base64-hash>
```

Generate a hash from the project root:

```bash
# Recommended: pass the password on the command line (shell history may retain it)
node bin/opsblaze.cjs hash-password 'your-secure-password'

# Same script directly:
node bin/local-auth-hash.cjs 'your-secure-password'

# Omit the argument to be prompted (password echoed as you type):
node bin/opsblaze.cjs hash-password
```

Example output (one long line):

```text
scrypt:rK8x2pL9vN0qW3mY5zA7bQ==:hT4fG6jK8lM0nP2qR5sU7vW9xY1zA3bC5dE7fG9hJ1kL3mN5pQ7rS9tU==
```

Copy the **entire** line into `passwordHash` for that user. Each user can have a different password (run the command once per password). Re-running the command for the same password produces a **different** hash (random salt) — all of them verify correctly.

**4. Groups and administrators**

Group names in `local-auth.json` are labels on each user. They do not create a separate group table — you assign users to groups in the `groups` array.

Administrator access (Settings, skills on disk, MCP config, playbooks, audit log, etc.) is granted if **any** of these match:

| Mechanism | `.env` variable | Example |
|-----------|-----------------|---------|
| Group membership | `OPSBLAZE_ADMIN_GROUPS` (preferred) or `OPSBLAZE_OIDC_ADMIN_GROUPS` | `OPSBLAZE_ADMIN_GROUPS=admins` — any user with `"admins"` in `groups` is an admin |
| Explicit username | `OPSBLAZE_LOCAL_AUTH_ADMIN_USERS` or `OPSBLAZE_ADMIN_USERS` | `OPSBLAZE_LOCAL_AUTH_ADMIN_USERS=admin` |

Comparison is case-insensitive for group names and usernames.

Typical layout:

- Group `investigators` — analysts who run searches (not admins).
- Group `admins` — listed in `OPSBLAZE_ADMIN_GROUPS`.
- User `admin` with `"groups": ["admins"]` — full admin after login.

Users without admin see only their own investigations and cannot change server-wide settings.

**5. Complete `.env` example (local auth on LAN)**

```env
HOST=0.0.0.0
PORT=3000
OPSBLAZE_LOCAL_AUTH_FILE=./data/local-auth.json
OPSBLAZE_SESSION_SECRET=paste-output-of-openssl-rand-base64-32-here
OPSBLAZE_ADMIN_GROUPS=admins

# Splunk + LLM vars from setup wizard ...
SPLUNK_HOST=...
```

Do **not** set `OPSBLAZE_OIDC_ISSUER` when using local auth. Do **not** rely on `OPSBLAZE_LOCAL_MODE` — that is only for **unauthenticated** open access.

Restart and verify:

```bash
chmod 600 .env
node bin/opsblaze.cjs restart
node bin/opsblaze.cjs check
```

Browsers show a username/password form. After login, **Settings → Account** lists your groups and admin source.

**Security notes**

- `chmod 600` on both `.env` and `data/local-auth.json` (production refuses world-readable `.env`).
- Use TLS in production (reverse proxy) and strong passwords; local auth is for lab or trusted networks unless combined with VPN/firewall rules.
- Login attempts are rate-limited per IP.
- Add `data/local-auth.json` to backups; losing it locks everyone out until you restore or recreate users.

#### OIDC authentication

For production network deployments, set `OPSBLAZE_OIDC_ISSUER` and related variables (see `.env.example`). Users sign in through your identity provider; each user only sees their own saved investigations under `data/conversations/<user-id>/`.

- Register redirect URI: `{OPSBLAZE_PUBLIC_URL}/api/auth/callback`
- Set `OPSBLAZE_SESSION_SECRET` to at least 32 random characters
- List admin emails in `OPSBLAZE_OIDC_ADMIN_EMAILS` and/or IdP groups in `OPSBLAZE_OIDC_ADMIN_GROUPS` for MCP/skills/settings changes
- For IT Security–only deployments where every signed-in user should be an admin, set `OPSBLAZE_OIDC_ALL_USERS_ADMIN=true`
- Behind a reverse proxy: terminate TLS at the proxy, bind OpsBlaze to loopback, and set `OPSBLAZE_TRUST_PROXY=true` and `OPSBLAZE_SECURE_COOKIES=true` (see [Reverse proxy](#reverse-proxy-tls-termination) below).

- The OIDC provider must support Authorization Code flow (with PKCE preferred/required).
- OpsBlaze expects `sub` to be present. For admin rights, it also uses the `email` claim (from the ID token and/or the UserInfo endpoint).

#### Setup: Authentik (OpenID Connect)

1. In Authentik, create/open the OIDC provider (“OpenID Provider” / “OAuth2/OIDC Provider”) and configure it for **Authorization Code**.
2. Create an OIDC “Application” / OAuth client for OpsBlaze.
3. Set the allowed redirect URI to:
   - `OPSBLAZE_PUBLIC_URL/api/auth/callback`
   - Example: `https://opsblaze.example.edu/api/auth/callback`
4. Ensure Authentik includes these standard claims:
   - `sub` (unique user identifier)
   - `email` (used to mark admins)
   - `name` (optional display name)
5. Copy these values into `.env`:

```bash
# Authentik issuer URL (exact path is provider/app specific)
OPSBLAZE_OIDC_ISSUER=https://authentik.example.edu/application/o/<your-opsblaze-oidc-app-slug>/
OPSBLAZE_OIDC_CLIENT_ID=<client-id>
OPSBLAZE_OIDC_CLIENT_SECRET=<client-secret>

# OpsBlaze public URL (used to build the callback URL by default)
OPSBLAZE_PUBLIC_URL=https://opsblaze.example.edu
OPSBLAZE_OIDC_REDIRECT_URI=https://opsblaze.example.edu/api/auth/callback

# Use standard OIDC scopes so `email` is available
OPSBLAZE_OIDC_SCOPES="openid profile email"

# Optional: admins allowed to change runtime/system settings
OPSBLAZE_OIDC_ADMIN_EMAILS=admin@example.edu,ops@example.edu
```

Tip: if users authenticate but never become admins, confirm the ID token/UserInfo contains the `email` claim. After login, open **Settings → Account** to see groups from your token and how admin access was resolved.

### Reverse proxy (TLS termination)

OpsBlaze listens on `HOST:PORT` (default `127.0.0.1:3000`). For production, run it on loopback and put **Caddy** or **nginx** in front for HTTPS. Set **HSTS** on the proxy — there is no `OPSBLAZE_MODE=server` switch; use `OPSBLAZE_TRUST_PROXY` and `OPSBLAZE_SECURE_COOKIES` instead.

**Required `.env` when behind a proxy:**

```bash
HOST=127.0.0.1
PORT=3000
OPSBLAZE_PUBLIC_URL=https://opsblaze.example.edu
OPSBLAZE_OIDC_REDIRECT_URI=https://opsblaze.example.edu/api/auth/callback
OPSBLAZE_TRUST_PROXY=true
OPSBLAZE_SECURE_COOKIES=true
```

**Caddy** (automatic HTTPS with Let's Encrypt):

```caddyfile
opsblaze.example.edu {
    encode gzip
    header Strict-Transport-Security "max-age=31536000; includeSubDomains"

    reverse_proxy 127.0.0.1:3000 {
        header_up X-Forwarded-Proto {scheme}
        header_up X-Forwarded-Host {host}
    }
}
```

**nginx** (TLS certificates at `/etc/ssl/...`):

```nginx
server {
    listen 443 ssl http2;
    server_name opsblaze.example.edu;

    ssl_certificate     /etc/ssl/certs/opsblaze.crt;
    ssl_certificate_key /etc/ssl/private/opsblaze.key;
    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_buffering off;          # required for SSE chat streaming
        proxy_read_timeout 600s;
    }
}
```

`OPSBLAZE_TRUST_PROXY=true` lets Express honor `X-Forwarded-*` for rate limiting and secure cookies. Without it, sessions may not persist correctly behind HTTPS.

#### Setup: Microsoft Entra ID (Azure AD)

1. In Entra, go to **App registrations** → **New registration**.
2. Configure **Redirect URI** (Authentication) for web:
   - `https://opsblaze.example.edu/api/auth/callback`
   - This must exactly match `OPSBLAZE_OIDC_REDIRECT_URI`.
3. Create a client secret under **Certificates & secrets** → **New client secret**.
4. Use the v2 issuer URL (recommended):
   - `https://login.microsoftonline.com/<tenant-id>/v2.0`
5. Ensure your login uses the scopes `openid profile email` so the `email` claim is present.

Example `.env` (tenant-specific):

```bash
OPSBLAZE_OIDC_ISSUER=https://login.microsoftonline.com/<tenant-id>/v2.0
OPSBLAZE_OIDC_CLIENT_ID=<client-id>
OPSBLAZE_OIDC_CLIENT_SECRET=<client-secret>

OPSBLAZE_PUBLIC_URL=https://opsblaze.example.edu
OPSBLAZE_OIDC_REDIRECT_URI=https://opsblaze.example.edu/api/auth/callback
OPSBLAZE_OIDC_SCOPES="openid profile email"
OPSBLAZE_OIDC_ADMIN_EMAILS=admin@example.edu,ops@example.edu
```

Tip: if Entra returns tokens but your users aren’t recognized as admins, verify the `email` claim in the ID token (or via UserInfo).

When neither OIDC nor `OPSBLAZE_LOCAL_AUTH_FILE` is configured, OpsBlaze runs in **open** single-user mode (`HOST=127.0.0.1` recommended). See [Local authentication](#local-authentication-local-authjson) above for username/password + groups.

### Reach OpsBlaze from another machine (open lab mode, no login)

By default the server binds to **loopback only** (`HOST=127.0.0.1`), so `http://<server-ip>:3000` from another PC will not connect. To listen on all interfaces:

```env
HOST=0.0.0.0
OPSBLAZE_LOCAL_MODE=true
```

Restart the server. This is **intentionally insecure** (no login) — use a firewall, VPN, or SSH tunnel if you only need yourself:

```bash
ssh -L 3000:127.0.0.1:3000 user@your-ubuntu-host
# then open http://localhost:3000 on your laptop
```

If you set `HOST=0.0.0.0` **without** `OPSBLAZE_LOCAL_MODE=true` (and without OIDC), startup **fails** by design. Run `node bin/opsblaze.cjs check` to see bind and permission issues.

## Architecture

```
Browser  ←── SSE ──→  OpsBlaze (Express)
                         │
            ┌────────────┴────────────┐
            ▼                         ▼
     Open WebUI API            MCP (stdio/http/sse)
     /api/chat/completions          │
            │                  Splunk MCP Server
            ▼                         ▼
     Your LLM model              Splunk REST API
```

With the Claude backend, the Agent SDK orchestrates MCP tools internally. With Open WebUI, OpsBlaze runs the tool loop itself and registers MCP tools with each chat completion request.

### Investigation skills

Investigation skills are markdown playbooks stored on the OpsBlaze server at **`.opsblaze/skills/<name>/SKILL.md`** (legacy **`.claude/skills/`** is still read if present). Each skill is a folder with a `SKILL.md` file (YAML front matter for `name` / `description`, body for methodology).

On first startup, OpsBlaze copies an existing `.claude/skills/` tree into `.opsblaze/skills/` if needed. The `.claude` path follows the [Claude Code](https://docs.anthropic.com/en/docs/claude-code) project layout for SDK compatibility:

| Backend | How skills are applied |
|---|---|
| **Open WebUI** (recommended) | OpsBlaze reads `SKILL.md` from disk and **injects the content into the system prompt** for each chat. Open WebUI does not read `.claude/` itself. |
| **Claude** (Agent SDK) | The SDK discovers skills under `.claude/skills/` as native `Skill` tools when `OPENWEBUI_BASE_URL` is unset. |

If you only deploy Open WebUI, you can ignore the Claude integration—the folder is still OpsBlaze’s skill library; the name is historical compatibility, not a requirement to run Claude.

**Shared vs per-user:** Skills are **server-wide**. Every user on an instance sees the same catalog (`GET /api/skills`). Per-user data is limited to saved investigations under `data/conversations/<user-id>/` (not in git). In the chat UI you can pick which skills apply to a given message; that selection is sent with the request, not stored as a separate skill library per user.

**Who can change skills:**

| Action | Who |
|---|---|
| Pick skills for a message | Any signed-in user |
| Distill a draft from a conversation (extract/refine) | Any signed-in user |
| Save, enable/disable, or delete skills on disk | **Admins** (OIDC admin emails/groups, or local auth admin groups/usernames) |

Disabled skills remain on disk as `SKILL.md.disabled` and are omitted from prompts.

**Git and deploy:** Skills are plain files in the repo tree, not in the database. Commit `.opsblaze/skills/` or `.claude/skills/` to version bundled skills; `_local/` under either tree is gitignored for machine-only skills. There is no automatic git sync at runtime—whatever is on the server filesystem when OpsBlaze starts is what runs. After deploy, ensure that directory is present (git pull, rsync, or copy) alongside `server/` and `src/`.

Bundled examples include `splunk-analyst`, `investigating-splunk-login-activity`, and other generic Splunk playbooks. Organization-specific skills belong in `.claude/skills/_local/` or `.opsblaze/skills/_local/` (gitignored — see that folder’s README). Create more via **Settings → Skills** (admins) or **Distill skill** from a completed investigation.

**Skill bundles** (presets below the chat input) come from built-in defaults or **Settings → Runtime settings → Skill bundles** (admins). Each bundle sets which skills are selected and whether strict mode applies.

**Splunk guardrails** (admins, runtime settings) restrict MCP `splunk_query` to allowed indexes and a maximum time window for everyone. Optional **admin break-glass** via `.env`: `OPSBLAZE_SPLUNK_GUARD_ADMIN_EXTRA_INDEXES` (union with the allowlist) or `OPSBLAZE_SPLUNK_GUARD_ADMIN_BYPASS_INDEXES=true` (admins skip index checks; time window still applies).

**Investigation playbooks** (admins) are saved prompts with optional skills, shown as chips below the input bar. **Audit log** (admins, Settings → Audit log) records auth, exports, and configuration changes in `data/audit.jsonl`.

## Troubleshooting

Run `node bin/opsblaze.cjs check` first -- it validates your entire setup in one shot.

### Port 3000 already in use

Another process is using the port. Either stop it, or change `PORT` in `.env`:

```bash
# Find what's using it
lsof -i :3000
```

Or edit `.env` and change the `PORT` value to a different port (e.g. `PORT=3001`).

On minimal Linux (Ubuntu server images), install `lsof` or use `ss` / `fuser` — OpsBlaze falls back automatically when `lsof` is missing.

### Status shows "starting or restarting" or crash-looping

The production supervisor is running but the Node server keeps exiting before `/api/health` succeeds.

```bash
node bin/opsblaze.cjs stop
node bin/opsblaze.cjs logs          # or: tail -30 data/opsblaze-err.log
node bin/opsblaze.cjs check
```

**Most common fix on Linux:** `.env` was created with default permissions (`644`). Production mode refuses to start until only your user can read it:

```bash
chmod 600 .env
node bin/opsblaze.cjs restart
```

Other frequent causes (see `data/opsblaze-err.log`):

- Claude CLI not installed or not logged in (use Open WebUI or `ANTHROPIC_API_KEY` instead)
- `HOST=0.0.0.0` without `OPSBLAZE_LOCAL_MODE=true` or OIDC configured
- Missing build: `npm run build`

### Open WebUI authentication failed

- Confirm `OPENWEBUI_API_KEY` matches the key from **Settings → Account** in Open WebUI
- Confirm `OPENWEBUI_BASE_URL` is the site root (e.g. `https://openwebui.example.edu`), not `/api`
- List models: `curl -H "Authorization: Bearer $OPENWEBUI_API_KEY" "$OPENWEBUI_BASE_URL/api/models"`
- Ensure `OPENWEBUI_MODEL` matches a model id from that list
- Check `/api/health` — the `openwebui` check should show `ok`

### Claude CLI not authenticated

Only applies when **not** using Open WebUI. If you see "Claude CLI not found or not authenticated" at startup:

```bash
# Install the CLI
npm install -g @anthropic-ai/claude-code

# Authenticate (opens browser for OAuth)
claude auth login
```

Alternatively, set `ANTHROPIC_API_KEY` in `.env` to use API key authentication instead of the CLI.

### Splunk connection refused

Verify your Splunk settings in `.env`:
- Is the host reachable? `curl -k https://your-splunk-host:8089/services/server/info`
- Is the port correct? Default management port is 8089, not 8000.
- Are credentials valid? Try logging into Splunk's web UI with the same credentials.

### Investigations run but no charts appear

- Confirm the model supports tool/function calling (required for `splunk_query`)
- Check server logs for MCP connection errors
- Test the built-in Splunk MCP server in **Settings → MCP Servers → Test**

### Build not found

If the server can't find the frontend:

```bash
npm run build
node bin/opsblaze.cjs restart
```

### App starts but page is blank

- Clear your browser cache and hard-refresh (Cmd+Shift+R / Ctrl+Shift+R)
- Verify the build completed: check that `dist/client/index.html` exists

## Development

For active development with hot reload:

```bash
node bin/opsblaze.cjs dev
```

This starts both the Vite dev server (http://localhost:5173) and the Express backend (http://localhost:3000). Work from port 5173 -- Vite proxies API calls to the backend automatically.

Running `dev` will automatically stop a running production server, and vice versa.

## Security

OpsBlaze includes several layers of security hardening:

- **Rate limiting** -- Per-IP rate limits on chat, API, and skill extraction endpoints.
- **Content Security Policy** -- Strict CSP with `frame-ancestors 'none'`, no `unsafe-eval`.
- **SPL safety validation** -- Allowlist-based SPL command validation prevents dangerous Splunk queries.
- **MCP server sandboxing** -- Blocklists reject dangerous arguments (`--require`, `--eval`) and environment variables (`NODE_OPTIONS`, `LD_PRELOAD`) in user-configured MCP servers.
- **Error sanitization** -- API error responses only surface known validation messages, preventing internal detail leakage.

See [SECURITY.md](SECURITY.md) for the vulnerability reporting policy.

## Contributing

Contributions are welcome. Please read [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines. Open an issue first to discuss what you'd like to change, then submit a pull request.

## Trademarks

Splunk is a registered trademark of Splunk Inc. in the United States and other countries. Splunk Inc. is a wholly owned subsidiary of Cisco Systems, Inc. This project is not affiliated with, endorsed by, or sponsored by Splunk Inc. or Cisco Systems, Inc.

All other trademarks are the property of their respective owners.

## Origin and maintenance

This repository is a fork of [OpsBlaze](https://github.com/jagalliers/opsblaze) by **Jesse Galliers** ([@jagalliers](https://github.com/jagalliers)).

**Maintainer:** **Greg Vedders** — [@veddegre](https://github.com/veddegre)  
Report bugs and feature requests via [GitHub Issues](https://github.com/veddegre/opsblaze/issues).

## License

Licensed under the [Apache License 2.0](LICENSE).
