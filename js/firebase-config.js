/* =========================================================
   КУТ: БИЗНЕС — Firebase + WhatsApp Green-API
   Версия: v4.0 (боевая отправка OTP)

   Что внутри:
   • Firebase Auth (Email/Password) + Firestore
   • sendWhatsAppOtp() — генерирует 4-значный код,
     сохраняет в otp_sessions/{phone} и отправляет РЕАЛЬНЫЙ
     POST-запрос на Green-API → пользователь получает
     сообщение в WhatsApp
   • verifyWhatsAppOtp() — проверяет код и логинит в Firebase
   • login/logout/resetPassword
   • CRUD для products/sales/debts внутри businesses/{bizId}
   • Admin API: управление бизнесами и телефонами сотрудников
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
import { getAnalytics } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-analytics.js';

// =========================================================
// 1. FIREBASE CONFIG — ваши ключи
// =========================================================
const firebaseConfig = {
  apiKey:            "AIzaSyAO1MniEwNBKhcEs64XMMPVN0GDEZFpxPg",
  authDomain:        "kut-biznes.firebaseapp.com",
  projectId:         "kut-biznes",
  storageBucket:     "kut-biznes.firebasestorage.app",
  messagingSenderId: "699153181693",
  appId:             "1:699153181693:web:2f10e57664a8a0cefc4794",
  measurementId:     "G-VTZ49G265B"
};

// =========================================================
// 2. WHATSAPP GATEWAY CONFIG (Green-API)
// ---------------------------------------------------------
// Как получить:
//   1. Зарегистрируйтесь на https://green-api.com
//   2. Создайте инстанс и отсканируйте QR-код WhatsApp
//   3. Скопируйте idInstance и apiTokenInstance
//   4. Вставьте их сюда
//
// Пример URL запроса Green-API:
//   https://api.green-api.com/waInstance{ID}/sendMessage/{TOKEN}
// =========================================================
const WA_CONFIG = {
  // Если пусто — отправка не выполнится, будет ошибка в консоли
  idInstance:    '1101000000',         // ← ваш idInstance
  apiToken:      'your_api_token',     // ← ваш apiTokenInstance

  // Шаблон URL (можно заменить на Chat-API, Wati, Twilio и т.п.)
  buildUrl() {
    return `https://api.green-api.com/waInstance${this.idInstance}/sendMessage/${this.apiToken}`;
  },

  // Шаблон тела запроса Green-API
  buildBody(phoneDigits, message) {
    return {
      chatId: `${phoneDigits}@c.us`,
      message: message,
    };
  },
};

// =========================================================
// 3. ИНИЦИАЛИЗАЦИЯ
// =========================================================
const app  = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db   = getFirestore(app);

let analytics = null;
try { analytics = getAnalytics(app); }
catch (e) { console.warn('[KUT FB] Analytics не подключён:', e.message); }

// =========================================================
// 4. СОСТОЯНИЕ
// =========================================================
let currentUser = null;
let currentProfile = null;

const OTP_TTL_MS = 5 * 60 * 1000;
const KG_PHONE_CODE = '+996';

// =========================================================
// 5. УТИЛИТЫ
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
// 6. AUTH — ПРОФИЛЬ
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
  else if (profile.role === 'cashier') window.location.href = './cash.html';
  else                                 window.location.href = './index.html';
}

function makeBusinessId() {
  return 'biz_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

// =========================================================
// 7. ВХОД ПО EMAIL + ПАРОЛЬ
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
    ownerId: uid,
    ownerEmail: email,
    active: true,
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
// 8. WHATSAPP OTP — БОЕВАЯ ОТПРАВКА
// =========================================================

function generateOtpCode() {
  return String(Math.floor(1000 + Math.random() * 9000));
}

function otpSessionDoc(phone) {
  return doc(db, 'otp_sessions', phone.replace(/\D/g, ''));
}

/**
 * Отправка OTP через WhatsApp (Green-API).
 * 1. Генерируем 4-значный код
 * 2. Пишем в otp_sessions/{phone} с TTL 5 минут
 * 3. Отправляем POST-запрос на шлюз
 * 4. Если шлюз ответил ошибкой — бросаем исключение
 */
