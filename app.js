import * as THREE from "https://cdn.jsdelivr.net/npm/three@0.161.0/build/three.module.js";

// Visible release identification: update this tag for each published site build.
const SITE_VERSION = "ALPHA v0.8.0";
const SITE_BUILD_ID = "2026.10.31-r1";

const $ = (id) => document.getElementById(id);
const scene = new THREE.Scene();
const worldGroup = new THREE.Group();
scene.add(worldGroup);
// Everything that represents the environment lives under worldGroup, so
// player-scale gestures enlarge/shrink the floor, sky, measured grid and walls
// together with the build instead of leaving a fixed-looking backdrop.
const environmentGroup = new THREE.Group();
worldGroup.add(environmentGroup);
scene.background = new THREE.Color(0x9bb3c2);
// A real sky mesh is more reliable than scene.background in immersive WebXR.
// The distant environment grids below provide visible scale references against it.
const sky = new THREE.Mesh(
  new THREE.SphereGeometry(72, 40, 28),
  new THREE.MeshBasicMaterial({ color: 0x91b6cc, side: THREE.BackSide, depthWrite: false })
);
sky.renderOrder = -100;
environmentGroup.add(sky);

const camera = new THREE.PerspectiveCamera(65, innerWidth / innerHeight, 0.01, 100);
camera.position.set(0, 1.65, 2.4);
const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.NoToneMapping;
renderer.setClearColor(0x9bb3c2, 1);
renderer.xr.enabled = true;
renderer.xr.setReferenceSpaceType("local-floor");
document.body.appendChild(renderer.domElement);

worldGroup.add(new THREE.HemisphereLight(0xffffff, 0x52606b, 2.1));
const sun = new THREE.DirectionalLight(0xffffff, 2.0);
sun.position.set(4, 8, 5);
worldGroup.add(sun);
const FLOOR_SIZE = 32;
const FLOOR_HALF = FLOOR_SIZE / 2;
const floor = new THREE.Mesh(
  new THREE.PlaneGeometry(FLOOR_SIZE, FLOOR_SIZE),
  new THREE.MeshBasicMaterial({ color: 0x657a83 })
);
floor.rotation.x = -Math.PI / 2;
floor.position.y = -0.03;
environmentGroup.add(floor);
// A precise 32 × 32 meter floor with one-meter cells (32 divisions).
// The floor plane, grid, and bright boundary share exact bounds: -16 to +16 on X and Z.
const grid = new THREE.GridHelper(FLOOR_SIZE, FLOOR_SIZE, 0x526a73, 0x71858c);
grid.position.y = -0.015;
environmentGroup.add(grid);
// A bright perimeter makes the 32 × 32 floor boundary unmistakable.
const floorBoundary = new THREE.LineSegments(
  new THREE.EdgesGeometry(new THREE.PlaneGeometry(FLOOR_SIZE, FLOOR_SIZE)),
  new THREE.LineBasicMaterial({ color: 0xc8e7dc, transparent: true, opacity: 0.95, depthWrite: false })
);
floorBoundary.rotation.x = -Math.PI / 2;
floorBoundary.position.y = -0.004;
environmentGroup.add(floorBoundary);

// Four floor rings and distant vertical measurement grids make the size of
// the workspace legible even when the user has scaled far from 1:1.
for (const radius of [3, 6, 9, 12, 16]) {
  const ring = new THREE.Mesh(
    new THREE.RingGeometry(radius - 0.018, radius + 0.018, 128),
    new THREE.MeshBasicMaterial({ color: radius % 6 === 0 ? 0x9bd6cb : 0x7895a0, transparent: true, opacity: 0.48, side: THREE.DoubleSide, depthWrite: false })
  );
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = -0.008;
  environmentGroup.add(ring);
}
function makeBackdropGrid(width, height, spacing = 1, majorEvery = 5) {
  const group = new THREE.Group();
  const minorPoints = [];
  const majorPoints = [];
  const addLine = (target, x1, y1, x2, y2) => {
    target.push(new THREE.Vector3(x1, y1, 0), new THREE.Vector3(x2, y2, 0));
  };
  const epsilon = 1e-5;
  for (let x = -width / 2; x <= width / 2 + epsilon; x += spacing) {
    const target = Math.abs(x / majorEvery - Math.round(x / majorEvery)) < epsilon ? majorPoints : minorPoints;
    addLine(target, x, -height / 2, x, height / 2);
  }
  for (let y = -height / 2; y <= height / 2 + epsilon; y += spacing) {
    const target = Math.abs(y / majorEvery - Math.round(y / majorEvery)) < epsilon ? majorPoints : minorPoints;
    addLine(target, -width / 2, y, width / 2, y);
  }
  const minorGeometry = new THREE.BufferGeometry().setFromPoints(minorPoints);
  const majorGeometry = new THREE.BufferGeometry().setFromPoints(majorPoints);
  group.add(new THREE.LineSegments(minorGeometry, new THREE.LineBasicMaterial({ color: 0x526d79, transparent: true, opacity: 0.24, depthWrite: false })));
  group.add(new THREE.LineSegments(majorGeometry, new THREE.LineBasicMaterial({ color: 0x9bc3c9, transparent: true, opacity: 0.48, depthWrite: false })));
  const frame = new THREE.LineSegments(
    new THREE.EdgesGeometry(new THREE.PlaneGeometry(width, height)),
    new THREE.LineBasicMaterial({ color: 0xb5d8d8, transparent: true, opacity: 0.64, depthWrite: false })
  );
  group.add(frame);
  return group;
}
const backGrid = makeBackdropGrid(FLOOR_SIZE, 16, 1, 5);
backGrid.position.set(0, 8, -FLOOR_HALF);
environmentGroup.add(backGrid);
const frontGrid = makeBackdropGrid(FLOOR_SIZE, 16, 1, 5);
frontGrid.rotation.y = Math.PI;
frontGrid.position.set(0, 8, FLOOR_HALF);
environmentGroup.add(frontGrid);
const leftGrid = makeBackdropGrid(FLOOR_SIZE, 16, 1, 5);
leftGrid.rotation.y = Math.PI / 2;
leftGrid.position.set(-FLOOR_HALF, 8, 0);
environmentGroup.add(leftGrid);
const rightGrid = makeBackdropGrid(FLOOR_SIZE, 16, 1, 5);
rightGrid.rotation.y = -Math.PI / 2;
rightGrid.position.set(FLOOR_HALF, 8, 0);
environmentGroup.add(rightGrid);

const rootGroup = new THREE.Group();
worldGroup.add(rootGroup);
let nodes = [];
let selected = null;
// Right-controller B toggles the transform gizmo without changing selection.
let gizmoEnabled = true;
let rightBWasPressed = false;
let nextId = 1;
let pendingItemID = "item_crate";
let keyboardDraft = "item_crate";
let keyboardOpen = false;
let snapSettingsOpen = false;
let snapValueKeyboardOpen = false;
let snapValueTarget = "position";
let snapValueDraft = "0.1";
const snapConfig = {
  positionEnabled: false,
  rotationEnabled: false,
  positionStep: 0.1,       // world units (meters)
  rotationStepDegrees: 15 // degrees
};
let statusText = "Enter VR. Select a part, then use its XYZ arrows and rotation circles.";
let audioContext = null;
let audioLoadPromise = null;
const audioBuffers = Object.create(null);
// Hover audio is edge-triggered with a short dwell debounce. XR hand rays can
// jitter between a button and empty space every frame; using the action key
// (instead of mesh identity) prevents repeated sounds from tiny tracking noise.
let hoverCandidateAction = null;
let hoverCandidateSince = 0;
let lastHoverActionPlayed = null;
let lastHoverSfxTime = 0;
const HOVER_DWELL_MS = 115;
const HOVER_EXIT_RESET_MS = 170;
const HOVER_GLOBAL_COOLDOWN_MS = 260;
let handHoveringAvailable = false;
let panelReady = false;
let menuVisible = true;
let menuPoseInitialized = false;
let leftHandGrip = null;
let leftHandMenuActive = false;
const controllerRecords = [];
let leftXWasPressed = false;
// Player locomotion: left stick walks/strafe relative to headset direction;
// right stick snaps the player's facing direction in 30-degree steps. Two
// controller grips scale and reposition the whole workspace in 3D unless an
// actual item is already held; in that case they scale the held item.
const joystickConfig = { moveSpeed: 1.65, verticalSpeed: 1.35, deadzone: 0.18, turnStepDegrees: 30, turnThreshold: 0.68, turnReleaseThreshold: 0.25 };
const joystickState = { turnArmed: true };
const dragStates = new Map();
let twoHandScaleState = null;
let scaleGestureNeedsRelease = false;
const handPinchStates = new Map();
const handDragStates = new Map();
const handPoseProxies = new Map();
const handJointMaps = new Map();
const handVisuals = new Map();
const raycaster = new THREE.Raycaster();
const uiButtons = [];
const tempMatrix = new THREE.Matrix4();
const tempMatrix2 = new THREE.Matrix4();
const tempVector = new THREE.Vector3();
const tempQuaternion = new THREE.Quaternion();
const tempScale = new THREE.Vector3();

// Camera-facing feedback makes the two-hand scale gesture obvious. The HUD is
// outside worldGroup, so it remains a stable size while the environment scales.
const scaleFeedbackCanvas = document.createElement("canvas");
scaleFeedbackCanvas.width = 768;
scaleFeedbackCanvas.height = 192;
const scaleFeedbackContext = scaleFeedbackCanvas.getContext("2d");
const scaleFeedbackTexture = new THREE.CanvasTexture(scaleFeedbackCanvas);
scaleFeedbackTexture.colorSpace = THREE.SRGBColorSpace;
const scaleFeedback = new THREE.Group();
const scaleFeedbackPanel = new THREE.Mesh(
  new THREE.PlaneGeometry(0.92, 0.23),
  new THREE.MeshBasicMaterial({ map: scaleFeedbackTexture, transparent: true, depthTest: false, depthWrite: false, toneMapped: false })
);
scaleFeedbackPanel.renderOrder = 1000;
scaleFeedback.add(scaleFeedbackPanel);
scaleFeedback.renderOrder = 1000;
scaleFeedback.visible = false;
scene.add(scaleFeedback);
let scaleFeedbackUntil = 0;
let lastScaleFeedbackKey = "";
function drawScaleFeedback(kind, value, active = true) {
  const safeValue = THREE.MathUtils.clamp(Number(value) || 1, 0.01, 100);
  const key = `${kind}:${safeValue.toFixed(3)}:${active ? "active" : "done"}`;
  if (key !== lastScaleFeedbackKey) {
    lastScaleFeedbackKey = key;
    const ctx = scaleFeedbackContext;
    ctx.clearRect(0, 0, 768, 192);
    ctx.fillStyle = "rgba(8, 20, 29, 0.94)";
    ctx.fillRect(4, 4, 760, 184);
    const isPlayerScale = kind === "PLAYER";
    ctx.strokeStyle = isPlayerScale ? "#75dcc8" : "#a8c9ff";
    ctx.lineWidth = 7;
    ctx.strokeRect(7, 7, 754, 178);
    ctx.fillStyle = "#f5fbff";
    ctx.font = "bold 42px system-ui, sans-serif";
    ctx.textAlign = "left";
    ctx.fillText(isPlayerScale ? "PLAYER SIZE" : "HELD ITEM SCALE", 34, 66);
    ctx.textAlign = "right";
    ctx.font = "bold 54px system-ui, sans-serif";
    ctx.fillText(`${safeValue.toFixed(2)}×`, 730, 70);
    ctx.fillStyle = "rgba(210, 229, 237, 0.22)";
    ctx.fillRect(34, 112, 696, 30);
    const normalized = THREE.MathUtils.clamp((Math.log(safeValue / 0.25) / Math.log(4 / 0.25)), 0, 1);
    ctx.fillStyle = isPlayerScale ? "#75dcc8" : "#a8c9ff";
    ctx.fillRect(34, 112, Math.max(10, 696 * normalized), 30);
    ctx.fillStyle = "#bfd0d9";
    ctx.textAlign = "left";
    ctx.font = isPlayerScale ? "21px system-ui, sans-serif" : "24px system-ui, sans-serif";
    const hint = active
      ? (isPlayerScale
          ? "PULL APART = GROW  ·  BRING TOGETHER = SHRINK  ·  MOVE BOTH HANDS = MOVE PLAYER IN XYZ"
          : "PULL APART TO GROW  ·  BRING TOGETHER TO SHRINK")
      : "SCALE SET  ·  RELEASE BOTH GRIPS";
    ctx.fillText(hint, 34, 169);
    scaleFeedbackTexture.needsUpdate = true;
  }
  scaleFeedback.visible = true;
  scaleFeedbackUntil = performance.now() + (active ? 700 : 1500);
}
function updateScaleFeedbackPose() {
  if (!scaleFeedback.visible) return;
  if (!renderer.xr.isPresenting) {
    scaleFeedback.visible = false;
    return;
  }
  if (!twoHandScaleState && performance.now() > scaleFeedbackUntil) {
    scaleFeedback.visible = false;
    return;
  }
  const xrCamera = renderer.xr.getCamera(camera);
  const forward = xrCamera.getWorldDirection(new THREE.Vector3());
  const viewerPosition = xrCamera.getWorldPosition(new THREE.Vector3());
  scaleFeedback.position.copy(viewerPosition).addScaledVector(forward, 1.05).add(new THREE.Vector3(0, -0.22, 0));
  scaleFeedback.quaternion.copy(xrCamera.getWorldQuaternion(new THREE.Quaternion()));
}

