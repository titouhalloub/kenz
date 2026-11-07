import React, { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Calculator, Plus, Trash2 } from 'lucide-react';
import { PRODUCT_CATALOG, productName } from '../domain/productCatalog';
import { simulateMonthlyBudget, type SimulatorBasketItem, type SimulatorResult } from '../domain/simulator';
import { formatMoney, parseToMinorUnits } from '../domain/financialCalculations';
import { loadMarketPrices } from '../services/priceStore';
import { deleteSimulatorScenario, listSimulatorScenarios, saveSimulatorScenario, type SimulatorScenario } from '../services/simulatorScenarioStore';
import type { SimulatorPrice } from '../domain/simulator';
import type { UserProfile } from '../domain/types';
import { ALGERIA_WILAYAS } from '../domain/wilayas';

interface SimulatorViewProps {
  profile: UserProfile;
  availableBudgetMinor: number;
}

const categoryLabels: Record<string, { fr: string; ar: string; en: string }> = {
  cereals_bread: { fr: 'Céréales & pain', ar: 'حبوب وخبز', en: 'Cereals & bread' },
  oils_fats: { fr: 'Huiles & matières grasses', ar: 'زيوت ودهون', en: 'Oils & fats' },
  sugar_sweeteners: { fr: 'Sucre & édulcorants', ar: 'سكر ومحليات', en: 'Sugar & sweeteners' },
  dairy_eggs: { fr: 'Produits laitiers & œufs', ar: 'ألبان وبيض', en: 'Dairy & eggs' },
  vegetables: { fr: 'Légumes', ar: 'خضروات', en: 'Vegetables' },
  fruits: { fr: 'Fruits', ar: 'فواكه', en: 'Fruits' },
  meat_fish: { fr: 'Viande & poisson', ar: 'لحوم وأسماك', en: 'Meat & fish' },
  legumes: { fr: 'Légumineuses', ar: 'بقوليات', en: 'Legumes' },
  spices_condiments: { fr: 'Épices & condiments', ar: 'توابل ومنكهات', en: 'Spices & condiments' },
  beverages: { fr: 'Boissons', ar: 'مشروبات', en: 'Beverages' },
  household: { fr: 'Entretien', ar: 'مواد التنظيف', en: 'Household' },
  fuel_energy: { fr: 'Carburant & énergie', ar: 'وقود وطاقة', en: 'Fuel & energy' },
};

