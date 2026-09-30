import * as THREE from 'three';

import { fetchNodes, fetchReadings, fetchHistory } from './api.js';
import { createBuildingScene } from './building-scene.js';
import { METRICS, vocBand, legendFor, formatValue, hexFor } from './color-scale.js';
import { renderKPIs, renderSensorList, computeAverages } from './sidebar.js';
import { renderTimeSeries, timeAxisLabels, CHART_SERIES } from './chart.js';

const POLL_MS = 5000;

const el = (id) => document.getElementById(id);
const canvas = el('scene');
const liveLabel = el('live-label');
const stageMeta = el('stage-meta');
const kpisEl = el('kpis');
const sensorListEl = el('sensor-list');
const sensorCountEl = el('sensor-count');
const chartLegendEl = el('chart-legend');
const chartSvg = el('ts-chart');
const chartAxisEl = el('chart-axis');
const paramSwitcher = el('param-switcher');
const legendCard = el('legend-card');
const tooltip = el('tooltip');
const calloutsContainer = el('callouts');

let scene = null;
let nodes = [];
let metric = 'temperature';
let readingsByNodeId = new Map();
let previousAverages = null;
let lastFetchAt = null;
const calloutEls = new Map();

// --- static chrome --------------------------------------------------------
chartLegendEl.innerHTML = CHART_SERIES.map((s) => `<span><i style="background:${s.color}"></i>${s.label}</span>`).join('');

// --- legend card ------------------------------------------------------------
function renderLegendCard() {
  const legend = legendFor(metric);
  if (legend.kind === 'bands') {
    legendCard.innerHTML = `
      <div class="legend-title">${METRICS.voc.label} bands</div>
      <div class="legend-bands">
        ${legend.bands
          .map((b) => `<div class="legend-band"><i style="background:${b.color}"></i>${b.label}</div>`)
          .join('')}
      </div>`;
    return;
  }
  legendCard.innerHTML = `
    <div class="legend-title">${METRICS[metric].label} · ${METRICS[metric].unit}</div>
    <div class="legend-gradient" style="background:${legend.gradient}"></div>
    <div class="legend-scale"><span>${legend.min}</span><span>${legend.max}</span></div>`;
}

// --- persistent floating callouts (offline nodes + current extreme) --------
function selectCalloutIds() {
  const ids = nodes.filter((n) => n.offline).map((n) => n.id);
  let extreme = null;
  let extremeValue = -Infinity;
  for (const node of nodes) {
    if (node.offline) continue;
    const reading = readingsByNodeId.get(node.id);
    if (!reading) continue;
    if (reading[metric] > extremeValue) {
      extremeValue = reading[metric];
      extreme = node.id;
    }
  }
  if (extreme) ids.push(extreme);
  return ids;
}

function syncCallouts() {
  const ids = selectCalloutIds();

  for (const [id, chip] of calloutEls) {
    if (!ids.includes(id)) {
      chip.remove();
      calloutEls.delete(id);
    }
  }

  for (const id of ids) {
    const node = scene.nodeFor(id);
    if (!node) continue;
    let chip = calloutEls.get(id);
    if (!chip) {
      chip = document.createElement('div');
      chip.className = 'callout';
      calloutsContainer.appendChild(chip);
      calloutEls.set(id, chip);
    }
    if (node.offline) {
      chip.innerHTML = `<div class="callout-zone">${node.label}</div><div class="callout-value"><i style="background:#a8b7ba"></i>Offline</div>`;
    } else {
      const reading = readingsByNodeId.get(id);
      const color = hexFor(metric, reading[metric]);
      chip.innerHTML = `<div class="callout-zone">${node.label}</div><div class="callout-value"><i style="background:${color}"></i>${formatValue(metric, reading[metric])}</div>`;
    }
  }
}

function updateCalloutPositions() {
  for (const [id, chip] of calloutEls) {
    const pos = scene.projectToScreen(id);
    if (!pos || pos.x < -0.1 || pos.x > 1.1 || pos.y < -0.1 || pos.y > 1.1) {
      chip.style.display = 'none';
      continue;
    }
    chip.style.display = '';
    chip.style.left = `${pos.x * 100}%`;
    chip.style.top = `${pos.y * 100}%`;
  }
}

