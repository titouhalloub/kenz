import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ArrowDownLeft, ArrowUpRight, Users, Plus, RefreshCw, Trash2, LogOut, Mail, Wallet, X, AlertCircle } from 'lucide-react';
import { getSupabaseClient } from '../services/supabase';
import { formatMoney, parseToMinorUnits } from '../domain/financialCalculations';

type SharedWallet = { id: string; owner_id: string; name: string; currency: string; created_at: string };
type Member = { wallet_id: string; user_id: string; owner_id: string; member_email: string; role: 'owner' | 'editor' | 'viewer'; joined_at: string };
type Invite = { id: string; wallet_id: string; owner_id: string; invitee_email: string; role: 'editor' | 'viewer'; status: 'pending' | 'accepted' | 'revoked'; created_at: string; accepted_at?: string | null };
type Entry = { id: string; wallet_id: string; created_by: string; type: 'income' | 'expense'; amount_minor: number; currency: string; description: string; transaction_date: string; created_at: string };

interface SharedWalletsViewProps {
  userId: string;
  email: string;
  preferredCurrency: string;
  locale: 'ar' | 'fr' | 'en';
}

const today = () => {
  const d = new Date();
  return [d.getFullYear(), String(d.getMonth() + 1).padStart(2, '0'), String(d.getDate()).padStart(2, '0')].join('-');
};

