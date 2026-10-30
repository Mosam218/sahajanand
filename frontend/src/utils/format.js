import { API_ORIGIN } from '../services/api.js';

export const slugify = (s) =>
  String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');

export const PLACEHOLDER_IMAGE = '/images/placeholder.svg';

// Images come from the API as full URLs (uploads, Cloudinary, elanpro.net) or
// as site paths ("/images/products/x.webp"). A bare name is a local product key.
const resolve = (key, folder, ext) => {
  if (!key) return PLACEHOLDER_IMAGE;
  if (/^https?:\/\//.test(key)) return key;
  if (key.startsWith('/uploads/')) return `${API_ORIGIN}${key}`;
  if (key.startsWith('/')) return key;
  return `/images/${folder}/${key}.${ext}`;
};
export const productImage = (key) => resolve(key, 'products', 'webp');
export const sceneImage = (key) => resolve(key, 'scenes', 'jpg');

// Format Indian rupee
export const fmtPrice = (n) =>
  '₹' + Number(n || 0).toLocaleString('en-IN');

// Temperature class derived from the catalogue's printed range.
export function tempClass(t) {
  if (!t) return null;
  const [min, max] = t;
  if (min >= 30) return 'Heated';
  if (min <= -40) return 'Ultra-low';
  if (min < 0 && max > 0) return 'Dual / convertible';
  if (max <= 0) return 'Freezer';
  return 'Chiller';
}

export const fmtTemp = (n) => `${n < 0 ? '−' : ''}${Math.abs(n)}°C`;

// Product photos can fail to load (a remote photo is blocked, an upload was
// removed). A photo with a registered alternative falls back to it; anything
// else falls back to a neutral placeholder. One global handler does the swap.
const IMAGE_FALLBACKS = new Map();
export function registerImageFallback(url, fallbackUrl) {
  if (url && fallbackUrl && url !== fallbackUrl) IMAGE_FALLBACKS.set(url, fallbackUrl);
  return url;
}
export function installImageFallback() {
  document.addEventListener('error', (e) => {
    const img = e.target;
    if (!(img instanceof HTMLImageElement)) return;
    const src = img.getAttribute('src');
    const fallback = IMAGE_FALLBACKS.get(src);
    if (fallback && img.dataset.fallback !== fallback) {
      img.dataset.fallback = fallback;
      img.src = fallback;
    } else if (src !== PLACEHOLDER_IMAGE && /\/(products|uploads)\/|^https?:/.test(src || '')) {
      img.src = PLACEHOLDER_IMAGE;
    }
  }, true);
}

export const fmtDate = (iso) => new Date(iso).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
export const fmtDateTime = (iso) => new Date(iso).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });

export const telHref = (phone) => `tel:${String(phone).replace(/[^+\d]/g, '')}`;
export const capitalise = (s) => (s ? s.charAt(0).toUpperCase() + s.slice(1).replace(/_/g, ' ') : '');