async function sendWhatsAppOtp(rawPhone) {
  const phone = normalizePhone(rawPhone);
  if (!/^\+996\d{9}$/.test(phone)) {
    throw new Error('INVALID_PHONE');
  }

  // ----- 1. Генерация и запись в Firestore -----
  const code = generateOtpCode();
  const expiresAt = new Date(Date.now() + OTP_TTL_MS);

  await setDoc(otpSessionDoc(phone), {
    phone,
    code,
    expiresAt,
    createdAt: serverTimestamp(),
    attempts: 0,
  });

  // ----- 2. Отправка через WhatsApp-шлюз -----
  if (!WA_CONFIG.idInstance || WA_CONFIG.idInstance === '1101000000' ||
      !WA_CONFIG.apiToken  || WA_CONFIG.apiToken === 'your_api_token') {
    throw new Error('WHATSAPP_NOT_CONFIGURED');
  }

  const phoneDigits = phone.replace(/\D/g, ''); // 996XXXXXXXXX
  const message =
    `Ваш код подтверждения в КУТ: БИЗНЕС — ${code}\n\n` +
    `Никому не сообщайте этот код. Действителен 5 минут.`;

  const url = WA_CONFIG.buildUrl();
  const body = WA_CONFIG.buildBody(phoneDigits, message);

  let res;
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  } catch (networkErr) {
    console.error('[KUT OTP] Сеть недоступна:', networkErr);
    throw new Error('WHATSAPP_NETWORK');
  }

  if (!res.ok) {
    let errText = '';
    try { errText = await res.text(); } catch (_) {}
    console.error('[KUT OTP] Шлюз ответил ошибкой:', res.status, errText);
    throw new Error('WHATSAPP_FAILED');
  }

  console.info('[KUT OTP] Код успешно отправлен на', phone);
  return true;
}

/**
 * Проверка OTP и вход в систему.
 */
async function verifyWhatsAppOtp(rawPhone, code) {
  const phone = normalizePhone(rawPhone);
  const ref = otpSessionDoc(phone);
  const snap = await getDoc(ref);

  if (!snap.exists()) {
    throw new Error('OTP_NOT_FOUND');
  }

  const data = snap.data();
  const expiresAt = toDate(data.expiresAt);

  if (!expiresAt || Date.now() > expiresAt.getTime()) {
    await deleteDoc(ref).catch(() => {});
    throw new Error('OTP_EXPIRED');
  }

  if (String(data.code) !== String(code)) {
    await updateDoc(ref, { attempts: (data.attempts || 0) + 1 }).catch(() => {});
    throw new Error('OTP_MISMATCH');
  }

  await deleteDoc(ref).catch(() => {});

  // Аутентификация в Firebase через суррогатный email
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
      businessId: null,
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
// 9. FIRESTORE CRUD
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
// 10. SUPER ADMIN API
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

async function updateEmployeePhone(employeeUid, newPhone) {
  if (!currentProfile) throw new Error('NOT_AUTHENTICATED');

  const callerRole = currentProfile.role;
  const callerBiz = currentProfile.businessId;

  const targetSnap = await getDoc(doc(db, 'users', employeeUid));
  if (!targetSnap.exists()) throw new Error('USER_NOT_FOUND');
  const target = targetSnap.data();

  const isSuperAdmin = callerRole === 'super_admin';
  const isOwnerOfSameBiz =
    callerRole === 'owner' &&
    callerBiz &&
    target.businessId === callerBiz;

  if (!isSuperAdmin && !isOwnerOfSameBiz) {
    throw new Error('PERMISSION_DENIED');
  }

  const normalized = normalizePhone(newPhone);
  if (!/^\+996\d{9}$/.test(normalized)) {
    throw new Error('INVALID_PHONE');
  }

  await updateDoc(doc(db, 'users', employeeUid), {
    phone: normalized,
    updatedAt: serverTimestamp(),
  });

  return true;
}

// =========================================================
// 11. ЭКСПОРТ
// =========================================================
window.FB = {
  app, auth, db, analytics,
  currentUser: () => currentUser,
  currentProfile: () => currentProfile,
  waitForAuth, fetchProfile, redirectByRole, makeBusinessId,

  login, registerOwner, logout, resetPassword,
  sendWhatsAppOtp, verifyWhatsAppOtp,

  getBusinessId,
  getCollection, subscribeCollection,
  addItem, updateItem, deleteItem,

  adminGetAllBusinesses, adminToggleBusinessStatus, adminToggleUserStatus,
  updateEmployeePhone,

  collection, doc, getDoc, getDocs, setDoc, addDoc, updateDoc, deleteDoc,
  query, where, orderBy, limit, serverTimestamp, onSnapshot, writeBatch,
};

export {
  app, auth, db, analytics,
  waitForAuth, fetchProfile, redirectByRole, makeBusinessId,
  login, registerOwner, logout, resetPassword,
  sendWhatsAppOtp, verifyWhatsAppOtp,
  getBusinessId,
  getCollection, subscribeCollection,
  addItem, updateItem, deleteItem,
  adminGetAllBusinesses, adminToggleBusinessStatus, adminToggleUserStatus,
  updateEmployeePhone,
  collection, doc, getDoc, getDocs, setDoc, addDoc, updateDoc, deleteDoc,
  query, where, orderBy, limit, serverTimestamp, onSnapshot, writeBatch,
};

console.info('[KUT FB] Firebase v10 инициализирован · проект:', firebaseConfig.projectId);
console.info('[KUT WA] WhatsApp-шлюз Green-API · instance:', WA_CONFIG.idInstance);
