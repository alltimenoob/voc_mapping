/**
 * Temperature/humidity come from Firebase (client/src/firebase.js) — one
 * physical sensor shared by every room, per the current rig. PM2.5/AQI have
 * no real source yet, so they're still drifted client-side around each
 * room's baseline in example-data.js until a real feed exists.
 */
import { EXAMPLE_NODES } from './example-data.js';
import { fetchLatestEnvironment } from './firebase.js';

const HISTORY_LIMIT = 120;

/** US EPA AQI breakpoints for 24h PM2.5 (µg/m³). */
const PM25_BREAKPOINTS = [
  { cLow: 0.0, cHigh: 12.0, iLow: 0, iHigh: 50 },
  { cLow: 12.1, cHigh: 35.4, iLow: 51, iHigh: 100 },
  { cLow: 35.5, cHigh: 55.4, iLow: 101, iHigh: 150 },
  { cLow: 55.5, cHigh: 150.4, iLow: 151, iHigh: 200 },
  { cLow: 150.5, cHigh: 250.4, iLow: 201, iHigh: 300 },
  { cLow: 250.5, cHigh: 500.4, iLow: 301, iHigh: 500 }
];

function pm25ToAqi(pm25) {
  const c = Math.max(0, pm25);
  const bp = PM25_BREAKPOINTS.find((b) => c >= b.cLow && c <= b.cHigh) ?? PM25_BREAKPOINTS.at(-1);
  return Math.round(Math.min(500, ((bp.iHigh - bp.iLow) / (bp.cHigh - bp.cLow)) * (c - bp.cLow) + bp.iLow));
}

function round(value, digits) {
  const f = 10 ** digits;
  return Math.round(value * f) / f;
}

function drift(current, baseline, volatility, min, max) {
  const pull = (baseline - current) * 0.12;
  const noise = (Math.random() - 0.5) * volatility;
  return Math.min(max, Math.max(min, current + pull + noise));
}

/** @type {Map<string, object>} latest reading per node id */
const latestByNode = new Map();
/** @type {object[]} network-wide averaged reading per tick, oldest first */
const networkHistory = [];
/** @type {{temperature: number, humidity: number} | null} shared live reading, all rooms */
let latestEnvironment = null;

function tick(at = new Date()) {
  for (const node of EXAMPLE_NODES) {
    if (node.offline) continue;
    const prev = latestByNode.get(node.id);
    const pm25 = drift(prev?.pm25 ?? node.basePm25, node.basePm25, 2.5, 0, 400);
    const temperature = latestEnvironment
      ? round(latestEnvironment.temperature, 1)
      : round(drift(prev?.temperature ?? node.baseTemperature, node.baseTemperature, 0.35, -10, 50), 1);
    const humidity = latestEnvironment
      ? round(latestEnvironment.humidity, 0)
      : round(drift(prev?.humidity ?? node.baseHumidity, node.baseHumidity, 1.4, 0, 100), 0);
    latestByNode.set(node.id, {
      nodeId: node.id,
      timestamp: at.toISOString(),
      temperature,
      humidity,
      pm25: round(pm25, 2),
      aqi: pm25ToAqi(pm25)
    });
  }

  const online = [...latestByNode.values()];
  const avg = (key) => online.reduce((sum, r) => sum + r[key], 0) / online.length;
  networkHistory.push({
    timestamp: at.toISOString(),
    temperature: round(avg('temperature'), 2),
    humidity: round(avg('humidity'), 1),
    aqi: round(avg('aqi'), 1)
  });
  if (networkHistory.length > HISTORY_LIMIT) networkHistory.shift();
}

// Warm up with backdated ticks (5s apart, matching the real poll cadence) so
// the chart and averages show a real spread of time on first paint, not a
// single instant repeated 20 times.
const WARMUP_TICKS = 20;
const now = Date.now();
for (let i = WARMUP_TICKS; i > 0; i -= 1) {
  tick(new Date(now - i * 5000));
}

export async function fetchNodes() {
  return EXAMPLE_NODES.map(({ id, label, x, z, offline }) => ({ id, label, x, z, offline: Boolean(offline) }));
}

export async function fetchReadings() {
  latestEnvironment = await fetchLatestEnvironment();
  tick();
  return EXAMPLE_NODES.map((node) => latestByNode.get(node.id) ?? { nodeId: node.id, offline: true });
}

export async function fetchHistory(limit = HISTORY_LIMIT) {
  return networkHistory.slice(-limit);
}
