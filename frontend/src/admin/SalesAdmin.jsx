// Orders, enquiries (quote requests) and customers.
import { useState } from 'react';
import { useAsync } from '../hooks/useAsync.js';
import { useApp } from '../context/AppContext.jsx';
import { api } from '../services/api.js';
import {
  ORDER_STATUS_LABEL, PAYMENT_STATUS_LABEL, PAYMENT_METHOD_LABEL, ENQUIRY_STATUS_LABEL, orderItemTitle, formatAddress,
} from '../services/mappers.js';
import { fmtPrice, fmtDate, fmtDateTime, productImage, telHref } from '../utils/format.js';
import { Loading, ErrorState } from '../components/State/State.jsx';
import { Head, Pill, Drawer, useList, ServerPager, ListState, useAction, Flash } from './ui.jsx';

const ORDER_STATUSES = Object.keys(ORDER_STATUS_LABEL);
const PAYMENT_STATUSES = Object.keys(PAYMENT_STATUS_LABEL);
const ENQUIRY_STATUSES = Object.keys(ENQUIRY_STATUS_LABEL);
const NEXT_LABEL = { confirmed: 'Confirm order', shipped: 'Mark as dispatched', delivered: 'Mark as delivered', cancelled: 'Cancel order' };

// ─── Orders ──────────────────────────────────────────────────────────────────
function OrderDetail({ id, onClose, onChanged }) {
  const { reloadCatalogue } = useApp();
  const { data, loading, error, reload, setData } = useAsync(() => api.admin.order(id), [id]);
  const { run, busy, flash } = useAction();
  const [ship, setShip] = useState({ trackingId: '', courierName: '' });
  const [note, setNote] = useState('');
  const order = data?.order;
  const allowed = data?.allowedStatuses || [];

  // Reload the order after a change: the server decides what is allowed next
  const after = async (ok) => { if (ok) { setData(await api.admin.order(id)); onChanged(); } };

  const move = async (status) => {
    if (status === 'cancelled' && !window.confirm(`Cancel order ${order.orderNumber}? Its items go back into stock.`)) return;
    const ok = await run(
      () => api.admin.setOrderStatus(id, { status, note: note.trim(), ...(status === 'shipped' ? { trackingId: ship.trackingId.trim(), courierName: ship.courierName.trim() } : {}) }),
      `Order is now ${ORDER_STATUS_LABEL[status].toLowerCase()}.`
    );
    if (ok) { setNote(''); if (status === 'cancelled') reloadCatalogue(); }
    after(ok);
  };
  const setPaid = async (paymentStatus) => after(await run(() => api.admin.setPaymentStatus(id, paymentStatus), `Payment marked as ${paymentStatus}.`));
  const refund = async () => {
    if (!window.confirm(`Refund ${fmtPrice(order.totalAmount)} for order ${order.orderNumber} through Razorpay?`)) return;
    after(await run(() => api.admin.refundOrder(id, 0), 'Refund started.'));
  };
  const resolve = async () => after(await run(() => api.admin.resolveOrder(id), 'Marked as resolved.'));

  const paid = order?.paymentStatus === 'paid';
  const unpaidOnline = order && order.paymentMethod === 'razorpay' && !['paid', 'refund_pending', 'refunded'].includes(order.paymentStatus);

  return (
    <Drawer wide title={order ? `Order ${order.orderNumber}` : 'Order'} onClose={onClose}
      footer={<><Flash flash={flash} /><button className="btn btn-ghost btn-sm" onClick={() => window.print()}>Print</button><button className="btn btn-ghost btn-sm" onClick={onClose}>Close</button></>}>
      {loading && !order && <Loading label="Loading order" />}
      {error && !order && <ErrorState error={error} onRetry={reload} />}
      {order && (
        <div className="ad-detail">
          {order.needsAttention && (
            <p className="acct__warn" role="status">This paid order needs attention: stock ran short after payment. Fulfil it or refund it, then <button className="auth__link" onClick={resolve} disabled={busy}>mark as resolved</button>.</p>
          )}
          <dl className="ad-dl">
            <div><dt>Placed</dt><dd>{fmtDateTime(order.createdAt)}</dd></div>
            <div><dt>Status</dt><dd><Pill value={ORDER_STATUS_LABEL[order.orderStatus]} tone={order.orderStatus} />{order.cancelReason && ` ${order.cancelReason}`}</dd></div>
            <div><dt>Payment</dt><dd>{PAYMENT_METHOD_LABEL[order.paymentMethod]} <Pill value={PAYMENT_STATUS_LABEL[order.paymentStatus]} tone={order.paymentStatus} /></dd></div>
            {order.trackingId && <div><dt>Tracking</dt><dd>{[order.courierName, order.trackingId].filter(Boolean).join(' · ')}</dd></div>}
          </dl>

          {order.internalNotes && <p className="ad-quote" style={{ whiteSpace: 'pre-wrap' }}><strong>Staff note:</strong> {order.internalNotes}</p>}

          <h3>Customer and delivery</h3>
          <dl className="ad-dl">
            <div><dt>Account</dt><dd>{order.user ? <>{order.user.name} · <a href={`mailto:${order.user.email}`}>{order.user.email}</a></> : 'Account removed'}</dd></div>
            {order.user?.company && <div><dt>Company</dt><dd>{order.user.company}{order.user.gstin && ` · GSTIN ${order.user.gstin}`}</dd></div>}
            <div><dt>Deliver to</dt><dd>{order.shippingAddress.fullName}<br />{formatAddress(order.shippingAddress)}</dd></div>
            <div><dt>Phone</dt><dd><a href={telHref(order.shippingAddress.phone)}>{order.shippingAddress.phone}</a></dd></div>
            {order.notes && <div><dt>Customer note</dt><dd style={{ whiteSpace: 'pre-wrap' }}>{order.notes}</dd></div>}
          </dl>

          <h3>Items</h3>
          <table className="ad-table ad-table--plain">
            <tbody>
              {order.items.map((i) => (
                <tr key={i.product}>
                  <td><div className="ad-prod"><img src={productImage(i.image)} alt="" /><div><strong>{orderItemTitle(i)}</strong><small>{i.model ? i.name : i.sku}</small></div></div></td>
                  <td className="num">{i.quantity} × {fmtPrice(i.price)}</td>
                  <td className="num">{fmtPrice(i.price * i.quantity)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <dl className="ad-dl">
            <div><dt>Items</dt><dd className="num">{fmtPrice(order.itemsTotal)}</dd></div>
            {order.discount > 0 && <div><dt>Discount</dt><dd className="num">−{fmtPrice(order.discount)} ({order.couponCode})</dd></div>}
            {order.taxAmount > 0 && <div><dt>GST ({order.gstPercent}%)</dt><dd className="num">{fmtPrice(order.taxAmount)}</dd></div>}
            <div><dt>Delivery</dt><dd className="num">{order.deliveryCharge ? fmtPrice(order.deliveryCharge) : 'Free'}</dd></div>
            <div className="ad-dl__total"><dt>Total</dt><dd className="num"><strong>{fmtPrice(order.totalAmount)}</strong>{order.gstInclusive && ' incl. GST'}</dd></div>
          </dl>

          <h3>Next step</h3>
          {allowed.length === 0 ? <p className="muted">This order is {ORDER_STATUS_LABEL[order.orderStatus].toLowerCase()}. No further status changes are possible.</p> : (
            <>
              {unpaidOnline && <p className="acct__warn">The customer has not paid for this online order yet, so it can only be cancelled.</p>}
              {allowed.includes('shipped') && !unpaidOnline && (
                <div className="ad-form">
                  <div className="field"><label htmlFor="od-courier">Courier / delivered by (optional)</label><input id="od-courier" className="input" maxLength={100} value={ship.courierName} onChange={(e) => setShip({ ...ship, courierName: e.target.value })} /></div>
                  <div className="field"><label htmlFor="od-track">Tracking number (optional)</label><input id="od-track" className="input" maxLength={100} value={ship.trackingId} onChange={(e) => setShip({ ...ship, trackingId: e.target.value })} /></div>
                </div>
              )}
              <div className="field"><label htmlFor="od-note">Note for the order history (optional)</label><input id="od-note" className="input" maxLength={500} value={note} onChange={(e) => setNote(e.target.value)} /></div>
              <div className="acct__actions">
                {allowed.filter((s) => s !== 'cancelled' && !unpaidOnline).map((s) => <button key={s} className="btn btn-primary btn-sm" disabled={busy} onClick={() => move(s)}>{NEXT_LABEL[s]}</button>)}
                {allowed.includes('cancelled') && <button className="btn btn-ghost btn-sm ad-danger" disabled={busy} onClick={() => move('cancelled')}>{NEXT_LABEL.cancelled}</button>}
              </div>
            </>
          )}

          <h3>Payment</h3>
          <div className="acct__actions">
            {order.paymentMethod === 'cod' && order.paymentStatus === 'refund_pending' && (
              <button className="btn btn-ghost btn-sm" disabled={busy} onClick={() => setPaid('refunded')}>Mark cash as returned to the customer</button>
            )}
            {order.paymentMethod === 'cod' && order.orderStatus !== 'cancelled' && (
              paid
                ? <button className="btn btn-ghost btn-sm" disabled={busy} onClick={() => setPaid('pending')}>Undo “payment received”</button>
                : <button className="btn btn-ghost btn-sm" disabled={busy} onClick={() => setPaid('paid')}>Mark cash as received</button>
            )}
            {order.paymentMethod === 'razorpay' && ['paid', 'refund_pending'].includes(order.paymentStatus) && (
              <button className="btn btn-ghost btn-sm ad-danger" disabled={busy} onClick={refund}>Refund through Razorpay</button>
            )}
            {order.paymentMethod === 'razorpay' && !['paid', 'refund_pending'].includes(order.paymentStatus) && <span className="muted">Online payments are updated automatically by Razorpay.</span>}
          </div>

          <h3>History</h3>
          <ul className="ad-log">
            {order.statusHistory.map((h, i) => <li key={i}><time>{fmtDateTime(h.at)}</time><span><strong>{ORDER_STATUS_LABEL[h.status] || h.status.replace(/_/g, ' ')}</strong>{h.note && ` · ${h.note}`}</span></li>)}
          </ul>
        </div>
      )}
    </Drawer>
  );
}

export function OrdersAdmin() {
  const list = useList(api.admin.orders);
  const [open, setOpen] = useState(null);

  return (
    <>
      <Head title="Orders" sub="Search, filter and move orders through to delivery." />
      <div className="ad-toolbar">
        <input className="input" type="search" placeholder="Search by order number, customer name, email or phone" aria-label="Search orders" value={list.search} onChange={(e) => list.setSearch(e.target.value)} />
        <select className="select" aria-label="Order status" value={list.query.status || ''} onChange={(e) => list.setFilter('status', e.target.value)}>
          <option value="">All statuses</option>{ORDER_STATUSES.map((s) => <option key={s} value={s}>{ORDER_STATUS_LABEL[s]}</option>)}
        </select>
        <select className="select" aria-label="Payment status" value={list.query.paymentStatus || ''} onChange={(e) => list.setFilter('paymentStatus', e.target.value)}>
          <option value="">Any payment status</option>{PAYMENT_STATUSES.map((s) => <option key={s} value={s}>{PAYMENT_STATUS_LABEL[s]}</option>)}
        </select>
        <select className="select" aria-label="Payment method" value={list.query.paymentMethod || ''} onChange={(e) => list.setFilter('paymentMethod', e.target.value)}>
          <option value="">Any payment method</option><option value="cod">{PAYMENT_METHOD_LABEL.cod}</option><option value="razorpay">{PAYMENT_METHOD_LABEL.razorpay}</option>
        </select>
        <select className="select" aria-label="Attention" value={list.query.needsAttention ?? ''} onChange={(e) => list.setFilter('needsAttention', e.target.value)}>
          <option value="">All orders</option><option value="true">Needs attention</option>
        </select>
      </div>

      <div className="ad-tablewrap">
        <table className="ad-table">
          <thead><tr><th>Order</th><th>Placed</th><th>Customer</th><th>Items</th><th>Total</th><th>Status</th><th>Payment</th><th><span className="sr-only">Actions</span></th></tr></thead>
          <tbody>
            <ListState list={list} cols={8} empty="No orders match these filters." />
            {list.items.map((o) => (
              <tr key={o._id}>
                <td className="num"><strong>{o.orderNumber}</strong>{o.needsAttention && <Pill value="Attention" tone="bad" />}</td>
                <td>{fmtDate(o.createdAt)}</td>
                <td>{o.user?.name || o.shippingAddress?.fullName}<small>{o.shippingAddress?.city} · {o.shippingAddress?.phone}</small></td>
                <td className="num">{o.items.reduce((n, i) => n + i.quantity, 0)}<small>{o.items.map(orderItemTitle).join(', ')}</small></td>
                <td className="num">{fmtPrice(o.totalAmount)}</td>
                <td><Pill value={ORDER_STATUS_LABEL[o.orderStatus]} tone={o.orderStatus} /></td>
                <td><Pill value={PAYMENT_STATUS_LABEL[o.paymentStatus]} tone={o.paymentStatus} /><small>{PAYMENT_METHOD_LABEL[o.paymentMethod]}</small></td>
                <td className="ad-actions"><button onClick={() => setOpen(o._id)}>Open</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <ServerPager list={list} />
      {open && <OrderDetail id={open} onClose={() => setOpen(null)} onChanged={list.reload} />}
    </>
  );
}

// ─── Enquiries ───────────────────────────────────────────────────────────────
function EnquiryDetail({ enquiry, onClose, onChanged }) {
  const [status, setStatus] = useState(enquiry.status);
  const [notes, setNotes] = useState(enquiry.notes || '');
  const { run, busy, flash } = useAction();

  const save = async () => { if (await run(() => api.admin.updateEnquiry(enquiry._id, { status, notes }), 'Enquiry saved.')) onChanged(); };
  const remove = async () => {
    if (!window.confirm(`Delete enquiry ${enquiry.reference}?`)) return;
    if (await run(() => api.admin.deleteEnquiry(enquiry._id))) { onChanged(); onClose(); }
  };

  return (
    <Drawer title={`Enquiry ${enquiry.reference}`} onClose={onClose}
      footer={<><Flash flash={flash} /><button className="btn btn-ghost btn-sm ad-danger" disabled={busy} onClick={remove}>Delete</button><button className="btn btn-primary btn-sm" disabled={busy} onClick={save}>{busy ? 'Saving…' : 'Save'}</button></>}>
      <dl className="ad-dl">
        <div><dt>Received</dt><dd>{fmtDateTime(enquiry.createdAt)}</dd></div>
        <div><dt>Name</dt><dd>{enquiry.name}{enquiry.company && ` · ${enquiry.company}`}</dd></div>
        <div><dt>Phone</dt><dd><a href={telHref(enquiry.phone)}>{enquiry.phone}</a></dd></div>
        <div><dt>Email</dt><dd><a href={`mailto:${enquiry.email}`}>{enquiry.email}</a></dd></div>
        {enquiry.city && <div><dt>City</dt><dd>{enquiry.city}</dd></div>}
        <div><dt>Product</dt><dd>{enquiry.product || 'General enquiry'} · quantity {enquiry.quantity}</dd></div>
        <div><dt>Account</dt><dd>{enquiry.user ? 'Sent while signed in' : 'Sent as a guest'}</dd></div>
      </dl>
      {enquiry.message && <p className="ad-quote" style={{ whiteSpace: 'pre-wrap' }}>{enquiry.message}</p>}
      <h3>Follow-up</h3>
      <div className="field"><label htmlFor="en-status">Status</label>
        <select id="en-status" className="select" value={status} onChange={(e) => setStatus(e.target.value)}>{ENQUIRY_STATUSES.map((s) => <option key={s} value={s}>{ENQUIRY_STATUS_LABEL[s]}</option>)}</select>
      </div>
      <div className="field"><label htmlFor="en-notes">Internal notes (never shown to the customer)</label>
        <textarea id="en-notes" className="textarea" rows={5} maxLength={2000} value={notes} onChange={(e) => setNotes(e.target.value)} />
      </div>
    </Drawer>
  );
}

export function EnquiriesAdmin() {
  const list = useList(api.admin.enquiries);
  const [open, setOpen] = useState(null);

  return (
    <>
      <Head title="Enquiries" sub="Quote requests sent from the website." />
      <div className="ad-toolbar">
        <input className="input" type="search" placeholder="Search by name, company, phone, email, product or reference" aria-label="Search enquiries" value={list.search} onChange={(e) => list.setSearch(e.target.value)} />
        <select className="select" aria-label="Status" value={list.query.status || ''} onChange={(e) => list.setFilter('status', e.target.value)}>
          <option value="">All statuses</option>{ENQUIRY_STATUSES.map((s) => <option key={s} value={s}>{ENQUIRY_STATUS_LABEL[s]}</option>)}
        </select>
      </div>
      <div className="ad-tablewrap">
        <table className="ad-table">
          <thead><tr><th>Reference</th><th>Received</th><th>From</th><th>Product</th><th>Qty</th><th>Status</th><th><span className="sr-only">Actions</span></th></tr></thead>
          <tbody>
            <ListState list={list} cols={7} empty="No enquiries match these filters." />
            {list.items.map((e) => (
              <tr key={e._id}>
                <td className="num"><strong>{e.reference}</strong></td>
                <td>{fmtDate(e.createdAt)}</td>
                <td>{e.name}<small>{[e.company, e.city, e.phone].filter(Boolean).join(' · ')}</small></td>
                <td>{e.product || 'General enquiry'}<small>{e.message}</small></td>
                <td className="num">{e.quantity}</td>
                <td><Pill value={ENQUIRY_STATUS_LABEL[e.status]} tone={e.status} /></td>
                <td className="ad-actions"><button onClick={() => setOpen(e)}>Open</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <ServerPager list={list} />
      {open && <EnquiryDetail key={open._id} enquiry={open} onClose={() => setOpen(null)} onChanged={list.reload} />}
    </>
  );
}

// ─── Customers ───────────────────────────────────────────────────────────────
const ROLE_LABEL = { user: 'Customer', admin: 'Admin', superadmin: 'Super admin' };

function CustomerDetail({ id, onClose, onChanged }) {
  const { user: me, isSuperAdmin } = useApp();
  const { data, loading, error, reload, setData } = useAsync(() => api.admin.user(id), [id]);
  const { run, busy, flash } = useAction();
  const u = data?.user;
  const self = u && me._id === u._id;
  const staff = u && u.role !== 'user';

  const after = async (ok) => { if (ok) { setData(await api.admin.user(id)); onChanged(); } };
  const setStatus = async (isActive) => {
    if (!isActive && !window.confirm(`Deactivate ${u.name}? They will not be able to sign in or order.`)) return;
    after(await run(() => api.admin.setUserStatus(id, isActive), isActive ? 'Account activated.' : 'Account deactivated.'));
  };
  const setRole = async (role) => {
    if (!window.confirm(`Change ${u.name} to ${ROLE_LABEL[role]}?`)) return;
    after(await run(() => api.admin.setUserRole(id, role), `${u.name} is now: ${ROLE_LABEL[role]}.`));
  };

  return (
    <Drawer wide title={u ? u.name : 'Customer'} onClose={onClose} footer={<><Flash flash={flash} /><button className="btn btn-ghost btn-sm" onClick={onClose}>Close</button></>}>
      {loading && !u && <Loading label="Loading customer" />}
      {error && !u && <ErrorState error={error} onRetry={reload} />}
      {u && (
        <div className="ad-detail">
          <dl className="ad-dl">
            <div><dt>Email</dt><dd><a href={`mailto:${u.email}`}>{u.email}</a> {u.emailVerified ? <Pill value="Verified" tone="ok" /> : <Pill value="Not verified" tone="pending" />}</dd></div>
            <div><dt>Phone</dt><dd>{u.phone ? <a href={telHref(u.phone)}>{u.phone}</a> : 'Not given'}</dd></div>
            {u.company && <div><dt>Company</dt><dd>{u.company}{u.gstin && ` · GSTIN ${u.gstin}`}</dd></div>}
            <div><dt>Role</dt><dd><Pill value={ROLE_LABEL[u.role]} tone={staff ? 'admin' : 'draft'} /></dd></div>
            <div><dt>Account</dt><dd><Pill value={u.isActive ? 'Active' : 'Deactivated'} tone={u.isActive ? 'active' : 'blocked'} /></dd></div>
            <div><dt>Joined</dt><dd>{fmtDate(u.createdAt)} · last sign-in {fmtDateTime(u.lastLoginAt)}</dd></div>
          </dl>

          {!self && (
            <div className="acct__actions">
              {(!staff || isSuperAdmin) && (u.isActive
                ? <button className="btn btn-ghost btn-sm ad-danger" disabled={busy} onClick={() => setStatus(false)}>Deactivate account</button>
                : <button className="btn btn-ghost btn-sm" disabled={busy} onClick={() => setStatus(true)}>Activate account</button>)}
              {isSuperAdmin && Object.keys(ROLE_LABEL).filter((r) => r !== u.role).map((r) => (
                <button key={r} className="btn btn-ghost btn-sm" disabled={busy} onClick={() => setRole(r)}>Make {ROLE_LABEL[r].toLowerCase()}</button>
              ))}
            </div>
          )}
          {self && <p className="muted">This is your own account. Another super admin has to change its role or status.</p>}
          {!isSuperAdmin && staff && !self && <p className="muted">Only a super admin can change another admin account.</p>}

          <h3>Orders ({data.orders.length}{data.orders.length === 20 && '+'})</h3>
          {data.orders.length === 0 ? <p className="muted">No orders yet.</p> : (
            <table className="ad-table ad-table--plain">
              <tbody>{data.orders.map((o) => (
                <tr key={o._id}><td className="num"><strong>{o.orderNumber}</strong></td><td>{fmtDate(o.createdAt)}</td><td className="num">{fmtPrice(o.totalAmount)}</td><td><Pill value={ORDER_STATUS_LABEL[o.orderStatus]} tone={o.orderStatus} /></td><td><Pill value={PAYMENT_STATUS_LABEL[o.paymentStatus]} tone={o.paymentStatus} /></td></tr>
              ))}</tbody>
            </table>
          )}

          <h3>Addresses</h3>
          {data.addresses.length === 0 ? <p className="muted">No saved addresses.</p> : (
            <ul className="ad-log">{data.addresses.map((a) => <li key={a._id}><span>{a.fullName}{a.isDefault && ' (default)'}</span><span>{formatAddress(a)} · {a.phone}</span></li>)}</ul>
          )}

          <h3>Enquiries</h3>
          {data.enquiries.length === 0 ? <p className="muted">No enquiries.</p> : (
            <ul className="ad-log">{data.enquiries.map((e) => <li key={e._id}><time>{fmtDate(e.createdAt)}</time><span><strong>{e.reference}</strong> · {e.product || 'General enquiry'} · {ENQUIRY_STATUS_LABEL[e.status]}</span></li>)}</ul>
          )}
        </div>
      )}
    </Drawer>
  );
}

export function CustomersAdmin() {
  const list = useList(api.admin.users);
  const [open, setOpen] = useState(null);

  return (
    <>
      <Head title="Customers" sub="Everyone with an account, with their order history." />
      <div className="ad-toolbar">
        <input className="input" type="search" placeholder="Search by name, email, phone or company" aria-label="Search customers" value={list.search} onChange={(e) => list.setSearch(e.target.value)} />
        <select className="select" aria-label="Role" value={list.query.role || ''} onChange={(e) => list.setFilter('role', e.target.value)}>
          <option value="">All roles</option>{Object.entries(ROLE_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <select className="select" aria-label="Account status" value={list.query.isActive ?? ''} onChange={(e) => list.setFilter('isActive', e.target.value)}>
          <option value="">Active and deactivated</option><option value="true">Active</option><option value="false">Deactivated</option>
        </select>
      </div>
      <div className="ad-tablewrap">
        <table className="ad-table">
          <thead><tr><th>Customer</th><th>Phone</th><th>Joined</th><th>Orders</th><th>Spent</th><th>Role</th><th>Account</th><th><span className="sr-only">Actions</span></th></tr></thead>
          <tbody>
            <ListState list={list} cols={8} empty="No customers match these filters." />
            {list.items.map((u) => (
              <tr key={u._id}>
                <td><strong>{u.name}</strong><small>{u.email}{u.company && ` · ${u.company}`}</small></td>
                <td className="num">{u.phone || '—'}</td>
                <td>{fmtDate(u.createdAt)}</td>
                <td className="num">{u.orderCount}</td>
                <td className="num">{fmtPrice(u.totalSpent)}</td>
                <td><Pill value={ROLE_LABEL[u.role]} tone={u.role === 'user' ? 'draft' : 'admin'} /></td>
                <td><Pill value={u.isActive ? 'Active' : 'Deactivated'} tone={u.isActive ? 'active' : 'blocked'} /></td>
                <td className="ad-actions"><button onClick={() => setOpen(u._id)}>Open</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <ServerPager list={list} />
      {open && <CustomerDetail id={open} onClose={() => setOpen(null)} onChanged={list.reload} />}
    </>
  );
}
