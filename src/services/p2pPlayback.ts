// Builds a verified, P2P-assisted playback session for one video.
// Trust model: only the server-signed manifest is trusted. The playlist, init segment and media
// segments are accepted only if their hashes match it, whatever source (origin, mirror, peer) served them.
import { createSegmentValidator, sha256Hex, verifyManifest, type ManifestPayload, type SignedManifest } from '../domain/channels/manifest';
import { MirrorHealth, normalizeBaseUrl, sourceOrder, type MirrorSource } from '../domain/channels/mirrors';
import { decideUpload, type DeviceConditions, type SharingSettings, DailyUploadMeter } from '../domain/channels/sharingPolicy';

const env = (import.meta as unknown as { env: Record<string, string | undefined> }).env;

export interface PlaybackInfo { videoId: string; manifestUrl: string; originBase: string; mirrors: MirrorSource[] }
export interface PlaybackStats { bytesOrigin: number; bytesMirror: number; bytesPeer: number; rejectedPieces: number }

export async function fetchPlaybackInfo(videoId: string): Promise<PlaybackInfo> {
  const res = await fetch(`/api/channels/videos/${videoId}/playback`);
  if (!res.ok) throw new Error('video_unavailable');
  return res.json();
}

export async function loadVerifiedManifest(info: PlaybackInfo): Promise<ManifestPayload> {
  const publicKey = env.VITE_CHANNEL_SIGNING_PUBLIC_KEY;
  if (!publicKey) throw new Error('signing_key_missing');
  const res = await fetch(info.manifestUrl, { cache: 'no-store' });
  if (!res.ok) throw new Error('manifest_unavailable');
  const manifest = await verifyManifest((await res.json()) as SignedManifest, publicKey);
  if (manifest.videoId !== info.videoId) throw new Error('manifest_mismatch');
  return manifest;
}

/** Fetch the playlist (always from the origin), check its hash, and rewrite relative URIs to absolute origin URLs. */
export async function verifiedPlaylistUrl(info: PlaybackInfo, manifest: ManifestPayload): Promise<string> {
  const res = await fetch(`${normalizeBaseUrl(info.originBase)}/${manifest.playlistPath}`, { cache: 'no-store' });
  if (!res.ok) throw new Error('playlist_unavailable');
  const text = await res.text();
  if ((await sha256Hex(new TextEncoder().encode(text))) !== manifest.playlistSha256) throw new Error('playlist_hash_mismatch');
  const base = `${normalizeBaseUrl(info.originBase)}/`;
  const abs = text.split('\n').map((line) => {
    const t = line.trim();
    if (t.startsWith('#EXT-X-MAP:')) return line.replace(/URI="([^"]+)"/, (_m, u) => `URI="${base}${u}"`);
    if (t && !t.startsWith('#')) return base + t;
    return line;
  }).join('\n');
  return URL.createObjectURL(new Blob([abs], { type: 'application/vnd.apple.mpegurl' }));
}

export function readDeviceConditions(battery: { level: number; charging: boolean } | null): DeviceConditions {
  const nav = navigator as Navigator & { connection?: { type?: string; effectiveType?: string; saveData?: boolean } };
  const type = nav.connection?.type;
  return {
    connection: type === 'wifi' || type === 'ethernet' ? 'wifi' : type === 'cellular' ? 'cellular' : 'unknown',
    saveData: !!nav.connection?.saveData,
    batteryPct: battery ? Math.round(battery.level * 100) : null,
    charging: battery?.charging ?? false,
    appVisible: document.visibilityState === 'visible',
  };
}

export interface PlayerSession { destroy(): PlaybackStats }

