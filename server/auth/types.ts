import type { Request } from "express";

/** Stable local user when OIDC is disabled (single-user / dev mode). */
export const LOCAL_USER_ID = "local";

export interface AuthUser {
  id: string;
  email?: string;
  name?: string;
  isAdmin: boolean;
}

export interface PublicAuthUser {
  id: string;
  email?: string;
  name?: string;
  isAdmin: boolean;
}

export function toPublicUser(user: AuthUser): PublicAuthUser {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    isAdmin: user.isAdmin,
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
