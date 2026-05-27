import { isLocalAuthEnabled } from "./local-auth.js";
import { isOidcEnabled } from "./oidc.js";

export type AuthMode = "oidc" | "local" | "open";

export function getAuthMode(): AuthMode {
  if (isOidcEnabled()) return "oidc";
  if (isLocalAuthEnabled()) return "local";
  return "open";
}

/** True when users must sign in (OIDC or local credentials). */
export function isAuthRequired(): boolean {
  return getAuthMode() !== "open";
}
