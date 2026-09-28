/* =========================================================
   КУТ: БИЗНЕС — Firebase Core v14 «Google + Telegram (client)»
   
   • Вход: Google (popup/redirect) + Telegram (без Cloud Functions)
   • Telegram: производный пароль от Telegram ID → Email/Password Auth
   • Первый вход: автосоздание бизнеса (businessId = uid)
   • Firestore: persistentLocalCache + multi-tab
   • Все подписки onSnapshot учитываются и снимаются
   
   ⚠️ ВАЖНО: для Telegram-входа включи в Firebase Console:
      Authentication → Sign-in method → Email/Password → Enable
   ========================================================= */

import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js';
import {
  getAuth,
  onAuthStateChanged,
  GoogleAuthProvider,
  signInWithPopup,
  signInWithRedirect,
  getRedirectResult,
  signInWithCustomToken,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut,
} from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js';
import {
  initializeFirestore,
  getFirestore,
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

/* ---------- CONFIG ---------- */
const firebaseConfig = {
  apiKey:            'AIzaSyAO1MhiEWnBKhcEs64XMMPVN0GDEZFpxPg',
  authDomain:        'kut-biznes.firebaseapp.com',
  projectId:         'kut-biznes',
  storageBucket:     'kut-biznes.firebasestorage.app',
  messagingSenderId: '699153181693',
  appId:             '1:699153181693:web:2f10e57664e8a0cefc4794',
  measurementId:     'G-VTZ49G265B',
};

/* ---------- TELEGRAM BOT NAME (без @) ---------- */
export const TELEGRAM_BOT_NAME = 'NexusBizIDBot';

/* ---------- TELEGRAM SALT ----------
   Секрет для производного пароля.
   ⚠️ НЕ меняй после релиза — иначе существующие
      Telegram-пользователи не смогут войти.
   ------------------------------------ */
const TG_SALT = 'KUT_BIZ_2026_a7f3e9c2d4b8_x9K3_pL8q_R2f';

/* ---------- INIT ---------- */
const app  = initializeApp(firebaseConfig);
const auth = getAuth(app);

let db;
try {
  db = initializeFirestore(app, {
    localCache: persistentLocalCache({
      tabManager: persistentMultipleTabManager(),
    }),
  });
} catch (err) {
  console.warn('[KUT FB] persistence fallback:', err && err.message);
  db = getFirestore(app);
}

/* ---------- STATE ---------- */
let currentUser = null;
let currentProfile = null;
let currentBusinessId = null;
let businessMetas = [];

const BIZ_LS_KEY = 'kut_current_business';
const DEFAULT_PAGE_SIZE = 50;

/* ---------- HELPERS ---------- */
function toDate(ts) {
  if (!ts) return null;
  if (typeof ts.toDate === 'function') return ts.toDate();
  if (ts.seconds) return new Date(ts.seconds * 1000);
  const d = new Date(ts);
  return isNaN(d.getTime()) ? null : d;
}

function normalizePhone(raw) {
  let d = String(raw || '').replace(/\D/g, '');
  if (!d) return '';
  if (d.startsWith('996')) d = d.slice(3);
  else if (d.startsWith('0')) d = d.slice(1);
  return '+996' + d.slice(0, 9);
}

function makeBusinessId() {
  return 'biz_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

/* ---------- РЕЕСТР ПОДПИСОК ---------- */
const liveSubs = new Set();

function track(unsub) {
  let done = false;
  const wrapped = () => {
    if (done) return;
    done = true;
    liveSubs.delete(wrapped);
    try { unsub(); } catch (_) {}
  };
  liveSubs.add(wrapped);
  return wrapped;
}

function unsubscribeAll() {
  Array.from(liveSubs).forEach((u) => u());
}

/* ---------- МУЛЬТИБИЗНЕС ---------- */
function getBusinessIds() {
  const p = currentProfile;
  if (!p) return [];
  if (p.role === 'super_admin') {
    if (Array.isArray(p.businessIds) && p.businessIds.length) return p.businessIds.slice();
    if (Array.isArray(p.allBusinessIds) && p.allBusinessIds.length) return p.allBusinessIds.slice();
    return [];
  }
  if (Array.isArray(p.businessIds) && p.businessIds.length) return p.businessIds.slice();
  if (p.businessId && typeof p.businessId === 'string') return [p.businessId];
  return [];
}

function getEffectiveBusinessIds() {
  const all = getBusinessIds();
  return currentBusinessId && all.includes(currentBusinessId) ? [currentBusinessId] : all;
}

function getWriteBusinessId() {
  const ids = getBusinessIds();
  if (!ids.length) return null;
  if (currentBusinessId && ids.includes(currentBusinessId)) return currentBusinessId;
  return ids.length > 1 ? null : ids[0];
}

function getBusinessId() {
  const ids = getBusinessIds();
  if (!ids.length) return null;
  return currentBusinessId && ids.includes(currentBusinessId) ? currentBusinessId : ids[0];
}

function getSelectedBusinessId() { return currentBusinessId; }

function isAllBusinessesMode() {
  return currentBusinessId === null && getBusinessIds().length > 1;
}

function setSelectedBusinessId(id) {
  if (!id || id === 'all' || id === '__all__') {
    currentBusinessId = null;
    try { localStorage.removeItem(BIZ_LS_KEY); } catch (_) {}
  } else {
    if (!getBusinessIds().includes(id)) return false;
    currentBusinessId = id;
    try { localStorage.setItem(BIZ_LS_KEY, id); } catch (_) {}
  }
  unsubscribeAll();
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
    if (saved && getBusinessIds().includes(saved)) {
      currentBusinessId = saved;
    } else {
      currentBusinessId = null;
      if (saved) localStorage.removeItem(BIZ_LS_KEY);
    }
  } catch (_) {
    currentBusinessId = null;
  }
}

async function loadBusinessesMeta(ids) {
  ids = ids || getBusinessIds();
  const result = await Promise.all(ids.map(async (id) => {
    try {
      const snap = await getDoc(doc(db, 'businesses', id));
      return snap.exists()
        ? { id, ...snap.data() }
        : { id, name: 'Точка ' + String(id).slice(-4), missing: true };
    } catch (e) {
      return { id, name: 'Точка ' + String(id).slice(-4), error: e.code };
    }
  }));
  result.sort((a, b) => String(a.name || '').localeCompare(String(b.name || ''), 'ru'));
  businessMetas = result;
  return result;
}

function getBusinessesMeta() { return businessMetas.slice(); }

async function enablePersistence() {
  return { ok: true, mode: 'persistentLocalCache' };
}

/* =========================================================
   ОБЩАЯ ЛОГИКА ПРОФИЛЯ
   ========================================================= */
async function fetchProfile(uid) {
  try {
    const snap = await getDoc(doc(db, 'users', uid));
    return snap.exists() ? { uid, ...snap.data() } : null;
  } catch (e) {
    console.error('[KUT FB] fetchProfile failed:', e);
    return null;
  }
}

async function ensureCompany(user, extra) {
  const uid = user.uid;
  let profile = await fetchProfile(uid);
  if (profile) return profile;

  const batch = writeBatch(db);
  const provider = extra?.provider || 'google';
  const displayName = extra?.displayName
    || user.displayName
    || (user.email ? user.email.split('@')[0] : 'Владелец');
  const photoURL = extra?.photoURL || user.photoURL || '';

  const userDoc = {
    uid,
    email: user.email || '',
    displayName,
    photoURL,
    phone: '',
    role: 'owner',
    businessId: uid,
    businessIds: [uid],
    active: true,
    authProvider: provider,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };

  if (extra?.telegramId) {
    userDoc.telegramId = String(extra.telegramId);
    userDoc.telegramUsername = extra.telegramUsername || '';
  }

  batch.set(doc(db, 'users', uid), userDoc);

  batch.set(doc(db, 'businesses', uid), {
    name: 'Компания · ' + displayName,
    ownerUid: uid,
    ownerEmail: user.email || '',
    status: 'active',
    active: true,
    createdAt: serverTimestamp(),
  });

  await batch.commit();

  profile = await fetchProfile(uid);
  return profile || {
    uid,
    role: 'owner',
    businessId: uid,
    businessIds: [uid],
    active: true,
    email: user.email || '',
    displayName,
  };
}

async function finishSignIn(user, extra) {
  const profile = await ensureCompany(user, extra);
  if (profile.active === false) {
    await signOut(auth);
    const err = new Error('ACCOUNT_DISABLED');
    err.code = 'account-disabled';
    throw err;
  }
  currentUser = user;
  currentProfile = profile;
  restoreSelectedBusinessId();
  return { user, profile };
}

/* =========================================================
   GOOGLE AUTH
   ========================================================= */
function makeProvider() {
  const p = new GoogleAuthProvider();
  p.setCustomParameters({ prompt: 'select_account' });
  return p;
}

async function signInWithGoogle() {
  const provider = makeProvider();
  try {
    const cred = await signInWithPopup(auth, provider);
    return await finishSignIn(cred.user, { provider: 'google' });
  } catch (err) {
    const fallback = [
      'auth/popup-blocked',
      'auth/operation-not-supported-in-this-environment',
      'auth/web-storage-unsupported',
    ];
    if (fallback.includes(err.code)) {
      await signInWithRedirect(auth, provider);
      return null;
    }
    throw err;
  }
}

/* =========================================================
   TELEGRAM AUTH (клиентская версия)
   ========================================================= */

/**
 * SHA-256 от строки — возвращает hex.
 */
async function sha256Hex(input) {
  const buf = new TextEncoder().encode(input);
  const hash = await crypto.subtle.digest('SHA-256', buf);
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * Производный пароль от Telegram ID + секрет.
 * Стабилен: один и тот же Telegram ID всегда даёт один пароль.
 */
async function deriveTgPassword(telegramId) {
  return sha256Hex(`${telegramId}_${TG_SALT}_KUT`);
}

/**
 * Производный email от Telegram ID.
 * Firebase требует уникальный email — берём фиктивный домен.
 */
function deriveTgEmail(telegramId) {
  return `tg_${telegramId}@kut-biznes.app`;
}

/**
 * Вход через Telegram (виджет onTelegramAuth)
 */
async function signInWithTelegram(tgUser) {
  if (!tgUser || !tgUser.id) {
    const err = new Error('Некорректные данные Telegram');
    err.code = 'telegram/bad_data';
    throw err;
  }

  // Свежесть: не старше 24 часов
  const now = Math.floor(Date.now() / 1000);
  const authTs = Number(tgUser.auth_date) || 0;
  if (authTs && Math.abs(now - authTs) > 86400) {
    const err = new Error('Данные Telegram устарели');
    err.code = 'telegram/expired';
    throw err;
  }

  const telegramId = String(tgUser.id);
  const email = deriveTgEmail(telegramId);
  const password = await deriveTgPassword(telegramId);

  const displayName =
    [tgUser.first_name, tgUser.last_name].filter(Boolean).join(' ') ||
    tgUser.username ||
    'Пользователь Telegram';

  const extra = {
    provider: 'telegram',
    telegramId,
    telegramUsername: tgUser.username || '',
    displayName,
    photoURL: tgUser.photo_url || '',
  };

  // 1. Пробуем войти
  try {
    const cred = await signInWithEmailAndPassword(auth, email, password);
    return await finishSignIn(cred.user, extra);
  } catch (e) {
    // 2. Если не найден или неверный пароль — создаём
    if (
      e.code === 'auth/user-not-found' ||
      e.code === 'auth/invalid-credential' ||
      e.code === 'auth/invalid-login-credentials'
    ) {
      try {
        const cred = await createUserWithEmailAndPassword(auth, email, password);
        return await finishSignIn(cred.user, extra);
      } catch (createErr) {
        if (createErr.code === 'auth/email-already-in-use') {
          const err = new Error('Аккаунт уже существует, но пароль не подошёл');
          err.code = 'telegram/password_mismatch';
          throw err;
        }
        throw createErr;
      }
    }
    throw e;
  }
}

/* =========================================================
   REDIRECT / LOGOUT / WAIT
   ========================================================= */
async function handleRedirectResult() {
  const cred = await getRedirectResult(auth);
  return cred && cred.user
    ? finishSignIn(cred.user, { provider: 'google' })
    : null;
}

function waitForAuth() {
  return new Promise((resolve) => {
    const unsub = onAuthStateChanged(auth, async (user) => {
      unsub();
      currentUser = user;
      currentProfile = null;
      currentBusinessId = null;
      if (user) {
        try {
          currentProfile = await ensureCompany(user);
          restoreSelectedBusinessId();
        } catch (e) {
          console.error('[KUT FB] ensureCompany failed:', e);
        }
      }
      resolve({ user: currentUser, profile: currentProfile });
    });
  });
}

function redirectByRole(profile) {
  if (!profile) { window.location.href = './login.html'; return; }
  if (profile.active === false) { signOut(auth); return; }
  window.location.href = profile.role === 'super_admin' ? './admin.html'
    : profile.role === 'cashier' ? './cash.html'
    : './index.html';
}

async function logout() {
  unsubscribeAll();
  try { await signOut(auth); } catch (_) {}
  currentUser = null;
  currentProfile = null;
  currentBusinessId = null;
  businessMetas = [];
  window.location.href = './login.html';
}

/* =========================================================
   ДАННЫЕ
   ========================================================= */
function mapDoc(d, bizId, withDoc) {
  const o = { id: d.id, businessId: bizId, _bizId: bizId, ...d.data() };
  if (withDoc) o._doc = d;
  return o;
}

function buildQuery(ref, { filters = [], orderByField, orderDirection, startAfterDoc, pageSize }) {
  const c = [];
  filters.forEach((f) => c.push(where(f.field, f.op, f.value)));
  if (orderByField) c.push(orderBy(orderByField, orderDirection));
  if (startAfterDoc) c.push(startAfter(startAfterDoc));
  if (pageSize) c.push(limit(pageSize));
  return c.length ? query(ref, ...c) : ref;
}

function sortByField(items, field, dir) {
  if (!field) return items;
  return items.sort((a, b) => {
    const av = (toDate(a[field]) || 0).valueOf();
    const bv = (toDate(b[field]) || 0).valueOf();
    return dir === 'desc' ? bv - av : av - bv;
  });
}

async function getCollection(name) {
  const bizId = getBusinessId();
  if (!bizId) return [];
  try {
    const snap = await getDocs(collection(db, 'businesses', bizId, name));
    return snap.docs.map((d) => mapDoc(d, bizId));
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
  const q = buildQuery(collection(db, 'businesses', bizId, name), {
    orderByField, orderDirection, pageSize: limitCount || pageSize,
  });
  return track(onSnapshot(q,
    (snap) => callback(snap.docs.map((d) => mapDoc(d, bizId))),
    (err) => console.error('[KUT FB] subscribe error:', name, err)));
}

async function getCollectionMulti(bizIds, name, opts = {}) {
  if (!Array.isArray(bizIds) || !bizIds.length) return [];
  const { pageSize = 200, orderByField = 'createdAt', orderDirection = 'desc' } = opts;
  const parts = await Promise.all(bizIds.map(async (bizId) => {
    try {
      const q = buildQuery(collection(db, 'businesses', bizId, name),
        { orderByField, orderDirection, pageSize });
      const snap = await getDocs(q);
      return snap.docs.map((d) => mapDoc(d, bizId));
    } catch (e) {
      console.warn('[KUT FB] getCollectionMulti failed:', bizId, name, e && e.code);
      return [];
    }
  }));
  return parts.flat();
}

function subscribeMulti(bizIds, name, callback, opts = {}) {
  if (!Array.isArray(bizIds) || !bizIds.length) { callback([]); return () => {}; }
  const { pageSize = 200, orderByField = 'createdAt', orderDirection = 'desc' } = opts;
  const buffers = {};
  const unsubs = [];
  let scheduled = false;

  const emit = () => {
    if (scheduled) return;
    scheduled = true;
    Promise.resolve().then(() => {
      scheduled = false;
      callback(bizIds.flatMap((id) => buffers[id] || []));
    });
  };

  bizIds.forEach((bizId) => {
    buffers[bizId] = [];
    try {
      const q = buildQuery(collection(db, 'businesses', bizId, name),
        { orderByField, orderDirection, pageSize });
      unsubs.push(onSnapshot(q, (snap) => {
        buffers[bizId] = snap.docs.map((d) => mapDoc(d, bizId));
        emit();
      }, (err) => {
        console.error('[KUT FB] subscribeMulti error:', bizId, err && err.code);
        buffers[bizId] = [];
        emit();
      }));
    } catch (e) {
      console.error('[KUT FB] subscribeMulti init error:', bizId, e);
    }
  });

  return track(() => unsubs.forEach((u) => { try { u(); } catch (_) {} }));
}

async function getPage(name, opts = {}) {
  const bizIds = getEffectiveBusinessIds();
  if (!bizIds.length) return { items: [], lastDoc: null, hasMore: false };

  const {
    pageSize = DEFAULT_PAGE_SIZE,
    orderByField = 'createdAt',
    orderDirection = 'desc',
    startAfterDoc = null,
    filters = [],
  } = opts;

  if (bizIds.length === 1) {
    const bizId = bizIds[0];
    try {
      const q = buildQuery(collection(db, 'businesses', bizId, name),
        { filters, orderByField, orderDirection, startAfterDoc, pageSize });
      const snap = await getDocs(q);
      return {
        items: snap.docs.map((d) => mapDoc(d, bizId, true)),
        lastDoc: snap.docs[snap.docs.length - 1] || null,
        hasMore: snap.docs.length === pageSize,
      };
    } catch (err) {
      console.error('[KUT FB] getPage failed:', name, err && err.code);
      return { items: [], lastDoc: null, hasMore: false, error: err };
    }
  }

  const all = await getCollectionMulti(bizIds, name, { pageSize, orderByField, orderDirection });
  return { items: sortByField(all, orderByField, orderDirection), lastDoc: null, hasMore: false };
}

function subscribePage(name, callback, opts = {}) {
  const bizIds = getEffectiveBusinessIds();
  if (!bizIds.length) { callback({ items: [], hasMore: false }); return () => {}; }

  const {
    pageSize = DEFAULT_PAGE_SIZE,
    orderByField = 'createdAt',
    orderDirection = 'desc',
    filters = [],
  } = opts;

  if (bizIds.length === 1) {
    const bizId = bizIds[0];
    const q = buildQuery(collection(db, 'businesses', bizId, name),
      { filters, orderByField, orderDirection, pageSize });
    return track(onSnapshot(q, (snap) => {
      callback({
        items: snap.docs.map((d) => mapDoc(d, bizId, true)),
        lastDoc: snap.docs[snap.docs.length - 1] || null,
        hasMore: snap.docs.length === pageSize,
      });
    }, (err) => {
      console.error('[KUT FB] subscribePage error:', name, err && err.code);
      callback({ items: [], hasMore: false, error: err });
    }));
  }

  return subscribeMulti(bizIds, name, (items) => {
    callback({ items: sortByField(items, orderByField, orderDirection), hasMore: false });
  }, { pageSize, orderByField, orderDirection });
}

async function loadMore(name, lastDoc, opts = {}) {
  const bizId = getBusinessId();
  if (!bizId || !lastDoc) return { items: [], lastDoc: null, hasMore: false };
  const { pageSize = DEFAULT_PAGE_SIZE, orderByField = 'createdAt', orderDirection = 'desc' } = opts;
  try {
    const q = buildQuery(collection(db, 'businesses', bizId, name),
      { orderByField, orderDirection, startAfterDoc: lastDoc, pageSize });
    const snap = await getDocs(q);
    return {
      items: snap.docs.map((d) => mapDoc(d, bizId)),
      lastDoc: snap.docs[snap.docs.length - 1] || null,
      hasMore: snap.docs.length === pageSize,
    };
  } catch (err) {
    console.error('[KUT FB] loadMore failed:', name, err && err.code);
    return { items: [], lastDoc: null, hasMore: false };
  }
}

/* ---------- CRUD ---------- */
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

async function updateItemInBiz(bizId, name, id, data) {
  if (!bizId) throw new Error('NO_BIZ');
  return updateDoc(doc(db, 'businesses', bizId, name, id), {
    ...data,
    updatedAt: serverTimestamp(),
  });
}

async function updateItem(name, id, data) {
  return updateItemInBiz(getWriteBusinessId() || getBusinessId(), name, id, data);
}

async function deleteItemInBiz(bizId, name, id) {
  if (!bizId) throw new Error('NO_BIZ');
  return deleteDoc(doc(db, 'businesses', bizId, name, id));
}

async function deleteItem(name, id) {
  return deleteItemInBiz(getWriteBusinessId() || getBusinessId(), name, id);
}

/* ---------- SUPER ADMIN ---------- */
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

/* =========================================================
   ЭКСПОРТ
   ========================================================= */
window.addEventListener('pagehide', unsubscribeAll);

window.FB = {
  app, auth, db,
  currentUser: () => currentUser,
  currentProfile: () => currentProfile,
  waitForAuth, fetchProfile, redirectByRole, makeBusinessId,
  signInWithGoogle, signInWithTelegram, handleRedirectResult, logout,
  enablePersistence, unsubscribeAll,

  getBusinessIds, getEffectiveBusinessIds, getWriteBusinessId, getBusinessId,
  getSelectedBusinessId, setSelectedBusinessId, restoreSelectedBusinessId,
  isAllBusinessesMode, loadBusinessesMeta, getBusinessesMeta,

  getCollection, subscribeCollection,
  getCollectionMulti, subscribeMulti,
  getPage, subscribePage, loadMore,

  addItem, updateItem, deleteItem, updateItemInBiz, deleteItemInBiz,

  adminGetAllBusinesses, adminToggleBusinessStatus, adminToggleUserStatus,

  collection, doc, getDoc, getDocs, setDoc, addDoc, updateDoc, deleteDoc,
  query, where, orderBy, limit, startAfter, serverTimestamp, onSnapshot,
  writeBatch, collectionGroup,

  normalizePhone, toDate,

  TELEGRAM_BOT_NAME,
};

export {
  app, auth, db,
  waitForAuth, fetchProfile, redirectByRole, makeBusinessId,
  signInWithGoogle, signInWithTelegram, handleRedirectResult, logout,
  enablePersistence, unsubscribeAll,
  getBusinessIds, getEffectiveBusinessIds, getWriteBusinessId, getBusinessId,
  getSelectedBusinessId, setSelectedBusinessId, restoreSelectedBusinessId,
  isAllBusinessesMode, loadBusinessesMeta, getBusinessesMeta,
  getCollection, subscribeCollection, getCollectionMulti, subscribeMulti,
  getPage, subscribePage, loadMore,
  addItem, updateItem, deleteItem, updateItemInBiz, deleteItemInBiz,
  adminGetAllBusinesses, adminToggleBusinessStatus, adminToggleUserStatus,
  collection, doc, getDoc, getDocs, setDoc, addDoc, updateDoc, deleteDoc,
  query, where, orderBy, limit, startAfter, serverTimestamp, onSnapshot,
  writeBatch, collectionGroup,
  normalizePhone, toDate,
  TELEGRAM_BOT_NAME,
};
