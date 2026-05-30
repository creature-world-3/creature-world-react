import { initializeApp } from 'firebase/app';
import { getFirestore } from 'firebase/firestore';
import { initializeAuth, indexedDBLocalPersistence, browserLocalPersistence, inMemoryPersistence } from 'firebase/auth';

const firebaseConfig = {
  apiKey: "AIzaSyCEzOpFKjpbDfpesp-4JMg1Rhp71vxK4SE",
  authDomain: "creature-world-81ca5.firebaseapp.com",
  projectId: "creature-world-81ca5",
  storageBucket: "creature-world-81ca5.firebasestorage.app",
  messagingSenderId: "161236805534",
  appId: "1:161236805534:web:5a879278990d0efd80588f",
  measurementId: "G-B5HL9LHJCM"
};

const app = initializeApp(firebaseConfig);

export const db = getFirestore(app);
// IndexedDB → localStorage → inMemory 순서로 fallback
export const auth = initializeAuth(app, {
  persistence: [indexedDBLocalPersistence, browserLocalPersistence, inMemoryPersistence],
});
export default app;
