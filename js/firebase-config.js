/* =========================================================
   КУТ: БИЗНЕС — Firebase Configuration v11.1 «SaaS»
   
   + Мультифилиалы: businessIds: [] в users
   + Селектор текущего бизнеса (localStorage)
   + Чтение/подписка сразу по нескольким бизнесам
   + Запись businessId во все новые документы
   + super_admin видит все бизнесы платформы
   + 🔁 Обратная совместимость: getPage / subscribePage / loadMore
     (для старых модулей cash.js / stock.js / debts.js / staff.js)
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
  collectionGroup,
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

let db;
try {
  db = initializeFirestore(app, {
    localCache: persistentLocalCache({
      tabManager: persistentMultipleTabManager(),
    }),
  });
  console.info('[KUT FB v11.1] IndexedDB persistence активен');
} catch (err) {
  console.warn('[KUT FB v11.1] persistence fallback:', err?.message);
  const { getFirestore } = await import('https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js');
  db = getFirestore(app);
}

// =========================================================
// STATE
// =========================================================
let currentUser = null;
let currentProfile = null;

// null = «Все филиалы», строка = конкретный bizId
let currentBusinessId = null;

// Метаданные бизнесов (для селектора)
let businessMetas = [];

const KG_PHONE_CODE = '+996';
const OTP_TTL_MS = 5 * 60 * 1000;
const DEFAULT_PAGE_SIZE = 50;

// Ключ localStorage для выбранной точки
const BIZ_LS_KEY = 'kut_current_business';

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
// МУЛЬТИБИЗНЕС — ЯДРО
// =========================================================

function getBusinessIds() {
  const p = currentProfile;
  if (!p) return [];

  if (p.role === 'super_admin') {
    if (Array.isArray(p.businessIds) && p.businessIds.length > 0) return p.businessIds.slice();
    if (Array.isArray(p.allBusinessIds) && p.allBusinessIds.length > 0) return p.allBusinessIds.slice();
    return [];
  }

  if (Array.isArray(p.businessIds) && p.businessIds.length > 0) {
    return p.businessIds.slice();
  }

  if (p.businessId && typeof p.businessId === 'string') {
    return [p.businessId];
  }
  return [];
}

function getEffectiveBusinessIds() {
  const all = getBusinessIds();
  if (currentBusinessId && all.includes(currentBusinessId)) {
    return [currentBusinessId];
  }
  return all;
}

function getWriteBusinessId() {
  const ids = getBusinessIds();
  if (ids.length === 0) return null;

  if (currentBusinessId && ids.includes(currentBusinessId)) {
    return currentBusinessId;
  }

  if (ids.length > 1) return null;

  return ids[0];
}

function getBusinessId() {
  const ids = getBusinessIds();
  if (ids.length === 0) return null;
  if (currentBusinessId && ids.includes(currentBusinessId)) return currentBusinessId;
  return ids[0];
}

function getSelectedBusinessId() {
  return currentBusinessId;
}

function isAllBusinessesMode() {
  return currentBusinessId === null && getBusinessIds().length > 1;
}

function setSelectedBusinessId(id) {
  if (!id || id === 'all' || id === '__all__') {
    currentBusinessId = null;
    try { localStorage.removeItem(BIZ_LS_KEY); } catch (_) {}
  } else {
    const ids = getBusinessIds();
    if (!ids.includes(id)) {
      console.warn('[KUT FB] Нельзя выбрать недоступный бизнес:', id);
      return false;
    }
    currentBusinessId = id;
    try { localStorage.setItem(BIZ_LS_KEY, id); } catch (_) {}
  }

  try {
    window.dispatchEvent(new CustomEvent('kut:business-changed', {
      detail: { businessId: currentBusinessId },
    }));
  } catch (_) {}
  return true;
}

function restoreSelectedBusinessId() {
  try {
    const saved = localStorage.getItem(BIZ_LS_KEY);
    if (!saved) {
      currentBusinessId = null;
      return;
    }
    const ids = getBusinessIds();
    if (ids.includes(saved)) {
      currentBusinessId = saved;
      console.log('[KUT FB] Выбранный филиал восстановлен:', saved);
    } else {
      currentBusinessId = null;
      try { localStorage.removeItem(BIZ_LS_KEY); } catch (_) {}
    }
  } catch (_) {
    currentBusinessId = null;
  }
}

async function loadBusinessesMeta(ids) {
  ids = ids || getBusinessIds();
  const result = [];
  await Promise.all(ids.map(async (id) => {
    try {
      const snap = await getDoc(doc(db, 'businesses', id));
      if (snap.exists()) {
        result.push({ id, ...snap.data() });
      } else {
        result.push({ id, name: 'Точка ' + String(id).slice(-4), missing: true });
      }
    } catch (e) {
      result.push({ id, name: 'Точка ' + String(id).slice(-4), error: e.code });
    }
  }));

  result.sort((a, b) => String(a.name || '').localeCompare(String(b.name || ''), 'ru'));
  businessMetas = result;
  return result;
}

function getBusinessesMeta() {
  return businessMetas.slice();
}

// =========================================================
// PERSISTENCE
// =========================================================
async function enablePersistence() {
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

      if (currentProfile) {
        restoreSelectedBusinessId();
      } else {
        currentBusinessId = null;
      }

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
  if (profile) restoreSelectedBusinessId();
  return { user: cred.user, profile };
}

async function registerOwner({ email, password, displayName, companyName }) {
  const cred = await createUserWithEmailAndPassword(auth, email, password);
  const uid = cred.user.uid;
  const businessId = makeBusinessId();

  await setDoc(doc(db, 'users', uid), {
    email, displayName, phone: '',
    role: 'owner',
    businessIds: [businessId],
    businessId: businessId,
    active: true,
    createdAt: serverTimestamp(),
  });

  await setDoc(doc(db, 'businesses', businessId), {
    name: companyName,
    ownerUid: uid, ownerEmail: email,
    status: 'active',
    createdAt: serverTimestamp(),
  });

  currentUser = cred.user;
  currentProfile = await fetchProfile(uid);
  currentBusinessId = businessId;
  try { localStorage.setItem(BIZ_LS_KEY, businessId); } catch (_) {}

  return { user: cred.user, businessId, profile: currentProfile };
}

async function logout() {
  try { await signOut(auth); } catch (_) {}
  currentUser = null;
  currentProfile = null;
  currentBusinessId = null;
  businessMetas = [];
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
      role: 'cashier',
      businessIds: [],
      businessId: '',
      active: true,
      createdAt: serverTimestamp(),
    });
    profile = await fetchProfile(uid);
  }

  currentUser = cred.user;
  currentProfile = profile;
  if (profile) restoreSelectedBusinessId();
  return { user: cred.user, profile };
}

// =========================================================
// FIRESTORE — БАЗОВЫЕ CRUD
// =========================================================
async function getCollection(name) {
  const bizId = getBusinessId();
  if (!bizId) return [];
  try {
    const snap = await getDocs(collection(db, 'businesses', bizId, name));
    return snap.docs.map((d) => ({ id: d.id, businessId: bizId, ...d.data() }));
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

  let q;
  try {
    q = orderByField
      ? query(ref, orderBy(orderByField, orderDirection), limit(lc))
      : query(ref, limit(lc));
  } catch (_) {
    q = query(ref, limit(lc));
  }

  return onSnapshot(q, (snap) => {
    callback(snap.docs.map((d) => ({ id: d.id, businessId: bizId, ...d.data() })));
  }, (err) => {
    console.error('[KUT FB] subscribe error:', name, err);
  });
}

// =========================================================
// 🔁 ОБРАТНАЯ СОВМЕСТИМОСТЬ — getPage / subscribePage / loadMore
//    (для старых модулей cash.js / stock.js / debts.js / staff.js)
// =========================================================

/**
 * Постраничная загрузка из ТЕКУЩЕГО филиала (или первого, если «все»).
 * Возвращает { items, lastDoc, hasMore }.
 */
