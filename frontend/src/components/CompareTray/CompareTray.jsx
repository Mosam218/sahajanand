import { Link, useLocation } from '../../router/index.jsx';
import { useApp, MAX_COMPARE } from '../../context/AppContext.jsx';
import { useCatalogue } from '../../hooks/useCatalogue.js';
import { productImage } from '../../utils/format.js';
import Icon from '../Icon/Icon.jsx';
import './CompareTray.css';

export default function CompareTray() {
  const { compare, toggleCompare, clearCompare, notice } = useApp();
  const { getProduct } = useCatalogue();
  const { pathname } = useLocation();
  const items = compare.map(getProduct).filter(Boolean);
  const hidden = items.length === 0 || pathname === '/compare';

  return (
    <>
      <div className="toast" role="status" aria-live="polite">{notice && <p>{notice}</p>}</div>
      {!hidden && (
        <aside className="tray" aria-label="Product comparison">
          <div className="wrap tray__in">
            <p className="tray__label"><strong className="num">{items.length}</strong> of {MAX_COMPARE} selected</p>
            <ul className="tray__items">
              {items.map((p) => (
                <li key={p.id}>
                  <img src={productImage(p.image)} alt="" />
                  <span>{p.model}</span>
                  <button onClick={() => toggleCompare(p.id)} aria-label={`Remove ${p.model} from comparison`}><Icon name="close" size={14} /></button>
                </li>
              ))}
            </ul>
            <button className="tray__clear" onClick={clearCompare}>Clear</button>
            {items.length >= 2 ? (
              <Link to="/compare" className="btn btn-primary btn-sm">Compare {items.length} products</Link>
            ) : (
              <span className="tray__hint">Add one more to compare</span>
            )}
          </div>
        </aside>
      )}
    </>
  );
}
