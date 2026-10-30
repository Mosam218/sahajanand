import { Link } from '../../router/index.jsx';
import { useSeo } from '../../hooks/useSeo.js';

export default function NotFound() {
  useSeo({ title: 'Page not found | Sahajanand Electronics', noindex: true });
  return (
    <div className="wrap section">
      <div className="empty">
        <h1 style={{ fontSize: 'var(--fs-4)', marginBottom: '0.5rem' }}>We could not find this page</h1>
        <p className="muted">The link may be out of date, or the product may no longer be listed. Search by model number above, or browse the full range.</p>
        <Link to="/products" className="btn btn-primary">Browse all products</Link>
      </div>
    </div>
  );
}
