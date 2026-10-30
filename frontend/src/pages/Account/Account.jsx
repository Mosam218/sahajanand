import { useEffect, useState } from 'react';
import { Link, useNavigate } from '../../router/index.jsx';
import { useApp } from '../../context/AppContext.jsx';
import { useAsync } from '../../hooks/useAsync.js';
import { useSeo } from '../../hooks/useSeo.js';
import { api } from '../../services/api.js';
import { payWithRazorpay } from '../../services/razorpay.js';
import {
  ORDER_STEPS, ORDER_STATUS_LABEL, PAYMENT_STATUS_LABEL, PAYMENT_METHOD_LABEL, ENQUIRY_STATUS_LABEL,
  orderItemTitle, formatAddress,
} from '../../services/mappers.js';
import { fmtPrice, fmtDate, fmtDateTime, productImage } from '../../utils/format.js';
import { Loading, ErrorState } from '../../components/State/State.jsx';
import './Account.css';

const TABS = [['overview', 'Overview'], ['orders', 'Your orders'], ['enquiries', 'Your enquiries'], ['addresses', 'Addresses'], ['profile', 'Login & security']];
const EMPTY_ADDR = { fullName: '', phone: '', line1: '', line2: '', landmark: '', city: '', state: 'Gujarat', pincode: '' };
const ADDRESS_FIELDS = Object.keys(EMPTY_ADDR);

export function AddressForm({ initial, onSave, onCancel }) {
  const [a, setA] = useState({ ...EMPTY_ADDR, ...Object.fromEntries(ADDRESS_FIELDS.filter((k) => initial?.[k]).map((k) => [k, initial[k]])) });
  const [errors, setErrors] = useState({});
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => { setA((x) => ({ ...x, [k]: e.target.value })); setErrors((x) => ({ ...x, [k]: undefined, form: undefined })); };

  const submit = async (e) => {
    e.preventDefault();
    const er = {};
    if (!a.fullName.trim()) er.fullName = 'Enter the full name.';
    if (!/^[6-9]\d{9}$/.test(a.phone.replace(/\D/g, '').slice(-10)) || a.phone.replace(/\D/g, '').length < 10) er.phone = 'Enter a 10-digit Indian mobile number.';
    if (!a.line1.trim()) er.line1 = 'Enter the address.';
    if (!a.city.trim()) er.city = 'Enter the city.';
    if (!a.state.trim()) er.state = 'Enter the state.';
    if (!/^\d{6}$/.test(a.pincode.trim())) er.pincode = 'Enter a 6-digit PIN code.';
    setErrors(er);
    if (Object.keys(er).length) return;
    setBusy(true);
    try {
      await onSave({ ...a, phone: a.phone.replace(/\D/g, '').slice(-10), pincode: a.pincode.trim() });
    } catch (err) {
      const fields = err.fields || {};
      setErrors(Object.keys(fields).length ? fields : { form: err.message });
    } finally {
      setBusy(false);
    }
  };
  const f = (k, label, wide, props = {}) => (
    <div className={`field ${wide ? 'acct__wide' : ''}`}>
      <label htmlFor={`ad-${k}`}>{label}</label>
      <input id={`ad-${k}`} className="input" value={a[k]} onChange={set(k)} aria-invalid={errors[k] ? 'true' : undefined} aria-describedby={errors[k] ? `ad-${k}-err` : undefined} {...props} />
      {errors[k] && <p className="field-error" id={`ad-${k}-err`}>{errors[k]}</p>}
    </div>
  );
  return (
    <form className="acct__form" onSubmit={submit} noValidate>
      {f('fullName', 'Full name', false, { autoComplete: 'name', maxLength: 100 })}
      {f('phone', 'Mobile number', false, { type: 'tel', inputMode: 'tel', autoComplete: 'tel' })}
      {f('line1', 'Address (building, street)', true, { autoComplete: 'address-line1', maxLength: 200 })}
      {f('line2', 'Area (optional)', false, { autoComplete: 'address-line2', maxLength: 200 })}
      {f('landmark', 'Landmark (optional)', false, { maxLength: 100 })}
      {f('city', 'City', false, { autoComplete: 'address-level2', maxLength: 50 })}
      {f('state', 'State', false, { autoComplete: 'address-level1', maxLength: 50 })}
      {f('pincode', 'PIN code', false, { inputMode: 'numeric', autoComplete: 'postal-code', maxLength: 6 })}
      {errors.form && <p className="field-error acct__wide" role="alert">{errors.form}</p>}
      <div className="acct__actions acct__wide">
        <button className="btn btn-primary btn-sm" disabled={busy}>{busy ? 'Saving…' : 'Save address'}</button>
        {onCancel && <button type="button" className="btn btn-ghost btn-sm" onClick={onCancel}>Cancel</button>}
      </div>
    </form>
  );
}

