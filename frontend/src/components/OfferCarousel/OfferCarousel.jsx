import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from '../../router/index.jsx';
import { useApp } from '../../context/AppContext.jsx';
import { useCatalogue } from '../../hooks/useCatalogue.js';
import { productImage } from '../../utils/format.js';
import Icon from '../Icon/Icon.jsx';
import './OfferCarousel.css';

const INTERVAL = 6000;

export default function OfferCarousel() {
  const { openQuote, offers } = useApp();
  const { getProduct } = useCatalogue();
  const slides = offers.map((o) => ({ ...o, product: getProduct(o.productSlug) })).filter((s) => s.product);
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const touch = useRef(null);
  const reduced = typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

  const go = useCallback((i) => setIndex((i + slides.length) % slides.length), [slides.length]);
  useEffect(() => { if (index >= slides.length) setIndex(0); }, [index, slides.length]);

  useEffect(() => {
    if (paused || reduced || slides.length < 2) return;
    const t = setTimeout(() => go(index + 1), INTERVAL);
    return () => clearTimeout(t);
  }, [index, paused, reduced, go, slides.length]);

  const onTouchStart = (e) => { touch.current = e.touches[0].clientX; setPaused(true); };
  const onTouchEnd = (e) => {
    const dx = e.changedTouches[0].clientX - touch.current;
    if (Math.abs(dx) > 40) go(index + (dx < 0 ? 1 : -1));
    setPaused(false);
  };
  const onKey = (e) => {
    if (e.key === 'ArrowRight') go(index + 1);
    if (e.key === 'ArrowLeft') go(index - 1);
  };

  if (slides.length === 0) return null;

  return (
    <section
      className="offers" aria-roledescription="carousel" aria-label="Featured products"
      onMouseEnter={() => setPaused(true)} onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)} onBlur={() => setPaused(false)}
      onTouchStart={onTouchStart} onTouchEnd={onTouchEnd} onKeyDown={onKey}
    >
      <div className="offers__viewport">
        <div className="offers__track" style={{ transform: `translateX(-${index * 100}%)` }}>
          {slides.map((s, i) => (
            <article key={s.id} className="offers__slide" data-tone={s.tone}
              role="group" aria-roledescription="slide" aria-label={`${i + 1} of ${slides.length}`} aria-hidden={i !== index}>
              <div className="offers__copy">
                <p className="offers__badge">{s.badge}</p>
                <h2 className="offers__title">{s.title}</h2>
                <p className="offers__model">{s.product.model}, {s.product.name}</p>
                <p className="offers__sub">{s.subtitle}</p>
                <ul className="offers__facts num">{s.facts.map((f) => <li key={f}>{f}</li>)}</ul>
                <div className="offers__cta">
                  <Link to={`/product/${s.product.id}`} className="btn btn-primary" tabIndex={i === index ? 0 : -1}>{s.cta}</Link>
                  <button className="btn offers__quote" tabIndex={i === index ? 0 : -1} onClick={() => openQuote(s.product.model)}>Request quote</button>
                </div>
              </div>
              <Link to={`/product/${s.product.id}`} className="offers__image" tabIndex={-1} aria-hidden="true">
                <img src={productImage(s.product.image)} alt="" loading={i === 0 ? 'eager' : 'lazy'} />
              </Link>
            </article>
          ))}
        </div>
      </div>

      <div className="offers__controls">
        <button className="offers__arrow" onClick={() => go(index - 1)} aria-label="Previous slide"><Icon name="left" /></button>
        <div className="offers__dots">
          {slides.map((s, i) => (
            <button key={s.id} className="offers__dot" aria-label={`Go to slide ${i + 1}: ${s.title}`} aria-current={i === index} onClick={() => go(i)}>
              <span key={i === index ? `on-${index}` : 'off'} className={i === index && !reduced ? 'is-running' : ''}
                style={{ animationDuration: `${INTERVAL}ms`, animationPlayState: paused ? 'paused' : 'running' }} />
            </button>
          ))}
        </div>
        <span className="offers__pos num">{index + 1} / {slides.length}</span>
        <button className="offers__arrow" onClick={() => go(index + 1)} aria-label="Next slide"><Icon name="right" /></button>
      </div>
    </section>
  );
}
