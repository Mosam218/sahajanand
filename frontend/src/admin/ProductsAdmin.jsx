// Products and inventory: search, filter by category / status / stock level,
// quick stock changes, and a full editor with image upload.
import { useRef, useState } from 'react';
import { useAsync } from '../hooks/useAsync.js';
import { useApp } from '../context/AppContext.jsx';
import { api } from '../services/api.js';
import { fmtPrice, productImage } from '../utils/format.js';
import { Head, Pill, Drawer, Text, Num, Area, Select, Check, useList, ServerPager, ListState, useAction, Flash } from './ui.jsx';

const TEMP_CLASSES = ['', 'Ultra-low', 'Freezer', 'Dual / convertible', 'Chiller', 'Heated'];
const lines = (text) => text.split('\n').map((s) => s.trim()).filter(Boolean);
const MAX_IMAGE_MB = 5;

const toForm = (p) => ({
  model: p?.model || '', name: p?.name || '', brand: p?.brand ?? 'Elanpro', sku: p?.sku || '',
  category: p?.category?._id || p?.category || '', subcategory: p?.subcategory || '',
  familyId: p?.familyId || '', familyName: p?.familyName || '',
  price: p?.price ?? '', mrp: p?.mrp ?? '', stock: p?.stock ?? 0,
  description: p?.description || '',
  features: (p?.features || []).join('\n'), applications: (p?.applications || []).join('\n'), badges: (p?.badges || []).join(', '),
  specs: (p?.specs || []).map((s) => ({ key: s.key, value: s.value })),
  tempMin: p?.temp?.min ?? '', tempMax: p?.temp?.max ?? '', tempClass: p?.tempClass || '',
  capacityL: p?.capacityL ?? '', refrigerant: p?.refrigerant || '', cooling: p?.cooling || '',
  warrantyMonths: p?.warrantyMonths ?? 0, sortOrder: p?.sortOrder ?? 0,
  isFeatured: Boolean(p?.isFeatured), isActive: p ? Boolean(p.isActive) : true,
});

function toPayload(f) {
  const hasTemp = f.tempMin !== '' && f.tempMax !== '';
  return {
    model: f.model.trim(), name: f.name.trim(), brand: f.brand.trim(), sku: f.sku.trim(),
    category: f.category, subcategory: f.subcategory.trim(), familyId: f.familyId.trim(), familyName: f.familyName.trim(),
    price: Number(f.price), mrp: Number(f.mrp === '' ? f.price : f.mrp), stock: Number(f.stock),
    description: f.description.trim(),
    features: lines(f.features), applications: lines(f.applications),
    badges: f.badges.split(',').map((s) => s.trim()).filter(Boolean),
    specs: f.specs.map((s) => ({ key: s.key.trim(), value: s.value.trim() })).filter((s) => s.key),
    temp: hasTemp ? { min: Number(f.tempMin), max: Number(f.tempMax) } : null,
    tempClass: f.tempClass, capacityL: f.capacityL === '' ? null : Number(f.capacityL),
    refrigerant: f.refrigerant.trim(), cooling: f.cooling.trim(),
    warrantyMonths: Number(f.warrantyMonths) || 0, sortOrder: Number(f.sortOrder) || 0,
    isFeatured: f.isFeatured, isActive: f.isActive,
  };
}

function validate(f) {
  if (!f.name.trim()) return 'Enter the product name.';
  if (!f.category) return 'Choose a category.';
  if (f.price === '' || Number(f.price) < 0) return 'Enter a price of 0 or more.';
  if (f.mrp !== '' && Number(f.mrp) < Number(f.price)) return 'MRP cannot be lower than the selling price.';
  if (!Number.isInteger(Number(f.stock)) || Number(f.stock) < 0) return 'Stock must be a whole number, 0 or more.';
  if ((f.tempMin === '') !== (f.tempMax === '')) return 'Enter both the minimum and maximum temperature, or leave both empty.';
  if (f.tempMin !== '' && Number(f.tempMin) > Number(f.tempMax)) return 'Minimum temperature cannot be above the maximum.';
  return '';
}

