const SERIES = [
  { key: 'temperature', label: 'TEMP', color: '#c25f1f' },
  { key: 'humidity', label: 'RH', color: '#1d6d8c' },
  { key: 'aqi', label: 'AQI', color: '#0e8f97' }
];

const VIEW_W = 266;
const VIEW_H = 116;
const MARGIN_TOP = 8;
const MARGIN_BOTTOM = 8;

export const CHART_SERIES = SERIES;

function pathFor(values, min, max) {
  const range = max - min || 1;
  const step = VIEW_W / Math.max(1, values.length - 1);
  return values
    .map((v, i) => {
      const x = i * step;
      const t = (v - min) / range;
      const y = MARGIN_TOP + (1 - t) * (VIEW_H - MARGIN_TOP - MARGIN_BOTTOM);
      return `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(' ');
}

/** Renders the network time-series chart into `svg` from real history rows. */
export function renderTimeSeries(svg, history) {
  if (!history.length) {
    svg.innerHTML = '';
    return;
  }

  const lines = SERIES.map(({ key, color }) => {
    const values = history.map((row) => row[key]);
    const min = Math.min(...values);
    const max = Math.max(...values);
    const d = pathFor(values, min, max === min ? min + 1 : max);
    return `<path d="${d}" fill="none" stroke="${color}" stroke-width="1.8" stroke-linejoin="round" stroke-linecap="round" />`;
  }).join('');

  const gridLines = [0.25, 0.5, 0.75]
    .map((f) => {
      const y = MARGIN_TOP + f * (VIEW_H - MARGIN_TOP - MARGIN_BOTTOM);
      return `<line x1="0" y1="${y}" x2="${VIEW_W}" y2="${y}" />`;
    })
    .join('');

  svg.setAttribute('viewBox', `0 0 ${VIEW_W} ${VIEW_H}`);
  svg.setAttribute('preserveAspectRatio', 'none');
  svg.innerHTML = `
    <rect x="0" y="0" width="${VIEW_W}" height="${VIEW_H}" fill="#fafcfc" />
    <g stroke="#e7eded" stroke-width="1">${gridLines}</g>
    ${lines}
  `;
}

/** Relative time labels ("-4m", "now") spanning the retained history window. */
export function timeAxisLabels(history, count = 4) {
  if (history.length < 2) return [];
  const first = new Date(history[0].timestamp).getTime();
  const last = new Date(history[history.length - 1].timestamp).getTime();
  const spanMs = last - first;
  return Array.from({ length: count }, (_, i) => {
    const t = i / (count - 1);
    const minsAgo = Math.round(((1 - t) * spanMs) / 60000);
    return minsAgo <= 0 ? 'now' : `-${minsAgo}m`;
  });
}
