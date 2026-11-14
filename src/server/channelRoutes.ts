import express from 'express';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { DeleteObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { randomUUID } from 'node:crypto';
import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { signManifest, sha256Hex } from '../domain/channels/manifest.ts';
import { normalizeBaseUrl, validateMirrorInput, type MirrorProvider } from '../domain/channels/mirrors.ts';
import { VIDEO_LIMITS, validateUpload, type VideoKind } from '../domain/channels/limits.ts';
import { manifestFromHls, probeDurationMs, transcodeToHls, type HlsOutput } from './videoPipeline.ts';
import { openCredentials, sealCredentials } from './credentialVault.ts';

const STAGING = 'channel-staging';
const ORIGIN = 'channel-origin';
const UPLOADS_PER_HOUR = 5;
const uploadLog = new Map<string, number[]>();

function serviceClient(): SupabaseClient | null {
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

function userClient(token: string): SupabaseClient | null {
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const key = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { global: { headers: { Authorization: `Bearer ${token}` } }, auth: { persistSession: false, autoRefreshToken: false } });
}

function privateAddress(ip: string): boolean {
  if (isIP(ip) === 6) {
    const l = ip.toLowerCase();
    return l === '::1' || l.startsWith('fc') || l.startsWith('fd') || l.startsWith('fe80') || l.startsWith('::ffff:');
  }
  const [a, b] = ip.split('.').map(Number);
  return a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127);
}

async function assertPublicHost(host: string): Promise<void> {
  const addrs = await lookup(host, { all: true });
  if (!addrs.length || addrs.some((a) => privateAddress(a.address))) throw new Error('Host resolves to a private address.');
}

function s3For(provider: MirrorProvider, host: string, creds: { accessKeyId: string; secretAccessKey: string }): S3Client {
  const region = provider === 'r2' ? 'auto' : host.match(/^s3\.([a-z0-9-]+)\./)?.[1] ?? 'us-east-1';
  return new S3Client({ endpoint: `https://${host}`, region, credentials: creds, forcePathStyle: true });
}

const MIME: Record<string, string> = { m3u8: 'application/vnd.apple.mpegurl', m4s: 'video/iso.segment', mp4: 'video/mp4', json: 'application/json' };
const mimeOf = (name: string) => MIME[name.split('.').pop() ?? ''] ?? 'application/octet-stream';

export interface ChannelRouteDeps {
  requireAuth: express.RequestHandler;
}

