# Sahajanand Electronics: storefront and admin panel

Vite + React 18 single-page app. Plain CSS with design tokens in
`src/styles/tokens.css`; no UI framework and a small built-in router.

All data comes from the backend API (`VITE_API_URL`). Nothing is stored in the
browser except the guest cart, which is merged into the account's cart on sign-in.

```bash
npm install
cp .env.example .env     # see the comments in the file
npm run dev              # http://localhost:5173
npm run build            # production build in dist/
```

See the repository README for running the whole stack locally.

## Where things live

```
public/images/        catalogue product photos and scene photos
src/
  services/api.js     the only file that talks to the API
  services/mappers.js API records → the shapes the components use
  services/firebase.js, razorpay.js   sign-in and online payment
  context/AppContext.jsx   catalogue, session, cart, compare, quote modal
  hooks/              useCatalogue, useAsync, useSeo
  components/         Navbar, Hero, ProductCard, CartDrawer, QuoteModal ...
  pages/              Home, Products, Category, ProductDetails, Compare, Solutions,
                      About, Contact, Auth, Account, Checkout, OrderPlaced, NotFound
  admin/              admin panel (dashboard, orders, enquiries, customers,
                      products & stock, categories, coupons, banners, settings, activity)
  data/brand.js       facts about the Elanpro brand, as printed in its catalogue
  data/industries.js  sectors and the categories that serve them
```

Routes: `/`, `/products` (`?q=` for search), `/category/:slug`, `/product/:slug`,
`/compare`, `/solutions`, `/about`, `/contact`, `/login`, `/signup`,
`/account/:tab`, `/checkout`, `/order/:id`, `/admin/...`.

Deploying: the host must serve `index.html` for unknown paths.
