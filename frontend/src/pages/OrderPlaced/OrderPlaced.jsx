// Shown after checkout: confirms the order the server actually created.
import { useEffect } from 'react';
import { Link, useNavigate, useQuery } from '../../router/index.jsx';
import { useApp } from '../../context/AppContext.jsx';
import { useAsync } from '../../hooks/useAsync.js';
import { useSeo } from '../../hooks/useSeo.js';
import { api } from '../../services/api.js';
import { PAYMENT_METHOD_LABEL } from '../../services/mappers.js';
import { Loading, ErrorState } from '../../components/State/State.jsx';
import { OrderItems, OrderSummary, OrderTracker } from '../Account/Account.jsx';
import Icon from '../../components/Icon/Icon.jsx';
import '../Account/Account.css';
import '../Checkout/Checkout.css';

export default function OrderPlaced({ params }) {
  const { user, authReady, settings } = useApp();
  const navigate = useNavigate();
  const incomplete = useQuery().get('payment') === 'incomplete';
  const { data: order, loading, error, reload } = useAsync(() => api.order(params.id), [params.id, user?._id], { enabled: Boolean(user) });
  useSeo({ title: `Order ${order?.orderNumber || ''} | ${settings.storeName}`, noindex: true });

  useEffect(() => {
    if (authReady && !user) navigate(`/login?next=${encodeURIComponent(`/order/${params.id}`)}`, { replace: true });
  }, [authReady, user, navigate, params.id]);

  if (!authReady || (loading && !order)) return <div className="wrap section"><Loading label="Loading your order" /></div>;
  if (!user) return null;
  if (error || !order) {
    return <div className="wrap section"><ErrorState error={error} onRetry={reload} title="We could not find this order" /></div>;
  }

  const unpaid = order.paymentMethod === 'razorpay' && order.paymentStatus !== 'paid' && order.orderStatus !== 'cancelled';

  return (
    <div className="wrap section">
      <div className="empty co__done">
        {unpaid ? (
          <>
            <h1>Your order is saved, but payment is not complete.</h1>
            <p>Order <strong className="num">{order.orderNumber}</strong> will be confirmed once it is paid. {incomplete && 'The payment window was closed before the payment went through. '}You can pay from your orders page.</p>
          </>
        ) : (
          <>
            <span className="quote-done__icon co__tick"><Icon name="check" size={28} /></span>
            <h1>Order placed, thank you.</h1>
            <p>
              Your order <strong className="num">{order.orderNumber}</strong> has been received
              {order.paymentMethod === 'cod' ? `. You chose ${PAYMENT_METHOD_LABEL.cod.toLowerCase()}.` : ' and your payment is confirmed.'}
              {' '}We will contact you on {order.shippingAddress.phone} to arrange delivery.
            </p>
          </>
        )}
        <div className="acct__actions" style={{ justifyContent: 'center' }}>
          <Link to="/account/orders" className="btn btn-primary">{unpaid ? 'Go to your orders to pay' : 'Track your order'}</Link>
          <Link to="/products" className="btn btn-ghost">Continue shopping</Link>
        </div>
      </div>

      <article className="order" style={{ marginTop: '1.5rem', textAlign: 'left' }}>
        <div className="order__body">
          <OrderTracker order={order} />
          <OrderItems items={order.items} />
          <OrderSummary order={order} />
        </div>
      </article>
    </div>
  );
}
