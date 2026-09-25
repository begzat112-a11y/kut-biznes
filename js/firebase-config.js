/* =========================================================
   КУТ: БИЗНЕС — Firebase Configuration
   Подключение Auth + Firestore + Analytics через CDN v10.
   Экспортирует: window.FB — единый API для всех модулей.
   Также экспортирует модульные хэндлы через export {}.
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
// 1. КОНФИГУРАЦИЯ — ваши реальные ключи
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
// 2. ИНИЦИАЛИЗАЦИЯ
// =========================================================
const app  = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db   = getFirestore(app);

let analytics = null;
try { analytics = getAnalytics(app); }
catch (e) { console.warn('[KUT FB] Analytics не подключён:', e.message); }

// =========================================================
// 3. ВНУТРЕННЕЕ СОСТОЯНИЕ
// =========================================================
let currentUser = null;
let currentProfile = null;

// =========================================================
// 4. УТИЛИТЫ
// =========================================================

/** Получить профиль пользователя по uid */
async function fetchProfile(uid) {
  const snap = await getDoc(doc(db, 'users', uid));
  return snap.exists() ? { uid, ...snap.data() } : null;
}

/** Дождаться готовности Auth и профиля */
function waitForAuth() {
  return new Promise((resolve) => {
    const unsub = onAuthStateChanged(auth, async (user) => {
      currentUser = user;
      if (user) {
        try {
          currentProfile = await fetchProfile(user.uid);
        } catch (e) {
          console.error('[KUT FB] fetchProfile failed:', e);
          currentProfile = null;
        }
      } else {
        currentProfile = null;
      }
      resolve({ user: currentUser, profile: currentProfile });
      unsub();
    });
  });
}

/** Редирект по роли */
function redirectByRole(profile) {
  if (!profile) { window.location.href = './login.html'; return; }
  if (profile.active === false) {
    alert('Ваш аккаунт заблокирован. Свяжитесь с администратором.');
    signOut(auth);
    return;
  }
  if (profile.role === 'super_admin') window.location.href = './admin.html';
  else window.location.href = './index.html';
}

/** Уникальный businessId */
function makeBusinessId() {
  return 'biz_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

// =========================================================
// 5. АУТЕНТИФИКАЦИЯ
// =========================================================

async function login(email, password) {
  const cred = await signInWithEmailAndPassword(auth, email, password);
  const profile = await fetchProfile(cred.user.uid);
  if (profile && profile.active === false) {
    await signOut(auth);
    throw new Error('ACCOUNT_DISABLED');
  }
  return { user: cred.user, profile };
}

async function registerOwner({ email, password, displayName, companyName }) {
  const cred = await createUserWithEmailAndPassword(auth, email, password);
  const uid = cred.user.uid;
  const businessId = makeBusinessId();

  await setDoc(doc(db, 'users', uid), {
    email,
    displayName,
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

  return { user: cred.user, businessId };
}

async function logout() {
  await signOut(auth);
  window.location.href = './login.html';
}

async function resetPassword(email) {
  return sendPasswordResetEmail(auth, email);
}

// =========================================================
// 6. FIRESTORE — CRUD для текущего бизнеса
// =========================================================

function getBusinessId() {
  return currentProfile ? currentProfile.businessId : null;
}

/** Чтение всей коллекции текущего бизнеса */
async function getCollection(name) {
  const bizId = getBusinessId();
  if (!bizId) return [];
  const ref = collection(db, 'businesses', bizId, name);
  const snap = await getDocs(ref);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

/** Реалтайм-подписка на коллекцию */
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
  return addDoc(ref, { ...data, createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
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
// 7. SUPER ADMIN API
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
// 8. ЭКСПОРТ (двойной: window.FB + ES-модульный)
// =========================================================
window.FB = {
  // Служебное
  app, auth, db, analytics,
  currentUser: () => currentUser,
  currentProfile: () => currentProfile,
  waitForAuth, fetchProfile, redirectByRole, makeBusinessId,

  // Auth
  login, registerOwner, logout, resetPassword,

  // Firestore
  getBusinessId,
  getCollection, subscribeCollection,
  addItem, updateItem, deleteItem,

  // Admin
  adminGetAllBusinesses, adminToggleBusinessStatus, adminToggleUserStatus,

  // Примитивы Firebase (для сложных запросов)
  collection, doc, getDoc, getDocs, setDoc, addDoc, updateDoc, deleteDoc,
  query, where, orderBy, limit, serverTimestamp, onSnapshot, writeBatch,
};

export {
  app, auth, db, analytics,
  waitForAuth, fetchProfile, redirectByRole, makeBusinessId,
  login, registerOwner, logout, resetPassword,
  getBusinessId,
  getCollection, subscribeCollection,
  addItem, updateItem, deleteItem,
  adminGetAllBusinesses, adminToggleBusinessStatus, adminToggleUserStatus,
  collection, doc, getDoc, getDocs, setDoc, addDoc, updateDoc, deleteDoc,
  query, where, orderBy, limit, serverTimestamp, onSnapshot, writeBatch,
};

console.info('[KUT FB] Firebase v10 инициализирован · проект:', firebaseConfig.projectId);
