/* =========================================================
   КУТ: БИЗНЕС — Firebase Configuration v10.0 (refactored)
   
   + Реальная IndexedDB persistence (persistentLocalCache)
   + Пагинация (getPage / loadMorePage) с startAfter
   + Realtime с ограничением limit() — не съедает память
   + Единая точка ошибок + лог
   + Хелперы совместимы со старым API (getCollection, addItem...)
   ========================================================= */

import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js';
import {
  getAuth,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut,
  sendPasswordResetEmail,
} from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js';
import {
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  addDoc,
  updateDoc,
  deleteDoc,
  query,
  where,
  orderBy,
  limit,
  startAfter,
  serverTimestamp,
  onSnapshot,
  writeBatch,
} from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js';

// =========================================================
// CONFIG
// =========================================================
const firebaseConfig = {
  apiKey:            "AIzaSyAO1MhiEWnBKhcEs64XMMPVN0GDEZFpxPg",
  authDomain:        "kut-biznes.firebaseapp.com",
  projectId:         "kut-biznes",
  storageBucket:     "kut-biznes.firebasestorage.app",
  messagingSenderId: "699153181693",
  appId:             "1:699153181693:web:2f10e57664e8a0cefc4794",
  measurementId:     "G-VTZ49G265B",
};

// =========================================================
// INIT
// =========================================================
const app  = initializeApp(firebaseConfig);
const auth = getAuth(app);

// ✅ IndexedDB — мгновенный UI даже без сети
let db;
try {
  db = initializeFirestore(app, {
    localCache: persistentLocalCache({
      tabManager: persistentMultipleTabManager(),
    }),
  });
  console.info('[KUT FB] IndexedDB persistence активен');
} catch (err) {
  // На случай если кто-то уже вызвал getFirestore — не падаем
  console.warn('[KUT FB] persistence fallback:', err?.message);
  const { getFirestore } = await import('https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js');
  db = getFirestore(app);
}

// =========================================================
// STATE
// =========================================================
let currentUser = null;
let currentProfile = null;

const KG_PHONE_CODE = '+996';
const OTP_TTL_MS = 5 * 60 * 1000;
const DEFAULT_PAGE_SIZE = 50;

// =========================================================
// HELPERS
// =========================================================
function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

function normalizePhone(raw) {
  let d = String(raw || '').replace(/\D/g, '');
  if (!d) return '';
  if (d.startsWith('996')) d = d.slice(3);
  else if (d.startsWith('0')) d = d.slice(1);
  d = d.slice(0, 9);
  return KG_PHONE_CODE + d;
}

function toDate(ts) {
  if (!ts) return null;
  if (typeof ts.toDate === 'function') return ts.toDate();
  if (ts.seconds) return new Date(ts.seconds * 1000);
  const d = new Date(ts);
  return isNaN(d.getTime()) ? null : d;
}

function fakeEmailFromPhone(phone) { return phone.replace(/\D/g, '') + '@kut.local'; }
function fakePasswordFromPhone(phone) { return 'kut_' + phone.replace(/\D/g, '') + '_secret'; }

