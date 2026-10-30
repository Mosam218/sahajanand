import { Link } from '../../router/index.jsx';
import { useApp } from '../../context/AppContext.jsx';
import { productImage, fmtPrice } from '../../utils/format.js';
import { keySpecs } from '../../utils/specs.js';
import TempScale from '../TempScale/TempScale.jsx';
import Icon from '../Icon/Icon.jsx';
import './ProductCard.css';

export default function ProductCard({ product }) {
  const { openQuote, compare, toggleCompare, addToCart } = useApp();
  const selected = compare.includes(product.id);
  const specs = keySpecs(product, 2);
  const href = `/product/${product.id}`;
  const soldOut = product.stock === 0;

  return (
    <article className="pcard">
      <div className="pcard__media">
        <Link to={href} tabIndex={-1} aria-hidden="true">
          <img src={productImage(product.image)} alt="" loading="lazy" decoding="async" />
        </Link>
        {soldOut && <span className="pcard__flag">Out of stock</span>}
        <button
          className="pcard__compare"
          aria-pressed={selected}
          onClick={() => toggleCompare(product.id)}
          title={selected ? 'Remove from comparison' : 'Add to comparison'}
        >
          <Icon name={selected ? 'check' : 'compare'} size={16} />
          <span>{selected ? 'Comparing' : 'Compare'}</span>
        </button>
      </div>
      <div className="pcard__body">
        <p className="pcard__sub">{product.subcategory}</p>
        <h3 className="pcard__model"><Link to={href}>{product.model}</Link></h3>
        <p className="pcard__name">{product.name}</p>
        <dl className="pcard__specs">
          {specs.map((s) => (
            <div key={s.label}>
              <dt>{s.label}</dt>
              <dd className="num">{s.value}</dd>
            </div>
          ))}
        </dl>
        <TempScale temp={product.temp} tempClass={product.tempClass} />
        {product.badges.length > 0 && (
          <ul className="pcard__badges">
            {product.badges.slice(0, 3).map((b) => <li key={b} className="badge">{b}</li>)}
          </ul>
        )}
        {product.price > 0 && (
          <p className="pcard__price">
            {fmtPrice(product.price)}
            {product.mrp > product.price && <s className="pcard__mrp">{fmtPrice(product.mrp)}</s>}
          </p>
        )}
      </div>
      <div className="pcard__actions">
        <Link to={href} className="btn btn-ghost btn-sm">View details</Link>
        <button
          className="btn btn-cart btn-sm"
          onClick={() => addToCart(product)}
          id={`add-to-cart-${product.id}`}
          title={soldOut ? 'Out of stock' : 'Add to cart'}
          disabled={soldOut}
        >
          <Icon name="cart" size={15} />
          {soldOut ? 'Out of stock' : 'Add to Cart'}
        </button>
      </div>
      <button
        className="btn btn-quote-sm"
        onClick={() => openQuote(product.model)}
        title="Request a quote"
      >
        Request quote
      </button>
    </article>
  );
}
