"use strict";

const fs = require("fs");

/**
 * Parse a .env file into a plain object (does not mutate process.env).
 * Handles comments, blank lines, optional quotes, and Windows CRLF.
 */
function loadEnvFile(envPath) {
  const extraEnv = {};
  if (!fs.existsSync(envPath)) return extraEnv;

  const content = fs.readFileSync(envPath, "utf-8");
  for (const line of content.split("\n")) {
    let trimmed = line.trim();
    if (trimmed.startsWith("\ufeff")) trimmed = trimmed.slice(1);
    if (trimmed.startsWith("export ")) trimmed = trimmed.slice(7).trim();
    if (!trimmed || trimmed.startsWith("#")) continue;

    const eq = trimmed.indexOf("=");
    if (eq <= 0) continue;

    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();

    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    if (/^[A-Z_][A-Z0-9_]*$/.test(key)) {
      extraEnv[key] = value;
    }
  }

  return extraEnv;
}

module.exports = { loadEnvFile };
