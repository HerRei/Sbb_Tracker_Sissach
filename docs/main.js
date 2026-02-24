import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";

const viewer = document.querySelector("#board-viewer");
const canvas = document.querySelector("#board-canvas");
const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

function canUseWebGL() {
  try {
    const testCanvas = document.createElement("canvas");
    return Boolean(
      window.WebGLRenderingContext &&
        (testCanvas.getContext("webgl") || testCanvas.getContext("experimental-webgl")),
    );
  } catch {
    return false;
  }
}

function showFallback() {
  viewer?.classList.add("is-fallback");
}

if (!viewer || !canvas || !canUseWebGL()) {
  showFallback();
} else {
  initBoardModel();
}

function initBoardModel() {
  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog(0x070a0c, 11, 24);

  const camera = new THREE.PerspectiveCamera(36, 1, 0.1, 100);
  camera.position.set(0.05, 1.12, 10.65);

  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: true,
    alpha: true,
    powerPreference: "high-performance",
  });
  renderer.setClearColor(0x000000, 0);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.1;

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.06;
  controls.enablePan = false;
  controls.minDistance = 6.4;
  controls.maxDistance = 14;
  controls.minPolarAngle = Math.PI * 0.26;
  controls.maxPolarAngle = Math.PI * 0.72;
  controls.autoRotate = !reducedMotion.matches;
  controls.autoRotateSpeed = 0.75;
  controls.target.set(0.15, 0, 0.05);

  const board = createBoard();
  board.scale.setScalar(0.72);
  board.position.set(0.32, -0.02, 0);
  board.rotation.set(-0.1, -0.34, -0.025);
  scene.add(board);

  addLighting(scene);
  addEnvironment(scene);

  const resizeObserver = new ResizeObserver(() => resize(renderer, camera, viewer));
  resizeObserver.observe(viewer);
  resize(renderer, camera, viewer);

  reducedMotion.addEventListener("change", (event) => {
    controls.autoRotate = !event.matches;
  });

  let frameId = 0;
  function render() {
    controls.update();
    renderer.render(scene, camera);
    frameId = window.requestAnimationFrame(render);
  }

  render();

  window.addEventListener("pagehide", () => {
    window.cancelAnimationFrame(frameId);
    resizeObserver.disconnect();
    renderer.dispose();
  });
}

function resize(renderer, camera, element) {
  const rect = element.getBoundingClientRect();
  const width = Math.max(1, rect.width);
  const height = Math.max(1, rect.height);
  renderer.setSize(width, height, false);
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
}

function addLighting(scene) {
  scene.add(new THREE.HemisphereLight(0xd8edf7, 0x0b0d0e, 1.55));

  const key = new THREE.DirectionalLight(0xffffff, 3.4);
  key.position.set(-4.5, 6.5, 7.5);
  scene.add(key);

  const rim = new THREE.DirectionalLight(0x9fd7ff, 1.8);
  rim.position.set(4, 3.5, -3.5);
  scene.add(rim);

  const red = new THREE.PointLight(0xe0001b, 4.5, 12);
  red.position.set(-5, -1.5, 3.5);
  scene.add(red);

  const green = new THREE.PointLight(0x1fd44d, 3, 10);
  green.position.set(2.5, -1.2, 3.5);
  scene.add(green);
}

function addEnvironment(scene) {
  const ringMaterial = new THREE.LineBasicMaterial({
    color: 0xffffff,
    transparent: true,
    opacity: 0.16,
  });

  [3.5, 4.4, 5.2].forEach((radius, index) => {
    const curve = new THREE.EllipseCurve(0, 0, radius * 1.35, radius * 0.44, 0, Math.PI * 2);
    const points = curve.getPoints(160).map((point) => new THREE.Vector3(point.x, point.y, -0.42 - index * 0.05));
    const geometry = new THREE.BufferGeometry().setFromPoints(points);
    const ring = new THREE.LineLoop(geometry, ringMaterial);
    ring.rotation.x = -0.23;
    ring.rotation.z = 0.03 * index;
    scene.add(ring);
  });

  const baseGeometry = new THREE.CircleGeometry(5.8, 96);
  const baseMaterial = new THREE.MeshBasicMaterial({
    color: 0x1fd44d,
    transparent: true,
    opacity: 0.045,
    depthWrite: false,
  });
  const base = new THREE.Mesh(baseGeometry, baseMaterial);
  base.scale.set(1.55, 0.36, 1);
  base.position.set(0, -2.15, -1.2);
  base.rotation.x = -Math.PI / 2.6;
  scene.add(base);
}

