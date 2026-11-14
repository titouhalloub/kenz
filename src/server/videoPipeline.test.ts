import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { randomBytes } from 'node:crypto';
import { manifestFromHls, probeDurationMs, transcodeToHls } from './videoPipeline';
import { createSegmentValidator, generateSigningKeyPair, signManifest, verifyManifest } from '../domain/channels/manifest';
import { openCredentials, sealCredentials } from './credentialVault';

const hasFfmpeg = (() => { try { execFileSync('ffmpeg', ['-version'], { stdio: 'ignore' }); return true; } catch { return false; } })();

describe.skipIf(!hasFfmpeg)('video pipeline (ffmpeg)', () => {
  it('turns a clip into signed, hash-verifiable HLS', async () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'kenz-vid-'));
    const input = path.join(dir, 'in.mp4');
    execFileSync('ffmpeg', ['-y', '-f', 'lavfi', '-i', 'testsrc=size=320x240:rate=25', '-f', 'lavfi', '-i', 'sine=frequency=440', '-t', '10', '-pix_fmt', 'yuv420p', input], { stdio: 'ignore' });
    const dur = await probeDurationMs(input);
    expect(dur).toBeGreaterThan(9000);
    const out = await transcodeToHls(input, path.join(dir, 'hls'));
    const manifest = manifestFromHls('22222222-2222-4222-8222-222222222222', out);
    expect(manifest.segments.filter((s) => s.path.endsWith('.m4s')).length).toBeGreaterThanOrEqual(2);
    const keys = await generateSigningKeyPair();
    const verified = await verifyManifest(await signManifest(manifest, keys.privateKeyPkcs8), keys.publicKeySpki);
    const validate = createSegmentValidator(verified);
    const first = verified.segments.find((s) => s.path.endsWith('.m4s'))!;
    const bytes = readFileSync(path.join(out.dir, first.path));
    const ab = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
    expect(await validate(`https://x/${first.path}`, undefined, ab)).toBe(true);
    const bad = new Uint8Array(ab.slice(0)); bad[10] ^= 0xff;
    expect(await validate(`https://x/${first.path}`, undefined, bad.buffer as ArrayBuffer)).toBe(false);
  }, 60_000);
});

describe('credential vault', () => {
  const k = randomBytes(32);
  it('round-trips and binds to the mirror id', () => {
    const sealed = sealCredentials({ accessKeyId: 'AK', secretAccessKey: 'SK' }, 'm1', k);
    expect(sealed).not.toContain('SK');
    expect(openCredentials(sealed, 'm1', k)).toEqual({ accessKeyId: 'AK', secretAccessKey: 'SK' });
    expect(() => openCredentials(sealed, 'm2', k)).toThrow();
  });
});
