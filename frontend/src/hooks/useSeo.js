import { useEffect } from 'react';

const SITE = (import.meta.env.VITE_SITE_URL || '').replace(/\/$/, '');
const DEFAULT_TITLE = 'Sahajanand Electronics | Authorised Elanpro reseller';

function setMeta(selector, attrs, content) {
  let el = document.head.querySelector(selector);
  if (!content) { el?.remove(); return; }
  if (!el) {
    el = document.createElement('meta');
    for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
    document.head.appendChild(el);
  }
  el.setAttribute('content', content);
}

function setLink(rel, href) {
  let el = document.head.querySelector(`link[rel="${rel}"]`);
  if (!href) { el?.remove(); return; }
  if (!el) {
    el = document.createElement('link');
    el.setAttribute('rel', rel);
    document.head.appendChild(el);
  }
  el.setAttribute('href', href);
}

/**
 * Page title, description, canonical URL, Open Graph tags and optional
 * JSON-LD structured data for the current page.
 *
 * @param {{title?: string, description?: string, path?: string, image?: string, jsonLd?: object, noindex?: boolean}} seo
 */
export function useSeo({ title, description, path, image, jsonLd, noindex = false } = {}) {
  const ld = jsonLd ? JSON.stringify(jsonLd) : '';

  useEffect(() => {
    if (title) document.title = title;
    const origin = SITE || window.location.origin;
    const url = path ? `${origin}${path}` : '';
    const absoluteImage = image && (/^https?:/.test(image) ? image : `${origin}${image}`);

    setMeta('meta[name="description"]', { name: 'description' }, description);
    setMeta('meta[name="robots"]', { name: 'robots' }, noindex ? 'noindex, nofollow' : '');
    setLink('canonical', noindex ? '' : url);
    setMeta('meta[property="og:title"]', { property: 'og:title' }, title);
    setMeta('meta[property="og:description"]', { property: 'og:description' }, description);
    setMeta('meta[property="og:url"]', { property: 'og:url' }, url);
    setMeta('meta[property="og:image"]', { property: 'og:image' }, absoluteImage);

    let script = document.getElementById('page-jsonld');
    if (ld) {
      if (!script) {
        script = document.createElement('script');
        script.type = 'application/ld+json';
        script.id = 'page-jsonld';
        document.head.appendChild(script);
      }
      script.textContent = ld;
    } else {
      script?.remove();
    }

    return () => { document.title = DEFAULT_TITLE; };
  }, [title, description, path, image, ld, noindex]);
}
