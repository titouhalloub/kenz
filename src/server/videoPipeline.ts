import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdir, readdir, readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { buildManifest, type ManifestPayload } from '../domain/channels/manifest.ts';
import { VIDEO_LIMITS } from '../domain/channels/limits.ts';

function run(cmd: string, args: string[], timeoutMs: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let out = ''; let err = '';
    const timer = setTimeout(() => { child.kill('SIGKILL'); reject(new Error(`${cmd} timed out`)); }, timeoutMs);
    child.stdout.on('data', (d) => { out += d; });
    child.stderr.on('data', (d) => { err = (err + d).slice(-2000); });
    child.on('error', (e) => { clearTimeout(timer); reject(e); });
    child.on('close', (code) => {
      clearTimeout(timer);
      if (code === 0) resolve(out); else reject(new Error(`${cmd} exited ${code}: ${err.slice(-300)}`));
    });
  });
}

export async function probeDurationMs(input: string): Promise<number> {
  const out = await run('ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'format=duration', '-of', 'json', input], 30_000);
  const seconds = Number(JSON.parse(out)?.format?.duration);
  if (!Number.isFinite(seconds) || seconds <= 0) throw new Error('No playable video stream.');
  return Math.round(seconds * 1000);
}

export interface HlsOutput {
  dir: string;
  files: Array<{ name: string; bytes: number; sha256: string }>;
  playlistName: string;
}

/** One rendition, fMP4 HLS with ~4 s segments aligned on keyframes. Strips metadata (location, etc.). */
export async function transcodeToHls(input: string, outDir: string): Promise<HlsOutput> {
  await mkdir(outDir, { recursive: true });
  const seg = VIDEO_LIMITS.segmentDurationMs / 1000;
  await run('ffmpeg', [
    '-nostdin', '-y', '-i', input, '-map', '0:v:0', '-map', '0:a:0?', '-map_metadata', '-1',
    '-vf', 'scale=-2:480,fps=25', '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '28', '-profile:v', 'main', '-pix_fmt', 'yuv420p',
    '-g', String(25 * seg), '-keyint_min', String(25 * seg), '-sc_threshold', '0',
    '-c:a', 'aac', '-b:a', '64k', '-ac', '2',
    '-f', 'hls', '-hls_time', String(seg), '-hls_playlist_type', 'vod', '-hls_flags', 'independent_segments',
    '-hls_segment_type', 'fmp4', '-hls_fmp4_init_filename', 'init.mp4',
    '-hls_segment_filename', path.join(outDir, 'seg_%03d.m4s'), path.join(outDir, 'index.m3u8'),
  ], 10 * 60_000);
  const names = (await readdir(outDir)).sort();
  const files = [];
  for (const name of names) {
    const buf = await readFile(path.join(outDir, name));
    files.push({ name, bytes: (await stat(path.join(outDir, name))).size, sha256: createHash('sha256').update(buf).digest('hex') });
  }
  if (!files.some((f) => f.name === 'index.m3u8') || !files.some((f) => f.name === 'init.mp4')) throw new Error('Transcode produced no playlist.');
  return { dir: outDir, files, playlistName: 'index.m3u8' };
}

export function manifestFromHls(videoId: string, out: HlsOutput, createdAt = new Date().toISOString()): ManifestPayload {
  const playlist = out.files.find((f) => f.name === out.playlistName)!;
  return buildManifest({
    videoId, createdAt, segmentDurationMs: VIDEO_LIMITS.segmentDurationMs,
    playlistPath: playlist.name, playlistSha256: playlist.sha256,
    segments: out.files.filter((f) => f.name !== out.playlistName).map((f) => ({ path: f.name, sha256: f.sha256, bytes: f.bytes })),
  });
}
