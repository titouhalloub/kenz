import { getSupabaseClient } from './supabase';

export interface KenzChannel {
  id: string; owner_id: string; name: string; slug: string; description: string;
  category: string; avatar_url: string | null; is_public: boolean; created_at: string;
  owner_name?: string; follower_count: number; is_following: boolean;
}
export interface KenzChannelPost {
  id: string; channel_id: string; author_id: string; body: string;
  media_kind: 'none' | 'image' | 'video'; media_name: string | null;
  created_at: string; channel_name: string; channel_slug: string;
  owner_id: string; likes: number; comments: number; liked_by_me: boolean;
}
export interface KenzChannelComment {
  id: string; post_id: string; author_id: string; body: string; created_at: string;
  author_name: string;
}
export interface ChannelResult<T> { success: boolean; data?: T; error?: string; }
const client = () => {
  const supabase = getSupabaseClient();
  if (!supabase) throw new Error('Supabase غير مهيأ. تحقق من إعدادات الاتصال.');
  return supabase;
};
const uuid = (value: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
const slugify = (value: string) => value.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 42);

export async function loadKenzChannels(userId: string): Promise<ChannelResult<KenzChannel[]>> {
  try {
    const db = client();
    const { data, error } = await db.from('kenz_channels').select('*').eq('is_public', true).order('created_at', { ascending: false }).limit(100);
    if (error) throw error;
    const channels = data || [];
    if (!channels.length) return { success: true, data: [] };
    const ids = channels.map((c) => c.id);
    const ownerIds = [...new Set(channels.map((c) => c.owner_id))];
    const [follows, profiles, mine] = await Promise.all([
      db.from('kenz_channel_follows').select('channel_id,follower_id').in('channel_id', ids),
      db.from('profiles').select('id,display_name').in('id', ownerIds),
      uuid(userId) ? db.from('kenz_channel_follows').select('channel_id').eq('follower_id', userId).in('channel_id', ids) : Promise.resolve({ data: [], error: null }),
    ]);
    if (follows.error && follows.error.code !== '42501') throw follows.error;
    if (profiles.error && profiles.error.code !== '42501') throw profiles.error;
    const profileMap = new Map((profiles.data || []).map((p) => [p.id, p.display_name || 'Kenz']));
    const mineSet = new Set((mine.data || []).map((f) => f.channel_id));
    const visibleFollows = follows.data || [];
    return { success: true, data: channels.map((c) => ({
      ...c, owner_name: profileMap.get(c.owner_id) || 'Kenz Creator',
      follower_count: visibleFollows.filter((f) => f.channel_id === c.id).length,
      is_following: mineSet.has(c.id),
    })) };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'تعذر تحميل القنوات.' };
  }
}

export async function loadKenzChannelFeed(userId: string, followingOnly = false): Promise<ChannelResult<KenzChannelPost[]>> {
  try {
    const db = client();
    let channelIds: string[] | null = null;
    if (followingOnly) {
      const { data, error } = await db.from('kenz_channel_follows').select('channel_id').eq('follower_id', userId);
      if (error) throw error;
      channelIds = (data || []).map((row) => row.channel_id);
      if (!channelIds.length) return { success: true, data: [] };
    }
    let query = db.from('kenz_channel_posts')
      .select('id,channel_id,author_id,body,media_kind,media_name,created_at,kenz_channels!inner(id,name,slug,owner_id,is_public)')
      .order('created_at', { ascending: false }).limit(80);
    if (channelIds) query = query.in('channel_id', channelIds);
    const { data, error } = await query;
    if (error) throw error;
    const posts = data || [];
    if (!posts.length) return { success: true, data: [] };
    const postIds = posts.map((p) => p.id);
    const [reactions, comments, mine] = await Promise.all([
      db.from('kenz_channel_post_reactions').select('post_id,user_id').in('post_id', postIds),
      db.from('kenz_channel_post_comments').select('post_id').in('post_id', postIds),
      uuid(userId) ? db.from('kenz_channel_post_reactions').select('post_id').eq('user_id', userId).in('post_id', postIds) : Promise.resolve({ data: [], error: null }),
    ]);
    if (reactions.error) throw reactions.error;
    if (comments.error) throw comments.error;
    const liked = new Set((mine.data || []).map((r) => r.post_id));
    return { success: true, data: posts.map((p: any) => {
      const channel = Array.isArray(p.kenz_channels) ? p.kenz_channels[0] : p.kenz_channels;
      return {
        id: p.id, channel_id: p.channel_id, author_id: p.author_id, body: p.body,
        media_kind: p.media_kind, media_name: p.media_name, created_at: p.created_at,
        channel_name: channel?.name || 'Kenz Channel', channel_slug: channel?.slug || '',
        owner_id: channel?.owner_id || '', likes: (reactions.data || []).filter((r) => r.post_id === p.id).length,
        comments: (comments.data || []).filter((r) => r.post_id === p.id).length,
        liked_by_me: liked.has(p.id),
      };
    }) };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'تعذر تحميل المنشورات.' };
  }
}