function createBoard() {
  const group = new THREE.Group();

  const bodyMaterial = new THREE.MeshPhysicalMaterial({
    color: 0x07090a,
    metalness: 0.45,
    roughness: 0.22,
    clearcoat: 1,
    clearcoatRoughness: 0.11,
  });
  const body = new THREE.Mesh(new RoundedBoxGeometry(8.45, 4.05, 0.9, 12, 0.37), bodyMaterial);
  body.castShadow = true;
  body.receiveShadow = true;
  group.add(body);

  addLayeredCase(group);
  addScreenAssembly(group);
  addPinHeader(group);
  addUsbPort(group);
  addBoardDetails(group);
  addTDisplayS3Details(group);

  return group;
}

function addLayeredCase(group) {
  const backLip = new THREE.Mesh(
    new RoundedBoxGeometry(8.66, 4.26, 0.32, 10, 0.4),
    new THREE.MeshPhysicalMaterial({
      color: 0x020303,
      metalness: 0.5,
      roughness: 0.2,
      clearcoat: 1,
      clearcoatRoughness: 0.08,
    }),
  );
  backLip.position.z = -0.34;
  group.add(backLip);

  const chrome = new THREE.Mesh(
    new RoundedBoxGeometry(8.23, 3.78, 0.18, 12, 0.29),
    new THREE.MeshPhysicalMaterial({
      color: 0xc9d0d2,
      metalness: 0.92,
      roughness: 0.14,
      clearcoat: 0.8,
      clearcoatRoughness: 0.04,
    }),
  );
  chrome.position.z = 0.5;
  group.add(chrome);

  const frontBezel = new THREE.Mesh(
    new RoundedBoxGeometry(8.02, 3.56, 0.21, 12, 0.24),
    new THREE.MeshPhysicalMaterial({
      color: 0x050708,
      metalness: 0.28,
      roughness: 0.16,
      clearcoat: 1,
      clearcoatRoughness: 0.06,
    }),
  );
  frontBezel.position.z = 0.62;
  group.add(frontBezel);

  const innerShadow = new THREE.Mesh(
    new RoundedBoxGeometry(7.36, 3.04, 0.08, 8, 0.14),
    new THREE.MeshBasicMaterial({ color: 0x000000 }),
  );
  innerShadow.position.z = 0.755;
  group.add(innerShadow);

  const sideBand = new THREE.Mesh(
    new RoundedBoxGeometry(0.2, 3.48, 0.84, 7, 0.14),
    new THREE.MeshPhysicalMaterial({
      color: 0x11181b,
      metalness: 0.38,
      roughness: 0.2,
      clearcoat: 0.85,
      clearcoatRoughness: 0.08,
    }),
  );
  sideBand.position.set(4.08, 0, 0.18);
  group.add(sideBand);
}