export function OrderTracker({ order }) {
  if (order.orderStatus === 'cancelled') return <p><span className="pill pill--bad">Cancelled</span>{order.cancelReason && <span className="muted"> {order.cancelReason}</span>}</p>;
  const at = ORDER_STEPS.indexOf(order.orderStatus);
  return (
    <ol className="tracker">
      {ORDER_STEPS.map((s, i) => {
        const h = (order.statusHistory || []).find((x) => x.status === s);
        return <li key={s} className={i <= at ? 'is-done' : ''}><span>{ORDER_STATUS_LABEL[s]}</span>{h && i <= at && <small>{fmtDateTime(h.at)}</small>}</li>;
      })}
    </ol>
  );
}

export function OrderSummary({ order }) {
  return (
    <dl className="order__sum">
      <div><dt>Items</dt><dd className="num">{fmtPrice(order.itemsTotal)}</dd></div>
      {order.discount > 0 && <div><dt>Discount {order.couponCode && `(${order.couponCode})`}</dt><dd className="num">−{fmtPrice(order.discount)}</dd></div>}
      {order.taxAmount > 0 && <div><dt>GST ({order.gstPercent}%)</dt><dd className="num">{fmtPrice(order.taxAmount)}</dd></div>}
      <div><dt>Delivery</dt><dd className="num">{order.deliveryCharge ? fmtPrice(order.deliveryCharge) : 'Free'}</dd></div>
      <div><dt>Order total{order.gstInclusive ? ' (incl. GST)' : ''}</dt><dd className="num">{fmtPrice(order.totalAmount)}</dd></div>
      <div><dt>Payment</dt><dd>{PAYMENT_METHOD_LABEL[order.paymentMethod]} ({PAYMENT_STATUS_LABEL[order.paymentStatus]})</dd></div>
      <div><dt>Deliver to</dt><dd>{order.shippingAddress?.fullName}, {formatAddress(order.shippingAddress)}. Phone {order.shippingAddress?.phone}</dd></div>
      {order.trackingId && <div><dt>Tracking</dt><dd>{[order.courierName, order.trackingId].filter(Boolean).join(' · ')}</dd></div>}
      {order.notes && <div><dt>Your note</dt><dd>{order.notes}</dd></div>}
    </dl>
  );
}

export function OrderItems({ items }) {
  return (
    <ul className="order__items">
      {items.map((i) => (
        <li key={i.product}>
          <img src={productImage(i.image)} alt="" loading="lazy" />
          <div>
            {i.slug ? <Link to={`/product/${i.slug}`}><strong>{orderItemTitle(i)}</strong></Link> : <strong>{orderItemTitle(i)}</strong>}
            {i.model && <span>{i.name}</span>}
          </div>
          <span className="num">{i.quantity} × {fmtPrice(i.price)}</span>
        </li>
      ))}
    </ul>
  );
}

