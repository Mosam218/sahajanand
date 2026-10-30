import { useId, useState } from 'react';
import { api } from '../../services/api.js';
import { useCatalogue } from '../../hooks/useCatalogue.js';
import { useApp } from '../../context/AppContext.jsx';
import Icon from '../Icon/Icon.jsx';

const EMPTY = { name: '', company: '', email: '', phone: '', city: '', product: '', quantity: '1', message: '' };

function validate(v) {
  const e = {};
  if (!v.name.trim()) e.name = 'Enter your name.';
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.email)) e.email = 'Enter an email address like name@company.com.';
  if (v.phone.replace(/\D/g, '').length < 8) e.phone = 'Enter a phone number with at least 8 digits.';
  if (!(Number.isInteger(Number(v.quantity)) && Number(v.quantity) >= 1)) e.quantity = 'Quantity must be a whole number, 1 or more.';
  return e;
}

export default function QuoteForm({ initialProduct = '', onDone }) {
  const { products } = useCatalogue();
  const { user } = useApp();
  const uid = useId();
  const [values, setValues] = useState({ ...EMPTY, product: initialProduct, name: user?.name || '', email: user?.email || '', phone: user?.phone || '', company: user?.company || '' });
  const [errors, setErrors] = useState({});
  const [status, setStatus] = useState('idle'); // idle | sending | sent | failed
  const [failure, setFailure] = useState('');
  const [reference, setReference] = useState('');

  const set = (k) => (e) => setValues((v) => ({ ...v, [k]: e.target.value }));

  const submit = async (e) => {
    e.preventDefault();
    const found = validate(values);
    setErrors(found);
    if (Object.keys(found).length) {
      document.getElementById(`${uid}-${Object.keys(found)[0]}`)?.focus();
      return;
    }
    setStatus('sending');
    try {
      const enquiry = await api.submitEnquiry({ ...values, quantity: Number(values.quantity) });
      setReference(enquiry.reference);
      setStatus('sent');
    } catch (err) {
      // Show which fields the server rejected, or why the request failed
      const fields = err.fields || {};
      if (Object.keys(fields).length) setErrors(fields);
      setFailure(Object.keys(fields).length ? 'Please correct the highlighted fields.' : err.message);
      setStatus('failed');
    }
  };

  if (status === 'sent') {
    return (
      <div className="quote-done" role="status">
        <span className="quote-done__icon"><Icon name="check" size={28} /></span>
        <h3>Thank you. Our sales team will contact you shortly.</h3>
        <p className="muted">
          {values.product ? `Your enquiry for ${values.product} has been received.` : 'Your enquiry has been received.'}
          {reference && <> Reference <strong className="num">{reference}</strong>.</>}
        </p>
        <button className="btn btn-ghost" onClick={() => { setValues({ ...EMPTY }); setStatus('idle'); onDone?.(); }}>
          {onDone ? 'Close' : 'Send another enquiry'}
        </button>
      </div>
    );
  }

  const field = (key, label, props = {}, required = false) => (
    <div className="field">
      <label htmlFor={`${uid}-${key}`}>{label}{required ? '' : ' (optional)'}</label>
      <input
        id={`${uid}-${key}`} className="input" value={values[key]} onChange={set(key)}
        aria-invalid={errors[key] ? 'true' : undefined}
        aria-describedby={errors[key] ? `${uid}-${key}-err` : undefined}
        {...props}
      />
      {errors[key] && <p className="field-error" id={`${uid}-${key}-err`}>{errors[key]}</p>}
    </div>
  );

  return (
    <form className="quote-form" onSubmit={submit} noValidate>
      {field('name', 'Name', { autoComplete: 'name', maxLength: 100 }, true)}
      {field('company', 'Company', { autoComplete: 'organization' })}
      {field('email', 'Email', { type: 'email', autoComplete: 'email', inputMode: 'email' }, true)}
      {field('phone', 'Phone', { type: 'tel', autoComplete: 'tel', inputMode: 'tel' }, true)}
      {field('city', 'City', { autoComplete: 'address-level2' })}
      {field('quantity', 'Quantity', { type: 'number', min: 1, step: 1, inputMode: 'numeric' }, true)}
      <div className="field quote-form__wide">
        <label htmlFor={`${uid}-product`}>Product (optional)</label>
        <input id={`${uid}-product`} className="input" list={`${uid}-models`} value={values.product} onChange={set('product')}
          placeholder="Model number, or describe what you need" />
        <datalist id={`${uid}-models`}>
          {products.map((p) => <option key={p.id} value={p.model}>{p.name}</option>)}
        </datalist>
      </div>
      <div className="field quote-form__wide">
        <label htmlFor={`${uid}-message`}>Message (optional)</label>
        <textarea id={`${uid}-message`} className="textarea" value={values.message} onChange={set('message')} maxLength={2000}
          placeholder="Site, timeline, or anything our sales team should know" />
      </div>
      {status === 'failed' && (
        <p className="field-error quote-form__wide" role="alert">
          {failure || 'The enquiry was not sent. Check your connection and request the quote again.'}
        </p>
      )}
      <button className="btn btn-primary quote-form__wide" disabled={status === 'sending'}>
        {status === 'sending' ? 'Sending request' : 'Request a quote'}
      </button>
    </form>
  );
}
