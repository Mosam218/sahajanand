// Policy pages. The text is written by the business in Admin → Settings and
// shown here exactly as entered. Nothing is shown until it has been supplied.
import { Link } from '../../router/index.jsx';
import { useApp } from '../../context/AppContext.jsx';
import { useAsync } from '../../hooks/useAsync.js';
import { useSeo } from '../../hooks/useSeo.js';
import { api } from '../../services/api.js';
import { fmtDate } from '../../utils/format.js';
import { Loading, ErrorState } from '../../components/State/State.jsx';
import NotFound from '../NotFound/NotFound.jsx';
import { POLICIES } from '../../data/policies.js';
import './Policy.css';

export default function Policy({ params }) {
  const { settings } = useApp();
  const title = POLICIES.find(([key]) => key === params.key)?.[1];
  const published = Boolean(title && settings.policies?.[params.key]);
  const { data: policy, loading, error, reload } = useAsync(() => api.policy(params.key), [params.key], { enabled: published });
  useSeo({ title: `${title || 'Policy'} | ${settings.storeName}`, path: published ? `/policies/${params.key}` : undefined, noindex: !published });

  if (!title) return <NotFound />;

  return (
    <div className="wrap policy">
      <nav className="breadcrumbs" aria-label="Breadcrumb">
        <Link to="/">Home</Link><span aria-hidden="true">/</span><span>{title}</span>
      </nav>
      <h1>{title}</h1>
      {!published && (
        <div className="empty">
          <h3>This policy has not been published yet</h3>
          <p className="muted">Please contact us if you have a question about it.</p>
          <Link to="/contact" className="btn btn-primary">Contact us</Link>
        </div>
      )}
      {published && loading && !policy && <Loading label="Loading" />}
      {published && error && !policy && <ErrorState error={error} onRetry={reload} />}
      {policy && (
        <>
          <p className="muted policy__date">Last updated {fmtDate(policy.updatedAt)}</p>
          <div className="policy__text">{policy.content}</div>
        </>
      )}
    </div>
  );
}