async function getPage(name, opts = {}) {
  const bizIds = getEffectiveBusinessIds();
  if (!bizIds || bizIds.length === 0) {
    return { items: [], lastDoc: null, hasMore: false };
  }

  // Если один филиал — простой путь
  if (bizIds.length === 1) {
    const bizId = bizIds[0];
    const {
      pageSize = DEFAULT_PAGE_SIZE,
      orderByField = 'createdAt',
      orderDirection = 'desc',
      startAfterDoc = null,
      filters = [],
    } = opts;

    const ref = collection(db, 'businesses', bizId, name);
    const constraints = [];
    for (const f of filters) constraints.push(where(f.field, f.op, f.value));
    if (orderByField) constraints.push(orderBy(orderByField, orderDirection));
    if (startAfterDoc) constraints.push(startAfter(startAfterDoc));
    constraints.push(limit(pageSize));

    try {
      const snap = await getDocs(query(ref, ...constraints));
      return {
        items: snap.docs.map((d) => ({
          id: d.id,
          businessId: bizId,
          _bizId: bizId,
          _doc: d,
          ...d.data(),
        })),
        lastDoc: snap.docs[snap.docs.length - 1] || null,
        hasMore: snap.docs.length === pageSize,
      };
    } catch (err) {
      console.error('[KUT FB] getPage failed:', name, err?.code);
      return { items: [], lastDoc: null, hasMore: false, error: err };
    }
  }

  // Если несколько (режим «Все филиалы») — собираем со всех
  const {
    pageSize = DEFAULT_PAGE_SIZE,
    orderByField = 'createdAt',
    orderDirection = 'desc',
  } = opts;

  const all = await getCollectionMulti(bizIds, name, {
    pageSize,
    orderByField,
    orderDirection,
  });

  // Сортируем вручную по orderByField (Firestore не даёт сортировать через несколько parent-коллекций)
  if (orderByField) {
    all.sort((a, b) => {
      const av = toDate(a[orderByField])?.getTime() || 0;
      const bv = toDate(b[orderByField])?.getTime() || 0;
      return orderDirection === 'desc' ? bv - av : av - bv;
    });
  }

  return {
    items: all,
    lastDoc: null,
    hasMore: false,
  };
}

