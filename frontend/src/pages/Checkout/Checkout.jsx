import { useEffect, useState } from 'react';
import { Link, useNavigate } from '../../router/index.jsx';
import { useApp, MAX_PER_ITEM } from '../../context/AppContext.jsx';
import { useAsync } from '../../hooks/useAsync.js';
import { useSeo } from '../../hooks/useSeo.js';
import { api } from '../../services/api.js';
import { payWithRazorpay } from '../../services/razorpay.js';
import { fmtPrice, productImage } from '../../utils/format.js';
import { AddressForm } from '../Account/Account.jsx';
import { Loading, ErrorState } from '../../components/State/State.jsx';
import './Checkout.css';

const METHODS = [
  { key: 'razorpay', label: 'Pay online', hint: 'UPI, cards, net banking and wallets through Razorpay.' },
];

export default function Checkout() {
  const {
    user, authReady, cart, cartBusy, totals, settings, appliedCoupon, couponCode,
    updateQty, removeFromCart, refreshCart, reloadCatalogue,
  } = useApp();
  const navigate = useNavigate();
  const { data: addresses, loading: loadingAddresses, error: addressError, reload: reloadAddresses, setData: setAddresses } =
    useAsync(() => api.addresses(), [user?._id], { enabled: Boolean(user) });
  const [addrId, setAddrId] = useState(null);
  const [adding, setAdding] = useState(false);
  const [method, setMethod] = useState('');
  const [note, setNote] = useState('');
  const [error, setError] = useState('');
  const [itemErrors, setItemErrors] = useState([]);
  const [placing, setPlacing] = useState(false);
  useSeo({ title: `Checkout | ${settings.storeName}`, noindex: true });

  useEffect(() => { if (authReady && !user) navigate('/login?next=/checkout', { replace: true }); }, [authReady, user, navigate]);
  useEffect(() => {
    if (addresses && !addresses.some((a) => a._id === addrId)) setAddrId((addresses.find((a) => a.isDefault) || addresses[0])?._id || null);
  }, [addresses, addrId]);

  const available = METHODS.filter((m) => settings.paymentMethods[m.key]);
  useEffect(() => {
    if (!available.some((m) => m.key === method)) setMethod(available[0]?.key || '');
  }, [available, method]);

  if (!authReady) return <div className="wrap"><Loading label="Loading checkout" /></div>;
  if (!user) return null;

  if (cart.length === 0 && !placing) {
    return <div className="wrap section"><div className="empty"><h1 style={{ fontSize: 'var(--fs-4)' }}>Your cart is empty</h1><p className="muted">Add products to your cart to check out.</p><Link to="/products" className="btn btn-primary">Browse products</Link></div></div>;
  }

  const address = addresses?.find((a) => a._id === addrId);
  const blocked = cart.filter((i) => i.unavailable || i.exceedsStock);

  const saveAddr = async (a) => {
    const created = await api.createAddress(a);
    setAddresses(await api.addresses());
    setAddrId(created._id); setAdding(false); setError('');
  };

  const submit = async () => {
    setError(''); setItemErrors([]);
    if (!address) return setError('Choose or add a delivery address to place the order.');
    if (!method) return setError('No payment method is available right now. Please contact us to place this order.');
    if (blocked.length) return setError('Some items in your cart are not available in the quantity chosen. Update them to continue.');

    setPlacing(true);
    try {
      const { order, razorpay } = await api.checkout({
        addressId: address._id,
        paymentMethod: method,
        couponCode: appliedCoupon ? couponCode : undefined,
        notes: note.trim(),
      });

      let payment = '';
      if (razorpay) {
        const result = await payWithRazorpay(razorpay, {
          name: settings.storeName,
          orderNumber: order.orderNumber,
          customer: { name: user.name, email: user.email, phone: address.phone || user.phone },
        });
        payment = result.status; // paid | dismissed | failed
      }

      // Stock and the cart changed on the server
      refreshCart(); reloadCatalogue();
      navigate(`/order/${order._id}${payment && payment !== 'paid' ? '?payment=incomplete' : ''}`, { replace: true });
    } catch (err) {
      // "Some items have issues": the server lists each one
      if (err.errors?.length && err.errors[0].productId) setItemErrors(err.errors.map((e) => e.message));
      setError(err.message);
      refreshCart();
      setPlacing(false);
    }
  };

  const count = cart.reduce((n, i) => n + i.qty, 0);

  return (
    <div className="wrap co">
      <nav className="breadcrumbs" aria-label="Breadcrumb"><Link to="/">Home</Link><span aria-hidden="true">/</span><span>Checkout</span></nav>
      <h1>Checkout</h1>
      <div className="co__grid">
        <div className="co__steps">
          <section className="co__step">
            <h2><span>1</span> Delivery address</h2>
            {loadingAddresses && !addresses && <Loading compact label="Loading your addresses" />}
            {addressError && !addresses && <ErrorState error={addressError} onRetry={reloadAddresses} title="Your addresses could not be loaded" />}
            {addresses && (
              <>
                {addresses.map((a) => (
                  <label key={a._id} className={`co__opt ${addrId === a._id ? 'is-on' : ''}`}>
                    <input type="radio" name="addr" checked={addrId === a._id} onChange={() => { setAddrId(a._id); setError(''); }} />
                    <span><strong>{a.fullName}</strong> {a.line1}{a.line2 && `, ${a.line2}`}{a.landmark && `, ${a.landmark}`}, {a.city}, {a.state} {a.pincode}. Phone: {a.phone}</span>
                  </label>
                ))}
                {adding || addresses.length === 0
                  ? <AddressForm initial={{ fullName: user.name, phone: user.phone }} onSave={saveAddr} onCancel={addresses.length ? () => setAdding(false) : undefined} />
                  : <button className="auth__link" onClick={() => setAdding(true)}>+ Add a new address</button>}
              </>
            )}
            <p className="muted co__small">We deliver in {settings.serviceAreas.join(' and ')}. For other locations, please contact us before ordering.</p>
          </section>

          <section className="co__step">
            <h2><span>2</span> Payment method</h2>
            {available.length === 0 && <p className="field-error" role="alert">No payment method is available right now. Please contact us to place this order.</p>}
            {available.map((m) => (
              <label key={m.key} className={`co__opt ${method === m.key ? 'is-on' : ''}`}>
                <input type="radio" name="pay" checked={method === m.key} onChange={() => setMethod(m.key)} />
                <span><strong>{m.label}</strong> {m.hint}</span>
              </label>
            ))}
          </section>

          <section className="co__step">
            <h2><span>3</span> Review items</h2>
            <ul className="co__items" aria-busy={cartBusy}>
              {cart.map((i) => (
                <li key={i.id}>
                  <img src={productImage(i.image)} alt="" />
                  <div>
                    <strong>{i.model}</strong>
                    {i.name && <span>{i.name}</span>}
                    <span className="num">{fmtPrice(i.price)} each</span>
                    {i.unavailable && <span className="field-error">No longer available. Remove it to continue.</span>}
                    {i.exceedsStock && <span className="field-error">Only {i.stock} in stock. Reduce the quantity.</span>}
                  </div>
                  <div className="co__qty">
                    <button onClick={() => updateQty(i.id, i.qty - 1)} disabled={i.qty <= 1 || cartBusy} aria-label={`Decrease ${i.model}`}>−</button>
                    <span className="num">{i.qty}</span>
                    <button onClick={() => updateQty(i.id, i.qty + 1)} disabled={cartBusy || i.unavailable || i.qty >= Math.min(i.stock, MAX_PER_ITEM)} aria-label={`Increase ${i.model}`}>+</button>
                    <button className="auth__link" onClick={() => removeFromCart(i.id)} disabled={cartBusy}>Remove</button>
                  </div>
                  <strong className="num">{i.unavailable ? '—' : fmtPrice(i.price * i.qty)}</strong>
                </li>
              ))}
            </ul>
            <div className="field"><label htmlFor="co-note">Order note (optional)</label><textarea id="co-note" className="textarea" value={note} maxLength={500} onChange={(e) => setNote(e.target.value)} placeholder="Delivery timing, site access, installation needs" /></div>
          </section>
        </div>

        <aside className="co__summary">
          <button className="btn btn-primary btn-block" onClick={submit} disabled={placing || !totals || available.length === 0} id="place-order">
            {placing ? 'Placing your order…' : method === 'razorpay' ? 'Place order and pay' : 'Place your order'}
          </button>
          {error && <p className="field-error" role="alert">{error}</p>}
          {itemErrors.length > 0 && <ul className="field-error co__small">{itemErrors.map((m) => <li key={m}>{m}</li>)}</ul>}
          <h2>Order summary</h2>
          {!totals ? <Loading compact label="Calculating your total" /> : (
            <>
              <dl>
                <div><dt>Items ({count})</dt><dd className="num">{fmtPrice(totals.itemsTotal)}</dd></div>
                {totals.discount > 0 && <div className="co__disc"><dt>Coupon {totals.couponCode}</dt><dd className="num">−{fmtPrice(totals.discount)}</dd></div>}
                {totals.taxAmount > 0 && <div><dt>GST ({totals.gstPercent}%)</dt><dd className="num">{fmtPrice(totals.taxAmount)}</dd></div>}
                <div><dt>Delivery</dt><dd className="num">{totals.deliveryCharge ? fmtPrice(totals.deliveryCharge) : 'Free'}</dd></div>
                <div className="co__total"><dt>Order total</dt><dd className="num">{fmtPrice(totals.totalAmount)}</dd></div>
              </dl>
              <p className="muted co__small">
                {totals.gstInclusive ? 'Prices include GST.' : `GST at ${totals.gstPercent}% is included in the total.`}
                {totals.deliveryCharge > 0 && totals.freeDeliveryAbove > 0 && ` Free delivery on orders above ${fmtPrice(totals.freeDeliveryAbove)}.`}
              </p>
            </>
          )}
          {address && <p className="co__small"><strong>Delivering to</strong> {address.fullName}, {address.city} {address.pincode}</p>}
        </aside>
      </div>
    </div>
  );
}