function Images({ product, onChange }) {
  const input = useRef(null);
  const { run, busy, flash, setFlash } = useAction();

  const upload = async (e) => {
    const files = [...e.target.files];
    e.target.value = '';
    if (!files.length) return;
    const bad = files.find((f) => !['image/jpeg', 'image/png', 'image/webp'].includes(f.type));
    if (bad) return setFlash({ ok: false, text: `${bad.name} is not a JPG, PNG or WebP image.` });
    const big = files.find((f) => f.size > MAX_IMAGE_MB * 1024 * 1024);
    if (big) return setFlash({ ok: false, text: `${big.name} is larger than ${MAX_IMAGE_MB} MB.` });
    if (product.images.length + files.length > 8) return setFlash({ ok: false, text: 'A product can have up to 8 images.' });
    const updated = await run(() => api.admin.uploadImages(product._id, files), 'Images uploaded.');
    if (updated) onChange(updated);
  };
  const remove = async (img) => {
    const updated = await run(() => api.admin.deleteImage(product._id, img._id), 'Image removed.');
    if (updated) onChange(updated);
  };
  const makeMain = async (img) => {
    const order = [img._id, ...product.images.filter((i) => i._id !== img._id).map((i) => i._id)];
    const updated = await run(() => api.admin.reorderImages(product._id, order), 'Main image changed.');
    if (updated) onChange(updated);
  };

  return (
    <>
      <h3>Images</h3>
      <Flash flash={flash} />
      <div className="ad-images">
        {product.images.map((img, i) => (
          <figure key={img._id}>
            <img src={productImage(img.url)} alt="" />
            <figcaption>
              {i === 0 ? <Pill value="Main" tone="ok" /> : <button className="auth__link" disabled={busy} onClick={() => makeMain(img)}>Make main</button>}
              <button className="auth__link ad-danger" disabled={busy} onClick={() => remove(img)}>Remove</button>
            </figcaption>
          </figure>
        ))}
        {product.images.length === 0 && <p className="muted">No images yet.</p>}
      </div>
      <input ref={input} type="file" accept="image/jpeg,image/png,image/webp" multiple hidden onChange={upload} aria-label="Choose product images" />
      <button className="btn btn-ghost btn-sm" disabled={busy || product.images.length >= 8} onClick={() => input.current.click()}>{busy ? 'Working…' : 'Upload images'}</button>
      <small className="muted">JPG, PNG or WebP, up to {MAX_IMAGE_MB} MB each, 8 per product. The first image is the main photo.</small>
    </>
  );
}

