// Store settings (super admin) and the activity log.
import { useEffect, useState } from 'react';
import { useAsync } from '../hooks/useAsync.js';
import { useApp } from '../context/AppContext.jsx';
import { api } from '../services/api.js';
import { fmtDateTime } from '../utils/format.js';
import { Loading, ErrorState } from '../components/State/State.jsx';
import { Head, Text, Num, Area, Check, useList, ServerPager, ListState, useAction, Flash } from './ui.jsx';

const FIELDS = [
  'storeName', 'legalName', 'announcement', 'supportPhone', 'supportPhoneAlt', 'supportEmail', 'whatsapp', 'address',
  'businessHours', 'gstin', 'heroTitle', 'heroLede', 'gstInclusive', 'gstPercent', 'deliveryCharge', 'freeDeliveryAbove',
  'enableCod', 'lowStockThreshold', 'maintenanceMode',
  'privacyPolicy', 'termsConditions', 'shippingPolicy', 'returnPolicy',
];

const POLICY_FIELDS = [
  ['privacyPolicy', 'Privacy Policy'],
  ['termsConditions', 'Terms & Conditions'],
  ['shippingPolicy', 'Shipping & Delivery Policy'],
  ['returnPolicy', 'Cancellation, Refund & Return Policy'],
];

export function SettingsAdmin() {
  const { isSuperAdmin, setSettings } = useApp();
  const { data, loading, error, reload } = useAsync(() => api.admin.settings(), []);
  const [f, setF] = useState(null);
  const { run, busy, flash, setFlash } = useAction();

  useEffect(() => {
    if (data) setF({ ...Object.fromEntries(FIELDS.map((k) => [k, data[k] ?? ''])), serviceAreas: (data.serviceAreas || []).join(', ') });
  }, [data]);

  const save = async (e) => {
    e.preventDefault();
    if (!f.storeName.trim()) return setFlash({ ok: false, text: 'Enter the store name.' });
    const serviceAreas = f.serviceAreas.split(',').map((s) => s.trim()).filter(Boolean);
    if (serviceAreas.length === 0) return setFlash({ ok: false, text: 'Enter at least one area you serve.' });
    const body = {
      ...f, serviceAreas,
      gstPercent: Number(f.gstPercent) || 0, deliveryCharge: Number(f.deliveryCharge) || 0,
      freeDeliveryAbove: Number(f.freeDeliveryAbove) || 0, lowStockThreshold: Number(f.lowStockThreshold) || 0,
    };
    const saved = await run(() => api.admin.saveSettings(body), 'Settings saved. The storefront now uses them.');
    // The storefront reads its own (public) copy of the settings
    if (saved) api.settings().then((pub) => setSettings((s) => ({ ...s, ...pub }))).catch(() => {});
  };

  if (loading && !f) return <><Head title="Settings" /><Loading label="Loading settings" /></>;
  if (error && !f) return <><Head title="Settings" /><ErrorState error={error} onRetry={reload} /></>;
  if (!f) return null;

  const methods = data.paymentMethods;
  return (
    <>
      <Head title="Settings" sub="Store details, pricing rules and notices shown on the website." />
      {!isSuperAdmin && <p className="acct__warn" role="status">Only a super admin can change these settings. You can view them.</p>}
      <form onSubmit={save} noValidate style={{ display: 'grid', gap: '1.1rem' }}>
        <fieldset disabled={!isSuperAdmin || busy} style={{ border: 0, padding: 0, margin: 0, display: 'grid', gap: '1.1rem', minWidth: 0 }}>
          <section className="ad-card">
            <h2>Store and contact details</h2>
            <p className="muted" style={{ fontSize: 'var(--fs-0)' }}>Shown in the header, footer and contact page. Anything left empty is simply not shown.</p>
            <div className="ad-form">
              <Text label="Store name" f={f} set={setF} k="storeName" maxLength={100} />
              <Text label="Registered business name" f={f} set={setF} k="legalName" maxLength={150} />
              <Text label="Phone" f={f} set={setF} k="supportPhone" maxLength={30} type="tel" />
              <Text label="Second phone" f={f} set={setF} k="supportPhoneAlt" maxLength={30} type="tel" />
              <Text label="Email" f={f} set={setF} k="supportEmail" maxLength={200} type="email" />
              <Text label="GSTIN" f={f} set={(v) => setF({ ...v, gstin: v.gstin.toUpperCase() })} k="gstin" maxLength={15} />
              <Area label="Address" f={f} set={setF} k="address" rows={2} />
              <Text label="Areas served (comma separated)" f={f} set={setF} k="serviceAreas" />
              <Text label="Business hours" f={f} set={setF} k="businessHours" maxLength={200} />
            </div>
          </section>

          <section className="ad-card">
            <h2>Website text</h2>
            <div className="ad-form">
              <Text label="Announcement bar (top of every page)" f={f} set={setF} k="announcement" maxLength={200} wide />
              <Text label="Home page headline" f={f} set={setF} k="heroTitle" maxLength={150} wide hint="Leave empty to use the default headline" />
              <Area label="Home page introduction" f={f} set={setF} k="heroLede" rows={2} />
            </div>
          </section>

          <section className="ad-card">
            <h2>Prices, delivery and payment</h2>
            <div className="ad-form">
              <Check label="Product prices already include GST" f={f} set={setF} k="gstInclusive" />
              <Num label="GST rate (%)" f={f} set={setF} k="gstPercent" min={0} max={100} hint={f.gstInclusive ? 'For information only: prices include GST' : 'Added on top of the items at checkout'} />
              <Num label="Delivery charge (₹)" f={f} set={setF} k="deliveryCharge" min={0} />
              <Num label="Free delivery for orders of (₹) or more" f={f} set={setF} k="freeDeliveryAbove" min={0} hint="0 = delivery is always free" />
              <Check label="Accept pay on delivery" f={f} set={setF} k="enableCod" />
              <Num label="Low-stock warning at (units)" f={f} set={setF} k="lowStockThreshold" min={0} step={1} />
            </div>
            <p className="muted" style={{ fontSize: 'var(--fs-0)' }}>
              Online payment (Razorpay) is {methods.razorpay ? 'switched on' : 'not configured on the server, so customers cannot pay online yet'}.
              {!methods.razorpay && !f.enableCod && ' With pay on delivery off as well, customers cannot check out.'}
            </p>
          </section>

          <section className="ad-card">
            <h2>Policy pages</h2>
            <p className="muted" style={{ fontSize: 'var(--fs-0)' }}>Paste the approved text of each policy. A policy appears on the website (and is linked in the footer) only once its text is entered here; it is shown exactly as typed.</p>
            {POLICY_FIELDS.map(([k, label]) => (
              <div className="field" key={k}>
                <label htmlFor={`st-${k}`}>{label} {f[k] ? '' : '(not published)'}</label>
                <textarea id={`st-${k}`} className="textarea" rows={6} maxLength={30000} value={f[k]} onChange={(e) => setF({ ...f, [k]: e.target.value })} />
              </div>
            ))}
          </section>

          <section className="ad-card">
            <h2>Notice</h2>
            <Check label="Show a “we are updating the store” notice at the top of the website" f={f} set={setF} k="maintenanceMode" />
          </section>
        </fieldset>

        <div className="acct__actions">
          {isSuperAdmin && <button className="btn btn-primary" disabled={busy}>{busy ? 'Saving…' : 'Save settings'}</button>}
          <Flash flash={flash} />
        </div>
      </form>
    </>
  );
}

export function ActivityAdmin() {
  const list = useList(api.admin.activity, { limit: 30 });
  return (
    <>
      <Head title="Activity log" sub="Every change made in the admin panel, newest first." />
      <div className="ad-toolbar">
        <input className="input" type="search" placeholder="Search by action or person" aria-label="Search activity" value={list.search} onChange={(e) => list.setSearch(e.target.value)} />
      </div>
      <div className="ad-tablewrap">
        <table className="ad-table">
          <thead><tr><th>When</th><th>Who</th><th>What</th></tr></thead>
          <tbody>
            <ListState list={list} cols={3} empty="No activity recorded yet." />
            {list.items.map((a) => <tr key={a._id}><td>{fmtDateTime(a.createdAt)}</td><td>{a.userName}</td><td>{a.action}</td></tr>)}
          </tbody>
        </table>
      </div>
      <ServerPager list={list} />
    </>
  );
}
