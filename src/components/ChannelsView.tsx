import React, { Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { Flag, Heart, MessageCircle, Plus, Settings2, ShieldCheck, UserCheck, UserPlus, X, HardDrive } from 'lucide-react';
import type { UserProfile } from '../services/authStore';
import {
  addVideoComment, connectMirror, disconnectMirror, isModerator, listMirrors, loadChannelFeed, loadPendingVideos, loadSharingSettings,
  loadVideoComments, moderateVideo, reportVideo, saveSharingSettings, toggleFollow, toggleVideoLike, uploadChannelVideo,
  type ChannelVideo, type FeedMode, type StorageMirror,
} from '../services/channelStore';
import { blockCommunityUser } from '../services/communityStore';
import { DEFAULT_SHARING, type SharingSettings } from '../domain/channels/sharingPolicy';
import type { VideoKind } from '../domain/channels/limits';

const ChannelPlayer = React.lazy(() => import('./ChannelPlayer').then((m) => ({ default: m.ChannelPlayer })));

type Locale = 'ar' | 'fr' | 'en';
const isUuid = (v: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{12}$/i.test(v);
const wilayaOf = (v: string) => v.match(/^\s*(\d{2,3})/)?.[1] ?? null;

interface Props { user: UserProfile; locale: Locale }

export const ChannelsView: React.FC<Props> = ({ user, locale }) => {
  const t = (ar: string, fr: string, en: string) => (locale === 'ar' ? ar : locale === 'en' ? en : fr);
  const userId = isUuid(user.id) ? user.id : undefined;
  const [mode, setMode] = useState<FeedMode>('forYou');
  const [videos, setVideos] = useState<ChannelVideo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [activeId, setActiveId] = useState<string | null>(null);
  const [sharing, setSharing] = useState<SharingSettings>(DEFAULT_SHARING);
  const [panel, setPanel] = useState<null | 'upload' | 'settings' | 'moderation'>(null);
  const [moderator, setModerator] = useState(false);
  const [commentsFor, setCommentsFor] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    const res = await loadChannelFeed(mode, userId, wilayaOf(user.wilaya));
    setLoading(false);
    if (res.success) { setVideos(res.data ?? []); setError(''); } else setError(res.error || 'error');
  }, [mode, userId, user.wilaya]);

  useEffect(() => { void refresh(); }, [refresh]);
  useEffect(() => { if (userId) { void loadSharingSettings(userId).then(setSharing); void isModerator().then(setModerator); } }, [userId]);

  // The card most visible on screen is the only one that plays.
  const observer = useRef<IntersectionObserver | null>(null);
  const attach = useCallback((node: HTMLElement | null) => {
    if (!node) return;
    observer.current ??= new IntersectionObserver((entries) => {
      for (const e of entries) if (e.isIntersecting && e.intersectionRatio > 0.6) setActiveId((e.target as HTMLElement).dataset.vid ?? null);
    }, { threshold: [0.6] });
    observer.current.observe(node);
  }, []);
  useEffect(() => () => observer.current?.disconnect(), []);

  const patch = (id: string, fn: (v: ChannelVideo) => ChannelVideo) => setVideos((vs) => vs.map((v) => (v.id === id ? fn(v) : v)));
  const requireLogin = () => { if (!userId) { setError(t('سجّل الدخول أولاً', 'Connectez-vous d’abord', 'Sign in first')); return true; } return false; };

  const like = async (v: ChannelVideo) => {
    if (requireLogin()) return;
    const r = await toggleVideoLike(v.id, userId!, v.likedByMe);
    if (r.success) patch(v.id, (x) => ({ ...x, likedByMe: !x.likedByMe, likes: x.likes + (x.likedByMe ? -1 : 1) }));
  };
  const follow = async (v: ChannelVideo) => {
    if (requireLogin() || v.authorId === userId) return;
    const r = await toggleFollow(v.authorId, userId!, v.followingAuthor);
    if (r.success) setVideos((vs) => vs.map((x) => (x.authorId === v.authorId ? { ...x, followingAuthor: !v.followingAuthor } : x)));
  };
  const report = async (v: ChannelVideo) => {
    if (requireLogin()) return;
    const reason = window.prompt(t('السبب: spam, abuse, illegal, sexual, violence, copyright, other', 'Motif : spam, abuse, illegal, sexual, violence, copyright, other', 'Reason: spam, abuse, illegal, sexual, violence, copyright, other'), 'abuse');
    if (!reason) return;
    const r = await reportVideo(v.id, userId!, reason.trim());
    setError(r.success ? t('تم الإبلاغ', 'Signalé, merci', 'Reported, thank you') : r.error || 'error');
  };
  const block = async (v: ChannelVideo) => {
    if (requireLogin() || v.authorId === userId) return;
    const r = await blockCommunityUser(userId!, v.authorId);
    if (r.success) setVideos((vs) => vs.filter((x) => x.authorId !== v.authorId));
  };

  const tabs: Array<[FeedMode, string]> = [
    ['forYou', t('لك', 'Pour vous', 'For you')], ['following', t('أتابعهم', 'Abonnements', 'Following')],
    ['short', t('قصيرة', 'Courtes', 'Short')], ['long', t('طويلة', 'Longues', 'Long')],
  ];

  return (
    <div className="flex flex-col h-[calc(100dvh-9rem)] max-w-xl mx-auto" dir={locale === 'ar' ? 'rtl' : 'ltr'}>
      <div className="flex items-center gap-2 pb-2">
        <div className="flex gap-1 flex-1 overflow-x-auto">
          {tabs.map(([m, label]) => (
            <button key={m} onClick={() => setMode(m)} className={`px-3 py-1.5 rounded-full text-xs whitespace-nowrap ${mode === m ? 'bg-emerald-500 text-slate-950 font-bold' : 'bg-slate-800 text-slate-300'}`}>{label}</button>
          ))}
        </div>
        <button aria-label="upload" onClick={() => setPanel('upload')} className="p-2 rounded-full bg-slate-800"><Plus size={16} /></button>
        <button aria-label="settings" onClick={() => setPanel('settings')} className="p-2 rounded-full bg-slate-800"><Settings2 size={16} /></button>
        {moderator && <button aria-label="moderation" onClick={() => setPanel('moderation')} className="p-2 rounded-full bg-slate-800"><ShieldCheck size={16} /></button>}
      </div>
      {error && <div className="text-xs text-amber-300 pb-2" role="alert">{error}</div>}
      <div className="flex-1 overflow-y-auto snap-y snap-mandatory rounded-xl">
        {loading && <div className="p-6 text-sm text-slate-400">{t('جارٍ التحميل…', 'Chargement…', 'Loading…')}</div>}
        {!loading && videos.length === 0 && <div className="p-6 text-sm text-slate-400">{t('لا توجد فيديوهات بعد', 'Aucune vidéo pour le moment', 'No videos yet')}</div>}
        {videos.map((v) => (
          <section key={v.id} data-vid={v.id} ref={attach} className="snap-start h-full relative bg-black border-b border-slate-900">
            <Suspense fallback={<div className="w-full h-full bg-black" />}>
              <ChannelPlayer videoId={v.id} userId={userId} active={activeId === v.id} sharing={sharing} loop={v.kind === 'short'} />
            </Suspense>
            <div className="absolute inset-x-0 bottom-0 p-3 bg-gradient-to-t from-black/80 to-transparent pointer-events-none">
              <div className="text-sm font-bold text-white">{v.title}</div>
              <div className="text-xs text-slate-300">@{v.authorHandle} · {Math.round(v.durationMs / 1000)}s</div>
            </div>
            <div className="absolute end-2 bottom-16 flex flex-col items-center gap-3 text-white">
              <button aria-label="like" onClick={() => like(v)} className="flex flex-col items-center text-[10px]"><Heart size={22} className={v.likedByMe ? 'fill-red-500 text-red-500' : ''} />{v.likes}</button>
              <button aria-label="comments" onClick={() => setCommentsFor(v.id)}><MessageCircle size={22} /></button>
              {v.authorId !== userId && <button aria-label="follow" onClick={() => follow(v)}>{v.followingAuthor ? <UserCheck size={22} className="text-emerald-400" /> : <UserPlus size={22} />}</button>}
              <button aria-label="report" onClick={() => report(v)}><Flag size={20} /></button>
              {v.authorId !== userId && <button aria-label="block" onClick={() => block(v)} className="text-[10px] underline">{t('حظر', 'Bloquer', 'Block')}</button>}
            </div>
          </section>
        ))}
      </div>

      {commentsFor && <CommentsSheet videoId={commentsFor} userId={userId} t={t} onClose={() => setCommentsFor(null)} />}
      {panel === 'upload' && <UploadSheet t={t} locale={locale} wilaya={wilayaOf(user.wilaya)} signedIn={!!userId} onClose={() => setPanel(null)} />}
      {panel === 'settings' && <SettingsSheet t={t} userId={userId} sharing={sharing} onChange={setSharing} onClose={() => setPanel(null)} />}
      {panel === 'moderation' && <ModerationSheet t={t} onClose={() => { setPanel(null); void refresh(); }} />}
    </div>
  );
};

