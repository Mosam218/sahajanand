import { Link } from '../../router/index.jsx';
import { useApp } from '../../context/AppContext.jsx';
import { useCatalogue } from '../../hooks/useCatalogue.js';
import { useSeo } from '../../hooks/useSeo.js';
import { sceneImage, telHref } from '../../utils/format.js';
import './About.css';

// Only facts about this store are stated here. Anything the business has not
// supplied (history, team, certifications) is deliberately left out.
export default function About() {
  const { openQuote, settings } = useApp();
  const { categories, products } = useCatalogue();
  const areas = settings.serviceAreas.join(' and ');
  useSeo({
    title: `About ${settings.storeName} | Authorised Elanpro reseller`,
    description: `${settings.storeName} is an authorised reseller of Elanpro commercial refrigeration, serving ${areas}, Gujarat.`,
    path: '/about',
  });

  return (
    <div className="wrap about">
      <nav className="breadcrumbs" aria-label="Breadcrumb">
        <Link to="/">Home</Link><span aria-hidden="true">/</span><span>About</span>
      </nav>
      <header className="about__head">
        <h1>{settings.storeName}: your authorised Elanpro reseller in {areas}.</h1>
      </header>
      <div className="about__grid">
        <img src={sceneImage('chef')} alt="A chef plating food in a professional kitchen" />
        <div className="about__text">
          <p>We supply Elanpro commercial refrigeration to kitchens, bars, retailers and institutions across {areas}, Gujarat.</p>
          <p>Browse {products.length} models across {categories.length} product lines with full specifications, order the models in stock online, or ask us for a quotation for your project.</p>
          <ul className="about__list">
            {categories.map((c) => <li key={c.slug}><Link to={`/category/${c.slug}`}>{c.name}</Link></li>)}
          </ul>
          <div className="about__cta">
            <button className="btn btn-primary" onClick={() => openQuote()}>Request a quote</button>
            <Link to="/contact" className="btn btn-ghost">Contact us</Link>
          </div>
        </div>
      </div>

      <dl className="about__facts">
        <div><dt>Authorised reseller of</dt><dd>Elanpro</dd></div>
        <div><dt>Areas served</dt><dd>{areas}, Gujarat</dd></div>
        {settings.address && <div><dt>Address</dt><dd>{settings.address}</dd></div>}
        {settings.supportPhone && <div><dt>Phone</dt><dd><a href={telHref(settings.supportPhone)}>{settings.supportPhone}</a></dd></div>}
        {settings.businessHours && <div><dt>Hours</dt><dd>{settings.businessHours}</dd></div>}
        {settings.gstin && <div><dt>GSTIN</dt><dd className="num">{settings.gstin}</dd></div>}
      </dl>
    </div>
  );
}