function makeBusinessId() {
  return 'biz_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

// =========================================================
// PERSISTENCE (реальная)
// =========================================================
async function enablePersistence() {
  // В v10 persistence уже включён через initializeFirestore.
  // Функция оставлена для обратной совместимости с app.js.
  return { ok: true, mode: 'persistentLocalCache' };
}

// =========================================================
// AUTH
// =========================================================
async function fetchProfile(uid) {
  try {
    const snap = await getDoc(doc(db, 'users', uid));
    return snap.exists() ? { uid, ...snap.data() } : null;
  } catch (e) {
    console.error('[KUT FB] fetchProfile failed:', e);
    return null;
  }
}

function waitForAuth() {
  return new Promise((resolve) => {
    const unsub = onAuthStateChanged(auth, async (user) => {
      currentUser = user;
      currentProfile = user ? await fetchProfile(user.uid) : null;
      resolve({ user: currentUser, profile: currentProfile });
      unsub();
    });
  });
}

function redirectByRole(profile) {
  if (!profile) { window.location.href = './login.html'; return; }
  if (profile.active === false) {
    alert('Ваш аккаунт заблокирован. Свяжитесь с администратором.');
    signOut(auth);
    return;
  }
  const role = profile.role;
  if (role === 'super_admin')  window.location.href = './admin.html';
  else if (role === 'owner')   window.location.href = './index.html';
  else if (role === 'manager') window.location.href = './index.html';
  else if (role === 'cashier') window.location.href = './cash.html';
  else                         window.location.href = './index.html';
}

async function login(email, password) {
  const cred = await signInWithEmailAndPassword(auth, email, password);
  const profile = await fetchProfile(cred.user.uid);
  if (profile && profile.active === false) {
    await signOut(auth);
    throw new Error('ACCOUNT_DISABLED');
  }
  currentUser = cred.user;
  currentProfile = profile;
  return { user: cred.user, profile };
}

async function registerOwner({ email, password, displayName, companyName }) {
  const cred = await createUserWithEmailAndPassword(auth, email, password);
  const uid = cred.user.uid;
  const businessId = makeBusinessId();

  await setDoc(doc(db, 'users', uid), {
    email, displayName, phone: '',
    role: 'owner', businessId, active: true,
    createdAt: serverTimestamp(),
  });

  await setDoc(doc(db, 'businesses', businessId), {
    name: companyName,
    ownerUid: uid, ownerEmail: email,
    status: 'active', createdAt: serverTimestamp(),
  });

  currentUser = cred.user;
  currentProfile = await fetchProfile(uid);
  return { user: cred.user, businessId, profile: currentProfile };
}

async function logout() {
  try { await signOut(auth); } catch (_) {}
  currentUser = null;
  currentProfile = null;
  window.location.href = './login.html';
}

async function resetPassword(email) { return sendPasswordResetEmail(auth, email); }

// =========================================================
// WHATSAPP OTP
// =========================================================
const WA_CONFIG = {
  idInstance: '720122747171',
  apiToken:   '4c32b507d4b44917a123631f42e47e868a2d3ff9e3b44b82bc',
  buildUrl() {
    return `https://api.green-api.com/waInstance${this.idInstance}/sendMessage/${this.apiToken}`;
  },
};

function generateOtpCode() { return String(Math.floor(1000 + Math.random() * 9000)); }
function otpSessionDoc(phone) { return doc(db, 'otp_sessions', phone.replace(/\D/g, '')); }

async function sendWhatsAppOtp(rawPhone) {
  const phone = normalizePhone(rawPhone);
  if (!/^\+996\d{9}$/.test(phone)) throw new Error('INVALID_PHONE');

  const code = generateOtpCode();
  const expiresAt = new Date(Date.now() + OTP_TTL_MS);

  await setDoc(otpSessionDoc(phone), {
    phone, code, expiresAt,
    createdAt: serverTimestamp(),
    attempts: 0,
  });

  const phoneDigits = phone.replace(/\D/g, '');
  const message = `Ваш код подтверждения в системе КУТ: БИЗНЕС — ${code}\n\nНикому не сообщайте этот код. Действителен 5 минут.`;

  const res = await fetch(WA_CONFIG.buildUrl(), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chatId: `${phoneDigits}@c.us`, message }),
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    console.error('[KUT OTP] Green-API ошибка:', res.status, errText);
    throw new Error('WHATSAPP_FAILED');
  }
  return true;
}