type T = (ar: string, fr: string, en: string) => string;
const Sheet: React.FC<{ title: string; onClose: () => void; children: React.ReactNode }> = ({ title, onClose, children }) => (
  <div className="fixed inset-0 z-50 bg-black/70 flex items-end sm:items-center justify-center" role="dialog" aria-label={title}>
    <div className="bg-slate-900 w-full max-w-lg max-h-[85dvh] overflow-y-auto rounded-t-2xl sm:rounded-2xl p-4 space-y-3 text-slate-100">
      <div className="flex items-center justify-between"><h2 className="font-bold text-sm">{title}</h2><button aria-label="close" onClick={onClose}><X size={18} /></button></div>
      {children}
    </div>
  </div>
);
const field = 'w-full bg-slate-800 rounded-lg px-3 py-2 text-sm';

const CommentsSheet: React.FC<{ videoId: string; userId?: string; t: T; onClose: () => void }> = ({ videoId, userId, t, onClose }) => {
  const [items, setItems] = useState<Array<{ id: string; body: string }>>([]);
  const [draft, setDraft] = useState('');
  const [msg, setMsg] = useState('');
  useEffect(() => { void loadVideoComments(videoId).then((r) => setItems(r.data ?? [])); }, [videoId]);
  const send = async () => {
    if (!userId) { setMsg(t('سجّل الدخول أولاً', 'Connectez-vous d’abord', 'Sign in first')); return; }
    const r = await addVideoComment(videoId, userId, draft.trim());
    if (r.success) { setDraft(''); setItems((await loadVideoComments(videoId)).data ?? []); } else setMsg(t('لا روابط أو أرقام أو بريد في التعليقات', 'Pas de liens, numéros ni e-mails dans les commentaires', 'No links, phone numbers or emails in comments'));
  };
  return (
    <Sheet title={t('التعليقات', 'Commentaires', 'Comments')} onClose={onClose}>
      <ul className="space-y-2 text-sm">{items.map((c) => <li key={c.id} className="bg-slate-800 rounded-lg px-3 py-2">{c.body}</li>)}</ul>
      <div className="flex gap-2"><input className={field} value={draft} maxLength={500} onChange={(e) => setDraft(e.target.value)} /><button onClick={send} disabled={!draft.trim()} className="px-3 rounded-lg bg-emerald-500 text-slate-950 text-sm font-bold disabled:opacity-40">OK</button></div>
      {msg && <div className="text-xs text-amber-300">{msg}</div>}
    </Sheet>
  );
};

