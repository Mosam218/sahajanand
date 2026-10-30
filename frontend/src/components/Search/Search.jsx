import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { Link, useLocation, useNavigate } from '../../router/index.jsx';
import { useCatalogue } from '../../hooks/useCatalogue.js';
import { searchProducts } from '../../utils/search.js';
import { productImage } from '../../utils/format.js';
import Icon from '../Icon/Icon.jsx';
import './Search.css';

export default function Search({ autoFocus = false, onNavigate }) {
  const { products, getCategory } = useCatalogue();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);
  const box = useRef(null);
  const listId = useId();

  const results = useMemo(() => searchProducts(q, products), [q, products]);
  const top = results.slice(0, 6);

  useEffect(() => { setOpen(false); }, [pathname]);
  useEffect(() => {
    const away = (e) => { if (!box.current?.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', away);
    return () => document.removeEventListener('mousedown', away);
  }, []);

  const submit = (e) => {
    e.preventDefault();
    if (!q.trim()) return;
    setOpen(false);
    navigate(`/products?q=${encodeURIComponent(q.trim())}`);
    onNavigate?.();
  };

  return (
    <div className="search" ref={box}>
      <form role="search" onSubmit={submit} className="search__form">
        <label className="sr-only" htmlFor={`${listId}-input`}>Search products</label>
        <Icon name="search" size={18} />
        <input
          id={`${listId}-input`}
          type="search"
          autoComplete="off"
          autoFocus={autoFocus}
          placeholder="Search by model, product or category"
          value={q}
          onChange={(e) => { setQ(e.target.value); setOpen(true); }}
          onFocus={() => setOpen(true)}
          onKeyDown={(e) => e.key === 'Escape' && setOpen(false)}
          aria-controls={listId}
        />
        <button type="submit" className="search__go">Search</button>
      </form>

      {open && q.trim() && (
        <div className="search__panel" id={listId}>
          {top.length === 0 ? (
            <p className="search__none">
              No products match “{q}”. Try a model number such as EGN 1500, or a product type such as blast or wine.
            </p>
          ) : (
            <>
              <ul>
                {top.map((p) => (
                  <li key={p.id}>
                    <Link to={`/product/${p.id}`} className="search__hit" onClick={() => { setOpen(false); onNavigate?.(); }}>
                      <span className="search__thumb"><img src={productImage(p.image)} alt="" loading="lazy" /></span>
                      <span>
                        <strong>{p.model}</strong>
                        <small>{p.name}, {getCategory(p.category)?.name}</small>
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
              {results.length > top.length && (
                <button type="button" className="search__all" onClick={submit}>
                  See all {results.length} results
                </button>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
