/**
 * Adapts the Firebase feed (client/src/firebase.js) to the shapes the app
 * renders: nodes / readings / history. Rooms map to sensors via `sensorId`
 * in example-data.js.
 */
import { EXAMPLE_NODES } from './example-data.js';
import { fetchLiveData, fetchAnalytics } from './firebase.js';

const HISTORY_LIMIT = 120;
// Sensors push ~1 record/second at slightly different offsets, so history is
// averaged into fixed buckets matching the 5s poll cadence.
const BUCKET_MS = 5000;
const HISTORY_WINDOW_MS = HISTORY_LIMIT * BUCKET_MS;
// Upper bound on records pulled per sensor per call (~1/s over the window).
const ANALYTICS_FETCH_LIMIT = HISTORY_WINDOW_MS / 1000;

const sensorNodes = EXAMPLE_NODES.filter((node) => node.sensorId);

function toReading(nodeId, record) {
  return {
    nodeId,
    timestamp: new Date(record.timestamp).toISOString(),
    temperature: record.temperature ?? null,
    humidity: record.humidity ?? null,
    voc: record.voc_index ?? null
  };
}

export async function fetchNodes() {
  return EXAMPLE_NODES.map(({ id, label, x, z, sensorId }) => ({ id, label, x, z, offline: !sensorId }));
}

/** Latest reading for every room whose sensor has reported to live_data. */
export async function fetchReadings() {
  const live = await fetchLiveData();
  return sensorNodes.filter((node) => live[node.sensorId]).map((node) => toReading(node.id, live[node.sensorId]));
}

/** @type {Map<string, object[]>} retained analytics records per sensor id, oldest first */
const analyticsBySensor = new Map();

/** Pull only records pushed since the last sync, then drop any older than the window. */
async function syncAnalytics(sensorId) {
  const retained = analyticsBySensor.get(sensorId) ?? [];
  const afterKey = retained.at(-1)?.key ?? null;
  const fresh = await fetchAnalytics(sensorId, { limit: ANALYTICS_FETCH_LIMIT, afterKey });
  const merged = retained.concat(fresh);
  const newest = merged.at(-1)?.timestamp ?? 0;
  analyticsBySensor.set(
    sensorId,
    merged.filter((record) => record.timestamp > newest - HISTORY_WINDOW_MS)
  );
}

function mean(values) {
  const present = values.filter((v) => typeof v === 'number');
  return present.length ? present.reduce((sum, v) => sum + v, 0) / present.length : null;
}

/** Network-wide averages over time, bucketed across all mapped sensors, oldest first. */
export async function fetchHistory(limit = HISTORY_LIMIT) {
  await Promise.all(sensorNodes.map((node) => syncAnalytics(node.sensorId)));

  const buckets = new Map();
  for (const records of analyticsBySensor.values()) {
    for (const record of records) {
      const bucket = Math.floor(record.timestamp / BUCKET_MS) * BUCKET_MS;
      if (!buckets.has(bucket)) buckets.set(bucket, []);
      buckets.get(bucket).push(record);
    }
  }

  return [...buckets.entries()]
    .sort(([a], [b]) => a - b)
    .map(([bucket, records]) => ({
      timestamp: new Date(bucket).toISOString(),
      temperature: mean(records.map((r) => r.temperature)),
      humidity: mean(records.map((r) => r.humidity)),
      voc: mean(records.map((r) => r.voc_index))
    }))
    .filter((row) => row.temperature != null && row.humidity != null && row.voc != null)
    .slice(-limit);
}