/**
 * Realtime-подписка. Если один филиал — subscribeCollection.
 * Если несколько — subscribeMulti.
 */
function subscribePage(name, callback, opts = {}) {
  const bizIds = getEffectiveBusinessIds();
  if (!bizIds || bizIds.length === 0) {
    callback({ items: [], hasMore: false });
    return () => {};
  }

  // Один филиал — простая подписка
  if (bizIds.length === 1) {
    const bizId = bizIds[0];
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
      const items = snap.docs.map((d) => ({
        id: d.id,
        businessId: bizId,
        _bizId: bizId,
        _doc: d,
        ...d.data(),
      }));
      callback({
        items,
        lastDoc: snap.docs[snap.docs.length - 1] || null,
        hasMore: snap.docs.length === pageSize,
      });
    }, (err) => {
      console.error('[KUT FB] subscribePage error:', name, err?.code);
      callback({ items: [], hasMore: false, error: err });
    });
  }

  // Несколько филиалов — мультиподписка
  const {
    pageSize = DEFAULT_PAGE_SIZE,
    orderByField = 'createdAt',
    orderDirection = 'desc',
  } = opts;

  const unsubMulti = subscribeMulti(bizIds, name, (items) => {
    // Сортируем вручную
    if (orderByField) {
      items.sort((a, b) => {
        const av = toDate(a[orderByField])?.getTime() || 0;
        const bv = toDate(b[orderByField])?.getTime() || 0;
        return orderDirection === 'desc' ? bv - av : av - bv;
      });
    }
    callback({ items, hasMore: false });
  }, { pageSize, orderByField, orderDirection });

  return unsubMulti;
}

/**
 * Догрузка следующих N записей после курсора.
 */
async function loadMore(name, lastDoc, opts = {}) {
  const bizId = getBusinessId();
  if (!bizId || !lastDoc) return { items: [], lastDoc: null, hasMore: false };

  const {
    pageSize = DEFAULT_PAGE_SIZE,
    orderByField = 'createdAt',
    orderDirection = 'desc',
  } = opts;

  const ref = collection(db, 'businesses', bizId, name);
  try {
    const q = query(
      ref,
      orderBy(orderByField, orderDirection),
      startAfter(lastDoc),
      limit(pageSize)
    );
    const snap = await getDocs(q);
    return {
      items: snap.docs.map((d) => ({ id: d.id, businessId: bizId, ...d.data() })),
      lastDoc: snap.docs[snap.docs.length - 1] || null,
      hasMore: snap.docs.length === pageSize,
    };
  } catch (err) {
    console.error('[KUT FB] loadMore failed:', name, err?.code);
    return { items: [], lastDoc: null, hasMore: false };
  }
}

// =========================================================
// FIRESTORE — МУЛЬТИБИЗНЕС
// =========================================================

async function getCollectionMulti(bizIds, name, opts = {}) {
  if (!Array.isArray(bizIds) || bizIds.length === 0) return [];

  const {
    pageSize = 200,
    orderByField = 'createdAt',
    orderDirection = 'desc',
  } = opts;

  const results = [];

  await Promise.all(bizIds.map(async (bizId) => {
    try {
      const ref = collection(db, 'businesses', bizId, name);
      const constraints = [];
      if (orderByField) constraints.push(orderBy(orderByField, orderDirection));
      if (pageSize) constraints.push(limit(pageSize));
      const q = constraints.length ? query(ref, ...constraints) : ref;
      const snap = await getDocs(q);
      snap.docs.forEach((d) => {
        results.push({
          id: d.id,
          businessId: bizId,
          _bizId: bizId,
          ...d.data(),
        });
      });
    } catch (e) {
      console.warn('[KUT FB] getCollectionMulti failed:', bizId, name, e?.code);
    }
  }));

  return results;
}

