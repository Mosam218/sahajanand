import { useEffect, useRef } from 'react';
import { useApp } from '../../context/AppContext.jsx';
import { useCatalogue } from '../../hooks/useCatalogue.js';
import { useLockScroll } from '../../hooks/useLockScroll.js';
import { productImage } from '../../utils/format.js';
import Icon from '../Icon/Icon.jsx';
import QuoteForm from './QuoteForm.jsx';
import './QuoteModal.css';

export default function QuoteModal() {
  const { quote, closeQuote } = useApp();
  const { getByModel } = useCatalogue();
  const panel = useRef(null);
  useLockScroll(quote.open);

  useEffect(() => {
    if (!quote.open) return;
    const previous = document.activeElement;
    panel.current?.querySelector('input')?.focus();
    const onKey = (e) => {
      if (e.key === 'Escape') closeQuote();
      if (e.key !== 'Tab') return;
      const focusable = panel.current.querySelectorAll('button, input, textarea, select, a[href]');
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    };
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('keydown', onKey); previous?.focus?.(); };
  }, [quote.open, closeQuote]);

  if (!quote.open) return null;
  const product = quote.model ? getByModel(quote.model) : null;

  return (
    <div className="modal" onMouseDown={(e) => e.target === e.currentTarget && closeQuote()}>
      <div className="modal__panel" role="dialog" aria-modal="true" aria-labelledby="quote-title" ref={panel}>
        <header className="modal__head">
          <div>
            <h2 id="quote-title">Request a quote</h2>
            <p className="muted">Share a few details and our sales team will get back to you.</p>
          </div>
          <button className="modal__close" onClick={closeQuote} aria-label="Close"><Icon name="close" /></button>
        </header>
        {product && (
          <div className="modal__product">
            <img src={productImage(product.image)} alt="" />
            <div>
              <strong>{product.model}</strong>
              <span className="muted">{product.name}</span>
            </div>
          </div>
        )}
        <QuoteForm key={quote.model} initialProduct={quote.model} onDone={closeQuote} />
      </div>
    </div>
  );
}
