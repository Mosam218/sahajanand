import { Link } from '../../router/index.jsx';
import { useApp } from '../../context/AppContext.jsx';
import { useCatalogue } from '../../hooks/useCatalogue.js';
import { industries } from '../../data/industries.js';
import { productImage } from '../../utils/format.js';
import { useSeo } from '../../hooks/useSeo.js';
import './Solutions.css';

export default function Solutions() {
  const { getCategory, counts } = useCatalogue();
  const { openQuote, settings } = useApp();
  useSeo({
    title: `Refrigeration solutions by industry | ${settings.storeName}`,
    description: `Elanpro refrigeration for hotels, restaurants, bars, food retail and workplaces, supplied by ${settings.storeName} in ${settings.serviceAreas.join(' and ')}.`,
    path: '/solutions',
  });
  return (
    <div className="wrap solutions">
      <nav className="breadcrumbs" aria-label="Breadcrumb">
        <Link to="/">Home</Link><span aria-hidden="true">/</span><span>Solutions</span>
      </nav>
      <header className="plain-head">
        <h1>Solutions for your business</h1>
        <p className="lede">Elanpro equipment serves hospitality, retail and food-service businesses. Find your sector and go straight to the product lines built for it.</p>
      </header>
      <div className="solutions__list">
        {industries.map((ind) => (
          <section key={ind.slug} id={ind.slug} className="solutions__row">
            <div>
              <h2>{ind.name}</h2>
              <p>{ind.need}</p>
              <button className="text-link" onClick={() => openQuote()}>Request a quote</button>
            </div>
            <ul>
              {ind.categories.map((slug) => {
                const c = getCategory(slug);
                if (!c) return null;
                return (
                  <li key={slug}>
                    <Link to={`/category/${slug}`}>
                      <span className="solutions__thumb"><img src={productImage(c.image)} alt="" loading="lazy" /></span>
                      <strong>{c.name}</strong>
                      <small className="num">{counts[slug] || 0} products</small>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </section>
        ))}
      </div>
    </div>
  );
}
