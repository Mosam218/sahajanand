import { Link } from '../../router/index.jsx';
import { useApp, MAX_COMPARE } from '../../context/AppContext.jsx';
import { useCatalogue } from '../../hooks/useCatalogue.js';
import { productImage } from '../../utils/format.js';
import Icon from '../../components/Icon/Icon.jsx';
import { useSeo } from '../../hooks/useSeo.js';
import './Compare.css';

export default function Compare() {
  const { compare, toggleCompare, clearCompare, openQuote } = useApp();
  const { getProduct, getCategory } = useCatalogue();
  const items = compare.map(getProduct).filter(Boolean);
  useSeo({ title: 'Compare products | Sahajanand Electronics', noindex: true });

  // Union of specification rows, in first-seen order.
  const labels = [];
  for (const p of items) for (const s of p.specifications) if (!labels.includes(s.label)) labels.push(s.label);
  const value = (p, label) => p.specifications.find((s) => s.label === label)?.value;
  const differs = (label) => new Set(items.map((p) => value(p, label) ?? '')).size > 1;

  return (
    <div className="wrap compare">
      <nav className="breadcrumbs" aria-label="Breadcrumb">
        <Link to="/">Home</Link><span aria-hidden="true">/</span><span>Compare</span>
      </nav>
      <header className="compare__head">
        <div>
          <h1>Compare products</h1>
          <p className="lede">Side-by-side specifications for up to {MAX_COMPARE} models. Rows that differ are marked.</p>
        </div>
        {items.length > 0 && <button className="btn btn-ghost btn-sm" onClick={clearCompare}>Clear comparison</button>}
      </header>

      {items.length < 2 ? (
        <div className="empty">
          <h3>{items.length === 0 ? 'Nothing to compare yet' : `Add one more product to compare with ${items[0].model}`}</h3>
          <p className="muted">Use the Compare button on any product card to add it here.</p>
          <Link to="/products" className="btn btn-primary">Browse products</Link>
        </div>
      ) : (
        <div className="compare__scroll">
          <table className="compare__table" style={{ '--cols': items.length }}>
            <thead>
              <tr>
                <td />
                {items.map((p) => (
                  <th key={p.id} scope="col">
                    <button className="compare__remove" onClick={() => toggleCompare(p.id)} aria-label={`Remove ${p.model}`}><Icon name="close" size={16} /></button>
                    <Link to={`/product/${p.id}`} className="compare__img"><img src={productImage(p.image)} alt="" /></Link>
                    <Link to={`/product/${p.id}`} className="compare__model">{p.model}</Link>
                    <span className="compare__name">{p.name}</span>
                    <button className="btn btn-primary btn-sm" onClick={() => openQuote(p.model)}>Request quote</button>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              <tr>
                <th scope="row">Category</th>
                {items.map((p) => <td key={p.id}>{getCategory(p.category)?.name}</td>)}
              </tr>
              {labels.map((label) => (
                <tr key={label} className={differs(label) ? 'is-diff' : ''}>
                  <th scope="row">{label}</th>
                  {items.map((p) => <td key={p.id} className="num">{value(p, label) ?? <span className="muted">Not listed</span>}</td>)}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
