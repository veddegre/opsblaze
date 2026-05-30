import { z } from "zod";

const positiveInt = z.coerce.number().int().positive();

const envSchema = z
  .object({
    SPLUNK_HOST: z.string().min(1, "SPLUNK_HOST is required"),
    SPLUNK_PORT: positiveInt.max(65535).default(8089),
    SPLUNK_SCHEME: z.enum(["http", "https"]).default("https"),
    SPLUNK_TOKEN: z.string().optional(),
    SPLUNK_USERNAME: z.string().optional(),
    SPLUNK_PASSWORD: z.string().optional(),
    SPLUNK_VERIFY_SSL: z
      .enum(["true", "false", "1", "0"])
      .default("true")
      .transform((v) => v === "true" || v === "1"),
    SPLUNK_TIMEOUT_MS: positiveInt.default(60_000),

    MAX_ROW_LIMIT: positiveInt.default(10_000),
    SPL_SAFETY_ENABLED: z
      .enum(["true", "false"])
      .default("true")
      .transform((v) => v === "true"),

    ANTHROPIC_API_KEY: z.string().optional(),

    // Open WebUI (when set, replaces Claude/Anthropic as the LLM backend)
    OPENWEBUI_BASE_URL: z.string().url().optional(),
    OPENWEBUI_API_KEY: z.string().optional(),
    OPENWEBUI_MODEL: z.string().optional(),
    /** Chat API path prefix, e.g. ollama/v1 when /api/chat/completions 404s */
    OPENWEBUI_CHAT_API_PREFIX: z.string().optional(),

    CLAUDE_MODEL: z.string().default("claude-opus-4-6"),
    CLAUDE_EFFORT: z.enum(["low", "medium", "high", "max"]).default("high"),

    PORT: positiveInt.max(65535).default(3000),
    HOST: z.string().default("127.0.0.1"),

    OPSBLAZE_ALLOWED_ORIGINS: z.string().optional(),
    OPSBLAZE_RATE_LIMIT: positiveInt.default(10),
    OPSBLAZE_STREAM_TIMEOUT_MS: positiveInt.default(300_000),
    OPSBLAZE_MAX_TURNS: positiveInt.default(30),
    OPSBLAZE_MAX_HISTORY: positiveInt.default(20),
    OPSBLAZE_MAX_MESSAGE_LEN: positiveInt.default(10_000),

    OPSBLAZE_DATA_DIR: z.string().optional(),
    OPSBLAZE_RECORD_DIR: z.string().optional(),

    // OIDC authentication (when OPSBLAZE_OIDC_ISSUER is set, login is required)
    OPSBLAZE_OIDC_ISSUER: z.string().url().optional(),
    OPSBLAZE_OIDC_CLIENT_ID: z.string().optional(),
    OPSBLAZE_OIDC_CLIENT_SECRET: z.string().optional(),
    OPSBLAZE_OIDC_REDIRECT_URI: z.string().url().optional(),
    OPSBLAZE_OIDC_SCOPES: z.string().optional(),
    OPSBLAZE_OIDC_ADMIN_EMAILS: z.string().optional(),
    OPSBLAZE_SESSION_SECRET: z.string().optional(),
    OPSBLAZE_PUBLIC_URL: z.string().url().optional(),
    OPSBLAZE_TRUST_PROXY: z
      .enum(["true", "false", "1", "0"])
      .optional()
      .transform((v) => v === "true" || v === "1"),
    OPSBLAZE_SECURE_COOKIES: z
      .enum(["true", "false", "1", "0"])
      .optional()
      .transform((v) => v === "true" || v === "1"),

    /** Acknowledge unauthenticated single-user mode on non-loopback HOST (dev/lab only). */
    OPSBLAZE_LOCAL_MODE: z
      .enum(["true", "false", "1", "0"])
      .optional()
      .transform((v) => v === "true" || v === "1"),

    /** Path to JSON user database for username/password authentication (see data/local-auth.example.json). */
    OPSBLAZE_LOCAL_AUTH_FILE: z.string().optional(),

    /** Admin groups for local auth (and optional OIDC); falls back to OPSBLAZE_OIDC_ADMIN_GROUPS. */
    OPSBLAZE_ADMIN_GROUPS: z.string().optional(),

    /** Usernames that always receive admin when using local authentication. */
    OPSBLAZE_LOCAL_AUTH_ADMIN_USERS: z.string().optional(),

    /** Alias for OPSBLAZE_LOCAL_AUTH_ADMIN_USERS. */
    OPSBLAZE_ADMIN_USERS: z.string().optional(),

    /** Allow docker as MCP stdio command (disabled by default). */
    OPSBLAZE_ALLOW_DOCKER_MCP: z
      .enum(["true", "false", "1", "0"])
      .optional()
      .transform((v) => v === "true" || v === "1"),

    LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace"]).default("info"),
    NODE_ENV: z.string().optional(),

    // Splunk HEC telemetry
    SPLUNK_HEC_URL: z.string().optional(),
    SPLUNK_HEC_TOKEN: z.string().optional(),
    SPLUNK_HEC_INDEX: z.string().default("main"),
    SPLUNK_HEC_SOURCE: z.string().default("opsblaze"),
    SPLUNK_HEC_SOURCETYPE: z.string().default("opsblaze:agent"),
    SPLUNK_HEC_VERIFY_SSL: z
      .enum(["true", "false", "1", "0"])
      .default("true")
      .transform((v) => v === "true" || v === "1"),
    SPLUNK_HEC_BATCH_SIZE: positiveInt.default(10),
    SPLUNK_HEC_FLUSH_MS: positiveInt.default(5_000),

    // OpenTelemetry
    OTEL_ENABLED: z
      .enum(["true", "false", "1", "0"])
      .default("false")
      .transform((v) => v === "true" || v === "1"),
    OTEL_EXPORTER_OTLP_ENDPOINT: z.string().default("http://localhost:4318"),
    OTEL_SERVICE_NAME: z.string().default("opsblaze"),
  })
  .superRefine((data, ctx) => {
    if (data.OPENWEBUI_BASE_URL?.trim()) {
      if (!data.OPENWEBUI_API_KEY?.trim()) {
        ctx.addIssue({
          code: "custom",
          path: ["OPENWEBUI_API_KEY"],
          message: "OPENWEBUI_API_KEY is required when OPENWEBUI_BASE_URL is set",
        });
      }
    }

    if (data.OPSBLAZE_OIDC_ISSUER?.trim()) {
      if (!data.OPSBLAZE_OIDC_CLIENT_ID?.trim()) {
        ctx.addIssue({
          code: "custom",
          path: ["OPSBLAZE_OIDC_CLIENT_ID"],
          message: "OPSBLAZE_OIDC_CLIENT_ID is required when OPSBLAZE_OIDC_ISSUER is set",
        });
      }
      if (!data.OPSBLAZE_OIDC_CLIENT_SECRET?.trim()) {
        ctx.addIssue({
          code: "custom",
          path: ["OPSBLAZE_OIDC_CLIENT_SECRET"],
          message: "OPSBLAZE_OIDC_CLIENT_SECRET is required when OPSBLAZE_OIDC_ISSUER is set",
        });
      }
      const secret = data.OPSBLAZE_SESSION_SECRET?.trim() ?? "";
      if (secret.length < 32) {
        ctx.addIssue({
          code: "custom",
          path: ["OPSBLAZE_SESSION_SECRET"],
          message:
            "OPSBLAZE_SESSION_SECRET is required (min 32 characters) when OPSBLAZE_OIDC_ISSUER is set",
        });
      }
      if (!data.OPSBLAZE_OIDC_REDIRECT_URI?.trim()) {
        ctx.addIssue({
          code: "custom",
          path: ["OPSBLAZE_OIDC_REDIRECT_URI"],
          message: "OPSBLAZE_OIDC_REDIRECT_URI is required when OPSBLAZE_OIDC_ISSUER is set",
        });
      }
    }
  });

export type AppEnv = z.infer<typeof envSchema>;

let _validatedEnv: AppEnv | null = null;

/**
 * Validates environment variables against the schema.
 * Returns parsed config or an array of human-readable error strings.
 * On success, caches the result for retrieval via getEnv().
 */
export function validateEnv(): { ok: true; env: AppEnv } | { ok: false; errors: string[] } {
  const result = envSchema.safeParse(process.env);
  if (result.success) {
    _validatedEnv = result.data;
    return { ok: true, env: result.data };
  }

  const errors = result.error.issues.map((issue) => {
    const path = issue.path.join(".");
    return `${path}: ${issue.message}`;
  });
  return { ok: false, errors };
}

/**
 * Returns the validated environment config. Must be called after
 * validateEnv() succeeds — throws if validation hasn't run yet.
 */
export function getEnv(): AppEnv {
  if (!_validatedEnv) {
    throw new Error("getEnv() called before validateEnv() — check startup order");
  }
  return _validatedEnv;
}
