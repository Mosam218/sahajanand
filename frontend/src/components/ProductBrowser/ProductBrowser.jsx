// Toolbar + filters + grid. Shared by the category page and the all-products page.
// Filter groups are built from the data, so a filter only appears where the
// catalogue gives at least two different values for it.
import { useEffect, useMemo, useState } from 'react';
import { useCatalogue } from '../../hooks/useCatalogue.js';
import { searchProducts } from '../../utils/search.js';
import { CAPACITY_BUCKETS, capacityBucket } from '../../utils/specs.js';
import FilterPanel from '../FilterPanel/FilterPanel.jsx';
import ProductGrid from '../ProductGrid/ProductGrid.jsx';
import Icon from '../Icon/Icon.jsx';
import './ProductBrowser.css';

const TEMP_ORDER = ['Ultra-low', 'Freezer', 'Dual / convertible', 'Chiller', 'Heated'];
const SORTS = {
  catalogue: { label: 'Catalogue order', fn: null },
  model: { label: 'Model, A to Z', fn: (a, b) => a.model.localeCompare(b.model, 'en', { numeric: true }) },
  capAsc: { label: 'Capacity, low to high', fn: (a, b) => (a.capacityL ?? Infinity) - (b.capacityL ?? Infinity) },
  capDesc: { label: 'Capacity, high to low', fn: (a, b) => (b.capacityL ?? -1) - (a.capacityL ?? -1) },
};

export default function ProductBrowser({ products, showCategory = false, initialQuery = '', resetKey }) {
  const { getCategory } = useCatalogue();
  const [query, setQuery] = useState(initialQuery);
  const [sort, setSort] = useState('catalogue');
  const [selected, setSelected] = useState({});
  const [sheet, setSheet] = useState(false);

  useEffect(() => {
    setQuery(initialQuery);
    setSelected({});
  }, [resetKey, initialQuery]);

  const accessors = useMemo(() => ({
    category: (p) => getCategory(p.category)?.name,
    subcategory: (p) => p.subcategory,
    tempClass: (p) => p.tempClass,
    capacity: (p) => capacityBucket(p.capacityL),
    refrigerant: (p) => p.refrigerant,
    cooling: (p) => p.cooling,
  }), [getCategory]);

  const groups = useMemo(() => {
    const defs = [
      showCategory && { key: 'category', label: 'Category' },
      { key: 'tempClass', label: 'Temperature class', order: TEMP_ORDER },
      { key: 'capacity', label: 'Capacity', order: CAPACITY_BUCKETS.map((b) => b.key) },
      { key: 'cooling', label: 'Cooling type' },
      { key: 'refrigerant', label: 'Refrigerant' },
    ].filter(Boolean);
    return defs
      .map((d) => {
        const counts = new Map();
        for (const p of products) {
          const v = accessors[d.key](p);
          if (v) counts.set(v, (counts.get(v) || 0) + 1);
        }
        let options = [...counts].map(([value, count]) => ({ value, count }));
        if (d.order) options.sort((a, b) => d.order.indexOf(a.value) - d.order.indexOf(b.value));
        return { ...d, options };
      })
      .filter((g) => g.options.length > 1);
  }, [products, showCategory, accessors]);

  const visible = useMemo(() => {
    let list = query.trim() ? searchProducts(query, products) : products;
    for (const [key, values] of Object.entries(selected)) {
      if (values.length) list = list.filter((p) => values.includes(accessors[key](p)));
    }
    return SORTS[sort].fn ? [...list].sort(SORTS[sort].fn) : list;
  }, [products, query, selected, sort, accessors]);

  const toggle = (key, value) =>
    setSelected((s) => {
      const cur = s[key] || [];
      return { ...s, [key]: cur.includes(value) ? cur.filter((v) => v !== value) : [...cur, value] };
    });
  const clear = () => { setSelected({}); setQuery(''); };
  const activeCount = Object.values(selected).reduce((n, v) => n + v.length, 0);

  return (
    <div className={`browser ${groups.length === 0 ? 'browser--nofilter' : ''}`}>
      <div className="browser__bar">
        <p className="browser__count" aria-live="polite">
          <strong className="num">{visible.length}</strong> {visible.length === 1 ? 'product' : 'products'}
        </p>
        <label className="browser__search">
          <span className="sr-only">Search within these products</span>
          <Icon name="search" size={16} />
          <input type="search" placeholder="Search within results" value={query} onChange={(e) => setQuery(e.target.value)} />
        </label>
        <label className="browser__sort">
          <span>Sort</span>
          <select className="select" value={sort} onChange={(e) => setSort(e.target.value)}>
            {Object.entries(SORTS).map(([k, s]) => <option key={k} value={k}>{s.label}</option>)}
          </select>
        </label>
        {groups.length > 0 && (
          <button className="btn btn-ghost btn-sm browser__toggle" onClick={() => setSheet((s) => !s)} aria-expanded={sheet}>
            <Icon name="filter" size={16} /> Filters{activeCount > 0 ? ` (${activeCount})` : ''}
          </button>
        )}
      </div>

      <aside className={`browser__side ${sheet ? 'is-open' : ''}`}>
        <FilterPanel groups={groups} selected={selected} onToggle={toggle} onClear={clear} />
      </aside>

      <div className="browser__results">
        {visible.length > 0 ? (
          <ProductGrid products={visible} />
        ) : (
          <div className="empty">
            <h3>No products match these filters</h3>
            <p className="muted">Remove a filter or clear the search to see more of the range.</p>
            <button className="btn btn-ghost" onClick={clear}>Clear filters</button>
          </div>
        )}
      </div>
    </div>
  );
}