const panel = new THREE.Group();
panel.visible = false;
panel.scale.setScalar(0.32);
scene.add(panel);

// Legacy floating menu-toggle meshes remain disabled; the physical left X
// controller button is polled directly through the WebXR gamepad input.
const menuToggleGroup = new THREE.Group();
menuToggleGroup.visible = false;
scene.add(menuToggleGroup);
const menuToggleHit = new THREE.Mesh(
  new THREE.BoxGeometry(0.66, 0.54, 0.10),
  new THREE.MeshBasicMaterial({ color: 0x145b59, transparent: true, opacity: 0.96, depthTest: false, depthWrite: false })
);
menuToggleHit.userData.action = "toggleMenu";
menuToggleGroup.add(menuToggleHit);
const menuToggleEdge = new THREE.LineSegments(
  new THREE.EdgesGeometry(new THREE.BoxGeometry(0.66, 0.54, 0.10)),
  new THREE.LineBasicMaterial({ color: 0x83e4d0, depthTest: false })
);
menuToggleGroup.add(menuToggleEdge);
const menuToggleBarMaterial = new THREE.MeshBasicMaterial({ color: 0xf3fbff, depthTest: false });
for (const y of [0.13, 0, -0.13]) {
  const bar = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.035, 0.018), menuToggleBarMaterial);
  bar.position.set(0, y, 0.065);
  menuToggleGroup.add(bar);
}

// World-space transform gizmo: double-ended arrows translate on X/Y/Z,
// circular rings rotate around X/Y/Z. Handles can be pinched directly.
const transformGizmo = new THREE.Group();
transformGizmo.visible = false;
// Keep the gizmo in scene space, not under worldGroup. It follows the selected
// object's world-space position, while its one-world-unit size is independent
// of the player's simulated scale and the workspace transform.
scene.add(transformGizmo);
const GIZMO_WORLD_SCALE = 1;
const gizmoHandles = [];
const gizmoPickMeshes = [];
const gizmoAxisColors = [0xff6868, 0x76e29a, 0x69aaff];
const worldAxes = [
  new THREE.Vector3(1, 0, 0),
  new THREE.Vector3(0, 1, 0),
  new THREE.Vector3(0, 0, 1)
];
function addGizmoMesh(mesh, handle) {
  mesh.userData.gizmoHandle = handle;
  transformGizmo.add(mesh);
  gizmoPickMeshes.push(mesh);
  return mesh;
}
worldAxes.forEach((axis, index) => {
  const color = gizmoAxisColors[index];
  const moveHandle = { kind: "translate", axis, axisIndex: index };

  // Visible shaft: widened so it is easy to see and target at VR scale.
  const shaft = new THREE.Mesh(
    new THREE.CylinderGeometry(0.025, 0.025, 1.12, 12),
    new THREE.MeshBasicMaterial({ color, depthTest: true })
  );
  shaft.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), axis);
  addGizmoMesh(shaft, moveHandle);

  [1, -1].forEach((direction) => {
    const tip = new THREE.Mesh(
      new THREE.ConeGeometry(0.065, 0.18, 12),
      new THREE.MeshBasicMaterial({ color, depthTest: true })
    );
    const directedAxis = axis.clone().multiplyScalar(direction);
    tip.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), directedAxis);
    tip.position.copy(directedAxis).multiplyScalar(0.64);
    addGizmoMesh(tip, moveHandle);
  });

  // Invisible long capsule-like cylinder. Controller rays can hit it even
  // when they miss the narrow visible shaft by several centimeters.
  const shaftPicker = new THREE.Mesh(
    new THREE.CylinderGeometry(0.13, 0.13, 1.55, 12),
    new THREE.MeshBasicMaterial({
      color: 0xffffff, transparent: true, opacity: 0, colorWrite: false,
      depthWrite: false, depthTest: false, side: THREE.DoubleSide
    })
  );
  shaftPicker.quaternion.copy(shaft.quaternion);
  addGizmoMesh(shaftPicker, moveHandle);

  // Larger invisible end-cap targets make the push/pull tips forgiving.
  [1, -1].forEach((direction) => {
    const capPicker = new THREE.Mesh(
      new THREE.SphereGeometry(0.16, 12, 8),
      new THREE.MeshBasicMaterial({
        color: 0xffffff, transparent: true, opacity: 0, colorWrite: false,
        depthWrite: false, depthTest: false
      })
    );
    capPicker.position.copy(axis).multiplyScalar(direction * 0.64);
    addGizmoMesh(capPicker, moveHandle);
  });

  const rotateHandle = { kind: "rotate", axis, axisIndex: index };
  const ring = new THREE.Mesh(
    new THREE.TorusGeometry(0.53, 0.019, 12, 128),
    new THREE.MeshBasicMaterial({ color, depthTest: false, side: THREE.DoubleSide })
  );
  ring.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), axis);
  ring.renderOrder = 5;
  addGizmoMesh(ring, rotateHandle);

  const ringPicker = new THREE.Mesh(
    new THREE.TorusGeometry(0.53, 0.12, 10, 96),
    new THREE.MeshBasicMaterial({
      color: 0xffffff, transparent: true, opacity: 0, colorWrite: false,
      depthWrite: false, depthTest: false, side: THREE.DoubleSide
    })
  );
  ringPicker.quaternion.copy(ring.quaternion);
  addGizmoMesh(ringPicker, rotateHandle);

  const axisLabel = new THREE.Sprite(new THREE.SpriteMaterial({
    map: makeCanvasTexture(["X", "Y", "Z"][index], { width: 128, height: 128, fontSize: 100, color: "#ffffff" }),
    transparent: true,
    depthTest: true
  }));
  axisLabel.scale.set(0.13, 0.13, 1);
  axisLabel.position.copy(axis).multiplyScalar(0.88);
  transformGizmo.add(axisLabel);
});
const gizmoCenter = new THREE.Mesh(
  new THREE.SphereGeometry(0.045, 12, 8),
  new THREE.MeshBasicMaterial({ color: 0xf5f7fa })
);
transformGizmo.add(gizmoCenter);
for (const mesh of gizmoPickMeshes) gizmoHandles.push(mesh.userData.gizmoHandle);
function updateTransformGizmo() {
  if (!selected || !nodes.includes(selected)) {
    transformGizmo.visible = false;
    return;
  }
  worldGroup.updateWorldMatrix(true, false);
  selected.group.updateWorldMatrix(true, false);

  // The gizmo is a direct child of scene, so worldGroup scale cannot affect
  // its dimensions. Follow only the selected object's world-space position;
  // keep the handles aligned to fixed world XYZ and at a constant physical size.
  const selectedWorldPosition = selected.group.getWorldPosition(new THREE.Vector3());
  // Since transformGizmo is a direct child of scene, this is the exact
  // world-space target and its scale never inherits worldGroup scaling.
  transformGizmo.position.copy(selectedWorldPosition);
  transformGizmo.quaternion.identity();
  transformGizmo.scale.setScalar(GIZMO_WORLD_SCALE);
  transformGizmo.visible = Boolean(renderer.xr.isPresenting && gizmoEnabled);
  transformGizmo.updateMatrixWorld(true);
}