function Orders({ user, storeName }) {
  const [page, setPage] = useState(1);
  const [orders, setOrders] = useState([]);
  const { data, loading, error, reload } = useAsync(() => api.myOrders(page), [page]);
  const [openOrder, setOpenOrder] = useState(null);
  const [busy, setBusy] = useState('');
  const [msg, setMsg] = useState(null);

  useEffect(() => {
    if (!data) return;
    setOrders((prev) => (page === 1 ? data.items : [...prev.filter((o) => !data.items.some((n) => n._id === o._id)), ...data.items]));
  }, [data, page]);

  const replace = (order) => setOrders((list) => list.map((o) => (o._id === order._id ? { ...o, ...order, user: o.user } : o)));

  const cancel = async (o) => {
    if (!window.confirm(`Cancel order ${o.orderNumber}?`)) return;
    setBusy(o._id); setMsg(null);
    try {
      replace(await api.cancelOrder(o._id, ''));
      setMsg({ ok: true, text: `Order ${o.orderNumber} has been cancelled.` });
    } catch (err) {
      setMsg({ ok: false, text: err.message });
    } finally {
      setBusy('');
    }
  };

  const pay = async (o) => {
    setBusy(o._id); setMsg(null);
    try {
      const { razorpay } = await api.retryPayment(o._id);
      const result = await payWithRazorpay(razorpay, { name: storeName, orderNumber: o.orderNumber, customer: { name: user.name, email: user.email, phone: user.phone } });
      if (result.status === 'paid') { replace(result.order); setMsg({ ok: true, text: `Payment received for order ${o.orderNumber}.` }); }
      else if (result.status === 'failed') { setMsg({ ok: false, text: result.message }); replace(await api.order(o._id)); }
    } catch (err) {
      setMsg({ ok: false, text: err.message });
    } finally {
      setBusy('');
    }
  };

  if (loading && orders.length === 0) return <><h1>Your orders</h1><Loading label="Loading your orders" /></>;
  if (error && orders.length === 0) return <><h1>Your orders</h1><ErrorState error={error} onRetry={reload} /></>;

  return (
    <>
      <h1>Your orders</h1>
      {msg && <p className={msg.ok ? 'acct__msg' : 'field-error'} role="status">{msg.text}</p>}
      {orders.length === 0 ? (
        <div className="empty"><h3>No orders yet</h3><p className="muted">Products you order will appear here.</p><Link to="/products" className="btn btn-primary">Browse products</Link></div>
      ) : orders.map((o) => {
        const canCancel = ['placed', 'confirmed'].includes(o.orderStatus);
        const canPay = o.paymentMethod === 'razorpay' && ['pending', 'failed'].includes(o.paymentStatus) && o.orderStatus !== 'cancelled';
        return (
          <article key={o._id} className="order">
            <header>
              <div><small>Order placed</small><span>{fmtDate(o.createdAt)}</span></div>
              <div><small>Total</small><span className="num">{fmtPrice(o.totalAmount)}</span></div>
              <div><small>Ship to</small><span>{o.shippingAddress?.fullName}, {o.shippingAddress?.city}</span></div>
              <div><small>Payment</small><span>{PAYMENT_STATUS_LABEL[o.paymentStatus]}</span></div>
              <div className="order__id"><small>Order</small><span className="num">{o.orderNumber}</span></div>
            </header>
            <div className="order__body">
              <OrderTracker order={o} />
              {canPay && <p className="acct__warn" role="status">Payment for this order has not been completed. Your items are reserved only once it is paid.</p>}
              <OrderItems items={o.items} />
              {openOrder === o._id && <OrderSummary order={o} />}
              <div className="acct__actions">
                <button className="btn btn-ghost btn-sm" onClick={() => setOpenOrder(openOrder === o._id ? null : o._id)} aria-expanded={openOrder === o._id}>{openOrder === o._id ? 'Hide details' : 'View order details'}</button>
                {canPay && <button className="btn btn-primary btn-sm" disabled={busy === o._id} onClick={() => pay(o)}>{busy === o._id ? 'Opening payment…' : 'Pay now'}</button>}
                {canCancel && <button className="btn btn-ghost btn-sm" disabled={busy === o._id} onClick={() => cancel(o)}>Cancel order</button>}
              </div>
            </div>
          </article>
        );
      })}
      {data && page < data.meta.totalPages && (
        <button className="btn btn-ghost" onClick={() => setPage((p) => p + 1)} disabled={loading}>{loading ? 'Loading…' : 'Show older orders'}</button>
      )}
    </>
  );
}

function Enquiries() {
  const { data, loading, error, reload } = useAsync(() => api.myEnquiries(), []);
  if (loading) return <><h1>Your enquiries</h1><Loading label="Loading your enquiries" /></>;
  if (error) return <><h1>Your enquiries</h1><ErrorState error={error} onRetry={reload} /></>;
  const enquiries = data.items;
  return (
    <>
      <h1>Your enquiries</h1>
      {enquiries.length === 0 ? (
        <div className="empty"><h3>No enquiries yet</h3><p className="muted">Use Request a quote on any product while signed in, and it will appear here.</p><Link to="/products" className="btn btn-primary">Browse products</Link></div>
      ) : (
        <div className="acct__table"><table>
          <thead><tr><th>Reference</th><th>Date</th><th>Product</th><th>Qty</th><th>Status</th></tr></thead>
          <tbody>{enquiries.map((e) => <tr key={e._id}><td className="num">{e.reference}</td><td>{fmtDate(e.createdAt)}</td><td>{e.product || 'General enquiry'}</td><td className="num">{e.quantity}</td><td><span className={`pill pill--${e.status}`}>{ENQUIRY_STATUS_LABEL[e.status]}</span></td></tr>)}</tbody>
        </table></div>
      )}
    </>
  );
}

