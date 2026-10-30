// Categories, coupons and homepage banners.
import { useRef, useState } from 'react';
import { Link } from '../router/index.jsx';
import { useAsync } from '../hooks/useAsync.js';
import { useApp } from '../context/AppContext.jsx';
import { api } from '../services/api.js';
import { fmtPrice, fmtDate, productImage } from '../utils/format.js';
import { Loading, ErrorState } from '../components/State/State.jsx';
import { Head, Pill, Drawer, Text, Num, Area, Select, Check, Empty, useList, ServerPager, ListState, useAction, Flash } from './ui.jsx';

const lines = (text) => text.split('\n').map((s) => s.trim()).filter(Boolean);
const dateInput = (iso) => (iso ? new Date(iso).toISOString().slice(0, 10) : '');

// ─── Categories ──────────────────────────────────────────────────────────────
function CategoryEditor({ initial, onClose, onSaved }) {
  const [f, setF] = useState({
    name: initial?.name || '', shortName: initial?.shortName || '', tagline: initial?.tagline || '',
    description: initial?.description || '', subcategories: (initial?.subcategories || []).join('\n'),
    sortOrder: initial?.sortOrder ?? 0, isFeatured: Boolean(initial?.isFeatured), isActive: initial ? initial.isActive : true,
  });
  const [file, setFile] = useState(null);
  const input = useRef(null);
  const { run, busy, flash, setFlash } = useAction();

  const save = async () => {
    if (!f.name.trim()) return setFlash({ ok: false, text: 'Enter the category name.' });
    if (file && file.size > 5 * 1024 * 1024) return setFlash({ ok: false, text: 'The image is larger than 5 MB.' });
    const saved = await run(() => api.admin.saveCategory(initial?._id, { ...f, name: f.name.trim(), subcategories: lines(f.subcategories), sortOrder: Number(f.sortOrder) || 0 }, file));
    if (saved) { onSaved(); onClose(); }
  };

  return (
    <Drawer title={initial ? `Edit ${initial.name}` : 'Add a category'} onClose={onClose}
      footer={<><Flash flash={flash} /><button className="btn btn-ghost btn-sm" onClick={onClose}>Cancel</button><button className="btn btn-primary btn-sm" onClick={save} disabled={busy}>{busy ? 'Saving…' : 'Save category'}</button></>}>
      <div className="ad-form">
        <Text label="Name" f={f} set={setF} k="name" maxLength={100} />
        <Text label="Short name (menu)" f={f} set={setF} k="shortName" maxLength={40} />
        <Text label="Tagline" f={f} set={setF} k="tagline" maxLength={120} wide />
        <Area label="Description" f={f} set={setF} k="description" rows={3} />
        <Area label="Product types (one per line)" f={f} set={setF} k="subcategories" rows={4} hint="Offered as quick filters on the category page" />
        <Num label="Sort order" f={f} set={setF} k="sortOrder" step={1} hint="Lower numbers appear first" />
        <div className="field">
          <span className="ad-label">Image</span>
          <div className="ad-preview"><img src={file ? URL.createObjectURL(file) : productImage(initial?.image?.url)} alt="" /></div>
          <input ref={input} type="file" accept="image/jpeg,image/png,image/webp" hidden onChange={(e) => setFile(e.target.files[0] || null)} aria-label="Choose category image" />
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => input.current.click()}>{file ? file.name : 'Choose image'}</button>
        </div>
        <Check label="Active: shown on the store" f={f} set={setF} k="isActive" />
        <Check label="Large tile on the home page" f={f} set={setF} k="isFeatured" />
      </div>
      {initial && <p className="muted" style={{ fontSize: 'var(--fs-0)' }}>The web address of this category (/category/{initial.slug}) stays the same when you rename it.</p>}
    </Drawer>
  );
}

