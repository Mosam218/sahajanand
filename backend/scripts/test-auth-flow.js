
// The Firebase Web API Key is required to call the Firebase REST APIs.
// This is different from the Firebase Admin SDK private key.
// Pass it in the environment: FIREBASE_WEB_API_KEY=... node scripts/test-auth-flow.js
const FIREBASE_API_KEY = process.env.FIREBASE_WEB_API_KEY;
if (!FIREBASE_API_KEY) {
  console.error('Set FIREBASE_WEB_API_KEY (Firebase Console → Project settings → Web API key).');
  process.exit(1);
}

const TEST_EMAIL = "test_user_api@example.com";
const TEST_PASSWORD = "Password123!";
const API_BASE_URL = "http://localhost:5000/api";

async function runAuthFlowTest() {
  console.log('--- Starting Auth Flow Test ---');
  let idToken = '';
  
  // 1. Sign up / Sign in with Firebase to get an ID Token
  console.log('\n1. Authenticating with Firebase to get an ID token...');
  try {
    // Try to sign in first
    let res = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${FIREBASE_API_KEY}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: TEST_EMAIL, password: TEST_PASSWORD, returnSecureToken: true })
    });
    let data = await res.json();

    if (data.error && data.error.message === 'EMAIL_NOT_FOUND') {
      // Register if it doesn't exist
      console.log('   User not found. Registering test user in Firebase...');
      res = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=${FIREBASE_API_KEY}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: TEST_EMAIL, password: TEST_PASSWORD, returnSecureToken: true })
      });
      data = await res.json();
    }

    if (data.error) {
      console.error('Firebase Auth Error:', data.error.message);
      return;
    }

    idToken = data.idToken;
    console.log('✅ Successfully obtained Firebase ID Token (truncated):', idToken.substring(0, 30) + '...');
  } catch (err) {
    console.error('Error authenticating with Firebase:', err.message);
    return;
  }

  // 2. Test Backend POST /api/auth/login
  console.log('\n2. Testing POST /api/auth/login (Sync Firebase User to MongoDB)...');
  try {
    const loginRes = await fetch(`${API_BASE_URL}/auth/login`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${idToken}`
      }
    });
    const loginData = await loginRes.json();
    console.log(`   Status Code: ${loginRes.status}`);
    if (loginRes.ok) {
      console.log('✅ Login successful. User profile synced:', loginData.data.user.email);
    } else {
      console.error('❌ Login failed:', loginData);
    }
  } catch (err) {
    console.error('❌ Error calling backend login:', err.message);
    console.log('   Make sure your backend server is running on http://localhost:5000');
    return;
  }

  // 3. Test Backend GET /api/auth/me
  console.log('\n3. Testing GET /api/auth/me (Fetch profile)...');
  try {
    const meRes = await fetch(`${API_BASE_URL}/auth/me`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${idToken}`
      }
    });
    const meData = await meRes.json();
    console.log(`   Status Code: ${meRes.status}`);
    if (meRes.ok) {
      console.log('✅ Profile fetched successfully:', meData.data.user._id);
    } else {
      console.error('❌ Me endpoint failed:', meData);
    }
  } catch (err) {
    console.error('❌ Error calling backend me endpoint:', err.message);
  }

  // 4. Test Backend POST /api/auth/logout
  console.log('\n4. Testing POST /api/auth/logout...');
  try {
    const logoutRes = await fetch(`${API_BASE_URL}/auth/logout`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${idToken}`
      }
    });
    const logoutData = await logoutRes.json();
    console.log(`   Status Code: ${logoutRes.status}`);
    if (logoutRes.ok) {
      console.log('✅ Logout successful:', logoutData.message);
    } else {
      console.error('❌ Logout failed:', logoutData);
    }
  } catch (err) {
    console.error('❌ Error calling backend logout endpoint:', err.message);
  }

  console.log('\n--- Auth Flow Test Complete ---');
}

runAuthFlowTest();