function subscribeMulti(bizIds, name, callback, opts = {}) {
  if (!Array.isArray(bizIds) || bizIds.length === 0) {
    callback([]);
    return () => {};
  }

  const {
    pageSize = 200,
    orderByField = 'createdAt',
    orderDirection = 'desc',
  } = opts;

  const buffers = {};
  bizIds.forEach((id) => { buffers[id] = []; });

  const unsubs = [];

  const emit = () => {
    const all = [];
    bizIds.forEach((id) => {
      (buffers[id] || []).forEach((item) => all.push(item));
    });
    callback(all);
  };

  bizIds.forEach((bizId) => {
    try {
      const ref = collection(db, 'businesses', bizId, name);
      const constraints = [];
      if (orderByField) constraints.push(orderBy(orderByField, orderDirection));
      if (pageSize) constraints.push(limit(pageSize));
      const q = constraints.length ? query(ref, ...constraints) : ref;

      const unsub = onSnapshot(q, (snap) => {
        buffers[bizId] = snap.docs.map((d) => ({
          id: d.id,
          businessId: bizId,
          _bizId: bizId,
          ...d.data(),
        }));
        emit();
      }, (err) => {
        console.error('[KUT FB] subscribeMulti error:', bizId, name, err?.code);
        buffers[bizId] = [];
        emit();
      });

      unsubs.push(unsub);
    } catch (e) {
      console.error('[KUT FB] subscribeMulti init error:', bizId, e);
    }
  });

  return () => {
    unsubs.forEach((u) => { try { u(); } catch (_) {} });
  };
}

// =========================================================
// FIRESTORE — WRITE
// =========================================================
async function addItem(name, data) {
  const bizId = getWriteBusinessId();
  if (!bizId) {
    const err = new Error('NO_BUSINESS');
    err.code = 'no_business';
    throw err;
  }
  return addDoc(collection(db, 'businesses', bizId, name), {
    ...data,
    businessId: bizId,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
}

async function updateItem(name, id, data) {
  const bizId = getWriteBusinessId() || getBusinessId();
  if (!bizId) throw new Error('NO_BUSINESS');
  return updateDoc(doc(db, 'businesses', bizId, name, id), {
    ...data,
    updatedAt: serverTimestamp(),
  });
}

async function updateItemInBiz(bizId, name, id, data) {
  if (!bizId) throw new Error('NO_BIZ');
  return updateDoc(doc(db, 'businesses', bizId, name, id), {
    ...data,
    updatedAt: serverTimestamp(),
  });
}

async function deleteItem(name, id) {
  const bizId = getWriteBusinessId() || getBusinessId();
  if (!bizId) throw new Error('NO_BUSINESS');
  return deleteDoc(doc(db, 'businesses', bizId, name, id));
}

async function deleteItemInBiz(bizId, name, id) {
  if (!bizId) throw new Error('NO_BIZ');
  return deleteDoc(doc(db, 'businesses', bizId, name, id));
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

  // Мультибизнес
  getBusinessIds,
  getEffectiveBusinessIds,
  getWriteBusinessId,
  getBusinessId,
  getSelectedBusinessId,
  setSelectedBusinessId,
  restoreSelectedBusinessId,
  isAllBusinessesMode,
  loadBusinessesMeta,
  getBusinessesMeta,

  // Чтение/подписка
  getCollection, subscribeCollection,
  getCollectionMulti, subscribeMulti,

  // 🔁 Обратная совместимость
  getPage, subscribePage, loadMore,

  // Запись
  addItem, updateItem, deleteItem,
  updateItemInBiz, deleteItemInBiz,

  adminGetAllBusinesses, adminToggleBusinessStatus, adminToggleUserStatus,

  collection, doc, getDoc, getDocs, setDoc, addDoc, updateDoc, deleteDoc,
  query, where, orderBy, limit, startAfter, serverTimestamp, onSnapshot,
  writeBatch, collectionGroup,

  normalizePhone, toDate,
};

export {
  app, auth, db,
  waitForAuth, fetchProfile, redirectByRole, makeBusinessId,
  login, registerOwner, logout, resetPassword,
  sendWhatsAppOtp, verifyWhatsAppOtp,
  enablePersistence,

  getBusinessIds,
  getEffectiveBusinessIds,
  getWriteBusinessId,
  getBusinessId,
  getSelectedBusinessId,
  setSelectedBusinessId,
  restoreSelectedBusinessId,
  isAllBusinessesMode,
  loadBusinessesMeta,
  getBusinessesMeta,

  getCollection, subscribeCollection,
  getCollectionMulti, subscribeMulti,
  getPage, subscribePage, loadMore,

  addItem, updateItem, deleteItem,
  updateItemInBiz, deleteItemInBiz,

  adminGetAllBusinesses, adminToggleBusinessStatus, adminToggleUserStatus,

  collection, doc, getDoc, getDocs, setDoc, addDoc, updateDoc, deleteDoc,
  query, where, orderBy, limit, startAfter, serverTimestamp, onSnapshot,
  writeBatch, collectionGroup,

  normalizePhone, toDate,
};

console.info('[KUT FB v11.1 «SaaS»] · проект:', firebaseConfig.projectId, '· мультифилиалы + обратная совместимость');
