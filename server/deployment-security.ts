import type { AppEnv } from "./env.js";
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
  const localMode = env.OPSBLAZE_LOCAL_MODE;
  const loopback = isLoopbackHost(env.HOST);

  if (!oidc && !loopback && !localMode) {
    errors.push(
      "HOST is not loopback but OPSBLAZE_OIDC_ISSUER is unset. " +
        "Set OPSBLAZE_OIDC_ISSUER for network deployments, or OPSBLAZE_LOCAL_MODE=true " +
        "to acknowledge insecure single-user mode."
    );
  }

  if (oidc && !env.OPSBLAZE_OIDC_REDIRECT_URI?.trim()) {
    errors.push(
      "OPSBLAZE_OIDC_REDIRECT_URI is required when OPSBLAZE_OIDC_ISSUER is set " +
        "(must match your IdP app registration exactly)."
    );
  }

  return errors;
}
