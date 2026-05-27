import type { Request } from "express";
import { ipKeyGenerator } from "express-rate-limit";
import { isAuthRequired } from "./auth/mode.js";
import { getRequestUserId } from "./auth/types.js";

/** Per authenticated user when auth is on; per IP in open single-user mode. */
export function rateLimitKey(req: Request): string {
  if (isAuthRequired()) {
    return `user:${getRequestUserId(req)}`;
  }
  const ip = req.ip || req.socket.remoteAddress || "unknown";
  return `ip:${ipKeyGenerator(ip)}`;
}
