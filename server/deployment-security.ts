import type { AppEnv } from "./env.js";
import { isLocalAuthEnabled } from "./auth/local-auth.js";
import { isOidcEnabled } from "./auth/oidc.js";

function isLoopbackHost(host: string): boolean {
  const h = host.toLowerCase();
  return h === "127.0.0.1" || h === "localhost" || h === "::1" || h === "[::1]";
}

/**
 * Post-schema checks for unsafe deployment combinations.
 */
export function validateDeploymentSecurity(env: AppEnv): string[] {
  const errors: string[] = [];
  const oidc = isOidcEnabled();
  const localAuth = isLocalAuthEnabled();
  const localMode = env.OPSBLAZE_LOCAL_MODE;
  const loopback = isLoopbackHost(env.HOST);

  if (oidc && localAuth) {
    errors.push(
      "OPSBLAZE_OIDC_ISSUER and OPSBLAZE_LOCAL_AUTH_FILE cannot both be set — choose OIDC or local authentication"
    );
  }

  if (!oidc && !localAuth && !loopback && !localMode) {
    errors.push(
      "HOST is not loopback but no authentication is configured. " +
        "Set OPSBLAZE_OIDC_ISSUER, OPSBLAZE_LOCAL_AUTH_FILE, or OPSBLAZE_LOCAL_MODE=true (open lab mode only)."
    );
  }

  if (localAuth) {
    const secret = process.env.OPSBLAZE_SESSION_SECRET?.trim() ?? "";
    if (secret.length < 32) {
      errors.push(
        "OPSBLAZE_SESSION_SECRET is required (min 32 characters) when OPSBLAZE_LOCAL_AUTH_FILE is set"
      );
    }
  }

  if (oidc && !env.OPSBLAZE_OIDC_REDIRECT_URI?.trim()) {
    errors.push(
      "OPSBLAZE_OIDC_REDIRECT_URI is required when OPSBLAZE_OIDC_ISSUER is set " +
        "(must match your IdP app registration exactly)."
    );
  }

  return errors;
}