function validItemID(id) {
  return /^item_[a-z0-9_-]{1,48}$/i.test(String(id || "").trim());
}
function makeItem(id) {
  return {
    itemID: id,
    jsonData: "",
    stashPos: 0,
    children: [],
    stuckChildren: [],
    grabPos: [0, 0, 0],
    grabRot: [0, 0, 0, 1],
    state: 0,
    ammo: 0,
    isBlueprint: true,
    scaleModifier: 0,
    colorHue: 0,
    colorSaturation: 0,
    jellyStrength: 0,
    stashRow: 0,
    stashCol: 0
  };
}
function colorFor(id) {
  let h = 0;
  for (const c of id) h = (h * 31 + c.charCodeAt(0)) | 0;
  return new THREE.Color().setHSL((Math.abs(h) % 360) / 360, 0.48, 0.53);
}
function makeCanvasTexture(text, options = {}) {
  const canvas = document.createElement("canvas");
  canvas.width = options.width || 512;
  canvas.height = options.height || 160;
  const ctx = canvas.getContext("2d");
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = options.color || "#f5f8fb";
  ctx.font = `${options.weight || "700"} ${options.fontSize || 52}px system-ui, sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  const maxWidth = canvas.width - 24;
  let display = String(text);
  while (ctx.measureText(display).width > maxWidth && display.length > 4) display = display.slice(0, -2) + "…";
  ctx.fillText(display, canvas.width / 2, canvas.height / 2, maxWidth);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.needsUpdate = true;
  return texture;
}
function makeAspectCanvasTexture(text, aspectRatio, fontSize = 42, color = "#f5f8fb", maxLongSide = 2048) {
  // Match the canvas aspect ratio to the exact 3D plane ratio. The previous
  // fixed 512x160 canvas stretched every label differently in the headset.
  const aspect = THREE.MathUtils.clamp(Number(aspectRatio) || 1, 0.45, 24);
  const canvas = document.createElement("canvas");
  if (aspect >= 1) {
    canvas.width = maxLongSide;
    canvas.height = Math.max(96, Math.round(maxLongSide / aspect));
  } else {
    canvas.height = maxLongSide;
    canvas.width = Math.max(96, Math.round(maxLongSide * aspect));
  }
  const ctx = canvas.getContext("2d");
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = color;
  // Preserve the old visual text size relative to the canvas height while
  // increasing raster resolution for sharper rendering at Quest viewing distance.
  const scaledFontSize = Math.max(12, fontSize * (canvas.height / 160));
  ctx.font = `700 ${scaledFontSize}px system-ui, sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.imageSmoothingEnabled = true;
  const maxWidth = canvas.width - Math.max(16, canvas.width * 0.035);
  let display = String(text);
  while (ctx.measureText(display).width > maxWidth && display.length > 4) {
    display = display.slice(0, -2) + "…";
  }
  ctx.fillText(display, canvas.width / 2, canvas.height / 2, maxWidth);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.generateMipmaps = true;
  texture.anisotropy = Math.min(4, renderer.capabilities.getMaxAnisotropy());
  texture.needsUpdate = true;
  return texture;
}
function addPanelText(text, x, y, width, height, fontSize = 42, color = "#f5f8fb") {
  const mesh = new THREE.Mesh(
    new THREE.PlaneGeometry(width, height),
    new THREE.MeshBasicMaterial({
      map: makeAspectCanvasTexture(text, width / height, fontSize, color, 2048),
      transparent: true,
      depthWrite: false,
      toneMapped: false
    })
  );
  mesh.position.set(x, y, 0.025);
  panel.add(mesh);
  return mesh;
}
function addButton(label, action, x, y, width = 0.34, height = 0.15, tone = "normal") {
  const tones = {
    normal: [0x29404e, 0x6b8798],
    good: [0x176c65, 0x50c4ac],
    danger: [0x542c35, 0xb55e70],
    muted: [0x303c45, 0x71818b],
    active: [0x1b504d, 0x67dbc5]
  };
  const [base, edge] = tones[tone] || tones.normal;
  const button = new THREE.Mesh(
    new THREE.BoxGeometry(width, height, 0.045),
    new THREE.MeshBasicMaterial({ color: base })
  );
  button.position.set(x, y, 0.035);
  button.userData.action = action;
  button.add(new THREE.LineSegments(
    new THREE.EdgesGeometry(new THREE.BoxGeometry(width, height, 0.045)),
    new THREE.LineBasicMaterial({ color: edge })
  ));
  const face = new THREE.Mesh(
    new THREE.PlaneGeometry(width * 0.94, height * 0.76),
    new THREE.MeshBasicMaterial({
      map: makeAspectCanvasTexture(label, (width * 0.94) / (height * 0.76), 54, "#f5f8fb", 1024),
      transparent: true,
      depthWrite: false,
      toneMapped: false
    })
  );
  face.position.z = 0.024;
  button.add(face);
  panel.add(button);
  uiButtons.push(button);
  return button;
}
function clearPanel() {
  for (const child of [...panel.children]) {
    child.traverse?.((obj) => {
      if (obj.geometry) obj.geometry.dispose();
      if (obj.material) {
        const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
        for (const mat of mats) {
          if (mat.map) mat.map.dispose();
          mat.dispose();
        }
      }
    });
  }
  panel.clear();
  uiButtons.length = 0;
}
function drawPanelBackground(title) {
  const bg = new THREE.Mesh(
    new THREE.PlaneGeometry(1.68, 2.12),
    new THREE.MeshBasicMaterial({ color: 0x101e28, transparent: true, opacity: 0.96, depthWrite: false })
  );
  bg.position.z = -0.015;
  panel.add(bg);
  addPanelText(title, 0, 0.86, 1.55, 0.14, 42);
  addPanelText(statusText, 0, 0.68, 1.53, 0.09, 23, "#9ee5d1");
  addPanelText(`${SITE_VERSION} · BUILD ${SITE_BUILD_ID}`, 0, -1.025, 1.48, 0.055, 14, "#83d9c7");
}
function drawMainPanel() {
  clearPanel();
  const chosen = selected ? selected.item.itemID : "Nothing selected";
  drawPanelBackground("GOOP VR BUILDER");
  addPanelText(chosen, 0, 0.55, 1.52, 0.10, 31, "#d6e5ed");

  addButton("NEW ROOT", "newRoot", -0.53, 0.36, 0.48, 0.15, "good");
  addButton("ADD PART", "addPart", 0, 0.36, 0.48, 0.15, "good");
  addButton("DELETE", "delete", 0.53, 0.36, 0.48, 0.15, "danger");

  addButton("EDIT ID", "editID", -0.53, 0.15, 0.48, 0.15);
  addButton("EXPORT", "export", 0, 0.15, 0.48, 0.15, "good");
  addButton("IMPORT", "import", 0.53, 0.15, 0.48, 0.15);

  if (gizmoEnabled) {
    addPanelText("GIZMO ON · FULL EDIT MODE", 0, -0.04, 1.48, 0.09, 25, "#91e3c4");
    addPanelText("ARROWS · MOVE XYZ", 0, -0.20, 1.50, 0.09, 23, "#ffcf8a");
    addPanelText("CIRCLES · ROTATE XYZ", 0, -0.34, 1.50, 0.09, 23, "#a9c2cf");
    addPanelText("HOLD ITEM + BOTH GRIPS · SCALE ITEM", 0, -0.49, 1.55, 0.07, 17, "#a9c2cf");
    addPanelText("EMPTY HANDS + BOTH GRIPS · PLAYER SIZE", 0, -0.59, 1.55, 0.07, 16, "#a9c2cf");
    addButton("SCALE −", "scale:-1", -0.38, -0.73, 0.48, 0.13);
    addButton("SCALE +", "scale:1", 0.15, -0.73, 0.48, 0.13);
  } else {
    addPanelText("GIZMO OFF · OBJECT-ONLY MODE", 0, -0.04, 1.48, 0.09, 25, "#91e3c4");
    addPanelText("HOLD ONE GRIP NEAR A PART TO PICK IT UP", 0, -0.22, 1.55, 0.08, 19, "#ffcf8a");
    addPanelText("KEEP HOLDING · GRIP WITH OTHER HAND", 0, -0.37, 1.55, 0.08, 19, "#a9c2cf");
    addPanelText("PULL APART / PUSH TOGETHER TO RESIZE", 0, -0.51, 1.55, 0.08, 19, "#a9c2cf");
    addPanelText("PLAYER SCALING + GIZMO HANDLES DISABLED", 0, -0.65, 1.58, 0.07, 15, "#dfb18b");
  }
  addButton("SNAP SETTINGS", "snapSettings", 0, -0.87, 0.92, 0.11, "active");
}
function drawSnapSettingsPanel() {
  clearPanel();
  drawPanelBackground("SNAP SETTINGS");
  addPanelText("POSITION SNAP", 0, 0.52, 1.40, 0.09, 28, "#ffcf8a");
  addButton(snapConfig.positionEnabled ? "POSITION: ON" : "POSITION: OFF", "snapPositionToggle", 0, 0.36, 0.90, 0.13, snapConfig.positionEnabled ? "active" : "muted");
  addPanelText(`GRID STEP · ${snapConfig.positionStep.toFixed(3)} m`, 0, 0.16, 1.50, 0.09, 26);
  addButton("STEP −", "positionStepDown", -0.49, -0.01, 0.38, 0.13);
  addButton("CUSTOM", "positionStepCustom", 0, -0.01, 0.38, 0.13, "active");
  addButton("STEP +", "positionStepUp", 0.49, -0.01, 0.38, 0.13);

  addPanelText("ROTATION SNAP", 0, -0.22, 1.40, 0.09, 28, "#9ecbff");
  addButton(snapConfig.rotationEnabled ? "ROTATION: ON" : "ROTATION: OFF", "snapRotationToggle", 0, -0.37, 0.90, 0.13, snapConfig.rotationEnabled ? "active" : "muted");
  addPanelText(`ANGLE STEP · ${snapConfig.rotationStepDegrees.toFixed(1)}°`, 0, -0.57, 1.50, 0.09, 25);
  addButton("ANGLE −", "rotationStepDown", -0.49, -0.71, 0.38, 0.13);
  addButton("CUSTOM", "rotationStepCustom", 0, -0.71, 0.38, 0.13, "active");
  addButton("ANGLE +", "rotationStepUp", 0.49, -0.71, 0.38, 0.13);
  addButton("TEST SFX", "testSfx", -0.42, -0.89, 0.70, 0.11, "active");
  addButton("BACK", "snapBack", 0.42, -0.89, 0.70, 0.11, "muted");
}
function drawSnapValueKeyboard() {
  clearPanel();
  drawPanelBackground(snapValueTarget === "position" ? "CUSTOM GRID STEP" : "CUSTOM ANGLE STEP");
  const suffix = snapValueTarget === "position" ? "m" : "°";
  addPanelText(`${snapValueDraft || "0"} ${suffix}`, 0, 0.51, 1.50, 0.12, 38, "#f8df9a");
  const rows = [["1", "2", "3"], ["4", "5", "6"], ["7", "8", "9"]];
  rows.forEach((row, r) => row.forEach((digit, c) => {
    addButton(digit, `snapKey:${digit}`, (c - 1) * 0.48, 0.25 - r * 0.20, 0.38, 0.15);
  }));
  addButton(".", "snapKey:.", -0.48, -0.39, 0.38, 0.15);
  addButton("0", "snapKey:0", 0, -0.39, 0.38, 0.15);
  addButton("⌫", "snapKeyBack", 0.48, -0.39, 0.38, 0.15, "muted");
  addButton("CLEAR", "snapKeyClear", -0.43, -0.67, 0.42, 0.14, "muted");
  addButton("CANCEL", "snapKeyCancel", 0, -0.67, 0.42, 0.14, "danger");
  addButton("DONE", "snapKeyDone", 0.43, -0.67, 0.42, 0.14, "good");
}
function drawKeyboardPanel() {
  clearPanel();
  drawPanelBackground("EDIT ITEM ID");
  addPanelText(keyboardDraft, 0, 0.54, 1.52, 0.13, 38, "#f8df9a");
  const chars = "abcdefghijklmnopqrstuvwxyz0123456789_-".split("");
  const cols = 8;
  chars.forEach((ch, i) => {
    const row = Math.floor(i / cols);
    const col = i % cols;
    const x = (col - (cols - 1) / 2) * 0.19;
    const y = 0.30 - row * 0.17;
    addButton(ch.toUpperCase(), `key:${ch}`, x, y, 0.17, 0.135);
  });
  addButton("BACK", "keyBack", -0.52, -0.67, 0.31, 0.15, "muted");
  addButton("CLEAR", "keyClear", -0.17, -0.67, 0.31, 0.15, "muted");
  addButton("CANCEL", "keyCancel", 0.18, -0.67, 0.31, 0.15, "danger");
  addButton("DONE", "keyDone", 0.53, -0.67, 0.31, 0.15, "good");
  addPanelText("The item_ prefix is added automatically", 0, -0.88, 1.5, 0.08, 22, "#a9c2cf");
}
function redrawPanel() {
  if (!panelReady) return;
  if (keyboardOpen) drawKeyboardPanel();
  else if (snapValueKeyboardOpen) drawSnapValueKeyboard();
  else if (snapSettingsOpen) drawSnapSettingsPanel();
  else drawMainPanel();
}
function setStatus(text) {
  statusText = String(text);
  if (panelReady) redrawPanel();
  const statusEl = $("landingStatus");
  if (statusEl) statusEl.textContent = statusText;
}

const SFX_FILES = {
  hover: "data:audio/mpeg;base64,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",
  click: "data:audio/mpeg;base64,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2qOTK1CggcdHS3rWWWwyNZZmTScWUWaUWZcbm1NOzlFlHGnGlHmXGJIkjRQGIPPMuNmnZrxaJxpRZZR8XlTVO15uf7NScW1xmykacWYfcaikacWUUfFo1LO8blSzxiSJKUxKSxyPyWYlcso5bKpmampmgoZivUr0EqlMNRGAoNiEbfh5WnLtUyTRTKSlScQIjAR0CHqTiW6cimati+1gVVlKU9kyUpkn0OhAMLHC6AskVUSLHFCFIIkFYkrSogqnGBIC0VFL1uKfZMsVTJNFN5P9PRU6kEkUARcEKiERyEz/86TE4T0kOKgEGbE8MnCwi3aQ6SCUQYEAgBCRVhYeSOVMQU1FMy4xMDBVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVU=",
  snapIn: "data:audio/mpeg;base64,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",
  snapOut: "data:audio/mpeg;base64,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",
 };
const htmlAudio = Object.create(null);
let audioFailures = [];
let queuedSfx = [];
let audioPrimeStarted = false;

function startDecodedSfx(name) {
  if (!audioContext || !audioBuffers[name]) return false;
  const start = () => {
    try {
      const source = audioContext.createBufferSource();
      const gain = audioContext.createGain();
      gain.gain.value = name === "hover" ? 0.7 : 0.85;
      source.buffer = audioBuffers[name];
      source.connect(gain);
      gain.connect(audioContext.destination);
      source.start(0);
    } catch (error) {
      console.warn(`WebAudio playback failed for ${name}:`, error);
      playHtmlAudio(name);
    }
  };
  if (audioContext.state === "running") start();
  else audioContext.resume().then(start).catch((error) => {
    console.warn(`AudioContext resume failed for ${name}:`, error);
    playHtmlAudio(name);
  });
  return true;
}

function playHtmlAudio(name) {
  const audio = htmlAudio[name];
  if (!audio) return false;
  try {
    audio.pause();
    audio.currentTime = 0;
    audio.muted = false;
    const result = audio.play();
    if (result && typeof result.catch === "function") {
      result.catch((error) => console.warn(`HTML audio playback blocked for ${name}:`, error));
    }
    return true;
  } catch (error) {
    console.warn(`HTML audio playback failed for ${name}:`, error);
    return false;
  }
}

function warmAudio() {
  // Create and prime audio directly from the ENTER VR click. The clips are
  // embedded in app.js, so there are no external asset requests to go missing.
  for (const [name, dataUrl] of Object.entries(SFX_FILES)) {
    if (!htmlAudio[name]) {
      const audio = new Audio(dataUrl);
      audio.preload = "auto";
      audio.playsInline = true;
      audio.volume = name === "hover" ? 0.7 : 0.85;
      htmlAudio[name] = audio;
      audio.load();
    }
  }

  const AudioCtx = window.AudioContext || window.webkitAudioContext;
  if (AudioCtx) {
    if (!audioContext) audioContext = new AudioCtx();
    // Resume synchronously from the trusted ENTER VR click to unlock Quest audio.
    audioContext.resume().catch((error) => console.warn("AudioContext resume failed:", error));
    if (!audioLoadPromise) {
      audioLoadPromise = Promise.all(Object.entries(SFX_FILES).map(async ([name, dataUrl]) => {
        try {
          const response = await fetch(dataUrl);
          if (!response.ok) throw new Error(`Could not read embedded ${name} clip`);
          const bytes = await response.arrayBuffer();
          audioBuffers[name] = await audioContext.decodeAudioData(bytes);
        } catch (error) {
          audioFailures.push(name);
          console.warn(`Could not decode ${name}; HTML audio fallback will be used.`, error);
        }
      })).then(() => {
        const pending = queuedSfx;
        queuedSfx = [];
        for (const name of pending) {
          if (audioBuffers[name] && audioContext) startDecodedSfx(name);
          else playHtmlAudio(name);
        }
      });
    }
  } else {
    audioLoadPromise = Promise.resolve();
  }

  // Prime each media element while the ENTER VR user activation is live.
  // Muted priming is inaudible; later playback is unmuted.
  if (!audioPrimeStarted) {
    audioPrimeStarted = true;
    for (const audio of Object.values(htmlAudio)) {
      audio.muted = true;
      const priming = audio.play();
      if (priming && typeof priming.then === "function") {
        priming.then(() => {
          audio.pause();
          audio.currentTime = 0;
          audio.muted = false;
        }).catch((error) => {
          audio.muted = false;
          console.warn("HTML audio could not be primed:", error);
        });
      } else {
        audio.pause();
        audio.currentTime = 0;
        audio.muted = false;
      }
    }
  }
  return audioLoadPromise;
}

function playSfx(name) {
  if (!SFX_FILES[name]) return;
  if (audioContext && audioBuffers[name]) {
    startDecodedSfx(name);
    return;
  }
  if (audioLoadPromise && audioContext) {
    // Wait for the first decode instead of mistaking a pending/rejected
    // HTMLAudio.play() promise for successful playback.
    queuedSfx.push(name);
    return;
  }
  playHtmlAudio(name);
}

