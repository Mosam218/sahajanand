import { Link } from '../../router/index.jsx';
import { productImage, sceneImage } from '../../utils/format.js';
import './CategoryCard.css';

export default function CategoryCard({ category, count, featured = false }) {
  return (
    <Link to={`/category/${category.slug}`} className={`ccard ${featured ? 'ccard--featured' : ''}`}>
      <div className="ccard__media">
        {featured && <img className="ccard__scene" src={sceneImage(category.scene)} alt="" loading="lazy" />}
        <img className="ccard__product" src={productImage(category.image)} alt="" loading="lazy" />
      </div>
      <div className="ccard__body">
        <p className="ccard__count num">{count} products</p>
        <h3>{category.name}</h3>
        <p className="ccard__desc">{category.description}</p>
        <span className="ccard__cta">Explore category</span>
      </div>
    </Link>
  );
}