const UploadSheet: React.FC<{ t: T; locale: Locale; wilaya: string | null; signedIn: boolean; onClose: () => void }> = ({ t, locale, wilaya, signedIn, onClose }) => {
  const [kind, setKind] = useState<VideoKind>('short');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [shareWilaya, setShareWilaya] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const submit = async () => {
    if (!file) return;
    setBusy(true); setMsg('');
    const r = await uploadChannelVideo(file, { kind, title: title.trim(), description, locale, wilaya: shareWilaya ? wilaya : null });
    setBusy(false);
    setMsg(r.success ? t('تم الإرسال. سيُنشر بعد مراجعة المشرف.', 'Envoyée. Publication après relecture par un modérateur.', 'Uploaded. It goes live after a moderator reviews it.') : t('فشل الرفع: ', 'Échec : ', 'Failed: ') + (r.error || ''));
  };
  return (
    <Sheet title={t('نشر فيديو', 'Publier une vidéo', 'Post a video')} onClose={onClose}>
      {!signedIn && <div className="text-xs text-amber-300">{t('سجّل الدخول للنشر', 'Connectez-vous pour publier', 'Sign in to post')}</div>}
      <div className="flex gap-2 text-xs">
        {(['short', 'long'] as VideoKind[]).map((k) => <button key={k} onClick={() => setKind(k)} className={`px-3 py-1.5 rounded-full ${kind === k ? 'bg-emerald-500 text-slate-950 font-bold' : 'bg-slate-800'}`}>{k === 'short' ? t('قصير (≤ 90 ث)', 'Court (≤ 90 s)', 'Short (≤ 90 s)') : t('طويل (≤ 15 د)', 'Long (≤ 15 min)', 'Long (≤ 15 min)')}</button>)}
      </div>
      <input className={field} placeholder={t('العنوان', 'Titre', 'Title')} value={title} maxLength={120} onChange={(e) => setTitle(e.target.value)} />
      <textarea className={field} rows={3} placeholder={t('الوصف', 'Description', 'Description')} value={description} maxLength={2000} onChange={(e) => setDescription(e.target.value)} />
      <input type="file" accept="video/*" onChange={(e) => setFile(e.target.files?.[0] ?? null)} className="text-xs" />
      {wilaya && <label className="flex gap-2 text-xs"><input type="checkbox" checked={shareWilaya} onChange={(e) => setShareWilaya(e.target.checked)} />{t('أظهر ولايتي', 'Afficher ma wilaya', 'Show my wilaya')}</label>}
      <p className="text-[11px] text-slate-400">{t('كل فيديو يُراجع قبل نشره ولا يُمرَّر بين الهواتف قبل الموافقة.', 'Chaque vidéo est relue avant publication et n’est jamais relayée entre téléphones avant approbation.', 'Every video is reviewed before it goes live and is never relayed between phones before approval.')}</p>
      <button onClick={submit} disabled={!signedIn || busy || !file || title.trim().length < 3} className="w-full py-2 rounded-lg bg-emerald-500 text-slate-950 font-bold text-sm disabled:opacity-40">{busy ? '…' : t('إرسال للمراجعة', 'Envoyer pour relecture', 'Submit for review')}</button>
      {msg && <div className="text-xs text-slate-300">{msg}</div>}
    </Sheet>
  );
};

