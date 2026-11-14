// Signed video manifests and segment verification for P2P-assisted delivery.
// Peers and creator mirrors are untrusted: every segment must match a hash in a
// manifest signed by the Kenz server (ECDSA P-256, public key pinned in the app).

export const MANIFEST_VERSION = 1 as const;

export interface ManifestSegment { path: string; sha256: string; bytes: number }

export interface ManifestPayload {
  v: typeof MANIFEST_VERSION;
  videoId: string;
  createdAt: string;
  segmentDurationMs: number;
  playlistPath: string;
  playlistSha256: string;
  segments: ManifestSegment[];
}

export interface SignedManifest { payload: string; signature: string }

const HEX64 = /^[0-9a-f]{64}$/;
const SAFE_PATH = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;

function toBytes(data: ArrayBuffer | Uint8Array): Uint8Array {
  return data instanceof Uint8Array ? data : new Uint8Array(data);
}
function bufferOf(bytes: Uint8Array): ArrayBuffer {
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}

export async function sha256Hex(data: ArrayBuffer | Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', bufferOf(toBytes(data)));
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
}

export function base64ToBytes(value: string): Uint8Array {
  const clean = value.replace(/-/g, '+').replace(/_/g, '/');
  const bin = atob(clean);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i += 1) out[i] = bin.charCodeAt(i);
  return out;
}
export function bytesToBase64(bytes: Uint8Array): string {
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin);
}

/** Deterministic JSON: object keys sorted, no whitespace. */
export function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonicalJson(v)}`).join(',')}}`;
}

export function validateManifestPayload(value: unknown): ManifestPayload {
  const p = value as ManifestPayload;
  if (!p || typeof p !== 'object' || p.v !== MANIFEST_VERSION) throw new Error('Unsupported manifest version.');
  if (typeof p.videoId !== 'string' || !/^[0-9a-f-]{36}$/i.test(p.videoId)) throw new Error('Bad video id.');
  if (!SAFE_PATH.test(p.playlistPath) || !HEX64.test(p.playlistSha256)) throw new Error('Bad playlist entry.');
  if (!Number.isInteger(p.segmentDurationMs) || p.segmentDurationMs < 500 || p.segmentDurationMs > 30000) {
    throw new Error('Bad segment duration.');
  }
  if (!Array.isArray(p.segments) || p.segments.length === 0 || p.segments.length > 5000) throw new Error('Bad segment list.');
  const seen = new Set<string>();
  for (const s of p.segments) {
    if (!SAFE_PATH.test(s.path) || !HEX64.test(s.sha256) || !Number.isInteger(s.bytes) || s.bytes <= 0) {
      throw new Error('Bad segment entry.');
    }
    if (seen.has(s.path)) throw new Error('Duplicate segment path.');
    seen.add(s.path);
  }
  return p;
}

export function buildManifest(input: Omit<ManifestPayload, 'v'>): ManifestPayload {
  return validateManifestPayload({ v: MANIFEST_VERSION, ...input });
}

const ECDSA = { name: 'ECDSA', hash: 'SHA-256' } as const;

export async function signManifest(payload: ManifestPayload, privateKeyPkcs8Base64: string): Promise<SignedManifest> {
  validateManifestPayload(payload);
  const key = await crypto.subtle.importKey(
    'pkcs8', bufferOf(base64ToBytes(privateKeyPkcs8Base64)), { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign'],
  );
  const text = canonicalJson(payload);
  const sig = await crypto.subtle.sign(ECDSA, key, bufferOf(new TextEncoder().encode(text)));
  return { payload: text, signature: bytesToBase64(new Uint8Array(sig)) };
}

export async function verifyManifest(signed: SignedManifest, publicKeySpkiBase64: string): Promise<ManifestPayload> {
  const key = await crypto.subtle.importKey(
    'spki', bufferOf(base64ToBytes(publicKeySpkiBase64)), { name: 'ECDSA', namedCurve: 'P-256' }, false, ['verify'],
  );
  const ok = await crypto.subtle.verify(
    ECDSA, key, bufferOf(base64ToBytes(signed.signature)), bufferOf(new TextEncoder().encode(signed.payload)),
  );
  if (!ok) throw new Error('Manifest signature is invalid.');
  const parsed = validateManifestPayload(JSON.parse(signed.payload));
  if (canonicalJson(parsed) !== signed.payload) throw new Error('Manifest is not canonical.');
  return parsed;
}

export async function generateSigningKeyPair(): Promise<{ privateKeyPkcs8: string; publicKeySpki: string }> {
  const pair = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
  const priv = new Uint8Array(await crypto.subtle.exportKey('pkcs8', pair.privateKey));
  const pub = new Uint8Array(await crypto.subtle.exportKey('spki', pair.publicKey));
  return { privateKeyPkcs8: bytesToBase64(priv), publicKeySpki: bytesToBase64(pub) };
}

/** Returns a validator for P2P Media Loader: accepts a segment only if its hash is in the signed manifest. */
export function createSegmentValidator(
  manifest: ManifestPayload,
  onReject?: (url: string, reason: 'unknown' | 'mismatch') => void,
): (url: string, byteRange: unknown, data: ArrayBuffer) => Promise<boolean> {
  const byName = new Map(manifest.segments.map((s) => [s.path, s]));
  return async (url, _byteRange, data) => {
    const name = url.split('?')[0].split('/').pop() ?? '';
    const entry = byName.get(name);
    if (!entry) { onReject?.(url, 'unknown'); return false; }
    if (data.byteLength !== entry.bytes || (await sha256Hex(data)) !== entry.sha256) {
      onReject?.(url, 'mismatch');
      return false;
    }
    return true;
  };
}
