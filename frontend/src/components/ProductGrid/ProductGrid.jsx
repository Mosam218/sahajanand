import ProductCard from '../ProductCard/ProductCard.jsx';
import './ProductGrid.css';

export default function ProductGrid({ products, columns }) {
  return (
    <div className="pgrid" data-columns={columns}>
      {products.map((p) => <ProductCard key={p.id} product={p} />)}
    </div>
  );
}
