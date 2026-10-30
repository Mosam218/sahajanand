// The hero is a temperature axis: each stop puts a product from the catalogue
// on that scale, coldest first. Stops are built from the products the API
// returns (featured ones first), one per product type.
import { useEffect, useMemo, useState } from 'react';
import { Link } from '../../router/index.jsx';
import { useApp } from '../../context/AppContext.jsx';
import { useCatalogue } from '../../hooks/useCatalogue.js';
import { productImage, fmtTemp } from '../../utils/format.js';
import './Hero.css';

const MAX_STOPS = 6;
const reading = ([min, max]) => (min === max ? fmtTemp(min) : `${fmtTemp(min)} to ${fmtTemp(max)}`);

function buildStops(products) {
  const seen = new Set();
  const picks = [];
  // Featured products first, then catalogue order; one stop per product type
  for (const p of [...products].sort((a, b) => Number(b.featured) - Number(a.featured))) {
    const type = p.subcategory || p.familyName || p.model;
    // One stop per product type and per temperature range, so the axis reads as a scale
    if (!p.temp || !p.image || seen.has(type) || seen.has(reading(p.temp))) continue;
    seen.add(type); seen.add(reading(p.temp));
    picks.push({ reading: reading(p.temp), label: type, product: p });
    if (picks.length === MAX_STOPS) break;
  }
  return picks.sort((a, b) => a.product.temp[0] - b.product.temp[0] || a.product.temp[1] - b.product.temp[1]);
}

export default function Hero() {
  const { openQuote, settings } = useApp();
  const { products, getCategory } = useCatalogue();
  const STOPS = useMemo(() => buildStops(products), [products]);
  const [active, setActive] = useState(0);
  const [paused, setPaused] = useState(false);

  useEffect(() => { setActive(Math.min(Math.floor(STOPS.length / 2), Math.max(STOPS.length - 1, 0))); }, [STOPS.length]);
  useEffect(() => {
    if (paused || STOPS.length < 2 || window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;
    const t = setInterval(() => setActive((i) => (i + 1) % STOPS.length), 4500);
    return () => clearInterval(t);
  }, [paused, STOPS.length]);

  const stop = STOPS[active] || null;
  const product = stop?.product;
  const title = settings.heroTitle || 'Every temperature your business runs on.';
  const lede = settings.heroLede || `Commercial refrigeration for kitchens, bars, retail, ice and vending from ${settings.storeName}, authorised Elanpro reseller serving ${settings.serviceAreas.join(' and ')}.`;

  return (
    <section className="hero" onMouseEnter={() => setPaused(true)} onMouseLeave={() => setPaused(false)} onFocus={() => setPaused(true)} onBlur={() => setPaused(false)}>
      <div className="wrap hero__grid">
        <div className="hero__copy">
          <h1 className="hero__title">{title}</h1>
          <p className="hero__lede">{lede}</p>
          <div className="hero__cta">
            <Link to="/products" className="btn btn-primary">Explore products</Link>
            <button className="btn btn-light" onClick={() => openQuote()}>Request a quote</button>
          </div>
        </div>

        <div className="hero__stage">
          {stop && <p className="hero__reading num" key={`r${active}`} aria-hidden="true">{stop.reading}</p>}
          {product && (
            <Link to={`/product/${product.id}`} className="hero__product" key={active}>
              <img src={productImage(product.image)} alt={`${product.model}, ${product.name}`} />
              <span className="hero__tag">
                <strong>{product.model}</strong>
                <span>{product.name}</span>
                <small>{getCategory(product.category)?.name}</small>
              </span>
            </Link>
          )}
        </div>
      </div>

      {STOPS.length > 1 && <div className="wrap">
        <div className="hero__axis" role="tablist" aria-label="Browse the range by temperature" style={{ '--stops': STOPS.length }}>
          {STOPS.map((s, i) => (
            <button key={s.product.id} role="tab" aria-selected={i === active} className="hero__stop" onClick={() => { setActive(i); setPaused(true); }}>
              <span className="hero__stop-reading num">{s.reading}</span>
              <span className="hero__stop-label">{s.label}</span>
            </button>
          ))}
        </div>
      </div>}
    </section>
  );
}