function setHoveredButton(button) {
  const action = button?.userData?.action ?? null;
  const now = performance.now();

  // Start timing a new candidate. Do not play on the first noisy tracking frame.
  if (action !== hoverCandidateAction) {
    hoverCandidateAction = action;
    hoverCandidateSince = now;
    return;
  }

  // Require a sustained exit before allowing the same button to sound again.
  if (action === null) {
    if (lastHoverActionPlayed !== null && now - hoverCandidateSince >= HOVER_EXIT_RESET_MS) {
      lastHoverActionPlayed = null;
    }
    return;
  }

  // One hover sound per stable button entry, even if the hit mesh is recreated.
  if (action === lastHoverActionPlayed) return;
  if (now - hoverCandidateSince < HOVER_DWELL_MS) return;
  if (now - lastHoverSfxTime < HOVER_GLOBAL_COOLDOWN_MS) return;

  lastHoverActionPlayed = action;
  lastHoverSfxTime = now;
  playSfx("hover");
}
function roundToStep(value, step) {
  if (!Number.isFinite(step) || step <= 0) return value;
  return Math.round(value / step) * step;
}
function snapWorldPosition(position) {
  if (!snapConfig.positionEnabled) return position;
  const step = snapConfig.positionStep;
  return new THREE.Vector3(
    roundToStep(position.x, step),
    roundToStep(position.y, step),
    roundToStep(position.z, step)
  );
}
function snapLocalEuler(quaternion) {
  if (!snapConfig.rotationEnabled) return quaternion;
  const step = THREE.MathUtils.degToRad(snapConfig.rotationStepDegrees);
  const euler = new THREE.Euler().setFromQuaternion(quaternion, "XYZ");
  euler.set(roundToStep(euler.x, step), roundToStep(euler.y, step), roundToStep(euler.z, step), "XYZ");
  return new THREE.Quaternion().setFromEuler(euler).normalize();
}
function setNodeWorldPosition(node, worldPosition) {
  const parent = node.group.parent;
  parent.updateWorldMatrix(true, false);
  const inverseParent = parent.matrixWorld.clone().invert();
  node.position.copy(worldPosition.clone().applyMatrix4(inverseParent));
  syncMesh(node);
}
function applyObjectDrag(node, proxy, offset, lockedLocalQuaternion = null) {
  const desiredWorld = new THREE.Matrix4().copy(proxy.matrixWorld).multiply(offset);
  const worldPosition = new THREE.Vector3();
  const worldQuaternion = new THREE.Quaternion();
  const worldScale = new THREE.Vector3();
  desiredWorld.decompose(worldPosition, worldQuaternion, worldScale);
  const snappedWorldPosition = snapWorldPosition(worldPosition);
  desiredWorld.compose(snappedWorldPosition, worldQuaternion, worldScale);

  const parent = node.group.parent;
  parent.updateWorldMatrix(true, false);
  const local = parent.matrixWorld.clone().invert().multiply(desiredWorld);
  local.decompose(node.position, node.quaternion, new THREE.Vector3());
  // In B/gizmo-off object-only mode, a direct pickup moves the item with the
  // controller but does not twist it. Rotation is available again with B on.
  if (lockedLocalQuaternion) node.quaternion.copy(lockedLocalQuaternion);
  else if (snapConfig.rotationEnabled) node.quaternion.copy(snapLocalEuler(node.quaternion));
  node.group.position.copy(node.position);
  node.group.quaternion.copy(node.quaternion);
  updateTransformGizmo();
}
function nodeWorldQuaternion(node) {
  node.group.updateWorldMatrix(true, false);
  return node.group.getWorldQuaternion(new THREE.Quaternion());
}
function snapValueOpen(target) {
  snapValueTarget = target;
  snapValueDraft = target === "position" ? String(snapConfig.positionStep) : String(snapConfig.rotationStepDegrees);
  snapValueKeyboardOpen = true;
  redrawPanel();
}
function handleSnapValueAction(action) {
  if (action.startsWith("snapKey:")) {
    const char = action.slice(8);
    if (char !== "." || !snapValueDraft.includes(".")) {
      if (snapValueDraft.length < 9) snapValueDraft += char;
    }
  } else if (action === "snapKeyBack") {
    snapValueDraft = snapValueDraft.slice(0, -1);
  } else if (action === "snapKeyClear") {
    snapValueDraft = "";
  } else if (action === "snapKeyCancel") {
    snapValueKeyboardOpen = false;
  } else if (action === "snapKeyDone") {
    const value = Number(snapValueDraft);
    const valid = Number.isFinite(value) && (snapValueTarget === "position" ? value >= 0.001 && value <= 10 : value >= 0.1 && value <= 180);
    if (!valid) {
      setStatus(snapValueTarget === "position" ? "Grid step must be between 0.001 and 10 meters." : "Angle step must be between 0.1° and 180°.");
      return;
    }
    if (snapValueTarget === "position") snapConfig.positionStep = value;
    else snapConfig.rotationStepDegrees = value;
    snapValueKeyboardOpen = false;
    setStatus(`Custom ${snapValueTarget} snap step saved: ${value}.`);
  }
  redrawPanel();
}
function nodeGroup(node) { return node.parent ? node.parent.group : rootGroup; }
function syncMesh(node) {
  node.group.position.copy(node.position);
  node.group.quaternion.copy(node.quaternion);
  node.mesh.scale.setScalar(Math.max(0.01, 1 + Number(node.item.scaleModifier || 0) / 128));
  if (node === selected) updateTransformGizmo();
}
function makeVisual(node) {
  const geo = new THREE.BoxGeometry(0.28, 0.28, 0.28);
  const mat = new THREE.MeshBasicMaterial({ color: colorFor(node.item.itemID) });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.userData.node = node;
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  const edges = new THREE.LineSegments(new THREE.EdgesGeometry(geo), new THREE.LineBasicMaterial({ color: 0x10202b }));
  mesh.add(edges);
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: makeCanvasTexture(node.item.itemID.replace(/^item_/, ""), { width: 512, height: 96, fontSize: 48 }), transparent: false }));
  sprite.scale.set(0.9, 0.17, 1);
  sprite.position.y = 0.25;
  mesh.add(sprite);
  node.mesh = mesh;
  node.labelSprite = sprite;
  nodeGroup(node).add(node.group);
  node.group.add(mesh);
  syncMesh(node);
}
function createNode(item, parent = null, position = null) {
  const node = {
    uid: nextId++, item, parent, children: [],
    position: position ? new THREE.Vector3(...position) : new THREE.Vector3(parent ? 0.35 : 0, parent ? 0.15 : 1.1, 0),
    quaternion: new THREE.Quaternion(), group: new THREE.Group(), mesh: null, labelSprite: null
  };
  node.group.name = item.itemID;
  (parent ? parent.group : rootGroup).add(node.group);
  if (parent) parent.children.push(node);
  nodes.push(node);
  makeVisual(node);
  return node;
}
function refreshNodeID(node, id) {
  node.item.itemID = id;
  node.group.name = id;
  node.mesh.material.color.copy(colorFor(id));
  const oldMap = node.labelSprite.material.map;
  node.labelSprite.material.map = makeCanvasTexture(id.replace(/^item_/, ""), { width: 512, height: 96, fontSize: 48 });
  oldMap?.dispose();
}
function serializeNode(node) {
  const item = structuredClone(node.item);
  item.children = [];
  item.stuckChildren = node.children.map((child) => {
    const nested = serializeNode(child);
    const p = child.position;
    const q = child.quaternion;
    return {
      item: nested,
      subParentID: 0,
      pos: [round(p.x), round(p.y), round(p.z)],
      rot: [round(q.x), round(q.y), round(q.z), round(q.w)],
      posePos: [0, 0, 0],
      poseRot: [0, 0, 0, 1],
      wasDynamicStuck: false
    };
  });
  return item;
}
function round(n) { return Math.round(n * 10000) / 10000; }
function disposeBuild() {
  for (const n of nodes) {
    n.mesh?.geometry?.dispose();
    n.mesh?.material?.dispose();
    if (n.labelSprite?.material?.map) n.labelSprite.material.map.dispose();
    n.labelSprite?.material?.dispose();
  }
  rootGroup.clear();
  nodes = [];
  selected = null;
  transformGizmo.visible = false;
  nextId = 1;
}
function choose(node) {
  selected = node;
  if (node) pendingItemID = node.item.itemID;
  updateTransformGizmo();
  redrawPanel();
}
function exportBuild() {
  const root = nodes.find((n) => !n.parent);
  if (!root) { setStatus("Add a root item before exporting."); return; }
  const blob = new Blob([JSON.stringify(serializeNode(root), null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${root.item.itemID || "goop_build"}.json`;
  a.style.display = "none";
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1500);
  setStatus("Export requested. Check Quest Browser downloads.");
}
function importBuild(raw) {
  const root = raw?.itemID ? raw : (Array.isArray(raw?.items) ? raw.items[0] : null);
  if (!root?.itemID) throw new Error("This JSON has no root itemID.");
  if (!validItemID(root.itemID)) throw new Error("The root item ID is not in the expected item_name format.");
  disposeBuild();
  function walk(item, parent = null, edge = null) {
    if (!item || !validItemID(item.itemID)) return null;
    const pos = edge?.pos || (!parent ? [0, 1.1, 0] : [0.3, 0.1, 0]);
    const node = createNode(structuredClone(item), parent, pos);
    if (edge?.rot?.length === 4) node.quaternion.set(...edge.rot);
    node.item.stuckChildren = [];
    node.item.children = [];
    for (const childEdge of (item.stuckChildren || [])) if (childEdge?.item) walk(childEdge.item, node, childEdge);
    syncMesh(node);
    return node;
  }
  const first = walk(root);
  choose(first);
  setStatus("Imported. Select an item to keep editing in VR.");
}
function openIDKeyboard() {
  keyboardDraft = selected?.item.itemID || pendingItemID || "item_crate";
  if (!keyboardDraft.startsWith("item_")) keyboardDraft = "item_" + keyboardDraft;
  keyboardOpen = true;
  redrawPanel();
}
function handleKeyboardAction(action) {
  if (action.startsWith("key:")) {
    const ch = action.slice(4);
    if (keyboardDraft.length < 53) keyboardDraft += ch;
  } else if (action === "keyBack") {
    if (keyboardDraft.length > 5) keyboardDraft = keyboardDraft.slice(0, -1);
  } else if (action === "keyClear") {
    keyboardDraft = "item_";
  } else if (action === "keyCancel") {
    keyboardOpen = false;
  } else if (action === "keyDone") {
    if (!validItemID(keyboardDraft)) { setStatus("Use letters, numbers, _ or - after item_."); return; }
    pendingItemID = keyboardDraft;
    if (selected) refreshNodeID(selected, keyboardDraft);
    keyboardOpen = false;
    setStatus(`Item ID set to ${keyboardDraft}.`);
  }
  redrawPanel();
}
function nudgeMove(index) {
  if (!selected) { setStatus("Select an item first."); return; }
  const axisIndex = Math.floor(index / 2);
  const amount = (index % 2 === 0 ? -1 : 1) * (snapConfig.positionEnabled ? snapConfig.positionStep : 0.05);
  selected.group.updateWorldMatrix(true, false);
  const worldPosition = selected.group.getWorldPosition(new THREE.Vector3());
  worldPosition.setComponent(axisIndex, worldPosition.getComponent(axisIndex) + amount);
  setNodeWorldPosition(selected, snapWorldPosition(worldPosition));
  redrawPanel();
}
function nudgeRotate(index) {
  if (!selected) { setStatus("Select an item first."); return; }
  const axisIndex = Math.floor(index / 2);
  const sign = index % 2 === 0 ? -1 : 1;
  const requested = THREE.MathUtils.degToRad(snapConfig.rotationEnabled ? snapConfig.rotationStepDegrees : 15) * sign;
  const angle = snapConfig.rotationEnabled ? roundToStep(requested, THREE.MathUtils.degToRad(snapConfig.rotationStepDegrees)) : requested;
  const axis = worldAxes[axisIndex].clone();
  selected.group.updateWorldMatrix(true, false);
  const parent = selected.group.parent;
  parent.updateWorldMatrix(true, false);
  const parentQ = parent.getWorldQuaternion(new THREE.Quaternion());
  const worldQ = selected.group.getWorldQuaternion(new THREE.Quaternion());
  const desiredWorldQ = new THREE.Quaternion().setFromAxisAngle(axis, angle).multiply(worldQ).normalize();
  selected.quaternion.copy(parentQ.invert().multiply(desiredWorldQ).normalize());
  syncMesh(selected);
  redrawPanel();
}
function setMenuVisible(visible) {
  menuVisible = Boolean(visible);
  panel.visible = menuVisible;
  if (menuVisible && panelReady) redrawPanel();
  if (menuVisible) {
    setStatus("Editor menu opened.");
  } else {
    setStatus("Editor menu hidden. Press X on the left controller to reopen it.");
  }
}

function visibleMenuPickTargets() {
  // Menu visibility is controlled by the physical X button on the left Quest
  // controller, not by a floating wrist button in the scene.
  return menuVisible ? [...uiButtons] : [];
}

function runAction(action) {
  playSfx("click");
  if (action === "toggleMenu") {
    setMenuVisible(!menuVisible);
    return;
  }
  if (action.startsWith("key") || action.startsWith("key:")) { handleKeyboardAction(action); return; }
  if (action.startsWith("snapKey") || action.startsWith("snapKey:")) { handleSnapValueAction(action); return; }
  if (snapValueKeyboardOpen) return;
  if (action === "testSfx") {
    // Plays the four supplied clips in sequence so the user can verify that
    // every asset is being found and that Quest Browser audio is unlocked.
    playSfx("hover");
    setTimeout(() => playSfx("click"), 180);
    setTimeout(() => playSfx("snapOut"), 360);
    setTimeout(() => playSfx("snapIn"), 540);
    setStatus("Sound test: hover, click, snap-out, snap-in.");
    return;
  }
  if (action === "snapSettings") {
    snapSettingsOpen = true;
    redrawPanel();
    return;
  }
  if (action === "snapBack") {
    snapSettingsOpen = false;
    redrawPanel();
    return;
  }
  if (action === "snapPositionToggle") {
    snapConfig.positionEnabled = !snapConfig.positionEnabled;
    playSfx(snapConfig.positionEnabled ? "snapIn" : "snapOut");
    setStatus(`Position snapping ${snapConfig.positionEnabled ? "enabled" : "disabled"}.`);
    return;
  }
  if (action === "snapRotationToggle") {
    snapConfig.rotationEnabled = !snapConfig.rotationEnabled;
    playSfx(snapConfig.rotationEnabled ? "snapIn" : "snapOut");
    setStatus(`Rotation snapping ${snapConfig.rotationEnabled ? "enabled" : "disabled"}.`);
    return;
  }
  if (action === "positionStepCustom") { snapValueOpen("position"); return; }
  if (action === "rotationStepCustom") { snapValueOpen("rotation"); return; }
  if (action === "positionStepDown" || action === "positionStepUp") {
    const factor = action.endsWith("Down") ? 0.5 : 2;
    snapConfig.positionStep = Math.max(0.001, Math.min(10, Number((snapConfig.positionStep * factor).toFixed(4))));
    redrawPanel();
    return;
  }
  if (action === "rotationStepDown" || action === "rotationStepUp") {
    const factor = action.endsWith("Down") ? 0.5 : 2;
    snapConfig.rotationStepDegrees = Math.max(0.1, Math.min(180, Number((snapConfig.rotationStepDegrees * factor).toFixed(2))));
    redrawPanel();
    return;
  }
  if (keyboardOpen) return;
  if (action === "newRoot") {
    if (nodes.some((n) => !n.parent)) { setStatus("A root already exists. Import a different build to replace it."); return; }
    if (!validItemID(pendingItemID)) pendingItemID = "item_crate";
    choose(createNode(makeItem(pendingItemID), null, [0, 1.1, 0.45]));
    setStatus("Root created. Select it to show the XYZ movement and rotation gizmos.");
  } else if (action === "addPart") {
    if (!selected) { setStatus("Select the parent item before adding a part."); return; }
    const child = createNode(makeItem(pendingItemID), selected, [0.35, 0.15, 0]);
    choose(child);
    setStatus("Part attached to the selected parent.");
  } else if (action === "delete") {
    if (!selected) { setStatus("Select a part first."); return; }
    if (!selected.parent) { setStatus("The root cannot be deleted. Import another build to replace it."); return; }
    const parent = selected.parent;
    const doomed = [];
    const collect = (n) => { doomed.push(n); n.children.forEach(collect); };
    collect(selected);
    parent.children = parent.children.filter((n) => n !== selected);
    for (const n of doomed) {
      n.group.parent?.remove(n.group);
      nodes = nodes.filter((x) => x !== n);
    }
    choose(parent);
    setStatus("Selected part and its attached children deleted.");
  } else if (action === "editID") {
    openIDKeyboard();
  } else if (action === "export") {
    exportBuild();
  } else if (action === "import") {
    setStatus("Choose an invention JSON file in the Quest file picker.");
    $("fileInput").click();
  } else if (action.startsWith("move:")) {
    nudgeMove(Number(action.split(":")[1]));
  } else if (action.startsWith("rotate:")) {
    nudgeRotate(Number(action.split(":")[1]));
  } else if (action.startsWith("scale:")) {
    if (!gizmoEnabled) { setStatus("Gizmo off: pick up the item and use both controller grips to resize it."); return; }
    if (!selected) { setStatus("Select an item first."); return; }
    selected.item.scaleModifier = Math.max(-127, Math.min(127, Number(selected.item.scaleModifier || 0) + Number(action.split(":")[1])));
    syncMesh(selected);
    setStatus(`Scale modifier: ${selected.item.scaleModifier}`);
  }
}

function closestPointOnAxisSegment(point, center, axis, minT, maxT) {
  const relative = point.clone().sub(center);
  const t = THREE.MathUtils.clamp(relative.dot(axis), minT, maxT);
  return center.clone().addScaledVector(axis, t);
}
function findGizmoHandleAtPoint(point) {
  if (!transformGizmo.visible || !selected) return null;
  transformGizmo.updateMatrixWorld(true);
  const center = transformGizmo.getWorldPosition(new THREE.Vector3());
  let best = null;
  let bestDistance = Infinity;
  for (const handle of gizmoHandles) {
    const axis = handle.axis;
    let distance;
    if (handle.kind === "translate") {
      const closest = closestPointOnAxisSegment(point, center, axis, -0.82, 0.82);
      distance = point.distanceTo(closest);
      if (distance < 0.25 && distance < bestDistance) {
        best = handle;
        bestDistance = distance;
      }
    } else {
      const relative = point.clone().sub(center);
      const axial = relative.dot(axis);
      const radial = relative.addScaledVector(axis, -axial).length();
      distance = Math.hypot(axial, radial - 0.53);
      if (distance < 0.24 && distance < bestDistance) {
        best = handle;
        bestDistance = distance;
      }
    }
  }
  return best;
}
function getRingBasis(axis) {
  if (Math.abs(axis.x) > 0.9) return [new THREE.Vector3(0, 1, 0), new THREE.Vector3(0, 0, 1)];
  if (Math.abs(axis.y) > 0.9) return [new THREE.Vector3(0, 0, 1), new THREE.Vector3(1, 0, 0)];
  return [new THREE.Vector3(1, 0, 0), new THREE.Vector3(0, 1, 0)];
}
function ringAngle(point, center, axis) {
  const [u, v] = getRingBasis(axis);
  const relative = point.clone().sub(center);
  return Math.atan2(relative.dot(v), relative.dot(u));
}
function wrapAngleDelta(angle) {
  while (angle > Math.PI) angle -= Math.PI * 2;
  while (angle < -Math.PI) angle += Math.PI * 2;
  return angle;
}
function makeGizmoDrag(node, handle, startPoint) {
  const parent = node.group.parent;
  parent.updateWorldMatrix(true, false);
  node.group.updateWorldMatrix(true, false);
  const parentWorldQuaternion = parent.getWorldQuaternion(new THREE.Quaternion());
  const inverseParentWorldQuaternion = parentWorldQuaternion.clone().invert();
  const inverseParentWorldMatrix = parent.matrixWorld.clone().invert();
  const startWorldPosition = node.group.getWorldPosition(new THREE.Vector3());
  const startWorldQuaternion = node.group.getWorldQuaternion(new THREE.Quaternion());
  const initialAngle = handle.kind === "rotate" ? ringAngle(startPoint, startWorldPosition, handle.axis) : 0;
  return {
    mode: "gizmo", node, handle,
    axis: handle.axis.clone().normalize(),
    center: startWorldPosition.clone(),
    startPoint: startPoint.clone(),
    startPosition: node.position.clone(),
    startQuaternion: node.quaternion.clone(),
    startWorldPosition: startWorldPosition.clone(),
    startWorldQuaternion,
    inverseParentWorldQuaternion,
    inverseParentWorldMatrix,
    lastAngle: initialAngle,
    accumulatedAngle: 0
  };
}
function applyGizmoDrag(drag, point) {
  if (!nodes.includes(drag.node)) return;
  if (drag.handle.kind === "translate") {
    const amount = point.clone().sub(drag.startPoint).dot(drag.axis);
    let desiredWorldPosition = drag.center.clone().addScaledVector(drag.axis, amount);
    desiredWorldPosition = snapWorldPosition(desiredWorldPosition);
    drag.node.position.copy(desiredWorldPosition.applyMatrix4(drag.inverseParentWorldMatrix));
  } else {
    // Track small per-frame angular changes instead of comparing only against
    // the original angle. This prevents angle-wrap jumps at +/-180 degrees.
    const currentAngle = ringAngle(point, drag.center, drag.axis);
    const angularDelta = wrapAngleDelta(currentAngle - drag.lastAngle);
    if (Number.isFinite(angularDelta)) drag.accumulatedAngle += angularDelta;
    drag.lastAngle = currentAngle;

    let appliedAngle = drag.accumulatedAngle;
    if (snapConfig.rotationEnabled) {
      const step = THREE.MathUtils.degToRad(snapConfig.rotationStepDegrees);
      appliedAngle = roundToStep(appliedAngle, step);
    }
    const worldDelta = new THREE.Quaternion().setFromAxisAngle(drag.axis, appliedAngle);
    const desiredWorldQuaternion = worldDelta.multiply(drag.startWorldQuaternion.clone()).normalize();
    drag.node.quaternion.copy(
      drag.inverseParentWorldQuaternion.clone().multiply(desiredWorldQuaternion).normalize()
    );

    // Hard-lock the original world-space pivot for every rotation frame.
    // The gizmo may rotate the orientation, but must never translate/orbit it.
    drag.node.position.copy(
      drag.startWorldPosition.clone().applyMatrix4(drag.inverseParentWorldMatrix)
    );
  }
  syncMesh(drag.node);
}
function beginHandGizmoDrag(input, proxy, handle) {
  if (!selected || !handle) return false;
  const drag = makeGizmoDrag(selected, handle, proxy.position);
  drag.proxy = proxy;
  handDragStates.set(input, drag);
  const snapEnabled = handle.kind === "translate" ? snapConfig.positionEnabled : snapConfig.rotationEnabled;
  if (snapEnabled) playSfx("snapOut");
  const label = handle.kind === "translate" ? "Move axis" : "Rotation ring";
  setStatus(`${label} grabbed. Drag along the handle, then release your pinch.`);
  return true;
}
function getControllerRay(controller) {
  controller.updateMatrixWorld(true);
  tempMatrix.identity().extractRotation(controller.matrixWorld);
  raycaster.ray.origin.setFromMatrixPosition(controller.matrixWorld);
  raycaster.ray.direction.set(0, 0, -1).applyMatrix4(tempMatrix);
  raycaster.near = 0.02;
  raycaster.far = 10;
}
function pickNode(controller) {
  getControllerRay(controller);
  const hits = raycaster.intersectObjects(nodes.map((n) => n.mesh), false);
  return hits.length ? hits[0].object.userData.node : null;
}
function pickGizmoHandle(controller) {
  // Explicitly disable picking while B/object-only mode is active. Three.js
  // raycasting may still hit child meshes under a hidden parent, so relying on
  // transformGizmo.visible alone can let invisible handles steal object grabs.
  if (!gizmoEnabled || !transformGizmo.visible || !selected) return null;
  transformGizmo.updateMatrixWorld(true);
  getControllerRay(controller);
  const hits = raycaster.intersectObjects(gizmoPickMeshes, false);
  return hits.length ? hits[0] : null;
}
function onTrigger(controller) {
  getControllerRay(controller);
  const buttonHits = raycaster.intersectObjects(visibleMenuPickTargets(), false);
  if (buttonHits.length) {
    runAction(buttonHits[0].object.userData.action);
    return;
  }
  const node = pickNode(controller);
  if (node) {
    choose(node);
    setStatus(`Selected ${node.item.itemID}. Use its double arrows to move and circles to rotate.`);
  }
}
function nodeGrabSurfaceDistance(node, point) {
  if (!node?.mesh) return Infinity;
  node.mesh.updateWorldMatrix(true, false);
  const geometry = node.mesh.geometry;
  if (!geometry.boundingSphere) geometry.computeBoundingSphere();
  const sphere = geometry.boundingSphere;
  if (!sphere) return Infinity;
  const center = sphere.center.clone().applyMatrix4(node.mesh.matrixWorld);
  const worldScale = node.mesh.getWorldScale(new THREE.Vector3());
  const radius = sphere.radius * Math.max(Math.abs(worldScale.x), Math.abs(worldScale.y), Math.abs(worldScale.z));
  // Distance to the outside of the visible mesh, not just its origin. This
  // makes larger objects much easier to pick up without making tiny objects
  // require an exact centre hit.
  return Math.max(0, point.distanceTo(center) - radius);
}
function nearestNodeToHand(grip, maxSurfaceDistance = 0.38) {
  grip.updateMatrixWorld(true);
  const handPosition = new THREE.Vector3().setFromMatrixPosition(grip.matrixWorld);
  let nearest = null;
  let bestDistance = maxSurfaceDistance;
  for (const node of nodes) {
    const distance = nodeGrabSurfaceDistance(node, handPosition);
    if (distance < bestDistance) {
      bestDistance = distance;
      nearest = node;
    }
  }
  return nearest;
}
function beginDrag(rayController, grip) {
  // In full-edit mode, a visible gizmo handle has priority. In B/object-only
  // mode, never test gizmo pickers: hold grip near the actual part to grab it.
  const gizmoHit = gizmoEnabled ? pickGizmoHandle(rayController) : null;
  if (gizmoHit && selected) {
    grip.updateMatrixWorld(true);
    const gripPosition = new THREE.Vector3().setFromMatrixPosition(grip.matrixWorld);
    const drag = makeGizmoDrag(selected, gizmoHit.object.userData.gizmoHandle, gizmoHit.point);
    drag.grip = grip;
    drag.pointerOffset = gizmoHit.point.clone().sub(gripPosition);
    dragStates.set(rayController, drag);
    const snapEnabled = drag.handle.kind === "translate" ? snapConfig.positionEnabled : snapConfig.rotationEnabled;
    if (snapEnabled) playSfx("snapOut");
    setStatus(drag.handle.kind === "translate" ? "Moving on the selected XYZ axis." : "Turning the selected rotation ring.");
    return;
  }
  // Grab the closest part to the tracked controller grip, rather than dragging
  // from the controller's aim-ray pose. This makes the part follow hand motion.
  let node = nearestNodeToHand(grip, gizmoEnabled ? 0.48 : 0.68);
  if (!node && selected) {
    grip.updateMatrixWorld(true);
    const handPosition = new THREE.Vector3().setFromMatrixPosition(grip.matrixWorld);
    if (nodeGrabSurfaceDistance(selected, handPosition) < (gizmoEnabled ? 0.60 : 0.82)) node = selected;
  }
  if (!node) {
    setStatus("Move your controller hand close to a part, then hold the grip button to pick it up.");
    return;
  }
  grip.updateMatrixWorld(true);
  node.group.updateMatrixWorld(true);
  const offset = grip.matrixWorld.clone().invert().multiply(node.group.matrixWorld);
  dragStates.set(rayController, {
    mode: "object", node, grip, offset,
    lockedLocalQuaternion: gizmoEnabled ? null : node.quaternion.clone()
  });
  if (snapConfig.positionEnabled || snapConfig.rotationEnabled) playSfx("snapOut");
  choose(node);
  setStatus(`Holding ${node.item.itemID}. Move your controller hand; release grip to place it.`);
}
function updateDrags() {
  if (twoHandScaleState && updateTwoHandScale()) return;
  for (const [rayController, drag] of dragStates.entries()) {
    const node = drag.node;
    if (!nodes.includes(node)) { dragStates.delete(rayController); continue; }
    drag.grip.updateMatrixWorld(true);
    if (drag.mode === "gizmo") {
      const gripPosition = new THREE.Vector3().setFromMatrixPosition(drag.grip.matrixWorld);
      applyGizmoDrag(drag, gripPosition.add(drag.pointerOffset));
      continue;
    }
    applyObjectDrag(node, drag.grip, drag.offset, drag.lockedLocalQuaternion);
  }
}
function controllerGripWorldPosition(record) {
  // Controller grip poses are tracked in the XR scene, independently of the
  // movable editor workspace. Read the pose after updating its world matrix.
  record.grip.updateWorldMatrix(true, false);
  return record.grip.getWorldPosition(new THREE.Vector3());
}
function refreshControllerInputSources() {
  // Refresh from the live XR session every frame. Relying only on the
  // connected event can leave a controller's handedness/gamepad unset on
  // some Quest Browser builds.
  const sources = Array.from(renderer.xr.getSession()?.inputSources || []);
  for (const record of controllerRecords) {
    const source = sources.find((candidate) => candidate.handedness === record.handedness)
      || sources[record.index]
      || null;
    if (source) {
      record.inputSource = source;
      record.handedness = source.handedness || record.handedness;
    }
  }
}
function isControllerGripHeld(record) {
  const source = record.inputSource || record.controller.userData?.inputSource || record.grip.userData?.inputSource;
  // XR-standard WebXR gamepads expose squeeze/grip as button 1. The event
  // flag remains a fallback for runtimes that don't expose that button.
  const squeezeButton = source?.gamepad?.buttons?.[1];
  return Boolean(record.squeezePressed || squeezeButton?.pressed || (Number(squeezeButton?.value) || 0) >= 0.65);
}
function findHeldObjectDrag() {
  // Item scaling requires an active physical grab, never mere selection.
  // Prefer the selected part if both controllers happen to hold objects.
  let fallback = null;
  for (const drag of dragStates.values()) {
    if (!drag || drag.mode !== "object" || !drag.node || !nodes.includes(drag.node)) continue;
    if (drag.node === selected) return drag;
    fallback ||= drag;
  }
  return fallback;
}
function tryBeginTwoHandScale() {
  if (twoHandScaleState || scaleGestureNeedsRelease) return false;
  const leftRecord = controllerRecords.find((record) => record.handedness === "left");
  const rightRecord = controllerRecords.find((record) => record.handedness === "right");
  if (!leftRecord || !rightRecord || !isControllerGripHeld(leftRecord) || !isControllerGripHeld(rightRecord)) return false;

  const leftPosition = controllerGripWorldPosition(leftRecord);
  const rightPosition = controllerGripWorldPosition(rightRecord);
  const startDistance = leftPosition.distanceTo(rightPosition);
  if (!Number.isFinite(startDistance) || startDistance < 0.08) return false;

  const heldObjectDrag = findHeldObjectDrag();
  // With B/gizmo OFF, this becomes object-only mode: two grips must belong to
  // an object already picked up with one controller. Empty-hand grips never
  // resize or move the player/workspace in this mode.
  if (!gizmoEnabled && !heldObjectDrag) {
    setStatus("OBJECT-ONLY MODE: grab an item with one controller first, keep holding it, then squeeze the other controller to resize it. The hidden gizmo cannot intercept grabs.");
    return false;
  }

  // Both grips on an actual held object mean item scaling; with the gizmo on,
  // empty hands can still invoke player scaling.
  dragStates.delete(leftRecord.controller);
  dragStates.delete(rightRecord.controller);

  if (heldObjectDrag) {
    const node = heldObjectDrag.node;
    node.group.updateWorldMatrix(true, false);
    const startWorldPosition = node.group.getWorldPosition(new THREE.Vector3());
    const startMidpoint = leftPosition.clone().add(rightPosition).multiplyScalar(0.5);
    const startModifier = Number(node.item.scaleModifier || 0);
    const startScale = Math.max(1 / 128, 1 + startModifier / 128);
    twoHandScaleState = {
      kind: "item",
      node,
      leftRecord,
      rightRecord,
      startDistance,
      startScale,
      startWorldPosition,
      startMidpoint
    };
    setStatus("ITEM SCALE ACTIVE · Holding the object with both grips. Pull apart to enlarge; bring together to shrink.");
  } else {
    // Scale the virtual world around the headset, not around the controller
    // midpoint. This makes the user feel larger/smaller while keeping their
    // current viewing position stable. Translating both grips moves the player
    // through the workspace independently on X, Y and Z.
    worldGroup.updateWorldMatrix(true, false);
    const xrCamera = renderer.xr.getCamera(camera);
    xrCamera.updateMatrixWorld(true);
    const playerAnchorWorld = xrCamera.getWorldPosition(new THREE.Vector3());
    const playerAnchorLocal = worldGroup.worldToLocal(playerAnchorWorld.clone());
    const startMidpoint = leftPosition.clone().add(rightPosition).multiplyScalar(0.5);
    twoHandScaleState = {
      kind: "player",
      leftRecord,
      rightRecord,
      startDistance,
      startWorldScale: Math.max(0.0001, Math.abs(worldGroup.scale.x)),
      startWorldPosition: worldGroup.position.clone(),
      startWorldQuaternion: worldGroup.quaternion.clone(),
      playerAnchorWorld: playerAnchorWorld.clone(),
      playerAnchorLocal,
      startMidpoint: startMidpoint.clone()
    };
    setStatus("PLAYER SIZE + MOVE ACTIVE · Pull hands apart to grow; bring them together to shrink. Move both hands together in X, Y or Z to move through the workspace.");
    drawScaleFeedback("PLAYER", 1 / Math.max(0.0001, worldGroup.scale.x), true);
  }
  return true;
}
function finishTwoHandScale() {
  if (!twoHandScaleState) return;
  const finishedKind = twoHandScaleState.kind;
  const finishedScale = finishedKind === "item"
    ? Math.max(1 / 128, 1 + Number(twoHandScaleState.node?.item?.scaleModifier || 0) / 128)
    : 1 / Math.max(0.0001, Math.abs(worldGroup.scale.x));
  twoHandScaleState = null;
  drawScaleFeedback(finishedKind === "item" ? "ITEM" : "PLAYER", finishedScale, false);
  scaleGestureNeedsRelease = true;
  for (const record of controllerRecords) dragStates.delete(record.controller);
  setStatus(finishedKind === "item"
    ? "Item scaling finished. Release both grips before another scale gesture."
    : "Player scaling finished. Release both grips before another scale gesture.");
}
function pollTwoHandScaleGesture() {
  if (!renderer.xr.isPresenting) return;
  const leftRecord = controllerRecords.find((record) => record.handedness === "left");
  const rightRecord = controllerRecords.find((record) => record.handedness === "right");
  if (!leftRecord || !rightRecord) return;

  const leftHeld = isControllerGripHeld(leftRecord);
  const rightHeld = isControllerGripHeld(rightRecord);
  const bothHeld = leftHeld && rightHeld;
  if (scaleGestureNeedsRelease) {
    if (!leftHeld && !rightHeld) scaleGestureNeedsRelease = false;
    return;
  }
  if (twoHandScaleState) {
    if (!bothHeld) finishTwoHandScale();
    else updateTwoHandScale();
  } else if (bothHeld) {
    tryBeginTwoHandScale();
  }
}
function applyPlayerScaleAndMove(state, targetScale, handTranslation) {
  // Rebuild from the gesture-start transform each frame to avoid cumulative
  // drift. Scaling is anchored at the headset/player position, so the user
  // experiences their virtual size changing instead of orbiting around their
  // hands. Shared hand translation moves the environment in the opposite
  // direction, which moves the virtual player in the same XYZ direction.
  worldGroup.position.copy(state.startWorldPosition);
  worldGroup.quaternion.copy(state.startWorldQuaternion);
  worldGroup.scale.setScalar(targetScale);
  worldGroup.updateMatrixWorld(true);

  const transformedPlayerAnchor = state.playerAnchorLocal.clone().applyMatrix4(worldGroup.matrixWorld);
  worldGroup.position.add(state.playerAnchorWorld.clone().sub(transformedPlayerAnchor));
  worldGroup.position.sub(handTranslation);
  worldGroup.updateMatrixWorld(true);
}
function updateTwoHandScale() {
  const state = twoHandScaleState;
  if (!state) return false;
  const leftPosition = controllerGripWorldPosition(state.leftRecord);
  const rightPosition = controllerGripWorldPosition(state.rightRecord);
  const currentDistance = leftPosition.distanceTo(rightPosition);
  if (!Number.isFinite(currentDistance) || currentDistance < 0.03) return true;

  const scaleFactor = currentDistance / state.startDistance;
  if (state.kind === "player") {
    // Pulling the hands apart makes the virtual player larger, so the
    // surrounding workspace becomes smaller relative to the headset.
    const desiredWorldScale = THREE.MathUtils.clamp(state.startWorldScale / scaleFactor, 0.25, 4.0);
    const currentMidpoint = leftPosition.clone().add(rightPosition).multiplyScalar(0.5);
    const handTranslation = currentMidpoint.clone().sub(state.startMidpoint);
    const scaleChanged = Math.abs(desiredWorldScale - worldGroup.scale.x) > 0.0005;
    const playerMoved = handTranslation.lengthSq() > 0.000004;
    if (scaleChanged || playerMoved) {
      applyPlayerScaleAndMove(state, desiredWorldScale, handTranslation);
      drawScaleFeedback("PLAYER", 1 / desiredWorldScale, true);
      updateTransformGizmo();
    }
    return true;
  }

  if (!nodes.includes(state.node)) return false;
  const desiredScale = THREE.MathUtils.clamp(state.startScale * scaleFactor, 1 / 128, 255 / 128);
  drawScaleFeedback("ITEM", desiredScale, true);
  const modifier = THREE.MathUtils.clamp(Math.round((desiredScale - 1) * 128), -127, 127);
  if (modifier !== Number(state.node.item.scaleModifier || 0)) {
    state.node.item.scaleModifier = modifier;
    syncMesh(state.node);
  }
  // Keep the held item centred between the two hands while it scales.
  const currentMidpoint = leftPosition.clone().add(rightPosition).multiplyScalar(0.5);
  const desiredWorldPosition = state.startWorldPosition.clone().add(currentMidpoint.sub(state.startMidpoint));
  setNodeWorldPosition(state.node, snapWorldPosition(desiredWorldPosition));
  return true;
}

function applyStickDeadzone(value, deadzone) {
  const magnitude = Math.abs(value);
  if (magnitude <= deadzone) return 0;
  return Math.sign(value) * ((magnitude - deadzone) / (1 - deadzone));
}
function getThumbstickAxes(inputSource) {
  const gamepad = inputSource?.gamepad;
  if (!gamepad?.axes) return { x: 0, y: 0 };
  const axes = gamepad.axes;
  // xr-standard reserves axes[2]/[3] for the thumbstick when a touchpad
  // is also exposed; on simpler mappings the first pair is the stick.
  const pair = axes.length >= 4 ? 2 : 0;
  return {
    x: applyStickDeadzone(Number(axes[pair] || 0), joystickConfig.deadzone),
    y: applyStickDeadzone(Number(axes[pair + 1] || 0), joystickConfig.deadzone)
  };
}
function applyPlayerSnapTurn(xrCamera, direction) {
  const pivot = xrCamera.getWorldPosition(new THREE.Vector3());
  pivot.y = 0; // turn around the player's floor position, not head height
  const angle = THREE.MathUtils.degToRad(joystickConfig.turnStepDegrees) * direction;
  const turn = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), angle);
  worldGroup.position.sub(pivot).applyQuaternion(turn).add(pivot);
  worldGroup.quaternion.premultiply(turn).normalize();
  worldGroup.updateMatrixWorld(true);
  updateTransformGizmo();
}

function updateJoystickMovement(deltaSeconds) {
  if (!renderer.xr.isPresenting) return;
  // Avoid moving the workspace while a part is being manipulated or an
  // in-VR text keypad is open. Otherwise locomotion is independent of selection.
  if (dragStates.size || handDragStates.size || twoHandScaleState || controllerRecords.some((record) => record.squeezePressed) || keyboardOpen || snapValueKeyboardOpen) return;

  const session = renderer.xr.getSession();
  const sources = Array.from(session?.inputSources || []);
  const leftSource = sources.find((source) => source.handedness === "left" && source.gamepad);
  const rightSource = sources.find((source) => source.handedness === "right" && source.gamepad);
  if (!leftSource && !rightSource) return;

  const dt = THREE.MathUtils.clamp(Number(deltaSeconds) || 0, 0, 0.05);
  if (dt <= 0) return;
  const left = getThumbstickAxes(leftSource);
  const right = getThumbstickAxes(rightSource);
  const xrCamera = renderer.xr.getCamera(camera);

  // Walk forward/back and strafe in the direction the headset is facing.
  const forward = xrCamera.getWorldDirection(new THREE.Vector3());
  forward.y = 0;
  if (forward.lengthSq() > 0.0001) forward.normalize();
  const rightVector = new THREE.Vector3().crossVectors(forward, new THREE.Vector3(0, 1, 0)).normalize();
  const move = rightVector.multiplyScalar(left.x).addScaledVector(forward, -left.y);
  if (move.lengthSq() > 1) move.normalize();
  if (move.lengthSq() > 0.0001) {
    // Move the workspace opposite the desired player motion. This moves the
    // player through the scene without moving the selected part independently.
    worldGroup.position.addScaledVector(move, -joystickConfig.moveSpeed * dt * Math.max(0.25, worldGroup.scale.x));
  }

  // Right stick vertical moves the player up/down; the workspace moves in
  // the opposite direction so the headset experiences true 3D locomotion.
  const verticalInput = -right.y;
  if (Math.abs(verticalInput) > 0.0001) {
    worldGroup.position.y -= verticalInput * joystickConfig.verticalSpeed * dt * Math.max(0.25, worldGroup.scale.x);
  }

  // Right stick horizontal: one comfortable snap-turn per stick flick.
  const turnX = right.x;
  if (joystickState.turnArmed && Math.abs(turnX) >= joystickConfig.turnThreshold) {
    applyPlayerSnapTurn(xrCamera, Math.sign(turnX));
    joystickState.turnArmed = false;
  } else if (Math.abs(turnX) <= joystickConfig.turnReleaseThreshold) {
    joystickState.turnArmed = true;
  }
}

function updateMenuToggleFromPanel() {
  // The wrist-mounted menu icon is intentionally disabled. The left
  // controller's physical X button now toggles the menu instead.
  menuToggleGroup.visible = false;
}

function attachPanelToLeftHand() {
  if (!leftHandGrip) return false;
  if (panel.parent !== leftHandGrip) leftHandGrip.add(panel);
  // Place the panel just above and in front of the controller hand. Its
  // orientation is billboarded toward the headset in the XR animation loop.
  panel.position.set(0, 0.18, -0.20);
  panel.rotation.set(0, 0, 0);
  panel.scale.setScalar(0.32);
  panel.visible = menuVisible;
  panelReady = true;
  menuPoseInitialized = false;
  redrawPanel();
  updateMenuToggleFromPanel();
  return true;
}
function setupController(index) {
  const controller = renderer.xr.getController(index);       // pointing ray / buttons
  const grip = renderer.xr.getControllerGrip(index);          // tracked hand pose
  scene.add(controller);
  scene.add(grip);
  const lineGeometry = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3(0, 0, -5)]);
  const line = new THREE.Line(lineGeometry, new THREE.LineBasicMaterial({ color: 0x44ffcc }));
  line.frustumCulled = false;
  controller.add(line);
  const record = { index, controller, grip, handedness: null, inputSource: null, squeezePressed: false };
  controller.addEventListener("connected", (event) => {
    record.inputSource = event.data || null;
    record.handedness = event.data?.handedness || null;
    // When Quest hand tracking is active, the menu is positioned from the
    // actual wrist joint below. Otherwise, use the left controller grip.
    if (record.handedness === "left" && !event.data?.hand) {
      leftHandGrip = grip;
      if (renderer.xr.isPresenting && !leftHandMenuActive) {
        attachPanelToLeftHand();
        setStatus("Menu attached to your left controller hand.");
      }
    }
  });
  controller.addEventListener("disconnected", () => {
    if (leftHandGrip === grip) {
      leftHandGrip = null;
      if (!leftHandMenuActive) {
        panel.removeFromParent();
        scene.add(panel);
        panel.visible = false;
        panelReady = false;
        menuToggleGroup.visible = false;
      }
    }
    record.inputSource = null;
    record.squeezePressed = false;
    dragStates.delete(controller);
    if (twoHandScaleState && (twoHandScaleState.leftRecord === record || twoHandScaleState.rightRecord === record)) {
      twoHandScaleState = null;
      scaleGestureNeedsRelease = true;
    }
  });
  controller.addEventListener("selectstart", () => onTrigger(controller));
  controller.addEventListener("squeezestart", () => {
    record.squeezePressed = true;
    if (tryBeginTwoHandScale()) return;
    const bothControllersHeld = controllerRecords.length >= 2
      && controllerRecords.every((candidate) => isControllerGripHeld(candidate));
    if (!gizmoEnabled && bothControllersHeld) {
      if (!findHeldObjectDrag()) {
        setStatus("Gizmo off: pick up an object with one controller first, then hold the other grip to resize it.");
      }
      // Do not start player scaling or accidentally grab a second item.
      return;
    }
    beginDrag(controller, grip);
  });
  controller.addEventListener("squeezeend", () => {
    record.squeezePressed = false;
    if (twoHandScaleState && (twoHandScaleState.leftRecord === record || twoHandScaleState.rightRecord === record)) {
      finishTwoHandScale();
      if (snapConfig.positionEnabled || snapConfig.rotationEnabled) playSfx("snapIn");
      return;
    }
    const drag = dragStates.get(controller);
    if (dragStates.delete(controller)) {
      if ((drag.mode === "gizmo" && (drag.handle.kind === "translate" ? snapConfig.positionEnabled : snapConfig.rotationEnabled)) || (drag.mode !== "gizmo" && (snapConfig.positionEnabled || snapConfig.rotationEnabled))) playSfx("snapIn");
      setStatus("Part placed.");
    }
  });
  controllerRecords.push(record);
}
setupController(0);
setupController(1);

function refreshLeftHandAttachment() {
  // Controller fallback when the headset is not supplying tracked hand joints.
  for (const record of controllerRecords) {
    const source = record.inputSource || record.controller.userData?.inputSource || record.grip.userData?.inputSource;
    const handedness = record.handedness || source?.handedness;
    if (handedness === "left" && !source?.hand) {
      leftHandGrip = record.grip;
      if (panel.parent !== leftHandGrip || !panelReady) attachPanelToLeftHand();
      leftHandMenuActive = false;
      return true;
    }
  }
  return false;
}

const HAND_CHAINS = [
  ["wrist", "thumb-metacarpal", "thumb-phalanx-proximal", "thumb-phalanx-distal", "thumb-tip"],
  ["wrist", "index-finger-metacarpal", "index-finger-phalanx-proximal", "index-finger-phalanx-intermediate", "index-finger-phalanx-distal", "index-finger-tip"],
  ["wrist", "middle-finger-metacarpal", "middle-finger-phalanx-proximal", "middle-finger-phalanx-intermediate", "middle-finger-phalanx-distal", "middle-finger-tip"],
  ["wrist", "ring-finger-metacarpal", "ring-finger-phalanx-proximal", "ring-finger-phalanx-intermediate", "ring-finger-phalanx-distal", "ring-finger-tip"],
  ["wrist", "pinky-finger-metacarpal", "pinky-finger-phalanx-proximal", "pinky-finger-phalanx-intermediate", "pinky-finger-phalanx-distal", "pinky-finger-tip"]
];
const HAND_JOINT_NAMES = [...new Set(HAND_CHAINS.flat())];
function getHandJointMap(input) {
  let map = handJointMaps.get(input);
  if (!map) {
    // XRHand is iterable as [jointName, XRJointSpace] pairs.
    map = new Map(Array.from(input.hand.entries()));
    handJointMaps.set(input, map);
  }
  return map;
}
function getHandVisual(input) {
  let visual = handVisuals.get(input);
  if (visual) return visual;
  const group = new THREE.Group();
  scene.add(group);
  const jointGeometry = new THREE.SphereGeometry(1, 8, 6);
  const jointMaterial = new THREE.MeshBasicMaterial({ color: 0xf0c8aa });
  const boneGeometry = new THREE.CylinderGeometry(0.006, 0.006, 1, 6);
  const boneMaterial = new THREE.MeshBasicMaterial({ color: 0xe8bda0 });
  const joints = new Map();
  for (const name of HAND_JOINT_NAMES) {
    const mesh = new THREE.Mesh(jointGeometry, jointMaterial);
    mesh.visible = false;
    group.add(mesh);
    joints.set(name, mesh);
  }
  const bones = [];
  const seen = new Set();
  for (const chain of HAND_CHAINS) {
    for (let i = 0; i < chain.length - 1; i++) {
      const a = chain[i], b = chain[i + 1];
      const key = `${a}|${b}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const mesh = new THREE.Mesh(boneGeometry, boneMaterial);
      mesh.visible = false;
      group.add(mesh);
      bones.push({ a, b, mesh });
    }
  }
  visual = { group, joints, bones };
  handVisuals.set(input, visual);
  return visual;
}
function updateHandVisual(input, xrFrame, referenceSpace, jointSpaces) {
  const visual = getHandVisual(input);
  const positions = new Map();
  visual.group.visible = true;
  for (const name of HAND_JOINT_NAMES) {
    const space = jointSpaces.get(name);
    const pose = space ? xrFrame.getJointPose(space, referenceSpace) : null;
    const mesh = visual.joints.get(name);
    if (!pose) {
      mesh.visible = false;
      continue;
    }
    const p = pose.transform.position;
    const position = new THREE.Vector3(p.x, p.y, p.z);
    positions.set(name, position);
    mesh.position.copy(position);
    mesh.scale.setScalar(Math.max(0.0045, pose.radius || 0.007));
    mesh.visible = true;
  }
  const up = new THREE.Vector3(0, 1, 0);
  for (const bone of visual.bones) {
    const a = positions.get(bone.a), b = positions.get(bone.b);
    if (!a || !b) {
      bone.mesh.visible = false;
      continue;
    }
    const direction = new THREE.Vector3().subVectors(b, a);
    const length = direction.length();
    if (length < 0.001) {
      bone.mesh.visible = false;
      continue;
    }
    bone.mesh.position.copy(a).add(b).multiplyScalar(0.5);
    bone.mesh.quaternion.setFromUnitVectors(up, direction.normalize());
    bone.mesh.scale.set(1, length, 1);
    bone.mesh.visible = true;
  }
  return visual;
}

function pickHandMenuButton(input, xrFrame, referenceSpace, jointSpaces) {
  if (!input || !xrFrame || !referenceSpace) return null;
  const baseSpace = jointSpaces.get("index-finger-metacarpal");
  const tipSpace = jointSpaces.get("index-finger-tip");
  if (!baseSpace || !tipSpace) return null;
  const basePose = xrFrame.getJointPose(baseSpace, referenceSpace);
  const tipPose = xrFrame.getJointPose(tipSpace, referenceSpace);
  if (!basePose || !tipPose) return null;
  const base = basePose.transform.position;
  const tip = tipPose.transform.position;
  const origin = new THREE.Vector3(tip.x, tip.y, tip.z);
  const direction = new THREE.Vector3(tip.x - base.x, tip.y - base.y, tip.z - base.z);
  if (direction.lengthSq() < 0.000001) return null;
  raycaster.set(origin, direction.normalize());
  raycaster.near = 0.005;
  raycaster.far = 2.0;
  const hits = raycaster.intersectObjects(visibleMenuPickTargets(), false);
  return hits.length ? hits[0].object : null;
}
function updateHandTracking(xrFrame) {
  if (!xrFrame || !renderer.xr.isPresenting) return;
  const session = renderer.xr.getSession();
  const referenceSpace = renderer.xr.getReferenceSpace();
  if (!session || !referenceSpace) return;

  const inputSources = Array.from(session.inputSources || []);
  const leftInput = inputSources.find((source) => source.handedness === "left" && source.hand);
  const rightInput = inputSources.find((source) => source.handedness === "right" && source.hand);
  leftHandMenuActive = Boolean(leftInput);
  handHoveringAvailable = Boolean(rightInput);
  if (rightInput) {
    const rightJoints = getHandJointMap(rightInput);
    setHoveredButton(pickHandMenuButton(rightInput, xrFrame, referenceSpace, rightJoints));
  } else {
    setHoveredButton(null);
  }

  // Put the editor panel just above the tracked left wrist and keep its face
  // turned toward the headset, like a wrist-mounted floating display.
  if (leftInput) {
    const leftJointSpaces = getHandJointMap(leftInput);
    const wristSpace = leftJointSpaces.get("wrist");
    const wristPose = wristSpace ? xrFrame.getJointPose(wristSpace, referenceSpace) : null;
    if (wristPose) {
      const wrist = new THREE.Vector3(wristPose.transform.position.x, wristPose.transform.position.y, wristPose.transform.position.z);
      const xrCamera = renderer.xr.getCamera(camera);
      const viewerPosition = xrCamera.getWorldPosition(new THREE.Vector3());
      const toViewer = viewerPosition.clone().sub(wrist).normalize();
      // Float the tablet a little forward from the wrist and above the palm,
      // then keep it upright and facing the headset regardless of wrist roll.
      const targetPosition = wrist.add(new THREE.Vector3(0, 0.17, 0)).addScaledVector(toViewer, 0.16);
      if (panel.parent !== scene) {
        panel.removeFromParent();
        scene.add(panel);
        menuPoseInitialized = false;
      }
      const wasVisible = panel.visible;
      if (!menuPoseInitialized) {
        panel.position.copy(targetPosition);
        menuPoseInitialized = true;
      } else {
        panel.position.lerp(targetPosition, 0.34);
      }
      panel.up.set(0, 1, 0);
      const oldQuaternion = panel.quaternion.clone();
      panel.lookAt(viewerPosition);
      const facingQuaternion = panel.quaternion.clone();
      panel.quaternion.copy(oldQuaternion).slerp(facingQuaternion, 0.38);
      panel.scale.setScalar(0.32);
      panel.visible = menuVisible;
      panelReady = true;
      if (!leftHandGrip) statusText = "LEFT MENU · PRESS X ON LEFT CONTROLLER TO HIDE/SHOW.";
      if (!wasVisible && menuVisible) redrawPanel();
      updateMenuToggleFromPanel();
    }
  } else if (!leftHandGrip) {
    // Keep the menu visible at its last tracked position during brief tracking
    // dropouts; it will resume following the wrist when tracking returns.
  }

  // Thumb-index pinch is the hand equivalent of holding a controller grip.
  // Hysteresis prevents tiny tracking changes from repeatedly grabbing/releasing.
  const activeHandSources = new Set();
  for (const input of inputSources) {
    if (!input.hand) continue;
    activeHandSources.add(input);
    const jointSpaces = getHandJointMap(input);
    updateHandVisual(input, xrFrame, referenceSpace, jointSpaces);
    const thumbSpace = jointSpaces.get("thumb-tip");
    const indexSpace = jointSpaces.get("index-finger-tip");
    const wristSpace = jointSpaces.get("wrist");
    if (!thumbSpace || !indexSpace || !wristSpace) continue;
    const thumbPose = xrFrame.getJointPose(thumbSpace, referenceSpace);
    const indexPose = xrFrame.getJointPose(indexSpace, referenceSpace);
    const wristPose = xrFrame.getJointPose(wristSpace, referenceSpace);
    if (!thumbPose || !indexPose || !wristPose) continue;

    const a = thumbPose.transform.position;
    const b = indexPose.transform.position;
    const distance = Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
    let proxy = handPoseProxies.get(input);
    if (!proxy) {
      proxy = new THREE.Group();
      scene.add(proxy);
      handPoseProxies.set(input, proxy);
    }
    proxy.position.set((a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2);
    const wristRotation = wristPose.transform.orientation;
    proxy.quaternion.set(wristRotation.x, wristRotation.y, wristRotation.z, wristRotation.w);
    proxy.updateMatrixWorld(true);

    let state = handPinchStates.get(input);
    if (!state) {
      state = { pinching: false, uiPressed: false };
      handPinchStates.set(input, state);
    }

    if (!state.pinching && distance < 0.035) {
      state.pinching = true;
      const menuButton = pickHandMenuButton(input, xrFrame, referenceSpace, jointSpaces);
      if (menuButton) {
        state.uiPressed = true;
        runAction(menuButton.userData.action);
      } else {
        const handle = findGizmoHandleAtPoint(proxy.position);
        if (handle && selected) {
          beginHandGizmoDrag(input, proxy, handle);
        } else {
        const node = nearestNodeToHand(proxy, 0.42);
        if (node) {
          node.group.updateMatrixWorld(true);
          const offset = proxy.matrixWorld.clone().invert().multiply(node.group.matrixWorld);
          handDragStates.set(input, {
            mode: "object", node, proxy, offset,
            lockedLocalQuaternion: gizmoEnabled ? null : node.quaternion.clone()
          });
          if (snapConfig.positionEnabled || snapConfig.rotationEnabled) playSfx("snapOut");
          choose(node);
          setStatus(`Pinching ${node.item.itemID}. Move your hand; release your fingers to place it.`);
        }
        }
      }
    } else if (state.pinching && distance > 0.065) {
      state.pinching = false;
      const endedDrag = handDragStates.get(input);
      if (handDragStates.delete(input)) {
        if ((endedDrag.mode === "gizmo" && (endedDrag.handle.kind === "translate" ? snapConfig.positionEnabled : snapConfig.rotationEnabled)) || (endedDrag.mode !== "gizmo" && (snapConfig.positionEnabled || snapConfig.rotationEnabled))) playSfx("snapIn");
        setStatus("Part placed.");
      }
      state.uiPressed = false;
    }
  }

  for (const [input, visual] of handVisuals.entries()) {
    if (!activeHandSources.has(input)) visual.group.visible = false;
  }
  for (const input of handPinchStates.keys()) {
    if (!activeHandSources.has(input)) {
      handPinchStates.delete(input);
      handDragStates.delete(input);
    }
  }

  // Apply all active hand drags using the midpoint between thumb and index finger.
  for (const [input, drag] of handDragStates.entries()) {
    if (!nodes.includes(drag.node)) {
      handDragStates.delete(input);
      continue;
    }
    drag.proxy.updateMatrixWorld(true);
    if (drag.mode === "gizmo") {
      applyGizmoDrag(drag, drag.proxy.position);
      continue;
    }
    applyObjectDrag(drag.node, drag.proxy, drag.offset, drag.lockedLocalQuaternion);
  }
}

function updateLeftControllerXToggle() {
  if (!renderer.xr.isPresenting) {
    leftXWasPressed = false;
    return;
  }
  const session = renderer.xr.getSession();
  const leftSource = Array.from(session?.inputSources || []).find(
    (source) => source.handedness === "left" && source.gamepad
  );
  // Oculus/Meta Touch WebXR mapping: buttons[4] is X on the left
  // controller (A on the right). Use an edge so holding X does not flicker
  // the menu open and closed every frame.
  const xButton = leftSource?.gamepad?.buttons?.[4];
  const pressed = Boolean(xButton?.pressed || (Number(xButton?.value) || 0) >= 0.75);
  if (pressed && !leftXWasPressed) {
    setMenuVisible(!menuVisible);
  }
  leftXWasPressed = pressed;
}

function updateRightControllerBGizmoToggle() {
  if (!renderer.xr.isPresenting) {
    rightBWasPressed = false;
    return;
  }
  const session = renderer.xr.getSession();
  const rightSource = Array.from(session?.inputSources || []).find(
    (source) => source.handedness === "right" && source.gamepad
  );
  // Meta Touch WebXR mapping: buttons[5] is B on the right controller
  // (Y on the left). Edge-trigger it so holding B does not flicker the gizmo.
  const bButton = rightSource?.gamepad?.buttons?.[5];
  const pressed = Boolean(bButton?.pressed || (Number(bButton?.value) || 0) >= 0.75);
  if (pressed && !rightBWasPressed) {
    gizmoEnabled = !gizmoEnabled;
    if (!gizmoEnabled) {
      // Cancel any in-progress gizmo drag before hiding its handles. Object
      // grabs remain untouched, so B never drops a part being held directly.
      for (const [controller, drag] of dragStates.entries()) {
        if (drag.mode === "gizmo") dragStates.delete(controller);
      }
      for (const [input, drag] of handDragStates.entries()) {
        if (drag.mode === "gizmo") handDragStates.delete(input);
      }
      transformGizmo.visible = false;
      setStatus("Object-only mode: pick up an item with one grip; hold both grips to shrink or enlarge it. Player scaling is disabled.");
    } else {
      updateTransformGizmo();
      setStatus("Full edit mode: XYZ movement, rotation, item scaling and player scaling are available.");
    }
    redrawPanel();
  }
  rightBWasPressed = pressed;
}

function updateControllerHover() {
  if (handHoveringAvailable) return;
  let hovered = null;
  for (const record of controllerRecords) {
    record.controller.updateMatrixWorld(true);
    getControllerRay(record.controller);
    const hits = raycaster.intersectObjects(visibleMenuPickTargets(), false);
    if (hits.length) { hovered = hits[0].object; break; }
  }
  setHoveredButton(hovered);
}

$("enterVR").addEventListener("click", async () => {
  warmAudio();
  if (!navigator.xr) {
    setStatus("WebXR is unavailable. Open this HTTPS page in Quest Browser.");
    return;
  }
  try {
    const supported = await navigator.xr.isSessionSupported("immersive-vr");
    if (!supported) throw new Error("Immersive VR is not supported in this browser.");
    const session = await navigator.xr.requestSession("immersive-vr", {
      optionalFeatures: ["local-floor", "bounded-floor", "hand-tracking"]
    });
    // The desktop preview camera has an offset; clear it so the headset pose
    // is the only camera transform while rendering inside WebXR.
    camera.position.set(0, 0, 0);
    camera.quaternion.identity();
    camera.updateMatrixWorld(true);
    await renderer.xr.setSession(session);
    // The initial button click warms audio; resume once more after the XR
    // session is active because some Quest Browser versions suspend it.
    if (audioContext) audioContext.resume().catch((error) => console.warn("XR audio resume failed:", error));
    updateTransformGizmo();
    $("landing").hidden = true;
    panel.visible = false;
    menuToggleGroup.visible = false;
    menuVisible = true;
    menuPoseInitialized = false;
    panelReady = false;
    leftXWasPressed = false;
    rightBWasPressed = false;
    gizmoEnabled = true;
    setStatus("VR started. X toggles the menu; B toggles the gizmo.");
    session.addEventListener("end", () => {
      panel.visible = false;
      menuToggleGroup.visible = false;
      panelReady = false;
      menuVisible = true;
      menuPoseInitialized = false;
      leftXWasPressed = false;
      rightBWasPressed = false;
      gizmoEnabled = true;
      snapSettingsOpen = false;
      snapValueKeyboardOpen = false;
      transformGizmo.visible = false;
      scaleFeedback.visible = false;
      joystickState.turnArmed = true;
      twoHandScaleState = null;
      for (const record of controllerRecords) record.squeezePressed = false;
      leftHandGrip = null;
      leftHandMenuActive = false;
      handPinchStates.clear();
      handDragStates.clear();
      handJointMaps.clear();
      for (const proxy of handPoseProxies.values()) proxy.removeFromParent();
      handPoseProxies.clear();
      for (const visual of handVisuals.values()) visual.group.removeFromParent();
      handVisuals.clear();
      panel.removeFromParent();
      scene.add(panel);
      camera.position.set(0, 1.65, 2.4);
      camera.quaternion.identity();
      camera.updateMatrixWorld(true);
      $("landing").hidden = false;
      setStatus("VR session ended. Your current build is still in this page.");
    });
  } catch (error) {
    setStatus(error?.message || "Could not start the VR session.");
  }
});

$("fileInput").addEventListener("change", async (event) => {
  const file = event.target.files?.[0];
  if (!file) return;
  try {
    importBuild(JSON.parse(await file.text()));
  } catch (error) {
    setStatus(error?.message || "Could not import that JSON file.");
  }
  event.target.value = "";
});

addEventListener("resize", () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});
let previousFrameTime = 0;
renderer.setAnimationLoop((time, xrFrame) => {
  const deltaSeconds = previousFrameTime ? Math.min((time - previousFrameTime) / 1000, 0.05) : 0;
  previousFrameTime = time;
  if (renderer.xr.isPresenting) {
    refreshControllerInputSources();
    pollTwoHandScaleGesture();
    if (!leftHandMenuActive && !panelReady) refreshLeftHandAttachment();
    updateHandTracking(xrFrame);
    if (!leftHandMenuActive && leftHandGrip && panel.parent === leftHandGrip && panelReady) {
      const xrCamera = renderer.xr.getCamera(camera);
      const viewerPosition = xrCamera.getWorldPosition(new THREE.Vector3());
      panel.up.set(0, 1, 0);
      panel.lookAt(viewerPosition);
      panel.visible = menuVisible;
      updateMenuToggleFromPanel();
    }
    updateLeftControllerXToggle();
    updateRightControllerBGizmoToggle();
    updateControllerHover();
  } else {
    menuToggleGroup.visible = false;
  }
  updateDrags();
  if (renderer.xr.isPresenting) {
    updateJoystickMovement(deltaSeconds);
    updateTransformGizmo();
    updateScaleFeedbackPose();
  } else {
    scaleFeedback.visible = false;
  }
  renderer.render(scene, camera);
});
setStatus(statusText);
