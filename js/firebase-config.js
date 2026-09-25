/* =========================================================
   КУТ: БИЗНЕС — Firebase Configuration (v10+ modular)
   Подключение Auth + Firestore через CDN.
   Экспортирует: window.FB — единый API для всех модулей.
   ========================================================= */

import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js';
import {
  getAuth,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut,
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
  serverTimestamp,
  onSnapshot,
} from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js';

// =========================================================
// 1. КОНФИГУРАЦИЯ
// Замените значения на свои из Firebase Console → Project settings
// =========================================================
const firebaseConfig = {
  apiKey:            "AIzaSy...ВАШ_КЛЮЧ",
  authDomain:        "kut-biznes.firebaseapp.com",
  projectId:         "kut-biznes",
  storageBucket:     "kut-biznes.appspot.com",
  messagingSenderId: "000000000000",
  appId:             "1:000000000000:web:xxxxxxxxxxxx"
};

const app  = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db   = getFirestore(app);

// =========================================================
// 2. УТИЛИТЫ
// =========================================================

/** Текущий пользователь и его профиль из Firestore */
let currentUser   = null;
let currentProfile = null;

/** Получить профиль пользователя по uid */
async function fetchProfile(uid) {
  const ref = doc(db, 'users', uid);
  const snap = await getDoc(ref);
  return snap.exists() ? { uid, ...snap.data() } : null;
}

/** Дождаться готовности Auth и профиля (для страниц) */
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
    auth.signOut();
    return;
  }
  if (profile.role === 'super_admin') {
    window.location.href = './admin.html';
  } else {
    window.location.href = './index.html';
  }
}

/** Генерация уникального ID бизнеса */
function makeBusinessId() {
  return 'biz_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

// =========================================================
// 3. АУТЕНТИФИКАЦИЯ
// =========================================================

/** Вход по email + пароль */
async function login(email, password) {
  const cred = await signInWithEmailAndPassword(auth, email, password);
  const profile = await fetchProfile(cred.user.uid);
  if (profile && profile.active === false) {
    await signOut(auth);
    throw new Error('ACCOUNT_DISABLED');
  }
  return { user: cred.user, profile };
}

/** Регистрация владельца бизнеса */
async function registerOwner({ email, password, displayName, companyName }) {
  const cred = await createUserWithEmailAndPassword(auth, email, password);
  const uid = cred.user.uid;
  const businessId = makeBusinessId();

  // 1. Профиль пользователя
  await setDoc(doc(db, 'users', uid), {
    email,
    displayName,
    role: 'owner',
    businessId,
    active: true,
    createdAt: serverTimestamp(),
  });

  // 2. Документ бизнеса
  await setDoc(doc(db, 'businesses', businessId), {
    name: companyName,
    ownerId: uid,
    ownerEmail: email,
    active: true,
    createdAt: serverTimestamp(),
  });

  return { user: cred.user, businessId };
}

/** Выход */
async function logout() {
  await signOut(auth);
  window.location.href = './login.html';
}

// =========================================================
// 4. FIRESTORE CRUD — МУЛЬТИТЕНАНТНЫЙ (через businessId)
// =========================================================

/** Получить businessId текущего пользователя */
function getBusinessId() {
  return currentProfile ? currentProfile.businessId : null;
}

/** Чтение коллекции бизнеса */
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
  });
}

/** Создать документ */
async function addItem(name, data) {
  const bizId = getBusinessId();
  if (!bizId) throw new Error('NO_BUSINESS');
  const ref = collection(db, 'businesses', bizId, name);
  return addDoc(ref, { ...data, createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
}

/** Обновить документ */
async function updateItem(name, id, data) {
  const bizId = getBusinessId();
  if (!bizId) throw new Error('NO_BUSINESS');
  const ref = doc(db, 'businesses', bizId, name, id);
  return updateDoc(ref, { ...data, updatedAt: serverTimestamp() });
}

/** Удалить документ */
async function deleteItem(name, id) {
  const bizId = getBusinessId();
  if (!bizId) throw new Error('NO_BUSINESS');
  const ref = doc(db, 'businesses', bizId, name, id);
  return deleteDoc(ref);
}

// =========================================================
// 5. SUPER ADMIN API
// =========================================================

/** Список всех бизнесов (только super_admin) */
async function adminGetAllBusinesses() {
  const ref = collection(db, 'businesses');
  const snap = await getDocs(ref);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

/** Переключить статус бизнеса */
async function adminToggleBusinessStatus(bizId, active) {
  await updateDoc(doc(db, 'businesses', bizId), { active });
}

/** Переключить статус пользователя */
async function adminToggleUserStatus(uid, active) {
  await updateDoc(doc(db, 'users', uid), { active });
}

// =========================================================
// 6. ЭКСПОРТ
// =========================================================
window.FB = {
  // Служебное
  app, auth, db,
  currentUser: () => currentUser,
  currentProfile: () => currentProfile,
  waitForAuth, fetchProfile, redirectByRole,

  // Auth
  login, registerOwner, logout,

  // Firestore
  getBusinessId,
  getCollection, subscribeCollection,
  addItem, updateItem, deleteItem,

  // Admin
  adminGetAllBusinesses,
  adminToggleBusinessStatus,
  adminToggleUserStatus,

  // Firebase-примитивы (для сложных запросов)
  collection, doc, getDoc, getDocs, setDoc, addDoc, updateDoc, deleteDoc,
  query, where, orderBy, serverTimestamp,
};

console.info('[KUT FB] Firebase SDK v10 подключён');
