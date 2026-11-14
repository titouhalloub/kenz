import { getSupabaseClient } from './supabase';
import { DEFAULT_SHARING, type SharingSettings } from '../domain/channels/sharingPolicy';
import type { VideoKind } from '../domain/channels/limits';

export interface ChannelVideo {
  id: string; authorId: string; authorHandle: string; kind: VideoKind; title: string; description: string;
  locale: 'ar' | 'fr' | 'en'; wilayaCode: string | null; durationMs: number; status: string; createdAt: string;
  likes: number; likedByMe: boolean; followingAuthor: boolean;
}
export interface Result<T> { success: boolean; data?: T; error?: string }
export type FeedMode = 'forYou' | 'following' | 'short' | 'long';

function client() {
  const c = getSupabaseClient();
  if (!c) throw new Error('Supabase is not configured.');
  return c;
}
const fail = (e: unknown): Result<never> => ({ success: false, error: e instanceof Error ? e.message : 'error' });

async function authHeader(): Promise<Record<string, string>> {
  const { data } = await client().auth.getSession();
  const token = data.session?.access_token;
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export async function loadChannelFeed(mode: FeedMode, userId: string | undefined, wilayaCode: string | null): Promise<Result<ChannelVideo[]>> {
  try {
    const supabase = client();
    let following: string[] = [];
    if (userId) {
      const { data } = await supabase.from('channel_follows').select('creator_id').eq('follower_id', userId);
      following = (data ?? []).map((r) => r.creator_id as string);
    }
    let q = supabase.from('channel_videos').select('*').eq('status', 'published').order('created_at', { ascending: false }).limit(40);
    if (mode === 'short' || mode === 'long') q = q.eq('kind', mode);
    if (mode === 'following') {
      if (!following.length) return { success: true, data: [] };
      q = q.in('author_id', following);
    }
    const { data: rows, error } = await q;
    if (error) throw error;
    const videos = rows ?? [];
    const ids = videos.map((v) => v.id as string);
    const authors = [...new Set(videos.map((v) => v.author_id as string))];
    const [{ data: profiles }, { data: likes }] = await Promise.all([
      authors.length ? supabase.from('community_profiles').select('user_id,handle').in('user_id', authors) : Promise.resolve({ data: [] as any[] }),
      ids.length ? supabase.from('channel_video_likes').select('video_id,user_id').in('video_id', ids) : Promise.resolve({ data: [] as any[] }),
    ]);
    const handle = new Map((profiles ?? []).map((p: any) => [p.user_id, p.handle]));
    const out: ChannelVideo[] = videos.map((v) => {
      const vl = (likes ?? []).filter((l: any) => l.video_id === v.id);
      return {
        id: v.id, authorId: v.author_id, authorHandle: handle.get(v.author_id) ?? '—', kind: v.kind, title: v.title, description: v.description,
        locale: v.locale, wilayaCode: v.wilaya_code, durationMs: v.duration_ms, status: v.status, createdAt: v.created_at,
        likes: vl.length, likedByMe: !!userId && vl.some((l: any) => l.user_id === userId), followingAuthor: following.includes(v.author_id),
      };
    });
    if (mode === 'forYou') {
      // Followed creators and the viewer's wilaya first, then newest.
      const score = (v: ChannelVideo) => (v.followingAuthor ? 2 : 0) + (wilayaCode && v.wilayaCode === wilayaCode ? 1 : 0);
      out.sort((a, b) => score(b) - score(a) || (a.createdAt < b.createdAt ? 1 : -1));
    }
    return { success: true, data: out };
  } catch (e) { return fail(e); }
}

export async function uploadChannelVideo(file: File, meta: { kind: VideoKind; title: string; description: string; locale: string; wilaya: string | null }): Promise<Result<{ videoId: string }>> {
  try {
    const params = new URLSearchParams({ kind: meta.kind, title: meta.title, description: meta.description, locale: meta.locale });
    if (meta.wilaya) params.set('wilaya', meta.wilaya);
    const res = await fetch(`/api/channels/uploads?${params}`, { method: 'POST', headers: { ...(await authHeader()), 'Content-Type': file.type || 'video/mp4' }, body: file });
    const json = await res.json().catch(() => ({}));
    return res.ok ? { success: true, data: { videoId: json.videoId } } : { success: false, error: json.error || 'upload_failed' };
  } catch (e) { return fail(e); }
}

export async function toggleVideoLike(videoId: string, userId: string, liked: boolean): Promise<Result<boolean>> {
  try {
    const t = client().from('channel_video_likes');
    const { error } = liked ? await t.delete().eq('video_id', videoId).eq('user_id', userId) : await t.insert({ video_id: videoId, user_id: userId });
    if (error) throw error;
    return { success: true, data: !liked };
  } catch (e) { return fail(e); }
}

export async function toggleFollow(creatorId: string, userId: string, following: boolean): Promise<Result<boolean>> {
  try {
    const t = client().from('channel_follows');
    const { error } = following ? await t.delete().eq('follower_id', userId).eq('creator_id', creatorId) : await t.insert({ follower_id: userId, creator_id: creatorId });
    if (error) throw error;
    return { success: true, data: !following };
  } catch (e) { return fail(e); }
}

export async function reportVideo(videoId: string, userId: string, reason: string, details?: string): Promise<Result<boolean>> {
  try {
    const { error } = await client().from('channel_video_reports').insert({ video_id: videoId, reporter_id: userId, reason, details: details || null });
    if (error) throw error;
    return { success: true, data: true };
  } catch (e) { return fail(e); }
}

export async function loadVideoComments(videoId: string): Promise<Result<Array<{ id: string; authorId: string; body: string; createdAt: string }>>> {
  try {
    const { data, error } = await client().from('channel_video_comments').select('id,author_id,body,created_at').eq('video_id', videoId).order('created_at').limit(100);
    if (error) throw error;
    return { success: true, data: (data ?? []).map((c) => ({ id: c.id, authorId: c.author_id, body: c.body, createdAt: c.created_at })) };
  } catch (e) { return fail(e); }
}

export async function addVideoComment(videoId: string, userId: string, body: string): Promise<Result<boolean>> {
  try {
    const { error } = await client().from('channel_video_comments').insert({ video_id: videoId, author_id: userId, body });
    if (error) throw error;
    return { success: true, data: true };
  } catch (e) { return fail(e); }
}

// --- sharing settings --------------------------------------------------------------------
export async function loadSharingSettings(userId: string): Promise<SharingSettings> {
  try {
    const { data } = await client().from('channel_sharing_settings').select('*').eq('user_id', userId).maybeSingle();
    if (!data) return DEFAULT_SHARING;
    return { sharingEnabled: data.sharing_enabled, wifiOnly: data.wifi_only, dailyUploadCapMb: data.daily_upload_cap_mb, minBatteryPct: data.min_battery_pct, cacheMb: data.cache_mb, dataSaver: data.data_saver };
  } catch { return DEFAULT_SHARING; }
}

export async function saveSharingSettings(userId: string, s: SharingSettings): Promise<Result<boolean>> {
  try {
    const { error } = await client().from('channel_sharing_settings').upsert({
      user_id: userId, sharing_enabled: s.sharingEnabled, wifi_only: s.wifiOnly, daily_upload_cap_mb: s.dailyUploadCapMb,
      min_battery_pct: s.minBatteryPct, cache_mb: s.cacheMb, data_saver: s.dataSaver, updated_at: new Date().toISOString(),
    });
    if (error) throw error;
    return { success: true, data: true };
  } catch (e) { return fail(e); }
}

// --- mirrors -----------------------------------------------------------------------------
export interface StorageMirror { id: string; provider: 'r2' | 's3'; label: string; endpointHost: string; bucket: string; publicBaseUrl: string; status: string; lastError: string | null }

export async function listMirrors(): Promise<Result<StorageMirror[]>> {
  try {
    const { data, error } = await client().from('channel_storage_mirrors').select('id,provider,label,endpoint_host,bucket,public_base_url,status,last_error').order('created_at');
    if (error) throw error;
    return { success: true, data: (data ?? []).map((m) => ({ id: m.id, provider: m.provider, label: m.label, endpointHost: m.endpoint_host, bucket: m.bucket, publicBaseUrl: m.public_base_url, status: m.status, lastError: m.last_error })) };
  } catch (e) { return fail(e); }
}

export async function connectMirror(input: Record<string, string>): Promise<Result<{ mirrorId: string }>> {
  try {
    const res = await fetch('/api/channels/mirrors', { method: 'POST', headers: { ...(await authHeader()), 'Content-Type': 'application/json' }, body: JSON.stringify(input) });
    const json = await res.json().catch(() => ({}));
    return res.ok ? { success: true, data: { mirrorId: json.mirrorId } } : { success: false, error: [json.error, json.detail, ...(json.problems ?? [])].filter(Boolean).join(': ') };
  } catch (e) { return fail(e); }
}

export async function disconnectMirror(id: string): Promise<Result<boolean>> {
  try {
    const res = await fetch(`/api/channels/mirrors/${id}`, { method: 'DELETE', headers: await authHeader() });
    return { success: res.ok, data: res.ok };
  } catch (e) { return fail(e); }
}

// --- moderation --------------------------------------------------------------------------
export async function loadPendingVideos(): Promise<Result<Array<{ id: string; title: string; kind: VideoKind; durationMs: number; authorId: string }>>> {
  try {
    const { data, error } = await client().from('channel_videos').select('id,title,kind,duration_ms,author_id').eq('status', 'pending').order('created_at').limit(50);
    if (error) throw error;
    return { success: true, data: (data ?? []).map((v) => ({ id: v.id, title: v.title, kind: v.kind, durationMs: v.duration_ms, authorId: v.author_id })) };
  } catch (e) { return fail(e); }
}

export async function moderateVideo(id: string, action: 'approve' | 'reject' | 'remove', reason?: string): Promise<Result<boolean>> {
  try {
    const res = await fetch(`/api/channels/videos/${id}/${action}`, { method: 'POST', headers: { ...(await authHeader()), 'Content-Type': 'application/json' }, body: JSON.stringify({ reason }) });
    return { success: res.ok, data: res.ok, error: res.ok ? undefined : 'moderation_failed' };
  } catch (e) { return fail(e); }
}

export async function isModerator(): Promise<boolean> {
  try { const { data } = await client().rpc('is_community_moderator'); return data === true; } catch { return false; }
}