function Addresses({ user }) {
  const { data: addresses, loading, error, reload, setData } = useAsync(() => api.addresses(), []);
  const [editing, setEditing] = useState(null);
  const [msg, setMsg] = useState('');

  const save = async (a) => {
    if (editing._id) await api.updateAddress(editing._id, a);
    else await api.createAddress(a);
    setEditing(null);
    setData(await api.addresses());
  };
  const act = async (call) => {
    setMsg('');
    try { await call(); setData(await api.addresses()); } catch (err) { setMsg(err.message); }
  };

  if (loading && !addresses) return <><h1>Your addresses</h1><Loading label="Loading your addresses" /></>;
  if (error && !addresses) return <><h1>Your addresses</h1><ErrorState error={error} onRetry={reload} /></>;

  return (
    <>
      <h1>Your addresses</h1>
      {msg && <p className="field-error" role="alert">{msg}</p>}
      {editing ? (
        <div className="acct__panel">
          <h2>{editing._id ? 'Edit address' : 'Add an address'}</h2>
          <AddressForm initial={editing._id ? editing : { fullName: user.name, phone: user.phone }} onSave={save} onCancel={() => setEditing(null)} />
        </div>
      ) : (
        <div className="acct__addr">
          <button className="acct__addr-add" onClick={() => setEditing({})}>+ Add address</button>
          {addresses.map((a) => (
            <div key={a._id} className="acct__addr-card">
              {a.isDefault && <span className="pill pill--ok">Default</span>}
              <strong>{a.fullName}</strong>
              <p>{a.line1}{a.line2 && `, ${a.line2}`}{a.landmark && `, ${a.landmark}`}<br />{a.city}, {a.state} {a.pincode}<br />Phone: {a.phone}</p>
              <div className="acct__actions">
                <button className="auth__link" onClick={() => setEditing(a)}>Edit</button>
                <button className="auth__link" onClick={() => window.confirm('Remove this address?') && act(() => api.deleteAddress(a._id))}>Remove</button>
                {!a.isDefault && <button className="auth__link" onClick={() => act(() => api.setDefaultAddress(a._id))}>Set as default</button>}
              </div>
            </div>
          ))}
        </div>
      )}
    </>
  );
}

function Profile({ user }) {
  const { updateProfile, changePassword } = useApp();
  const [profile, setProfile] = useState({ name: user.name, phone: user.phone || '', company: user.company || '', gstin: user.gstin || '' });
  const [pw, setPw] = useState({ current: '', next: '' });
  const [msg, setMsg] = useState(null);
  const [busy, setBusy] = useState('');
  const say = (ok, text) => setMsg({ ok, text });

  const saveProfile = async (e) => {
    e.preventDefault();
    if (!profile.name.trim()) return say(false, 'Name cannot be empty.');
    if (profile.phone && !/^[6-9]\d{9}$/.test(profile.phone.trim())) return say(false, 'Enter a 10-digit Indian mobile number.');
    if (profile.gstin && !/^[0-9A-Z]{15}$/.test(profile.gstin.trim())) return say(false, 'GSTIN must be 15 letters and digits.');
    setBusy('profile');
    try {
      await updateProfile({ name: profile.name.trim(), phone: profile.phone.trim(), company: profile.company.trim(), gstin: profile.gstin.trim() });
      say(true, 'Profile saved.');
    } catch (err) {
      say(false, err.errors?.[0]?.message || err.message);
    } finally {
      setBusy('');
    }
  };

  const savePassword = async (e) => {
    e.preventDefault();
    if (!pw.current) return say(false, 'Enter your current password.');
    if (pw.next.length < 8) return say(false, 'New password must be at least 8 characters.');
    setBusy('pw');
    const res = await changePassword(pw.current, pw.next);
    setBusy('');
    if (!res.ok) return say(false, res.error);
    setPw({ current: '', next: '' });
    say(true, 'Password changed.');
  };

  return (
    <>
      <h1>Login & security</h1>
      {msg && <p className={msg.ok ? 'acct__msg' : 'field-error'} role="status">{msg.text}</p>}
      <div className="acct__panel">
        <h2>Profile</h2>
        <form className="acct__form" onSubmit={saveProfile} noValidate>
          <div className="field"><label htmlFor="pf-name">Name</label><input id="pf-name" className="input" value={profile.name} maxLength={100} onChange={(e) => setProfile({ ...profile, name: e.target.value })} autoComplete="name" /></div>
          <div className="field"><label htmlFor="pf-phone">Mobile number</label><input id="pf-phone" className="input" type="tel" inputMode="tel" value={profile.phone} maxLength={10} onChange={(e) => setProfile({ ...profile, phone: e.target.value.replace(/\D/g, '') })} autoComplete="tel" /></div>
          <div className="field"><label htmlFor="pf-email">Email (cannot be changed)</label><input id="pf-email" className="input" value={user.email} disabled /></div>
          <div className="field"><label htmlFor="pf-co">Company (optional)</label><input id="pf-co" className="input" value={profile.company} maxLength={150} onChange={(e) => setProfile({ ...profile, company: e.target.value })} autoComplete="organization" /></div>
          <div className="field"><label htmlFor="pf-gst">GSTIN (optional)</label><input id="pf-gst" className="input" value={profile.gstin} maxLength={15} onChange={(e) => setProfile({ ...profile, gstin: e.target.value.toUpperCase() })} /></div>
          <div className="acct__actions acct__wide"><button className="btn btn-primary btn-sm" disabled={busy === 'profile'}>{busy === 'profile' ? 'Saving…' : 'Save profile'}</button></div>
        </form>
      </div>
      <div className="acct__panel">
        <h2>Change password</h2>
        <form className="acct__form" onSubmit={savePassword} noValidate>
          <div className="field"><label htmlFor="pw-cur">Current password</label><input id="pw-cur" type="password" className="input" value={pw.current} onChange={(e) => setPw({ ...pw, current: e.target.value })} autoComplete="current-password" /></div>
          <div className="field"><label htmlFor="pw-new">New password</label><input id="pw-new" type="password" className="input" value={pw.next} onChange={(e) => setPw({ ...pw, next: e.target.value })} autoComplete="new-password" /></div>
          <div className="acct__actions acct__wide"><button className="btn btn-ghost btn-sm" disabled={busy === 'pw'}>{busy === 'pw' ? 'Changing…' : 'Change password'}</button></div>
        </form>
      </div>
    </>
  );
}

