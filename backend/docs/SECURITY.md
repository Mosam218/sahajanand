# Security notes

## How access is enforced

- **Sign-in:** Firebase Authentication. The browser sends the Firebase ID token as a Bearer
  header; the API verifies it with the Firebase Admin SDK on every request. There are no
  cookies, so cross-site request forgery does not apply. Passwords are handled only by
  Firebase and never reach this API or its database.
- **Roles** (`user`, `admin`, `superadmin`) live in MongoDB and are read on every request.
  A deactivated account is refused immediately, even with a valid token.
- **Becoming an admin:** only through `SUPER_ADMIN_EMAILS` / `ADMIN_EMAILS` (verified email
  addresses only), the `make-admin` script on the server, or a super admin in the admin panel.
  No request body field can set a role.
- **Customer data:** every order, address, cart and enquiry query is filtered by the signed-in
  user's id on the server. Another customer's order answers 404.
- **Admin panel pages** are only a view. All `/api/admin` routes sit behind
  `verifyToken → isAdmin` (and `requireSuperAdmin` where marked) in `admin.routes.js`.
- **Activity log** is written by the server after a successful admin change, attributed to
  the token's account. There is no endpoint to add or edit entries.

## Admin endpoint matrix (as tested)

Produced by the test "admin endpoint authorisation matrix", which calls every route of the
admin router as each kind of caller. "allowed" means the request passed authorisation (it may
then fail validation or return 404 for the dummy id used). A forged token is also tested: 401 everywhere.

| Endpoint (`/api/admin`) | Unauthenticated | Customer | Admin | Super admin |
|---|---|---|---|---|
| `GET /dashboard` | denied (401) | denied (403) | allowed | allowed |
| `GET /products` | denied (401) | denied (403) | allowed | allowed |
| `POST /products` | denied (401) | denied (403) | allowed | allowed |
| `GET /products/:id` | denied (401) | denied (403) | allowed | allowed |
| `PUT /products/:id` | denied (401) | denied (403) | allowed | allowed |
| `DELETE /products/:id` | denied (401) | denied (403) | allowed | allowed |
| `PATCH /products/:id/stock` | denied (401) | denied (403) | allowed | allowed |
| `PATCH /products/:id/toggle` | denied (401) | denied (403) | allowed | allowed |
| `POST /products/:id/images` | denied (401) | denied (403) | allowed | allowed |
| `PUT /products/:id/images/order` | denied (401) | denied (403) | allowed | allowed |
| `DELETE /products/:id/images/:imageId` | denied (401) | denied (403) | allowed | allowed |
| `GET /categories` | denied (401) | denied (403) | allowed | allowed |
| `POST /categories` | denied (401) | denied (403) | allowed | allowed |
| `GET /categories/:id` | denied (401) | denied (403) | allowed | allowed |
| `PUT /categories/:id` | denied (401) | denied (403) | allowed | allowed |
| `DELETE /categories/:id` | denied (401) | denied (403) | allowed | allowed |
| `GET /orders` | denied (401) | denied (403) | allowed | allowed |
| `GET /orders/:id` | denied (401) | denied (403) | allowed | allowed |
| `PATCH /orders/:id/status` | denied (401) | denied (403) | allowed | allowed |
| `PATCH /orders/:id/payment-status` | denied (401) | denied (403) | allowed | allowed |
| `PATCH /orders/:id/resolve` | denied (401) | denied (403) | allowed | allowed |
| `POST /orders/:id/refund` | denied (401) | denied (403) | allowed | allowed |
| `GET /users` | denied (401) | denied (403) | allowed | allowed |
| `GET /users/:id` | denied (401) | denied (403) | allowed | allowed |
| `PATCH /users/:id/role` | denied (401) | denied (403) | denied (403) | allowed |
| `PATCH /users/:id/status` | denied (401) | denied (403) | allowed | allowed |
| `GET /coupons` | denied (401) | denied (403) | allowed | allowed |
| `GET /coupons/:id` | denied (401) | denied (403) | allowed | allowed |
| `POST /coupons` | denied (401) | denied (403) | allowed | allowed |
| `PUT /coupons/:id` | denied (401) | denied (403) | allowed | allowed |
| `DELETE /coupons/:id` | denied (401) | denied (403) | allowed | allowed |
| `GET /reviews` | denied (401) | denied (403) | allowed | allowed |
| `PATCH /reviews/:id/approve` | denied (401) | denied (403) | allowed | allowed |
| `DELETE /reviews/:id` | denied (401) | denied (403) | allowed | allowed |
| `GET /payments` | denied (401) | denied (403) | allowed | allowed |
| `GET /enquiries` | denied (401) | denied (403) | allowed | allowed |
| `GET /enquiries/:id` | denied (401) | denied (403) | allowed | allowed |
| `PATCH /enquiries/:id` | denied (401) | denied (403) | allowed | allowed |
| `DELETE /enquiries/:id` | denied (401) | denied (403) | allowed | allowed |
| `GET /banners` | denied (401) | denied (403) | allowed | allowed |
| `POST /banners` | denied (401) | denied (403) | allowed | allowed |
| `PUT /banners/:id` | denied (401) | denied (403) | allowed | allowed |
| `DELETE /banners/:id` | denied (401) | denied (403) | allowed | allowed |
| `GET /settings` | denied (401) | denied (403) | allowed | allowed |
| `PUT /settings` | denied (401) | denied (403) | denied (403) | allowed |
| `GET /activity` | denied (401) | denied (403) | allowed | allowed |

Super-admin-only: `PATCH /users/:id/role` and `PUT /settings`. In addition, only a super
admin can deactivate another admin (checked inside `PATCH /users/:id/status`).

## Input handling

- Request bodies, queries and ids are validated with zod schemas on the server; unknown
  fields are dropped. `express-mongo-sanitize` removes `$` operators from input.
- Search text is escaped before it is used in a regular expression and capped at 100 characters.
- Uploads: admin only; jpg / png / webp; extension, declared type **and the file's leading
  bytes** must agree; 5 MB and 8 files per request; stored under a random name; rejected
  files are deleted; served with `X-Content-Type-Options: nosniff`.
- Text entered by customers or admins is stored as text and rendered by React as text; it is
  HTML-escaped in emails.
- Errors: clients get a message and field errors only. Unexpected server errors return a
  generic message; details go to the server log. Stack traces are included only when
  `NODE_ENV=development`.

## Rate limits (per IP, 15 minutes)

All API 3000 (flood guard; many customers can share one mobile-network address) · sign-in
registration 60 · order placement 20 · payment calls 30 · enquiries 10 · admin 1500.
The limiter keeps its counters in memory: with more than one server instance, put a shared
limiter (or the hosting platform's) in front.

## Known limits

- A signed-out or role-changed user's existing ID token stays valid until it expires (up to
  one hour), as with any Firebase token; deactivating the account takes effect immediately.
- Sign-up email verification is sent but not required for shopping. It is required for
  allow-list admin promotion.
- `npm audit` should be run before each release; dependency versions are not pinned beyond the lock file.