function addScreenAssembly(group) {
  const screen = new THREE.Mesh(
    new RoundedBoxGeometry(6.92, 2.76, 0.05, 5, 0.06),
    new THREE.MeshBasicMaterial({ map: createDepartureTexture(), toneMapped: false }),
  );
  screen.position.z = 0.82;
  group.add(screen);

  const screenFrameMaterial = new THREE.MeshBasicMaterial({
    color: 0x0d1419,
    transparent: true,
    opacity: 0.98,
  });
  [
    [0, 1.43, 7.02, 0.08],
    [0, -1.43, 7.02, 0.08],
    [-3.52, 0, 0.08, 2.76],
    [3.52, 0, 0.08, 2.76],
  ].forEach(([x, y, width, height]) => {
    const rail = new THREE.Mesh(new THREE.PlaneGeometry(width, height), screenFrameMaterial);
    rail.position.set(x, y, 0.845);
    group.add(rail);
  });

  const glass = new THREE.Mesh(
    new RoundedBoxGeometry(7.42, 3.12, 0.035, 5, 0.13),
    new THREE.MeshPhysicalMaterial({
      color: 0xdff6ff,
      transparent: true,
      opacity: 0.15,
      metalness: 0,
      roughness: 0.015,
      clearcoat: 1,
      clearcoatRoughness: 0.02,
      transmission: 0.16,
    }),
  );
  glass.position.z = 0.885;
  group.add(glass);

  const longHighlight = new THREE.Mesh(
    new THREE.PlaneGeometry(6.5, 0.045),
    new THREE.MeshBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0.58,
      depthWrite: false,
    }),
  );
  longHighlight.position.set(-0.2, 1.33, 0.91);
  longHighlight.scale.y = 1.15;
  longHighlight.rotation.z = -0.04;
  group.add(longHighlight);

  const diagonalHighlight = new THREE.Mesh(
    new THREE.PlaneGeometry(2.7, 0.42),
    new THREE.MeshBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0.12,
      depthWrite: false,
    }),
  );
  diagonalHighlight.position.set(1.8, 0.36, 0.915);
  diagonalHighlight.rotation.z = -0.9;
  group.add(diagonalHighlight);
}

function addPinHeader(group) {
  const holeMaterial = new THREE.MeshStandardMaterial({
    color: 0x010101,
    metalness: 0.25,
    roughness: 0.34,
  });
  const ringMaterial = new THREE.MeshStandardMaterial({
    color: 0x14191c,
    metalness: 0.82,
    roughness: 0.18,
  });

  const headerStrip = new THREE.Mesh(
    new RoundedBoxGeometry(7.3, 0.32, 0.16, 5, 0.08),
    new THREE.MeshPhysicalMaterial({
      color: 0x0a0d0f,
      metalness: 0.45,
      roughness: 0.18,
      clearcoat: 0.9,
      clearcoatRoughness: 0.08,
    }),
  );
  headerStrip.position.set(-0.1, 2.06, 0.47);
  group.add(headerStrip);

  for (let i = 0; i < 12; i += 1) {
    const x = -3.36 + i * 0.6;
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.128, 0.032, 14, 32), ringMaterial);
    ring.position.set(x, 2.06, 0.58);
    group.add(ring);

    const hole = new THREE.Mesh(new THREE.CylinderGeometry(0.086, 0.086, 0.052, 28), holeMaterial);
    hole.rotation.x = Math.PI / 2;
    hole.position.set(x, 2.06, 0.598);
    group.add(hole);
  }

  const switchBody = new THREE.Mesh(
    new RoundedBoxGeometry(0.52, 0.34, 0.18, 4, 0.04),
    new THREE.MeshStandardMaterial({ color: 0x2c343b, roughness: 0.5, metalness: 0.12 }),
  );
  switchBody.position.set(-1.45, 2.38, 0.45);
  group.add(switchBody);

  const espModule = new THREE.Mesh(
    new RoundedBoxGeometry(1.05, 0.36, 0.12, 4, 0.04),
    new THREE.MeshStandardMaterial({ color: 0x1f2b31, roughness: 0.44, metalness: 0.1 }),
  );
  espModule.position.set(0.65, 2.38, 0.44);
  group.add(espModule);
}

