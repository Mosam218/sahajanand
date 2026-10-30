import { useState } from 'react';
import { useApp } from '../../context/AppContext.jsx';
import Icon from '../Icon/Icon.jsx';
import { fmtPrice } from '../../utils/format.js';

const couponLabel = (c) => (c.discountType === 'percent' ? `${c.discountValue}% Off` : `${fmtPrice(c.discountValue)} Off`);
import './CouponsSection.css';

const COUPON_COLORS = [
  { bg: '#0a2f4b', accent: '#d9480f' },
  { bg: '#1668a8', accent: '#ffffff' },
  { bg: '#d9480f', accent: '#ffffff' },
  { bg: '#1d7a4d', accent: '#ffffff' },
  { bg: '#4b3fa8', accent: '#ffffff' },
];

export default function CouponsSection() {
  const { COUPONS } = useApp();
  const [copied, setCopied] = useState(null);

  const handleCopy = (code) => {
    navigator.clipboard.writeText(code).catch(() => {});
    setCopied(code);
    setTimeout(() => setCopied(null), 2000);
  };

  if (COUPONS.length === 0) return null;
  return (
    <section className="section wrap coupons-section" id="coupons">
      <div className="section-head">
        <div>
          <h2>Current offers</h2>
          <p className="lede">Copy a coupon code and apply it in your cart.</p>
        </div>
      </div>
      <div className="coupons-grid">
        {COUPONS.map((coupon, idx) => {
          const colors = COUPON_COLORS[idx % COUPON_COLORS.length];
          const isCopied = copied === coupon.code;
          return (
            <div
              key={coupon.code}
              className="coupon-card"
              style={{ '--coupon-bg': colors.bg, '--coupon-accent': colors.accent }}
            >
              <div className="coupon-card__left">
                <div className="coupon-card__icon">
                  <Icon name="tag" size={28} />
                </div>
                <div className="coupon-card__label">{couponLabel(coupon)}</div>
              </div>
              <div className="coupon-card__body">
                <p className="coupon-card__desc">{coupon.description || couponLabel(coupon)}</p>
                {coupon.minOrderValue > 0 && (
                  <p className="coupon-card__min">Min. order: {fmtPrice(coupon.minOrderValue)}</p>
                )}
                {coupon.discountType === 'percent' && coupon.maxDiscount > 0 && (
                  <p className="coupon-card__min">Up to {fmtPrice(coupon.maxDiscount)} off</p>
                )}
                {coupon.category && (
                  <p className="coupon-card__cat">
                    Valid for: <strong>{coupon.category.name}</strong>
                  </p>
                )}
              </div>
              <div className="coupon-card__right">
                <button
                  className={`coupon-copy-btn ${isCopied ? 'coupon-copy-btn--copied' : ''}`}
                  onClick={() => handleCopy(coupon.code)}
                  id={`copy-coupon-${coupon.code}`}
                  title="Copy coupon code"
                >
                  <span className="coupon-code">{coupon.code}</span>
                  <span className="coupon-copy-label">
                    {isCopied ? (
                      <><Icon name="check" size={14} /> Copied!</>
                    ) : (
                      'TAP TO COPY'
                    )}
                  </span>
                </button>
              </div>
            </div>
          );
        })}
      </div>
      <p className="coupons-section__note">
        Sign in and apply the code in your cart. One coupon per order.
      </p>
    </section>
  );
}
