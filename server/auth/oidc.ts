import * as oidc from "openid-client";
import type { Configuration } from "openid-client";
import { logger } from "../logger.js";
import {
  extractGroupsFromClaims,
  parseCsvEnvSet,
  resolveAdminDetails,
  type AdminResolution,
} from "./roles.js";

export interface OidcEnvConfig {
  issuer: string;
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  scopes: string;
  adminEmails: Set<string>;
  adminGroups: Set<string>;
  /** When true, every authenticated OIDC user receives admin (e.g. IT Security–only deployment). */
  allUsersAdmin: boolean;
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

  const adminEmails = parseCsvEnvSet(process.env.OPSBLAZE_OIDC_ADMIN_EMAILS);
  const adminGroups = parseCsvEnvSet(process.env.OPSBLAZE_OIDC_ADMIN_GROUPS);
  const allUsersAdmin = process.env.OPSBLAZE_OIDC_ALL_USERS_ADMIN === "true";

  return {
    issuer,
    clientId,
    clientSecret,
    redirectUri,
    scopes,
    adminEmails,
    adminGroups,
    allUsersAdmin,
  };
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

export function resolveAdminAccess(
  env: Pick<OidcEnvConfig, "adminEmails" | "adminGroups" | "allUsersAdmin">,
  profile: { email?: string; groups: string[] }
): AdminResolution {
  return resolveAdminDetails({
    adminEmails: env.adminEmails,
    adminGroups: env.adminGroups,
    allUsersAdmin: env.allUsersAdmin,
    email: profile.email,
    groups: profile.groups,
  });
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
): Promise<{ sub: string; email?: string; name?: string; groups: string[] }> {
  const checks: { pkceCodeVerifier: string; expectedState?: string } = {
    pkceCodeVerifier: session.codeVerifier,
  };
  if (session.state) {
    checks.expectedState = session.state;
  }

  const tokens = await oidc.authorizationCodeGrant(config, callbackUrl, checks);

  const claims = tokens.claims() as Record<string, unknown> | null | undefined;
  const accessToken = tokens.access_token;

  function pickString(obj: Record<string, unknown>, keys: string[]): string | undefined {
    for (const k of keys) {
      const v = obj[k];
      if (typeof v === "string" && v.trim()) return v.trim();
    }
    return undefined;
  }

  function buildName(obj: Record<string, unknown>): string | undefined {
    const direct = pickString(obj, ["name", "display_name", "preferred_username"]);
    if (direct) return direct;
    const given = pickString(obj, ["given_name", "first_name", "given"]);
    const family = pickString(obj, ["family_name", "last_name", "surname", "family"]);
    const combined = [given, family].filter(Boolean).join(" ");
    if (combined) return combined;
    return undefined;
  }

  function buildEmail(obj: Record<string, unknown>): string | undefined {
    // Many IdPs use different email-like claim names; admins can match either one.
    return pickString(obj, ["email", "mail", "upn", "preferred_username"]);
  }

  const subFromClaims = claims ? pickString(claims, ["sub"]) : undefined;
  const emailFromClaims = claims ? buildEmail(claims) : undefined;
  const nameFromClaims = claims ? buildName(claims) : undefined;

  // Some providers put `sub` in the token but `email` in UserInfo (or vice versa),
  // so we optionally fetch UserInfo when email/name is missing.
  if (accessToken) {
    try {
      const info = (await oidc.fetchUserInfo(
        config,
        accessToken,
        oidc.skipSubjectCheck
      )) as Record<string, unknown> & { sub?: unknown };

      const sub = subFromClaims ?? pickString(info, ["sub"]);
      const email = emailFromClaims ?? buildEmail(info);
      const name = nameFromClaims ?? buildName(info);

      if (sub) {
        const groups = extractGroupsFromClaims(info);
        return {
          sub: String(sub),
          email,
          name,
          groups,
        };
      }
    } catch (err) {
      logger.warn({ err }, "OIDC userinfo fetch failed after token grant");
    }
  }

  if (!subFromClaims) {
    throw new Error("OIDC token response did not include a subject");
  }

  const groups = claims ? extractGroupsFromClaims(claims) : [];

  return {
    sub: String(subFromClaims),
    email: emailFromClaims,
    name: nameFromClaims,
    groups,
  };
}

export { oidc };
