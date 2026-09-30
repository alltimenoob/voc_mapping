import { METRICS, vocBand, hexFor, formatValue, normalize } from './color-scale.js';

const KPI_METRICS = ['temperature', 'humidity', 'voc'];

function average(readings, key) {
  const values = readings.filter((r) => !r.offline && r[key] != null).map((r) => r[key]);
  if (!values.length) return null;
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}

/** Network-wide averages for the KPI row, one entry per tracked metric. */
export function computeAverages(readings) {
  return Object.fromEntries(KPI_METRICS.map((key) => [key, average(readings, key)]));
}

function deltaText(current, previous, decimals) {
  if (previous == null || current == null) return '—';
  const d = current - previous;
  const sign = d > 0 ? '+' : d < 0 ? '' : '±';
  return `${sign}${d.toFixed(decimals)}`;
}

export function renderKPIs(container, averages, previousAverages) {
  container.innerHTML = KPI_METRICS.map((key) => {
    const { label, decimals } = METRICS[key];
    const value = averages[key];
    const t = value == null ? 0 : normalize(key, value);
    const color = value == null ? '#a8b7ba' : hexFor(key, value);
    const badge = key === 'voc' && value != null ? `<span class="kpi-badge">${vocBand(value).label.toUpperCase()}</span>` : '';

    return `
      <div class="kpi-card">
        <div class="kpi-info">
          <div class="kpi-label">${label}</div>
          <div class="kpi-value-row">
            <span class="kpi-value">${value == null ? '—' : value.toFixed(decimals)}</span>
            <span class="kpi-unit">${METRICS[key].unit}</span>
            ${badge}
          </div>
        </div>
        <div class="kpi-gauge-col">
          <div class="kpi-delta">${deltaText(value, previousAverages?.[key], decimals)}</div>
          <div class="kpi-gauge"><div class="kpi-gauge-fill" style="width:${(t * 100).toFixed(0)}%;background:${color}"></div></div>
        </div>
      </div>`;
  }).join('');
}

function fixed(value, decimals) {
  return value == null ? '—' : value.toFixed(decimals);
}

export function renderSensorList(container, nodes, readingsByNodeId) {
  const rows = nodes
    .slice()
    .sort((a, b) => a.label.localeCompare(b.label))
    .map((node) => {
      if (node.offline) {
        return `
          <div class="sensor-row sensor-row--offline">
            <span class="status-dot status-dot--off"></span>
            <span class="sensor-name">${node.label}</span>
            <span class="sensor-offline">OFFLINE</span>
          </div>`;
      }
      const reading = readingsByNodeId.get(node.id);
      return `
        <div class="sensor-row">
          <span class="status-dot"></span>
          <span class="sensor-name">${node.label}</span>
          <span class="sensor-metric">${fixed(reading?.temperature, 1)}</span>
          <span class="sensor-metric">${fixed(reading?.humidity, 0)}</span>
          <span class="sensor-metric">${fixed(reading?.voc, 0)}</span>
        </div>`;
    })
    .join('');

  container.innerHTML = rows;
}

export function formatUpdatedLabel(readings) {
  const stamps = readings.filter((r) => r.timestamp).map((r) => new Date(r.timestamp).getTime());
  if (!stamps.length) return '—';
  return new Date(Math.max(...stamps)).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

export { formatValue };
