/** Maps server limit `setting` values to Runtime settings UI labels. */
export function runtimeSettingLabel(serverSetting: string): string {
  switch (serverSetting) {
    case "Max Turns":
      return "Max steps per investigation";
    case "Timeout":
      return "Time limit";
    default:
      return serverSetting;
  }
}
