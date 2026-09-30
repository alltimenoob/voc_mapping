/**
 * The building's room layout and which Firebase sensor (live_data/<sensorId>,
 * analytics/<sensorId>) reports for each room. A room with no sensorId has
 * no hardware yet and is shown offline.
 *
 * Single floor. A floor slab holds a maximum of 4 rooms, laid out on a 2x2
 * grid.
 */
export const EXAMPLE_NODES = [
  { id: 'lobby-east', label: 'Lobby East', x: -1.5, z: -1.5, sensorId: 'sensor_1' },
  { id: 'lobby-west', label: 'Lobby West', x: 1.5, z: -1.5, sensorId: 'sensor_2' },
  { id: 'reception', label: 'Reception', x: -1.5, z: 1.5 },
  { id: 'loading-bay', label: 'Loading Bay', x: 1.5, z: 1.5 }
];
