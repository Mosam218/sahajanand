import { useEffect, useState } from 'react';
import { useApp, MAX_PER_ITEM } from '../../context/AppContext.jsx';
import { Link, useNavigate } from '../../router/index.jsx';
import { useLockScroll } from '../../hooks/useLockScroll.js';
import { fmtPrice, productImage } from '../../utils/format.js';
import Icon from '../Icon/Icon.jsx';
import './CartDrawer.css';

export default function CartDrawer() {
  const {
    cart, cartOpen, setCartOpen, cartBusy,
    removeFromCart, updateQty, clearCart,
    cartSubtotal, cartDiscount, cartTotal, cartCount, totals,
    appliedCoupon, applyCoupon, removeCoupon, couponError, user, settings,
  } = useApp();

  const [couponInput, setCouponInput] = useState('');
  const navigate = useNavigate();
  useLockScroll(cartOpen);

  useEffect(() => {
    if (!cartOpen) return undefined;
    const onKey = (e) => e.key === 'Escape' && setCartOpen(false);
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [cartOpen, setCartOpen]);

  const canCheckout = cart.some((i) => !i.unavailable);
  const checkout = () => { setCartOpen(false); navigate(user ? '/checkout' : '/login?next=/checkout'); };
  const handleApplyCoupon = () => applyCoupon(couponInput);

  if (!cartOpen) return null;

  return (
    <>
      <div className="cart-overlay" onClick={() => setCartOpen(false)} aria-hidden="true" />
      <aside className="cart-drawer" role="dialog" aria-modal="true" aria-label="Shopping cart">
        <div className="cart-drawer__head">
          <h2 className="cart-drawer__title">
            <Icon name="cart" size={20} />
            Cart
            {cartCount > 0 && <span className="cart-drawer__count">{cartCount}</span>}
          </h2>
          <button className="cart-drawer__close" onClick={() => setCartOpen(false)} aria-label="Close cart">
            <Icon name="close" size={22} />
          </button>
        </div>

        {cart.length === 0 ? (
          <div className="cart-drawer__empty">
            <div className="cart-empty-icon" aria-hidden="true"><Icon name="cart" size={40} /></div>
            <p>Your cart is empty</p>
            <button className="btn btn-primary btn-sm" onClick={() => { setCartOpen(false); navigate('/products'); }}>Browse products</button>
          </div>
        ) : (
          <>
            <div className="cart-drawer__items" aria-busy={cartBusy}>
              {cart.map((item) => (
                <div key={item.id} className={`cart-item ${item.unavailable ? 'cart-item--off' : ''}`}>
                  <div className="cart-item__img">
                    <img src={productImage(item.image)} alt="" loading="lazy" />
                  </div>
                  <div className="cart-item__info">
                    <Link to={`/product/${item.id}`} className="cart-item__model" onClick={() => setCartOpen(false)}>{item.model}</Link>
                    {item.name && <p className="cart-item__name">{item.name}</p>}
                    <p className="cart-item__price">{fmtPrice(item.price)}</p>
                    {item.unavailable && <p className="cart-item__warn">No longer available. Remove it to check out.</p>}
                    {item.exceedsStock && <p className="cart-item__warn">Only {item.stock} in stock. Reduce the quantity.</p>}
                    <div className="cart-item__qty">
                      <button
                        className="qty-btn"
                        onClick={() => updateQty(item.id, item.qty - 1)}
                        aria-label={`Decrease quantity of ${item.model}`}
                        disabled={item.qty <= 1 || cartBusy}
                      >−</button>
                      <span className="qty-val num">{item.qty}</span>
                      <button
                        className="qty-btn"
                        onClick={() => updateQty(item.id, item.qty + 1)}
                        aria-label={`Increase quantity of ${item.model}`}
                        disabled={item.unavailable || cartBusy || item.qty >= Math.min(item.stock, MAX_PER_ITEM)}
                      >+</button>
                      <button
                        className="cart-item__remove"
                        onClick={() => removeFromCart(item.id)}
                        aria-label={`Remove ${item.model} from cart`}
                        disabled={cartBusy}
                      >
                        <Icon name="close" size={14} />
                      </button>
                    </div>
                  </div>
                  <p className="cart-item__subtotal">{item.unavailable ? '—' : fmtPrice(item.price * item.qty)}</p>
                </div>
              ))}
            </div>

            {/* Coupon Section */}
            <div className="cart-drawer__coupon">
              <p className="cart-drawer__coupon-label">Have a coupon?</p>
              {appliedCoupon ? (
                <div className="coupon-applied">
                  <span className="coupon-applied__badge"><Icon name="tag" size={14} /> {appliedCoupon.code}</span>
                  <span className="coupon-applied__desc">You save {fmtPrice(cartDiscount)}</span>
                  <button className="coupon-applied__remove" onClick={removeCoupon} aria-label="Remove coupon">
                    <Icon name="close" size={14} />
                  </button>
                </div>
              ) : (
                <div className="coupon-input-row">
                  <input
                    className="input coupon-input"
                    type="text"
                    placeholder="Enter coupon code"
                    aria-label="Coupon code"
                    value={couponInput}
                    onChange={(e) => setCouponInput(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleApplyCoupon()}
                    id="cart-coupon-input"
                    maxLength={30}
                  />
                  <button className="btn btn-ghost btn-sm" onClick={handleApplyCoupon}>Apply</button>
                </div>
              )}
              {couponError && <p className="cart-coupon-error" role="alert">{couponError}</p>}
            </div>

            {/* Order Summary */}
            <div className="cart-drawer__summary">
              {totals && (
                <div className="summary-row">
                  <span>Subtotal</span>
                  <span className="num">{fmtPrice(cartSubtotal)}</span>
                </div>
              )}
              {cartDiscount > 0 && (
                <div className="summary-row summary-row--discount">
                  <span>Discount ({appliedCoupon?.code})</span>
                  <span className="num">−{fmtPrice(cartDiscount)}</span>
                </div>
              )}
              {totals && totals.taxAmount > 0 && (
                <div className="summary-row">
                  <span>GST ({totals.gstPercent}%)</span>
                  <span className="num">{fmtPrice(totals.taxAmount)}</span>
                </div>
              )}
              {totals && (
                <div className="summary-row">
                  <span>Delivery</span>
                  <span className="num">{totals.deliveryCharge ? fmtPrice(totals.deliveryCharge) : 'Free'}</span>
                </div>
              )}
              <div className="summary-row summary-row--total">
                <span>{totals ? 'Total' : 'Subtotal'}</span>
                <span className="num">{fmtPrice(totals ? totals.totalAmount : cartTotal)}</span>
              </div>
              <p className="cart-drawer__note">
                {totals
                  ? (settings.gstInclusive ? 'Prices include GST.' : 'GST and delivery included above.')
                  : `${settings.gstInclusive ? 'Prices include GST.' : `GST (${settings.gstPercent}%) is added at checkout.`} Delivery is calculated at checkout.`}
              </p>
            </div>

            <div className="cart-drawer__actions">
              <button className="btn btn-primary btn-block" id="cart-checkout-btn" onClick={checkout} disabled={!canCheckout}>
                {user ? 'Proceed to checkout' : 'Sign in to check out'}
              </button>
              <button className="btn btn-ghost btn-block btn-sm cart-drawer__clear" onClick={clearCart}>
                Clear cart
              </button>
            </div>
          </>
        )}
      </aside>
    </>
  );
}