export function registerChannelRoutes(app: express.Express, { requireAuth }: ChannelRouteDeps): void {
  const need = (res: express.Response): string | null => {
    const id = res.locals.authUserId as string | undefined;
    if (!id) { res.status(401).json({ success: false, error: 'auth_required' }); return null; }
    return id;
  };
  const isModerator = async (res: express.Response): Promise<boolean> => {
    const client = userClient(res.locals.accessToken as string);
    if (!client) return false;
    const { data } = await client.rpc('is_community_moderator');
    return data === true;
  };

  // --- upload -> transcode -> hash -> stage (private) -> pending review --------------------
  app.post('/api/channels/uploads', requireAuth,
    express.raw({ type: 'video/*', limit: VIDEO_LIMITS.maxUploadBytes + 1024 }), async (req, res) => {
      const userId = need(res); if (!userId) return;
      const svc = serviceClient();
      if (!svc || !process.env.CHANNEL_SIGNING_PRIVATE_KEY) return res.status(503).json({ success: false, error: 'channels_not_configured' });
      const now = Date.now();
      const recent = (uploadLog.get(userId) ?? []).filter((t) => now - t < 3_600_000);
      if (recent.length >= UPLOADS_PER_HOUR) return res.status(429).json({ success: false, error: 'rate_limited' });
      uploadLog.set(userId, [...recent, now]);

      const kind = String(req.query.kind) as VideoKind;
      const title = String(req.query.title ?? '').trim();
      const description = String(req.query.description ?? '').slice(0, 2000);
      const locale = ['ar', 'fr', 'en'].includes(String(req.query.locale)) ? String(req.query.locale) : 'fr';
      const wilaya = /^[0-9]{2,3}$/.test(String(req.query.wilaya ?? '')) ? String(req.query.wilaya) : null;
      if (!['short', 'long'].includes(kind) || title.length < 3 || title.length > 120) return res.status(400).json({ success: false, error: 'bad_request' });
      const body = req.body as Buffer;
      if (!Buffer.isBuffer(body) || body.length === 0) return res.status(400).json({ success: false, error: 'empty' });

      const tmp = await mkdtemp(path.join(tmpdir(), 'kenz-up-'));
      try {
        const input = path.join(tmp, 'input');
        await writeFile(input, body);
        const durationMs = await probeDurationMs(input);
        const problems = validateUpload({ kind, durationMs, sizeBytes: body.length, mime: String(req.header('content-type')).split(';')[0] });
        if (problems.length) return res.status(422).json({ success: false, error: problems[0], problems });

        const videoId = randomUUID();
        const hls = await transcodeToHls(input, path.join(tmp, 'hls'));
        for (const f of hls.files) {
          const { error } = await svc.storage.from(STAGING).upload(`${videoId}/${f.name}`, await readFile(path.join(hls.dir, f.name)), { contentType: mimeOf(f.name), upsert: false });
          if (error) throw new Error(`staging upload failed: ${error.message}`);
        }
        const { error } = await svc.from('channel_videos').insert({
          id: videoId, author_id: userId, kind, title, description, locale, wilaya_code: wilaya,
          duration_ms: durationMs, size_bytes: hls.files.reduce((n, f) => n + f.bytes, 0), status: 'pending',
        });
        if (error) throw new Error(error.message);
        return res.status(202).json({ success: true, videoId, status: 'pending' });
      } catch (e) {
        console.error('channel upload failed:', e instanceof Error ? e.message : e);
        return res.status(500).json({ success: false, error: 'processing_failed' });
      } finally {
        await rm(tmp, { recursive: true, force: true });
      }
    });

  // --- moderator approval: re-hash staged bytes, sign, publish to the public origin ---------
  app.post('/api/channels/videos/:id/approve', requireAuth, async (req, res) => {
    const userId = need(res); if (!userId) return;
    if (!(await isModerator(res))) return res.status(403).json({ success: false, error: 'moderator_only' });
    const svc = serviceClient();
    const priv = process.env.CHANNEL_SIGNING_PRIVATE_KEY;
    if (!svc || !priv) return res.status(503).json({ success: false, error: 'channels_not_configured' });
    const id = req.params.id;
    const { data: video } = await svc.from('channel_videos').select('id,author_id,status').eq('id', id).maybeSingle();
    if (!video || video.status !== 'pending') return res.status(409).json({ success: false, error: 'not_pending' });
    try {
      const { data: list, error: listErr } = await svc.storage.from(STAGING).list(id, { limit: 1000 });
      if (listErr || !list?.length) throw new Error('no staged files');
      const files: HlsOutput['files'] = [];
      const blobs = new Map<string, Buffer>();
      for (const item of list) {
        const { data, error } = await svc.storage.from(STAGING).download(`${id}/${item.name}`);
        if (error || !data) throw new Error(`download ${item.name}`);
        const buf = Buffer.from(await data.arrayBuffer());
        blobs.set(item.name, buf);
        files.push({ name: item.name, bytes: buf.length, sha256: await sha256Hex(buf) });
      }
      const manifest = manifestFromHls(id, { dir: '', files, playlistName: 'index.m3u8' });
      const signed = await signManifest(manifest, priv);
      for (const [name, buf] of blobs) {
        const { error } = await svc.storage.from(ORIGIN).upload(`${id}/${name}`, buf, { contentType: mimeOf(name), upsert: true });
        if (error) throw new Error(`origin upload ${name}`);
      }
      const manifestBytes = Buffer.from(JSON.stringify(signed));
      const { error: mErr } = await svc.storage.from(ORIGIN).upload(`${id}/manifest.json`, manifestBytes, { contentType: 'application/json', upsert: true });
      if (mErr) throw new Error('manifest upload');
      await svc.from('channel_videos').update({
        status: 'published', manifest_path: `${id}/manifest.json`, manifest_sha256: await sha256Hex(manifestBytes),
        reviewed_by: userId, reviewed_at: new Date().toISOString(), updated_at: new Date().toISOString(),
      }).eq('id', id);
      await svc.storage.from(STAGING).remove([...blobs.keys()].map((n) => `${id}/${n}`));
      void mirrorVideo(svc, id, video.author_id as string, [...blobs.entries()]);
      return res.json({ success: true });
    } catch (e) {
      console.error('approve failed:', e instanceof Error ? e.message : e);
      return res.status(500).json({ success: false, error: 'approve_failed' });
    }
  });

  // --- reject / remove: moderator only; also deletes public copies --------------------------
  app.post('/api/channels/videos/:id/:decision(reject|remove)', requireAuth, async (req, res) => {
    if (!need(res)) return;
    if (!(await isModerator(res))) return res.status(403).json({ success: false, error: 'moderator_only' });
    const svc = serviceClient();
    const user = userClient(res.locals.accessToken as string);
    if (!svc || !user) return res.status(503).json({ success: false, error: 'channels_not_configured' });
    const id = req.params.id;
    const decision = req.params.decision === 'reject' ? 'rejected' : 'removed';
    const { error } = await user.rpc('channel_moderate_video', { p_video_id: id, p_decision: decision, p_reason: String(req.body?.reason ?? '').slice(0, 300) || null });
    if (error) return res.status(400).json({ success: false, error: 'moderation_failed' });
    await purgeVideoFiles(svc, id);
    return res.json({ success: true });
  });

  // --- playback info: signed manifest location, origin base, healthy mirrors ----------------
  app.get('/api/channels/videos/:id/playback', async (req, res) => {
    const svc = serviceClient();
    if (!svc) return res.status(503).json({ success: false, error: 'channels_not_configured' });
    const { data: video } = await svc.from('channel_videos').select('id,author_id,status,manifest_path').eq('id', req.params.id).maybeSingle();
    if (!video || video.status !== 'published' || !video.manifest_path) return res.status(404).json({ success: false, error: 'not_found' });
    const base = svc.storage.from(ORIGIN).getPublicUrl(`${video.id}/x`).data.publicUrl.replace(/x$/, '');
    const { data: copies } = await svc.from('channel_video_mirror_copies')
      .select('mirror_id, channel_storage_mirrors!inner(id,public_base_url,status)').eq('video_id', video.id).eq('status', 'copied');
    const mirrors = (copies ?? []).map((c: any) => c.channel_storage_mirrors)
      .filter((m: any) => m && m.status === 'healthy')
      .map((m: any) => ({ id: m.id as string, baseUrl: `${normalizeBaseUrl(m.public_base_url)}/${video.id}/` }));
    res.setHeader('Cache-Control', 'public, max-age=30');
    return res.json({ success: true, videoId: video.id, manifestUrl: `${base}manifest.json`, originBase: base, mirrors });
  });

  // --- connect additional storage (S3-compatible) -------------------------------------------
  app.post('/api/channels/mirrors', requireAuth, async (req, res) => {
    const userId = need(res); if (!userId) return;
    const svc = serviceClient();
    if (!svc || !process.env.CHANNEL_MASTER_KEY) return res.status(503).json({ success: false, error: 'channels_not_configured' });
    const b = req.body ?? {};
    const input = { provider: b.provider as MirrorProvider, endpointHost: String(b.endpointHost ?? '').trim().toLowerCase(), bucket: String(b.bucket ?? ''), publicBaseUrl: normalizeBaseUrl(String(b.publicBaseUrl ?? '')) };
    const label = String(b.label ?? '').trim().slice(0, 60);
    const creds = { accessKeyId: String(b.accessKeyId ?? ''), secretAccessKey: String(b.secretAccessKey ?? '') };
    if (!['r2', 's3'].includes(input.provider) || !label || !creds.accessKeyId || !creds.secretAccessKey) return res.status(400).json({ success: false, error: 'bad_request' });
    const problems = validateMirrorInput(input);
    if (problems.length) return res.status(422).json({ success: false, error: 'invalid_mirror', problems });
    const { count } = await svc.from('channel_storage_mirrors').select('id', { count: 'exact', head: true }).eq('owner_id', userId);
    if ((count ?? 0) >= 3) return res.status(409).json({ success: false, error: 'mirror_limit' });
    const mirrorId = randomUUID();
    try {
      await assertPublicHost(input.endpointHost);
      await assertPublicHost(new URL(input.publicBaseUrl).hostname);
      // Write + read-back probe proves the key can write and the public URL serves the bucket.
      const probeKey = `_kenz_probe/${mirrorId}.txt`;
      const client = s3For(input.provider, input.endpointHost, creds);
      await client.send(new PutObjectCommand({ Bucket: input.bucket, Key: probeKey, Body: 'kenz', ContentType: 'text/plain' }));
      const r = await fetch(`${input.publicBaseUrl}/${probeKey}`, { redirect: 'error', signal: AbortSignal.timeout(8000) });
      await client.send(new DeleteObjectCommand({ Bucket: input.bucket, Key: probeKey })).catch(() => undefined);
      if (!r.ok || (await r.text()) !== 'kenz') throw new Error('public url does not serve the bucket');
    } catch (e) {
      return res.status(422).json({ success: false, error: 'mirror_check_failed', detail: e instanceof Error ? e.message.slice(0, 160) : 'check failed' });
    }
    const { error } = await svc.from('channel_storage_mirrors').insert({
      id: mirrorId, owner_id: userId, provider: input.provider, label, endpoint_host: input.endpointHost, bucket: input.bucket,
      public_base_url: input.publicBaseUrl, credentials_ciphertext: sealCredentials(creds, mirrorId), status: 'healthy', last_check_at: new Date().toISOString(),
    });
    if (error) return res.status(400).json({ success: false, error: 'save_failed' });
    return res.status(201).json({ success: true, mirrorId });
  });

  app.delete('/api/channels/mirrors/:id', requireAuth, async (req, res) => {
    const userId = need(res); if (!userId) return;
    const svc = serviceClient();
    if (!svc) return res.status(503).json({ success: false, error: 'channels_not_configured' });
    await svc.from('channel_storage_mirrors').delete().eq('id', req.params.id).eq('owner_id', userId);
    return res.json({ success: true });
  });
}

