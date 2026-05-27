import type { AdminSource } from "./auth";

export function adminSourceLabel(
  source: AdminSource | undefined,
  matchedAdminGroup?: string
): string {
  switch (source) {
    case "all_users_admin":
      return "Administrator — OPSBLAZE_OIDC_ALL_USERS_ADMIN is enabled";
    case "admin_email":
      return "Administrator — your email is listed in OPSBLAZE_OIDC_ADMIN_EMAILS";
    case "admin_group":
      return matchedAdminGroup
        ? `Administrator — IdP group “${matchedAdminGroup}” matches OPSBLAZE_OIDC_ADMIN_GROUPS`
        : "Administrator — an IdP group matches OPSBLAZE_OIDC_ADMIN_GROUPS";
    case "local_mode":
      return "Local mode — single-user deployment (full access)";
    case "none":
      return "Standard user — not in admin emails or configured admin groups";
    default:
      return "Unknown";
  }
}
