import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { MeshoptDecoder } from "three/addons/libs/meshopt_decoder.module.js";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";

const viewer = document.querySelector("#board-viewer");
const canvas = document.querySelector("#board-canvas");
const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

// Waveshare ESP32-C6-LCD-1.47, converted from the manufacturer's STEP drawing (units: mm).
const BOARD_MODEL_URL = "./assets/esp32-c6-lcd-1.47.glb";
const BOARD_WIDTH = 6.6;
// LCD active area and front face, from the Waveshare dimension drawing.
const SCREEN = { width: 32.35, height: 17.39, centerY: 0.005, z: 1.45 };

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

  // Soft studio reflections for the glass, steel and solder.
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environmentIntensity = 0.85;
  pmrem.dispose();

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

  const board = new THREE.Group();
  board.scale.setScalar(0.72);
  board.position.set(0.32, -0.02, 0);
  board.rotation.set(-0.1, -0.34, -0.025);
  scene.add(board);

  loadBoard(board, scene.environment)
    .then(() => viewer.classList.add("is-loaded"))
    .catch((error) => {
      console.error("Could not load the board model", error);
      showFallback();
    });

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
  // Pull back on narrow, portrait viewers so the whole board stays in frame.
  camera.zoom = Math.min(1, camera.aspect / 0.9);
  camera.updateProjectionMatrix();
}

function addLighting(scene) {
  scene.add(new THREE.HemisphereLight(0xd8edf7, 0x0b0d0e, 1.1));

  const key = new THREE.DirectionalLight(0xffffff, 2.6);
  key.position.set(-4.5, 6.5, 7.5);
  scene.add(key);

  const rim = new THREE.DirectionalLight(0x9fd7ff, 2.2);
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

async function loadBoard(group, envMap) {
  const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
  const gltf = await loader.loadAsync(BOARD_MODEL_URL);

  const model = gltf.scene;
  model.add(createScreen(envMap));
  // USB-C on the right, the way the board hangs on the wall.
  model.rotation.z = Math.PI / 2;

  // Centre the board and scale it from millimetres to scene units.
  const pivot = new THREE.Group();
  pivot.add(model);
  const box = new THREE.Box3().setFromObject(pivot);
  const size = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());
  model.position.sub(center);
  pivot.scale.setScalar(BOARD_WIDTH / size.x);

  group.add(pivot);
}

function createScreen(envMap) {
  const group = new THREE.Group();
  // The panel is portrait in the drawing; the firmware drives it in landscape.
  group.rotation.z = -Math.PI / 2;
  group.position.set(0, SCREEN.centerY, SCREEN.z);

  const screen = new THREE.Mesh(
    new THREE.PlaneGeometry(SCREEN.width, SCREEN.height),
    new THREE.MeshBasicMaterial({ map: createDepartureTexture(), toneMapped: false }),
  );
  screen.position.z = 0.02;
  group.add(screen);

  // Cover glass: black and additive, so only its reflections show on top of the pixels.
  // Same size as the pixels: the model's own glass covers the bezel, and anything
  // larger pokes past the frame as a dark patch.
  const glass = new THREE.Mesh(
    new THREE.PlaneGeometry(SCREEN.width, SCREEN.height),
    new THREE.MeshPhysicalMaterial({
      color: 0x000000,
      metalness: 0,
      roughness: 0.16,
      // Own envMap so this intensity isn't replaced by scene.environmentIntensity.
      envMap,
      envMapIntensity: 0.16,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    }),
  );
  glass.position.z = 0.05;
  group.add(glass);

  return group;
}

// Adafruit GFX classic 5x7 font, only the glyphs the board shows here.
const GLYPHS = {
  "0": [0x3e, 0x51, 0x49, 0x45, 0x3e],
  "1": [0x00, 0x42, 0x7f, 0x40, 0x00],
  "2": [0x72, 0x49, 0x49, 0x49, 0x46],
  "3": [0x21, 0x41, 0x49, 0x4d, 0x33],
  "4": [0x18, 0x14, 0x12, 0x7f, 0x10],
  "5": [0x27, 0x45, 0x45, 0x45, 0x39],
  "6": [0x3c, 0x4a, 0x49, 0x49, 0x31],
  "7": [0x41, 0x21, 0x11, 0x09, 0x07],
  "8": [0x36, 0x49, 0x49, 0x49, 0x36],
  "9": [0x46, 0x49, 0x49, 0x29, 0x1e],
  ":": [0x00, 0x00, 0x14, 0x00, 0x00],
  "+": [0x08, 0x08, 0x3e, 0x08, 0x08],
  "'": [0x00, 0x08, 0x07, 0x03, 0x00],
  "-": [0x08, 0x08, 0x08, 0x08, 0x08],
  B: [0x7f, 0x49, 0x49, 0x49, 0x36],
  C: [0x3e, 0x41, 0x41, 0x41, 0x22],
  E: [0x7f, 0x49, 0x49, 0x49, 0x41],
  I: [0x00, 0x41, 0x7f, 0x41, 0x00],
  N: [0x7f, 0x04, 0x08, 0x10, 0x7f],
  R: [0x7f, 0x09, 0x19, 0x29, 0x46],
  S: [0x26, 0x49, 0x49, 0x49, 0x32],
  T: [0x03, 0x01, 0x7f, 0x01, 0x03],
};

// Same layout as showRow() in the sketch: 320x172 landscape, four 43px rows.
function createDepartureTexture() {
  const scale = 4;
  const canvasTexture = document.createElement("canvas");
  canvasTexture.width = 320 * scale;
  canvasTexture.height = 172 * scale;
  const ctx = canvasTexture.getContext("2d");
  ctx.scale(scale, scale);

  ctx.fillStyle = "#040608";
  ctx.fillRect(0, 0, 320, 172);

  const rows = [
    ["13:57", "IR37", 0],
    ["14:02", "S3", 0],
    ["14:27", "IR27", 3],
    ["14:31", "S3", 0],
  ];

  rows.forEach(([time, line, delay], index) => {
    const y = index * 43;

    drawPixelText(ctx, time, 0, y + 12, "#f4f7f9");
    drawPixelText(ctx, line, 65, y + 12, "#48b8ff");

    ctx.fillStyle = delay > 1 ? "#ff2626" : "#3bf03f";
    ctx.fillRect(120, y + 4, 190, 36);
    if (delay > 1) {
      drawPixelText(ctx, `+${delay}'`, 130, y + 12, "#ffffff");
    }

    ctx.fillStyle = "#222222";
    ctx.fillRect(0, y + 42, 320, 1);
  });

  const texture = new THREE.CanvasTexture(canvasTexture);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 8;
  texture.needsUpdate = true;
  return texture;
}

function drawPixelText(ctx, text, x, y, color, size = 2) {
  ctx.fillStyle = color;
  [...text].forEach((char, index) => {
    (GLYPHS[char] || []).forEach((bits, column) => {
      for (let row = 0; row < 8; row += 1) {
        if ((bits >> row) & 1) {
          ctx.fillRect(x + (index * 6 + column) * size, y + row * size, size, size);
        }
      }
    });
  });
}
