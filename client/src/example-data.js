/**
 * Static example fixture for the building's sensor layout — stand-in for a
 * real node registry (MQTT/LoRaWAN gateway config, a database table, …).
 * Each node's baseline is what api.js drifts around client-side.
 *
 * Single floor. A floor slab holds a maximum of 4 rooms, laid out on a 2x2
 * grid.
 */
export const EXAMPLE_NODES = [
  { id: 'lobby-east', label: 'Lobby East', x: -1.5, z: -1.5, baseTemperature: 20.6, baseHumidity: 45, basePm25: 8 },
  { id: 'lobby-west', label: 'Lobby West', x: 1.5, z: -1.5, baseTemperature: 20.4, baseHumidity: 44, basePm25: 7.5 },
  { id: 'reception', label: 'Reception', x: -1.5, z: 1.5, baseTemperature: 20.8, baseHumidity: 46, basePm25: 8.2 },
  { id: 'loading-bay', label: 'Loading Bay', x: 1.5, z: 1.5, offline: true }
];
