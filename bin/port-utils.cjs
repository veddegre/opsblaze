/**
 * Cross-platform port → PID lookup (macOS lsof, Linux ss/fuser fallbacks).
 */

const { spawnSync } = require("child_process");

function parsePids(stdout) {
  if (!stdout || !stdout.trim()) return [];
  return stdout
    .trim()
    .split(/\s+/)
    .map((p) => parseInt(p, 10))
    .filter((p) => !isNaN(p) && p > 0);
}

function pidsOnPort(port) {
  try {
    const result = spawnSync("lsof", ["-i", `:${port}`, "-t"], {
      encoding: "utf-8",
      timeout: 3000,
    });
    const pids = parsePids(result.stdout);
    if (pids.length > 0) return pids;
  } catch {
    /* lsof missing or failed */
  }

  try {
    const result = spawnSync("ss", ["-ltnp"], { encoding: "utf-8", timeout: 5000 });
    if (result.stdout) {
      const pids = new Set();
      const portRe = new RegExp(`:${port}\\b`);
      for (const line of result.stdout.split("\n")) {
        if (!portRe.test(line)) continue;
        for (const m of line.matchAll(/pid=(\d+)/g)) {
          pids.add(parseInt(m[1], 10));
        }
      }
      if (pids.size > 0) return [...pids];
    }
  } catch {
    /* ss not available */
  }

  try {
    const result = spawnSync("fuser", [`${port}/tcp`], {
      encoding: "utf-8",
      timeout: 3000,
    });
    const combined = `${result.stdout || ""} ${result.stderr || ""}`;
    const colon = combined.indexOf(":");
    if (colon >= 0) {
      const pids = parsePids(combined.slice(colon + 1));
      if (pids.length > 0) return pids;
    }
  } catch {
    /* fuser not available */
  }

  return [];
}

function portInUse(port) {
  return pidsOnPort(port).length > 0;
}

module.exports = { pidsOnPort, portInUse };