const SettingsSheet: React.FC<{ t: T; userId?: string; sharing: SharingSettings; onChange: (s: SharingSettings) => void; onClose: () => void }> = ({ t, userId, sharing, onChange, onClose }) => {
  const [mirrors, setMirrors] = useState<StorageMirror[]>([]);
  const [form, setForm] = useState({ provider: 'r2', label: '', endpointHost: '', bucket: '', publicBaseUrl: '', accessKeyId: '', secretAccessKey: '' });
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);
  const reload = useCallback(async () => { if (userId) setMirrors((await listMirrors()).data ?? []); }, [userId]);
  useEffect(() => { void reload(); }, [reload]);
  const update = async (next: SharingSettings) => { onChange(next); if (userId) await saveSharingSettings(userId, next); };
  const connect = async () => {
    setBusy(true); setMsg('');
    const r = await connectMirror(form);
    setBusy(false);
    if (r.success) { setForm({ ...form, label: '', secretAccessKey: '', accessKeyId: '' }); await reload(); setMsg(t('تم الربط', 'Stockage connecté', 'Storage connected')); } else setMsg(r.error || 'error');
  };
  return (
    <Sheet title={t('الإعدادات', 'Réglages des chaînes', 'Channel settings')} onClose={onClose}>
      <label className="flex items-center justify-between text-sm"><span>{t('مشاركة الفيديو مع هواتف أخرى', 'Partager des morceaux de vidéo avec d’autres téléphones', 'Share video pieces with other phones')}</span><input type="checkbox" checked={sharing.sharingEnabled} onChange={(e) => update({ ...sharing, sharingEnabled: e.target.checked })} /></label>
      <p className="text-[11px] text-slate-400">{t('معطّلة افتراضياً. تعمل فقط والتطبيق مفتوح، وتستهلك بيانات الرفع.', 'Désactivé par défaut. Ne fonctionne que lorsque l’app est ouverte et consomme des données d’envoi.', 'Off by default. Only works while the app is open and uses upload data.')}</p>
      <label className="flex items-center justify-between text-sm"><span>{t('واي فاي فقط', 'Wi-Fi uniquement', 'Wi-Fi only')}</span><input type="checkbox" checked={sharing.wifiOnly} onChange={(e) => update({ ...sharing, wifiOnly: e.target.checked })} /></label>
      <label className="flex items-center justify-between text-sm"><span>{t('سقف الرفع اليومي (MB)', 'Plafond d’envoi par jour (Mo)', 'Daily upload cap (MB)')}</span><input type="number" min={0} max={5000} className="w-24 bg-slate-800 rounded px-2 py-1" value={sharing.dailyUploadCapMb} onChange={(e) => update({ ...sharing, dailyUploadCapMb: Math.min(5000, Math.max(0, Number(e.target.value) || 0)) })} /></label>
      <label className="flex items-center justify-between text-sm"><span>{t('الحد الأدنى للبطارية %', 'Batterie minimale %', 'Minimum battery %')}</span><input type="number" min={0} max={100} className="w-24 bg-slate-800 rounded px-2 py-1" value={sharing.minBatteryPct} onChange={(e) => update({ ...sharing, minBatteryPct: Math.min(100, Math.max(0, Number(e.target.value) || 0)) })} /></label>
      <label className="flex items-center justify-between text-sm"><span>{t('احترم توفير البيانات', 'Respecter l’économiseur de données', 'Respect data saver')}</span><input type="checkbox" checked={sharing.dataSaver} onChange={(e) => update({ ...sharing, dataSaver: e.target.checked })} /></label>

      <h3 className="font-bold text-sm pt-2 flex items-center gap-2"><HardDrive size={14} />{t('تخزين إضافي', 'Stockage supplémentaire', 'Additional storage')}</h3>
      <p className="text-[11px] text-slate-400">{t('اربط حاوية Cloudflare R2 أو S3 لنسخ فيديوهاتك. نبقى محتفظين بنسخة أصلية دائماً. تدفع أنت رسوم حاويتك.', 'Connectez un bucket Cloudflare R2 ou S3 pour copier vos vidéos. Kenz garde toujours sa copie d’origine. Les frais de votre bucket sont à votre charge.', 'Connect a Cloudflare R2 or S3 bucket to mirror your videos. Kenz always keeps its own origin copy. Your bucket’s fees are yours.')}</p>
      {mirrors.map((m) => (
        <div key={m.id} className="flex items-center justify-between bg-slate-800 rounded-lg px-3 py-2 text-xs">
          <span>{m.label} · {m.provider.toUpperCase()} · {m.status}{m.lastError ? ` (${m.lastError})` : ''}</span>
          <button className="text-red-300 underline" onClick={async () => { await disconnectMirror(m.id); await reload(); }}>{t('فصل', 'Déconnecter', 'Disconnect')}</button>
        </div>
      ))}
      {userId && (
        <div className="space-y-2">
          <select className={field} value={form.provider} onChange={(e) => setForm({ ...form, provider: e.target.value })}><option value="r2">Cloudflare R2</option><option value="s3">S3 (AWS, Backblaze B2, Wasabi)</option></select>
          <input className={field} placeholder="Label" value={form.label} onChange={(e) => setForm({ ...form, label: e.target.value })} />
          <input className={field} placeholder={form.provider === 'r2' ? '<account-id>.r2.cloudflarestorage.com' : 's3.eu-west-1.amazonaws.com'} value={form.endpointHost} onChange={(e) => setForm({ ...form, endpointHost: e.target.value })} />
          <input className={field} placeholder="Bucket" value={form.bucket} onChange={(e) => setForm({ ...form, bucket: e.target.value })} />
          <input className={field} placeholder="https://media.example.com" value={form.publicBaseUrl} onChange={(e) => setForm({ ...form, publicBaseUrl: e.target.value })} />
          <input className={field} placeholder="Access key ID" autoComplete="off" value={form.accessKeyId} onChange={(e) => setForm({ ...form, accessKeyId: e.target.value })} />
          <input className={field} type="password" placeholder="Secret access key" autoComplete="off" value={form.secretAccessKey} onChange={(e) => setForm({ ...form, secretAccessKey: e.target.value })} />
          <p className="text-[11px] text-slate-400">{t('أنشئ مفتاحاً يكتب في هذه الحاوية فقط.', 'Créez une clé limitée à ce seul bucket (écriture).', 'Create a key scoped to this one bucket (write access).')}</p>
          <button onClick={connect} disabled={busy} className="w-full py-2 rounded-lg bg-emerald-500 text-slate-950 font-bold text-sm disabled:opacity-40">{busy ? '…' : t('اربط وتحقق', 'Connecter et tester', 'Connect and test')}</button>
        </div>
      )}
      {msg && <div className="text-xs text-slate-300" role="status">{msg}</div>}
    </Sheet>
  );
};

