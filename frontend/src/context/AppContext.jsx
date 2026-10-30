import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import {
  onAuthStateChanged, signInWithEmailAndPassword, createUserWithEmailAndPassword, signInWithPopup, signOut,
  sendPasswordResetEmail, sendEmailVerification, updateProfile as fbUpdateProfile, updatePassword,
  reauthenticateWithCredential, EmailAuthProvider, setPersistence, browserLocalPersistence, browserSessionPersistence,
} from 'firebase/auth';
import { auth, authConfigured, googleProvider } from '../services/firebase.js';
import { api, ApiError } from '../services/api.js';
import { toProduct, toCategory, toBanner, toCartLine } from '../services/mappers.js';

const AppContext = createContext(null);
export const MAX_COMPARE = 3;
export const MAX_PER_ITEM = 10; // same limit the API enforces per product

// Shown until the store settings arrive from the API
const DEFAULT_SETTINGS = {
  storeName: 'Sahajanand Electronics', legalName: '', announcement: '', supportPhone: '', supportPhoneAlt: '',
  supportEmail: '', whatsapp: '', address: '', serviceAreas: ['Gandhinagar', 'Ahmedabad'], businessHours: '',
  heroTitle: '', heroLede: '', gstInclusive: true, gstPercent: 18, deliveryCharge: 0, freeDeliveryAbove: 0,
  maintenanceMode: false, paymentMethods: { cod: false, razorpay: false }, policies: {},
};

const GUEST_CART_KEY = 'sahajanand:cart';
const loadGuestCart = () => {
  try {
    const items = JSON.parse(localStorage.getItem(GUEST_CART_KEY) || '[]');
    return Array.isArray(items) ? items.filter((i) => i && i.productId && i.qty > 0) : [];
  } catch {
    return []; // storage unavailable or corrupted: start with an empty cart
  }
};

// Firebase error codes → messages a customer can act on
const AUTH_ERRORS = {
  'auth/invalid-credential': { field: 'password', error: 'The email or password is incorrect.' },
  'auth/wrong-password': { field: 'password', error: 'The email or password is incorrect.' },
  'auth/user-not-found': { field: 'password', error: 'The email or password is incorrect.' },
  'auth/invalid-email': { field: 'email', error: 'Enter a valid email address.' },
  'auth/email-already-in-use': { field: 'email', error: 'An account with this email already exists. Sign in instead.' },
  'auth/weak-password': { field: 'password', error: 'Choose a stronger password (at least 6 characters).' },
  'auth/user-disabled': { field: 'email', error: 'This account has been disabled. Contact us for help.' },
  'auth/too-many-requests': { field: 'password', error: 'Too many attempts. Please wait a few minutes and try again.' },
  'auth/operation-not-allowed': { field: 'form', error: 'Email/Password sign-in is disabled in your Firebase project. Please enable it in Firebase Console > Authentication > Sign-in method.' },
  'auth/network-request-failed': { field: 'form', error: 'We could not reach the sign-in service. Check your connection and try again.' },
  'auth/requires-recent-login': { field: 'form', error: 'Please sign out, sign in again, and retry.' },
};
const authFailure = (err) => {
  if (err instanceof ApiError) return { ok: false, field: 'form', error: err.message };
  return { ok: false, ...(AUTH_ERRORS[err?.code] || { field: 'form', error: 'Sign-in failed. Please try again.' }) };
};
const NO_AUTH = { ok: false, field: 'form', error: 'Customer accounts are not available right now. Please contact us to place an order.' };

