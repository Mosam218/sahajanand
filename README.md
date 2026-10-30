# Sahajanand Electronics

E-commerce website for Sahajanand Electronics, authorised Elanpro reseller serving
Gandhinagar and Ahmedabad, Gujarat.

| Folder | What it is |
|---|---|
| `frontend/` | Storefront and admin panel. Vite + React 18, plain CSS, no UI framework. |
| `backend/` | REST API. Node.js + Express + MongoDB (Mongoose). |

Sign-in uses Firebase Authentication (email + password). Online payment uses Razorpay
and image storage uses Cloudinary; both are optional and switch themselves off when
not configured (cash on delivery and local image storage are used instead).

## Run it locally with no cloud accounts

Requires Node 20. Three terminals:

```bash
# 1. Sign-in emulator (repository root)
npx firebase-tools emulators:start --only auth --project demo-sahajanand

# 2. API with a local database and the Elanpro catalogue loaded
cd backend && npm install && npm run dev:local        # http://localhost:5000

# 3. Website
cd frontend && npm install
cp .env.example .env.local    # then set the four values below
npm run dev                                            # http://localhost:5173
```

`frontend/.env.local` for the emulator:

```
VITE_API_URL=http://localhost:5000/api
VITE_FIREBASE_API_KEY=demo-key
VITE_FIREBASE_PROJECT_ID=demo-sahajanand
VITE_FIREBASE_AUTH_EMULATOR_URL=http://127.0.0.1:9099
```

Create an account on the site, then make it an admin:

```bash
cd backend && MONGODB_URI=mongodb://127.0.0.1:27018/sahajanand FIREBASE_PROJECT_ID=demo-sahajanand \
  FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:9099 CLIENT_URLS=http://localhost:5173 \
  npm run make-admin -- you@example.com superadmin
```

The admin panel is at `/admin`.

## Going live: what has to be configured

Everything is listed with instructions in `backend/.env.example` and `frontend/.env.example`.

1. **MongoDB** (for example MongoDB Atlas): `MONGODB_URI`.
2. **Firebase project** with Email/Password sign-in enabled: the service account goes in
   `backend/.env`, the web app config in `frontend/.env`.
3. **Admin accounts**: put the owners' emails in `SUPER_ADMIN_EMAILS` / `ADMIN_EMAILS`.
   They become admins when they sign in with a *verified* email address
   (or use `npm run make-admin`).
4. **Catalogue**: `npm run seed` loads the Elanpro catalogue with **zero stock and
   reference prices**. Set real prices and stock in Admin → Products & stock.
5. **Store details**: phone, email, address, GSTIN, hours, delivery charge and GST rule are
   entered in Admin → Settings. Nothing is shown on the site until it is filled in.
   **Policy pages** (privacy, terms, shipping, returns) are published the same way: paste the
   approved text there. No policy text ships with the code.
6. **Razorpay** (optional): keys in `backend/.env`, webhook pointing at
   `/api/payments/webhook`. Without it only pay-on-delivery is offered.
7. **Cloudinary** (recommended on hosts with a temporary disk) for uploaded images.
8. **SMTP** (optional) for order and enquiry emails.
9. Set `CLIENT_URLS` to the website's address, `VITE_API_URL` to the API's address,
   and serve `frontend/dist` with a fallback to `index.html` for unknown paths.

## Roles

| Role | Can do |
|---|---|
| Customer | Browse, cart, checkout, own orders, addresses, enquiries. |
| Admin | Everything in the admin panel except the two items below. |
| Super admin | Also: change store settings, change roles, deactivate other admins. |

Roles are enforced by the API on every request; the admin screens are only a view.

## Checks

```bash
cd backend && npm test && npm run lint     # API tests (in-memory MongoDB, no .env needed)
cd frontend && npm run build               # production build
```

API reference: `backend/README.md`. Also see `backend/docs/SECURITY.md` (access rules and the
tested admin authorisation matrix), `backend/docs/ORDER_STATES.md` (order and payment state
machine) and `backend/docs/CATALOGUE.md` (what each product still needs from the business).