function Editor({ initial, categories, onClose, onSaved }) {
  const [product, setProduct] = useState(initial);
  const [f, setF] = useState(() => toForm(initial));
  const { run, busy, flash, setFlash } = useAction();
  const category = categories.find((c) => c._id === f.category);

  const save = async () => {
    const problem = validate(f);
    if (problem) return setFlash({ ok: false, text: problem });
    const isEdit = Boolean(product);
    const saved = await run(
      () => (product ? api.admin.updateProduct(product._id, toPayload(f)) : api.admin.createProduct(toPayload(f))),
      product ? 'Product saved.' : 'Product created. You can now add images.'
    );
    if (saved) {
      setProduct(saved); setF(toForm(saved)); onSaved();
      // Close the panel after updating an existing product;
      // keep it open for new products so the admin can add images.
      if (isEdit) onClose();
    }
  };
  const setSpec = (i, k, v) => setF({ ...f, specs: f.specs.map((s, j) => (j === i ? { ...s, [k]: v } : s)) });
  const moveSpec = (i, d) => {
    const specs = [...f.specs]; const j = i + d;
    if (j < 0 || j >= specs.length) return;
    [specs[i], specs[j]] = [specs[j], specs[i]]; setF({ ...f, specs });
  };

  return (
    <Drawer wide title={product ? `Edit ${product.model || product.name}` : 'Add a product'} onClose={onClose}
      footer={<><Flash flash={flash} /><button className="btn btn-ghost btn-sm" onClick={onClose}>Close</button><button className="btn btn-primary btn-sm" onClick={save} disabled={busy}>{busy ? 'Saving…' : product ? 'Save changes' : 'Create product'}</button></>}>
      <h3>Basics</h3>
      <div className="ad-form">
        <Text label="Model number" f={f} set={setF} k="model" maxLength={100} hint="Shown as the headline, e.g. EGN 1500 C4" />
        <Text label="Product name" f={f} set={setF} k="name" maxLength={200} required />
        <Text label="Brand" f={f} set={setF} k="brand" maxLength={100} />
        <Text label="SKU (optional)" f={f} set={setF} k="sku" maxLength={60} />
        <Select label="Category" f={f} set={setF} k="category" options={[['', 'Choose a category'], ...categories.map((c) => [c._id, c.isActive ? c.name : `${c.name} (hidden)`])]} />
        <F2 label="Product type">
          {(id) => (
            <>
              <input id={id} className="input" list={`${id}-subs`} value={f.subcategory} maxLength={100} onChange={(e) => setF({ ...f, subcategory: e.target.value })} />
              <datalist id={`${id}-subs`}>{(category?.subcategories || []).map((s) => <option key={s} value={s} />)}</datalist>
            </>
          )}
        </F2>
        <Area label="Description" f={f} set={setF} k="description" rows={3} />
      </div>

      <h3>Price and stock</h3>
      <div className="ad-form">
        <Num label="Selling price (₹)" f={f} set={setF} k="price" min={0} />
        <Num label="MRP (₹)" f={f} set={setF} k="mrp" min={0} hint="Leave equal to the price if there is no discount" />
        <Num label="Stock (units)" f={f} set={setF} k="stock" min={0} step={1} />
        <Num label="Warranty (months)" f={f} set={setF} k="warrantyMonths" min={0} step={1} />
        <Check label="Active: visible and orderable on the store" f={f} set={setF} k="isActive" />
        <Check label="Featured on the home page" f={f} set={setF} k="isFeatured" />
      </div>
      {product?.priceSource && product.priceSource !== 'confirmed' && (
        <p className="acct__warn">This price was imported as a reference price and has not been confirmed. Saving a new price marks it as confirmed.</p>
      )}

      <h3>Specifications</h3>
      <div className="ad-specs">
        {f.specs.map((s, i) => (
          <div key={i}>
            <input className="input" placeholder="Label, e.g. Capacity" aria-label={`Specification ${i + 1} label`} value={s.key} maxLength={100} onChange={(e) => setSpec(i, 'key', e.target.value)} />
            <input className="input" placeholder="Value, e.g. 1300 L" aria-label={`Specification ${i + 1} value`} value={s.value} maxLength={300} onChange={(e) => setSpec(i, 'value', e.target.value)} />
            <button onClick={() => moveSpec(i, -1)} disabled={i === 0} aria-label="Move up">↑</button>
            <button onClick={() => moveSpec(i, 1)} disabled={i === f.specs.length - 1} aria-label="Move down">↓</button>
            <button onClick={() => setF({ ...f, specs: f.specs.filter((_, j) => j !== i) })} aria-label="Remove specification">×</button>
          </div>
        ))}
        <button className="btn btn-ghost btn-sm" onClick={() => setF({ ...f, specs: [...f.specs, { key: '', value: '' }] })}>Add a specification</button>
      </div>
      <div className="ad-form">
        <Area label="Key features (one per line)" f={f} set={setF} k="features" rows={4} />
        <Area label="Applications (one per line)" f={f} set={setF} k="applications" rows={2} />
        <Text label="Badges (comma separated)" f={f} set={setF} k="badges" wide hint="Short tags shown on the product card, e.g. Frost Free, SS 304" />
      </div>

      <h3>Used by the storefront filters</h3>
      <div className="ad-form">
        <Num label="Minimum temperature (°C)" f={f} set={setF} k="tempMin" />
        <Num label="Maximum temperature (°C)" f={f} set={setF} k="tempMax" />
        <Select label="Temperature class" f={f} set={setF} k="tempClass" options={TEMP_CLASSES.map((t) => [t, t || 'Not applicable'])} />
        <Num label="Capacity (litres)" f={f} set={setF} k="capacityL" min={0} />
        <Text label="Refrigerant" f={f} set={setF} k="refrigerant" maxLength={40} />
        <Text label="Cooling type" f={f} set={setF} k="cooling" maxLength={100} />
        <Text label="Series ID" f={f} set={setF} k="familyId" maxLength={100} hint="Products with the same series ID are listed as variants of each other" />
        <Num label="Sort order" f={f} set={setF} k="sortOrder" step={1} hint="Lower numbers appear first" />
      </div>

      {product ? <Images product={product} onChange={(p) => { setProduct(p); onSaved(); }} /> : <p className="muted">Create the product first, then add its images.</p>}
    </Drawer>
  );
}

// Same field wrapper as ui.jsx's F, for a custom control
let fid = 0;
function F2({ label, children }) {
  const [id] = useState(() => `adp-${++fid}`);
  return <div className="field"><label htmlFor={id}>{label}</label>{children(id)}</div>;
}

