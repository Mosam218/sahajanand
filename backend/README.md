# Sahajanand Electronics & Refrigeration LLP — Backend API

REST API for the Sahajanand Electronics e-commerce platform. Built with **Node.js**, **Express**, **MongoDB**, **Firebase Auth**, **Razorpay** (optional), and **Cloudinary** (optional).

To run it without any cloud accounts, use `npm run dev:local` (see the repository README).

---

## Table of Contents

- [Quick Start](#quick-start)
- [Environment Variables](#environment-variables)
- [NPM Scripts](#npm-scripts)
- [API Endpoints](#api-endpoints)
- [Payment Flow](#payment-flow)
- [Razorpay Webhook Setup](#razorpay-webhook-setup)
- [Deployment (Render + Docker)](#deployment)
- [Common Errors](#common-errors)

---

## Quick Start

```bash
# 1. Clone and install
cd backend
npm install

# 2. Copy and fill environment variables
cp .env.example .env
# Fill in all required values (see table below)

# 3. Load the Elanpro catalogue (zero stock, reference prices: set both in the admin panel)
npm run seed

# 4. Start the dev server
npm run dev
# → Server runs at http://localhost:5000

# 5. Run tests
npm test
```

---

## Environment Variables

| Variable | Required | Where to get it |
|---|---|---|
| `NODE_ENV` | Yes | `development`, `production`, or `test` |
| `PORT` | No | Default: `5000` |
| `CLIENT_URLS` | Yes | Comma-separated frontend origins for CORS |
| `MONGODB_URI` | Yes | [MongoDB Atlas](https://cloud.mongodb.com) → Connect → Connection string |
| `FIREBASE_PROJECT_ID` | Yes | Firebase Console → Project Settings → General |
| `FIREBASE_CLIENT_EMAIL` | Yes | Firebase Console → Project Settings → Service Accounts → Generate Key → `client_email` |
| `FIREBASE_PRIVATE_KEY` | Yes | Same JSON file → `private_key` (escape `\n` as `\\n` in `.env`) |
| `RAZORPAY_KEY_ID` | No (all three or none) | [Razorpay Dashboard](https://dashboard.razorpay.com) → Settings → API Keys |
| `RAZORPAY_KEY_SECRET` | No | Same page |
| `RAZORPAY_WEBHOOK_SECRET` | No | Razorpay Dashboard → Webhooks → Create → Secret |
| `CLOUDINARY_CLOUD_NAME` | No (all three or none) | [Cloudinary Dashboard](https://cloudinary.com/console) |
| `CLOUDINARY_API_KEY` | No | Same page |
| `CLOUDINARY_API_SECRET` | No | Same page |
| `ADMIN_EMAILS` | No | Comma-separated emails that become admin on login (verified emails only) |
| `SUPER_ADMIN_EMAILS` | No | Same, for super admins (settings, roles) |
| `GST_PERCENT` | No | Default `18`; added at checkout only when `GST_INCLUSIVE=false` |
| `PUBLIC_API_URL` | No | Public URL of this API, for links to locally stored uploads |
| `ENABLE_COD` | No | `true` / `false` (default: `true`) |
| `FREE_DELIVERY_ABOVE` | No | Amount in ₹ (default: `10000`) |
| `DELIVERY_CHARGE` | No | Amount in ₹ (default: `500`) |
| `GST_INCLUSIVE` | No | `true` / `false` (default: `true`) |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `EMAIL_FROM` | No | Any SMTP provider. Email is a safe no-op if missing. |

---

## NPM Scripts

| Script | Description |
|---|---|
| `npm start` | Start production server |
| `npm run dev` | Start with nodemon (hot reload) |
| `npm run seed` | Load the Elanpro catalogue (never overwrites edits) |
| `npm run dev:local` | Run with a local database and the Firebase Auth emulator |
| `npm run make-admin -- <email> [admin\|superadmin\|user]` | Change an account's role |
| `npm run seed:destroy` | Delete all seeded data |
| `npm test` | Run all tests |
| `npm run test:coverage` | Run tests with coverage report |
| `npm run lint` | Lint the codebase |

---

## API Endpoints

All routes are prefixed with `/api`.

### Health
| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/health` | — | Server status, uptime, DB state |

### Auth
| Method | Path | Auth | Description |
|---|---|---|---|
| POST | `/auth/login` | — | Verify Firebase token, upsert user |
| GET | `/auth/me` | User | Current user profile |
| POST | `/auth/logout` | User | Revoke refresh tokens |

### Users
| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/users/profile` | User | Get profile |
| PUT | `/users/profile` | User | Update name, phone |

### Categories
| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/categories` | — | List active categories with product counts |
| GET | `/categories/:slug` | — | Single category |

### Products
| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/products` | — | List with search, filters, pagination, sort |
| GET | `/products/featured` | — | Featured products |
| GET | `/products/new-arrivals` | — | Newest products |
| GET | `/products/brands` | — | All brand names |
| GET | `/products/:slug` | — | Single product + related |
| GET | `/products/:id/related` | — | Related products |

### Addresses
| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/addresses` | User | List user addresses |
| POST | `/addresses` | User | Create address (max 10) |
| PUT | `/addresses/:id` | User | Update address |
| DELETE | `/addresses/:id` | User | Delete address |
| PATCH | `/addresses/:id/default` | User | Set as default |

### Cart
| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/cart` | User | Get cart with current prices |
| POST | `/cart/items` | User | Add/increment item |
| PUT | `/cart/items/:productId` | User | Update quantity |
| DELETE | `/cart/items/:productId` | User | Remove item |
| DELETE | `/cart` | User | Clear cart |
| POST | `/cart/merge` | User | Merge guest cart after login |

### Wishlist
| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/wishlist` | User | Get wishlist |
| POST | `/wishlist/:productId` | User | Add product |
| DELETE | `/wishlist/:productId` | User | Remove product |

### Coupons
| Method | Path | Auth | Description |
|---|---|---|---|
| POST | `/coupons/validate` | User | Validate coupon code |

### Reviews
| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/reviews/product/:productId` | — | Product reviews with rating breakdown |
| POST | `/reviews/product/:productId` | User | Create review |
| PUT | `/reviews/:id` | User | Update own review |
| DELETE | `/reviews/:id` | User | Delete own review |

### Orders
| Method | Path | Auth | Description |
|---|---|---|---|
| POST | `/orders/checkout` | User | Create order (cart or buy-now) |
| GET | `/orders/my` | User | My orders (paginated) |
| GET | `/orders/:id` | User | Order detail |
| POST | `/orders/:id/cancel` | User | Cancel order |
| GET | `/orders/:id/invoice` | User | Invoice JSON |

### Payments
| Method | Path | Auth | Description |
|---|---|---|---|
| POST | `/payments/verify` | User | Verify Razorpay signature |
| POST | `/payments/failed` | User | Report payment failure |
| POST | `/payments/retry/:orderId` | User | Retry failed payment |
| POST | `/payments/webhook` | — | Razorpay webhook (raw body) |

### Added for the storefront
| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/settings` | — | Store name, contact details, pricing rules, available payment methods |
| GET | `/settings/policies/:key` | — | A published policy (`privacy`, `terms`, `shipping`, `returns`); 404 until the business enters it |
| GET | `/banners` | — | Homepage carousel slides |
| GET | `/coupons` | — | Coupons the store chose to advertise |
| POST | `/enquiries` | — (optional) | Request a quote; linked to the account when signed in |
| GET | `/enquiries/my` | User | Enquiries sent from this account |
| POST | `/orders/quote` | User | Server-side totals for the cart or given items (coupon, GST, delivery) |

Responses are `{ success, message, data, meta? }`; errors are `{ success: false, message, errors? }`
with `errors` as `[{ field, message }]`. List endpoints take `page` and `limit` and return
`meta: { page, limit, total, totalPages }`.

### Admin (`/api/admin/*`)

Every admin route requires an admin or super admin token. Additional routes:
`GET /admin/enquiries`, `PATCH|DELETE /admin/enquiries/:id`, `GET|POST /admin/banners`,
`PUT|DELETE /admin/banners/:id`, `GET /admin/settings`, `PUT /admin/settings` (super admin),
`GET /admin/activity`, `PATCH /admin/orders/:id/resolve`, `PUT /admin/products/:id/images/order`.
Order status moves only placed → confirmed → shipped → delivered (or cancelled before shipping);
`PATCH /admin/users/:id/role` is super admin only.
| Method | Path | Description |
|---|---|---|
| GET | `/admin/dashboard` | Dashboard stats |
| GET/POST | `/admin/products` | List / Create products |
| GET/PUT/DELETE | `/admin/products/:id` | Single product CRUD |
| PATCH | `/admin/products/:id/stock` | Update stock |
| PATCH | `/admin/products/:id/toggle` | Toggle active |
| POST | `/admin/products/:id/images` | Upload images |
| DELETE | `/admin/products/:id/images/:imageId` | Delete image |
| GET/POST | `/admin/categories` | List / Create categories |
| GET/PUT/DELETE | `/admin/categories/:id` | Single category CRUD |
| GET | `/admin/orders` | List orders (filters) |
| GET | `/admin/orders/:id` | Order detail |
| PATCH | `/admin/orders/:id/status` | Update order status |
| PATCH | `/admin/orders/:id/payment-status` | Update payment status (COD) |
| POST | `/admin/orders/:id/refund` | Initiate refund |
| GET | `/admin/users` | List users |
| GET | `/admin/users/:id` | User detail + orders |
| PATCH | `/admin/users/:id/role` | Change role |
| PATCH | `/admin/users/:id/status` | Activate/deactivate |
| GET/POST | `/admin/coupons` | List / Create coupons |
| GET/PUT/DELETE | `/admin/coupons/:id` | Coupon CRUD |
| GET | `/admin/reviews` | List reviews |
| PATCH | `/admin/reviews/:id/approve` | Toggle approval |
| DELETE | `/admin/reviews/:id` | Delete review |
| GET | `/admin/payments` | List payments |

---

## Payment Flow

```
Frontend                          Backend                           Razorpay
   │                                │                                  │
   │ 1. POST /orders/checkout       │                                  │
   │ ──────────────────────────────> │                                  │
   │                                │ 2. Validate items, recompute     │
   │                                │    prices, create Order           │
   │                                │ 3. POST /orders (create)         │
   │                                │ ─────────────────────────────────>│
   │                                │ <─────────────────────────────────│
   │                                │ 4. Save razorpayOrderId           │
   │ <────────────────────────────── │ Return { order, razorpay: {...} }│
   │                                │                                  │
   │ 5. Open Razorpay checkout UI   │                                  │
   │ ───────────────────────────────────────────────────────────────────>│
   │ <───────────────────────────────────────────────────────────────────│
   │  payment_id, order_id, sig     │                                  │
   │                                │                                  │
   │ 6. POST /payments/verify       │                                  │
   │ ──────────────────────────────> │                                  │
   │                                │ 7. HMAC SHA256 verify            │
   │                                │ 8. finalizePaidOrder()           │
   │                                │    - Decrement stock atomically  │
   │                                │    - Mark paid + confirmed       │
   │                                │    - Clear cart                  │
   │ <────────────────────────────── │ 9. Return confirmed order       │
   │                                │                                  │
   │                                │ 10. Webhook (backup)             │
   │                                │ <─────────────────────────────────│
   │                                │ Verify raw body signature        │
   │                                │ finalizePaidOrder() (idempotent) │
   │                                │ ─────────────────────────────────>│
   │                                │  200 OK                          │
```

---

## Razorpay Webhook Setup

1. Go to [Razorpay Dashboard](https://dashboard.razorpay.com) → Webhooks
2. **URL**: `https://<your-backend-domain>/api/payments/webhook`
3. **Secret**: Set the same value as `RAZORPAY_WEBHOOK_SECRET` in your `.env`
4. **Events to subscribe**:
   - `payment.captured`
   - `order.paid`
   - `payment.failed`
   - `refund.processed`

---

## Deployment

### Render (Docker)

1. Push to a Git repo
2. Render → New Web Service → Docker
3. Add all environment variables
4. Set the root directory to `backend/` if in a monorepo
5. Deploy!

### Manual Docker

```bash
docker build -t sahajanand-api .
docker run -p 5000:5000 --env-file .env sahajanand-api
```

---

## Common Errors

| Error | Cause | Fix |
|---|---|---|
| `Environment validation failed` | Missing required `.env` vars | Check `.env.example` |
| `CORS: origin not allowed` | Frontend URL not in `CLIENT_URLS` | Add the URL |
| `Firebase ID token has expired` | Expired token from frontend | Frontend should refresh the token |
| `OverwriteModelError` | Model registered twice | Use `auth.model.js` re-export pattern |
| `Invalid webhook signature` | Wrong `RAZORPAY_WEBHOOK_SECRET` | Must match Razorpay dashboard |
| `Cannot delete category — has products` | Category still has products | Move or delete products first |
