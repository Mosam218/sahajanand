import { useEffect, useRef, useState } from 'react';
import { Link, useLocation, useNavigate } from '../../router/index.jsx';
import { useApp } from '../../context/AppContext.jsx';
import { useCatalogue } from '../../hooks/useCatalogue.js';
import { useLockScroll } from '../../hooks/useLockScroll.js';
import { productImage, telHref } from '../../utils/format.js';
import Icon from '../Icon/Icon.jsx';
import Search from '../Search/Search.jsx';
import './Navbar.css';

// Wordmark: store name, with the brand it is an authorised reseller of
export function Logo() {
  return (
    <>
      <span className="logo__name">SAHAJANAND<i aria-hidden="true" /></span>
      <small className="logo__tag">Electronics · Authorised Elanpro reseller</small>
    </>
  );
}

const LINKS = [
  { to: '/solutions', label: 'Solutions' },
  { to: '/about', label: 'About' },
  { to: '/contact', label: 'Contact' },
];

export default function Navbar() {
  const { openQuote, compare, cartCount, setCartOpen, user, isAdmin, logout, settings } = useApp();
  const navigate = useNavigate();
  const [acct, setAcct] = useState(false);
  const acctRef = useRef(null);
  const { categories, counts } = useCatalogue();
  const { pathname } = useLocation();
  const [mega, setMega] = useState(false);
  const [drawer, setDrawer] = useState(false);
  const megaRef = useRef(null);

  useEffect(() => { setMega(false); setDrawer(false); setAcct(false); }, [pathname]);
  useEffect(() => {
    if (!acct) return;
    const key = (e) => e.key === 'Escape' && setAcct(false);
    const away = (e) => { if (!acctRef.current?.contains(e.target)) setAcct(false); };
    document.addEventListener('keydown', key); document.addEventListener('mousedown', away);
    return () => { document.removeEventListener('keydown', key); document.removeEventListener('mousedown', away); };
  }, [acct]);
  const signOut = async () => { setAcct(false); setDrawer(false); await logout(); navigate('/'); };
  const announcement = settings.announcement || `Authorised Elanpro reseller · ${settings.serviceAreas.join(' & ')}`;
  useEffect(() => {
    if (!mega) return;
    const key = (e) => e.key === 'Escape' && setMega(false);
    const away = (e) => { if (!megaRef.current?.contains(e.target)) setMega(false); };
    document.addEventListener('keydown', key);
    document.addEventListener('mousedown', away);
    return () => { document.removeEventListener('keydown', key); document.removeEventListener('mousedown', away); };
  }, [mega]);
  useLockScroll(drawer);

  return (
    <header className="nav">
      <div className="nav__util">
        <div className="wrap nav__util-in">
          <span>{announcement}</span>
          <span className="nav__util-contact">
            {settings.supportPhone && <a href={telHref(settings.supportPhone)}><Icon name="phone" size={14} /> {settings.supportPhone}</a>}
            {settings.supportEmail && <a href={`mailto:${settings.supportEmail}`}><Icon name="mail" size={14} /> {settings.supportEmail}</a>}
            {!settings.supportPhone && !settings.supportEmail && <Link to="/contact">Contact us</Link>}
          </span>
        </div>
      </div>

      <div className="wrap nav__main">
        <button className="nav__burger" onClick={() => setDrawer(true)} aria-label="Open menu" aria-expanded={drawer}>
          <Icon name="menu" size={24} />
        </button>
        <Link to="/" className="nav__logo" aria-label={`${settings.storeName} home`}>
          <Logo />
        </Link>
        <div className="nav__search"><Search /></div>
        <div className="nav__actions">
          <Link to="/compare" className="nav__compare">
            <Icon name="compare" size={18} /> Compare
            {compare.length > 0 && <span className="nav__count num">{compare.length}</span>}
          </Link>
          <div className="nav__acct" ref={acctRef}>
            <button className="nav__acct-btn" aria-expanded={acct} aria-haspopup="true" onClick={() => setAcct((a) => !a)} id="navbar-account-btn">
              <small>Hello, {user ? user.name.split(' ')[0] : 'sign in'}</small>
              <strong><span className="nav__acct-full">Account & Orders</span><span className="nav__acct-short">Account</span> <Icon name="down" size={14} /></strong>
            </button>
            {acct && (
              <div className="nav__acct-menu">
                {!user ? (
                  <div className="nav__acct-signin">
                    <Link to="/login" className="btn btn-primary btn-block">Sign in</Link>
                    <p>New customer? <Link to="/signup">Start here.</Link></p>
                  </div>
                ) : (
                  <p className="nav__acct-who"><strong>{user.name}</strong><span>{user.email}</span></p>
                )}
                <ul>
                  <li><Link to={user ? '/account' : '/login'}>Your account</Link></li>
                  <li><Link to={user ? '/account/orders' : '/login?next=/account/orders'}>Your orders</Link></li>
                  <li><Link to={user ? '/account/enquiries' : '/login?next=/account/enquiries'}>Your enquiries</Link></li>
                  <li><Link to={user ? '/account/addresses' : '/login?next=/account/addresses'}>Your addresses</Link></li>
                  {isAdmin && <li><Link to="/admin">Admin panel</Link></li>}
                  {user && <li><button onClick={signOut}>Sign out</button></li>}
                </ul>
              </div>
            )}
          </div>
          <button className="nav__cart" onClick={() => setCartOpen(true)} aria-label="Open cart" id="navbar-cart-btn">
            <Icon name="cart" size={20} />
            {cartCount > 0 && <span className="nav__count num">{cartCount}</span>}
          </button>
          <button className="btn btn-primary" onClick={() => openQuote()}>Request a quote</button>
        </div>
      </div>

      <nav className="nav__bar" aria-label="Main" ref={megaRef}>
        <div className="wrap nav__bar-in">
          <button className="nav__products" aria-expanded={mega} aria-controls="mega" onClick={() => setMega((m) => !m)}>
            <Icon name="menu" size={18} /> Products <Icon name="down" size={16} />
          </button>
          <ul className="nav__quick">
            {categories.slice(0, 7).map((c) => (
              <li key={c.slug}>
                <Link to={`/category/${c.slug}`} aria-current={pathname === `/category/${c.slug}` ? 'page' : undefined}>{c.shortName}</Link>
              </li>
            ))}
          </ul>
          <ul className="nav__links">
            {LINKS.map((l) => (
              <li key={l.to}><Link to={l.to} aria-current={pathname === l.to ? 'page' : undefined}>{l.label}</Link></li>
            ))}
          </ul>
        </div>

        {mega && (
          <div className="mega" id="mega">
            <div className="wrap">
              <ul className="mega__grid">
                {categories.map((c) => (
                  <li key={c.slug}>
                    <Link to={`/category/${c.slug}`} className="mega__item">
                      <span className="mega__thumb"><img src={productImage(c.image)} alt="" loading="lazy" /></span>
                      <span>
                        <strong>{c.name}</strong>
                        <small className="num">{counts[c.slug] || 0} products</small>
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
              <Link to="/products" className="text-link mega__all">Browse all products</Link>
            </div>
          </div>
        )}
      </nav>

      <div className="wrap nav__search-mobile"><Search /></div>

      {drawer && (
        <div className="drawer" role="dialog" aria-modal="true" aria-label="Menu">
          <div className="drawer__head">
            <span className="nav__logo"><Logo /></span>
            <button onClick={() => setDrawer(false)} aria-label="Close menu"><Icon name="close" size={24} /></button>
          </div>
          <div className="drawer__body">
            <p className="drawer__label">Products</p>
            <ul className="drawer__cats">
              {categories.map((c) => (
                <li key={c.slug}>
                  <Link to={`/category/${c.slug}`}>
                    {c.name} <span className="muted num">{counts[c.slug] || 0}</span>
                  </Link>
                </li>
              ))}
              <li><Link to="/products">All products</Link></li>
            </ul>
            <ul className="drawer__links">
              {LINKS.map((l) => <li key={l.to}><Link to={l.to}>{l.label}</Link></li>)}
              <li><Link to="/compare">Compare{compare.length > 0 ? ` (${compare.length})` : ''}</Link></li>
              {user ? (
                <>
                  <li><Link to="/account">Your account ({user.name.split(' ')[0]})</Link></li>
                  <li><Link to="/account/orders">Your orders</Link></li>
                  {isAdmin && <li><Link to="/admin">Admin panel</Link></li>}
                  <li><Link to="/" onClick={(e) => { e.preventDefault(); signOut(); }}>Sign out</Link></li>
                </>
              ) : (
                <li><Link to="/login">Sign in or create account</Link></li>
              )}
            </ul>
            <button className="btn btn-primary btn-block" onClick={() => { setDrawer(false); openQuote(); }}>Request a quote</button>
            {settings.supportPhone && <a className="drawer__phone" href={telHref(settings.supportPhone)}><Icon name="phone" size={16} /> {settings.supportPhone}</a>}
          </div>
        </div>
      )}
    </header>
  );
}
