import { describe, expect, it } from 'vitest';
import {
  buildManifest, canonicalJson, createSegmentValidator, generateSigningKeyPair, sha256Hex, signManifest, verifyManifest,
} from './manifest';
import { MirrorHealth, sourceOrder, validateMirrorInput } from './mirrors';
import { DEFAULT_SHARING, DailyUploadMeter, decideUpload, type DeviceConditions } from './sharingPolicy';
import { validateUpload } from './limits';

const enc = (s: string) => new TextEncoder().encode(s);
const VID = '11111111-1111-4111-8111-111111111111';

async function sample() {
  const seg = enc('segment-bytes');
  const manifest = buildManifest({
    videoId: VID, createdAt: '2026-11-14T00:00:00Z', segmentDurationMs: 4000,
    playlistPath: 'index.m3u8', playlistSha256: await sha256Hex(enc('#EXTM3U')),
    segments: [{ path: 'seg_000.m4s', sha256: await sha256Hex(seg), bytes: seg.byteLength }],
  });
  return { seg, manifest };
}

describe('manifest signing', () => {
  it('round-trips and rejects tampering', async () => {
    const keys = await generateSigningKeyPair();
    const { manifest } = await sample();
    const signed = await signManifest(manifest, keys.privateKeyPkcs8);
    expect((await verifyManifest(signed, keys.publicKeySpki)).videoId).toBe(VID);
    const tampered = { ...signed, payload: signed.payload.replace('4000', '5000') };
    await expect(verifyManifest(tampered, keys.publicKeySpki)).rejects.toThrow();
    const other = await generateSigningKeyPair();
    await expect(verifyManifest(signed, other.publicKeySpki)).rejects.toThrow();
  });
  it('canonical json sorts keys', () => {
    expect(canonicalJson({ b: 1, a: [2, { d: 1, c: 2 }] })).toBe('{"a":[2,{"c":2,"d":1}],"b":1}');
  });
  it('rejects unsafe segment paths and duplicates', async () => {
    const { manifest } = await sample();
    expect(() => buildManifest({ ...manifest, segments: [{ ...manifest.segments[0], path: '../x' }] })).toThrow();
    expect(() => buildManifest({ ...manifest, segments: [manifest.segments[0], manifest.segments[0]] })).toThrow();
  });
});

describe('segment validator', () => {
  it('accepts only bytes matching the signed hash', async () => {
    const { seg, manifest } = await sample();
    const rejected: string[] = [];
    const validate = createSegmentValidator(manifest, (_u, r) => rejected.push(r));
    expect(await validate('https://peer/x/seg_000.m4s?t=1', undefined, seg.buffer.slice(0) as ArrayBuffer)).toBe(true);
    expect(await validate('https://m/seg_000.m4s', undefined, enc('segment-byteX').buffer as ArrayBuffer)).toBe(false);
    expect(await validate('https://m/other.m4s', undefined, seg.buffer.slice(0) as ArrayBuffer)).toBe(false);
    expect(rejected).toEqual(['mismatch', 'unknown']);
  });
});

describe('mirror endpoints (SSRF guard)', () => {
  const ok = { provider: 'r2' as const, endpointHost: `${'a'.repeat(32)}.r2.cloudflarestorage.com`, bucket: 'kenz-videos', publicBaseUrl: 'https://media.example.dz/v' };
  it('accepts a valid R2 mirror', () => expect(validateMirrorInput(ok)).toEqual([]));
  it.each([
    ['localhost', 'localhost'], ['ip', '169.254.169.254'], ['path', 'a.amazonaws.com/x'], ['port', 'a.amazonaws.com:8443'],
    ['other host', 'evil.example.com'],
  ])('rejects s3 endpoint: %s', (_n, host) => {
    expect(validateMirrorInput({ ...ok, provider: 's3', endpointHost: host }).length).toBeGreaterThan(0);
  });
  it('rejects non-https, ip and private public URLs', () => {
    for (const url of ['http://media.example.dz', 'https://10.0.0.1/x', 'https://127.1', 'https://[::1]/', 'https://u:p@media.example.dz', 'https://intranet']) {
      expect(validateMirrorInput({ ...ok, publicBaseUrl: url }).length, url).toBeGreaterThan(0);
    }
  });
});

