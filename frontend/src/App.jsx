import { lazy, Suspense, useEffect } from 'react';
import { matchPath, useLocation, useNavigate } from './router/index.jsx';
import Navbar from './components/Navbar/Navbar.jsx';
import Footer from './components/Footer/Footer.jsx';
import QuoteModal from './components/QuoteModal/QuoteModal.jsx';
import CompareTray from './components/CompareTray/CompareTray.jsx';
import CartDrawer from './components/CartDrawer/CartDrawer.jsx';
import ErrorBoundary from './components/ErrorBoundary/ErrorBoundary.jsx';
import { Loading } from './components/State/State.jsx';
import Home from './pages/Home/Home.jsx';
import Products from './pages/Products/Products.jsx';
import Category from './pages/Category/Category.jsx';
import ProductDetails from './pages/ProductDetails/ProductDetails.jsx';
import NotFound from './pages/NotFound/NotFound.jsx';
import { useApp } from './context/AppContext.jsx';

// Pages most visitors never open are loaded on demand
const Compare = lazy(() => import('./pages/Compare/Compare.jsx'));
const Solutions = lazy(() => import('./pages/Solutions/Solutions.jsx'));
const About = lazy(() => import('./pages/About/About.jsx'));
const Contact = lazy(() => import('./pages/Contact/Contact.jsx'));
const Login = lazy(() => import('./pages/Auth/Auth.jsx').then((m) => ({ default: m.Login })));
const Signup = lazy(() => import('./pages/Auth/Auth.jsx').then((m) => ({ default: m.Signup })));
const Account = lazy(() => import('./pages/Account/Account.jsx'));
const Checkout = lazy(() => import('./pages/Checkout/Checkout.jsx'));
const OrderPlaced = lazy(() => import('./pages/OrderPlaced/OrderPlaced.jsx'));
const Policy = lazy(() => import('./pages/Policy/Policy.jsx'));
const Admin = lazy(() => import('./admin/Admin.jsx'));

const ROUTES = [
  ['/', Home],
  ['/products', Products],
  ['/category/:slug', Category],
  ['/product/:id', ProductDetails],
  ['/compare', Compare],
  ['/solutions', Solutions],
  ['/about', About],
  ['/contact', Contact],
  ['/login', Login],
  ['/signup', Signup],
  ['/account', Account],
  ['/account/:tab', Account],
  ['/checkout', Checkout],
  ['/order/:id', OrderPlaced],
  ['/policies/:key', Policy],
];

function Boot({ status, onRetry }) {
  return (
    <div className="boot">
      {status === 'loading' ? <Loading label="Loading the store" /> : (
        <div className="empty" role="alert">
          <h1 style={{ fontSize: 'var(--fs-4)', marginBottom: '0.5rem' }}>The store could not be loaded</h1>
          <p className="muted">We could not reach our servers. Check your connection and try again.</p>
          <button className="btn btn-primary" onClick={onRetry}>Try again</button>
        </div>
      )}
    </div>
  );
}

export default function App() {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const { settings, isAdmin, authReady, catalogueStatus, reloadCatalogue } = useApp();

  // Auto-redirect admin users to /admin when they land on a storefront page.
  // This runs on first load / session restore so admins go straight to the panel.
  const isStorefrontPage = !(pathname === '/admin' || pathname.startsWith('/admin/'));
  useEffect(() => {
    if (authReady && isAdmin && isStorefrontPage) {
      navigate('/admin', { replace: true });
    }
  }, [authReady, isAdmin, isStorefrontPage, navigate]);

  // The admin panel has its own layout: no storefront header, footer or cart.
  if (pathname === '/admin' || pathname.startsWith('/admin/')) {
    return <ErrorBoundary key="admin"><Suspense fallback={<Boot status="loading" />}><Admin /></Suspense></ErrorBoundary>;
  }

  if (catalogueStatus !== 'ready') return <Boot status={catalogueStatus} onRetry={reloadCatalogue} />;

  let Page = NotFound;
  let params = {};
  for (const [pattern, Component] of ROUTES) {
    const m = matchPath(pattern, pathname);
    if (m) { Page = Component; params = m; break; }
  }
  return (
    <>
      <a href="#main" className="sr-only">Skip to content</a>
      {settings.maintenanceMode && <p className="maint" role="status">{isAdmin ? 'Maintenance notice is on. Customers see a notice at the top of the site.' : 'We are updating the store. Ordering may be briefly unavailable.'}</p>}
      <Navbar />
      <main id="main" className="page" key={pathname}>
        <ErrorBoundary key={pathname}>
          <Suspense fallback={<Loading />}>
            <Page params={params} />
          </Suspense>
        </ErrorBoundary>
      </main>
      <Footer />
      <CompareTray />
      <QuoteModal />
      <CartDrawer />
    </>
  );
}
