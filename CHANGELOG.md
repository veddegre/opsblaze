# Changelog

All notable changes to OpsBlaze will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- **Open WebUI model picker** in Settings → Runtime settings: loads models from `GET /api/openwebui/models` and saves the selection via runtime settings (no `.env` edit required).
- **OIDC authentication** with per-user conversation storage (`server/auth/`, `OPSBLAZE_OIDC_*` env vars). Admins (`OPSBLAZE_OIDC_ADMIN_EMAILS`) can manage MCP servers, skills, and runtime settings.
- **Open WebUI** as an LLM backend: set `OPENWEBUI_BASE_URL`, `OPENWEBUI_API_KEY`, and `OPENWEBUI_MODEL` to route investigations through any model configured in Open WebUI.
- Native MCP tool loop (`server/openwebui-agent.ts`, `server/mcp-runtime.ts`) so Splunk and user-defined MCP servers work without the Claude Agent SDK.
- Open WebUI health check (`GET /api/health` reports `openwebui` instead of `claude` when configured).
- Setup wizard and `opsblaze check` support for Open WebUI configuration.

### Security

- Startup refuses non-loopback `HOST` without OIDC unless `OPSBLAZE_LOCAL_MODE=true` is set explicitly.
- OIDC callback uses fixed `OPSBLAZE_OIDC_REDIRECT_URI` (required when OIDC is enabled); session ID is regenerated on login.
- MCP HTTP/SSE URLs block private/reserved addresses (SSRF mitigation); `docker` stdio requires `OPSBLAZE_ALLOW_DOCKER_MCP=true`.
- `POST /api/mcp-servers/:name/test` and `GET /api/config-paths` require admin; system settings are admin-only in `GET /api/settings`.
- Production startup fails if `.env` is world-readable.

### Changed

- When `OPENWEBUI_BASE_URL` is set, Claude CLI and `ANTHROPIC_API_KEY` are not required.
- Skills are injected into the system prompt under Open WebUI (no Claude `Skill` tool).
- Settings UI shows Open WebUI status when that backend is active.

## [0.1.0] - 2026-03-04

### Added

- Natural language Splunk investigation with Claude Agent SDK.
- Interactive chart rendering (line, area, bar, column, pie, single value, table).
- Conversation persistence with search, export (HTML), and cleanup.
- MCP (Model Context Protocol) server for Splunk queries with SPL safety validation.
- Skills system for extensible agent capabilities with extract/refine workflow.
- User-configurable MCP server management (add, edit, toggle, test, delete).
- Rate limiting on chat, API, and skill extraction endpoints.
- Bearer token authentication with timing-safe comparison.
- Environment validation via Zod schema at startup.
- CI pipeline with typecheck, lint, test, build, and dependency audit.
- Setup wizard (`node bin/setup.cjs`) for guided configuration.
- Port conflict detection with retry logic and process identification.
- Skill scoping (advisory and strict modes) with SkillPicker UI.
- Structured logging in MCP server via `LOG_LEVEL` env var (`fatal`/`error`/`warn`/`info`/`debug`/`trace`).
- Log rotation in production supervisor (10 MB per file, keeps 3 rotations).
- `OPSBLAZE_MODE=server` for remote deployments: enables HSTS, `trust proxy` for rate limiting behind reverse proxies.
- `.env` file permission check at startup (warns if group/other-readable).
- Test coverage for conversations, export, MCP config, recorder, skill extractor, API client, settings API, and Splunk client.

### Security

- Content Security Policy tightened: removed `unsafe-eval`, added `frame-ancestors 'none'`, `base-uri 'self'`, `form-action 'self'`.
- HSTS header (`Strict-Transport-Security`) when running in server mode.
- MCP server argument blocklist: rejects dangerous args (`--require`, `--eval`, `--import`, `--loader`).
- MCP server environment blocklist: rejects dangerous env vars (`NODE_OPTIONS`, `LD_PRELOAD`, `DYLD_INSERT_LIBRARIES`, etc.).
- Error message sanitization: API responses only surface known validation messages, preventing internal detail leakage.
- Search query length limit (500 characters).
- Splunk TLS: replaced `NODE_TLS_REJECT_UNAUTHORIZED` override with scoped undici `Agent` for SSL skip.
- HTML export: Chart.js loaded with SRI hash; chart data escaped to prevent XSS injection.
- Markdown table rendering: defense-in-depth sanitization of event handlers, `javascript:` and `data:` URIs.

### Removed

- EC2/Caddy deployment infrastructure (`deploy/` directory, `ec2-bootstrap.sh`, `Caddyfile.template`). OpsBlaze runs as a local-first app; multi-user support will come with proper auth and user models. The `OPSBLAZE_MODE=server` env var is retained for security header and proxy trust configuration.
- Windows support. Process management relies on Unix-only APIs (`lsof`, process groups, `SIGKILL`, `tail`) that do not work on Windows. CLI entry points now exit with a clear message on `win32`.

[0.1.0]: https://github.com/jagalliers/opsblaze/releases/tag/v0.1.0
