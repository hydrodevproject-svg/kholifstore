// firebase-config.js
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getAnalytics } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-analytics.js";
import { 
  initializeFirestore, 
  collection, 
  doc, 
  getDoc, 
  setDoc, 
  onSnapshot, 
  updateDoc,
  deleteDoc,
  query,
  orderBy,
  limit 
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";

const firebaseConfig = {
  apiKey: "AIzaSyAx9sXlwS56d2qha1z9gl2zvzhXODYLxXU",
  authDomain: "kholifstore.firebaseapp.com",
  projectId: "kholifstore",
  storageBucket: "kholifstore.firebasestorage.app",
  messagingSenderId: "236901005377",
  appId: "1:236901005377:web:9eca887107504c57406ec0",
  measurementId: "G-4014QV16WJ"
};

export const app = initializeApp(firebaseConfig);
export const analytics = typeof window !== "undefined" ? getAnalytics(app) : null;

// Menggunakan autoDetectLongPolling untuk menjaga kestabilan stream jaringan di perangkat seluler
export const db = initializeFirestore(app, {
  experimentalAutoDetectLongPolling: true
});

export const auth = getAuth(app);

export { 
  doc, 
  getDoc, 
  setDoc, 
  onSnapshot, 
  collection, 
  updateDoc, 
  deleteDoc, 
  query, 
  orderBy, 
  limit 
};
