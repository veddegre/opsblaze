/**
 * SSRF protections for HTTP/SSE MCP server URLs.
 * Blocks private/reserved IPs and well-known internal hostnames.
 */

const BLOCKED_HOSTNAMES = new Set(["localhost", "metadata.google.internal", "metadata.goog"]);

function normalizeHostname(hostname: string): string {
  const h = hostname.toLowerCase();
  if (h.startsWith("[") && h.endsWith("]")) {
    return h.slice(1, -1);
  }
  return h;
}

function parseIpv4(host: string): number[] | null {
  const parts = host.split(".");
  if (parts.length !== 4) return null;
  const nums = parts.map((p) => Number(p));
  if (nums.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) return null;
  return nums;
}

function isPrivateOrReservedIpv4(host: string): boolean {
  const parts = parseIpv4(host);
  if (!parts) return false;
  const [a, b] = parts;
  if (a === 10) return true;
  if (a === 127) return true;
  if (a === 0) return true;
  if (a === 169 && b === 254) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT
  return false;
}

function isBlockedIpv6(host: string): boolean {
  const h = host.toLowerCase();
  if (h === "::1" || h === "0:0:0:0:0:0:0:1") return true;
  if (h.startsWith("fe80:")) return true; // link-local
  if (h.startsWith("fc") || h.startsWith("fd")) return true; // unique local
  if (h.startsWith("::ffff:")) {
    const v4 = h.slice("::ffff:".length);
    if (parseIpv4(v4)) return isPrivateOrReservedIpv4(v4);
  }
  return false;
}

export function assertAllowedMcpRemoteUrl(urlString: string): void {
  let parsed: URL;
  try {
    parsed = new URL(urlString);
  } catch {
    throw new Error("url must be a valid URL");
  }

  if (!["http:", "https:"].includes(parsed.protocol)) {
    throw new Error("url must use http or https protocol");
  }

  const hostname = normalizeHostname(parsed.hostname);

  if (BLOCKED_HOSTNAMES.has(hostname)) {
    throw new Error("url hostname is not allowed for security reasons");
  }

  if (hostname.endsWith(".localhost") || hostname.endsWith(".local")) {
    throw new Error("url hostname is not allowed for security reasons");
  }

  if (parseIpv4(hostname)) {
    if (isPrivateOrReservedIpv4(hostname)) {
      throw new Error("url must not target private or reserved IP addresses");
    }
    return;
  }

  if (hostname.includes(":") && isBlockedIpv6(hostname)) {
    throw new Error("url must not target private or reserved IP addresses");
  }
}