// --- hover tooltip -----------------------------------------------------
const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();

canvas.addEventListener('pointermove', (event) => {
  const rect = canvas.getBoundingClientRect();
  pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
  pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
  tooltip.style.left = `${event.clientX}px`;
  tooltip.style.top = `${event.clientY}px`;
});
canvas.addEventListener('pointerleave', () => {
  tooltip.hidden = true;
});

function updateTooltip() {
  if (!scene) return;
  raycaster.setFromCamera(pointer, scene.camera);
  const hit = raycaster.intersectObjects(scene.pickTargets(), false)[0];
  const nodeId = hit?.object.userData.nodeId;
  if (!nodeId) {
    tooltip.hidden = true;
    return;
  }
  const node = scene.nodeFor(nodeId);
  const reading = readingsByNodeId.get(nodeId);
  if (!node) {
    tooltip.hidden = true;
    return;
  }

  if (node.offline || !reading) {
    tooltip.innerHTML = `<strong>${node.label}</strong><span>Offline — no data</span>`;
  } else {
    tooltip.innerHTML = `
      <strong>${node.label}</strong>
      <div><span>Temperature:</span> ${formatValue('temperature', reading.temperature)}</div>
      <div><span>Humidity:</span> ${formatValue('humidity', reading.humidity)}</div>
      <div><span>VOC Index:</span> ${formatValue('voc', reading.voc)}${reading.voc == null ? '' : ` · ${vocBand(reading.voc).label}`}</div>
    `;
  }
  tooltip.hidden = false;
}

// --- controls ------------------------------------------------------------
paramSwitcher.addEventListener('click', (event) => {
  const btn = event.target.closest('.param-btn');
  if (!btn) return;
  metric = btn.dataset.metric;
  paramSwitcher.querySelectorAll('.param-btn').forEach((b) => b.classList.toggle('param-btn--active', b === btn));
  renderLegendCard();
  if (scene) scene.update(readingsByNodeId, metric);
  syncCallouts();
});

// --- data polling ----------------------------------------------------------
async function refresh() {
  try {
    const [readings, history] = await Promise.all([fetchReadings(), fetchHistory()]);
    readingsByNodeId = new Map(readings.map((r) => [r.nodeId, r]));
    lastFetchAt = Date.now();

    scene.update(readingsByNodeId, metric);
    syncCallouts();

    const averages = computeAverages(readings);
    renderKPIs(kpisEl, averages, previousAverages);
    previousAverages = averages;

    renderSensorList(sensorListEl, nodes, readingsByNodeId);
    const online = nodes.filter((n) => !n.offline).length;
    sensorCountEl.textContent = `${online} / ${nodes.length}`;

    renderTimeSeries(chartSvg, history);
    const labels = timeAxisLabels(history);
    chartAxisEl.innerHTML = labels.map((l) => `<span>${l}</span>`).join('');

    stageMeta.textContent = `${nodes.length} nodes · updated ${new Date().toLocaleTimeString([], {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    })}`;
  } catch (error) {
    liveLabel.textContent = `Feed error: ${error.message}`;
  }
}

function tickLiveLabel() {
  if (lastFetchAt == null) return;
  const secondsAgo = Math.round((Date.now() - lastFetchAt) / 1000);
  liveLabel.textContent = `LIVE · ${secondsAgo}s ago`;
}
setInterval(tickLiveLabel, 1000);

// --- boot ------------------------------------------------------------------
function animate() {
  requestAnimationFrame(animate);
  scene.controls.update();
  updateTooltip();
  updateCalloutPositions();
  scene.renderer.render(scene.scene, scene.camera);
}

async function start() {
  renderLegendCard();
  try {
    nodes = await fetchNodes();
    scene = createBuildingScene(canvas, nodes);
    await refresh();
    setInterval(refresh, POLL_MS);
    animate();
  } catch (error) {
    liveLabel.textContent = `Could not reach the API: ${error.message}`;
  }
}

start();
