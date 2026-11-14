// In the browser/PWA the API is same-origin. In the Android app (Capacitor) pages load from
// https://localhost, so API calls must go to the deployed server set at build time.
const base = ((import.meta as unknown as { env: Record<string, string | undefined> }).env?.VITE_API_BASE_URL || '').replace(/\/+$/, '');
export const apiUrl = (path: string): string => `${base}${path}`;
