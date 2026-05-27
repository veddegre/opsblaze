import { parseCsvEnvSet } from "./roles.js";

export interface AdminPolicy {
  adminEmails: Set<string>;
  adminGroups: Set<string>;
  adminUsernames: Set<string>;
  allUsersAdmin: boolean;
}

/** Shared admin rules for OIDC and local authentication. */
export function loadAdminPolicy(): AdminPolicy {
  const adminGroups = parseCsvEnvSet(
    process.env.OPSBLAZE_ADMIN_GROUPS ?? process.env.OPSBLAZE_OIDC_ADMIN_GROUPS
  );
  const adminEmails = parseCsvEnvSet(process.env.OPSBLAZE_OIDC_ADMIN_EMAILS);
  const adminUsernames = parseCsvEnvSet(
    process.env.OPSBLAZE_LOCAL_AUTH_ADMIN_USERS ?? process.env.OPSBLAZE_ADMIN_USERS
  );
  const allUsersAdmin = process.env.OPSBLAZE_OIDC_ALL_USERS_ADMIN === "true";
  return { adminGroups, adminEmails, adminUsernames, allUsersAdmin };
}