function Overview({ user }) {
  const { data, loading } = useAsync(() => api.myOrders(1), []);
  const latest = data?.items[0];
  return (
    <>
      <h1>Your account</h1>
      <div className="acct__cards">
        <Link to="/account/orders"><strong className="num">{loading ? '…' : data?.meta.total ?? 0}</strong><span>Orders</span><small>Track, view or cancel</small></Link>
        <Link to="/account/enquiries"><strong>Quotes</strong><span>Enquiries</span><small>Quotes you requested</small></Link>
        <Link to="/account/addresses"><strong>Deliver</strong><span>Addresses</span><small>Delivery locations</small></Link>
        <Link to="/account/profile"><strong>Profile</strong><span>Login & security</span><small>Name, phone, password</small></Link>
      </div>
      {!user.emailVerified && (
        <p className="acct__warn" role="status">Your email address is not verified yet. Check your inbox for the verification link we sent when you signed up.</p>
      )}
      {latest && (
        <div className="acct__panel">
          <h2>Latest order {latest.orderNumber}</h2>
          <OrderTracker order={latest} />
          <p style={{ marginTop: '1rem' }}><Link to="/account/orders" className="text-link">View all orders</Link></p>
        </div>
      )}
    </>
  );
}

export default function Account({ params }) {
  const { user, authReady, logout, isAdmin, settings } = useApp();
  const navigate = useNavigate();
  const tab = TABS.some(([k]) => k === params.tab) ? params.tab : 'overview';
  useSeo({ title: `Your account | ${settings.storeName}`, noindex: true });

  useEffect(() => {
    if (authReady && !user) navigate(`/login?next=${encodeURIComponent(tab === 'overview' ? '/account' : `/account/${tab}`)}`, { replace: true });
  }, [authReady, user, navigate, tab]);

  if (!authReady) return <div className="wrap"><Loading label="Loading your account" /></div>;
  if (!user) return null;

  return (
    <div className="wrap acct">
      <nav className="breadcrumbs" aria-label="Breadcrumb"><Link to="/">Home</Link><span aria-hidden="true">/</span><span>Your account</span></nav>
      <div className="acct__grid">
        <aside className="acct__side">
          <p className="acct__hello">Hello, <strong>{user.name}</strong></p>
          <ul>
            {TABS.map(([k, label]) => <li key={k}><Link to={k === 'overview' ? '/account' : `/account/${k}`} aria-current={tab === k ? 'page' : undefined}>{label}</Link></li>)}
            {isAdmin && <li><Link to="/admin">Admin panel</Link></li>}
            <li><button onClick={async () => { await logout(); navigate('/'); }}>Sign out</button></li>
          </ul>
        </aside>

        <section className="acct__main" key={tab}>
          {tab === 'overview' && <Overview user={user} />}
          {tab === 'orders' && <Orders user={user} storeName={settings.storeName} />}
          {tab === 'enquiries' && <Enquiries />}
          {tab === 'addresses' && <Addresses user={user} />}
          {tab === 'profile' && <Profile user={user} />}
        </section>
      </div>
    </div>
  );
}
