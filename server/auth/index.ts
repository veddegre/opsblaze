import type { Express } from "express";
import session from "express-session";
import { logger } from "../logger.js";
import { getAuthMode, isAuthRequired } from "./mode.js";
import { isRequestAdmin, requireAdmin, requireAuth } from "./middleware.js";
import { isLocalAuthEnabled } from "./local-auth.js";
import { isOidcEnabled, loadOidcEnv } from "./oidc.js";
import { authRouter } from "./routes.js";
import { resolveSecureCookies, resolveTrustProxy } from "./session-cookies.js";

export { resolveSecureCookies, resolveTrustProxy } from "./session-cookies.js";

export { getRequestUser, getRequestUserId, LOCAL_USER_ID, sanitizeUserId } from "./types.js";
export { getAuthMode, isAuthRequired } from "./mode.js";
export { isLocalAuthEnabled, validateLocalAuthFile } from "./local-auth.js";
export { hashPassword } from "./password.js";
export { isOidcEnabled, isRequestAdmin, requireAdmin, requireAuth };

function sessionSecret(): string | null {
  const secret = process.env.OPSBLAZE_SESSION_SECRET?.trim();
  if (!secret || secret.length < 32) return null;
  return secret;
}

function configureSession(app: Express, label: string): void {
  const secret = sessionSecret();
  if (!secret) {
    throw new Error(
      "OPSBLAZE_SESSION_SECRET is required (min 32 characters) when authentication is enabled"
    );
  }

  const trustProxy = resolveTrustProxy();
  if (trustProxy) {
    app.set("trust proxy", 1);
  }

  const secureCookies = resolveSecureCookies();

  app.use(
    session({
      name: "opsblaze.sid",
      secret,
      resave: false,
      saveUninitialized: false,
      cookie: {
        httpOnly: true,
        secure: secureCookies,
        sameSite: "lax",
        maxAge: 24 * 60 * 60 * 1000,
      },
    })
  );

  logger.info({ label, secureCookies, trustProxy }, "session authentication enabled");
}

export function setupAuth(app: Express): void {
  const mode = getAuthMode();

  if (mode === "oidc") {
    configureSession(app, "oidc");
    const oidcEnv = loadOidcEnv();
    logger.info(
      {
        issuer: oidcEnv?.issuer,
        redirectUri: oidcEnv?.redirectUri,
      },
      "OIDC authentication enabled"
    );
  } else if (mode === "local") {
    configureSession(app, "local");
    logger.info(
      { usersFile: process.env.OPSBLAZE_LOCAL_AUTH_FILE?.trim() },
      "local username/password authentication enabled"
    );
  } else {
    logger.info("authentication disabled — open local mode (conversations under user 'local')");
  }

  app.use("/api/auth", authRouter);
  app.use("/api", requireAuth);
}
