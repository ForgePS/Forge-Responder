// Import the functions you need from the SDKs you need
import { initializeApp } from "firebase/app";
import { getAnalytics } from "firebase/analytics";
// TODO: Add SDKs for Firebase products that you want to use
// https://firebase.google.com/docs/web/setup#available-libraries

// Your web app's Firebase configuration
// For Firebase JS SDK v7.20.0 and later, measurementId is optional
const firebaseConfig = {
  apiKey: "AIzaSyAFsT-JgQiMobZVaNzGUBbGcioKkDb2TwA",
  authDomain: "rms-dashboard-7562e.firebaseapp.com",
  projectId: "rms-dashboard-7562e",
  storageBucket: "rms-dashboard-7562e.firebasestorage.app",
  messagingSenderId: "263368437902",
  appId: "1:263368437902:web:d60faf5d4c1f4e201cd9df",
  measurementId: "G-M9VTXMF2K8"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const analytics = getAnalytics(app);