// Creator-owned storage mirrors (additional storage only). Endpoints are allow-listed so a
// user-supplied host can never point the server at internal addresses (SSRF).

export type MirrorProvider = 'r2' | 's3';

export interface MirrorInput {
  provider: MirrorProvider;
  endpointHost: string;
  bucket: string;
  publicBaseUrl: string;
}

const R2_HOST = /^[a-f0-9]{32}(\.eu|\.fedramp)?\.r2\.cloudflarestorage\.com$/;
const S3_HOST_SUFFIXES = ['.amazonaws.com', '.backblazeb2.com', '.wasabisys.com'];
const BUCKET = /^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$/;

export function isLiteralOrPrivateHost(host: string): boolean {
  const h = host.toLowerCase().replace(/^\[|\]$/g, '');
  if (!h || h === 'localhost' || h.endsWith('.localhost') || h.endsWith('.local') || h.endsWith('.internal')) return true;
  if (h.includes(':')) return true; // IPv6 literal
  if (/^[0-9.]+$/.test(h)) return true; // IPv4 literal in any notation
  if (/^0x[0-9a-f]+$/i.test(h)) return true;
  return !h.includes('.');
}

export function validateMirrorInput(input: MirrorInput): string[] {
  const errors: string[] = [];
  const host = input.endpointHost.trim().toLowerCase();
  if (/[/:@?#\s]/.test(host)) errors.push('Endpoint must be a bare host name (no scheme, port or path).');
  else if (input.provider === 'r2' && !R2_HOST.test(host)) errors.push('Cloudflare R2 endpoint must look like <account-id>.r2.cloudflarestorage.com.');
  else if (input.provider === 's3' && (isLiteralOrPrivateHost(host) || !S3_HOST_SUFFIXES.some((s) => host.endsWith(s)))) {
    errors.push('S3 endpoint must be an AWS, Backblaze B2 or Wasabi host.');
  }
  if (!BUCKET.test(input.bucket)) errors.push('Bucket name is not valid.');
  try {
    const url = new URL(input.publicBaseUrl);
    if (url.protocol !== 'https:') errors.push('Public URL must use HTTPS.');
    if (url.username || url.password || url.port) errors.push('Public URL must not contain credentials or a port.');
    if (isLiteralOrPrivateHost(url.hostname)) errors.push('Public URL must be a public domain name.');
  } catch {
    errors.push('Public URL is not a valid URL.');
  }
  return errors;
}

export function normalizeBaseUrl(url: string): string {
  return url.replace(/\/+$/, '');
}

// --- source selection with failover -------------------------------------------------

export interface MirrorSource { id: string; baseUrl: string }

const FAILURES_BEFORE_DOWN = 3;
const QUARANTINE_MS = 5 * 60_000;

export class MirrorHealth {
  private failures = new Map<string, number>();
  private downUntil = new Map<string, number>();
  private now: () => number;
  constructor(now: () => number = () => Date.now()) { this.now = now; }

  recordSuccess(id: string): void { this.failures.delete(id); }
  recordFailure(id: string): void {
    const n = (this.failures.get(id) ?? 0) + 1;
    this.failures.set(id, n);
    if (n >= FAILURES_BEFORE_DOWN) this.quarantine(id);
  }
  /** A hash mismatch means the mirror served wrong bytes: take it out at once. */
  recordTamper(id: string): void { this.quarantine(id); }
  isUp(id: string): boolean {
    const until = this.downUntil.get(id);
    if (until === undefined) return true;
    if (this.now() >= until) { this.downUntil.delete(id); this.failures.delete(id); return true; }
    return false;
  }
  private quarantine(id: string): void { this.downUntil.set(id, this.now() + QUARANTINE_MS); }
}

/** Order of base URLs to try for one segment: healthy mirrors (spread by index), then the origin. */
export function sourceOrder(origin: string, mirrors: MirrorSource[], health: MirrorHealth, segmentIndex: number): string[] {
  const up = mirrors.filter((m) => health.isUp(m.id));
  const rotated = up.length ? up.map((_, i) => up[(i + segmentIndex) % up.length]) : [];
  return [...rotated.map((m) => normalizeBaseUrl(m.baseUrl)), normalizeBaseUrl(origin)];
}
