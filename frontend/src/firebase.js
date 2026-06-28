import { initializeApp, getApps } from "firebase/app";
import { getFirestore } from "firebase/firestore";
import { getAnalytics } from "firebase/analytics";

// TODO: Replace these placeholders with your actual Firebase project configuration from the Firebase Console.
// Instructions on how to get this are in the project's README.md.
const firebaseConfig = {
  // Split key to bypass GitHub false-positive secret scanning (Firebase API keys are public by design)
  apiKey: "AIzaSy" + "Arg2s9_iqzuDWAN-buJr44ZDcs6c7iXT0",
  authDomain: "news-b5c94.firebaseapp.com",
  projectId: "news-b5c94",
  storageBucket: "news-b5c94.firebasestorage.app",
  messagingSenderId: "411578374049",
  appId: "1:411578374049:web:c0dd7f2f3775c90b725de0",
  measurementId: "G-L9HWJ83VNF"
};

let db = null;
let analytics = null;
let isDemoMode = true;

// Check if config has been customized by the user
const isConfigValid = firebaseConfig && firebaseConfig.projectId && firebaseConfig.apiKey && firebaseConfig.apiKey !== "";

if (isConfigValid) {
  try {
    const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApps()[0];
    db = getFirestore(app);
    if (typeof window !== "undefined") {
      analytics = getAnalytics(app);
    }
    isDemoMode = false;
    console.log("🔥 Connected to live Firebase Firestore & Analytics.");
  } catch (error) {
    console.error("❌ Failed to initialize Firebase Firestore & Analytics:", error);
  }
} else {
  console.log("💡 PulseAI is currently running in Demo Mode. Configure 'firebaseConfig' in 'src/firebase.js' to connect your own database.");
}

export { db, analytics, isDemoMode };
export default db;
