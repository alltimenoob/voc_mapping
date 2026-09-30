import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

import { STAGE_BG, colorFor, normalize } from './color-scale.js';

// A floor slab holds a maximum of 4 rooms, laid out 2x2.
const FLOOR_HALF_SIZE = 3.9;
const SLAB_THICKNESS = 0.2;

// Rooms sit on a 3-unit grid; a 2.4 footprint leaves a visible gap between
// neighbours so each reads as a distinct room rather than a solid block.
const ROOM_SIZE = 2.4;
const ROOM_MIN_HEIGHT = 0.6;
const ROOM_MAX_EXTRA_HEIGHT = 2.4;

/** Builds the digital-twin scene: one floor slab + one room box per sensor node. */
export function createBuildingScene(canvas, nodes) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(STAGE_BG);
  scene.fog = new THREE.Fog(STAGE_BG, 13, 28);

  const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 200);
  camera.position.set(0, 8, 8);

  const controls = new OrbitControls(camera, canvas);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.maxPolarAngle = Math.PI / 2 - 0.05;
  controls.minDistance = 4;
  controls.maxDistance = 20;
  controls.target.set(0, 0, 0);

  scene.add(new THREE.HemisphereLight(0xffffff, 0xb9c8ca, 1.15));
  const key = new THREE.DirectionalLight(0xffffff, 0.9);
  key.position.set(10, 16, 8);
  scene.add(key);

  // --- Floor slab -------------------------------------------------------
  const slabGeometry = new THREE.BoxGeometry(FLOOR_HALF_SIZE * 2, SLAB_THICKNESS, FLOOR_HALF_SIZE * 2);
  const slab = new THREE.Mesh(
    slabGeometry,
    new THREE.MeshStandardMaterial({ color: 0xffffff, transparent: true, opacity: 0.55, roughness: 0.9 })
  );
  scene.add(slab);

  const floorEdges = new THREE.LineSegments(
    new THREE.EdgesGeometry(slabGeometry),
    new THREE.LineBasicMaterial({ color: 0x0e8f97, transparent: true, opacity: 0.45 })
  );
  scene.add(floorEdges);

  // --- Room boxes ------------------------------------------------------
  // Unit-height box, base translated to local y=0, so scaling y grows the
  // room upward from the floor instead of through it.
  const roomGeometry = new THREE.BoxGeometry(ROOM_SIZE, 1, ROOM_SIZE);
  roomGeometry.translate(0, 0.5, 0);
  const roomEdgesGeometry = new THREE.EdgesGeometry(roomGeometry);
  const entries = new Map();

  for (const node of nodes) {
    const group = new THREE.Group();
    group.position.set(node.x, SLAB_THICKNESS / 2, node.z);

    const room = new THREE.Mesh(
      roomGeometry,
      new THREE.MeshStandardMaterial({ roughness: 0.4, metalness: 0.05 })
    );
    room.userData.nodeId = node.id;

    // Dark edge outline keeps every room legible on the light stage,
    // regardless of how light the fill color is (see color-scale.js).
    const roomEdges = new THREE.LineSegments(
      roomEdgesGeometry,
      new THREE.LineBasicMaterial({ color: 0x14313a, transparent: true, opacity: 0.55 })
    );

    group.add(room, roomEdges);
    scene.add(group);

    entries.set(node.id, { node, group, room, roomEdges });
  }

  /** Repaint + re-extrude every room for the current metric + latest readings. */
  function update(readingsByNodeId, metricKey) {
    for (const [nodeId, entry] of entries) {
      const reading = readingsByNodeId.get(nodeId);
      if (!reading || entry.node.offline || reading[metricKey] == null) {
        entry.room.material.color.set(0xa8b7ba);
        entry.room.material.emissive.set(0x000000);
        entry.room.scale.y = ROOM_MIN_HEIGHT;
        entry.roomEdges.scale.y = ROOM_MIN_HEIGHT;
        entry.roomEdges.material.opacity = 0.25;
        continue;
      }
      const value = reading[metricKey];
      const color = colorFor(metricKey, value);
      entry.room.material.color.copy(color);
      entry.room.material.emissive.copy(color).multiplyScalar(0.18);
      const t = normalize(metricKey, value);
      const height = ROOM_MIN_HEIGHT + t * ROOM_MAX_EXTRA_HEIGHT;
      entry.room.scale.y = height;
      entry.roomEdges.scale.y = height;
      entry.roomEdges.material.opacity = 0.55;
    }
  }

  function resize() {
    const width = canvas.clientWidth;
    const height = canvas.clientHeight;
    if (!width || !height) return;
    if (canvas.width === width && canvas.height === height) return;
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
  }
  window.addEventListener('resize', resize);
  resize();

  const pickTargets = () => [...entries.values()].map((e) => e.room);
  const nodeFor = (nodeId) => entries.get(nodeId)?.node;

  const projected = new THREE.Vector3();
  /** Project a node's room-top to normalized [0..1] screen space, or null if behind the camera. */
  function projectToScreen(nodeId) {
    const entry = entries.get(nodeId);
    if (!entry) return null;
    projected.set(0, 1, 0); // top face, in the room geometry's own unit space
    entry.room.localToWorld(projected);
    projected.project(camera);
    if (projected.z > 1) return null;
    return { x: (projected.x + 1) / 2, y: (1 - projected.y) / 2 };
  }

  return { renderer, scene, camera, controls, update, resize, pickTargets, nodeFor, projectToScreen };
}
