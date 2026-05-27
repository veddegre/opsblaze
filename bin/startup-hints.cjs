/**
 * Diagnostics for production startup / crash-loop issues.
 */

const fs = require("fs");

function envFileMode(envPath) {
  try {
    return fs.statSync(envPath).mode & 0o777;
  } catch {
    return null;
  }
}

function isEnvFileTooPermissive(envPath) {
  const mode = envFileMode(envPath);
  if (mode == null) return false;
  return (mode & 0o077) !== 0;
}

function secureEnvFile(envPath) {
  if (!fs.existsSync(envPath)) return false;
  fs.chmodSync(envPath, 0o600);
  return true;
}

function tailLogLines(logPath, maxLines = 15) {
  if (!fs.existsSync(logPath)) return [];
  const lines = fs.readFileSync(logPath, "utf-8").split("\n").filter(Boolean);
  return lines.slice(-maxLines);
}

/** @returns {string[]} */
function hintsFromErrLog(lines) {
  const text = lines.join("\n");
  const hints = [];
  if (/readable by other users|chmod 600/i.test(text)) {
    hints.push("Run: chmod 600 .env  (production refuses group/world-readable .env)");
  }
  if (/Startup validation failed/i.test(text)) {
    hints.push("Fix startup errors above, then: node bin/opsblaze.cjs restart");
  }
  if (/Claude CLI not found|not logged in/i.test(text)) {
    hints.push(
      "Configure an LLM: set OPENWEBUI_* or ANTHROPIC_API_KEY in .env, or install and log in to Claude CLI"
    );
  }
  if (/HOST is not loopback|OPSBLAZE_LOCAL_MODE/i.test(text)) {
    hints.push(
      "For remote bind (HOST=0.0.0.0): set OPSBLAZE_LOCAL_MODE=true or configure OPSBLAZE_OIDC_*"
    );
  }
  if (/SPLUNK_HOST|env:/i.test(text) && /required/i.test(text)) {
    hints.push("Complete Splunk settings in .env (run node bin/setup.cjs to reconfigure)");
  }
  if (/EADDRINUSE|Port .* is already in use/i.test(text)) {
    hints.push("Free the port: node bin/opsblaze.cjs stop");
  }
  if (/Cannot find module|dist\/server/i.test(text)) {
    hints.push("Rebuild: npm run build");
  }
  return hints;
}

module.exports = {
  envFileMode,
  isEnvFileTooPermissive,
  secureEnvFile,
  tailLogLines,
  hintsFromErrLog,
};
