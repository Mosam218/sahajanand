// Picks the two or three most useful rows for a product card.
const PRIORITY = [/^(gross |total |effective |rated |storage |cooling )?capacity|storage volume|production$/i, /temperature/i, /dimension|external size/i];

export function keySpecs(product, max = 3) {
  const out = [];
  for (const re of PRIORITY) {
    const hit = product.specifications.find((s) => re.test(s.label) && !out.includes(s));
    if (hit) out.push(hit);
  }
  for (const s of product.specifications) {
    if (out.length >= max) break;
    if (!out.includes(s)) out.push(s);
  }
  return out.slice(0, max);
}

export const CAPACITY_BUCKETS = [
  { key: 'Under 100 L', test: (c) => c < 100 },
  { key: '100 to 299 L', test: (c) => c >= 100 && c < 300 },
  { key: '300 to 599 L', test: (c) => c >= 300 && c < 600 },
  { key: '600 to 999 L', test: (c) => c >= 600 && c < 1000 },
  { key: '1000 L and above', test: (c) => c >= 1000 },
];
export const capacityBucket = (c) => (c == null ? null : CAPACITY_BUCKETS.find((b) => b.test(c)).key);
