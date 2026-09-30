/**
 * Live sensor feed from Firebase Realtime Database. The RPi/ESP32 rig writes:
 *
 *   live_data/<sensorId>            latest reading, overwritten in place
 *   analytics/<sensorId>/<pushId>   append-only history, ~1 record/second
 *
 * Both hold { datetime, timestamp, temperature, humidity, voc_index }, where
 * timestamp is epoch ms. An analytics record can lack temperature/humidity
 * (e.g. the first push after the rig boots), so callers must tolerate gaps.
 */
import { initializeApp } from 'firebase/app';
import { getDatabase, ref, query, orderByKey, limitToLast, startAfter, get } from 'firebase/database';

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  databaseURL: import.meta.env.VITE_FIREBASE_DATABASE_URL,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID
};

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

/** Latest reading per sensor, keyed by sensor id (e.g. { sensor_1: {...}, sensor_2: {...} }). */
export async function fetchLiveData() {
  const snapshot = await get(ref(getDb(), 'live_data'));
  return snapshot.val() ?? {};
}

/**
 * Up to `limit` of a sensor's newest analytics records, oldest first, each
 * with its push key as `key`. Pass `afterKey` to fetch only records pushed
 * after that one. Push keys sort chronologically, so ordering by key needs
 * no `.indexOn` rule.
 */
export async function fetchAnalytics(sensorId, { limit, afterKey = null }) {
  const constraints = afterKey ? [orderByKey(), startAfter(afterKey), limitToLast(limit)] : [orderByKey(), limitToLast(limit)];
  const snapshot = await get(query(ref(getDb(), `analytics/${sensorId}`), ...constraints));
  const records = [];
  snapshot.forEach((child) => {
    records.push({ key: child.key, ...child.val() });
  });
  return records;
}