describe('mirror failover', () => {
  it('puts the origin last and drops quarantined mirrors', () => {
    let now = 0;
    const health = new MirrorHealth(() => now);
    const mirrors = [{ id: 'a', baseUrl: 'https://a/' }, { id: 'b', baseUrl: 'https://b' }];
    expect(sourceOrder('https://o/', mirrors, health, 0)).toEqual(['https://a', 'https://b', 'https://o']);
    expect(sourceOrder('https://o/', mirrors, health, 1)).toEqual(['https://b', 'https://a', 'https://o']);
    health.recordTamper('a');
    expect(sourceOrder('https://o', mirrors, health, 0)).toEqual(['https://b', 'https://o']);
    now += 6 * 60_000;
    expect(health.isUp('a')).toBe(true);
    health.recordFailure('b'); health.recordFailure('b'); expect(health.isUp('b')).toBe(true);
    health.recordFailure('b'); expect(health.isUp('b')).toBe(false);
    health.recordFailure('a'); health.recordSuccess('a'); health.recordFailure('a'); health.recordFailure('a');
    expect(health.isUp('a')).toBe(true);
  });
  it('falls back to origin only when there are no mirrors', () => {
    expect(sourceOrder('https://o', [], new MirrorHealth(), 3)).toEqual(['https://o']);
  });
});

describe('sharing policy', () => {
  const on = { ...DEFAULT_SHARING, sharingEnabled: true };
  const dev: DeviceConditions = { connection: 'wifi', saveData: false, batteryPct: 80, charging: false, appVisible: true };
  it('is off by default', () => expect(decideUpload(DEFAULT_SHARING, dev, 0)).toEqual({ allow: false, reason: 'disabled' }));
  it('allows on wifi with battery and quota', () => expect(decideUpload(on, dev, 0)).toEqual({ allow: true }));
  it.each([
    [{ appVisible: false }, 'hidden'], [{ connection: 'cellular' as const }, 'network'], [{ connection: 'unknown' as const }, 'network'],
    [{ batteryPct: 10 }, 'battery'], [{ batteryPct: null }, 'battery'],
  ])('denies %j', (patch, reason) => expect(decideUpload(on, { ...dev, ...patch }, 0)).toEqual({ allow: false, reason }));
  it('low battery is fine while charging; daily cap enforced', () => {
    expect(decideUpload(on, { ...dev, batteryPct: 5, charging: true }, 0).allow).toBe(true);
    expect(decideUpload(on, dev, 500 * 1024 * 1024)).toEqual({ allow: false, reason: 'daily_cap' });
  });
  it('data saver blocks when enabled', () => {
    expect(decideUpload({ ...on, dataSaver: true }, { ...dev, saveData: true }, 0)).toEqual({ allow: false, reason: 'data_saver' });
  });
  it('meter resets on a new day', () => {
    const m = new DailyUploadMeter();
    m.add(100, new Date('2026-11-14T10:00:00Z'));
    expect(m.total(new Date('2026-11-14T23:59:00Z'))).toBe(100);
    expect(m.total(new Date('2026-11-15T00:01:00Z'))).toBe(0);
  });
});

describe('upload limits', () => {
  it('enforces kind-specific durations and size', () => {
    const base = { mime: 'video/mp4', sizeBytes: 1000 };
    expect(validateUpload({ ...base, kind: 'short', durationMs: 60_000 })).toEqual([]);
    expect(validateUpload({ ...base, kind: 'short', durationMs: 91_000 })).toEqual(['too_long']);
    expect(validateUpload({ ...base, kind: 'long', durationMs: 60_000 })).toEqual(['not_long']);
    expect(validateUpload({ ...base, kind: 'long', durationMs: 16 * 60_000 })).toEqual(['too_long']);
    expect(validateUpload({ mime: 'application/pdf', sizeBytes: 300 * 1024 * 1024, kind: 'short', durationMs: 1000 }).sort()).toEqual(['too_large', 'unsupported_type']);
  });
});
