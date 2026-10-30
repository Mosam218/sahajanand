# Order and payment states

Two fields describe an order: `orderStatus` and `paymentStatus`. Customers can never set
either directly. Every change below is made with a conditional database update
("only if the order is still in the state I just checked"), so retries, double clicks and
callbacks arriving together cannot apply a change twice.

## Order status

```
placed ──► confirmed ──► shipped ──► delivered
   │            │
   └────────────┴──► cancelled
```

| From | To | Who | Rule |
|---|---|---|---|
| (new) | placed | Customer, at checkout | Prices, coupon, GST, delivery and total are computed by the server from the database. Anything else the browser sends is ignored. |
| placed | confirmed | Admin (pay on delivery) or the payment confirmation (online) | An online order cannot be confirmed by hand while unpaid. |
| confirmed | shipped | Admin | Online orders must be paid. Optional courier / tracking. |
| shipped | delivered | Admin | |
| placed, confirmed | cancelled | Customer (own order) or admin | Not possible once shipped. |
| delivered, cancelled | — | — | Final. |

Skipping steps (for example placed → delivered) is refused.

## Payment status

| Method | From | To | Trigger |
|---|---|---|---|
| Online (Razorpay) | pending | paid | Signature-verified confirmation from the browser, or Razorpay's signed webhook. Never by hand. |
| Online | pending | failed | Razorpay reports a failed attempt. Ignored if the order is already paid. |
| Online | failed | pending | Customer retries payment (a new Razorpay order is created). |
| Online | pending, failed | paid | A later attempt succeeds. |
| Online | paid | refund_pending | Order cancelled after payment. |
| Online | pending, failed | refund_pending | Payment arrives for an order that was already cancelled: the order stays cancelled and is flagged for staff. |
| Online | paid, refund_pending | refunded | Admin starts the refund through Razorpay (amount cannot exceed the order total). |
| Pay on delivery | pending | paid | Admin records the cash. |
| Pay on delivery | paid | pending | Admin corrects a mistake (not on cancelled orders). |
| Pay on delivery | paid | refund_pending | Order cancelled after cash was recorded. |
| Pay on delivery | refund_pending | refunded | Admin records that the cash was returned. |

Anything not in this table is rejected by the API.

## Stock

| Event | Stock |
|---|---|
| Pay-on-delivery order placed | Deducted immediately, all items or none. |
| Online order placed | Not deducted (unpaid orders hold no stock). |
| Online payment confirmed | Deducted once. If stock ran out meanwhile, the order is still confirmed (the customer paid) and flagged "needs attention" with a staff-only note. |
| Order cancelled / refunded | Returned once, and only if it had been deducted for this order. |

Stock is changed with `stock >= quantity` conditions, so it cannot go below zero even when
two customers buy the last unit at the same moment (one of them is refused).

## Idempotency

- Verification + webhook, or a repeated webhook, for the same order: the first one claims the
  move to `paid`; the rest find nothing to do.
- Repeated cancellation: the first one claims `cancelled`; the rest get "can no longer be cancelled".
- Coupon usage is counted when stock is committed (order placed for pay on delivery, payment
  confirmed for online) and released once on cancellation.

Covered by `tests/security/security.test.js`, `tests/admin/admin.test.js`,
`tests/payments/payments.test.js` and `tests/orders/orders.test.js`.
