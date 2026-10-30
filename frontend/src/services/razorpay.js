// Razorpay Checkout. The amount and the order are created by the backend;
// the browser only opens Razorpay's payment window and passes the signed
// result back to the backend, which verifies it before marking the order paid.
import { api } from './api.js';

const SCRIPT = 'https://checkout.razorpay.com/v1/checkout.js';
let loading = null;

function loadCheckout() {
  if (window.Razorpay) return Promise.resolve();
  if (!loading) {
    loading = new Promise((resolve, reject) => {
      const el = document.createElement('script');
      el.src = SCRIPT;
      el.onload = resolve;
      el.onerror = () => { loading = null; el.remove(); reject(new Error('The payment window could not be loaded. Check your connection and try again.')); };
      document.head.appendChild(el);
    });
  }
  return loading;
}

/**
 * Open the payment window for an order.
 *
 * @param {{orderId: string, amount: number, currency: string, keyId: string}} razorpay - from the backend
 * @param {{name: string, orderNumber: string, customer: {name: string, email: string, phone: string}}} details
 * @returns {Promise<{status: 'paid', order: object} | {status: 'dismissed'} | {status: 'failed', message: string}>}
 */
export async function payWithRazorpay(razorpay, { name, orderNumber, customer }) {
  await loadCheckout();

  return new Promise((resolve) => {
    let settled = false;
    const finish = (result) => { if (!settled) { settled = true; resolve(result); } };

    const checkout = new window.Razorpay({
      key: razorpay.keyId,
      order_id: razorpay.orderId,
      amount: razorpay.amount,
      currency: razorpay.currency,
      name,
      description: `Order ${orderNumber}`,
      prefill: { name: customer.name, email: customer.email, contact: customer.phone },
      handler: async (response) => {
        try {
          const order = await api.verifyPayment({
            razorpay_order_id: response.razorpay_order_id,
            razorpay_payment_id: response.razorpay_payment_id,
            razorpay_signature: response.razorpay_signature,
          });
          finish({ status: 'paid', order });
        } catch (err) {
          // The payment may still have gone through: the backend also listens
          // for Razorpay's own confirmation and will update the order.
          finish({ status: 'failed', message: `We could not confirm the payment yet. ${err.message} If money was deducted, the order will update automatically.` });
        }
      },
      modal: {
        ondismiss: () => {
          if (!failure) return finish({ status: 'dismissed' });
          api.paymentFailed(razorpay.orderId).catch(() => {}); // best effort; the webhook reports it too
          return finish({ status: 'failed', message: failure });
        },
      },
    });

    // The window stays open after a failed attempt so the customer can try
    // another method; the outcome is decided when it closes.
    let failure = '';
    checkout.on('payment.failed', (response) => {
      failure = response?.error?.description || 'The payment did not go through.';
    });

    checkout.open();
  });
}
