// ====================== FIREBASE CONFIG ======================
const firebaseConfig = {
  apiKey: "AIzaSyAftZcGsytwZYIIKyG8_xSnKgopgq0xoJo",
  authDomain: "production-wip-audit.firebaseapp.com",
  projectId: "production-wip-audit",
  storageBucket: "production-wip-audit.firebasestorage.app",
  messagingSenderId: "840780987923",
  appId: "1:840780987923:web:7fd0567c2c6a1b6caac9e6",
  measurementId: "G-M5MC844N1E"
};

import { initializeApp } from "https://www.gstatic.com/firebasejs/13.1.0/firebase-app.js";
import { 
  getAuth, 
  signInWithEmailAndPassword, 
  signOut, 
  onAuthStateChanged,
  createUserWithEmailAndPassword
} from "https://www.gstatic.com/firebasejs/13.1.0/firebase-auth.js";
import { 
  getFirestore, 
  doc, 
  getDoc, 
  setDoc, 
  collection, 
  getDocs, 
  addDoc, 
  updateDoc, 
  deleteDoc,
  query,
  where,
  orderBy
} from "https://www.gstatic.com/firebasejs/13.1.0/firebase-firestore.js";

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

// ====================== ALL AREAS ======================
export const ALL_AREAS = [
  "Cutting Shop",
  "Boom Line",
  "Arm Line",
  "Upper Line",
  "Lower Line",
  "Paint Shop",
  "Assembly Shop",
  "Assembly Line Out",
  "Performance Testing",
  "FDI"
];

// ====================== AUTH ======================
export async function loginUser(email, password) {
  try {
    const userCredential = await signInWithEmailAndPassword(auth, email, password);
    return { success: true, user: userCredential.user };
  } catch (error) {
    return { success: false, message: error.message };
  }
}

export async function logoutUser() {
  await signOut(auth);
}

export function checkAuth(callback) {
  onAuthStateChanged(auth, callback);
}

// ====================== USER PROFILE ======================
export async function getUserProfile(uid) {
  const snap = await getDoc(doc(db, "users", uid));
  return snap.exists() ? snap.data() : null;
}

export async function createUserProfile(uid, email, role = "user", allowedAreas = []) {
  await setDoc(doc(db, "users", uid), {
    email,
    role,
    allowedAreas,
    createdAt: new Date().toISOString()
  });
}

// ====================== STATIONS ======================
export async function getStationsByArea(area) {
  const q = query(
    collection(db, "stations"), 
    where("area", "==", area), 
    orderBy("order")
  );
  const snap = await getDocs(q);
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

export async function getAllStations() {
  const snap = await getDocs(collection(db, "stations"));
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

export async function addStation(data) {
  await addDoc(collection(db, "stations"), data);
}

export async function updateStation(id, data) {
  await updateDoc(doc(db, "stations", id), data);
}

export async function deleteStation(id) {
  await deleteDoc(doc(db, "stations", id));
}

// ====================== USERS (Admin only) ======================
export async function getAllUsers() {
  const snap = await getDocs(collection(db, "users"));
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

export async function updateUser(uid, data) {
  await updateDoc(doc(db, "users", uid), data);
}

export { auth, db };