function addUsbPort(group) {
  const neck = new THREE.Mesh(
    new RoundedBoxGeometry(0.22, 0.86, 0.38, 5, 0.07),
    new THREE.MeshPhysicalMaterial({
      color: 0x0a0d0f,
      metalness: 0.35,
      roughness: 0.22,
      clearcoat: 0.8,
    }),
  );
  neck.position.set(4.32, -0.02, 0.2);
  group.add(neck);

  const shell = new THREE.Mesh(
    new RoundedBoxGeometry(0.78, 0.9, 0.48, 7, 0.09),
    new THREE.MeshStandardMaterial({
      color: 0xd8dddc,
      metalness: 0.9,
      roughness: 0.18,
    }),
  );
  shell.position.set(4.65, -0.02, 0.2);
  group.add(shell);

  const darkCavity = new THREE.Mesh(
    new RoundedBoxGeometry(0.07, 0.58, 0.28, 5, 0.06),
    new THREE.MeshBasicMaterial({ color: 0x050607 }),
  );
  darkCavity.position.set(5.055, -0.02, 0.2);
  group.add(darkCavity);

  const innerTongue = new THREE.Mesh(
    new RoundedBoxGeometry(0.03, 0.34, 0.065, 3, 0.02),
    new THREE.MeshBasicMaterial({ color: 0x20282c }),
  );
  innerTongue.position.set(5.095, -0.02, 0.2);
  group.add(innerTongue);
}

function addTDisplayS3Details(group) {
  const silkMaterial = new THREE.MeshBasicMaterial({
    color: 0xffffff,
    transparent: true,
    opacity: 0.58,
  });
  const padMaterial = new THREE.MeshStandardMaterial({
    color: 0xbcb7a2,
    metalness: 0.82,
    roughness: 0.25,
  });
  const darkButtonMaterial = new THREE.MeshStandardMaterial({
    color: 0x20272c,
    metalness: 0.18,
    roughness: 0.42,
  });

  // Bottom castellated-style pads visible on the T-Display-S3 PCB edge.
  for (let i = 0; i < 12; i += 1) {
    const x = -3.36 + i * 0.6;
    const pad = new THREE.Mesh(new RoundedBoxGeometry(0.26, 0.08, 0.035, 3, 0.025), padMaterial);
    pad.position.set(x, -2.02, 0.56);
    group.add(pad);
  }

  // Two small side buttons plus the raised IO14-style button on the top edge.
  [
    [-3.15, 2.34, 0.42],
    [2.95, 2.34, 0.42],
    [-0.98, 2.45, 0.54],
  ].forEach(([x, y, z]) => {
    const button = new THREE.Mesh(new RoundedBoxGeometry(0.34, 0.22, 0.16, 4, 0.035), darkButtonMaterial);
    button.position.set(x, y, z);
    group.add(button);
  });

  const qwiic = new THREE.Mesh(
    new RoundedBoxGeometry(0.64, 0.28, 0.16, 4, 0.035),
    new THREE.MeshStandardMaterial({ color: 0x252023, metalness: 0.25, roughness: 0.38 }),
  );
  qwiic.position.set(3.36, -1.88, 0.58);
  group.add(qwiic);

  const batterySocket = new THREE.Mesh(
    new RoundedBoxGeometry(0.7, 0.34, 0.2, 4, 0.035),
    new THREE.MeshStandardMaterial({ color: 0xf1f0e8, metalness: 0.05, roughness: 0.35 }),
  );
  batterySocket.position.set(-3.2, -1.9, 0.58);
  group.add(batterySocket);

  const antennaKeepout = new THREE.Mesh(
    new THREE.PlaneGeometry(0.92, 0.34),
    new THREE.MeshBasicMaterial({ color: 0x1c2529, transparent: true, opacity: 0.88 }),
  );
  antennaKeepout.position.set(0.45, 1.84, 0.94);
  group.add(antennaKeepout);

  for (let i = 0; i < 9; i += 1) {
    const trace = new THREE.Mesh(new THREE.PlaneGeometry(0.015, 0.42), silkMaterial);
    trace.position.set(-2.4 + i * 0.22, 1.68, 0.945);
    trace.rotation.z = -0.55;
    group.add(trace);
  }

  [
    [-3.05, 1.78, 0.42],
    [-2.7, 1.78, 0.28],
    [2.62, 1.78, 0.5],
    [3.02, 1.78, 0.36],
  ].forEach(([x, y, width]) => {
    const mark = new THREE.Mesh(new THREE.PlaneGeometry(width, 0.035), silkMaterial);
    mark.position.set(x, y, 0.945);
    group.add(mark);
  });
}

