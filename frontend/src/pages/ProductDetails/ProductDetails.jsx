import { useEffect, useMemo, useState } from 'react';
import { Link } from '../../router/index.jsx';
import { useApp, MAX_PER_ITEM } from '../../context/AppContext.jsx';
import { useCatalogue } from '../../hooks/useCatalogue.js';
import { useSeo } from '../../hooks/useSeo.js';
import { api } from '../../services/api.js';
import { toProduct } from '../../services/mappers.js';
import { productImage, fmtPrice } from '../../utils/format.js';
import { keySpecs } from '../../utils/specs.js';
import TempScale from '../../components/TempScale/TempScale.jsx';
import ProductGrid from '../../components/ProductGrid/ProductGrid.jsx';
import Icon from '../../components/Icon/Icon.jsx';
import NotFound from '../NotFound/NotFound.jsx';
import './ProductDetails.css';

const PRICE_NOTE = {
  listed: 'Reference price. Ask us to confirm the current price.',
  indicative: 'Indicative price. Ask us to confirm the current price.',
};

export default function ProductDetails({ params }) {
  const { getProduct, getCategory, byFamily, byCategory } = useCatalogue();
  const { openQuote, compare, toggleCompare, addToCart, cartBusy, settings } = useApp();
  const listed = getProduct(params.id);

  // The catalogue list is loaded once per visit; price and stock are read
  // again here so the page a customer orders from is current.
  const [fresh, setFresh] = useState(null);
  const [gone, setGone] = useState(false);
  useEffect(() => {
    let cancelled = false;
    setFresh(null); setGone(false);
    api.product(params.id)
      .then((d) => { if (!cancelled) setFresh(toProduct(d.product)); })
      .catch((err) => { if (!cancelled && err.status === 404) setGone(true); });
    return () => { cancelled = true; };
  }, [params.id]);

  const product = fresh || listed;
  const [shot, setShot] = useState(0);
  const [qty, setQty] = useState(1);
  useEffect(() => { setShot(0); setQty(1); }, [params.id]);

  const category = product ? getCategory(product.category) : null;
  const inStock = product ? product.stock > 0 : false;
  const maxQty = product ? Math.min(product.stock, MAX_PER_ITEM) : 1;

  const jsonLd = useMemo(() => product && ({
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: product.title,
    description: product.description || undefined,
    sku: product.sku || product.model,
    mpn: product.model,
    brand: product.brand ? { '@type': 'Brand', name: product.brand } : undefined,
    category: category?.name,
    image: product.gallery.map((g) => (/^https?:/.test(g) ? g : `${window.location.origin}${productImage(g)}`)),
    offers: product.price > 0 ? {
      '@type': 'Offer',
      priceCurrency: 'INR',
      price: product.price,
      availability: `https://schema.org/${inStock ? 'InStock' : 'OutOfStock'}`,
      url: `${window.location.origin}/product/${product.id}`,
      seller: { '@type': 'Organization', name: settings.storeName },
    } : undefined,
  }), [product, category, inStock, settings.storeName]);

  useSeo(product ? {
    title: `${product.title} | ${settings.storeName}`,
    description: `${product.title}${category ? `, ${category.name}` : ''}. ${product.description}`.slice(0, 300),
    path: `/product/${product.id}`,
    image: productImage(product.image),
    jsonLd,
  } : { title: `Product not found | ${settings.storeName}`, noindex: true });

  if (!product || gone) return <NotFound />;

  const variants = byFamily(product.familyId).length > 1 && product.familyId ? byFamily(product.familyId) : [];
  const variantCols = keySpecs(product, 3).map((s) => s.label);
  const seen = new Set();
  const related = byCategory(product.category)
    .filter((p) => p.id !== product.id && (!product.familyId || p.familyId !== product.familyId) && !seen.has(p.familyId || p.id) && seen.add(p.familyId || p.id))
    .slice(0, 4);
  const comparing = compare.includes(product.id);
  const facts = keySpecs(product, 3);
  const gallery = product.gallery.length ? product.gallery : [''];

  const stockLabel = !inStock
    ? 'Out of stock'
    : product.stock <= (settings.lowStockThreshold ?? 3) ? `Only ${product.stock} left in stock` : 'In stock';
  const add = () => addToCart(product, qty);

  return (
    <div className="pd">
      <div className="wrap">
        <nav className="breadcrumbs" aria-label="Breadcrumb">
          <Link to="/">Home</Link><span aria-hidden="true">/</span>
          {category
            ? <><Link to={`/category/${category.slug}`}>{category.name}</Link><span aria-hidden="true">/</span></>
            : <><Link to="/products">Products</Link><span aria-hidden="true">/</span></>}
          <span>{product.model}</span>
        </nav>

        <div className="pd__top">
          <div className="pd__gallery">
            <div className="pd__stage">
              <img key={shot} src={productImage(gallery[shot] ?? gallery[0])} alt={product.title} />
            </div>
            {gallery.length > 1 && (
              <div className="pd__thumbs">
                {gallery.map((g, i) => (
                  <button key={g} aria-pressed={i === shot} aria-label={`Show image ${i + 1} of ${gallery.length}`} onClick={() => setShot(i)}>
                    <img src={productImage(g)} alt="" loading="lazy" />
                  </button>
                ))}
              </div>
            )}
            <p className="pd__note">Images represent the series. Door configuration and finish vary by model.</p>
          </div>

          <div className="pd__info">
            <p className="pd__sub">{[category?.name, product.subcategory].filter(Boolean).join(', ')}</p>
            <h1 className="pd__model">{product.model}</h1>
            {product.name && <p className="pd__name">{product.name}</p>}
            {product.description && <p className="pd__desc">{product.description}</p>}

            {product.temp && (
              <div className="pd__temp">
                <div className="pd__temp-head">
                  <span>Operating range</span>
                  <strong>{product.tempClass}</strong>
                </div>
                <TempScale temp={product.temp} tempClass={product.tempClass} detailed />
              </div>
            )}

            {facts.length > 0 && (
              <dl className="pd__facts">
                {facts.map((f) => (
                  <div key={f.label}><dt>{f.label}</dt><dd className="num">{f.value}</dd></div>
                ))}
              </dl>
            )}

            {product.badges.length > 0 && (
              <ul className="pd__badges">{product.badges.map((b) => <li key={b} className="badge">{b}</li>)}</ul>
            )}

            {product.price > 0 && (
              <p className="pd__price">
                <strong className="num">{fmtPrice(product.price)}</strong>
                {product.mrp > product.price && <s className="num">{fmtPrice(product.mrp)}</s>}
                <span>
                  {settings.gstInclusive ? 'Inclusive of GST.' : `Plus ${settings.gstPercent}% GST.`}
                  {PRICE_NOTE[product.priceSource] ? ` ${PRICE_NOTE[product.priceSource]}` : ''}
                </span>
              </p>
            )}

            <dl className="pd__meta">
              <div><dt>Availability</dt><dd className={inStock ? 'pd__in' : 'pd__out'}>{stockLabel}</dd></div>
              {product.brand && <div><dt>Brand</dt><dd>{product.brand}</dd></div>}
              {product.sku && <div><dt>SKU</dt><dd className="num">{product.sku}</dd></div>}
              {product.warrantyMonths > 0 && <div><dt>Warranty</dt><dd>{product.warrantyMonths} months</dd></div>}
            </dl>

            <div className="pd__cta">
              {inStock && (
                <div className="pd__qty" role="group" aria-label="Quantity">
                  <button onClick={() => setQty((q) => Math.max(1, q - 1))} disabled={qty <= 1} aria-label="Decrease quantity">−</button>
                  <span className="num" aria-live="polite">{qty}</span>
                  <button onClick={() => setQty((q) => Math.min(maxQty, q + 1))} disabled={qty >= maxQty} aria-label="Increase quantity">+</button>
                </div>
              )}
              <button className="btn btn-primary" onClick={add} disabled={!inStock || cartBusy} id="pd-add-to-cart">
                <Icon name="cart" size={18} /> {inStock ? 'Add to cart' : 'Out of stock'}
              </button>
              <button className="btn btn-ghost" onClick={() => openQuote(product.model)}>Request a quote</button>
              <button className="btn btn-ghost" aria-pressed={comparing} onClick={() => toggleCompare(product.id)}>
                <Icon name={comparing ? 'check' : 'compare'} size={18} /> {comparing ? 'Added to comparison' : 'Compare'}
              </button>
            </div>
            {!inStock && <p className="pd__note">Request a quote and we will confirm availability and lead time.</p>}
            {inStock && maxQty === MAX_PER_ITEM && <p className="pd__note">Need more than {MAX_PER_ITEM}? Request a quote for bulk orders.</p>}
          </div>
        </div>

        <div className="pd__sections">
          {product.features.length > 0 && (
            <section aria-labelledby="pd-features">
              <h2 id="pd-features">Key features</h2>
              <ul className="pd__features">
                {product.features.map((f) => <li key={f}><Icon name="check" size={18} />{f}</li>)}
              </ul>
            </section>
          )}

          {product.specifications.length > 0 && (
            <section aria-labelledby="pd-specs">
              <h2 id="pd-specs">Technical specifications</h2>
              <div className="pd__table-wrap">
                <table className="spec">
                  <caption className="sr-only">Technical specifications for {product.model}</caption>
                  <tbody>
                    <tr><th scope="row">Model</th><td>{product.model}</td></tr>
                    {product.specifications.map((s) => (
                      <tr key={s.label}><th scope="row">{s.label}</th><td className="num">{s.value}</td></tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="pd__note">Specifications are taken from the manufacturer’s catalogue and are subject to change without notice.</p>
            </section>
          )}

          {product.applications.length > 0 && (
            <section aria-labelledby="pd-apps">
              <h2 id="pd-apps">Applications</h2>
              <ul className="pd__apps">{product.applications.map((a) => <li key={a}>{a}</li>)}</ul>
            </section>
          )}

          {variants.length > 1 && (
            <section aria-labelledby="pd-variants">
              <h2 id="pd-variants">Available variants</h2>
              <div className="pd__table-wrap">
                <table className="spec spec--cols">
                  <thead>
                    <tr><th scope="col">Model</th>{variantCols.map((c) => <th key={c} scope="col">{c}</th>)}</tr>
                  </thead>
                  <tbody>
                    {variants.map((v) => (
                      <tr key={v.id} aria-current={v.id === product.id ? 'true' : undefined}>
                        <th scope="row">{v.id === product.id ? v.model : <Link to={`/product/${v.id}`}>{v.model}</Link>}</th>
                        {variantCols.map((c) => <td key={c} className="num">{v.specifications.find((s) => s.label === c)?.value ?? 'n/a'}</td>)}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}
        </div>
      </div>

      {related.length > 0 && (
        <section className="pd__related">
          <div className="wrap">
            <div className="section-head">
              <h2>Related products</h2>
              {category && <Link to={`/category/${category.slug}`} className="text-link">All {category.name}</Link>}
            </div>
            <ProductGrid products={related} columns="4" />
          </div>
        </section>
      )}

      <div className="pd__sticky">
        <div><strong>{product.model}</strong><span>{product.price > 0 ? fmtPrice(product.price) : product.name}</span></div>
        {inStock
          ? <button className="btn btn-primary" onClick={add} disabled={cartBusy}>Add to cart</button>
          : <button className="btn btn-primary" onClick={() => openQuote(product.model)}>Request a quote</button>}
      </div>
    </div>
  );
}
