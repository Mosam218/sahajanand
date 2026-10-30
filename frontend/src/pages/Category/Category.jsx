import { useEffect, useState } from 'react';
import { Link } from '../../router/index.jsx';
import { useApp } from '../../context/AppContext.jsx';
import { useCatalogue } from '../../hooks/useCatalogue.js';
import { sceneImage } from '../../utils/format.js';
import { useSeo } from '../../hooks/useSeo.js';
import ProductBrowser from '../../components/ProductBrowser/ProductBrowser.jsx';
import NotFound from '../NotFound/NotFound.jsx';
import './Category.css';

export default function Category({ params }) {
  const { getCategory, byCategory } = useCatalogue();
  const { openQuote, settings } = useApp();
  const category = getCategory(params.slug);
  useSeo(category ? {
    title: `${category.name} | Elanpro at ${settings.storeName}`,
    description: `${category.description} Available from ${settings.storeName}, authorised Elanpro reseller in ${settings.serviceAreas.join(' and ')}.`.trim(),
    path: `/category/${category.slug}`,
  } : { title: `Category not found | ${settings.storeName}`, noindex: true });
  const [sub, setSub] = useState('');
  useEffect(() => setSub(''), [params.slug]);
  if (!category) return <NotFound />;

  const products = byCategory(category.slug);
  const subs = category.subcategories.filter((s) => products.some((p) => p.subcategory === s));

  return (
    <>
      <header className="cat-hero">
        {category.scene && <img className="cat-hero__bg" src={sceneImage(category.scene)} alt="" />}
        <div className="wrap cat-hero__in">
          <nav className="breadcrumbs" aria-label="Breadcrumb">
            <Link to="/">Home</Link><span aria-hidden="true">/</span>
            <Link to="/products">Products</Link><span aria-hidden="true">/</span>
            <span>{category.name}</span>
          </nav>
          {category.tagline && <p className="cat-hero__tag">{category.tagline}</p>}
          <h1>{category.name}</h1>
          {category.description && <p className="cat-hero__desc">{category.description}</p>}
          <button className="btn btn-primary" onClick={() => openQuote()}>Request a quote</button>
        </div>
      </header>

      <div className="wrap cat-body">
        {subs.length > 1 && (
          <div className="cat-subs" role="group" aria-label="Product types">
            <button className="chip" aria-pressed={sub === ''} onClick={() => setSub('')}>All {category.shortName.toLowerCase()} products</button>
            {subs.map((s) => (
              <button key={s} className="chip" aria-pressed={sub === s} onClick={() => setSub(sub === s ? '' : s)}>{s}</button>
            ))}
          </div>
        )}
        <ProductBrowser products={sub ? products.filter((p) => p.subcategory === sub) : products} resetKey={`${category.slug}|${sub}`} />
      </div>
    </>
  );
}
