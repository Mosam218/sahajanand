import { Link } from '../../router/index.jsx';
import { useApp } from '../../context/AppContext.jsx';
import { useCatalogue } from '../../hooks/useCatalogue.js';
import { telHref } from '../../utils/format.js';
import { POLICIES } from '../../data/policies.js';
import './Footer.css';

export default function Footer() {
  const { categories } = useCatalogue();
  const { openQuote, settings } = useApp();
  const half = Math.ceil(categories.length / 2);
  const phones = [settings.supportPhone, settings.supportPhoneAlt].filter(Boolean);
  const areas = settings.serviceAreas.join(' and ');
  // Only policies the business has published are linked
  const policies = POLICIES.filter(([key]) => settings.policies?.[key]);
  return (
    <footer className="footer">
      <div className="wrap footer__grid">
        <div className="footer__brand">
          <p className="footer__logo">SAHAJANAND<span aria-hidden="true" /></p>
          <p>{settings.legalName || settings.storeName}</p>
          <p>Authorised Elanpro reseller for commercial refrigeration, serving {areas}, Gujarat.</p>
          <button className="btn btn-light" onClick={() => openQuote()}>Request a quote</button>
        </div>
        <nav aria-label="Product categories">
          <h3>Products</h3>
          <div className="footer__cols">
            <ul>{categories.slice(0, half).map((c) => <li key={c.slug}><Link to={`/category/${c.slug}`}>{c.name}</Link></li>)}</ul>
            <ul>
              {categories.slice(half).map((c) => <li key={c.slug}><Link to={`/category/${c.slug}`}>{c.name}</Link></li>)}
              <li><Link to="/products">All products</Link></li>
            </ul>
          </div>
        </nav>
        <nav aria-label="Company">
          <h3>Company</h3>
          <ul>
            <li><Link to="/about">About us</Link></li>
            <li><Link to="/solutions">Solutions by industry</Link></li>
            <li><Link to="/compare">Compare products</Link></li>
            <li><Link to="/contact">Contact sales</Link></li>
            <li><Link to="/account/orders">Track your order</Link></li>
          </ul>
        </nav>
        <div>
          <h3>Customer care</h3>
          <ul>
            {phones.map((p) => <li key={p}><a href={telHref(p)}>{p}</a></li>)}
            {settings.supportEmail && <li><a href={`mailto:${settings.supportEmail}`}>{settings.supportEmail}</a></li>}
            {settings.address && <li>{settings.address}</li>}
            {settings.businessHours && <li>{settings.businessHours}</li>}
            {phones.length === 0 && !settings.supportEmail && <li><Link to="/contact">Send us an enquiry</Link></li>}
          </ul>
        </div>
      </div>
      {policies.length > 0 && (
        <nav className="wrap footer__policies" aria-label="Policies">
          {policies.map(([key, label]) => <Link key={key} to={`/policies/${key}`}>{label}</Link>)}
        </nav>
      )}
      <div className="wrap footer__legal">
        <p>© {new Date().getFullYear()} {settings.legalName || settings.storeName}{settings.gstin && ` · GSTIN ${settings.gstin}`}</p>
        <p>Elanpro is a brand of its respective owner. Specifications, features and colours are subject to change without notice.</p>
      </div>
    </footer>
  );
}