async function purgeVideoFiles(svc: SupabaseClient, videoId: string): Promise<void> {
  for (const bucket of [STAGING, ORIGIN]) {
    const { data } = await svc.storage.from(bucket).list(videoId, { limit: 1000 });
    if (data?.length) await svc.storage.from(bucket).remove(data.map((f) => `${videoId}/${f.name}`));
  }
  const { data: copies } = await svc.from('channel_video_mirror_copies')
    .select('mirror_id, channel_storage_mirrors!inner(provider,endpoint_host,bucket,credentials_ciphertext)').eq('video_id', videoId).eq('status', 'copied');
  for (const c of (copies ?? []) as any[]) {
    const m = c.channel_storage_mirrors;
    try {
      const client = s3For(m.provider, m.endpoint_host, openCredentials(m.credentials_ciphertext, c.mirror_id));
      await Promise.all(['index.m3u8', 'init.mp4', 'manifest.json'].map((n) => client.send(new DeleteObjectCommand({ Bucket: m.bucket, Key: `${videoId}/${n}` })).catch(() => undefined)));
      await deleteSegments(client, m.bucket, videoId);
    } catch { /* best effort; origin copy is already gone, viewers will no longer be pointed at the mirror */ }
    await svc.from('channel_video_mirror_copies').update({ status: 'deleted', updated_at: new Date().toISOString() }).eq('video_id', videoId).eq('mirror_id', c.mirror_id);
  }
}