export async function startPlayback(opts: {
  video: HTMLVideoElement; info: PlaybackInfo; manifest: ManifestPayload; sharing: SharingSettings; meter: DailyUploadMeter;
}): Promise<PlayerSession> {
  const { video, info, manifest, sharing, meter } = opts;
  const playlistUrl = await verifiedPlaylistUrl(info, manifest);
  const stats: PlaybackStats = { bytesOrigin: 0, bytesMirror: 0, bytesPeer: 0, rejectedPieces: 0 };
  const health = new MirrorHealth();
  const mirrorForSegment = new Map<string, string>();
  const originBase = `${normalizeBaseUrl(info.originBase)}/`;

  const { default: Hls } = await import('hls.js');
  if (!Hls.isSupported()) {
    // No MSE (rare): native HLS from the origin, no P2P, still verified playlist.
    video.src = playlistUrl;
    return { destroy: () => { URL.revokeObjectURL(playlistUrl); return stats; } };
  }
  const { HlsJsP2PEngine } = await import('p2p-media-loader-hlsjs');
  const validate = createSegmentValidator(manifest, (url) => {
    stats.rejectedPieces += 1;
    const mirrorId = mirrorForSegment.get(url.split('?')[0].split('/').pop() ?? '');
    if (mirrorId) health.recordTamper(mirrorId);
  });
  const trackers = (env.VITE_CHANNEL_TRACKERS || '').split(',').map((s) => s.trim()).filter(Boolean);
  const stun = (env.VITE_CHANNEL_STUN || 'stun:stun.l.google.com:19302').split(',').map((s) => ({ urls: s.trim() }));
  const mirrorMap = new Map(info.mirrors.map((m) => [normalizeBaseUrl(m.baseUrl), m.id]));

  const HlsWithP2P = HlsJsP2PEngine.injectMixin(Hls);
  const hls = new HlsWithP2P({
    maxBufferLength: 20,
    p2p: {
      core: {
        swarmId: `kenz-channels-${info.videoId}`,
        announceTrackers: trackers,
        rtcConfig: { iceServers: stun },
        isP2PDisabled: trackers.length === 0,
        isP2PUploadDisabled: true, // enabled below only when the policy allows
        validateP2PSegment: async (u, r, d) => validate(u, r, d),
        validateHTTPSegment: async (u, r, d) => validate(u, r, d),
        httpRequestSetup: async (url, _range, signal) => {
          const name = url.split('?')[0].split('/').pop() ?? '';
          const idx = Number(name.match(/(\d+)\.m4s$/)?.[1] ?? 0);
          const first = sourceOrder(originBase, info.mirrors, health, idx)[0];
          if (!url.startsWith(originBase) || first === normalizeBaseUrl(originBase)) return null; // default request to origin
          const id = mirrorMap.get(first);
          if (id) mirrorForSegment.set(name, id); else mirrorForSegment.delete(name);
          return new Request(`${first}/${name}`, { signal: signal ?? undefined, mode: 'cors', credentials: 'omit' });
        },
      },
    },
  });
  const engine = (hls as unknown as { p2pEngine: InstanceType<typeof HlsJsP2PEngine> }).p2pEngine;
  engine.addEventListener('onSegmentLoaded', ({ bytesLength, downloadSource, url }: { bytesLength: number; downloadSource: string; url?: string }) => {
    if (downloadSource === 'p2p') stats.bytesPeer += bytesLength;
    else if (url && mirrorForSegment.has(url.split('?')[0].split('/').pop() ?? '')) stats.bytesMirror += bytesLength;
    else stats.bytesOrigin += bytesLength;
  });
  engine.addEventListener('onChunkUploaded', (bytes: number) => {
    meter.add(bytes);
    refreshPolicy();
  });

  let battery: { level: number; charging: boolean } | null = null;
  const refreshPolicy = () => {
    const allow = decideUpload(sharing, readDeviceConditions(battery), meter.total()).allow;
    engine.applyDynamicConfig({ core: { isP2PUploadDisabled: !allow } });
  };
  (navigator as Navigator & { getBattery?: () => Promise<{ level: number; charging: boolean }> }).getBattery?.()
    .then((b) => { battery = b; refreshPolicy(); }).catch(() => refreshPolicy());
  document.addEventListener('visibilitychange', refreshPolicy);
  refreshPolicy();

  hls.loadSource(playlistUrl);
  hls.attachMedia(video);
  return {
    destroy: () => {
      document.removeEventListener('visibilitychange', refreshPolicy);
      hls.destroy();
      URL.revokeObjectURL(playlistUrl);
      return stats;
    },
  };
}
