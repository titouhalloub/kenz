import React, { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Calculator, Plus, Trash2 } from 'lucide-react';
import { PRODUCT_CATALOG, productName } from '../domain/productCatalog';
import { simulateMonthlyBudget, type SimulatorBasketItem, type SimulatorResult } from '../domain/simulator';
import { formatMoney, parseToMinorUnits } from '../domain/financialCalculations';
import { loadMarketPrices } from '../services/priceStore';
import type { SimulatorPrice } from '../domain/simulator';
import type { UserProfile } from '../domain/types';

interface SimulatorViewProps {
  profile: UserProfile;
  availableBudgetMinor: number;
}

const categoryLabels: Record<string, string> = {
  cereals_bread: 'Céréales & pain',
  oils_fats: 'Huiles & matières grasses',
  sugar_sweeteners: 'Sucre & édulcorants',
  dairy_eggs: 'Produits laitiers & œufs',
  vegetables: 'Légumes',
  fruits: 'Fruits',
  meat_fish: 'Viande & poisson',
  legumes: 'Légumineuses',
  spices_condiments: 'Épices & condiments',
  beverages: 'Boissons',
  household: 'Entretien',
  fuel_energy: 'Carburant & énergie',
};

function getMonth(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

export const SimulatorView: React.FC<SimulatorViewProps> = ({ profile, availableBudgetMinor }) => {
  const [month, setMonth] = useState(getMonth);
  const [adults, setAdults] = useState(2);
  const [children, setChildren] = useState(0);
  const [selectedSlug, setSelectedSlug] = useState(PRODUCT_CATALOG[0].slug);
  const [quantity, setQuantity] = useState('100');
  const [lowPrice, setLowPrice] = useState('');
  const [expectedPrice, setExpectedPrice] = useState('');
  const [highPrice, setHighPrice] = useState('');
  const [basket, setBasket] = useState<SimulatorBasketItem[]>([]);
  const [marketPrice, setMarketPrice] = useState<SimulatorPrice | null>(null);
  const [marketStatus, setMarketStatus] = useState('');
  const [error, setError] = useState('');

  const selectedProduct = PRODUCT_CATALOG.find((product) => product.slug === selectedSlug) || PRODUCT_CATALOG[0];
  const quantityUnit = selectedProduct.baseUnit === 'kg' ? 'g/jour' : selectedProduct.baseUnit === 'l' ? 'ml/jour' : 'unité/jour';

  useEffect(() => {
    let active = true;
    setMarketPrice(null);
    setLowPrice('');
    setExpectedPrice('');
    setHighPrice('');
    setMarketStatus('Recherche du prix public disponible…');
    loadMarketPrices([selectedSlug]).then((result) => {
      if (!active) return;
      const found = result.pricesBySlug[selectedSlug];
      if (found) {
        setMarketPrice(found);
        setLowPrice((found.p25UnitPriceMinor / 100).toFixed(2));
        setExpectedPrice((found.medianUnitPriceMinor / 100).toFixed(2));
        setHighPrice((found.p75UnitPriceMinor / 100).toFixed(2));
        setMarketStatus('Prix agrégé disponible · source et fraîcheur affichées après ajout.');
      } else {
        setMarketStatus(result.unavailableReason === 'schema_not_deployed'
          ? 'Le catalogue de prix n’est pas encore déployé ; tu peux saisir tes propres prix.'
          : 'Aucun relevé public disponible pour ce produit ; tu peux saisir tes propres prix.');
      }
    }).catch(() => {
      if (active) setMarketStatus('Prix publics indisponibles pour le moment ; la saisie manuelle reste possible.');
    });
    return () => { active = false; };
  }, [selectedSlug]);

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
        <div className="flex items-center gap-2">
          <Calculator className="h-4 w-4 text-emerald-400" />
          <h2 className="text-sm font-semibold text-slate-100">Simulateur mensuel des courses</h2>
        </div>
        <p className="text-[11px] leading-relaxed text-slate-400">
          Le calcul est fait sur cet appareil avec ton budget Kenz. Aucun revenu, solde ou budget n'est envoyé au serveur.
        </p>
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
              <div className="text-[10px] text-slate-500">{categoryLabels[item.category] || item.category} · {item.quantityPerPersonPerDayMilliUnits} {item.baseUnit === 'kg' ? 'g' : item.baseUnit === 'l' ? 'ml' : 'unité(s)'} / personne / jour</div>
              <div className="text-[10px] text-amber-300">{item.price?.nObservations ? `Prix de marché · ${item.price.nObservations} relevés · ${item.price?.lastObserved || ''}` : 'Prix saisi manuellement · non vérifié'}</div>
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
              Les prix saisis n'ont pas encore de relevés vérifiés. Cette projection est indicative, pas une cotation de marché.
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
