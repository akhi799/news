import { initializeApp, getApps } from "firebase/app";
import { getFirestore } from "firebase/firestore";

// TODO: Replace these placeholders with your actual Firebase project configuration from the Firebase Console.
// Instructions on how to get this are in the project's README.md.
const firebaseConfig = {
  apiKey: "AIzaSyArg2s9_iqzuDWAN-buJr44ZDcs6c7iXT0",
  authDomain: "news-b5c94.firebaseapp.com",
  projectId: "news-b5c94",
  storageBucket: "news-b5c94.firebasestorage.app",
  messagingSenderId: "411578374049",
  appId: "1:411578374049:web:c0dd7f2f3775c90b725de0",
  measurementId: "G-L9HWJ83VNF"
};

let db = null;
let isDemoMode = true;

// Check if config has been customized by the user
const isConfigValid = firebaseConfig && firebaseConfig.projectId && firebaseConfig.apiKey && firebaseConfig.apiKey !== "";

if (isConfigValid) {
  try {
    const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApps()[0];
    db = getFirestore(app);
    isDemoMode = false;
    console.log("🔥 Connected to live Firebase Firestore.");
  } catch (error) {
    console.error("❌ Failed to initialize Firebase Firestore:", error);
  }
} else {
  console.log("💡 PulseAI is currently running in Demo Mode. Configure 'firebaseConfig' in 'src/firebase.js' to connect your own database.");
}

export { db, isDemoMode };
export default db;