const ModerationSheet: React.FC<{ t: T; onClose: () => void }> = ({ t, onClose }) => {
  const [items, setItems] = useState<Array<{ id: string; title: string; kind: VideoKind; durationMs: number }>>([]);
  const [msg, setMsg] = useState('');
  const load = useCallback(async () => setItems((await loadPendingVideos()).data ?? []), []);
  useEffect(() => { void load(); }, [load]);
  const act = async (id: string, action: 'approve' | 'reject') => {
    const r = await moderateVideo(id, action, action === 'reject' ? window.prompt('Reason') ?? undefined : undefined);
    setMsg(r.success ? '' : r.error || 'error');
    await load();
  };
  return (
    <Sheet title={t('قائمة المراجعة', 'File de relecture', 'Review queue')} onClose={onClose}>
      {items.length === 0 && <div className="text-sm text-slate-400">{t('لا شيء بانتظار المراجعة', 'Rien en attente', 'Nothing waiting')}</div>}
      {items.map((v) => (
        <div key={v.id} className="bg-slate-800 rounded-lg p-3 space-y-2">
          <div className="text-sm font-bold">{v.title} <span className="text-xs text-slate-400">({v.kind}, {Math.round(v.durationMs / 1000)}s)</span></div>
          <div className="flex gap-2"><button onClick={() => act(v.id, 'approve')} className="flex-1 py-1.5 rounded bg-emerald-500 text-slate-950 text-xs font-bold">{t('موافقة ونشر', 'Approuver', 'Approve')}</button><button onClick={() => act(v.id, 'reject')} className="flex-1 py-1.5 rounded bg-red-500/80 text-xs font-bold">{t('رفض', 'Rejeter', 'Reject')}</button></div>
        </div>
      ))}
      {msg && <div className="text-xs text-red-300">{msg}</div>}
    </Sheet>
  );
};