async function verifyWhatsAppOtp(rawPhone, code) {
  const phone = normalizePhone(rawPhone);
  const ref = otpSessionDoc(phone);
  const snap = await getDoc(ref);

  if (!snap.exists()) throw new Error('OTP_NOT_FOUND');
  const data = snap.data();
  const expiresAt = toDate(data.expiresAt);
  if (!expiresAt || Date.now() > expiresAt.getTime()) {
    await deleteDoc(ref).catch(() => {});
    throw new Error('OTP_EXPIRED');
  }
  if (String(data.code) !== String(code)) throw new Error('OTP_MISMATCH');
  await deleteDoc(ref).catch(() => {});

  const fakeEmail = fakeEmailFromPhone(phone);
  const fakePassword = fakePasswordFromPhone(phone);

  let cred;
  try {
    cred = await signInWithEmailAndPassword(auth, fakeEmail, fakePassword);
  } catch (err) {
    if (err.code === 'auth/user-not-found' ||
        err.code === 'auth/invalid-credential' ||
        err.code === 'auth/invalid-login-credentials') {
      cred = await createUserWithEmailAndPassword(auth, fakeEmail, fakePassword);
    } else throw err;
  }

  const uid = cred.user.uid;
  let profile = await fetchProfile(uid);
  if (!profile) {
    await setDoc(doc(db, 'users', uid), {
      email: fakeEmail, displayName: '', phone,
      role: 'cashier', businessId: '', active: true,
      createdAt: serverTimestamp(),
    });
    profile = await fetchProfile(uid);
  }

  currentUser = cred.user;
  currentProfile = profile;
  return { user: cred.user, profile };
}

// =========================================================
// FIRESTORE: БАЗОВЫЕ CRUD (совместимость со старым API)
// =========================================================
function getBusinessId() { return currentProfile ? currentProfile.businessId : null; }

async function getCollection(name) {
  const bizId = getBusinessId();
  if (!bizId) return [];
  try {
    const snap = await getDocs(collection(db, 'businesses', bizId, name));
    return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  } catch (e) {
    console.error('[KUT FB] getCollection failed:', name, e);
    return [];
  }
}

