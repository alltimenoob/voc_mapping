import * as THREE from 'three';

/**
 * Color encodes magnitude, so every metric uses a SINGLE-HUE sequential ramp
 * (light -> dark), never a rainbow. VOC is the one exception: it's read as
 * categories (normal / elevated / high), so it uses banded category hues.
 *
 * The 3D stage sits on a light surface, so the light end of a sequential ramp
 * necessarily sits under 3:1 contrast there (verified against the palette
 * skill's validator). The relief this method requires is shipped everywhere:
 * every marker has a direct-labeled counterpart (sidebar row, hover tooltip,
 * or KPI tile) that states the number in text, and markers themselves carry a
 * dark outline ring so identity never depends on fill contrast alone.
 */
export const STAGE_BG = '#e6edee';

const TEMPERATURE_RAMP = [
  '#b0501a', // low
  '#c25f1f',
  '#d4701f',
  '#e2761f',
  '#e88a3f',
  '#ee9f60',
  '#f3b483',
  '#f7c9a5' // high
].map((hex) => new THREE.Color(hex));

const HUMIDITY_RAMP = [
  '#1c5cab', // low
  '#256abf',
  '#2a78d6',
  '#3987e5',
  '#5598e7',
  '#6da7ec',
  '#86b6ef',
  '#9ec5f4' // high
].map((hex) => new THREE.Color(hex));

/**
 * Sensirion VOC Index (1–500) bands. Each sensor learns its own baseline and
 * reports it as 100, so <=100 means at or below typical air for that room,
 * and higher values mean more VOCs than usual.
 */
export const VOC_BANDS = [
  { max: 100, color: '#1aa06a', label: 'Normal' },
  { max: 150, color: '#c9971a', label: 'Slightly elevated' },
  { max: 250, color: '#e2761f', label: 'Elevated' },
  { max: 400, color: '#d1445f', label: 'High' },
  { max: Infinity, color: '#9b3fa0', label: 'Very high' }
];

export const METRICS = {
  temperature: { key: 'temperature', label: 'Temperature', unit: '°C', min: 15, max: 32, decimals: 1, ramp: TEMPERATURE_RAMP },
  humidity: { key: 'humidity', label: 'Humidity', unit: '%RH', min: 20, max: 70, decimals: 0, ramp: HUMIDITY_RAMP },
  voc: { key: 'voc', label: 'VOC Index', unit: '', min: 0, max: 250, decimals: 0 }
};

function clamp01(t) {
  return Math.min(1, Math.max(0, t));
}

function sampleRamp(ramp, t) {
  const scaled = clamp01(t) * (ramp.length - 1);
  const i = Math.min(ramp.length - 2, Math.floor(scaled));
  return ramp[i].clone().lerp(ramp[i + 1], scaled - i);
}

export function vocBand(voc) {
  return VOC_BANDS.find((b) => voc <= b.max) ?? VOC_BANDS[VOC_BANDS.length - 1];
}

/** THREE.Color for `value` under `metricKey`. */
export function colorFor(metricKey, value) {
  if (metricKey === 'voc') return new THREE.Color(vocBand(value).color);
  const { min, max, ramp } = METRICS[metricKey];
  return sampleRamp(ramp, (value - min) / (max - min));
}

/** Hex string version of colorFor, for DOM styling. */
export function hexFor(metricKey, value) {
  return `#${colorFor(metricKey, value).getHexString()}`;
}

export function normalize(metricKey, value) {
  const { min, max } = METRICS[metricKey];
  return clamp01((value - min) / (max - min));
}

export function formatValue(metricKey, value) {
  if (value == null || Number.isNaN(value)) return '—';
  const { unit, decimals } = METRICS[metricKey];
  return `${Number(value).toFixed(decimals)}${unit ? ` ${unit}` : ''}`;
}

/** Legend content for the current metric: a gradient bar or a band swatch list. */
export function legendFor(metricKey) {
  if (metricKey === 'voc') {
    return { kind: 'bands', bands: VOC_BANDS };
  }
  const { min, max, ramp } = METRICS[metricKey];
  const stops = ramp.map((c, i) => `#${c.getHexString()} ${(i / (ramp.length - 1)) * 100}%`);
  return { kind: 'gradient', gradient: `linear-gradient(90deg, ${stops.join(', ')})`, min, max };
}
