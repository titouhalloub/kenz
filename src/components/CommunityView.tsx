import React, { useEffect, useMemo, useState } from 'react';
import { Bookmark, Flag, Heart, MessageCircle, Plus, ShieldAlert, Users } from 'lucide-react';
import { PRODUCT_CATALOG, productName } from '../domain/productCatalog';
import { formatMoney, parseToMinorUnits } from '../domain/financialCalculations';
import { loadMarketPrices } from '../services/priceStore';
import {
  addCommunityComment, blockCommunityUser, createCommunityPost, deleteMyPriceContributions, ensureCommunityProfile,
  loadCommunityFeed, listVerifiedOwnedBusinesses, reportCommunityPost, submitCommunityPrice, submitMerchantPrice, toggleCommunityReaction,
  toggleCommunitySave, type CommunityKind, type CommunityPost, type VerifiedOwnedBusiness,
} from '../services/communityStore';
import type { UserProfile } from '../services/authStore';

interface CommunityViewProps {
  user: UserProfile;
  availableBudgetMinor: number;
  locale: 'ar' | 'fr' | 'en';
}

const isUuid = (value: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{12}$/i.test(value);
const getWilayaCode = (value: string) => value.match(/^\s*(\d{2,3})/)?.[1] || null;
const today = () => new Date().toISOString().slice(0, 10);

export const CommunityView: React.FC<CommunityViewProps> = ({ user, availableBudgetMinor, locale }) => {
  const wilayaCode = getWilayaCode(user.wilaya);
  const userId = isUuid(user.id) ? user.id : undefined;
  const [posts, setPosts] = useState<CommunityPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [kindFilter, setKindFilter] = useState<CommunityKind | 'all'>('all');
  const [sort, setSort] = useState<'new' | 'top' | 'fits'>('new');
  const [composerOpen, setComposerOpen] = useState(false);
  const [shareWilaya, setShareWilaya] = useState(false);
  const [postKind, setPostKind] = useState<CommunityKind>('recipe');
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [steps, setSteps] = useState('');
  const [servings, setServings] = useState('2');
  const [productSlug, setProductSlug] = useState(PRODUCT_CATALOG[0].slug);
  const [quantity, setQuantity] = useState('250');
  const [recipeIngredients, setRecipeIngredients] = useState<Array<{ productSlug: string; quantityMilliUnits: number; baseUnit: 'kg' | 'l' | 'unit' }>>([]);
  const [shoppingItems, setShoppingItems] = useState<Array<{ productSlug: string; label: string; quantityMilliUnits: number; baseUnit: 'kg' | 'l' | 'unit' }>>([]);
  const [busy, setBusy] = useState(false);
  const [commentDrafts, setCommentDrafts] = useState<Record<string, string>>({});
  const [priceOpen, setPriceOpen] = useState(false);
  const [ownedBusinesses, setOwnedBusinesses] = useState<VerifiedOwnedBusiness[]>([]);
  const [merchantOpen, setMerchantOpen] = useState(false);
  const [merchantBusinessId, setMerchantBusinessId] = useState('');
  const [merchantConsent, setMerchantConsent] = useState(false);
  const [merchantStatus, setMerchantStatus] = useState('');
  const [priceSlug, setPriceSlug] = useState(PRODUCT_CATALOG[0].slug);
  const [priceAmount, setPriceAmount] = useState('');
  const [priceDate, setPriceDate] = useState(today());
  const [priceConsent, setPriceConsent] = useState(false);
  const [priceStatus, setPriceStatus] = useState('');
  const [costByPost, setCostByPost] = useState<Record<string, number | null>>({});

  const refresh = async () => {
    setLoading(true);
    const result = await loadCommunityFeed({ wilayaCode, kind: kindFilter, userId });
    if (result.success) {
      setPosts(result.data || []);
      setError('');
    } else {
      setError(result.error || 'Le fil communautaire est indisponible.');
    }
    setLoading(false);
  };

  useEffect(() => {
    if (userId) void ensureCommunityProfile({ userId, locale, wilaya: user.wilaya });
    void refresh();
  }, [user.id, user.wilaya, kindFilter, locale]);

  useEffect(() => {
    if (!userId) { setOwnedBusinesses([]); return; }
    listVerifiedOwnedBusinesses(userId).then((result) => {
      if (result.success) {
        setOwnedBusinesses(result.data || []);
        setMerchantBusinessId(result.data?.[0]?.id || '');
      }
    }).catch(() => setOwnedBusinesses([]));
  }, [userId]);

  useEffect(() => {
    let active = true;
    const slugs = [...new Set(posts.flatMap((post) => post.ingredients.map((item) => item.productSlug).filter((slug): slug is string => Boolean(slug))))];
    if (!slugs.length) {
      setCostByPost({});
      return () => { active = false; };
    }
    loadMarketPrices(slugs, wilayaCode).then((result) => {
      if (!active) return;
      const costs: Record<string, number | null> = {};
      for (const post of posts) {
        if (post.kind !== 'recipe' || !post.ingredients.length) continue;
        let total = 0;
        let complete = true;
        for (const ingredient of post.ingredients) {
          if (!ingredient.productSlug) { complete = false; break; }
          const price = result.pricesBySlug[ingredient.productSlug];
          if (!price) { complete = false; break; }
          const cost = ingredient.baseUnit === 'unit'
            ? ingredient.quantityMilliUnits * price.medianUnitPriceMinor
            : Math.round(ingredient.quantityMilliUnits * price.medianUnitPriceMinor / 1000);
          total += cost;
        }
        costs[post.id] = complete ? total : null;
      }
      setCostByPost(costs);
    }).catch(() => { if (active) setCostByPost({}); });
    return () => { active = false; };
  }, [posts, wilayaCode]);

  const visiblePosts = useMemo(() => [...posts].sort((a, b) => {
    if (sort === 'top') return b.likes - a.likes || b.createdAt.localeCompare(a.createdAt);
    if (sort === 'fits') {
      const costA = costByPost[a.id];
      const costB = costByPost[b.id];
      const fitsA = typeof costA === 'number' && costA <= Math.max(0, availableBudgetMinor);
      const fitsB = typeof costB === 'number' && costB <= Math.max(0, availableBudgetMinor);
      return Number(fitsB) - Number(fitsA) || (costA ?? Number.MAX_SAFE_INTEGER) - (costB ?? Number.MAX_SAFE_INTEGER);
    }
    return b.createdAt.localeCompare(a.createdAt);
  }), [posts, sort, costByPost, availableBudgetMinor]);

  const selectedProduct = PRODUCT_CATALOG.find((product) => product.slug === productSlug) || PRODUCT_CATALOG[0];
  const quantityLabel = selectedProduct.baseUnit === 'kg'
    ? (locale === 'ar' ? 'غرام' : locale === 'en' ? 'grams' : 'grammes')
    : selectedProduct.baseUnit === 'l'
      ? (locale === 'ar' ? 'ملليلتر' : locale === 'en' ? 'millilitres' : 'millilitres')
      : (locale === 'ar' ? 'وحدات' : locale === 'en' ? 'units' : 'unités');

  const publish = async () => {
    setError('');
    if (postKind === 'recipe' && !steps.trim()) { setError('Ajoute les étapes de la recette.'); return; }
    if (!userId) { setError('Connecte-toi avec un compte Kenz pour publier.'); return; }
    if (title.trim().length < 3) { setError('Le titre doit contenir au moins 3 caractères.'); return; }
    if ((postKind === 'recipe' && recipeIngredients.length === 0) || (postKind === 'shopping_list' && shoppingItems.length === 0)) {
      setError('Ajoute au moins un élément à la publication.'); return;
    }
    setBusy(true);
    const result = await createCommunityPost({
      kind: postKind, title: title.trim(), body: body.trim(), locale, wilayaCode: shareWilaya ? wilayaCode : null,
      ...(postKind === 'recipe' ? {
        recipe: {
          servings: Math.max(1, Math.min(50, Number(servings) || 1)),
          steps: steps.trim(),
          ingredients: recipeIngredients,
        },
      } : {}),
      ...(postKind === 'shopping_list' ? {
        shoppingItems,
      } : {}),
    });
    setBusy(false);
    if (!result.success) { setError(result.error || 'Publication impossible.'); return; }
    setTitle(''); setBody(''); setSteps(''); setRecipeIngredients([]); setShoppingItems([]); setComposerOpen(false);
    await refresh();
  };

  const addComment = async (postId: string) => {
    const bodyText = (commentDrafts[postId] || '').trim();
    if (!bodyText) return;
    const result = await addCommunityComment(postId, bodyText);
    if (!result.success) { setError(result.error || 'Commentaire impossible.'); return; }
    setCommentDrafts((current) => ({ ...current, [postId]: '' }));
    await refresh();
    setError('Commentaire publié.');
  };

  const handlePriceSubmit = async () => {
    if (!userId) { setPriceStatus('Connecte-toi pour contribuer.'); return; }
    if (!priceConsent) { setPriceStatus('Le consentement explicite est nécessaire.'); return; }
    const priceMinor = parseToMinorUnits(priceAmount);
    if (!Number.isSafeInteger(priceMinor) || priceMinor <= 0 || !wilayaCode) {
      setPriceStatus('Vérifie le prix et la wilaya de ton profil.'); return;
    }
    setBusy(true);
    const result = await submitCommunityPrice({
      productSlug: priceSlug, unitPriceMinor: priceMinor,
      observedAt: new Date(priceDate + 'T12:00:00').toISOString(),
      wilayaCode, consent: true,
    });
    setBusy(false);
    setPriceStatus(result.success
      ? 'Contribution envoyée en attente de vérification. Elle ne sera pas publiée automatiquement.'
      : result.error || 'Contribution indisponible.');
    if (result.success) { setPriceAmount(''); setPriceConsent(false); }
  };



  const handleDeletePriceContributions = async () => {
    if (!userId || !window.confirm('Retirer toutes tes contributions de prix publiques ? Cette action est définitive.')) return;
    setBusy(true);
    const result = await deleteMyPriceContributions();
    setBusy(false);
    setPriceStatus(result.success
      ? result.data + ' contribution(s) retirée(s). Les statistiques publiques sont recalculées.'
      : result.error || 'Suppression impossible.');
    setMerchantStatus(result.success ? 'Contributions retirées.' : '');
  };

  const handleMerchantSubmit = async () => {
    if (!userId || !merchantBusinessId || !wilayaCode || !merchantConsent) {
      setMerchantStatus('Vérifie le commerce, la wilaya et ton consentement.');
      return;
    }
    const priceMinor = parseToMinorUnits(priceAmount);
    if (!Number.isSafeInteger(priceMinor) || priceMinor <= 0) {
      setMerchantStatus('Saisis un prix valide en DZD.');
      return;
    }
    setBusy(true);
    const result = await submitMerchantPrice({
      businessId: merchantBusinessId, productSlug: priceSlug,
      unitPriceMinor: priceMinor, observedAt: new Date(priceDate + 'T12:00:00').toISOString(),
      wilayaCode, consent: true,
    });
    setBusy(false);
    setMerchantStatus(result.success
      ? 'Prix envoyé en attente de vérification. Aucun prix ne sera publié sans validation.'
      : result.error || 'Envoi impossible.');
    if (result.success) setMerchantConsent(false);
  };

  return (
    <div className="space-y-4 pb-20">
      <section className="rounded-2xl border border-slate-800 bg-slate-900 p-4 space-y-3">
        <div className="flex items-center gap-2">
          <Users className="h-5 w-5 text-emerald-400" />
          <div>
            <h1 className="text-base font-bold text-slate-100">Communauté Kenz</h1>
            <p className="text-[11px] text-slate-400">Recettes, listes de courses et astuces locales.</p>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <button onClick={() => setComposerOpen((value) => !value)} className="min-h-[42px] rounded-xl bg-emerald-700 text-white text-xs font-semibold flex items-center justify-center gap-2">
            <Plus className="h-4 w-4" /> Publier
          </button>
          <button onClick={() => { setPriceOpen((value) => !value); setPriceStatus(''); }} className="min-h-[42px] rounded-xl border border-slate-700 text-slate-200 text-xs font-semibold">
            Contribuer un prix
          </button>
          {ownedBusinesses.length > 0 && <button onClick={() => { setMerchantOpen((value) => !value); setMerchantStatus(''); }} className="col-span-2 min-h-[42px] rounded-xl border border-emerald-800 text-emerald-200 text-xs font-semibold">
            Prix de mon commerce vérifié
          </button>}
        </div>
        <p className="text-[10px] text-slate-500">Les publications sont publiques sous un pseudonyme. Ne partage pas d’adresse personnelle, de numéro de téléphone ou d’informations privées.</p>
      </section>

      {composerOpen && (
        <section className="rounded-2xl border border-slate-700 bg-slate-900 p-4 space-y-3">
          <h2 className="text-sm font-semibold text-slate-100">Nouvelle publication</h2>
          <select value={postKind} onChange={(event) => setPostKind(event.target.value as CommunityKind)} className="w-full h-10 rounded-lg bg-slate-950 border border-slate-700 px-3 text-xs text-slate-100">
            <option value="recipe">Recette</option><option value="shopping_list">Liste de courses</option><option value="tip">Astuce</option>
          </select>
          <input value={title} onChange={(event) => setTitle(event.target.value)} maxLength={120} placeholder="Titre" className="w-full h-10 rounded-lg bg-slate-950 border border-slate-700 px-3 text-xs text-slate-100" />
          <textarea value={body} onChange={(event) => setBody(event.target.value)} maxLength={5000} rows={3} placeholder="Description (sans lien ni coordonnées personnelles)" className="w-full rounded-lg bg-slate-950 border border-slate-700 p-3 text-xs text-slate-100" />
          {postKind === 'recipe' && (
            <>
              <label className="block text-[11px] text-slate-400">Ingrédient principal
                <select value={productSlug} onChange={(event) => setProductSlug(event.target.value)} className="mt-1 w-full h-10 rounded-lg bg-slate-950 border border-slate-700 px-3 text-xs text-slate-100">
                  {PRODUCT_CATALOG.map((product) => <option key={product.slug} value={product.slug}>{productName(product, 'fr')}</option>)}
                </select>
              </label>
              <div className="grid grid-cols-2 gap-2">
                <label className="text-[11px] text-slate-400">Quantité ({quantityLabel})
                  <input type="number" min="1" value={quantity} onChange={(event) => setQuantity(event.target.value)} className="mt-1 w-full h-10 rounded-lg bg-slate-950 border border-slate-700 px-3 text-xs text-slate-100" />
                </label>
                <label className="text-[11px] text-slate-400">Portions
                  <input type="number" min="1" max="50" value={servings} onChange={(event) => setServings(event.target.value)} className="mt-1 w-full h-10 rounded-lg bg-slate-950 border border-slate-700 px-3 text-xs text-slate-100" />
                </label>
              </div>
              <button type="button" onClick={() => {
                const amount = Number(quantity);
                if (!Number.isSafeInteger(amount) || amount <= 0) { setError('Saisis une quantité valide.'); return; }
                setRecipeIngredients((current) => [...current, { productSlug: selectedProduct.slug, quantityMilliUnits: amount, baseUnit: selectedProduct.baseUnit }]);
                setQuantity('250');
              }} className="w-full min-h-[36px] rounded-lg border border-slate-700 text-[11px] text-emerald-300">Ajouter cet ingrédient</button>
              {recipeIngredients.map((item, index) => {
                const product = PRODUCT_CATALOG.find((row) => row.slug === item.productSlug);
                return <div key={index} className="flex items-center justify-between rounded-lg bg-slate-950 px-3 py-2 text-[11px] text-slate-300">
                  <span>{product ? productName(product, 'fr') : item.productSlug} · {item.quantityMilliUnits} {item.baseUnit}</span>
                  <button type="button" onClick={() => setRecipeIngredients((current) => current.filter((_, i) => i !== index))} className="text-rose-300">Retirer</button>
                </div>;
              })}
              <textarea value={steps} onChange={(event) => setSteps(event.target.value)} maxLength={5000} rows={3} placeholder="Étapes de préparation" className="w-full rounded-lg bg-slate-950 border border-slate-700 p-3 text-xs text-slate-100" />
            </>
          )}
          {postKind === 'shopping_list' && (
            <div className="space-y-2">
            <label className="block text-[11px] text-slate-400">Produit et quantité ({quantityLabel})
              <select value={productSlug} onChange={(event) => setProductSlug(event.target.value)} className="mt-1 w-full h-10 rounded-lg bg-slate-950 border border-slate-700 px-3 text-xs text-slate-100">
                {PRODUCT_CATALOG.map((product) => <option key={product.slug} value={product.slug}>{productName(product, 'fr')}</option>)}
              </select>
              <input type="number" min="1" value={quantity} onChange={(event) => setQuantity(event.target.value)} className="mt-1 w-full h-10 rounded-lg bg-slate-950 border border-slate-700 px-3 text-xs text-slate-100" />
            </label>
            <button type="button" onClick={() => {
              const amount = Number(quantity);
              if (!Number.isSafeInteger(amount) || amount <= 0) { setError('Saisis une quantité valide.'); return; }
              setShoppingItems((current) => [...current, {
                productSlug: selectedProduct.slug, label: productName(selectedProduct, 'fr'),
                quantityMilliUnits: amount, baseUnit: selectedProduct.baseUnit,
              }]);
              setQuantity('250');
            }} className="w-full min-h-[36px] rounded-lg border border-slate-700 text-[11px] text-emerald-300">Ajouter à la liste</button>
            {shoppingItems.map((item, index) => <div key={index} className="flex items-center justify-between rounded-lg bg-slate-950 px-3 py-2 text-[11px] text-slate-300">
              <span>{item.label} · {item.quantityMilliUnits} {item.baseUnit}</span>
              <button type="button" onClick={() => setShoppingItems((current) => current.filter((_, i) => i !== index))} className="text-rose-300">Retirer</button>
            </div>)}
            </div>
          )}
          <label className="flex items-start gap-2 text-[11px] text-slate-400">
            <input type="checkbox" checked={shareWilaya} onChange={(event) => setShareWilaya(event.target.checked)} />
            {locale === 'ar' ? 'إظهار ولايتي في المنشور' : locale === 'en' ? 'Include my wilaya in this public post' : 'Inclure ma wilaya dans cette publication publique'}
          </label>
          <div className="flex gap-2">
            <button onClick={publish} disabled={busy} className="flex-1 min-h-[42px] rounded-lg bg-emerald-700 text-white text-xs font-semibold disabled:opacity-50">{busy ? 'Publication…' : 'Publier'}</button>
            <button onClick={() => setComposerOpen(false)} className="min-h-[42px] rounded-lg border border-slate-700 px-4 text-xs text-slate-300">Annuler</button>
          </div>
        </section>
      )}

      {priceOpen && (
        <section className="rounded-2xl border border-slate-700 bg-slate-900 p-4 space-y-3">
          <h2 className="text-sm font-semibold text-slate-100">Partager un prix payé</h2>
          <select value={priceSlug} onChange={(event) => setPriceSlug(event.target.value)} className="w-full h-10 rounded-lg bg-slate-950 border border-slate-700 px-3 text-xs text-slate-100">
            {PRODUCT_CATALOG.map((product) => <option key={product.slug} value={product.slug}>{productName(product, 'fr')} · {product.baseUnit}</option>)}
          </select>
          <input inputMode="decimal" value={priceAmount} onChange={(event) => setPriceAmount(event.target.value)} placeholder="Prix en DA par unité de base" className="w-full h-10 rounded-lg bg-slate-950 border border-slate-700 px-3 text-xs text-slate-100" />
          <input type="date" value={priceDate} min={new Date(Date.now() - 14 * 86400000).toISOString().slice(0, 10)} max={today()} onChange={(event) => setPriceDate(event.target.value)} className="w-full h-10 rounded-lg bg-slate-950 border border-slate-700 px-3 text-xs text-slate-100" />
          <label className="flex items-start gap-2 text-[11px] text-slate-400">
            <input type="checkbox" checked={priceConsent} onChange={(event) => setPriceConsent(event.target.checked)} />
            J’accepte que ce prix et ma wilaya soient partagés publiquement sous forme agrégée après vérification. Mon identifiant reste privé.
          </label>
          <button onClick={handlePriceSubmit} disabled={busy || !priceConsent} className="w-full min-h-[42px] rounded-lg bg-slate-800 text-slate-100 text-xs disabled:opacity-50">Envoyer la contribution</button>
          {priceStatus && <p className="text-[11px] text-amber-300">{priceStatus}</p>}
          {userId && <button onClick={() => void handleDeletePriceContributions()} disabled={busy} className="w-full min-h-[38px] rounded-lg border border-rose-900/60 text-[11px] text-rose-300 disabled:opacity-50">Retirer toutes mes contributions de prix</button>}
        </section>
      )}

      {merchantOpen && ownedBusinesses.length > 0 && (
        <section className="rounded-2xl border border-emerald-800/60 bg-slate-900 p-4 space-y-3">
          <h2 className="text-sm font-semibold text-slate-100">Prix de mon commerce vérifié</h2>
          <select value={merchantBusinessId} onChange={(event) => setMerchantBusinessId(event.target.value)} className="w-full h-10 rounded-lg bg-slate-950 border border-slate-700 px-3 text-xs text-slate-100">
            {ownedBusinesses.map((business) => <option key={business.id} value={business.id}>{business.name}</option>)}
          </select>
          <select value={priceSlug} onChange={(event) => setPriceSlug(event.target.value)} className="w-full h-10 rounded-lg bg-slate-950 border border-slate-700 px-3 text-xs text-slate-100">
            {PRODUCT_CATALOG.map((product) => <option key={product.slug} value={product.slug}>{productName(product, 'fr')} · {product.baseUnit}</option>)}
          </select>
          <input inputMode="decimal" value={priceAmount} onChange={(event) => setPriceAmount(event.target.value)} placeholder="Prix DZD par unité de base" className="w-full h-10 rounded-lg bg-slate-950 border border-slate-700 px-3 text-xs text-slate-100" />
          <input type="date" value={priceDate} min={new Date(Date.now() - 14 * 86400000).toISOString().slice(0, 10)} max={today()} onChange={(event) => setPriceDate(event.target.value)} className="w-full h-10 rounded-lg bg-slate-950 border border-slate-700 px-3 text-xs text-slate-100" />
          <label className="flex items-start gap-2 text-[11px] text-slate-400">
            <input type="checkbox" checked={merchantConsent} onChange={(event) => setMerchantConsent(event.target.checked)} />
            Je confirme être autorisé à publier ce prix pour ce commerce et j’accepte son partage public sous forme agrégée après vérification.
          </label>
          <button onClick={handleMerchantSubmit} disabled={busy || !merchantConsent} className="w-full min-h-[42px] rounded-lg bg-emerald-800 text-white text-xs disabled:opacity-50">Envoyer le prix du commerce</button>
          {merchantStatus && <p className="text-[11px] text-amber-300">{merchantStatus}</p>}
        </section>
      )}

      <div className="flex gap-2 overflow-x-auto">
        <select value={kindFilter} onChange={(event) => setKindFilter(event.target.value as CommunityKind | 'all')} className="min-w-0 flex-1 h-10 rounded-lg bg-slate-900 border border-slate-800 px-2 text-xs text-slate-200">
          <option value="all">Tout</option><option value="recipe">Recettes</option><option value="shopping_list">Listes</option><option value="tip">Astuces</option>
        </select>
        <select value={sort} onChange={(event) => setSort(event.target.value as typeof sort)} className="h-10 rounded-lg bg-slate-900 border border-slate-800 px-2 text-xs text-slate-200">
          <option value="new">Récent</option><option value="top">Populaire</option><option value="fits">Adapté à mon budget</option>
        </select>
      </div>

      {error && <p className="rounded-xl border border-amber-800/60 bg-amber-950/30 p-3 text-xs text-amber-200">{error}</p>}
      {loading ? <p className="p-6 text-center text-xs text-slate-400">Chargement du fil…</p> :
        visiblePosts.length === 0 ? <p className="rounded-xl border border-slate-800 bg-slate-900 p-6 text-center text-xs text-slate-400">Aucune publication pour le moment.</p> :
        visiblePosts.map((post) => {
          const totalCost = costByPost[post.id];
          const perServing = typeof totalCost === 'number' ? Math.ceil(totalCost / Math.max(1, post.servings || 1)) : null;
          return (
            <article key={post.id} className="rounded-2xl border border-slate-800 bg-slate-900 p-4 space-y-3">
              <div className="flex items-start justify-between gap-2">
                <div><div className="text-[10px] text-emerald-300">{post.authorHandle} · {post.wilayaCode || 'Algérie'}</div>
                  <h3 className="mt-1 text-sm font-bold text-slate-100">{post.title}</h3></div>
                <span className="rounded-full bg-slate-800 px-2 py-1 text-[9px] text-slate-300">{post.kind === 'recipe' ? 'Recette' : post.kind === 'shopping_list' ? 'Courses' : 'Astuce'}</span>
              </div>
              {post.body && <p className="whitespace-pre-wrap text-xs leading-relaxed text-slate-300">{post.body}</p>}
              {post.kind === 'recipe' && <div className="rounded-xl bg-slate-950 p-3 space-y-2">
                <p className="text-[11px] text-slate-400">{post.servings} portions · {post.steps}</p>
                {post.ingredients.map((ingredient, index) => <p key={index} className="text-[11px] text-slate-300">{ingredient.productSlug || ingredient.freeText} · {ingredient.quantityMilliUnits} {ingredient.baseUnit}</p>)}
                {typeof totalCost === 'number' ? <p className="text-xs font-semibold text-emerald-300">Coût estimé : {formatMoney(totalCost, 'DZD', locale)} · {perServing ? formatMoney(perServing, 'DZD', locale) + ' / portion' : ''}</p> : <p className="text-[10px] text-slate-500">Prix public insuffisant pour chiffrer cette recette.</p>}
              </div>}
              {post.kind === 'shopping_list' && <div className="space-y-1">{post.ingredients.map((item, index) => <p key={index} className="text-xs text-slate-300">• {item.freeText || item.productSlug} — {item.quantityMilliUnits} {item.baseUnit}</p>)}</div>}
              <div className="flex items-center gap-3 text-[11px] text-slate-400">
                <button disabled={!userId} onClick={async () => {
                  const result = await toggleCommunityReaction(post.id, userId!, post.likedByMe);
                  if (result.success) setPosts((current) => current.map((item) => item.id === post.id ? { ...item, likedByMe: result.data!, likes: item.likes + (result.data ? 1 : -1) } : item));
                  else setError(result.error || 'Action impossible.');
                }} className="flex items-center gap-1 disabled:opacity-40"><Heart className={post.likedByMe ? 'h-4 w-4 fill-rose-400 text-rose-400' : 'h-4 w-4'} /> {post.likes}</button>
                <button disabled={!userId} onClick={async () => {
                  const result = await toggleCommunitySave(post.id, userId!, post.savedByMe);
                  if (result.success) setPosts((current) => current.map((item) => item.id === post.id ? { ...item, savedByMe: result.data! } : item));
                  else setError(result.error || 'Action impossible.');
                }} className="flex items-center gap-1 disabled:opacity-40"><Bookmark className={post.savedByMe ? 'h-4 w-4 fill-emerald-400 text-emerald-400' : 'h-4 w-4'} /> Enregistrer</button>
                <button disabled={!userId} onClick={async () => {
                  const result = await reportCommunityPost({ postId: post.id, reporterId: userId!, reason: 'other', details: 'Signalement depuis le fil communautaire.' });
                  setError(result.success ? 'Signalement transmis aux modérateurs.' : result.error || 'Signalement impossible.');
                }} className="flex items-center gap-1 disabled:opacity-40"><Flag className="h-4 w-4" /> Signaler</button>
                {userId && post.authorId !== userId && <button onClick={async () => {
                  const result = await blockCommunityUser(userId, post.authorId);
                  if (result.success) { setPosts((current) => current.filter((item) => item.authorId !== post.authorId)); setError('Utilisateur bloqué.'); }
                  else setError(result.error || 'Blocage impossible.');
                }} className="flex items-center gap-1"><ShieldAlert className="h-4 w-4" /> Bloquer</button>}
              </div>
              {post.comments.length > 0 && <div className="space-y-2 border-t border-slate-800 pt-2">
                {post.comments.map((comment) => <div key={comment.id} className="rounded-lg bg-slate-950 px-3 py-2">
                  <p className="text-[10px] text-emerald-300">{comment.authorHandle}</p>
                  <p className="text-[11px] text-slate-300 whitespace-pre-wrap">{comment.body}</p>
                </div>)}
              </div>}
              <div className="flex gap-2">
                <input value={commentDrafts[post.id] || ''} onChange={(event) => setCommentDrafts((current) => ({ ...current, [post.id]: event.target.value }))} maxLength={2000} placeholder="Ajouter un commentaire…" className="min-w-0 flex-1 h-9 rounded-lg bg-slate-950 border border-slate-800 px-3 text-[11px] text-slate-100" />
                <button disabled={!userId || !commentDrafts[post.id]?.trim()} onClick={() => void addComment(post.id)} className="rounded-lg border border-slate-700 px-3 text-[11px] text-slate-200 disabled:opacity-40"><MessageCircle className="h-4 w-4" /></button>
              </div>
            </article>
          );
        })}
    </div>
  );
};