export function AppProvider({ children }) {
  // ─── Catalogue and store settings (from the API) ───────────────────────────
  const [catalogue, setCatalogue] = useState({ status: 'loading', products: [], categories: [], offers: [], coupons: [] });
  const [settings, setSettings] = useState(DEFAULT_SETTINGS);

  const loadCatalogue = useCallback(async () => {
    try {
      const [settingsData, categories, products, banners, coupons] = await Promise.all([
        api.settings(),
        api.categories(),
        api.products(),
        api.banners().catch(() => []), // the page works without promotions
        api.coupons().catch(() => []),
      ]);
      setSettings({ ...DEFAULT_SETTINGS, ...settingsData });
      setCatalogue({
        status: 'ready',
        categories: categories.map(toCategory),
        products: products.map(toProduct),
        offers: banners.map(toBanner),
        coupons,
      });
    } catch (err) {
      console.error('Could not load the catalogue:', err);
      setCatalogue((c) => (c.status === 'ready' ? c : { ...c, status: 'error' }));
    }
  }, []);
  useEffect(() => { loadCatalogue(); }, [loadCatalogue]);

  const { products, categories, offers } = catalogue;
  const productsById = useMemo(() => new Map(products.map((p) => [p._id, p])), [products]);

  // ─── Notices (toast) ───────────────────────────────────────────────────────
  const [notice, setNotice] = useState('');
  useEffect(() => {
    if (!notice) return;
    const t = setTimeout(() => setNotice(''), 4500);
    return () => clearTimeout(t);
  }, [notice]);

  // ─── Session (Firebase Authentication + profile from the API) ──────────────
  const [user, setUser] = useState(null);
  const [authReady, setAuthReady] = useState(!authConfigured);
  const pendingProfile = useRef(null); // name/phone typed on the sign-up form
  const syncing = useRef(null);

  // Exchange the Firebase sign-in for the store profile.
  // A fresh sign-in or sign-up registers the session with the API (which
  // creates the profile the first time). A page reload with a remembered
  // session only reads the profile, so ordinary browsing never runs into the
  // sign-in rate limit.
  const freshSignIn = useRef(false);
  const syncUser = useCallback((fbUser) => {
    if (syncing.current?.uid === fbUser.uid) return syncing.current.promise;
    const register = () => api.login(pendingProfile.current || {});
    const restore = () => api.me().catch((err) => (err.status === 401 ? register() : Promise.reject(err)));
    const promise = (freshSignIn.current ? register() : restore())
      .then((profile) => { setUser(profile); return profile; })
      .finally(() => { if (syncing.current?.promise === promise) syncing.current = null; pendingProfile.current = null; freshSignIn.current = false; });
    syncing.current = { uid: fbUser.uid, promise };
    return promise;
  }, []);

  useEffect(() => {
    if (!auth) return undefined;
    return onAuthStateChanged(auth, async (fbUser) => {
      if (!fbUser) { setUser(null); setAuthReady(true); return; }
      try {
        await syncUser(fbUser);
      } catch (err) {
        // The account was deactivated, or the API is down: do not stay half signed in
        setUser(null);
        if (err instanceof ApiError && (err.status === 401 || err.status === 403)) await signOut(auth).catch(() => {});
      } finally {
        setAuthReady(true);
      }
    });
  }, [syncUser]);

  const isAdmin = user?.role === 'admin' || user?.role === 'superadmin';
  const isSuperAdmin = user?.role === 'superadmin';

  const login = useCallback(async (email, password, { remember = true } = {}) => {
    if (!auth) return NO_AUTH;
    try {
      await setPersistence(auth, remember ? browserLocalPersistence : browserSessionPersistence);
      freshSignIn.current = true;
      const cred = await signInWithEmailAndPassword(auth, email.trim(), password);
      const profile = await syncUser(cred.user);
      return { ok: true, user: profile };
    } catch (err) {
      freshSignIn.current = false;
      if (err instanceof ApiError) await signOut(auth).catch(() => {});
      return authFailure(err);
    }
  }, [syncUser]);

  const loginWithGoogle = useCallback(async () => {
    if (!auth) return NO_AUTH;
    try {
      await setPersistence(auth, browserLocalPersistence);
      freshSignIn.current = true;
      const cred = await signInWithPopup(auth, googleProvider);
      const profile = await syncUser(cred.user);
      return { ok: true, user: profile };
    } catch (err) {
      freshSignIn.current = false;
      if (err?.code === 'auth/popup-closed-by-user') {
        return { ok: false, field: 'form', error: 'Google sign-in was cancelled.' };
      }
      if (err instanceof ApiError) await signOut(auth).catch(() => {});
      return authFailure(err);
    }
  }, [syncUser]);

  const signup = useCallback(async ({ name, email, phone, password }) => {
    if (!auth) return NO_AUTH;
    try {
      pendingProfile.current = { name: name.trim(), phone: phone.replace(/\D/g, '').slice(-10) };
      await setPersistence(auth, browserLocalPersistence);
      freshSignIn.current = true;
      const cred = await createUserWithEmailAndPassword(auth, email.trim(), password);
      fbUpdateProfile(cred.user, { displayName: name.trim() }).catch(() => {});
      // Best effort: the account works without it, but admin access needs a verified email
      sendEmailVerification(cred.user).catch(() => {});
      const profile = await syncUser(cred.user);
      return { ok: true, user: profile };
    } catch (err) {
      pendingProfile.current = null; freshSignIn.current = false;
      if (err instanceof ApiError) await signOut(auth).catch(() => {});
      return authFailure(err);
    }
  }, [syncUser]);

  const logout = useCallback(async () => {
    if (!auth) return;
    await signOut(auth).catch(() => {});
    setUser(null);
  }, []);

  const resetPassword = useCallback(async (email) => {
    if (!auth) return NO_AUTH;
    try {
      await sendPasswordResetEmail(auth, email.trim());
      return { ok: true };
    } catch (err) {
      // Do not reveal whether an account exists for this address
      if (err?.code === 'auth/user-not-found') return { ok: true };
      return authFailure(err);
    }
  }, []);

  const changePassword = useCallback(async (current, next) => {
    if (!auth?.currentUser) return NO_AUTH;
    try {
      await reauthenticateWithCredential(auth.currentUser, EmailAuthProvider.credential(auth.currentUser.email, current));
      await updatePassword(auth.currentUser, next);
      return { ok: true };
    } catch (err) {
      if (['auth/invalid-credential', 'auth/wrong-password'].includes(err?.code)) return { ok: false, error: 'Your current password is incorrect.' };
      return authFailure(err);
    }
  }, []);

  const updateProfile = useCallback(async (values) => {
    const profile = await api.updateProfile(values);
    setUser(profile);
    return profile;
  }, []);

  // ─── Quote modal, compare ──────────────────────────────────────────────────
  const [quote, setQuote] = useState({ open: false, model: '' });
  const openQuote = useCallback((model = '') => setQuote({ open: true, model }), []);
  const closeQuote = useCallback(() => setQuote((q) => ({ ...q, open: false })), []);

  const [compare, setCompare] = useState([]);
  const toggleCompare = useCallback((id) => {
    setCompare((list) => {
      if (list.includes(id)) return list.filter((x) => x !== id);
      if (list.length >= MAX_COMPARE) { setNotice(`You can compare up to ${MAX_COMPARE} products. Remove one to add another.`); return list; }
      return [...list, id];
    });
  }, []);
  const clearCompare = useCallback(() => setCompare([]), []);

  // ─── Cart ──────────────────────────────────────────────────────────────────
  // Signed in: the cart lives on the server. Guest: in this browser, and it is
  // merged into the account's cart on sign-in.
  const [guestCart, setGuestCart] = useState(loadGuestCart);
  const [serverCart, setServerCart] = useState(null);
  const [cartOpen, setCartOpen] = useState(false);
  const [cartBusy, setCartBusy] = useState(false);
  const guestRef = useRef(guestCart);
  guestRef.current = guestCart;

  useEffect(() => {
    try { localStorage.setItem(GUEST_CART_KEY, JSON.stringify(guestCart)); } catch { /* private mode: cart lasts for this visit only */ }
  }, [guestCart]);

  const userId = user?._id || null;
  useEffect(() => {
    if (!userId) { setServerCart(null); return undefined; }
    let cancelled = false;
    const guest = guestRef.current;
    const load = guest.length
      ? api.cartMerge(guest.map((i) => ({ productId: i.productId, quantity: Math.min(i.qty, MAX_PER_ITEM) })))
      : api.cart();
    load
      .then((cart) => { if (!cancelled) { setServerCart(cart); if (guest.length) setGuestCart([]); } })
      .catch((err) => { if (!cancelled) { setServerCart({ items: [], cartTotal: 0 }); setNotice(err.message); } });
    return () => { cancelled = true; };
  }, [userId]);

  const cart = useMemo(() => {
    if (userId) return (serverCart?.items || []).map(toCartLine);
    return guestCart
      .map((i) => {
        const p = productsById.get(i.productId);
        return p && { productId: p._id, id: p.id, model: p.model, name: p.name, image: p.image, price: p.price, qty: i.qty, stock: p.stock, unavailable: p.stock === 0, exceedsStock: p.stock > 0 && i.qty > p.stock };
      })
      .filter(Boolean);
  }, [userId, serverCart, guestCart, productsById]);

  const withCart = useCallback(async (call) => {
    setCartBusy(true);
    try {
      setServerCart(await call());
      return true;
    } catch (err) {
      setNotice(err.message);
      return false;
    } finally {
      setCartBusy(false);
    }
  }, []);

  const addToCart = useCallback(async (product, qty = 1) => {
    if (product.stock === 0) { setNotice(`${product.model} is out of stock. Request a quote and we will confirm the lead time.`); return; }
    if (userId) {
      if (await withCart(() => api.cartAdd(product._id, qty))) setCartOpen(true);
      return;
    }
    const limit = Math.min(product.stock, MAX_PER_ITEM);
    const current = guestRef.current.find((i) => i.productId === product._id)?.qty || 0;
    if (current >= limit) {
      setNotice(product.stock < MAX_PER_ITEM
        ? `Only ${product.stock} of ${product.model} in stock.`
        : `You can order up to ${MAX_PER_ITEM} of one product online. Request a quote for larger quantities.`);
      return;
    }
    const next = Math.min(current + qty, limit);
    setGuestCart((prev) => (current
      ? prev.map((i) => (i.productId === product._id ? { ...i, qty: next } : i))
      : [...prev, { productId: product._id, qty: next }]));
    setCartOpen(true);
  }, [userId, withCart]);

  // Cart lines are addressed by their product slug (`id`)
  const lineBySlug = useCallback((slug) => cart.find((i) => i.id === slug), [cart]);

  const updateQty = useCallback(async (slug, qty) => {
    const line = lineBySlug(slug);
    if (!line || qty < 1) return;
    if (qty > MAX_PER_ITEM) { setNotice(`You can order up to ${MAX_PER_ITEM} of one product online. Request a quote for larger quantities.`); return; }
    if (qty > line.qty && qty > line.stock) { setNotice(`Only ${line.stock} of ${line.model} in stock.`); return; }
    if (userId) await withCart(() => api.cartUpdate(line.productId, qty));
    else setGuestCart((prev) => prev.map((i) => (i.productId === line.productId ? { ...i, qty } : i)));
  }, [userId, lineBySlug, withCart]);

  const removeFromCart = useCallback(async (slug) => {
    const line = lineBySlug(slug);
    if (!line) return;
    if (userId) await withCart(() => api.cartRemove(line.productId));
    else setGuestCart((prev) => prev.filter((i) => i.productId !== line.productId));
  }, [userId, lineBySlug, withCart]);

  const [couponCode, setCouponCode] = useState('');
  const [couponError, setCouponError] = useState('');
  const [totals, setTotals] = useState(null); // server-priced order quote (signed in)

  const clearCart = useCallback(async () => {
    setCouponCode(''); setCouponError('');
    if (userId) {
      try { await api.cartClear(); setServerCart({ items: [], cartTotal: 0 }); } catch (err) { setNotice(err.message); }
    } else {
      setGuestCart([]);
    }
  }, [userId]);

  const refreshCart = useCallback(async () => {
    if (!userId) return;
    try { setServerCart(await api.cart()); } catch (err) { setNotice(err.message); }
  }, [userId]);

  // Totals always come from the server, so the cart shows what checkout charges
  const purchasable = cart.filter((i) => !i.unavailable);
  const cartKey = purchasable.map((i) => `${i.productId}:${i.qty}`).join(',');
  useEffect(() => {
    if (!userId || !cartKey) { setTotals(null); return undefined; }
    const controller = new AbortController();
    const t = setTimeout(() => {
      api.quote({ couponCode: couponCode || undefined }, { signal: controller.signal })
        .then((q) => {
          setTotals(q);
          if (couponCode && q.couponError) { setCouponError(q.couponError); setCouponCode(''); }
        })
        .catch((err) => { if (err.name !== 'AbortError') setTotals(null); });
    }, 200);
    return () => { clearTimeout(t); controller.abort(); };
  }, [userId, cartKey, couponCode]);

  const applyCoupon = useCallback(async (code) => {
    const value = code.trim().toUpperCase();
    if (!value) { setCouponError('Enter a coupon code.'); return; }
    if (!userId) { setCouponError('Sign in to use a coupon code.'); return; }
    try {
      const q = await api.quote({ couponCode: value });
      if (q.couponError) { setCouponError(q.couponError); setCouponCode(''); return; }
      setTotals(q); setCouponCode(value); setCouponError('');
    } catch (err) {
      setCouponError(err.message);
    }
  }, [userId]);
  const removeCoupon = useCallback(() => { setCouponCode(''); setCouponError(''); }, []);

  const localSubtotal = purchasable.reduce((sum, i) => sum + i.price * Math.min(i.qty, i.stock || i.qty), 0);
  const cartSubtotal = totals?.itemsTotal ?? localSubtotal;
  const cartDiscount = totals?.discount ?? 0;
  const cartCount = cart.reduce((sum, i) => sum + i.qty, 0);
  const appliedCoupon = couponCode && cartDiscount > 0 ? { code: couponCode } : null;

  const value = {
    // catalogue
    catalogueStatus: catalogue.status, reloadCatalogue: loadCatalogue,
    products, categories, offers, COUPONS: catalogue.coupons, settings, setSettings,
    // session
    user, isAdmin, isSuperAdmin, authReady, authConfigured,
    login, signup, loginWithGoogle, logout, resetPassword, changePassword, updateProfile,
    // quote modal, compare, toast
    quote, openQuote, closeQuote,
    compare, toggleCompare, clearCompare, notice, setNotice,
    // cart
    cart, cartOpen, setCartOpen, cartBusy, addToCart, removeFromCart, updateQty, clearCart, refreshCart,
    cartSubtotal, cartDiscount, cartTotal: Math.max(0, cartSubtotal - cartDiscount), cartCount, totals,
    appliedCoupon, applyCoupon, removeCoupon, couponError, couponCode,
  };
  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export const useApp = () => useContext(AppContext);
