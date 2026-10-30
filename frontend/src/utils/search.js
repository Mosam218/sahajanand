const norm = (s) => String(s).toLowerCase();
const compact = (s) => norm(s).replace(/[^a-z0-9]/g, '');

// Matches every word of the query against model, name, category and subcategory.
// "egn1500", "EGN 1500", "blast", "wine" all work.
export function searchProducts(query, list) {
  const q = norm(query).trim();
  if (!q) return [];
  const words = q.split(/\s+/);
  const qCompact = compact(q);
  return list
    .map((p) => {
      const hay = norm([p.model, p.name, p.familyName, p.categoryName, p.subcategory, p.brand, p.sku].join(' '));
      const model = compact(p.model);
      let score = 0;
      if (model === qCompact) score = 100;
      else if (model.startsWith(qCompact)) score = 80;
      else if (qCompact.length > 1 && model.includes(qCompact)) score = 60;
      else if (words.every((w) => hay.includes(w) || compact(hay).includes(compact(w)))) score = 30;
      return { p, score };
    })
    .filter((r) => r.score > 0)
    .sort((a, b) => b.score - a.score)
    .map((r) => r.p);
}
