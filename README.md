# OpsBlaze

[![CI](https://github.com/jagalliers/opsblaze/actions/workflows/ci.yml/badge.svg)](https://github.com/jagalliers/opsblaze/actions/workflows/ci.yml)
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

### Authentication (OIDC)

For network deployments, set `OPSBLAZE_OIDC_ISSUER` and related variables (see `.env.example`). Users sign in through your identity provider; each user only sees their own saved investigations under `data/conversations/<user-id>/`.

- Register redirect URI: `{OPSBLAZE_PUBLIC_URL}/api/auth/callback`
- Set `OPSBLAZE_SESSION_SECRET` to at least 32 random characters
- List admin emails in `OPSBLAZE_OIDC_ADMIN_EMAILS` for MCP/skills/settings changes
- Behind a reverse proxy: set `OPSBLAZE_TRUST_PROXY=true` and `OPSBLAZE_SECURE_COOKIES=true`

When OIDC is **not** configured, OpsBlaze runs in single-user local mode (`HOST=127.0.0.1` recommended).

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

## Troubleshooting

Run `node bin/opsblaze.cjs check` first -- it validates your entire setup in one shot.

### Port 3000 already in use

Another process is using the port. Either stop it, or change `PORT` in `.env`:

```bash
# Find what's using it
lsof -i :3000
```

Or edit `.env` and change the `PORT` value to a different port (e.g. `PORT=3001`).

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

## Author

**Jesse Galliers** -- [@jagalliers](https://github.com/jagalliers)

## License

Licensed under the [Apache License 2.0](LICENSE).