export async function createKenzChannel(input: { userId: string; name: string; description: string; category: string }): Promise<ChannelResult<KenzChannel>> {
  try {
    if (!uuid(input.userId)) throw new Error('سجّل الدخول أولاً لإنشاء قناة.');
    const base = slugify(input.name);
    if (base.length < 3) throw new Error('اسم القناة يجب أن يحتوي على 3 أحرف على الأقل.');
    const { data, error } = await client().from('kenz_channels').insert({
      owner_id: input.userId, name: input.name.trim(), slug: base + '-' + Math.random().toString(36).slice(2, 6),
      description: input.description.trim(), category: input.category.trim() || 'general', is_public: true,
    }).select('*').single();
    if (error) throw error;
    return { success: true, data: { ...data, owner_name: 'أنت', follower_count: 0, is_following: false } };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'تعذر إنشاء القناة.' };
  }
}

export async function followKenzChannel(channelId: string, userId: string, following: boolean): Promise<ChannelResult<boolean>> {
  try {
    const db = client();
    const result = following
      ? await db.from('kenz_channel_follows').delete().eq('channel_id', channelId).eq('follower_id', userId)
      : await db.from('kenz_channel_follows').insert({ channel_id: channelId, follower_id: userId });
    if (result.error) throw result.error;
    return { success: true, data: true };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'تعذر تحديث المتابعة.' };
  }
}

export async function publishKenzChannelPost(channelId: string, userId: string, body: string): Promise<ChannelResult<boolean>> {
  try {
    const text = body.trim();
    if (!text || text.length > 5000) throw new Error('اكتب منشوراً من 1 إلى 5000 حرف.');
    const { error } = await client().from('kenz_channel_posts').insert({
      channel_id: channelId, author_id: userId, body: text, media_kind: 'none',
    });
    if (error) throw error;
    return { success: true, data: true };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'تعذر نشر المحتوى.' };
  }
}

export async function toggleKenzPostLike(postId: string, userId: string, liked: boolean): Promise<ChannelResult<boolean>> {
  try {
    const db = client();
    const result = liked
      ? await db.from('kenz_channel_post_reactions').delete().eq('post_id', postId).eq('user_id', userId)
      : await db.from('kenz_channel_post_reactions').upsert({ post_id: postId, user_id: userId, reaction: 'like' });
    if (result.error) throw result.error;
    return { success: true, data: true };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'تعذر تسجيل الإعجاب.' };
  }
}

export async function loadKenzPostComments(postId: string): Promise<ChannelResult<KenzChannelComment[]>> {
  try {
    const db = client();
    const { data, error } = await db.from('kenz_channel_post_comments').select('id,post_id,author_id,body,created_at').eq('post_id', postId).order('created_at');
    if (error) throw error;
    const rows = data || [];
    const ids = [...new Set(rows.map((r) => r.author_id))];
    const profiles = ids.length ? await db.from('profiles').select('id,display_name').in('id', ids) : { data: [], error: null };
    const names = new Map((profiles.data || []).map((p) => [p.id, p.display_name || 'Kenz']));
    return { success: true, data: rows.map((r) => ({ ...r, author_name: names.get(r.author_id) || 'Kenz Member' })) };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'تعذر تحميل التعليقات.' };
  }
}

export async function addKenzPostComment(postId: string, userId: string, body: string): Promise<ChannelResult<boolean>> {
  try {
    const text = body.trim();
    if (!text || text.length > 2000) throw new Error('التعليق يجب أن يكون من 1 إلى 2000 حرف.');
    const { error } = await client().from('kenz_channel_post_comments').insert({ post_id: postId, author_id: userId, body: text });
    if (error) throw error;
    return { success: true, data: true };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'تعذر إضافة التعليق.' };
  }
}

export function subscribeToKenzChannels(onChange: () => void) {
  const db = getSupabaseClient();
  if (!db) return () => undefined;
  const channel = db.channel('kenz-public-channels-feed')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'kenz_channels' }, onChange)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'kenz_channel_follows' }, onChange)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'kenz_channel_posts' }, onChange)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'kenz_channel_post_comments' }, onChange)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'kenz_channel_post_reactions' }, onChange)
    .subscribe();
  return () => { void db.removeChannel(channel); };
}
