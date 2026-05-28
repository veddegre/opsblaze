export interface ProviderIpResult {
  provider: "virustotal" | "abuseipdb";
  ip: string;
  ok: boolean;
  summary: string;
  link?: string;
  details?: Record<string, unknown>;
  error?: string;
}

export interface EnrichIpsResult {
  providersUsed: Array<"virustotal" | "abuseipdb">;
  skippedPrivate: string[];
  /** IPs in configured organization internal ranges (env + runtime settings). */
  skippedInternal: string[];
  skippedInvalid: string[];
  truncated: boolean;
  results: ProviderIpResult[];
}
