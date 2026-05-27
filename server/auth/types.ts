import type { Request } from "express";
import type { AdminSource } from "./roles.js";

/** Stable local user when OIDC is disabled (single-user / dev mode). */
export const LOCAL_USER_ID = "local";

export interface AuthUser {
  id: string;
  email?: string;
  name?: string;
  isAdmin: boolean;
  /** IdP groups/roles from the last login (OIDC only). */
  groups?: string[];
  adminSource?: AdminSource;
  matchedAdminGroup?: string;
}

export interface PublicAuthUser {
  id: string;
  email?: string;
  name?: string;
  isAdmin: boolean;
  groups?: string[];
  adminSource?: AdminSource;
  matchedAdminGroup?: string;
}

export function toPublicUser(user: AuthUser): PublicAuthUser {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    isAdmin: user.isAdmin,
    groups: user.groups,
    adminSource: user.adminSource,
    matchedAdminGroup: user.matchedAdminGroup,
  };
}

/** Sanitize OIDC `sub` (or similar) for use as a directory name. */
export function sanitizeUserId(raw: string): string {
  const trimmed = raw.trim().slice(0, 128);
  const safe = trimmed.replace(/[^a-zA-Z0-9._-]/g, "_");
  return safe || LOCAL_USER_ID;
}

export function getRequestUserId(req: Request): string {
  const sessionUser = req.session?.user as AuthUser | undefined;
  if (sessionUser?.id) return sanitizeUserId(sessionUser.id);
  return LOCAL_USER_ID;
}

export function getRequestUser(req: Request): AuthUser | null {
  const sessionUser = req.session?.user as AuthUser | undefined;
  return sessionUser ?? null;
}

declare module "express-session" {
  interface SessionData {
    oidc?: {
      codeVerifier: string;
      state?: string;
    };
    user?: AuthUser;
  }
}