function subscribeCollection(name, callback, opts = {}) {
  const bizId = getBusinessId();
  if (!bizId) { callback([]); return () => {}; }

  const {
    pageSize = DEFAULT_PAGE_SIZE,
    orderByField = 'createdAt',
    orderDirection = 'desc',
    limitCount = null,
  } = opts;

  const ref = collection(db, 'businesses', bizId, name);
  const lc = limitCount || pageSize;

  // Если указан orderBy — сортируем в БД (быстрее), иначе без сортировки
  let q;
  try {
    q = orderByField
      ? query(ref, orderBy(orderByField, orderDirection), limit(lc))
      : query(ref, limit(lc));
  } catch (_) {
    q = query(ref, limit(lc));
  }

  return onSnapshot(q, (snap) => {
    callback(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
  }, (err) => {
    console.error('[KUT FB] subscribe error:', name, err);
  });
}

async function addItem(name, data) {
  const bizId = getBusinessId();
  if (!bizId) throw new Error('NO_BUSINESS');
  const ref = collection(db, 'businesses', bizId, name);
  return addDoc(ref, {
    ...data,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
}

async function updateItem(name, id, data) {
  const bizId = getBusinessId();
  if (!bizId) throw new Error('NO_BUSINESS');
  return updateDoc(doc(db, 'businesses', bizId, name, id), {
    ...data, updatedAt: serverTimestamp(),
  });
}

async function deleteItem(name, id) {
  const bizId = getBusinessId();
  if (!bizId) throw new Error('NO_BUSINESS');
  return deleteDoc(doc(db, 'businesses', bizId, name, id));
}

// =========================================================
// 🆕 PAGINATION HELPERS
// =========================================================

/**
 * Постраничная загрузка коллекции бизнеса.
 * @param {string} name — имя коллекции ('products', 'sales', 'debts', ...)
 * @param {object} opts — { pageSize, orderByField, orderDirection, startAfterDoc, filters }
 * @returns {Promise<{items: Array, lastDoc: DocumentSnapshot|null, hasMore: boolean}>}
 */
async function getPage(name, opts = {}) {
  const bizId = getBusinessId();
  if (!bizId) return { items: [], lastDoc: null, hasMore: false };

  const {
    pageSize = DEFAULT_PAGE_SIZE,
    orderByField = 'createdAt',
    orderDirection = 'desc',
    startAfterDoc = null,
    filters = [],
  } = opts;

  const ref = collection(db, 'businesses', bizId, name);
  const constraints = [];

  for (const f of filters) {
    constraints.push(where(f.field, f.op, f.value));
  }
  if (orderByField) {
    constraints.push(orderBy(orderByField, orderDirection));
  }
  if (startAfterDoc) {
    constraints.push(startAfter(startAfterDoc));
  }
  constraints.push(limit(pageSize));

  try {
    const snap = await getDocs(query(ref, ...constraints));
    return {
      items: snap.docs.map((d) => ({ id: d.id, ...d.data(), _doc: d })),
      lastDoc: snap.docs[snap.docs.length - 1] || null,
      hasMore: snap.docs.length === pageSize,
    };
  } catch (err) {
    console.error('[KUT FB] getPage failed:', name, err?.code, err?.message);
    return { items: [], lastDoc: null, hasMore: false, error: err };
  }
}

/** Realtime-подписка с жёстким лимитом (защита памяти телефона) */
function subscribePage(name, callback, opts = {}) {
  const bizId = getBusinessId();
  if (!bizId) { callback({ items: [], hasMore: false }); return () => {}; }

  const {
    pageSize = DEFAULT_PAGE_SIZE,
    orderByField = 'createdAt',
    orderDirection = 'desc',
    filters = [],
  } = opts;

  const ref = collection(db, 'businesses', bizId, name);
  const constraints = [];
  for (const f of filters) constraints.push(where(f.field, f.op, f.value));
  if (orderByField) constraints.push(orderBy(orderByField, orderDirection));
  constraints.push(limit(pageSize));

  return onSnapshot(query(ref, ...constraints), (snap) => {
    callback({
      items: snap.docs.map((d) => ({ id: d.id, ...d.data(), _doc: d })),
      lastDoc: snap.docs[snap.docs.length - 1] || null,
      hasMore: snap.docs.length === pageSize,
    });
  }, (err) => {
    console.error('[KUT FB] subscribePage error:', name, err?.code, err?.message);
    callback({ items: [], hasMore: false, error: err });
  });
}

// =========================================================
// SUPER ADMIN
// =========================================================
async function adminGetAllBusinesses() {
  const snap = await getDocs(collection(db, 'businesses'));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}
async function adminToggleBusinessStatus(bizId, active) {
  await updateDoc(doc(db, 'businesses', bizId), { active });
}
async function adminToggleUserStatus(uid, active) {
  await updateDoc(doc(db, 'users', uid), { active });
}

// =========================================================
// EXPORT
// =========================================================
window.FB = {
  app, auth, db,
  currentUser: () => currentUser,
  currentProfile: () => currentProfile,
  waitForAuth, fetchProfile, redirectByRole, makeBusinessId,

  login, registerOwner, logout, resetPassword,
  sendWhatsAppOtp, verifyWhatsAppOtp,

  enablePersistence,

  getBusinessId,
  getCollection, subscribeCollection,
  addItem, updateItem, deleteItem,

  // 🆕 Пагинация
  getPage, subscribePage,

  adminGetAllBusinesses, adminToggleBusinessStatus, adminToggleUserStatus,

  // Прямые ссылки на Firestore API (для сложных сценариев)
  collection, doc, getDoc, getDocs, setDoc, addDoc, updateDoc, deleteDoc,
  query, where, orderBy, limit, startAfter, serverTimestamp, onSnapshot, writeBatch,

  normalizePhone, toDate,
};

export {
  app, auth, db,
  waitForAuth, fetchProfile, redirectByRole, makeBusinessId,
  login, registerOwner, logout, resetPassword,
  sendWhatsAppOtp, verifyWhatsAppOtp,
  enablePersistence,
  getBusinessId,
  getCollection, subscribeCollection,
  addItem, updateItem, deleteItem,
  getPage, subscribePage,
  adminGetAllBusinesses, adminToggleBusinessStatus, adminToggleUserStatus,
  collection, doc, getDoc, getDocs, setDoc, addDoc, updateDoc, deleteDoc,
  query, where, orderBy, limit, startAfter, serverTimestamp, onSnapshot, writeBatch,
  normalizePhone, toDate,
};

console.info('[KUT FB] v10.0 · проект:', firebaseConfig.projectId, '· IndexedDB ✓ · пагинация ✓');
