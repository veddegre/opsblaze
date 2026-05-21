/** Human-readable labels for /api/health check keys. */
export function healthCheckLabel(name: string): string {
  switch (name) {
    case "openwebui":
      return "Open WebUI";
    case "claude":
      return "Claude";
    case "splunk":
      return "Splunk";
    default:
      return name.charAt(0).toUpperCase() + name.slice(1);
  }
}
