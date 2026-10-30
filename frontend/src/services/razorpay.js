// Razorpay Checkout. The amount and the order are created by the backend;
// the browser opens Razorpay's payment window and passes the signed
// result back to the backend, which verifies it before marking the order paid.
import { api } from './api.js';

const SCRIPT = 'https://checkout.razorpay.com/v1/checkout.js';
let loading = null;

export function loadCheckout() {
  if (typeof window !== 'undefined' && window.Razorpay) return Promise.resolve();
  if (!loading) {
    loading = new Promise((resolve, reject) => {
      const el = document.createElement('script');
      el.src = SCRIPT;
      el.async = true;
      el.onload = resolve;
      el.onerror = () => {
        loading = null;
        el.remove();
        reject(new Error('The payment window could not be loaded. Check your connection and try again.'));
      };
      document.head.appendChild(el);
    });
  }
  return loading;
}

/**
 * Open the payment window for an order.
 *
 * @param {{orderId?: string, order_id?: string, amount: number, currency?: string, keyId?: string, key_id?: string}} razorpay - from the backend
 * @param {{name?: string, orderNumber?: string, customer?: {name?: string, email?: string, phone?: string}}} details
 * @returns {Promise<{status: 'paid', order?: object, response?: object} | {status: 'dismissed'} | {status: 'failed', message: string}>}
 */
export async function payWithRazorpay(razorpay, { name, orderNumber, customer = {} } = {}) {
  await loadCheckout();

  return new Promise((resolve) => {
    let settled = false;
    const finish = (result) => {
      if (!settled) {
        settled = true;
        resolve(result);
      }
    };

    let failure = '';
    const orderId = razorpay.orderId || razorpay.order_id;
    const key = razorpay.keyId || razorpay.key_id || import.meta.env.VITE_RAZORPAY_KEY_ID;

    const options = {
      key,
      order_id: orderId,
      amount: razorpay.amount,
      currency: razorpay.currency || 'INR',
      name: name || 'Sahajanand Electronics',
      description: orderNumber ? `Order ${orderNumber}` : 'Payment',
      prefill: {
        name: customer?.name || '',
        email: customer?.email || '',
        contact: customer?.phone || '',
      },
      handler: async (response) => {
        try {
          const verified = await api.verifyPayment({
            razorpay_order_id: response.razorpay_order_id,
            razorpay_payment_id: response.razorpay_payment_id,
            razorpay_signature: response.razorpay_signature,
          });
          finish({ status: 'paid', order: verified, response });
        } catch (err) {
          finish({
            status: 'failed',
            message: `We could not confirm the payment yet. ${err.message || 'Signature mismatch'}. If money was deducted, the order will update automatically.`,
          });
        }
      },
      modal: {
        ondismiss: () => {
          if (!failure) return finish({ status: 'dismissed' });
          if (orderId) api.paymentFailed(orderId).catch(() => {});
          return finish({ status: 'failed', message: failure });
        },
      },
    };

    const checkout = new window.Razorpay(options);

    checkout.on('payment.failed', (response) => {
      failure = response?.error?.description || response?.error?.reason || 'The payment did not go through.';
    });

    checkout.open();
  });
}

/**
 * Standard checkout helper: calls create-order, opens Razorpay modal, and verifies signature.
 *
 * @param {object} params
 * @param {number} params.amount - Amount in paise (>= 100)
 * @param {string} [params.currency='INR']
 * @param {string} [params.receipt]
 * @param {string} [params.name]
 * @param {string} [params.description]
 * @param {object} [params.prefill] - { name, email, contact }
 * @returns {Promise<{status: 'paid'|'dismissed'|'failed', data?: object, message?: string}>}
 */
export async function startRazorpayStandardCheckout({
  amount,
  currency = 'INR',
  receipt,
  name = 'Sahajanand Electronics',
  description = 'Online Payment',
  prefill = {},
}) {
  await loadCheckout();

  // 1. Create Order via backend
  const orderRes = await api.createOrder({ amount, currency, receipt });
  const orderData = orderRes.data || orderRes;
  const orderId = orderData.order_id || orderData.id;

  if (!orderId) {
    throw new Error('Could not retrieve order_id from backend create-order');
  }

  // 2. Open Razorpay modal
  return payWithRazorpay(
    {
      orderId,
      amount: orderData.amount || amount,
      currency: orderData.currency || currency,
      keyId: orderData.key_id || import.meta.env.VITE_RAZORPAY_KEY_ID,
    },
    {
      name,
      orderNumber: receipt,
      customer: prefill,
    }
  );
}