function addBoardDetails(group) {
  const screwMaterial = new THREE.MeshStandardMaterial({
    color: 0x59646c,
    metalness: 0.85,
    roughness: 0.18,
  });

  [
    [-3.78, 1.68],
    [3.78, 1.68],
    [-3.78, -1.68],
    [3.78, -1.68],
  ].forEach(([x, y]) => {
    const screw = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 0.04, 32), screwMaterial);
    screw.rotation.x = Math.PI / 2;
    screw.position.set(x, y, 0.93);
    group.add(screw);
  });

  const sideLineMaterial = new THREE.MeshBasicMaterial({
    color: 0xffffff,
    transparent: true,
    opacity: 0.14,
  });
  [-1.82, 1.82].forEach((y) => {
    const line = new THREE.Mesh(new THREE.PlaneGeometry(7.5, 0.025), sideLineMaterial);
    line.position.set(0, y, 0.925);
    group.add(line);
  });

  const led = new THREE.Mesh(
    new THREE.SphereGeometry(0.075, 20, 10),
    new THREE.MeshBasicMaterial({ color: 0xff0827 }),
  );
  led.position.set(-3.58, -1.78, 0.93);
  group.add(led);

  const ledGlow = new THREE.PointLight(0xff1632, 1.9, 2);
  ledGlow.position.set(-3.58, -1.78, 1.05);
  group.add(ledGlow);

  const label = new THREE.Mesh(
    new THREE.PlaneGeometry(0.85, 0.12),
    new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.18 }),
  );
  label.position.set(2.9, 1.72, 0.93);
  group.add(label);
}

function createDepartureTexture() {
  const canvasTexture = document.createElement("canvas");
  canvasTexture.width = 1400;
  canvasTexture.height = 456;
  const ctx = canvasTexture.getContext("2d");

  ctx.fillStyle = "#05090d";
  ctx.fillRect(0, 0, canvasTexture.width, canvasTexture.height);

  const rows = [
    ["12:34", "IR27", "On time", "green"],
    ["13:02", "B50", "On time", "green"],
    ["13:17", "T8", "+1 min", "red"],
    ["14:03", "S3", "On time", "green"],
  ];

  const rowHeight = canvasTexture.height / rows.length;
  ctx.font = "700 72px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace";
  ctx.textBaseline = "middle";

  rows.forEach((row, index) => {
    const y = index * rowHeight;

    ctx.fillStyle = index % 2 === 0 ? "#0b141b" : "#091017";
    ctx.fillRect(0, y, canvasTexture.width, rowHeight);

    ctx.fillStyle = "rgba(255,255,255,0.13)";
    ctx.fillRect(0, y + rowHeight - 4, canvasTexture.width, 4);

    ctx.fillStyle = "#f3fbff";
    ctx.fillText(row[0], 58, y + rowHeight / 2 + 2);

    ctx.fillStyle = "#64a8ff";
    ctx.fillText(row[1], 360, y + rowHeight / 2 + 2);

    const boxX = 620;
    const boxW = 690;
    ctx.fillStyle = row[3] === "red" ? "#c50b1c" : "#16962f";
    roundRect(ctx, boxX, y + 18, boxW, rowHeight - 36, 12);
    ctx.fill();

    const gradient = ctx.createLinearGradient(boxX, y, boxX + boxW, y);
    gradient.addColorStop(0, "rgba(255,255,255,0.16)");
    gradient.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = gradient;
    roundRect(ctx, boxX + 8, y + 26, boxW - 16, rowHeight - 52, 9);
    ctx.fill();

    ctx.fillStyle = row[3] === "red" ? "#ffffff" : "#e8ffee";
    ctx.fillText(row[2], boxX + 54, y + rowHeight / 2 + 2);
  });

  const texture = new THREE.CanvasTexture(canvasTexture);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 8;
  texture.needsUpdate = true;
  return texture;
}

function roundRect(ctx, x, y, width, height, radius) {
  const r = Math.min(radius, width / 2, height / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + width, y, x + width, y + height, r);
  ctx.arcTo(x + width, y + height, x, y + height, r);
  ctx.arcTo(x, y + height, x, y, r);
  ctx.arcTo(x, y, x + width, y, r);
  ctx.closePath();
}
