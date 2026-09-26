/**
 * Live sensor feed from Firebase Realtime Database. The RPi/ESP32 rig pushes
 * one node per reading under sensors/environment, alternating a
 * {temperature, timestamp} record and a {humidity, timestamp} record rather
 * than writing both fields together — so the newest *complete* pair can
 * straddle two pushes. VOC (sensors/unit1, sensors/unit2) isn't wired up yet.
 */
import { initializeApp } from 'firebase/app';
import { getDatabase, ref, query, orderByChild, limitToLast, get } from 'firebase/database';

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  databaseURL: import.meta.env.VITE_FIREBASE_DATABASE_URL,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID
};

// Pull a small window of recent pushes rather than just the last one, since
// the latest push may only carry temperature or only humidity.
const ENVIRONMENT_WINDOW = 10;

let db = null;

function getDb() {
  if (!db) {
    if (!firebaseConfig.databaseURL) {
      throw new Error('Firebase is not configured — copy client/.env.example to client/.env and fill in your project.');
    }
    db = getDatabase(initializeApp(firebaseConfig));
  }
  return db;
}

/** Latest {temperature, humidity, timestamp}, merging the newest push of each field. */
export async function fetchLatestEnvironment() {
  const environmentQuery = query(
    ref(getDb(), 'sensors/environment'),
    orderByChild('timestamp'),
    limitToLast(ENVIRONMENT_WINDOW)
  );
  const snapshot = await get(environmentQuery);
  if (!snapshot.exists()) {
    throw new Error('No environment readings in Firebase yet');
  }

  let latestTemperature = null;
  let latestHumidity = null;
  snapshot.forEach((child) => {
    const record = child.val();
    if (record.temperature != null && (!latestTemperature || record.timestamp > latestTemperature.timestamp)) {
      latestTemperature = record;
    }
    if (record.humidity != null && (!latestHumidity || record.timestamp > latestHumidity.timestamp)) {
      latestHumidity = record;
    }
  });

  if (!latestTemperature || !latestHumidity) {
    throw new Error('Incomplete environment reading in Firebase (missing temperature or humidity)');
  }

  return {
    temperature: latestTemperature.temperature,
    humidity: latestHumidity.humidity,
    timestamp: Math.max(latestTemperature.timestamp, latestHumidity.timestamp)
  };
}
