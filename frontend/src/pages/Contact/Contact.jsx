import { Link } from '../../router/index.jsx';
import { useApp } from '../../context/AppContext.jsx';
import { useSeo } from '../../hooks/useSeo.js';
import { telHref } from '../../utils/format.js';
import QuoteForm from '../../components/QuoteModal/QuoteForm.jsx';
import Icon from '../../components/Icon/Icon.jsx';
import '../../components/QuoteModal/QuoteModal.css';
import './Contact.css';

export default function Contact() {
  const { settings } = useApp();
  const phones = [settings.supportPhone, settings.supportPhoneAlt].filter(Boolean);
  const areas = settings.serviceAreas.join(' and ');
  const hasDirect = phones.length > 0 || settings.supportEmail;
  useSeo({
    title: `Contact ${settings.storeName} | Elanpro refrigeration in ${areas}`,
    description: `Contact ${settings.storeName}, authorised Elanpro reseller in ${areas}, Gujarat. Send an enquiry for commercial refrigeration and get a quotation.`,
    path: '/contact',
  });

  return (
    <div className="wrap contact">
      <nav className="breadcrumbs" aria-label="Breadcrumb">
        <Link to="/">Home</Link><span aria-hidden="true">/</span><span>Contact</span>
      </nav>
      <div className="contact__grid">
        <div>
          <h1>Contact sales</h1>
          <p className="lede">
            {hasDirect
              ? 'Call us, write to us, or send an enquiry and our sales team will contact you.'
              : 'Send an enquiry with the model, quantity and your city, and our sales team will contact you.'}
          </p>
          {hasDirect && (
            <ul className="contact__list">
              {phones.map((p) => (
                <li key={p}><Icon name="phone" /><a href={telHref(p)}>{p}</a></li>
              ))}
              {settings.supportEmail && <li><Icon name="mail" /><a href={`mailto:${settings.supportEmail}`}>{settings.supportEmail}</a></li>}
            </ul>
          )}
          <dl className="contact__meta">
            <div><dt>Store</dt><dd>{settings.legalName || settings.storeName}</dd></div>
            <div><dt>Authorised reseller of</dt><dd>Elanpro commercial refrigeration</dd></div>
            <div><dt>Areas served</dt><dd>{areas}, Gujarat</dd></div>
            {settings.address && <div><dt>Address</dt><dd>{settings.address}</dd></div>}
            {settings.businessHours && <div><dt>Hours</dt><dd>{settings.businessHours}</dd></div>}
          </dl>
        </div>
        <div className="contact__form">
          <h2>Send an enquiry</h2>
          <QuoteForm />
        </div>
      </div>
    </div>
  );
}