export default function ProductsAdmin() {
  const { reloadCatalogue, settings } = useApp();
  const list = useList(api.admin.products, { sort: 'newest' });
  const { data: categories } = useAsync(() => api.admin.categories(), []);
  const [editing, setEditing] = useState(undefined); // undefined closed, null new, object edit
  const { run, busy, flash } = useAction();

  // The storefront reads the catalogue once per visit: refresh it after a change
  const changed = () => { list.reload(); reloadCatalogue(); };

  const setStock = async (p, stock) => {
    if (stock < 0) return;
    const updated = await run(() => api.admin.setStock(p._id, stock));
    if (updated) { list.patch(p._id, { stock: updated.stock }); reloadCatalogue(); }
  };
  const toggle = async (p) => {
    const updated = await run(() => api.admin.toggleProduct(p._id), (u) => `${p.model || p.name} is now ${u.isActive ? 'active' : 'hidden'}.`);
    if (updated) { list.patch(p._id, { isActive: updated.isActive }); reloadCatalogue(); }
  };
  const remove = async (p) => {
    if (!window.confirm(`Delete ${p.model || p.name}? Products that have orders are archived (hidden) instead of deleted.`)) return;
    const res = await run(() => api.admin.deleteProduct(p._id), (r) => r.message);
    if (res) changed();
  };
  const stockTone = (p) => (p.stock === 0 ? 'out' : p.stock <= (settings.lowStockThreshold ?? 3) ? 'low' : 'ok');

  return (
    <>
      <Head title="Products & stock" sub="Everything on sale, with its price and stock.">
        <button className="btn btn-primary btn-sm" onClick={() => setEditing(null)}>Add product</button>
      </Head>
      <Flash flash={flash} />

      <div className="ad-toolbar">
        <input className="input" type="search" placeholder="Search by model, name or SKU" aria-label="Search products" value={list.search} onChange={(e) => list.setSearch(e.target.value)} />
        <select className="select" aria-label="Category" value={list.query.category || ''} onChange={(e) => list.setFilter('category', e.target.value)}>
          <option value="">All categories</option>
          {(categories || []).map((c) => <option key={c._id} value={c._id}>{c.name}</option>)}
        </select>
        <select className="select" aria-label="Status" value={list.query.isActive ?? ''} onChange={(e) => list.setFilter('isActive', e.target.value)}>
          <option value="">Active and hidden</option><option value="true">Active</option><option value="false">Hidden</option>
        </select>
        <select className="select" aria-label="Stock level" value={list.query.stockStatus || ''} onChange={(e) => list.setFilter('stockStatus', e.target.value)}>
          <option value="">Any stock level</option><option value="in">In stock</option><option value="low">Low stock</option><option value="out">Out of stock</option>
        </select>
        <select className="select" aria-label="Sort" value={list.query.sort} onChange={(e) => list.setFilter('sort', e.target.value)}>
          <option value="newest">Newest first</option><option value="name">Model, A to Z</option><option value="stock_asc">Stock, low to high</option>
          <option value="price_asc">Price, low to high</option><option value="price_desc">Price, high to low</option><option value="popular">Best selling</option>
        </select>
      </div>

      <div className="ad-tablewrap">
        <table className="ad-table">
          <thead><tr><th>Product</th><th>Category</th><th>Price</th><th>Stock</th><th>Status</th><th><span className="sr-only">Actions</span></th></tr></thead>
          <tbody>
            <ListState list={list} cols={6} empty="No products match. Clear the filters or add a product." />
            {list.items.map((p) => (
              <tr key={p._id}>
                <td>
                  <div className="ad-prod">
                    <img src={productImage(p.images?.[0]?.url)} alt="" loading="lazy" />
                    <div><strong>{p.model || p.name}</strong>{p.isFeatured && <Pill value="Featured" tone="confirmed" />}<small>{p.model ? p.name : p.sku}</small></div>
                  </div>
                </td>
                <td>{p.category?.name}<small>{p.subcategory}</small></td>
                <td className="num">{fmtPrice(p.price)}{p.priceSource !== 'confirmed' && <small>Not confirmed</small>}</td>
                <td>
                  <span className="ad-stock">
                    <button onClick={() => setStock(p, p.stock - 1)} disabled={busy || p.stock === 0} aria-label={`Remove one ${p.model || p.name} from stock`}>−</button>
                    <span className="num">{p.stock}</span>
                    <button onClick={() => setStock(p, p.stock + 1)} disabled={busy} aria-label={`Add one ${p.model || p.name} to stock`}>+</button>
                  </span>
                  <Pill value={p.stock === 0 ? 'Out' : stockTone(p) === 'low' ? 'Low' : 'In stock'} tone={stockTone(p)} />
                </td>
                <td><button className="ad-toggle" onClick={() => toggle(p)} disabled={busy} title="Click to change"><Pill value={p.isActive ? 'Active' : 'Hidden'} tone={p.isActive ? 'active' : 'draft'} /></button></td>
                <td className="ad-actions">
                  <button onClick={() => setEditing(p)}>Edit</button>
                  {p.isActive && <a href={`/product/${p.slug}`} target="_blank" rel="noreferrer">View</a>}
                  <button className="ad-danger" onClick={() => remove(p)} disabled={busy}>Delete</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <ServerPager list={list} />

      {editing !== undefined && <Editor initial={editing} categories={categories || []} onClose={() => setEditing(undefined)} onSaved={changed} />}
    </>
  );
}
