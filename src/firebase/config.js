import { initializeApp } from 'firebase/app';
import { getFirestore } from 'firebase/firestore';
import { getAuth, browserLocalPersistence, setPersistence } from 'firebase/auth';
import { getDatabase } from 'firebase/database';

const firebaseConfig = {
  apiKey: "AIzaSyCEzOpFKjpbDfpesp-4JMg1Rhp71vxK4SE",
  authDomain: "creature-world-81ca5.firebaseapp.com",
  databaseURL: "https://creature-world-81ca5-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "creature-world-81ca5",
  storageBucket: "creature-world-81ca5.firebasestorage.app",
  messagingSenderId: "161236805534",
  appId: "1:161236805534:web:5a879278990d0efd80588f",
  measurementId: "G-B5HL9LHJCM"
};

const app = initializeApp(firebaseConfig);

export const db = getFirestore(app);
export const rtdb = getDatabase(app);
export const auth = getAuth(app);
setPersistence(auth, browserLocalPersistence).catch(console.error);
export default app;
