import { useMemo } from 'react';
import { useApp } from '../context/AppContext.jsx';

// Catalogue selectors on top of the products and categories AppContext loaded from the API.
export function useCatalogue() {
  const { products, categories } = useApp();
  return useMemo(() => {
    const counts = {};
    for (const p of products) counts[p.category] = (counts[p.category] || 0) + 1;
    return {
      products,
      categories,
      counts,
      getCategory: (slug) => categories.find((c) => c.slug === slug),
      getProduct: (id) => products.find((p) => p.id === id),
      getByModel: (model) => products.find((p) => p.model === model),
      byCategory: (slug) => products.filter((p) => p.category === slug),
      byFamily: (id) => products.filter((p) => p.familyId === id),
    };
  }, [products, categories]);
}
