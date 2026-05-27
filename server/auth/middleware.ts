import type { Request, Response, NextFunction } from "express";
import { isAuthRequired } from "./mode.js";
import { getRequestUser, type AuthUser } from "./types.js";

export function isRequestAdmin(req: Request): boolean {
  if (!isAuthRequired()) return true;
  return getRequestUser(req)?.isAdmin ?? false;
}

/** Paths relative to the `/api` mount (see Express `req.path`). */
export function isPublicApiPath(path: string): boolean {
  return path === "/health" || path.startsWith("/auth/");
}

export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  if (!isAuthRequired()) {
    next();
    return;
  }

  if (isPublicApiPath(req.path)) {
    next();
    return;
  }

  const user = req.session?.user as AuthUser | undefined;
  if (!user?.id) {
    res.status(401).json({ error: "Unauthorized", code: "auth_required" });
    return;
  }

  next();
}

export function requireAdmin(req: Request, res: Response, next: NextFunction): void {
  if (!isAuthRequired()) {
    next();
    return;
  }

  const user = req.session?.user as AuthUser | undefined;
  if (!user?.isAdmin) {
    res.status(403).json({ error: "Admin access required", code: "admin_required" });
    return;
  }

  next();
}
