/**
 * Session cookie flags for express-session.
 *
 * Secure cookies are only enabled when explicitly requested or when
 * OPSBLAZE_PUBLIC_URL is https:// — not merely because NODE_ENV=production.
 * Otherwise HTTP LAN deployments (typical for local auth labs) never persist
 * the session and every /api call returns 401 after login.
 */
export function resolveSecureCookies(): boolean {
  const raw = process.env.OPSBLAZE_SECURE_COOKIES?.trim().toLowerCase();
  if (raw === "true" || raw === "1") return true;
  if (raw === "false" || raw === "0") return false;

  const publicUrl = process.env.OPSBLAZE_PUBLIC_URL?.trim();
  if (publicUrl?.toLowerCase().startsWith("https://")) return true;

  return false;
}

export function resolveTrustProxy(): boolean {
  const raw = process.env.OPSBLAZE_TRUST_PROXY?.trim().toLowerCase();
  if (raw === "true" || raw === "1") return true;
  if (raw === "false" || raw === "0") return false;
  return process.env.NODE_ENV === "production";
}
