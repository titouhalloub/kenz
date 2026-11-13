import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Radio, Search, Plus, Users, Heart, MessageCircle, Send, X, RadioTower, Sparkles, Compass, UserPlus, ChevronDown, RefreshCw } from 'lucide-react';
import type { UserProfile } from '../services/authStore';
import {
  addKenzPostComment, createKenzChannel, followKenzChannel, loadKenzChannelFeed, loadKenzChannels,
  loadKenzPostComments, publishKenzChannelPost, subscribeToKenzChannels, toggleKenzPostLike,
  type KenzChannel, type KenzChannelComment, type KenzChannelPost,
} from '../services/channelStore';

interface Props { user: UserProfile; locale: 'ar' | 'fr' | 'en'; }
type Tab = 'discover' | 'following' | 'my';
const isUuid = (value: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{12}$/i.test(value);
const copy = {
  ar: { title:'قنوات Kenz', subtitle:'اكتشف المبدعين وتابع القنوات التي تهمك', discover:'اكتشف', following:'أتابعها', mine:'قنواتي', create:'إنشاء قناة', createTitle:'أنشئ قناتك العامة', name:'اسم القناة', description:'وصف مختصر', category:'التصنيف', categories:['عام','طبخ','توفير وميزانية','تجارة وخدمات','تعليم','تقنية','أخرى'], save:'إنشاء القناة', cancel:'إلغاء', follow:'متابعة', unfollow:'إلغاء المتابعة', empty:'لا توجد قنوات بعد. كن أول من ينشئ قناة في Kenz!', noPosts:'لا توجد منشورات هنا بعد.', write:'شارك فكرة أو نصيحة مع متابعيك…', publish:'نشر', choose:'اختر قناتك', comments:'التعليقات', comment:'اكتب تعليقاً…', send:'إرسال', signIn:'سجّل الدخول لاستخدام القنوات.', search:'ابحث عن قناة أو منشور…', all:'الكل', error:'حدث خطأ. حاول مجدداً.', loading:'جارٍ التحميل…', posted:'تم النشر', noFollowing:'تابع القنوات ليظهر محتواها هنا.', noMine:'لم تنشئ قناة بعد.', followers:'متابع', live:'قنوات ومنشورات عامة', popular:'منشورات حديثة', refresh:'تحديث' },
  fr: { title:'Chaînes Kenz', subtitle:'Découvrez les créateurs et suivez les chaînes qui vous intéressent', discover:'Découvrir', following:'Abonnements', mine:'Mes chaînes', create:'Créer une chaîne', createTitle:'Créer votre chaîne publique', name:'Nom de la chaîne', description:'Courte description', category:'Catégorie', categories:['Général','Cuisine','Budget & économies','Commerce & services','Éducation','Technologie','Autre'], save:'Créer', cancel:'Annuler', follow:'Suivre', unfollow:'Ne plus suivre', empty:'Aucune chaîne pour le moment. Soyez le premier créateur !', noPosts:'Aucune publication pour le moment.', write:'Partagez une idée avec vos abonnés…', publish:'Publier', choose:'Choisir une chaîne', comments:'Commentaires', comment:'Écrire un commentaire…', send:'Envoyer', signIn:'Connectez-vous pour utiliser les chaînes.', search:'Rechercher une chaîne ou publication…', all:'Tout', error:'Une erreur est survenue. Réessayez.', loading:'Chargement…', posted:'Publié', noFollowing:'Suivez des chaînes pour voir leurs publications ici.', noMine:'Vous n’avez pas encore créé de chaîne.', followers:'abonnés', live:'Chaînes et publications publiques', popular:'Publications récentes', refresh:'Actualiser' },
  en: { title:'Kenz Channels', subtitle:'Discover creators and follow channels that matter to you', discover:'Discover', following:'Following', mine:'My channels', create:'Create channel', createTitle:'Create your public channel', name:'Channel name', description:'Short description', category:'Category', categories:['General','Cooking','Budget & savings','Business & services','Education','Technology','Other'], save:'Create channel', cancel:'Cancel', follow:'Follow', unfollow:'Unfollow', empty:'No channels yet. Be the first to create one!', noPosts:'No posts here yet.', write:'Share an idea with your followers…', publish:'Publish', choose:'Choose your channel', comments:'Comments', comment:'Write a comment…', send:'Send', signIn:'Sign in to use channels.', search:'Search channels or posts…', all:'All', error:'Something went wrong. Please try again.', loading:'Loading…', posted:'Posted', noFollowing:'Follow channels to see their posts here.', noMine:'You have not created a channel yet.', followers:'followers', live:'Public channels and posts', popular:'Recent posts', refresh:'Refresh' },
};
export const ChannelsView: React.FC<Props> = ({ user, locale }) => {
  const t = copy[locale] || copy.ar;
  const tabLabels: Record<Tab, string> = { discover: t.discover, following: t.following, my: t.mine };
  const userId = isUuid(user.id) ? user.id : '';
  const [tab,setTab] = useState<Tab>('discover');
  const [channels,setChannels] = useState<KenzChannel[]>([]);
  const [posts,setPosts] = useState<KenzChannelPost[]>([]);
  const [loading,setLoading] = useState(true);
  const [busy,setBusy] = useState(false);
  const [error,setError] = useState('');
  const [search,setSearch] = useState('');
  const [createOpen,setCreateOpen] = useState(false);
  const [channelName,setChannelName] = useState('');
  const [description,setDescription] = useState('');
  const [category,setCategory] = useState(t.categories[0]);
  const [composerChannel,setComposerChannel] = useState('');
  const [postBody,setPostBody] = useState('');
  const [commentPost,setCommentPost] = useState('');
  const [comments,setComments] = useState<KenzChannelComment[]>([]);
  const [commentDraft,setCommentDraft] = useState('');
  const [toast,setToast] = useState('');

  const refresh = useCallback(async () => {
    setLoading(true);
    const [channelResult,feedResult] = await Promise.all([
      loadKenzChannels(userId),
      loadKenzChannelFeed(userId, tab === 'following'),
    ]);
    if (channelResult.success) setChannels(channelResult.data || []);
    else setError(channelResult.error || t.error);
    if (feedResult.success) setPosts(feedResult.data || []);
    else setError(feedResult.error || t.error);
    setLoading(false);
  }, [userId,tab,t.error]);

  useEffect(() => { void refresh(); }, [refresh]);
  useEffect(() => subscribeToKenzChannels(() => { void refresh(); }), [refresh]);

  const myChannels = useMemo(() => channels.filter((c) => c.owner_id === userId), [channels,userId]);
  const visibleChannels = useMemo(() => channels.filter((c) => {
    if (tab === 'following' && !c.is_following) return false;
    if (tab === 'my' && c.owner_id !== userId) return false;
    const q = search.trim().toLowerCase();
    return !q || c.name.toLowerCase().includes(q) || c.description.toLowerCase().includes(q) || c.category.toLowerCase().includes(q);
  }), [channels,tab,userId,search]);
  const visiblePosts = useMemo(() => posts.filter((p) => {
    if (tab === 'my' && p.owner_id !== userId) return false;
    const q = search.trim().toLowerCase();
    return !q || p.body.toLowerCase().includes(q) || p.channel_name.toLowerCase().includes(q);
  }), [posts,tab,userId,search]);

  const onFollow = async (channel: KenzChannel) => {
    if (!userId) { setError(t.signIn); return; }
    setBusy(true);
    const result = await followKenzChannel(channel.id,userId,channel.is_following);
    setBusy(false);
    if (!result.success) { setError(result.error || t.error); return; }
    await refresh();
  };
  const onCreate = async () => {
    if (!userId) { setError(t.signIn); return; }
    if (channelName.trim().length < 3) { setError(locale === 'ar' ? 'اسم القناة قصير جداً.' : 'Channel name is too short.'); return; }
    setBusy(true);
    const result = await createKenzChannel({userId,name:channelName,description,category});
    setBusy(false);
    if (!result.success) { setError(result.error || t.error); return; }
    setChannelName(''); setDescription(''); setCreateOpen(false); setTab('my');
    setToast(locale === 'ar' ? 'قناتك أصبحت عامة ويمكن للجميع اكتشافها.' : locale === 'fr' ? 'Votre chaîne est maintenant publique.' : 'Your channel is now public and discoverable.');
    await refresh();
  };
  const onPublish = async () => {
    if (!userId) { setError(t.signIn); return; }
    if (!composerChannel || !postBody.trim()) return;
    setBusy(true);
    const result = await publishKenzChannelPost(composerChannel,userId,postBody);
    setBusy(false);
    if (!result.success) { setError(result.error || t.error); return; }
    setPostBody(''); setComposerChannel('');
    setToast(t.posted); await refresh();
  };
  const onLike = async (post: KenzChannelPost) => {
    if (!userId) { setError(t.signIn); return; }
    const result = await toggleKenzPostLike(post.id,userId,post.liked_by_me);
    if (!result.success) { setError(result.error || t.error); return; }
    await refresh();
  };
  const openComments = async (post: KenzChannelPost) => {
    setCommentPost(post.id);
    const result = await loadKenzPostComments(post.id);
    setComments(result.success ? result.data || [] : []);
  };
  const sendComment = async () => {
    if (!userId || !commentDraft.trim() || !commentPost) return;
    setBusy(true);
    const result = await addKenzPostComment(commentPost,userId,commentDraft);
    setBusy(false);
    if (!result.success) { setError(result.error || t.error); return; }
    setCommentDraft('');
    const refreshed = await loadKenzPostComments(commentPost);
    if (refreshed.success) setComments(refreshed.data || []);
    await refresh();
  };
  const dateLabel = (date: string) => new Intl.DateTimeFormat(locale === 'ar' ? 'ar-DZ' : locale === 'fr' ? 'fr-FR' : 'en', {dateStyle:'medium'}).format(new Date(date));
  const initials = (name: string) => name.trim().slice(0,1).toUpperCase() || 'K';

  return <div className="space-y-5 pb-8" dir={locale === 'ar' ? 'rtl' : 'ltr'}>
    <section className="relative overflow-hidden rounded-3xl border border-emerald-500/20 bg-gradient-to-br from-emerald-950 via-slate-900 to-slate-950 p-5 sm:p-7">
      <div className="absolute -left-8 -top-10 h-40 w-40 rounded-full bg-emerald-500/10 blur-3xl" />
      <div className="relative flex flex-wrap items-center justify-between gap-4">
        <div><div className="mb-2 flex items-center gap-2 text-emerald-300"><RadioTower size={18}/><span className="text-xs font-bold tracking-widest">KENZ SOCIAL</span></div>
          <h1 className="text-2xl font-black text-white sm:text-3xl">{t.title}</h1><p className="mt-1 max-w-xl text-sm text-slate-300">{t.subtitle}</p>
        </div>
        <button onClick={() => {setError('');setCreateOpen(true);}} className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-emerald-500 px-4 py-2 text-sm font-bold text-slate-950 shadow-lg shadow-emerald-950/40 hover:bg-emerald-400"><Plus size={18}/>{t.create}</button>
      </div>
      <div className="relative mt-5 flex items-center gap-2 text-xs text-emerald-100/80"><Sparkles size={14}/>{t.live}<span className="mx-1 h-1 w-1 rounded-full bg-emerald-400"/> {channels.length} {locale === 'ar' ? 'قناة متاحة' : locale === 'fr' ? 'chaînes disponibles' : 'channels available'}</div>
    </section>

    {!userId && <div className="rounded-2xl border border-amber-500/30 bg-amber-950/30 p-3 text-sm text-amber-200">{t.signIn}</div>}
    {error && <div role="alert" className="flex items-center justify-between rounded-xl border border-rose-500/30 bg-rose-950/30 p-3 text-sm text-rose-200"><span>{error}</span><button onClick={() => setError('')} aria-label="Close"><X size={16}/></button></div>}
    {toast && <div className="flex items-center justify-between rounded-xl border border-emerald-500/30 bg-emerald-950/30 p-3 text-sm text-emerald-200">{toast}<button onClick={() => setToast('')}><X size={16}/></button></div>}

    <div className="flex flex-wrap items-center gap-2">
      {(['discover','following','my'] as Tab[]).map((item) => <button key={item} onClick={() => setTab(item)} className={tab===item ? 'rounded-xl bg-emerald-500 px-4 py-2.5 text-sm font-bold text-slate-950' : 'rounded-xl border border-slate-700 bg-slate-900 px-4 py-2.5 text-sm font-semibold text-slate-300 hover:border-slate-500'}>{tabLabels[item]}</button>)}
      <button onClick={() => void refresh()} className="ms-auto inline-flex min-h-10 items-center gap-2 rounded-xl border border-slate-700 px-3 text-xs text-slate-300 hover:bg-slate-800"><RefreshCw size={14}/>{t.refresh}</button>
    </div>
    <label className="flex min-h-11 items-center gap-2 rounded-xl border border-slate-800 bg-slate-900 px-3 text-slate-400"><Search size={17}/><input value={search} onChange={(e)=>setSearch(e.target.value)} placeholder={t.search} className="w-full bg-transparent text-sm text-white outline-none placeholder:text-slate-500"/></label>

    {myChannels.length > 0 && <section className="rounded-2xl border border-slate-800 bg-slate-900/70 p-4">
      <div className="mb-3 flex items-center justify-between"><h2 className="font-bold text-white">{locale==='ar'?'انشر لمتابعيك':locale==='fr'?'Publier à vos abonnés':'Post to your followers'}</h2><span className="text-xs text-slate-500">{myChannels.length} {locale==='ar'?'قناة تملكها':'owned'}</span></div>
      <div className="flex flex-col gap-3 sm:flex-row">
        <select value={composerChannel} onChange={(e)=>setComposerChannel(e.target.value)} className="min-h-11 rounded-xl border border-slate-700 bg-slate-950 px-3 text-sm text-white"><option value="">{t.choose}</option>{myChannels.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select>
        <input value={postBody} onChange={(e)=>setPostBody(e.target.value)} maxLength={5000} placeholder={t.write} className="min-h-11 min-w-0 flex-1 rounded-xl border border-slate-700 bg-slate-950 px-3 text-sm text-white outline-none"/>
        <button disabled={busy || !composerChannel || !postBody.trim()} onClick={()=>void onPublish()} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-emerald-500 px-4 text-sm font-bold text-slate-950 disabled:opacity-40"><Send size={16}/>{t.publish}</button>
      </div>
    </section>}

    {(tab === 'discover' || tab === 'following' || tab === 'my') && <section className="space-y-3">
      <div className="flex items-center gap-2"><Compass size={17} className="text-emerald-400"/><h2 className="font-bold text-white">{tabLabels[tab]}</h2><span className="text-xs text-slate-500">({visibleChannels.length})</span></div>
      {loading && <p className="py-5 text-center text-sm text-slate-400">{t.loading}</p>}
      {!loading && visibleChannels.length === 0 && <div className="rounded-2xl border border-dashed border-slate-700 p-6 text-center text-sm text-slate-400">{tab==='following'?t.noFollowing:tab==='my'?t.noMine:t.empty}</div>}
      <div className="grid gap-3 sm:grid-cols-2">
        {visibleChannels.map((channel)=> <article key={channel.id} className="rounded-2xl border border-slate-800 bg-slate-900 p-4 transition hover:border-emerald-500/40">
          <div className="flex items-start gap-3"><div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-emerald-400 to-teal-700 text-lg font-black text-slate-950">{initials(channel.name)}</div><div className="min-w-0 flex-1"><h3 className="truncate font-bold text-white">{channel.name}</h3><p className="text-xs text-slate-500">@{channel.slug}</p></div><span className="rounded-full bg-emerald-500/10 px-2 py-1 text-[10px] font-bold text-emerald-300">{channel.category}</span></div>
          {channel.description && <p className="mt-3 line-clamp-2 text-sm text-slate-300">{channel.description}</p>}
          <div className="mt-4 flex items-center justify-between gap-2"><span className="inline-flex items-center gap-1.5 text-xs text-slate-500"><Users size={14}/>{locale === 'ar' ? 'قناة عامة' : locale === 'fr' ? 'Chaîne publique' : 'Public channel'}</span>
            {channel.owner_id !== userId && <button disabled={busy || !userId} onClick={()=>void onFollow(channel)} className={channel.is_following?'min-h-9 rounded-lg border border-slate-700 px-3 text-xs font-semibold text-slate-300':'min-h-9 rounded-lg bg-emerald-500 px-3 text-xs font-bold text-slate-950'}>{channel.is_following?t.unfollow:t.follow}</button>}
          </div>
        </article>)}
      </div>
    </section>}

    <section className="space-y-3">
      <div className="flex items-center justify-between"><h2 className="flex items-center gap-2 font-bold text-white"><Radio size={17} className="text-emerald-400"/>{t.popular}</h2><span className="text-xs text-slate-500">{visiblePosts.length}</span></div>
      {loading && <p className="py-4 text-center text-sm text-slate-400">{t.loading}</p>}
      {!loading && visiblePosts.length===0 && <div className="rounded-2xl border border-dashed border-slate-700 p-6 text-center text-sm text-slate-400">{tab==='following'?t.noFollowing:t.noPosts}</div>}
      {visiblePosts.map((post)=> <article key={post.id} className="overflow-hidden rounded-2xl border border-slate-800 bg-slate-900">
        <div className="flex items-center gap-3 border-b border-slate-800 px-4 py-3"><div className="flex h-10 w-10 items-center justify-center rounded-full bg-emerald-500/15 font-bold text-emerald-300">{initials(post.channel_name)}</div><div className="min-w-0 flex-1"><h3 className="truncate text-sm font-bold text-white">{post.channel_name}</h3><p className="text-[11px] text-slate-500">{dateLabel(post.created_at)}</p></div><span className="rounded-full bg-slate-800 px-2 py-1 text-[10px] text-slate-400">KENZ</span></div>
        <div className="whitespace-pre-wrap break-words px-4 py-4 text-sm leading-7 text-slate-200">{post.body}</div>
        <div className="flex items-center gap-4 border-t border-slate-800 px-4 py-3"><button onClick={()=>void onLike(post)} className={post.liked_by_me?'inline-flex items-center gap-2 text-sm font-semibold text-rose-400':'inline-flex items-center gap-2 text-sm text-slate-400 hover:text-rose-300'}><Heart size={17} fill={post.liked_by_me?'currentColor':'none'}/>{post.likes}</button><button onClick={()=>void openComments(post)} className="inline-flex items-center gap-2 text-sm text-slate-400 hover:text-emerald-300"><MessageCircle size={17}/>{post.comments} {t.comments}</button></div>
      </article>)}
    </section>

    {createOpen && <div className="fixed inset-0 z-[70] flex items-end justify-center bg-black/70 p-3 sm:items-center" onClick={()=>setCreateOpen(false)}><section role="dialog" aria-modal="true" className="w-full max-w-lg space-y-4 rounded-3xl border border-slate-700 bg-slate-900 p-5 shadow-2xl" onClick={e=>e.stopPropagation()}>
      <div className="flex items-center justify-between"><h2 className="text-lg font-black text-white">{t.createTitle}</h2><button onClick={()=>setCreateOpen(false)} aria-label="Close"><X/></button></div>
      <label className="block space-y-1 text-sm text-slate-300">{t.name}<input value={channelName} onChange={e=>setChannelName(e.target.value)} maxLength={48} className="min-h-11 w-full rounded-xl border border-slate-700 bg-slate-950 px-3 text-white outline-none"/></label>
      <label className="block space-y-1 text-sm text-slate-300">{t.description}<textarea value={description} onChange={e=>setDescription(e.target.value)} maxLength={500} rows={3} className="w-full rounded-xl border border-slate-700 bg-slate-950 p-3 text-white outline-none"/></label>
      <label className="block space-y-1 text-sm text-slate-300">{t.category}<select value={category} onChange={e=>setCategory(e.target.value)} className="min-h-11 w-full rounded-xl border border-slate-700 bg-slate-950 px-3 text-white">{t.categories.map(c=><option key={c}>{c}</option>)}</select></label>
      <p className="text-xs text-slate-500">{locale==='ar'?'ستكون القناة عامة ويمكن لجميع مستخدمي Kenz المسجلين اكتشافها ومتابعتها.':'Your channel will be public and discoverable to signed-in Kenz users.'}</p>
      <div className="flex justify-end gap-2"><button onClick={()=>setCreateOpen(false)} className="min-h-11 rounded-xl border border-slate-700 px-4 text-sm text-slate-300">{t.cancel}</button><button disabled={busy} onClick={()=>void onCreate()} className="min-h-11 rounded-xl bg-emerald-500 px-5 text-sm font-bold text-slate-950 disabled:opacity-50">{t.save}</button></div>
    </section></div>}

    {commentPost && <div className="fixed inset-0 z-[75] flex items-end justify-center bg-black/70 p-3 sm:items-center" onClick={()=>setCommentPost('')}><section role="dialog" aria-modal="true" className="flex max-h-[80vh] w-full max-w-lg flex-col rounded-3xl border border-slate-700 bg-slate-900 p-5" onClick={e=>e.stopPropagation()}>
      <div className="mb-3 flex items-center justify-between"><h2 className="font-bold text-white">{t.comments}</h2><button onClick={()=>setCommentPost('')} aria-label="Close"><X/></button></div>
      <div className="min-h-24 flex-1 space-y-3 overflow-y-auto py-2">{comments.length===0?<p className="py-8 text-center text-sm text-slate-500">{t.noPosts}</p>:comments.map(c=><div key={c.id} className="rounded-xl bg-slate-800/70 p-3"><p className="text-xs font-bold text-emerald-300">{c.author_name}</p><p className="mt-1 whitespace-pre-wrap text-sm text-slate-200">{c.body}</p></div>)}</div>
      <div className="mt-3 flex gap-2"><input value={commentDraft} onChange={e=>setCommentDraft(e.target.value)} placeholder={t.comment} maxLength={2000} className="min-h-11 min-w-0 flex-1 rounded-xl border border-slate-700 bg-slate-950 px-3 text-sm text-white outline-none"/><button disabled={busy||!commentDraft.trim()} onClick={()=>void sendComment()} className="rounded-xl bg-emerald-500 px-4 font-bold text-slate-950 disabled:opacity-40">{t.send}</button></div>
    </section></div>}
  </div>;
};
