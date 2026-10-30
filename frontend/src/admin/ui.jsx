// Small building blocks shared by every admin screen.
import { useEffect, useState } from 'react';
import Icon from '../components/Icon/Icon.jsx';

export function Head({ title, sub, children }) {
  return (
    <header className="ad-head">
      <div><h1>{title}</h1>{sub && <p>{sub}</p>}</div>
      <div className="ad-head__actions">{children}</div>
    </header>
  );
}

export const Pill = ({ value, tone }) => <span className={`pill pill--${String(tone || value).toLowerCase().split(' ')[0]}`}>{value}</span>;

export function Drawer({ title, onClose, footer, wide, children }) {
  useEffect(() => {
    const k = (e) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', k);
    return () => document.removeEventListener('keydown', k);
  }, [onClose]);
  return (
    <div className="ad-drawer" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <aside className={`ad-drawer__panel ${wide ? 'is-wide' : ''}`} role="dialog" aria-modal="true" aria-label={title}>
        <header><h2>{title}</h2><button onClick={onClose} aria-label="Close"><Icon name="close" /></button></header>
        <div className="ad-drawer__body">{children}</div>
        {footer && <footer>{footer}</footer>}
      </aside>
    </div>
  );
}

// Form field helpers: f = form object, set = setter.
let fid = 0;
export function F({ label, hint, wide, children }) {
  const [id] = useState(() => `adf-${++fid}`);
  return (
    <div className={`field ${wide ? 'ad-wide' : ''}`}>
      <label htmlFor={id}>{label}</label>
      {children(id)}
      {hint && <small className="muted">{hint}</small>}
    </div>
  );
}
export const Text = ({ label, f, set, k, hint, wide, ...p }) => (
  <F label={label} hint={hint} wide={wide}>{(id) => <input id={id} className="input" value={f[k] ?? ''} onChange={(e) => set({ ...f, [k]: e.target.value })} {...p} />}</F>
);
export const Num = ({ label, f, set, k, hint, wide, ...p }) => (
  <F label={label} hint={hint} wide={wide}>{(id) => <input id={id} className="input" type="number" value={f[k] ?? ''} onChange={(e) => set({ ...f, [k]: e.target.value === '' ? '' : Number(e.target.value) })} {...p} />}</F>
);
export const Area = ({ label, f, set, k, hint, wide = true, rows = 3 }) => (
  <F label={label} hint={hint} wide={wide}>{(id) => <textarea id={id} className="textarea" rows={rows} value={f[k] ?? ''} onChange={(e) => set({ ...f, [k]: e.target.value })} />}</F>
);
export const Select = ({ label, f, set, k, options, hint, wide }) => (
  <F label={label} hint={hint} wide={wide}>{(id) => (
    <select id={id} className="select" value={f[k] ?? ''} onChange={(e) => set({ ...f, [k]: e.target.value })}>
      {options.map((o) => (Array.isArray(o) ? <option key={o[0]} value={o[0]}>{o[1]}</option> : <option key={o} value={o}>{o}</option>))}
    </select>
  )}</F>
);
export const Check = ({ label, f, set, k }) => (
  <label className="ad-check"><input type="checkbox" checked={!!f[k]} onChange={(e) => set({ ...f, [k]: e.target.checked })} /> {label}</label>
);

export const Empty = ({ children }) => <div className="empty"><p className="muted">{children}</p></div>;

// ─── Server-backed lists ─────────────────────────────────────────────────────
// Tables never load everything: search, filters and paging are sent to the
// API, which returns one page and the totals.
export function useList(fetcher, initial = {}) {
  const [query, setQuery] = useState({ page: 1, limit: 20, ...initial });
  const [search, setSearch] = useState(initial.search || '');
  const [state, setState] = useState({ items: [], meta: { page: 1, totalPages: 1, total: 0 }, loading: true, error: null });
  const [tick, setTick] = useState(0);

  // Typing in the search box waits a moment before asking the server
  useEffect(() => {
    const t = setTimeout(() => setQuery((q) => (q.search === search ? q : { ...q, search, page: 1 })), 300);
    return () => clearTimeout(t);
  }, [search]);

  const key = JSON.stringify(query);
  useEffect(() => {
    let cancelled = false;
    setState((s) => ({ ...s, loading: true, error: null }));
    fetcher(JSON.parse(key))
      .then((res) => { if (!cancelled) setState({ items: res.items, meta: res.meta, loading: false, error: null }); })
      .catch((error) => { if (!cancelled) setState((s) => ({ ...s, loading: false, error })); });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, tick]);

  return {
    ...state,
    query,
    search,
    setSearch,
    setFilter: (k, v) => setQuery((q) => ({ ...q, [k]: v, page: 1 })),
    setPage: (page) => setQuery((q) => ({ ...q, page })),
    reload: () => setTick((t) => t + 1),
    patch: (id, item) => setState((s) => ({ ...s, items: s.items.map((x) => (x._id === id ? { ...x, ...item } : x)) })),
  };
}

export function ServerPager({ list }) {
  const { page, totalPages, total } = list.meta;
  if (totalPages <= 1) return <p className="ad-pager muted">{total} {total === 1 ? 'row' : 'rows'}</p>;
  return (
    <div className="ad-pager">
      <span className="muted">{total} rows</span>
      <button className="btn btn-ghost btn-sm" disabled={page <= 1 || list.loading} onClick={() => list.setPage(page - 1)}>Previous</button>
      <span className="num">Page {page} of {totalPages}</span>
      <button className="btn btn-ghost btn-sm" disabled={page >= totalPages || list.loading} onClick={() => list.setPage(page + 1)}>Next</button>
    </div>
  );
}

/** Loading / error / empty states for a table body. */
export function ListState({ list, cols, empty = 'Nothing matches these filters.' }) {
  if (list.error) {
    return <tr><td colSpan={cols}><span className="field-error" role="alert">{list.error.message}</span> <button className="auth__link" onClick={list.reload}>Try again</button></td></tr>;
  }
  if (list.loading && list.items.length === 0) return <tr><td colSpan={cols} className="muted">Loading…</td></tr>;
  if (list.items.length === 0) return <tr><td colSpan={cols} className="muted">{empty}</td></tr>;
  return null;
}

/** Run an admin action and report the outcome in one place. */
export function useAction() {
  const [flash, setFlash] = useState(null); // { ok, text }
  const [busy, setBusy] = useState(false);
  const run = async (call, success) => {
    setBusy(true); setFlash(null);
    try {
      const result = await call();
      if (success) setFlash({ ok: true, text: typeof success === 'function' ? success(result) : success });
      return result ?? true;
    } catch (err) {
      setFlash({ ok: false, text: err.errors?.length ? err.errors.map((e) => (e.field ? `${e.field}: ${e.message}` : e.message)).join(' · ') : err.message });
      return null;
    } finally {
      setBusy(false);
    }
  };
  return { run, busy, flash, setFlash };
}
export const Flash = ({ flash }) => (flash ? <p className={flash.ok ? 'acct__msg' : 'field-error ad-flash'} role={flash.ok ? 'status' : 'alert'}>{flash.text}</p> : null);
