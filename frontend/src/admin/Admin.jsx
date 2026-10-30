// Admin panel shell: its own layout (no storefront header/footer), a sign-in
// screen, and a guard so only admin accounts see it. The guard here is for
// convenience only: every admin API call is authorised again on the server.
import { useCallback, useEffect, useState } from 'react';
import { Link, matchPath, useLocation, useNavigate } from '../router/index.jsx';
import { useApp } from '../context/AppContext.jsx';
import { api } from '../services/api.js';
import Icon from '../components/Icon/Icon.jsx';
import { Loading } from '../components/State/State.jsx';
import Dashboard from './Dashboard.jsx';
import ProductsAdmin from './ProductsAdmin.jsx';
import { CategoriesAdmin, CouponsAdmin, OffersAdmin } from './CatalogAdmin.jsx';
import { OrdersAdmin, EnquiriesAdmin, CustomersAdmin } from './SalesAdmin.jsx';
import { SettingsAdmin, ActivityAdmin } from './SettingsAdmin.jsx';
import { GoogleButton } from '../pages/Auth/Auth.jsx';
import '../pages/Account/Account.css';
import '../pages/Auth/Auth.css';
import './admin.css';

const NAV = [
  ['Overview', [['/admin', 'Dashboard', Dashboard]]],
  ['Sales', [['/admin/orders', 'Orders', OrdersAdmin], ['/admin/enquiries', 'Enquiries', EnquiriesAdmin], ['/admin/customers', 'Customers', CustomersAdmin]]],
  ['Catalogue', [['/admin/products', 'Products & stock', ProductsAdmin], ['/admin/categories', 'Categories', CategoriesAdmin]]],
  ['Marketing', [['/admin/coupons', 'Coupons', CouponsAdmin], ['/admin/banners', 'Homepage banners', OffersAdmin]]],
  ['System', [['/admin/settings', 'Settings', SettingsAdmin], ['/admin/activity', 'Activity log', ActivityAdmin]]],
];
const PAGES = NAV.flatMap(([, items]) => items);

const Logo = ({ className }) => <p className={className}>SAHAJANAND<span aria-hidden="true" /> <small>Admin</small></p>;

function AdminLogin() {
  const { login, loginWithGoogle, logout, authConfigured } = useApp();
  const [email, setEmail] = useState('');
  const [pw, setPw] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const checkRole = async (user) => {
    if (!['admin', 'superadmin'].includes(user.role)) {
      await logout();
      setError('This account does not have admin access.');
    }
  };

  const submit = async (e) => {
    e.preventDefault();
    if (!email.trim() || !pw) return setError('Enter your admin email and password.');
    setBusy(true);
    const res = await login(email, pw, { remember: true });
    setBusy(false);
    if (!res.ok) return setError(res.error);
    await checkRole(res.user);
  };

  const handleGoogle = async () => {
    setBusy(true); setError('');
    const res = await loginWithGoogle();
    setBusy(false);
    if (!res.ok) return setError(res.error);
    await checkRole(res.user);
  };

  return (
    <div className="ad-login">
      <form onSubmit={submit} noValidate>
        <Logo className="ad-login__logo" />
        <h1>Admin sign in</h1>
        {!authConfigured && <p className="field-error" role="alert">Sign-in is not configured for this site yet.</p>}

        <GoogleButton onClick={handleGoogle} busy={busy || !authConfigured} text="Sign in with Google" />

        <div className="auth__divider"><span>or with password</span></div>

        <div className="field"><label htmlFor="al-id">Admin email</label><input id="al-id" className="input" type="email" value={email} onChange={(e) => { setEmail(e.target.value); setError(''); }} autoComplete="username" autoFocus /></div>
        <div className="field"><label htmlFor="al-pw">Password</label><input id="al-pw" className="input" type="password" value={pw} onChange={(e) => { setPw(e.target.value); setError(''); }} autoComplete="current-password" /></div>
        {error && <p className="field-error" role="alert">{error}</p>}
        <button className="btn btn-primary btn-block" disabled={busy || !authConfigured}>{busy ? 'Signing in…' : 'Sign in to admin'}</button>
        <Link to="/" className="auth__link">Back to the storefront</Link>
      </form>
    </div>
  );
}