export function CategoriesAdmin() {
  const { reloadCatalogue } = useApp();
  const { data: categories, loading, error, reload } = useAsync(() => api.admin.categories(), []);
  const [editing, setEditing] = useState(undefined);
  const { run, busy, flash } = useAction();
  const changed = () => { reload(); reloadCatalogue(); };

  const remove = async (c) => {
    if (!window.confirm(`Delete the category ${c.name}?`)) return;
    if (await run(() => api.admin.deleteCategory(c._id), `${c.name} deleted.`)) changed();
  };
  const toggle = async (c) => {
    if (await run(() => api.admin.saveCategory(c._id, { isActive: !c.isActive }), `${c.name} is now ${c.isActive ? 'hidden' : 'active'}.`)) changed();
  };

  return (
    <>
      <Head title="Categories" sub="Product lines shown in the menu and on the home page.">
        <button className="btn btn-primary btn-sm" onClick={() => setEditing(null)}>Add category</button>
      </Head>
      <Flash flash={flash} />
      {loading && !categories && <Loading label="Loading categories" />}
      {error && !categories && <ErrorState error={error} onRetry={reload} />}
      {categories && (categories.length === 0 ? <Empty>No categories yet. Add one to start building the catalogue.</Empty> : (
        <div className="ad-tablewrap">
          <table className="ad-table">
            <thead><tr><th>Category</th><th>Products</th><th>Order</th><th>Status</th><th><span className="sr-only">Actions</span></th></tr></thead>
            <tbody>
              {categories.map((c) => (
                <tr key={c._id}>
                  <td><div className="ad-prod"><img src={productImage(c.image?.url)} alt="" loading="lazy" /><div><strong>{c.name}</strong>{c.isFeatured && <Pill value="Large tile" tone="confirmed" />}<small>{c.tagline || c.description}</small></div></div></td>
                  <td className="num">{c.productCount}</td>
                  <td className="num">{c.sortOrder}</td>
                  <td><button className="ad-toggle" disabled={busy} onClick={() => toggle(c)} title="Click to change"><Pill value={c.isActive ? 'Active' : 'Hidden'} tone={c.isActive ? 'active' : 'draft'} /></button></td>
                  <td className="ad-actions">
                    <button onClick={() => setEditing(c)}>Edit</button>
                    <Link to="/admin/products">Products</Link>
                    <button className="ad-danger" disabled={busy || c.productCount > 0} title={c.productCount > 0 ? 'Move or delete its products first' : undefined} onClick={() => remove(c)}>Delete</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ))}
      {editing !== undefined && <CategoryEditor initial={editing} onClose={() => setEditing(undefined)} onSaved={changed} />}
    </>
  );
}

// ─── Coupons ─────────────────────────────────────────────────────────────────
function CouponEditor({ initial, categories, onClose, onSaved }) {
  const [f, setF] = useState({
    code: initial?.code || '', description: initial?.description || '',
    discountType: initial?.discountType || 'percent', discountValue: initial?.discountValue ?? '',
    maxDiscount: initial?.maxDiscount ?? 0, minOrderValue: initial?.minOrderValue ?? 0,
    usageLimit: initial?.usageLimit ?? 0, perUserLimit: initial?.perUserLimit ?? 1,
    category: initial?.category?._id || '', showOnStorefront: Boolean(initial?.showOnStorefront),
    startsAt: dateInput(initial?.startsAt) || dateInput(new Date()), expiresAt: dateInput(initial?.expiresAt),
    isActive: initial ? initial.isActive : true,
  });
  const { run, busy, flash, setFlash } = useAction();

  const save = async () => {
    if (!/^[A-Za-z0-9_-]+$/.test(f.code.trim())) return setFlash({ ok: false, text: 'The code can use letters, digits, - and _ only.' });
    if (f.discountValue === '' || Number(f.discountValue) <= 0) return setFlash({ ok: false, text: 'Enter a discount greater than 0.' });
    if (f.discountType === 'percent' && Number(f.discountValue) > 100) return setFlash({ ok: false, text: 'A percentage discount cannot be more than 100.' });
    if (!f.expiresAt) return setFlash({ ok: false, text: 'Choose an expiry date.' });
    if (f.startsAt && f.expiresAt < f.startsAt) return setFlash({ ok: false, text: 'The expiry date is before the start date.' });
    const body = {
      ...f, code: f.code.trim(), category: f.category || null,
      discountValue: Number(f.discountValue), maxDiscount: Number(f.maxDiscount) || 0, minOrderValue: Number(f.minOrderValue) || 0,
      usageLimit: Number(f.usageLimit) || 0, perUserLimit: Number(f.perUserLimit) || 1,
      startsAt: new Date(`${f.startsAt}T00:00:00`).toISOString(), expiresAt: new Date(`${f.expiresAt}T23:59:59`).toISOString(),
    };
    const saved = await run(() => (initial ? api.admin.updateCoupon(initial._id, body) : api.admin.createCoupon(body)));
    if (saved) { onSaved(); onClose(); }
  };

  return (
    <Drawer title={initial ? `Edit ${initial.code}` : 'Create a coupon'} onClose={onClose}
      footer={<><Flash flash={flash} /><button className="btn btn-ghost btn-sm" onClick={onClose}>Cancel</button><button className="btn btn-primary btn-sm" onClick={save} disabled={busy}>{busy ? 'Saving…' : 'Save coupon'}</button></>}>
      <div className="ad-form">
        <Text label="Code" f={f} set={(v) => setF({ ...v, code: v.code.toUpperCase() })} k="code" maxLength={30} />
        <Select label="Type" f={f} set={setF} k="discountType" options={[['percent', 'Percentage off'], ['flat', 'Fixed amount off']]} />
        <Num label={f.discountType === 'percent' ? 'Discount (%)' : 'Discount (₹)'} f={f} set={setF} k="discountValue" min={0} />
        {f.discountType === 'percent' && <Num label="Maximum discount (₹)" f={f} set={setF} k="maxDiscount" min={0} hint="0 = no cap" />}
        <Num label="Minimum order (₹)" f={f} set={setF} k="minOrderValue" min={0} />
        <Select label="Limit to a category" f={f} set={setF} k="category" options={[['', 'All products'], ...categories.map((c) => [c._id, c.name])]} />
        <Num label="Total uses allowed" f={f} set={setF} k="usageLimit" min={0} step={1} hint="0 = unlimited" />
        <Num label="Uses per customer" f={f} set={setF} k="perUserLimit" min={1} step={1} />
        <Text label="Starts" f={f} set={setF} k="startsAt" type="date" />
        <Text label="Expires" f={f} set={setF} k="expiresAt" type="date" />
        <Text label="Description (shown to customers)" f={f} set={setF} k="description" maxLength={200} wide />
        <Check label="Active" f={f} set={setF} k="isActive" />
        <Check label="Advertise on the home page" f={f} set={setF} k="showOnStorefront" />
      </div>
    </Drawer>
  );
}

export function CouponsAdmin() {
  const { reloadCatalogue } = useApp();
  const list = useList(api.admin.coupons);
  const { data: categories } = useAsync(() => api.admin.categories(), []);
  const [editing, setEditing] = useState(undefined);
  const { run, busy, flash } = useAction();
  const changed = () => { list.reload(); reloadCatalogue(); };
  const now = Date.now();

  const remove = async (c) => {
    if (!window.confirm(`Delete the coupon ${c.code}?`)) return;
    if (await run(() => api.admin.deleteCoupon(c._id), `${c.code} deleted.`)) changed();
  };
  const toggle = async (c) => {
    if (await run(() => api.admin.updateCoupon(c._id, { isActive: !c.isActive }))) changed();
  };
  const state = (c) => (!c.isActive ? ['Off', 'draft'] : new Date(c.expiresAt) < now ? ['Expired', 'bad'] : new Date(c.startsAt) > now ? ['Scheduled', 'pending'] : c.usageLimit > 0 && c.usedCount >= c.usageLimit ? ['Used up', 'bad'] : ['Active', 'active']);

  return (
    <>
      <Head title="Coupons" sub="Discount codes customers can apply in their cart.">
        <button className="btn btn-primary btn-sm" onClick={() => setEditing(null)}>Create coupon</button>
      </Head>
      <Flash flash={flash} />
      <div className="ad-toolbar">
        <input className="input" type="search" placeholder="Search by code or description" aria-label="Search coupons" value={list.search} onChange={(e) => list.setSearch(e.target.value)} />
      </div>
      <div className="ad-tablewrap">
        <table className="ad-table">
          <thead><tr><th>Code</th><th>Discount</th><th>Conditions</th><th>Used</th><th>Expires</th><th>Status</th><th><span className="sr-only">Actions</span></th></tr></thead>
          <tbody>
            <ListState list={list} cols={7} empty="No coupons yet." />
            {list.items.map((c) => {
              const [label, tone] = state(c);
              return (
                <tr key={c._id}>
                  <td><strong className="num">{c.code}</strong>{c.showOnStorefront && <Pill value="On home page" tone="confirmed" />}<small>{c.description}</small></td>
                  <td className="num">{c.discountType === 'percent' ? `${c.discountValue}%` : fmtPrice(c.discountValue)}{c.discountType === 'percent' && c.maxDiscount > 0 && <small>up to {fmtPrice(c.maxDiscount)}</small>}</td>
                  <td>{c.minOrderValue > 0 ? `Min. ${fmtPrice(c.minOrderValue)}` : 'No minimum'}<small>{c.category ? `${c.category.name} only` : 'All products'}</small></td>
                  <td className="num">{c.usedCount}{c.usageLimit > 0 && ` / ${c.usageLimit}`}</td>
                  <td>{fmtDate(c.expiresAt)}</td>
                  <td><button className="ad-toggle" disabled={busy} onClick={() => toggle(c)} title="Click to switch on or off"><Pill value={label} tone={tone} /></button></td>
                  <td className="ad-actions"><button onClick={() => setEditing(c)}>Edit</button><button className="ad-danger" disabled={busy} onClick={() => remove(c)}>Delete</button></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <ServerPager list={list} />
      {editing !== undefined && <CouponEditor initial={editing} categories={categories || []} onClose={() => setEditing(undefined)} onSaved={changed} />}
    </>
  );
}

// ─── Homepage banners ────────────────────────────────────────────────────────
function BannerEditor({ initial, onClose, onSaved }) {
  const [f, setF] = useState({
    badge: initial?.badge || '', title: initial?.title || '', subtitle: initial?.subtitle || '',
    product: initial?.product?._id || '', facts: (initial?.facts || []).join('\n'), cta: initial?.cta || 'Explore product',
    tone: initial?.tone || 'ice', sortOrder: initial?.sortOrder ?? 0, isActive: initial ? initial.isActive : true,
  });
  const [search, setSearch] = useState('');
  const { data: found } = useAsync(() => api.admin.products({ search, limit: 20, isActive: 'true', sort: 'name' }), [search]);
  const { run, busy, flash, setFlash } = useAction();
  const options = found?.items || [];
  const chosen = options.find((p) => p._id === f.product) || (initial?.product?._id === f.product ? initial.product : null);

  const save = async () => {
    if (!f.title.trim()) return setFlash({ ok: false, text: 'Enter a title.' });
    if (!f.product) return setFlash({ ok: false, text: 'Choose the product this banner points to.' });
    const body = { ...f, title: f.title.trim(), facts: lines(f.facts).slice(0, 4), sortOrder: Number(f.sortOrder) || 0 };
    const saved = await run(() => (initial ? api.admin.updateBanner(initial._id, body) : api.admin.createBanner(body)));
    if (saved) { onSaved(); onClose(); }
  };

  return (
    <Drawer title={initial ? 'Edit banner' : 'Add a banner'} onClose={onClose}
      footer={<><Flash flash={flash} /><button className="btn btn-ghost btn-sm" onClick={onClose}>Cancel</button><button className="btn btn-primary btn-sm" onClick={save} disabled={busy}>{busy ? 'Saving…' : 'Save banner'}</button></>}>
      <div className="ad-form">
        <Text label="Title" f={f} set={setF} k="title" maxLength={120} wide />
        <Text label="Small label above the title" f={f} set={setF} k="badge" maxLength={60} wide />
        <Area label="Text" f={f} set={setF} k="subtitle" rows={2} />
        <div className="field ad-wide">
          <label htmlFor="bn-search">Product</label>
          <input id="bn-search" className="input" type="search" placeholder="Search active products by model or name" value={search} onChange={(e) => setSearch(e.target.value)} />
          <select className="select" aria-label="Choose product" value={f.product} onChange={(e) => setF({ ...f, product: e.target.value })}>
            <option value="">Choose a product</option>
            {chosen && !options.some((p) => p._id === chosen._id) && <option value={chosen._id}>{chosen.model || chosen.name}</option>}
            {options.map((p) => <option key={p._id} value={p._id}>{p.model ? `${p.model}, ${p.name}` : p.name}</option>)}
          </select>
        </div>
        <Area label="Key facts (one per line, up to 4)" f={f} set={setF} k="facts" rows={3} />
        <Text label="Button text" f={f} set={setF} k="cta" maxLength={40} />
        <Select label="Colour" f={f} set={setF} k="tone" options={[['ice', 'Light'], ['steel', 'Steel'], ['dark', 'Dark']]} />
        <Num label="Sort order" f={f} set={setF} k="sortOrder" step={1} />
        <Check label="Shown on the home page" f={f} set={setF} k="isActive" />
      </div>
    </Drawer>
  );
}

export function OffersAdmin() {
  const { reloadCatalogue } = useApp();
  const { data: banners, loading, error, reload } = useAsync(() => api.admin.banners(), []);
  const [editing, setEditing] = useState(undefined);
  const { run, busy, flash } = useAction();
  const changed = () => { reload(); reloadCatalogue(); };

  const remove = async (b) => {
    if (!window.confirm(`Delete the banner “${b.title}”?`)) return;
    if (await run(() => api.admin.deleteBanner(b._id), 'Banner deleted.')) changed();
  };
  const toggle = async (b) => { if (await run(() => api.admin.updateBanner(b._id, { isActive: !b.isActive }))) changed(); };

  return (
    <>
      <Head title="Homepage banners" sub="Slides in the carousel on the home page. Each one points to a product.">
        <button className="btn btn-primary btn-sm" onClick={() => setEditing(null)}>Add banner</button>
      </Head>
      <Flash flash={flash} />
      {loading && !banners && <Loading label="Loading banners" />}
      {error && !banners && <ErrorState error={error} onRetry={reload} />}
      {banners && (banners.length === 0 ? <Empty>No banners. The home page hides the carousel until you add one.</Empty> : (
        <div className="ad-tablewrap">
          <table className="ad-table">
            <thead><tr><th>Banner</th><th>Product</th><th>Order</th><th>Status</th><th><span className="sr-only">Actions</span></th></tr></thead>
            <tbody>
              {banners.map((b) => (
                <tr key={b._id}>
                  <td><strong>{b.title}</strong><small>{b.badge}</small></td>
                  <td>{b.product ? <div className="ad-prod"><img src={productImage(b.product.images?.[0]?.url)} alt="" loading="lazy" /><div><strong>{b.product.model || b.product.name}</strong>{!b.product.isActive && <small>Hidden product: banner not shown</small>}</div></div> : <span className="field-error">Product missing</span>}</td>
                  <td className="num">{b.sortOrder}</td>
                  <td><button className="ad-toggle" disabled={busy} onClick={() => toggle(b)} title="Click to change"><Pill value={b.isActive ? 'Shown' : 'Hidden'} tone={b.isActive ? 'active' : 'draft'} /></button></td>
                  <td className="ad-actions"><button onClick={() => setEditing(b)}>Edit</button><button className="ad-danger" disabled={busy} onClick={() => remove(b)}>Delete</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ))}
      {editing !== undefined && <BannerEditor initial={editing} onClose={() => setEditing(undefined)} onSaved={changed} />}
    </>
  );
}
