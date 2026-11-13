import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Bell, Check, Compass, Heart, MessageCircle, Plus, Radio, Send, Trash2, Users } from 'lucide-react';
import { getSupabaseClient } from '../services/supabase';
import type { UserProfile } from '../services/authStore';
import { PeerTransferPanel } from './PeerTransferPanel';

type Channel = { id: string; owner_id: string; name: string; slug: string; description: string; category: string; created_at: string; is_following?: boolean };
type ChannelPost = { id: string; channel_id: string; author_id: string; body: string; media_kind: 'none'|'image'|'video'; created_at: string; likes: number; liked: boolean; channel_name?: string; comments: Array<{id:string;author_id:string;body:string;created_at:string}> };
type ChannelReport = { id: string; post_id: string; reason: string; details: string; status: 'open'|'reviewed'|'actioned'; created_at: string };
type Props = { user: UserProfile; locale: 'ar'|'fr'|'en' };
const copy = {
  ar: { title:'قنوات Kenz', subtitle:'اكتشف المبدعين وتابع القنوات التي تهمك', discover:'اكتشف', following:'أتابعها', mine:'قنواتي', create:'إنشاء قناة', name:'اسم القناة', slug:'المعرّف', desc:'وصف القناة', category:'التصنيف', createNow:'إنشاء', follow:'متابعة', unfollow:'إلغاء المتابعة', publish:'نشر منشور', postPlaceholder:'شارك فكرة أو وصفة أو نصيحة…', empty:'لا توجد قنوات بعد. كن أول من ينشئ قناة!', noPosts:'لا توجد منشورات بعد.', followHint:'تابع القنوات لتظهر منشوراتها هنا تلقائياً.', openChannel:'فتح القناة', comment:'اكتب تعليقاً…', send:'إرسال', delete:'حذف', followers:'متابع', likes:'إعجاب', signIn:'سجّل الدخول لاستخدام القنوات.', owner:'قناتك', all:'الكل', cooking:'طبخ', family:'العائلة', savings:'توفير', tips:'نصائح', status:'تم التحديث', peer:'الوسائط عبر P2P: لا تُخزّن ملفات الصور والفيديو في خوادم Kenz.', report:'إبلاغ', reports:'بلاغات المنشورات', review:'تمت المراجعة' },
  fr: { title:'Kenz Channels', subtitle:'Découvrez des créateurs et suivez les chaînes qui vous intéressent', discover:'Découvrir', following:'Abonnements', mine:'Mes chaînes', create:'Créer une chaîne', name:'Nom de la chaîne', slug:'Identifiant', desc:'Description', category:'Catégorie', createNow:'Créer', follow:'Suivre', unfollow:'Ne plus suivre', publish:'Publier', postPlaceholder:'Partagez une idée, recette ou astuce…', empty:'Aucune chaîne. Soyez le premier créateur !', noPosts:'Aucune publication.', followHint:'Suivez des chaînes pour voir leurs nouvelles publications ici automatiquement.', openChannel:'Ouvrir la chaîne', comment:'Écrire un commentaire…', send:'Envoyer', delete:'Supprimer', followers:'abonnés', likes:'J’aime', signIn:'Connectez-vous pour utiliser les chaînes.', owner:'Votre chaîne', all:'Tout', cooking:'Cuisine', family:'Famille', savings:'Économie', tips:'Conseils', status:'Mis à jour', peer:'Médias P2P : les fichiers photo/vidéo ne sont pas stockés sur les serveurs Kenz.', report:'Signaler', reports:'Signalements', review:'Marquer comme traité' },
  en: { title:'Kenz Channels', subtitle:'Discover creators and follow channels you care about', discover:'Discover', following:'Following', mine:'My channels', create:'Create channel', name:'Channel name', slug:'Handle', desc:'Description', category:'Category', createNow:'Create', follow:'Follow', unfollow:'Unfollow', publish:'Publish post', postPlaceholder:'Share an idea, recipe or tip…', empty:'No channels yet. Be the first creator!', noPosts:'No posts yet.', followHint:'{t.followHint}', openChannel:'Open channel', comment:'Write a comment…', send:'Send', delete:'Delete', followers:'followers', likes:'Likes', signIn:'Sign in to use channels.', owner:'Your channel', all:'All', cooking:'Cooking', family:'Family', savings:'Saving', tips:'Tips', status:'Updated', peer:'P2P media: photo/video files are not stored on Kenz servers.', report:'Report', reports:'Post reports', review:'Mark reviewed' }
};
export const ChannelsView: React.FC<Props> = ({ user, locale }) => {
  const t = copy[locale] || copy.en;
  const client = getSupabaseClient();
  const signedIn = Boolean(client && user.id && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(user.id));
  const [tab,setTab] = useState<'discover'|'following'|'mine'>('following');
  const [channels,setChannels] = useState<Channel[]>([]);
  const [selected,setSelected] = useState<Channel|null>(null);
  const [posts,setPosts] = useState<ChannelPost[]>([]);
  const [feedPosts,setFeedPosts] = useState<ChannelPost[]>([]);
  const [reports,setReports] = useState<ChannelReport[]>([]);
  const [loading,setLoading] = useState(true);
  const [busy,setBusy] = useState(false);
  const [message,setMessage] = useState('');
  const [createOpen,setCreateOpen] = useState(false);
  const [channelName,setChannelName] = useState('');
  const [slug,setSlug] = useState('');
  const [description,setDescription] = useState('');
  const [category,setCategory] = useState('general');
  const [draft,setDraft] = useState('');
  const [comments,setComments] = useState<Record<string,string>>({});
  const [showComposer,setShowComposer] = useState(false);

  const refresh = useCallback(async () => {
    if (!client || !signedIn) { setLoading(false); return; }
    setLoading(true);
    try {
      const [channelRows, followRows] = await Promise.all([
        client.from('kenz_channels').select('id,owner_id,name,slug,description,category,created_at').eq('is_public',true).order('created_at',{ascending:false}).limit(100),
        client.from('kenz_channel_follows').select('channel_id').eq('follower_id',user.id),
      ]);
      if (channelRows.error) throw channelRows.error;
      if (followRows.error) throw followRows.error;
      const rows = channelRows.data || [];
      const mine = await client.from('kenz_channels').select('id,owner_id,name,slug,description,category,created_at').eq('owner_id',user.id).order('created_at',{ascending:false});
      if (mine.error) throw mine.error;
      const followSet = new Set((followRows.data||[]).map(r=>r.channel_id));
      let visible = rows.map(r=>({...r,is_following:followSet.has(r.id)}));
      if (tab==='following') visible=visible.filter(r=>r.is_following);
      if (tab==='mine') visible=(mine.data||[]).map(r=>({...r,is_following:false}));
      setChannels(visible);
      if (selected && !visible.some(r=>r.id===selected.id) && tab!=='mine') setSelected(null);
    } catch (error) { setMessage(error instanceof Error?error.message:'Could not load channels.'); }
    finally { setLoading(false); }
  },[client,signedIn,user.id,tab,selected?.id]);

  const loadPosts = useCallback(async (channel:Channel) => {
    if (!client) return;
    const {data,error}=await client.from('kenz_channel_posts').select('id,channel_id,author_id,body,media_kind,created_at').eq('channel_id',channel.id).order('created_at',{ascending:false}).limit(40);
    if(error){setMessage(error.message);return;}
    const rows=data||[];
    const ids=rows.map(r=>r.id);
    const [reactions,commentsResult]=await Promise.all([
      ids.length?client.from('kenz_channel_post_reactions').select('post_id,user_id').in('post_id',ids):Promise.resolve({data:[],error:null}),
      ids.length?client.from('kenz_channel_post_comments').select('id,post_id,author_id,body,created_at').in('post_id',ids).order('created_at',{ascending:true}):Promise.resolve({data:[],error:null})
    ]);
    if(reactions.error||commentsResult.error){setMessage(reactions.error?.message||commentsResult.error?.message||'Could not load posts.');return;}
    setPosts(rows.map(r=>({ ...r, likes:(reactions.data||[]).filter(x=>x.post_id===r.id).length, liked:(reactions.data||[]).some(x=>x.post_id===r.id&&x.user_id===user.id), comments:(commentsResult.data||[]).filter(x=>x.post_id===r.id) })));
    if (channel.owner_id === user.id && ids.length) {
      const reportResult = await client.from('kenz_channel_post_reports').select('id,post_id,reason,details,status,created_at').in('post_id', ids).order('created_at', { ascending: false });
      if (reportResult.error) { setMessage(reportResult.error.message); return; }
      setReports((reportResult.data || []) as ChannelReport[]);
    } else setReports([]);
  },[client,user.id]);

  const loadFollowingFeed = useCallback(async () => {
    if (!client || !signedIn || tab !== 'following') { setFeedPosts([]); return; }
    const channelIds = channels.map(channel => channel.id);
    if (!channelIds.length) { setFeedPosts([]); return; }
    setLoading(true);
    try {
      const { data, error } = await client.from('kenz_channel_posts')
        .select('id,channel_id,author_id,body,media_kind,created_at')
        .in('channel_id', channelIds).order('created_at', { ascending: false }).limit(80);
      if (error) throw error;
      const rows = data || [];
      const ids = rows.map(row => row.id);
      const [reactionResult, commentResult] = await Promise.all([
        ids.length ? client.from('kenz_channel_post_reactions').select('post_id,user_id').in('post_id', ids) : Promise.resolve({ data: [], error: null }),
        ids.length ? client.from('kenz_channel_post_comments').select('id,post_id,author_id,body,created_at').in('post_id', ids).order('created_at', { ascending: true }) : Promise.resolve({ data: [], error: null })
      ]);
      if (reactionResult.error) throw reactionResult.error;
      if (commentResult.error) throw commentResult.error;
      const channelNames = new Map(channels.map(channel => [channel.id, channel.name]));
      setFeedPosts(rows.map(row => ({
        ...row, channel_name: channelNames.get(row.channel_id) || 'Kenz channel',
        likes: (reactionResult.data || []).filter(item => item.post_id === row.id).length,
        liked: (reactionResult.data || []).some(item => item.post_id === row.id && item.user_id === user.id),
        comments: (commentResult.data || []).filter(item => item.post_id === row.id)
      })));
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Could not load your following feed.');
    } finally { setLoading(false); }
  }, [client, signedIn, tab, channels, user.id]);

  useEffect(()=>{void refresh();},[refresh]);
  useEffect(()=>{if(selected) void loadPosts(selected); else setPosts([]);},[selected?.id,loadPosts]);
  useEffect(()=>{void loadFollowingFeed();},[loadFollowingFeed]);
  useEffect(()=>{
    if(!client||!signedIn)return;
    const channel=client.channel('kenz-channels-live')
      .on('postgres_changes',{event:'*',schema:'public',table:'kenz_channels'},()=>void refresh())
      .on('postgres_changes',{event:'*',schema:'public',table:'kenz_channel_follows',filter:`follower_id=eq.${user.id}`},()=>void refresh())
      .on('postgres_changes',{event:'*',schema:'public',table:'kenz_channel_posts'},()=>{if(selected)void loadPosts(selected);if(tab==='following')void loadFollowingFeed();})
      .on('postgres_changes',{event:'*',schema:'public',table:'kenz_channel_post_reactions'},()=>{if(tab==='following')void loadFollowingFeed();})
      .on('postgres_changes',{event:'*',schema:'public',table:'kenz_channel_post_comments'},()=>{if(tab==='following')void loadFollowingFeed();})
      .subscribe();
    return()=>{void client.removeChannel(channel);};
  },[client,signedIn,refresh,loadPosts,loadFollowingFeed,tab,selected?.id,user.id]);

  const createChannel = async () => {
    if(!client||!signedIn)return;
    const cleanSlug=slug.trim().toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'');
    if(channelName.trim().length<3||cleanSlug.length<3){setMessage('Use at least 3 characters for the name and handle.');return;}
    setBusy(true);setMessage('');
    const {data,error}=await client.from('kenz_channels').insert({owner_id:user.id,name:channelName.trim(),slug:cleanSlug,description:description.trim(),category}).select('id,owner_id,name,slug,description,category,created_at').single();
    setBusy(false);
    if(error){setMessage(error.message);return;}
    setChannelName('');setSlug('');setDescription('');setCreateOpen(false);setTab('mine');await refresh();setSelected(data as Channel);
  };

  const follow = async (channel:Channel) => {
    if(!client||!signedIn)return;
    setBusy(true);
    const result=channel.is_following
      ? await client.from('kenz_channel_follows').delete().eq('channel_id',channel.id).eq('follower_id',user.id)
      : await client.from('kenz_channel_follows').insert({channel_id:channel.id,follower_id:user.id});
    setBusy(false);
    if(result.error){setMessage(result.error.message);return;}
    await refresh();
    if(selected?.id===channel.id)setSelected({...channel,is_following:!channel.is_following});
  };

  const publish = async () => {
    if(!client||!signedIn||!selected||selected.owner_id!==user.id||!draft.trim())return;
    setBusy(true);setMessage('');
    const {error}=await client.from('kenz_channel_posts').insert({channel_id:selected.id,author_id:user.id,body:draft.trim()});
    setBusy(false);
    if(error){setMessage(error.message);return;}
    setDraft('');setShowComposer(false);await loadPosts(selected);
  };

  const reactFromFeed = async (post:ChannelPost) => {
    if (!client || !signedIn) return;
    const result = post.liked
      ? await client.from('kenz_channel_post_reactions').delete().eq('post_id', post.id).eq('user_id', user.id)
      : await client.from('kenz_channel_post_reactions').insert({ post_id: post.id, user_id: user.id });
    if (result.error) { setMessage(result.error.message); return; }
    await loadFollowingFeed();
  };

  const react = async (post:ChannelPost) => {
    if(!client||!signedIn)return;
    const result=post.liked
      ? await client.from('kenz_channel_post_reactions').delete().eq('post_id',post.id).eq('user_id',user.id)
      : await client.from('kenz_channel_post_reactions').insert({post_id:post.id,user_id:user.id});
    if(result.error){setMessage(result.error.message);return;}
    await loadPosts(selected!);
  };

  const comment = async (post:ChannelPost) => {
    if(!client||!signedIn||!comments[post.id]?.trim())return;
    const {error}=await client.from('kenz_channel_post_comments').insert({post_id:post.id,author_id:user.id,body:comments[post.id].trim()});
    if(error){setMessage(error.message);return;}
    setComments(current=>({...current,[post.id]:''}));await loadPosts(selected!);
  };

  const reportPost = async (post:ChannelPost) => {
    if (!client || !signedIn || post.author_id === user.id || !selected) return;
    const { error } = await client.from('kenz_channel_post_reports').insert({
      post_id: post.id, channel_id: selected.id, reporter_id: user.id, reason: 'other', details: ''
    });
    if (error) setMessage(error.code === '23505' ? 'You already reported this post.' : error.message);
    else setMessage('Report sent to the channel owner for review.');
  };

  const markReportReviewed = async (report:ChannelReport) => {
    if (!client || !selected || selected.owner_id !== user.id) return;
    const { error } = await client.from('kenz_channel_post_reports')
      .update({ status: 'reviewed', reviewed_by: user.id, reviewed_at: new Date().toISOString() })
      .eq('id', report.id).eq('channel_id', selected.id);
    if (error) setMessage(error.message); else await loadPosts(selected);
  };

  const deletePost = async (post:ChannelPost) => {
    if(!client||post.author_id!==user.id||!window.confirm('Delete this channel post?'))return;
    const {error}=await client.from('kenz_channel_posts').delete().eq('id',post.id).eq('author_id',user.id);
    if(error)setMessage(error.message);else await loadPosts(selected!);
  };

  const deleteChannel = async (channel:Channel) => {
    if(!client||channel.owner_id!==user.id||!window.confirm('Delete this channel and its posts?'))return;
    const {error}=await client.from('kenz_channels').delete().eq('id',channel.id).eq('owner_id',user.id);
    if(error){setMessage(error.message);return;}
    setSelected(null);await refresh();
  };

  const openChannel = (channel:Channel) => setSelected(channel);
  const categoryLabel=(value:string)=>value==='cooking'?t.cooking:value==='family'?t.family:value==='savings'?t.savings:value==='tips'?t.tips:value;
  const dateLabel=(value:string)=>new Date(value).toLocaleDateString(locale==='ar'?'ar-DZ':locale==='fr'?'fr-FR':'en-US',{day:'numeric',month:'short'});
  const filtered=useMemo(()=>channels,[channels]);

  if(!signedIn)return <section className="rounded-2xl border border-violet-200 bg-white p-5 text-center text-sm text-slate-600">{t.signIn}</section>;
  return <div className="space-y-4 pb-24" dir={locale==='ar'?'rtl':'ltr'}>
    <header className="rounded-3xl border border-violet-100 bg-gradient-to-br from-white to-violet-50 p-4 shadow-sm">
      <div className="flex items-center gap-3"><div className="grid h-12 w-12 place-items-center rounded-2xl bg-violet-100 text-violet-700"><Radio className="h-6 w-6"/></div><div className="min-w-0 flex-1"><h1 className="text-xl font-extrabold text-slate-900">{t.title}</h1><p className="text-xs text-slate-500">{t.subtitle}</p></div><button onClick={()=>setCreateOpen(v=>!v)} className="grid h-11 w-11 place-items-center rounded-xl bg-violet-700 text-white" aria-label={t.create}><Plus/></button></div>
      <div className="mt-4 grid grid-cols-3 gap-2 rounded-2xl bg-violet-100/70 p-1">
        {(['discover','following','mine'] as const).map(key=><button key={key} onClick={()=>{setTab(key);setSelected(null);}} className={tab===key?'rounded-xl bg-white p-2 text-xs font-bold text-violet-800 shadow-sm':'rounded-xl p-2 text-xs text-violet-700'}>{key==='discover'?t.discover:key==='following'?t.following:t.mine}</button>)}
      </div>
    </header>
    {createOpen&&<section className="space-y-3 rounded-2xl border border-violet-100 bg-white p-4 shadow-sm"><h2 className="font-bold text-slate-900">{t.create}</h2><input value={channelName} onChange={e=>{setChannelName(e.target.value);if(!slug)setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9]+/g,'-'));}} maxLength={48} placeholder={t.name} className="h-11 w-full rounded-xl border border-slate-200 px-3 text-sm"/><input value={slug} onChange={e=>setSlug(e.target.value)} maxLength={48} placeholder={t.slug+' · kenz-cuisine'} className="h-11 w-full rounded-xl border border-slate-200 px-3 text-sm"/><textarea value={description} onChange={e=>setDescription(e.target.value)} maxLength={500} rows={3} placeholder={t.desc} className="w-full rounded-xl border border-slate-200 p-3 text-sm"/><select value={category} onChange={e=>setCategory(e.target.value)} className="h-11 w-full rounded-xl border border-slate-200 px-3 text-sm"><option value="general">{t.all}</option><option value="cooking">{t.cooking}</option><option value="family">{t.family}</option><option value="savings">{t.savings}</option><option value="tips">{t.tips}</option></select><button disabled={busy} onClick={()=>void createChannel()} className="min-h-11 w-full rounded-xl bg-violet-700 text-sm font-bold text-white disabled:opacity-50">{busy?t.status:t.createNow}</button></section>}
    {message&&<p role="status" className="rounded-xl bg-amber-50 p-3 text-xs text-amber-800">{message}</p>}
    {selected?<section className="space-y-3">
      <button onClick={()=>setSelected(null)} className="text-xs font-semibold text-violet-700">← {t.discover}</button>
      <div className="rounded-2xl border border-violet-100 bg-white p-4"><div className="flex items-start gap-3"><div className="grid h-12 w-12 place-items-center rounded-2xl bg-violet-100 text-lg font-black text-violet-700">#{selected.slug.slice(0,1).toUpperCase()}</div><div className="min-w-0 flex-1"><h2 className="font-extrabold text-slate-900">{selected.name}</h2><p className="text-xs text-slate-500">@{selected.slug} · {categoryLabel(selected.category)}</p><p className="mt-2 text-sm text-slate-600">{selected.description}</p></div>{selected.owner_id===user.id?<button onClick={()=>void deleteChannel(selected)} className="rounded-lg p-2 text-rose-600"><Trash2 size={18}/></button>:<button disabled={busy} onClick={()=>void follow(selected)} className="rounded-xl bg-violet-700 px-3 py-2 text-xs font-bold text-white">{selected.is_following?t.unfollow:t.follow}</button>}</div></div>
      <PeerTransferPanel enabled={true}/>
      {selected.owner_id===user.id&&<section className="rounded-2xl border border-violet-100 bg-white p-3"><button onClick={()=>setShowComposer(v=>!v)} className="flex min-h-10 w-full items-center justify-center gap-2 rounded-xl bg-violet-700 text-xs font-bold text-white"><Plus size={16}/>{t.publish}</button>{showComposer&&<div className="mt-3 space-y-2"><textarea value={draft} onChange={e=>setDraft(e.target.value)} maxLength={5000} rows={4} placeholder={t.postPlaceholder} className="w-full rounded-xl border border-slate-200 p-3 text-sm"/><button disabled={busy||!draft.trim()} onClick={()=>void publish()} className="flex min-h-10 w-full items-center justify-center gap-2 rounded-xl bg-emerald-600 text-xs font-bold text-white"><Send size={15}/>{t.publish}</button></div>}</section>}
      {selected.owner_id===user.id&&reports.some(report=>report.status==='open')&&<section className="space-y-2 rounded-2xl border border-amber-200 bg-amber-50 p-3"><h3 className="text-sm font-bold text-amber-900">{t.reports} · {reports.filter(report=>report.status==='open').length}</h3>{reports.filter(report=>report.status==='open').map(report=><div key={report.id} className="flex items-start gap-2 rounded-xl bg-white p-2"><div className="min-w-0 flex-1"><p className="text-xs font-semibold text-slate-800">{report.reason}</p><p className="text-[10px] text-slate-500">{posts.find(post=>post.id===report.post_id)?.body?.slice(0,140) || report.details || 'Reported post'}</p></div><button onClick={()=>void markReportReviewed(report)} className="shrink-0 rounded-lg bg-amber-100 px-2 py-2 text-[10px] font-bold text-amber-900">{t.review}</button></div>)}</section>}
      {loading&&<p className="p-4 text-center text-xs text-slate-500">Loading…</p>}
      {!posts.length&&!loading&&<p className="rounded-2xl bg-white p-5 text-center text-xs text-slate-500">{t.noPosts}</p>}
      {posts.map(post=><article key={post.id} className="space-y-3 rounded-2xl border border-violet-100 bg-white p-4 shadow-sm"><div className="flex items-center justify-between text-[10px] text-slate-400"><span>{selected.name}</span><time>{dateLabel(post.created_at)}</time></div><p className="whitespace-pre-wrap break-words text-sm leading-6 text-slate-800">{post.body}</p><div className="flex items-center gap-4 border-t border-slate-100 pt-2"><button onClick={()=>void react(post)} className={post.liked?'flex items-center gap-1 text-xs text-rose-600':'flex items-center gap-1 text-xs text-slate-500'}><Heart size={17} fill={post.liked?'currentColor':'none'}/>{post.likes} {t.likes}</button><span className="flex items-center gap-1 text-xs text-slate-400"><MessageCircle size={16}/>{post.comments.length}</span>{post.author_id===user.id&&<button onClick={()=>void deletePost(post)} className="ms-auto text-xs text-rose-600">{t.delete}</button>}{post.author_id!==user.id&&<button onClick={()=>void reportPost(post)} className="ms-auto text-xs text-slate-400">{t.report}</button>}</div>
      <div className="space-y-2">{post.comments.map(c=><div key={c.id} className="rounded-xl bg-slate-50 p-2 text-xs"><p className="text-[10px] text-violet-700">{c.author_id===user.id?'You':'Kenz member'}</p><p className="whitespace-pre-wrap text-slate-700">{c.body}</p></div>)}<div className="flex gap-2"><input value={comments[post.id]||''} onChange={e=>setComments(v=>({...v,[post.id]:e.target.value}))} maxLength={2000} placeholder={t.comment} className="h-10 min-w-0 flex-1 rounded-xl border border-slate-200 px-3 text-xs"/><button onClick={()=>void comment(post)} className="rounded-xl bg-violet-100 px-3 text-violet-800"><Send size={16}/></button></div></div></article>)}
    </section>:tab==='following'?<section className="space-y-3">
      {loading&&<p className="p-4 text-center text-xs text-slate-500">Loading your feed…</p>}
      {!loading&&!feedPosts.length&&<div className="rounded-2xl border border-dashed border-violet-200 bg-white p-7 text-center"><p className="text-sm text-slate-500">{t.noPosts}</p><p className="mt-1 text-xs text-slate-400">{t.followHint}</p><button onClick={()=>setTab('discover')} className="mt-3 rounded-xl bg-violet-700 px-4 py-2 text-xs font-bold text-white">{t.discover}</button></div>}
      {feedPosts.map(post=><article key={post.id} className="space-y-2 rounded-2xl border border-violet-100 bg-white p-4 shadow-sm">
        <button onClick={()=>{const channel=channels.find(item=>item.id===post.channel_id);if(channel)setSelected(channel);}} className="flex w-full items-center justify-between text-start text-xs font-bold text-violet-700"><span className="flex items-center gap-2"><span className="grid h-8 w-8 place-items-center rounded-full bg-violet-100"><Radio size={15}/></span>{post.channel_name}</span><time className="font-normal text-slate-400">{dateLabel(post.created_at)}</time></button>
        <p className="whitespace-pre-wrap break-words text-sm leading-6 text-slate-800">{post.body}</p>
        <div className="flex items-center gap-3 border-t border-slate-100 pt-2 text-xs text-slate-500">
          <button onClick={()=>void reactFromFeed(post)} className={post.liked?'flex items-center gap-1 text-rose-600':'flex items-center gap-1 text-slate-500'}><Heart size={15} fill={post.liked?'currentColor':'none'}/>{post.likes} {t.likes}</button>
          <span className="flex items-center gap-1"><MessageCircle size={15}/>{post.comments.length}</span>
          <button className="ms-auto font-semibold text-violet-700" onClick={()=>{const channel=channels.find(item=>item.id===post.channel_id);if(channel)setSelected(channel);}}>{t.openChannel}</button>
        </div>
      </article>)}
    </section>:<section className="space-y-3">
      {loading&&<p className="p-4 text-center text-xs text-slate-500">Loading channels…</p>}
      {!loading&&!filtered.length&&<p className="rounded-2xl border border-dashed border-violet-200 bg-white p-7 text-center text-sm text-slate-500">{t.empty}</p>}
      <div className="grid gap-3 sm:grid-cols-2">{filtered.map(channel=><article key={channel.id} className="rounded-2xl border border-violet-100 bg-white p-4 shadow-sm"><div className="flex items-start gap-3"><div className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-violet-100 text-violet-700"><Users size={21}/></div><div className="min-w-0 flex-1"><h3 className="truncate font-bold text-slate-900">{channel.name}</h3><p className="text-[10px] text-slate-400">@{channel.slug} · {categoryLabel(channel.category)}</p><p className="mt-1 line-clamp-2 text-xs text-slate-600">{channel.description}</p></div></div><div className="mt-3 flex gap-2"><button onClick={()=>openChannel(channel)} className="min-h-10 flex-1 rounded-xl border border-violet-200 text-xs font-bold text-violet-700">Open channel</button>{channel.owner_id!==user.id&&<button disabled={busy} onClick={()=>void follow(channel)} className="min-h-10 rounded-xl bg-violet-700 px-3 text-xs font-bold text-white">{channel.is_following?<Check size={16}/>:t.follow}</button>}</div></article>)}</div>
    </section>}
    <p className="rounded-xl bg-violet-50 p-3 text-[10px] leading-5 text-violet-800">{t.peer}</p>
  </div>;
};
