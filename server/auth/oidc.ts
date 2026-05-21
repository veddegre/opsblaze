import * as oidc from "openid-client";
import type { Configuration } from "openid-client";
import { logger } from "../logger.js";

export interface OidcEnvConfig {
  issuer: string;
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  scopes: string;
  adminEmails: Set<string>;
}

let cachedConfig: Configuration | null = null;

export function isOidcEnabled(): boolean {
  return Boolean(process.env.OPSBLAZE_OIDC_ISSUER?.trim());
}

export function loadOidcEnv(): OidcEnvConfig | null {
  const issuer = process.env.OPSBLAZE_OIDC_ISSUER?.trim();
  const clientId = process.env.OPSBLAZE_OIDC_CLIENT_ID?.trim();
  const clientSecret = process.env.OPSBLAZE_OIDC_CLIENT_SECRET?.trim();
  if (!issuer || !clientId || !clientSecret) return null;

  const publicUrl = (
    process.env.OPSBLAZE_PUBLIC_URL?.trim() ||
    `http://${process.env.HOST === "0.0.0.0" ? "localhost" : (process.env.HOST ?? "127.0.0.1")}:${process.env.PORT ?? "3000"}`
  ).replace(/\/+$/, "");

  const redirectUri =
    process.env.OPSBLAZE_OIDC_REDIRECT_URI?.trim() || `${publicUrl}/api/auth/callback`;

  const scopes =
    process.env.OPSBLAZE_OIDC_SCOPES?.trim() || "openid profile email";

  const adminEmails = new Set(
    (process.env.OPSBLAZE_OIDC_ADMIN_EMAILS ?? "")
      .split(",")
      .map((e) => e.trim().toLowerCase())
      .filter(Boolean)
  );

  return { issuer, clientId, clientSecret, redirectUri, scopes, adminEmails };
}

export async function getOidcConfiguration(): Promise<Configuration> {
  if (cachedConfig) return cachedConfig;

  const env = loadOidcEnv();
  if (!env) {
    throw new Error("OIDC is not configured");
  }

  cachedConfig = await oidc.discovery(
    new URL(env.issuer),
    env.clientId,
    env.clientSecret
  );

  logger.info({ issuer: env.issuer, redirectUri: env.redirectUri }, "OIDC discovery complete");
  return cachedConfig;
}

export function resolveAdmin(
  adminEmails: Set<string>,
  email: string | undefined
): boolean {
  if (!email) return false;
  return adminEmails.has(email.trim().toLowerCase());
}

export async function buildLoginRedirectUrl(
  config: Configuration,
  env: OidcEnvConfig,
  session: { codeVerifier: string; state?: string }
): Promise<string> {
  const codeVerifier = oidc.randomPKCECodeVerifier();
  const codeChallenge = await oidc.calculatePKCECodeChallenge(codeVerifier);
  session.codeVerifier = codeVerifier;

  const params: Record<string, string> = {
    redirect_uri: env.redirectUri,
    scope: env.scopes,
    code_challenge: codeChallenge,
    code_challenge_method: "S256",
  };

  const meta = config.serverMetadata();
  if (typeof meta.supportsPKCE === "function" && !meta.supportsPKCE()) {
    const state = oidc.randomState();
    session.state = state;
    params.state = state;
  }

  const url = oidc.buildAuthorizationUrl(config, params);
  return url.href;
}

export async function exchangeCallback(
  config: Configuration,
  callbackUrl: URL,
  session: { codeVerifier: string; state?: string }
): Promise<{ sub: string; email?: string; name?: string }> {
  const checks: { pkceCodeVerifier: string; expectedState?: string } = {
    pkceCodeVerifier: session.codeVerifier,
  };
  if (session.state) {
    checks.expectedState = session.state;
  }

  const tokens = await oidc.authorizationCodeGrant(config, callbackUrl, checks);

  const claims = tokens.claims();
  if (claims?.sub) {
    return {
      sub: String(claims.sub),
      email: claims.email ? String(claims.email) : undefined,
      name: claims.name ? String(claims.name) : undefined,
    };
  }

  if (tokens.access_token) {
    try {
      const info = await oidc.fetchUserInfo(
        config,
        tokens.access_token,
        oidc.skipSubjectCheck
      );
      return {
        sub: info.sub,
        email: info.email,
        name: info.name,
      };
    } catch (err) {
      logger.warn({ err }, "OIDC userinfo fetch failed after token grant");
    }
  }

  throw new Error("OIDC token response did not include a subject");
}

export { oidc };