export const SharedWalletsView: React.FC<SharedWalletsViewProps> = ({ userId, email, preferredCurrency, locale }) => {
  const [wallets, setWallets] = useState<SharedWallet[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [invites, setInvites] = useState<Invite[]>([]);
  const [entries, setEntries] = useState<Entry[]>([]);
  const [selectedId, setSelectedId] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [walletName, setWalletName] = useState('');
  const [walletCurrency, setWalletCurrency] = useState(preferredCurrency);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState<'editor' | 'viewer'>('editor');
  const [entryType, setEntryType] = useState<'expense' | 'income'>('expense');
  const [entryAmount, setEntryAmount] = useState('');
  const [entryDescription, setEntryDescription] = useState('');
  const [entryDate, setEntryDate] = useState(today());

  const supabase = getSupabaseClient();
  const selected = wallets.find((wallet) => wallet.id === selectedId) || wallets[0];
  const myMembership = members.find((member) => member.wallet_id === selected?.id && member.user_id === userId);
  const canEdit = myMembership?.role === 'owner' || myMembership?.role === 'editor';
  const isOwner = myMembership?.role === 'owner';
  const selectedMembers = members.filter((member) => member.wallet_id === selected?.id);
  const selectedInvites = invites.filter((invite) => invite.wallet_id === selected?.id && invite.status === 'pending');
  const incomingInvites = invites.filter((invite) => invite.invitee_email === email.toLowerCase() && invite.status === 'pending');

  const refresh = useCallback(async (walletId?: string) => {
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(userId)) {
      setError('Connectez-vous à votre compte Kenz pour utiliser les portefeuilles partagés.');
      setLoading(false);
      return;
    }
    if (!supabase) {
      setError('Connexion Supabase indisponible. Connectez votre compte pour utiliser les portefeuilles partagés.');
      setLoading(false);
      return;
    }
    setError('');
    const [walletResult, memberResult, inviteResult] = await Promise.all([
      supabase.from('shared_wallets').select('*').order('created_at', { ascending: false }),
      supabase.from('shared_wallet_members').select('*'),
      supabase.from('shared_wallet_invites').select('*').order('created_at', { ascending: false }),
    ]);
    const failure = walletResult.error || memberResult.error || inviteResult.error;
    if (failure) {
      setError(failure.message);
      setLoading(false);
      return;
    }
    const nextWallets = (walletResult.data || []) as SharedWallet[];
    setWallets(nextWallets);
    setMembers((memberResult.data || []) as Member[]);
    setInvites((inviteResult.data || []) as Invite[]);
    const nextId = walletId && nextWallets.some((wallet) => wallet.id === walletId)
      ? walletId
      : selectedId && nextWallets.some((wallet) => wallet.id === selectedId)
        ? selectedId
        : nextWallets[0]?.id || '';
    setSelectedId(nextId);
    if (nextId) {
      const { data, error: entryError } = await supabase.from('shared_wallet_entries').select('*').eq('wallet_id', nextId).order('transaction_date', { ascending: false }).order('created_at', { ascending: false });
      if (entryError) setError(entryError.message);
      else setEntries((data || []) as Entry[]);
    } else setEntries([]);
    setLoading(false);
  }, [supabase, selectedId]);

  useEffect(() => { void refresh(); }, [userId, refresh]);

  useEffect(() => {
    if (!selectedId || !supabase) return;
    let active = true;
    void supabase.from('shared_wallet_entries').select('*').eq('wallet_id', selectedId).order('transaction_date', { ascending: false }).then(({ data, error: queryError }) => {
      if (!active) return;
      if (queryError) setError(queryError.message);
      else setEntries((data || []) as Entry[]);
    });
    return () => { active = false; };
  }, [selectedId, supabase]);

  const totals = useMemo(() => entries.reduce((sum, entry) => {
    if (entry.type === 'income') sum.income += Number(entry.amount_minor);
    else sum.expense += Number(entry.amount_minor);
    return sum;
  }, { income: 0, expense: 0 }), [entries]);

  const run = async (action: () => Promise<void>) => {
    if (busy) return;
    setBusy(true); setError(''); setNotice('');
    try { await action(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Une erreur est survenue.'); }
    finally { setBusy(false); }
  };

  const createWallet = () => run(async () => {
    if (!supabase) throw new Error('Connexion Supabase indisponible.');
    if (!walletName.trim()) throw new Error('Donnez un nom à la cagnotte.');
    const { data, error: insertError } = await supabase.from('shared_wallets').insert({
      owner_id: userId, name: walletName.trim(), currency: walletCurrency,
    }).select('id').single();
    if (insertError) throw insertError;
    setWalletName(''); setShowCreate(false);
    await refresh(data.id);
    setNotice('Portefeuille partagé créé.');
  });

  const sendInvite = () => run(async () => {
    if (!supabase || !selected || !isOwner) throw new Error('Seul le propriétaire peut inviter des membres.');
    const normalizedEmail = inviteEmail.trim().toLowerCase();
    if (!normalizedEmail || !normalizedEmail.includes('@')) throw new Error('Saisissez une adresse e-mail valide.');
    const { error: inviteError } = await supabase.from('shared_wallet_invites').insert({
      wallet_id: selected.id, owner_id: userId, invitee_email: normalizedEmail, role: inviteRole,
    });
    if (inviteError) throw inviteError;
    setInviteEmail('');
    await refresh(selected.id);
    setNotice('Invitation créée. Elle apparaîtra dans Kenz lorsque cette personne se connectera avec cette adresse e-mail.');
  });

  const acceptInvite = (invite: Invite) => run(async () => {
    if (!supabase) throw new Error('Connexion Supabase indisponible.');
    const { error: memberError } = await supabase.from('shared_wallet_members').insert({
      wallet_id: invite.wallet_id, user_id: userId, owner_id: invite.owner_id, member_email: email.toLowerCase(), role: invite.role,
    });
    if (memberError && memberError.code !== '23505') throw memberError;
    const { error: acceptError } = await supabase.from('shared_wallet_invites').update({
      status: 'accepted', accepted_by: userId, accepted_at: new Date().toISOString(),
    }).eq('id', invite.id);
    if (acceptError) throw acceptError;
    await refresh(invite.wallet_id);
    setNotice('Invitation acceptée. Le portefeuille est maintenant partagé avec vous.');
  });

  const changeRole = (member: Member, role: 'editor' | 'viewer') => run(async () => {
    if (!supabase || !isOwner) throw new Error('Action réservée au propriétaire.');
    const { error: updateError } = await supabase.from('shared_wallet_members').update({ role }).eq('wallet_id', member.wallet_id).eq('user_id', member.user_id);
    if (updateError) throw updateError;
    await refresh(selected?.id);
  });

  const removeMember = (member: Member) => run(async () => {
    if (!supabase || !selected) throw new Error('Connexion Supabase indisponible.');
    if (member.user_id !== userId && !isOwner) throw new Error('Action non autorisée.');
    const { error: deleteError } = await supabase.from('shared_wallet_members').delete().eq('wallet_id', member.wallet_id).eq('user_id', member.user_id);
    if (deleteError) throw deleteError;
    await refresh(selected.id);
  });

  const revokeInvite = (invite: Invite) => run(async () => {
    if (!supabase || !isOwner) throw new Error('Action réservée au propriétaire.');
    const { error: updateError } = await supabase.from('shared_wallet_invites').update({ status: 'revoked' }).eq('id', invite.id);
    if (updateError) throw updateError;
    await refresh(selected?.id);
  });

  const addEntry = () => run(async () => {
    if (!supabase || !selected || !canEdit) throw new Error('Vous ne disposez pas des droits de modification.');
    const amountMinor = parseToMinorUnits(entryAmount);
    if (!Number.isSafeInteger(amountMinor) || amountMinor <= 0 || !entryDescription.trim()) throw new Error('Vérifiez le montant et la description.');
    const { error: insertError } = await supabase.from('shared_wallet_entries').insert({
      wallet_id: selected.id, created_by: userId, type: entryType, amount_minor: amountMinor,
      currency: selected.currency, description: entryDescription.trim(), transaction_date: entryDate,
    });
    if (insertError) throw insertError;
    setEntryAmount(''); setEntryDescription('');
    await refresh(selected.id);
    setNotice('Opération ajoutée au portefeuille partagé.');
  });

  const deleteEntry = (entryId: string) => run(async () => {
    if (!supabase || !selected || !canEdit) throw new Error('Action non autorisée.');
    const { error: deleteError } = await supabase.from('shared_wallet_entries').delete().eq('id', entryId);
    if (deleteError) throw deleteError;
    await refresh(selected.id);
  });

  const deleteWallet = () => run(async () => {
    if (!supabase || !selected || !isOwner) throw new Error('Action réservée au propriétaire.');
    if (!window.confirm('Supprimer ce portefeuille et toutes ses opérations partagées ?')) return;
    const { error: deleteError } = await supabase.from('shared_wallets').delete().eq('id', selected.id);
    if (deleteError) throw deleteError;
    await refresh();
    setNotice('Portefeuille supprimé.');
  });

  return (
    <div className="space-y-5 pb-24">
      <header className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-lg font-bold text-slate-100 flex items-center gap-2"><Users className="w-5 h-5 text-emerald-400" /> Portefeuilles partagés</h1>
          <p className="mt-1 text-xs text-slate-400">Gérez une cagnotte familiale ou de groupe sans mélanger les comptes personnels.</p>
        </div>
        <button onClick={() => setShowCreate((value) => !value)} className="min-h-11 px-3 rounded-xl bg-emerald-600 text-white text-xs font-semibold flex items-center gap-1.5"><Plus className="w-4 h-4" /> Créer</button>
      </header>

      {error && <div role="alert" className="rounded-xl border border-rose-800 bg-rose-950/40 p-3 text-xs text-rose-200 flex gap-2"><AlertCircle className="w-4 h-4 shrink-0" />{error}</div>}
      {notice && <div role="status" className="rounded-xl border border-emerald-800 bg-emerald-950/30 p-3 text-xs text-emerald-200">{notice}</div>}

      {showCreate && <form onSubmit={(event) => { event.preventDefault(); void createWallet(); }} className="rounded-2xl bg-slate-900 border border-slate-800 p-4 space-y-3">
        <h2 className="text-sm font-semibold text-slate-100">Nouveau portefeuille</h2>
        <label className="block text-xs text-slate-300">Nom<input value={walletName} onChange={(e) => setWalletName(e.target.value)} maxLength={80} placeholder="Ex. Dépenses de la maison" className="mt-1 w-full h-11 rounded-xl bg-slate-950 border border-slate-700 px-3 text-sm text-white" required /></label>
        <label className="block text-xs text-slate-300">Devise<select value={walletCurrency} onChange={(e) => setWalletCurrency(e.target.value)} className="mt-1 w-full h-11 rounded-xl bg-slate-950 border border-slate-700 px-3 text-sm text-white"><option value="DZD">DZD</option><option value="EUR">EUR</option><option value="USD">USD</option></select></label>
        <div className="flex gap-2"><button disabled={busy} className="min-h-11 px-4 rounded-xl bg-emerald-600 text-white text-xs font-semibold">Créer le portefeuille</button><button type="button" onClick={() => setShowCreate(false)} className="min-h-11 px-4 rounded-xl border border-slate-700 text-slate-300 text-xs">Annuler</button></div>
      </form>}

      {incomingInvites.length > 0 && <section className="rounded-2xl bg-slate-900 border border-emerald-900/60 p-4 space-y-3">
        <h2 className="text-sm font-semibold text-slate-100 flex items-center gap-2"><Mail className="w-4 h-4 text-emerald-400" /> Invitations reçues ({incomingInvites.length})</h2>
        {incomingInvites.map((invite) => <div key={invite.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-slate-950 p-3">
          <div><p className="text-xs text-slate-200">Portefeuille partagé · {invite.role === 'editor' ? 'Éditeur' : 'Lecture seule'}</p><p className="text-[10px] text-slate-500">{invite.invitee_email}</p></div>
          <button disabled={busy} onClick={() => void acceptInvite(invite)} className="min-h-10 px-3 rounded-lg bg-emerald-600 text-white text-xs font-semibold">Accepter</button>
        </div>)}
      </section>}

      {loading ? <div className="py-10 text-center text-xs text-slate-400"><RefreshCw className="w-4 h-4 animate-spin inline mr-2" />Chargement…</div> : wallets.length === 0 ? <div className="rounded-2xl border border-dashed border-slate-700 p-7 text-center"><Wallet className="w-8 h-8 mx-auto text-slate-500" /><p className="mt-2 text-sm text-slate-200">Aucun portefeuille partagé</p><p className="mt-1 text-xs text-slate-500">Créez une cagnotte ou acceptez une invitation pour commencer.</p></div> : <>
        <div className="flex gap-2 overflow-x-auto pb-1">{wallets.map((wallet) => <button key={wallet.id} onClick={() => setSelectedId(wallet.id)} className={`shrink-0 min-h-11 px-3 rounded-xl border text-xs font-semibold ${selected?.id === wallet.id ? 'bg-emerald-950 border-emerald-700 text-emerald-300' : 'bg-slate-900 border-slate-800 text-slate-300'}`}>{wallet.name}</button>)}</div>

        {selected && <section className="rounded-2xl bg-slate-900 border border-slate-800 p-4 space-y-4">
          <div className="flex items-start justify-between gap-2"><div><h2 className="text-base font-bold text-white">{selected.name}</h2><p className="text-[10px] text-slate-400">{selected.currency} · {selectedMembers.length} membre(s) · {myMembership?.role === 'owner' ? 'Propriétaire' : myMembership?.role === 'editor' ? 'Éditeur' : 'Lecture seule'}</p></div><button onClick={() => void refresh(selected.id)} title="Actualiser" className="min-h-10 min-w-10 rounded-lg bg-slate-800 text-slate-300 flex items-center justify-center"><RefreshCw className="w-4 h-4" /></button></div>
          <div className="grid grid-cols-3 gap-2">
            <div className="rounded-xl bg-slate-950 p-3"><p className="text-[10px] text-slate-500">Revenus</p><p className="mt-1 text-xs font-bold text-emerald-300">{formatMoney(totals.income, selected.currency, locale)}</p></div>
            <div className="rounded-xl bg-slate-950 p-3"><p className="text-[10px] text-slate-500">Dépenses</p><p className="mt-1 text-xs font-bold text-rose-300">{formatMoney(totals.expense, selected.currency, locale)}</p></div>
            <div className="rounded-xl bg-slate-950 p-3"><p className="text-[10px] text-slate-500">Solde net</p><p className="mt-1 text-xs font-bold text-white">{formatMoney(totals.income - totals.expense, selected.currency, locale)}</p></div>
          </div>

          {canEdit && <form onSubmit={(event) => { event.preventDefault(); void addEntry(); }} className="rounded-xl border border-slate-800 bg-slate-950 p-3 space-y-3">
            <div className="flex gap-2"><button type="button" onClick={() => setEntryType('expense')} className={`flex-1 min-h-10 rounded-lg text-xs font-semibold ${entryType === 'expense' ? 'bg-rose-950 text-rose-300 border border-rose-800' : 'bg-slate-900 text-slate-400'}`}><ArrowUpRight className="w-3.5 h-3.5 inline mr-1" />Dépense</button><button type="button" onClick={() => setEntryType('income')} className={`flex-1 min-h-10 rounded-lg text-xs font-semibold ${entryType === 'income' ? 'bg-emerald-950 text-emerald-300 border border-emerald-800' : 'bg-slate-900 text-slate-400'}`}><ArrowDownLeft className="w-3.5 h-3.5 inline mr-1" />Revenu</button></div>
            <div className="grid grid-cols-2 gap-2"><label className="text-[11px] text-slate-400">Montant<input value={entryAmount} onChange={(e) => setEntryAmount(e.target.value)} inputMode="decimal" className="mt-1 w-full h-10 rounded-lg bg-slate-900 border border-slate-700 px-2 text-sm text-white" required /></label><label className="text-[11px] text-slate-400">Date<input type="date" value={entryDate} onChange={(e) => setEntryDate(e.target.value)} className="mt-1 w-full h-10 rounded-lg bg-slate-900 border border-slate-700 px-2 text-xs text-white" required /></label></div>
            <label className="block text-[11px] text-slate-400">Description<input value={entryDescription} onChange={(e) => setEntryDescription(e.target.value)} maxLength={180} placeholder="Ex. Courses, facture…" className="mt-1 w-full h-10 rounded-lg bg-slate-900 border border-slate-700 px-3 text-xs text-white" required /></label>
            <button disabled={busy} className="w-full min-h-11 rounded-lg bg-emerald-600 text-white text-xs font-semibold">Ajouter l’opération</button>
          </form>}

          <div className="space-y-2"><h3 className="text-xs font-semibold text-slate-300">Historique partagé</h3>
            {entries.length === 0 ? <p className="rounded-xl bg-slate-950 p-4 text-center text-xs text-slate-500">Aucune opération pour le moment.</p> : entries.map((entry) => <div key={entry.id} className="flex items-center justify-between gap-3 rounded-xl bg-slate-950 p-3"><div className="min-w-0"><p className="text-xs font-medium text-slate-200 truncate">{entry.description}</p><p className="text-[10px] text-slate-500">{entry.transaction_date} · {entry.type === 'income' ? 'Revenu' : 'Dépense'}</p></div><div className="flex items-center gap-2"><span className={`text-xs font-bold whitespace-nowrap ${entry.type === 'income' ? 'text-emerald-300' : 'text-rose-300'}`}>{entry.type === 'income' ? '+' : '−'}{formatMoney(Number(entry.amount_minor), entry.currency, locale)}</span>{canEdit && <button onClick={() => void deleteEntry(entry.id)} title="Supprimer" className="min-h-9 min-w-9 rounded-lg text-slate-500 hover:text-rose-300"><Trash2 className="w-3.5 h-3.5" /></button>}</div></div>)}
          </div>
        </section>}

        {selected && <section className="rounded-2xl bg-slate-900 border border-slate-800 p-4 space-y-3">
          <h2 className="text-sm font-semibold text-slate-100 flex items-center gap-2"><Users className="w-4 h-4 text-emerald-400" /> Membres & accès</h2>
          {selectedMembers.map((member) => <div key={member.user_id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-slate-950 p-3"><div className="min-w-0"><p className="text-xs text-slate-200">{member.user_id === userId ? 'Vous' : member.member_email}</p><p className="text-[10px] text-slate-500">{member.role === 'owner' ? 'Propriétaire' : member.role === 'editor' ? 'Peut modifier' : 'Lecture seule'}</p></div><div className="flex items-center gap-1">{isOwner && member.role !== 'owner' && <><select value={member.role} onChange={(e) => void changeRole(member, e.target.value as 'editor' | 'viewer')} className="h-9 rounded-lg bg-slate-900 border border-slate-700 px-2 text-[10px] text-white"><option value="editor">Éditeur</option><option value="viewer">Lecture seule</option></select><button onClick={() => void removeMember(member)} className="min-h-9 min-w-9 text-slate-500 hover:text-rose-300" title="Retirer"><X className="w-4 h-4" /></button></>}{!isOwner && member.user_id === userId && <button onClick={() => void removeMember(member)} className="min-h-9 px-2 rounded-lg text-[10px] text-rose-300">Quitter</button>}</div></div>)}

          {isOwner && <form onSubmit={(event) => { event.preventDefault(); void sendInvite(); }} className="pt-2 space-y-2"><label className="block text-[11px] text-slate-400">Inviter par e-mail (compte Kenz existant)<input type="email" value={inviteEmail} onChange={(e) => setInviteEmail(e.target.value)} placeholder="nom@exemple.com" className="mt-1 w-full h-11 rounded-xl bg-slate-950 border border-slate-700 px-3 text-xs text-white" required /></label><div className="flex gap-2"><select value={inviteRole} onChange={(e) => setInviteRole(e.target.value as 'editor' | 'viewer')} className="flex-1 h-11 rounded-xl bg-slate-950 border border-slate-700 px-3 text-xs text-white"><option value="editor">Éditeur</option><option value="viewer">Lecture seule</option></select><button disabled={busy} className="min-h-11 px-4 rounded-xl bg-emerald-600 text-white text-xs font-semibold">Inviter</button></div></form>}

          {isOwner && selectedInvites.length > 0 && <div className="pt-2 space-y-2"><h3 className="text-[11px] font-semibold text-slate-400">Invitations en attente</h3>{selectedInvites.map((invite) => <div key={invite.id} className="flex items-center justify-between gap-2 rounded-lg bg-slate-950 p-2.5"><div className="min-w-0"><p className="text-xs text-slate-300 truncate">{invite.invitee_email}</p><p className="text-[10px] text-slate-500">{invite.role === 'editor' ? 'Éditeur' : 'Lecture seule'}</p></div><button onClick={() => void revokeInvite(invite)} className="min-h-9 px-2 text-[10px] text-rose-300">Annuler</button></div>)}</div>}
          {isOwner && <button onClick={() => void deleteWallet()} className="min-h-10 text-[11px] text-rose-300 flex items-center gap-1.5"><Trash2 className="w-3.5 h-3.5" /> Supprimer le portefeuille</button>}
        </section>}
      </>}

      <p className="text-[10px] leading-relaxed text-slate-500">Les portefeuilles partagés nécessitent une connexion Internet et un compte Kenz. Les données partagées restent distinctes de vos comptes et transactions personnels. Les rôles sont contrôlés par les règles de sécurité de la base de données.</p>
    </div>
  );
};
