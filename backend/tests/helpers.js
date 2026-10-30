const firebaseService = require('../src/integrations/firebase/firebase.service');
const { User, Category, Product, Address } = require('../src/models');

/**
 * Create a user and return a function that makes the mocked Firebase
 * verification resolve to that user ("sign in as").
 */
async function makeUser(role = 'user', overrides = {}) {
  const uid = `${role}-${Math.random().toString(36).slice(2, 10)}`;
  const user = await User.create({
    firebaseUid: uid,
    name: `${role} person`,
    email: `${uid}@example.com`,
    role,
    emailVerified: true,
    ...overrides,
  });
  return user;
}

/** Route the next requests' token to this user. Returns an auth header value. */
function signInAs(user) {
  firebaseService.verifyIdToken.mockImplementation(async (token) => {
    if (token === `token-${user.firebaseUid}`) return { uid: user.firebaseUid };
    throw new Error('Firebase ID token is invalid');
  });
  return `Bearer token-${user.firebaseUid}`;
}

/**
 * Tokens for several users at once: each token resolves to its own user.
 */
function tokensFor(...users) {
  const byToken = new Map(users.map((u) => [`token-${u.firebaseUid}`, u.firebaseUid]));
  firebaseService.verifyIdToken.mockImplementation(async (token) => {
    if (byToken.has(token)) return { uid: byToken.get(token) };
    throw new Error('Firebase ID token is invalid');
  });
  return users.map((u) => `Bearer token-${u.firebaseUid}`);
}

async function makeCatalogue() {
  const category = await Category.create({ name: 'Bar Refrigeration', isActive: true });
  const other = await Category.create({ name: 'Ice Machine', isActive: true });
  const productA = await Product.create({
    name: 'Wine Chiller', model: 'EWG 51 D', category: category._id, price: 1000, mrp: 1000, stock: 10,
  });
  const productB = await Product.create({
    name: 'Ice Machine', model: 'EIM 101', category: other._id, price: 2000, mrp: 2000, stock: 3,
  });
  return { category, other, productA, productB };
}

async function makeAddress(user) {
  return Address.create({
    user: user._id,
    fullName: 'Test Customer',
    phone: '9876543210',
    line1: '12 Sector 21',
    city: 'Gandhinagar',
    state: 'Gujarat',
    pincode: '382021',
    isDefault: true,
  });
}

module.exports = { makeUser, signInAs, tokensFor, makeCatalogue, makeAddress };