async function deleteSegments(client: S3Client, bucket: string, videoId: string): Promise<void> {
  // Segments use a fixed naming scheme (seg_000.m4s, …); keys are deleted in order until a run of misses.
  // S3 DeleteObject succeeds for absent keys, so stop after the stored count instead: callers pass a cap.
  for (let i = 0; i < 260; i += 1) {
    await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: `${videoId}/seg_${String(i).padStart(3, '0')}.m4s` })).catch(() => undefined);
  }
}

/** Copy an approved video to each healthy mirror owned by its creator. Failures never block publishing. */
async function mirrorVideo(svc: SupabaseClient, videoId: string, authorId: string, blobs: Array<[string, Buffer]>): Promise<void> {
  const { data: mirrors } = await svc.from('channel_storage_mirrors').select('*').eq('owner_id', authorId).eq('status', 'healthy');
  for (const m of (mirrors ?? []) as any[]) {
    await svc.from('channel_video_mirror_copies').upsert({ video_id: videoId, mirror_id: m.id, status: 'queued' });
    try {
      const client = s3For(m.provider, m.endpoint_host, openCredentials(m.credentials_ciphertext, m.id));
      for (const [name, buf] of blobs) await client.send(new PutObjectCommand({ Bucket: m.bucket, Key: `${videoId}/${name}`, Body: buf, ContentType: mimeOf(name), CacheControl: 'public, max-age=31536000, immutable' }));
      await svc.from('channel_video_mirror_copies').update({ status: 'copied', updated_at: new Date().toISOString() }).eq('video_id', videoId).eq('mirror_id', m.id);
    } catch (e) {
      await svc.from('channel_video_mirror_copies').update({ status: 'failed', updated_at: new Date().toISOString() }).eq('video_id', videoId).eq('mirror_id', m.id);
      await svc.from('channel_storage_mirrors').update({ status: 'degraded', last_error: (e instanceof Error ? e.message : 'copy failed').slice(0, 300), last_check_at: new Date().toISOString() }).eq('id', m.id);
    }
  }
}