export default function Admin() {
  const { user, isAdmin, authReady, logout } = useApp();
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const [menu, setMenu] = useState(false);
  const [badges, setBadges] = useState({});
  useEffect(() => { setMenu(false); }, [pathname]);
  useEffect(() => {
    document.title = 'Admin | Sahajanand Electronics';
    let robots = document.head.querySelector('meta[name="robots"]');
    if (!robots) { robots = document.createElement('meta'); robots.name = 'robots'; document.head.appendChild(robots); }
    robots.content = 'noindex, nofollow';
  }, [pathname]);
  useEffect(() => { if (isAdmin && pathname === '/admin/login') navigate('/admin', { replace: true }); }, [isAdmin, pathname, navigate]);

  // Counts shown next to the menu items
  const refreshBadges = useCallback(() => {
    api.admin.dashboard()
      .then((d) => setBadges({ '/admin/orders': d.pendingOrders, '/admin/enquiries': d.newEnquiries, '/admin/products': d.lowStockCount + d.outOfStockCount }))
      .catch(() => {}); // badges are a convenience; each page reports its own errors
  }, []);
  useEffect(() => { if (isAdmin) refreshBadges(); }, [isAdmin, pathname, refreshBadges]);

  if (!authReady) return <div className="ad-login"><div className="ad-login__denied"><Loading label="Checking your sign-in" /></div></div>;

  if (!isAdmin) {
    if (user) {
      return (
        <div className="ad-login"><div className="ad-login__denied">
          <h1>No admin access</h1>
          <p>You are signed in as {user.email}, which is a customer account. Sign out and use an admin account.</p>
          <button className="btn btn-primary" onClick={logout}>Sign out and switch account</button>
          <Link to="/" className="auth__link">Back to the storefront</Link>
        </div></div>
      );
    }
    return <AdminLogin />;
  }

  const path = pathname.replace(/\/$/, '') || '/admin';
  const Page = PAGES.find(([to]) => matchPath(to, path))?.[2];

  return (
    <div className={`ad ${menu ? 'is-menu' : ''}`}>
      <aside className="ad-side">
        <Link to="/admin" className="ad-side__logo">SAHAJANAND<span aria-hidden="true" /> <small>Admin</small></Link>
        <nav aria-label="Admin">
          {NAV.map(([group, items]) => (
            <div key={group}>
              <p>{group}</p>
              <ul>{items.map(([to, label]) => (
                <li key={to}><Link to={to} aria-current={path === to ? 'page' : undefined}>{label}{badges[to] > 0 && <span className="num">{badges[to]}</span>}</Link></li>
              ))}</ul>
            </div>
          ))}
        </nav>
        <div className="ad-side__foot">
          <Link to="/">View storefront</Link>
          <button onClick={async () => { await logout(); navigate('/admin/login'); }}>Sign out</button>
        </div>
      </aside>
      <div className="ad-main">
        <header className="ad-top">
          <button className="ad-top__burger" onClick={() => setMenu((m) => !m)} aria-label="Toggle menu" aria-expanded={menu}><Icon name="menu" /></button>
          <span className="ad-top__crumb">{PAGES.find(([to]) => to === path)?.[1] || 'Not found'}</span>
          <span className="ad-top__user"><strong>{user.name}</strong><small>{user.role === 'superadmin' ? 'Super admin' : 'Admin'} · {user.email}</small></span>
        </header>
        <main className="ad-content" key={path}>
          {Page ? <Page /> : <div className="empty"><h1 style={{ fontSize: 'var(--fs-4)' }}>This admin page does not exist</h1><Link to="/admin" className="btn btn-primary">Go to the dashboard</Link></div>}
        </main>
      </div>
    </div>
  );
}
