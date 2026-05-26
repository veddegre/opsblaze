import type { Request } from "express";
import { isOidcEnabled } from "./auth/oidc.js";
import { getRequestUserId } from "./auth/types.js";

/** Per authenticated user when OIDC is on; per IP in local / single-user mode. */
export function rateLimitKey(req: Request): string {
  if (isOidcEnabled()) {
    return `user:${getRequestUserId(req)}`;
  }
  const ip = req.ip || req.socket.remoteAddress || "unknown";
  return `ip:${ip}`;
}
