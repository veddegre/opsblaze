import type { Express } from "express";
import session from "express-session";
import { logger } from "../logger.js";
import { isRequestAdmin, requireAdmin, requireAuth } from "./middleware.js";
import { isOidcEnabled, loadOidcEnv } from "./oidc.js";
import { authRouter } from "./routes.js";

export { getRequestUser, getRequestUserId, LOCAL_USER_ID, sanitizeUserId } from "./types.js";
export { isOidcEnabled, isRequestAdmin, requireAdmin, requireAuth };

export function setupAuth(app: Express): void {
  const oidcEnv = loadOidcEnv();

  if (isOidcEnabled()) {
    const secret = process.env.OPSBLAZE_SESSION_SECRET?.trim();
    if (!secret || secret.length < 32) {
      throw new Error(
        "OPSBLAZE_SESSION_SECRET is required (min 32 characters) when OPSBLAZE_OIDC_ISSUER is set"
      );
    }

    const trustProxy =
      process.env.OPSBLAZE_TRUST_PROXY === "true" || process.env.NODE_ENV === "production";
    if (trustProxy) {
      app.set("trust proxy", 1);
    }

    const secureCookies =
      process.env.OPSBLAZE_SECURE_COOKIES === "true" ||
      (process.env.NODE_ENV === "production" && process.env.OPSBLAZE_SECURE_COOKIES !== "false");

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

    logger.info(
      {
        issuer: oidcEnv?.issuer,
        redirectUri: oidcEnv?.redirectUri,
        secureCookies,
        trustProxy,
      },
      "OIDC authentication enabled"
    );
  } else {
    logger.info("OIDC disabled — single-user local mode (conversations under user 'local')");
  }

  app.use("/api/auth", authRouter);
  app.use("/api", requireAuth);
}