function getMonth(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

export const SimulatorView: React.FC<SimulatorViewProps> = ({ profile, availableBudgetMinor }) => {
  const [month, setMonth] = useState(getMonth);
  const [adults, setAdults] = useState(2);
  const [children, setChildren] = useState(0);
  const [wilayaCode, setWilayaCode] = useState('');
  const [selectedSlug, setSelectedSlug] = useState(PRODUCT_CATALOG[0].slug);
  const [quantity, setQuantity] = useState('100');
  const [lowPrice, setLowPrice] = useState('');
  const [expectedPrice, setExpectedPrice] = useState('');
  const [highPrice, setHighPrice] = useState('');
  const [basket, setBasket] = useState<SimulatorBasketItem[]>([]);
  const [marketPrice, setMarketPrice] = useState<SimulatorPrice | null>(null);
  const [marketStatus, setMarketStatus] = useState('');
  const [error, setError] = useState('');
  const [scenarioTitle, setScenarioTitle] = useState('Mon scénario');
  const [scenarioId, setScenarioId] = useState('');
  const [scenarios, setScenarios] = useState<SimulatorScenario[]>([]);
  const [scenarioStatus, setScenarioStatus] = useState('');
  const [scenarioBusy, setScenarioBusy] = useState(false);

  const selectedProduct = PRODUCT_CATALOG.find((product) => product.slug === selectedSlug) || PRODUCT_CATALOG[0];
  const quantityUnit = selectedProduct.baseUnit === 'kg'
    ? (profile.locale === 'ar' ? 'غ/يوم' : profile.locale === 'en' ? 'g/day' : 'g/jour')
    : selectedProduct.baseUnit === 'l'
      ? (profile.locale === 'ar' ? 'مل/يوم' : profile.locale === 'en' ? 'ml/day' : 'ml/jour')
      : (profile.locale === 'ar' ? 'وحدة/يوم' : profile.locale === 'en' ? 'unit/day' : 'unité/jour');


  useEffect(() => {
    let active = true;
    listSimulatorScenarios(profile.id).then((result) => {
      if (!active) return;
      if (result.success) {
        setScenarios(result.data);
        setScenarioId(result.data[0]?.id || '');
      } else {
        setScenarioStatus(result.message || 'Synchronisation des scénarios indisponible.');
      }
    }).catch(() => {
      if (active) setScenarioStatus('Synchronisation des scénarios indisponible.');
    });
    return () => { active = false; };
  }, [profile.id]);

  const handleSaveScenario = async () => {
    if (!scenarioTitle.trim()) return;
    setScenarioBusy(true);
    setScenarioStatus('');
    try {
      const result = await saveSimulatorScenario({
        userId: profile.id,
        title: scenarioTitle,
        month,
        adults,
        children,
        basket: basket.map((item) => ({
          productId: item.productId,
          quantityPerPersonPerDayMilliUnits: item.quantityPerPersonPerDayMilliUnits,
        })),
      });
      if (!result.success) {
        setScenarioStatus(result.message || 'Impossible d’enregistrer ce scénario.');
      } else {
        setScenarios((current) => [result.data, ...current.filter((row) => row.id !== result.data.id)].slice(0, 20));
        setScenarioId(result.data.id);
        setScenarioStatus('Scénario enregistré. Le budget et les comptes Kenz ne sont pas synchronisés.');
      }
    } catch {
      setScenarioStatus('Impossible d’enregistrer ce scénario pour le moment.');
    } finally {
      setScenarioBusy(false);
    }
  };

  const handleLoadScenario = async () => {
    const scenario = scenarios.find((row) => row.id === scenarioId);
    if (!scenario) return;
    setScenarioBusy(true);
    setScenarioStatus('');
    try {
      const overrides = Array.isArray(scenario.basket_overrides) ? scenario.basket_overrides : [];
      const valid = overrides.filter((item) =>
        item && typeof item.productId === 'string' &&
        Number.isSafeInteger(item.quantityPerPersonPerDayMilliUnits) &&
        item.quantityPerPersonPerDayMilliUnits > 0 &&
        PRODUCT_CATALOG.some((product) => product.slug === item.productId),
      );
      const prices = await loadMarketPrices(valid.map((item) => item.productId), wilayaCode || null);
      const restored: SimulatorBasketItem[] = valid.flatMap((item) => {
        const product = PRODUCT_CATALOG.find((row) => row.slug === item.productId);
        if (!product) return [];
        return [{
          productId: product.slug,
          name: productName(product, profile.locale),
          category: product.category,
          baseUnit: product.baseUnit,
          quantityPerPersonPerDayMilliUnits: item.quantityPerPersonPerDayMilliUnits,
          ...(prices.pricesBySlug[product.slug] ? { price: prices.pricesBySlug[product.slug] } : {}),
        }];
      });
      setMonth(scenario.month.slice(0, 7));
      setAdults(scenario.adults);
      setChildren(scenario.children);
      setBasket(restored);
      setScenarioTitle(scenario.title);
      setScenarioStatus('Scénario chargé. Les prix publics sont actualisés ; les prix saisis manuellement doivent être ressaisis.');
    } catch {
      setScenarioStatus('Impossible de charger les prix actuels de ce scénario.');
    } finally {
      setScenarioBusy(false);
    }
  };

  const handleDeleteScenario = async () => {
    if (!scenarioId) return;
    setScenarioBusy(true);
    try {
      const result = await deleteSimulatorScenario(profile.id, scenarioId);
      if (!result.success) {
        setScenarioStatus(result.message || 'Impossible de supprimer ce scénario.');
      } else {
        setScenarios((current) => current.filter((row) => row.id !== scenarioId));
        setScenarioId('');
        setScenarioStatus('Scénario supprimé.');
      }
    } catch {
      setScenarioStatus('Impossible de supprimer ce scénario.');
    } finally {
      setScenarioBusy(false);
    }
  };

  useEffect(() => {
    let active = true;
    setMarketPrice(null);
    setLowPrice('');
    setExpectedPrice('');
    setHighPrice('');
    setMarketStatus('Recherche du prix public disponible…');
    loadMarketPrices([selectedSlug], wilayaCode || null).then((result) => {
      if (!active) return;
      const found = result.pricesBySlug[selectedSlug];
      if (found) {
        setMarketPrice(found);
        setLowPrice((found.p25UnitPriceMinor / 100).toFixed(2));
        setExpectedPrice((found.medianUnitPriceMinor / 100).toFixed(2));
        setHighPrice((found.p75UnitPriceMinor / 100).toFixed(2));
        const fetchedLabel = result.fetchedAt
          ? new Date(result.fetchedAt).toLocaleString(profile.locale)
          : '';
        setMarketStatus(result.source === 'cache'
          ? `Prix public en cache hors ligne · copie récupérée le ${fetchedLabel}. La date réelle du relevé reste affichée dans le panier.`
          : `Prix public actualisé · source et fraîcheur affichées après ajout. ${fetchedLabel}`);
      } else {
        setMarketStatus(result.unavailableReason === 'schema_not_deployed'
          ? 'Le catalogue de prix n’est pas encore déployé ; tu peux saisir tes propres prix.'
          : 'Aucun relevé public disponible pour ce produit ; tu peux saisir tes propres prix.');
      }
    }).catch(() => {
      if (active) setMarketStatus('Prix publics indisponibles pour le moment ; la saisie manuelle reste possible.');
    });
    return () => { active = false; };
  }, [selectedSlug, wilayaCode, profile.locale]);

  const addProduct = () => {
    setError('');
    const amount = Number(quantity);
    const low = parseToMinorUnits(lowPrice);
    const expected = parseToMinorUnits(expectedPrice);
    const high = parseToMinorUnits(highPrice);
    if (!Number.isSafeInteger(amount) || amount <= 0) {
      setError('Saisis une quantité quotidienne entière supérieure à zéro.');
      return;
    }
    if (!marketPrice && ([low, expected, high].some((value) => value <= 0) || low > expected || expected > high)) {
      setError('Saisis trois prix valides : minimum ≤ habituel ≤ maximum.');
      return;
    }
    if (basket.some((item) => item.productId === selectedProduct.slug)) {
      setError('Ce produit est déjà dans le panier.');
      return;
    }

    const priceDate = new Date().toISOString();
    setBasket((current) => [...current, {
      productId: selectedProduct.slug,
      name: productName(selectedProduct, profile.locale),
      category: selectedProduct.category,
      baseUnit: selectedProduct.baseUnit,
      quantityPerPersonPerDayMilliUnits: amount,
      price: marketPrice || {
        currency: 'DZD',
        p25UnitPriceMinor: low,
        medianUnitPriceMinor: expected,
        p75UnitPriceMinor: high,
        nObservations: 0,
        nContributors: 0,
        lastObserved: priceDate,
        areaLevel: 'national',
      },
    }]);
    setLowPrice('');
    setExpectedPrice('');
    setHighPrice('');
    setQuantity(selectedProduct.baseUnit === 'unit' ? '1' : '100');
  };

  const result: SimulatorResult | null = useMemo(() => {
    if (basket.length === 0 || profile.preferredCurrency !== 'DZD') return null;
    try {
      return simulateMonthlyBudget({
        month,
        household: { adults, children },
        availableBudgetMinor,
        items: basket,
      });
    } catch {
      return null;
    }
  }, [month, adults, children, availableBudgetMinor, basket, profile.preferredCurrency]);

  if (profile.preferredCurrency !== 'DZD') {
    return (
      <div className="rounded-2xl border border-amber-500/30 bg-amber-500/5 p-4 text-sm text-amber-200">
        Le simulateur utilise actuellement le DZD. Change la devise de planification en DZD pour utiliser les prix algériens.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-slate-800 bg-slate-900 p-4 space-y-3">
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-xs font-semibold text-slate-200">Mes scénarios</h3>
          <span className="text-[10px] text-slate-500">Synchronisation privée</span>
        </div>
        <input value={scenarioTitle} onChange={(event) => setScenarioTitle(event.target.value)} maxLength={80}
          placeholder="Nom du scénario"
          className="w-full h-10 rounded-lg bg-slate-950 border border-slate-700 px-3 text-xs text-slate-100" />
        <button type="button" onClick={handleSaveScenario} disabled={scenarioBusy || !scenarioTitle.trim()}
          className="w-full min-h-[40px] rounded-lg bg-slate-800 hover:bg-slate-700 disabled:opacity-50 text-xs font-semibold text-slate-100">
          {scenarioBusy ? 'Patiente…' : 'Enregistrer le scénario'}
        </button>
        <div className="grid grid-cols-[1fr_auto_auto] gap-2">
          <select value={scenarioId} onChange={(event) => setScenarioId(event.target.value)}
            className="min-w-0 h-10 rounded-lg bg-slate-950 border border-slate-700 px-2 text-xs text-slate-100">
            <option value="">Choisir un scénario</option>
            {scenarios.map((scenario) => <option key={scenario.id} value={scenario.id}>{scenario.title} · {scenario.month.slice(0, 7)}</option>)}
          </select>
          <button type="button" onClick={handleLoadScenario} disabled={scenarioBusy || !scenarioId}
            className="rounded-lg border border-slate-700 px-3 text-xs text-slate-200 disabled:opacity-40">Charger</button>
          <button type="button" onClick={handleDeleteScenario} disabled={scenarioBusy || !scenarioId}
            className="rounded-lg border border-rose-900/60 px-3 text-xs text-rose-300 disabled:opacity-40">Supprimer</button>
        </div>
        <p className="text-[10px] leading-relaxed text-slate-500">
          Seuls le mois, la composition du foyer et les quantités du panier sont synchronisés. Budget, revenus, soldes et transactions restent locaux. Les prix publics sont rechargés lors du chargement.
        </p>
        {scenarioStatus && <p className="text-[10px] text-emerald-300">{scenarioStatus}</p>}
      </div>
      <div className="rounded-2xl border border-slate-800 bg-slate-900 p-4 space-y-3">
        <div className="flex items-center gap-2">
          <Calculator className="h-4 w-4 text-emerald-400" />
          <h2 className="text-sm font-semibold text-slate-100">Simulateur mensuel des courses</h2>
        </div>
        <p className="text-[11px] leading-relaxed text-slate-400">
          Le calcul est fait sur cet appareil avec ton budget Kenz. Aucun revenu, solde ou budget n'est envoyé au serveur.
        </p>
        <label className="block text-[11px] text-slate-400">
          Wilaya (optionnelle)
          <select value={wilayaCode} onChange={(event) => setWilayaCode(event.target.value)} className="mt-1 w-full h-10 rounded-lg bg-slate-950 border border-slate-700 px-2 text-xs text-slate-100">
            <option value="">Toutes les wilayas · prix national si disponible</option>
            {ALGERIA_WILAYAS.map((wilaya) => <option key={wilaya.slice(0, 2)} value={wilaya.slice(0, 2)}>{wilaya}</option>)}
          </select>
        </label>
        <div className="grid grid-cols-3 gap-2">
          <label className="text-[11px] text-slate-400">
            Mois
            <input type="month" value={month} onChange={(event) => setMonth(event.target.value)}
              className="mt-1 w-full h-10 rounded-lg bg-slate-950 border border-slate-700 px-2 text-xs text-slate-100" />
          </label>
          <label className="text-[11px] text-slate-400">
            Adultes
            <input type="number" min="1" max="30" value={adults} onChange={(event) => setAdults(Math.max(1, Math.min(30, Number(event.target.value) || 1)))}
              className="mt-1 w-full h-10 rounded-lg bg-slate-950 border border-slate-700 px-2 text-xs text-slate-100" />
          </label>
          <label className="text-[11px] text-slate-400">
            Enfants
            <input type="number" min="0" max="30" value={children} onChange={(event) => setChildren(Math.max(0, Math.min(30, Number(event.target.value) || 0)))}
              className="mt-1 w-full h-10 rounded-lg bg-slate-950 border border-slate-700 px-2 text-xs text-slate-100" />
          </label>
        </div>
        <div className="rounded-xl bg-slate-950 border border-slate-800 p-3">
          <div className="text-[10px] uppercase tracking-wide text-slate-500">Budget disponible utilisé par le calcul</div>
          <div className="mt-1 text-lg font-bold font-mono-numbers text-slate-100">{formatMoney(availableBudgetMinor, 'DZD', profile.locale)}</div>
          <div className="text-[10px] text-slate-500">Enveloppe alimentation restante, sinon reste à vivre Kenz.</div>
        </div>
      </div>

      <div className="rounded-2xl border border-slate-800 bg-slate-900 p-4 space-y-3">
        <div>
          <h3 className="text-xs font-semibold text-slate-200">Ajouter un produit au panier</h3>
          <p className="text-[10px] text-slate-500 mt-1">Les prix sont saisis par toi pour l'instant ; aucun prix de marché n'est présenté comme vérifié.</p>
        </div>
        <label className="block text-[11px] text-slate-400">
          Produit
          <select value={selectedSlug} onChange={(event) => {
            const product = PRODUCT_CATALOG.find((item) => item.slug === event.target.value);
            setSelectedSlug(event.target.value);
            setQuantity(product?.baseUnit === 'unit' ? '1' : '100');
          }} className="mt-1 w-full h-11 rounded-xl bg-slate-950 border border-slate-700 px-3 text-xs text-slate-100">
            {PRODUCT_CATALOG.map((product) => <option key={product.slug} value={product.slug}>{productName(product, profile.locale)}</option>)}
          </select>
        </label>
        <label className="block text-[11px] text-slate-400">
          Quantité par personne et par jour ({quantityUnit})
          <input type="number" min="1" step="1" value={quantity} onChange={(event) => setQuantity(event.target.value)}
            className="mt-1 w-full h-10 rounded-lg bg-slate-950 border border-slate-700 px-3 text-xs text-slate-100" />
        </label>
        <div className="grid grid-cols-3 gap-2">
          <label className="text-[10px] text-slate-400">Prix bas (DA)
            <input inputMode="decimal" value={lowPrice} onChange={(event) => { setMarketPrice(null); setLowPrice(event.target.value); }} placeholder="Ex. 180"
              className="mt-1 w-full h-10 rounded-lg bg-slate-950 border border-slate-700 px-2 text-xs text-slate-100" />
          </label>
          <label className="text-[10px] text-slate-400">Prix habituel
            <input inputMode="decimal" value={expectedPrice} onChange={(event) => { setMarketPrice(null); setExpectedPrice(event.target.value); }} placeholder="Ex. 200"
              className="mt-1 w-full h-10 rounded-lg bg-slate-950 border border-slate-700 px-2 text-xs text-slate-100" />
          </label>
          <label className="text-[10px] text-slate-400">Prix haut
            <input inputMode="decimal" value={highPrice} onChange={(event) => { setMarketPrice(null); setHighPrice(event.target.value); }} placeholder="Ex. 230"
              className="mt-1 w-full h-10 rounded-lg bg-slate-950 border border-slate-700 px-2 text-xs text-slate-100" />
          </label>
        </div>
        <p className="text-[10px] text-slate-500">Prix par kg, litre ou unité selon le produit.</p>
        {marketStatus && <p className="text-[10px] text-slate-500">{marketStatus}</p>}
        {error && <p role="alert" className="text-xs text-rose-400">{error}</p>}
        <button type="button" onClick={addProduct} className="w-full min-h-[44px] rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold flex items-center justify-center gap-2">
          <Plus className="h-4 w-4" /> Ajouter au panier
        </button>
      </div>

      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-300">Mon panier ({basket.length})</h3>
          {basket.length > 0 && <button onClick={() => setBasket([])} className="text-[11px] text-slate-500 hover:text-rose-400">Vider</button>}
        </div>
        {basket.map((item) => (
          <div key={item.productId} className="rounded-xl border border-slate-800 bg-slate-900 p-3 flex items-center gap-3">
            <div className="min-w-0 flex-1">
              <div className="text-xs font-semibold text-slate-100 truncate">{item.name}</div>
              <div className="text-[10px] text-slate-500">{categoryLabels[item.category]?.[profile.locale] || item.category} · {item.quantityPerPersonPerDayMilliUnits} {item.baseUnit === 'kg' ? (profile.locale === 'ar' ? 'غ' : 'g') : item.baseUnit === 'l' ? (profile.locale === 'ar' ? 'مل' : 'ml') : (profile.locale === 'ar' ? 'وحدة' : 'unit')} / {profile.locale === 'ar' ? 'شخص / يوم' : profile.locale === 'en' ? 'person / day' : 'personne / jour'}</div>
              <div className="text-[10px] text-amber-300">{item.price?.nObservations ? `Prix de marché · ${item.price.nObservations} relevés · ${item.price.areaLevel} · ${(item.price.sourceTiers || []).join(', ') || 'source non précisée'} · ${item.price.lastObserved}` : 'Prix saisi manuellement · non vérifié'}</div>
            </div>
            <div className="text-right shrink-0">
              <div className="text-xs font-semibold text-slate-200">{formatMoney(item.price?.medianUnitPriceMinor || 0, 'DZD', profile.locale)} / {item.baseUnit}</div>
              <button onClick={() => setBasket((current) => current.filter((row) => row.productId !== item.productId))}
                className="mt-1 inline-flex items-center gap-1 text-[10px] text-slate-500 hover:text-rose-400"><Trash2 className="h-3 w-3" /> Retirer</button>
            </div>
          </div>
        ))}
        {basket.length === 0 && (
          <div className="rounded-xl border border-dashed border-slate-700 p-5 text-center text-xs text-slate-500">
            Ajoute des produits et leurs prix pour lancer une projection mensuelle.
          </div>
        )}
      </div>

      {result && (
        <div className="space-y-3">
          <div className="rounded-2xl border border-slate-700 bg-slate-900 p-4 space-y-3">
            <div className="text-xs text-slate-400">Projection · {result.daysInMonth} jours</div>
            <div className="grid grid-cols-3 gap-2">
              <div><div className="text-[10px] text-slate-500">Bas</div><div className="text-sm font-bold text-slate-200">{formatMoney(result.pricedSubtotal.lowMinor, 'DZD', profile.locale)}</div></div>
              <div><div className="text-[10px] text-slate-500">Habituel</div><div className="text-sm font-bold text-emerald-300">{formatMoney(result.pricedSubtotal.expectedMinor, 'DZD', profile.locale)}</div></div>
              <div><div className="text-[10px] text-slate-500">Haut</div><div className="text-sm font-bold text-amber-300">{formatMoney(result.pricedSubtotal.highMinor, 'DZD', profile.locale)}</div></div>
            </div>
            <div className="border-t border-slate-800 pt-3 flex justify-between gap-3 text-xs">
              <span className="text-slate-400">Écart avec le budget disponible</span>
              <span className={result.projectedSurplusMinor !== null && result.projectedSurplusMinor < 0 ? 'text-rose-400 font-bold' : 'text-emerald-300 font-bold'}>
                {result.projectedSurplusMinor === null ? 'Incomplet' : formatMoney(result.projectedSurplusMinor, 'DZD', profile.locale)}
              </span>
            </div>
            <div className="text-[10px] text-slate-500">{result.daysCovered === null ? 'Jours couverts : non calculés' : `Environ ${result.daysCovered} jours couverts au rythme estimé`}</div>
          </div>

          {result.dataQuality.thinProducts > 0 && (
            <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-3 flex gap-2 text-[11px] text-amber-200">
              <AlertTriangle className="h-4 w-4 shrink-0" />
              Certaines lignes ont moins de trois relevés ou utilisent des prix saisis manuellement. La projection reste indicative.
            </div>
          )}
          {result.dataQuality.staleProducts > 0 && (
            <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-3 flex gap-2 text-[11px] text-amber-200">
              <AlertTriangle className="h-4 w-4 shrink-0" />
              Certains relevés datent de plus de 14 jours ou leur date est inconnue.
            </div>
          )}

          <div className="rounded-2xl border border-slate-800 bg-slate-900 p-4 space-y-2">
            <h3 className="text-xs font-semibold text-slate-200">Détail et fraîcheur des prix</h3>
            {result.lines.map((line) => (
              <div key={line.productId} className="flex justify-between gap-3 text-[10px]">
                <span className="text-slate-400 truncate">{line.name}</span>
                <span className={line.data?.stale || line.data?.thin ? 'text-amber-300 shrink-0' : 'text-emerald-300 shrink-0'}>
                  {!line.data ? 'Sans prix' : line.data.nObservations === 0 ? 'Saisie manuelle' : `${line.data.nObservations} relevés · ${line.data.ageDays === null ? 'date inconnue' : `${line.data.ageDays} j`}`}
                </span>
              </div>
            ))}
          </div>

          {result.categoryTotals.length > 0 && (
            <div className="rounded-2xl border border-slate-800 bg-slate-900 p-4 space-y-2">
              <h3 className="text-xs font-semibold text-slate-200">Total par catégorie</h3>
              {result.categoryTotals.map((row) => (
                <div key={row.category} className="flex justify-between text-[11px] text-slate-400">
                  <span>{categoryLabels[row.category]?.[profile.locale] || row.category}</span>
                  <span className="font-mono-numbers text-slate-200">{formatMoney(row.cost.expectedMinor, 'DZD', profile.locale)}</span>
                </div>
              ))}
            </div>
          )}

          <div className="rounded-2xl border border-slate-800 bg-slate-900 p-4 space-y-2">
            <h3 className="text-xs font-semibold text-slate-200">Répartition par semaine</h3>
            {result.weeklyTotals.map((week) => (
              <div key={week.week} className="flex justify-between text-[11px] text-slate-400">
                <span>Semaine {week.week} · jours {week.startDay}–{week.endDay}</span>
                <span className="font-mono-numbers text-slate-200">{formatMoney(week.cost.expectedMinor, 'DZD', profile.locale)}</span>
              </div>
            ))}
          </div>
          {result.cheapestSubstitutes.length > 0 && (
            <div className="rounded-2xl border border-slate-800 bg-slate-900 p-4 space-y-2">
              <h3 className="text-xs font-semibold text-slate-200">Alternatives moins chères dans ton panier</h3>
              {result.cheapestSubstitutes.map((suggestion) => {
                const from = basket.find((item) => item.productId === suggestion.fromProductId);
                const to = basket.find((item) => item.productId === suggestion.toProductId);
                return <div key={suggestion.fromProductId} className="text-[11px] text-slate-400">{from?.name} → {to?.name} · économie estimée {formatMoney(suggestion.estimatedSavingMinor, 'DZD', profile.locale)}</div>;
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
