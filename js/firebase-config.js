/* =========================================================
   КУТ: БИЗНЕС — Firebase Configuration v8.2
   Единая точка подключения Auth + Firestore ко всем модулям.
   Импортируется из js/app.js и используется всеми страницами.

   ⚠️ v8.2 — HOTFIX
   В v8.1 был добавлен import enableIndexedDbPersistence,
   но в Firebase JS SDK v10.12.0 эта функция УДАЛЕНА.
   ES-модуль падал → window.FB не создавался → app.js не грузился
   → вся интерактивность на всех страницах умирала.
   Возвращаем безопасную заглушку enablePersistence() без реального
   вызова удалённого API. Офлайн-очередь пока отключена.
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
  getFirestore,
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
  serverTimestamp,
  onSnapshot,
  writeBatch,
} from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js';

// =========================================================
// FIREBASE CONFIG — правильные ключи проекта
// =========================================================
const firebaseConfig = {
  apiKey:            "AIzaSyAO1MhiEWnBKhcEs64XMMPVN0GDEZFpxPg",
  authDomain:        "kut-biznes.firebaseapp.com",
  projectId:         "kut-biznes",
  storageBucket:     "kut-biznes.firebasestorage.app",
  messagingSenderId: "699153181693",
  appId:             "1:699153181693:web:2f10e57664e8a0cefc4794",
  measurementId:     "G-VTZ49G265B"
};

// =========================================================
// ИНИЦИАЛИЗАЦИЯ
// =========================================================
const app  = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db   = getFirestore(app);

// =========================================================
// СОСТОЯНИЕ
// =========================================================
let currentUser = null;
let currentProfile = null;

const OTP_TTL_MS = 5 * 60 * 1000;
const KG_PHONE_CODE = '+996';

// =========================================================
// УТИЛИТЫ
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

function fakeEmailFromPhone(phone) {
  return phone.replace(/\D/g, '') + '@kut.local';
}

function fakePasswordFromPhone(phone) {
  return 'kut_' + phone.replace(/\D/g, '') + '_secret';
}

// =========================================================
// OFFLINE PERSISTENCE — безопасная заглушка
// =========================================================
// В Firebase JS SDK v10.12.0 enableIndexedDbPersistence УДАЛЕНА.
// Новый API: initializeFirestore(app, { localCache: persistentLocalCache() }).
// Пока включать не будем, чтобы не рисковать стабильностью на мобильных.
// app.js v8.1 вызывает эту функцию — она должна существовать и не падать.
async function enablePersistence() {
  console.info('[KUT FB] Persistence: offline-очередь отключена (Firebase v10 API not wired)');
  return { ok: false, mode: 'disabled' };
}

// =========================================================
// AUTH — ПРОФИЛЬ
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
      if (user) {
        currentProfile = await fetchProfile(user.uid);
      } else {
        currentProfile = null;
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
  if (profile.role === 'super_admin')  window.location.href = './admin.html';
  else if (profile.role === 'owner')   window.location.href = './index.html';
  else if (profile.role === 'manager') window.location.href = './index.html';
  else if (profile.role === 'cashier') window.location.href = './cash.html';
  else                                 window.location.href = './index.html';
}

function makeBusinessId() {
  return 'biz_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

// =========================================================
// ВХОД ПО EMAIL
// =========================================================

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
    email,
    displayName,
    phone: '',
    role: 'owner',
    businessId,
    active: true,
    createdAt: serverTimestamp(),
  });

  await setDoc(doc(db, 'businesses', businessId), {
    name: companyName,
    ownerUid: uid,
    ownerEmail: email,
    status: 'active',
    createdAt: serverTimestamp(),
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

async function resetPassword(email) {
  return sendPasswordResetEmail(auth, email);
}

// =========================================================
// WHATSAPP OTP — GREEN-API
// =========================================================

const WA_CONFIG = {
  idInstance: '720122747171',
  apiToken:   '4c32b507d4b44917a123631f42e47e868a2d3ff9e3b44b82bc',
  buildUrl() {
    return `https://api.green-api.com/waInstance${this.idInstance}/sendMessage/${this.apiToken}`;
  },
};

function generateOtpCode() {
  return String(Math.floor(1000 + Math.random() * 9000));
}

function otpSessionDoc(phone) {
  return doc(db, 'otp_sessions', phone.replace(/\D/g, ''));
}

async function sendWhatsAppOtp(rawPhone) {
  const phone = normalizePhone(rawPhone);
  if (!/^\+996\d{9}$/.test(phone)) throw new Error('INVALID_PHONE');

  const code = generateOtpCode();
  const expiresAt = new Date(Date.now() + OTP_TTL_MS);

  await setDoc(otpSessionDoc(phone), {
    phone,
    code,
    expiresAt,
    createdAt: serverTimestamp(),
    attempts: 0,
  });

  const phoneDigits = phone.replace(/\D/g, '');
  const message =
    `Ваш код подтверждения в системе КУТ: БИЗНЕС — ${code}\n\n` +
    `Никому не сообщайте этот код. Действителен 5 минут.`;

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
    } else {
      throw err;
    }
  }

  const uid = cred.user.uid;
  let profile = await fetchProfile(uid);

  if (!profile) {
    await setDoc(doc(db, 'users', uid), {
      email: fakeEmail,
      displayName: '',
      phone: phone,
      role: 'cashier',
      businessId: '',
      active: true,
      createdAt: serverTimestamp(),
    });
    profile = await fetchProfile(uid);
  }

  currentUser = cred.user;
  currentProfile = profile;
  return { user: cred.user, profile };
}

// =========================================================
// FIRESTORE CRUD
// =========================================================

function getBusinessId() {
  return currentProfile ? currentProfile.businessId : null;
}

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

function subscribeCollection(name, callback) {
  const bizId = getBusinessId();
  if (!bizId) { callback([]); return () => {}; }
  const ref = collection(db, 'businesses', bizId, name);
  return onSnapshot(ref, (snap) => {
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
  const ref = doc(db, 'businesses', bizId, name, id);
  return updateDoc(ref, { ...data, updatedAt: serverTimestamp() });
}

async function deleteItem(name, id) {
  const bizId = getBusinessId();
  if (!bizId) throw new Error('NO_BUSINESS');
  const ref = doc(db, 'businesses', bizId, name, id);
  return deleteDoc(ref);
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
// ЭКСПОРТ
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

  adminGetAllBusinesses, adminToggleBusinessStatus, adminToggleUserStatus,

  collection, doc, getDoc, getDocs, setDoc, addDoc, updateDoc, deleteDoc,
  query, where, orderBy, limit, serverTimestamp, onSnapshot, writeBatch,
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
  adminGetAllBusinesses, adminToggleBusinessStatus, adminToggleUserStatus,
  collection, doc, getDoc, getDocs, setDoc, addDoc, updateDoc, deleteDoc,
  query, where, orderBy, limit, serverTimestamp, onSnapshot, writeBatch,
};

console.info('[KUT FB] Firebase v10 · проект:', firebaseConfig.projectId, '· готов');
