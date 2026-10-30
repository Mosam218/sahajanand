import { Link } from '../router/index.jsx';
import { useAsync } from '../hooks/useAsync.js';
import { api } from '../services/api.js';
import { ORDER_STATUS_LABEL, PAYMENT_STATUS_LABEL } from '../services/mappers.js';
import { fmtPrice, fmtDateTime } from '../utils/format.js';
import { Loading, ErrorState } from '../components/State/State.jsx';
import { Head, Pill } from './ui.jsx';

const dayLabel = (iso) => new Date(`${iso}T00:00:00`).toLocaleDateString('en-IN', { weekday: 'short' });

// The last 7 calendar days, including days with no sales
function lastSevenDays(rows) {
  const byDay = new Map(rows.map((r) => [r._id, r]));
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(Date.now() - (6 - i) * 864e5);
    const key = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(d);
    return { key, revenue: byDay.get(key)?.revenue || 0, orders: byDay.get(key)?.orders || 0 };
  });
}

export default function Dashboard() {
  const { data: d, loading, error, reload } = useAsync(() => api.admin.dashboard(), []);

  if (loading && !d) return <><Head title="Dashboard" /><Loading label="Loading the dashboard" /></>;
  if (error && !d) return <><Head title="Dashboard" /><ErrorState error={error} onRetry={reload} /></>;

  const week = lastSevenDays(d.revenueDaily7);
  const peak = Math.max(1, ...week.map((x) => x.revenue));
  const statusMax = Math.max(1, ...Object.values(d.ordersByStatus));
  const kpi = (label, value, note, to) => (
    <Link to={to} className="ad-kpi"><span>{label}</span><strong className="num">{value}</strong><small>{note}</small></Link>
  );

  return (
    <>
      <Head title="Dashboard" sub="How the store is doing right now.">
        <button className="btn btn-ghost btn-sm" onClick={reload} disabled={loading}>{loading ? 'Refreshing…' : 'Refresh'}</button>
      </Head>

      {(d.needsAttention > 0 || d.refundsPending > 0) && (
        <p className="acct__warn" role="status">
          {d.needsAttention > 0 && <><strong>{d.needsAttention}</strong> paid {d.needsAttention === 1 ? 'order needs' : 'orders need'} attention (stock ran out after payment). </>}
          {d.refundsPending > 0 && <><strong>{d.refundsPending}</strong> {d.refundsPending === 1 ? 'refund is' : 'refunds are'} waiting to be processed. </>}
          <Link to="/admin/orders" className="auth__link">Review orders</Link>
        </p>
      )}

      <div className="ad-kpis">
        {kpi('Revenue (paid orders)', fmtPrice(d.totalRevenue), `${fmtPrice(d.todayRevenue)} today`, '/admin/orders')}
        {kpi('Orders', d.totalOrders, `${d.todayOrders} today`, '/admin/orders')}
        {kpi('Pending orders', d.pendingOrders, 'Placed or confirmed, not yet dispatched', '/admin/orders')}
        {kpi('Completed orders', d.completedOrders, `${d.cancelledOrders} cancelled`, '/admin/orders')}
        {kpi('Products', d.totalProducts, `${d.activeProducts} active on the store`, '/admin/products')}
        {kpi('Out of stock', d.outOfStockCount, `${d.lowStockCount} low (≤ ${d.lowStockThreshold})`, '/admin/products')}
        {kpi('Customers', d.totalCustomers, `${d.newCustomers} new in 30 days`, '/admin/customers')}
        {kpi('New enquiries', d.newEnquiries, 'Quote requests to answer', '/admin/enquiries')}
      </div>

      <div className="ad-cols ad-cols--2">
        <section className="ad-card">
          <h2>Revenue, last 7 days</h2>
          <div className="ad-bars" role="img" aria-label={`Revenue per day for the last 7 days: ${week.map((x) => `${dayLabel(x.key)} ${fmtPrice(x.revenue)}`).join(', ')}`}>
            {week.map((x) => (
              <div key={x.key}>
                <span className="ad-bars__val num">{x.revenue ? fmtPrice(x.revenue) : ''}</span>
                <i className="ad-bars__bar" style={{ height: `${(x.revenue / peak) * 100}%` }} />
                <span className="ad-bars__label">{dayLabel(x.key)}</span>
              </div>
            ))}
          </div>
          <p className="muted" style={{ fontSize: 'var(--fs-0)' }}>Counts orders whose payment has been received.</p>
        </section>

        <section className="ad-card">
          <h2>Orders by status</h2>
          <ul className="ad-hbars">
            {Object.entries(d.ordersByStatus).map(([status, count]) => (
              <li key={status}><span>{ORDER_STATUS_LABEL[status] || status}</span><i style={{ width: `${(count / statusMax) * 100}%` }} /><strong className="num">{count}</strong></li>
            ))}
          </ul>
        </section>

        <section className="ad-card ad-card--wide">
          <h2>Recent orders <Link to="/admin/orders">All orders</Link></h2>
          {d.recentOrders.length === 0 ? <p className="muted">No orders yet.</p> : (
            <table className="ad-table ad-table--plain">
              <thead><tr><th>Order</th><th>Customer</th><th>Placed</th><th>Total</th><th>Status</th><th>Payment</th></tr></thead>
              <tbody>
                {d.recentOrders.map((o) => (
                  <tr key={o._id}>
                    <td className="num"><Link to="/admin/orders">{o.orderNumber}</Link></td>
                    <td>{o.user?.name || o.shippingAddress?.fullName}</td>
                    <td>{fmtDateTime(o.createdAt)}</td>
                    <td className="num">{fmtPrice(o.totalAmount)}</td>
                    <td><Pill value={ORDER_STATUS_LABEL[o.orderStatus]} tone={o.orderStatus} /></td>
                    <td><Pill value={PAYMENT_STATUS_LABEL[o.paymentStatus]} tone={o.paymentStatus} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>

        <section className="ad-card">
          <h2>Low stock <Link to="/admin/products">Manage stock</Link></h2>
          {d.lowStockProducts.length === 0 ? <p className="muted">Nothing is running low.</p> : (
            <table className="ad-table ad-table--plain">
              <tbody>
                {d.lowStockProducts.map((p) => (
                  <tr key={p._id}><td><strong>{p.model || p.name}</strong><small>{p.model ? p.name : p.sku}</small></td><td className="num"><Pill value={`${p.stock} left`} tone="low" /></td></tr>
                ))}
              </tbody>
            </table>
          )}
        </section>

        <section className="ad-card">
          <h2>Best sellers</h2>
          {d.topSellingProducts.length === 0 ? <p className="muted">No sales yet.</p> : (
            <table className="ad-table ad-table--plain">
              <tbody>
                {d.topSellingProducts.map((p) => (
                  <tr key={p._id}><td><strong>{p.model || p.name}</strong>{p.model && <small>{p.name}</small>}</td><td className="num">{p.totalSold} sold</td><td className="num">{fmtPrice(p.totalRevenue)}</td></tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
      </div>
    </>
  );
}
