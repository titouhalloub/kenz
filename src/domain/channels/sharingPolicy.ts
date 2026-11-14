// Opt-in relaying policy. Default is deny; unknown conditions never allow upload.

export interface SharingSettings {
  sharingEnabled: boolean;
  wifiOnly: boolean;
  dailyUploadCapMb: number;
  minBatteryPct: number;
  cacheMb: number;
  dataSaver: boolean;
}

export const DEFAULT_SHARING: SharingSettings = {
  sharingEnabled: false, wifiOnly: true, dailyUploadCapMb: 500, minBatteryPct: 30, cacheMb: 300, dataSaver: false,
};

export interface DeviceConditions {
  connection: 'wifi' | 'cellular' | 'unknown';
  saveData: boolean;
  batteryPct: number | null;
  charging: boolean;
  appVisible: boolean;
}

export type SharingDecision = { allow: true } | { allow: false; reason: 'disabled' | 'hidden' | 'network' | 'data_saver' | 'battery' | 'daily_cap' };

export function decideUpload(settings: SharingSettings, device: DeviceConditions, uploadedTodayBytes: number): SharingDecision {
  if (!settings.sharingEnabled) return { allow: false, reason: 'disabled' };
  // WebView suspends in the background; relaying only happens while the app is open.
  if (!device.appVisible) return { allow: false, reason: 'hidden' };
  if (settings.wifiOnly && device.connection !== 'wifi') return { allow: false, reason: 'network' };
  if (device.connection === 'unknown' && settings.wifiOnly) return { allow: false, reason: 'network' };
  if (settings.dataSaver && device.saveData) return { allow: false, reason: 'data_saver' };
  if (!device.charging && (device.batteryPct === null || device.batteryPct < settings.minBatteryPct)) {
    return { allow: false, reason: 'battery' };
  }
  if (uploadedTodayBytes >= settings.dailyUploadCapMb * 1024 * 1024) return { allow: false, reason: 'daily_cap' };
  return { allow: true };
}

/** Upload accounting that resets on a new UTC day. */
export class DailyUploadMeter {
  private day: string;
  private bytes: number;
  constructor(day = '', bytes = 0) { this.day = day; this.bytes = bytes; }
  private roll(now: Date) {
    const d = now.toISOString().slice(0, 10);
    if (d !== this.day) { this.day = d; this.bytes = 0; }
  }
  add(bytes: number, now = new Date()): void { this.roll(now); this.bytes += Math.max(0, bytes); }
  total(now = new Date()): number { this.roll(now); return this.bytes; }
  snapshot() { return { day: this.day, bytes: this.bytes }; }
}
