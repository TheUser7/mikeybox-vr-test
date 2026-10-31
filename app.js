import * as THREE from "https://cdn.jsdelivr.net/npm/three@0.161.0/build/three.module.js";

const $ = (id) => document.getElementById(id);
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x9bb3c2);
// A real sky mesh is more reliable than scene.background in immersive WebXR.
// Some headset/browser combinations clear the XR framebuffer to black instead.
const sky = new THREE.Mesh(
  new THREE.SphereGeometry(60, 32, 20),
  new THREE.MeshBasicMaterial({ color: 0x91b6cc, side: THREE.BackSide, depthWrite: false })
);
sky.renderOrder = -100;
scene.add(sky);

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

scene.add(new THREE.HemisphereLight(0xffffff, 0x52606b, 2.1));
const sun = new THREE.DirectionalLight(0xffffff, 2.0);
sun.position.set(4, 8, 5);
scene.add(sun);
const floor = new THREE.Mesh(
  new THREE.PlaneGeometry(50, 50),
  new THREE.MeshBasicMaterial({ color: 0x657a83 })
);
floor.rotation.x = -Math.PI / 2;
floor.position.y = -0.03;
scene.add(floor);
const grid = new THREE.GridHelper(24, 48, 0x526a73, 0x71858c);
grid.position.y = -0.015;
scene.add(grid);

const rootGroup = new THREE.Group();
scene.add(rootGroup);
let nodes = [];
let selected = null;
let nextId = 1;
let pendingItemID = "item_crate";
let keyboardDraft = "item_crate";
let keyboardOpen = false;
let statusText = "Enter VR. The menu follows your left hand; pinch a part to move it.";
let panelReady = false;
let leftHandGrip = null;
let leftHandMenuActive = false;
const controllerRecords = [];
const dragStates = new Map();
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

const panel = new THREE.Group();
panel.visible = false;
panel.scale.setScalar(0.32);
scene.add(panel);

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
function addPanelText(text, x, y, width, height, fontSize = 42, color = "#f5f8fb") {
  const mesh = new THREE.Mesh(
    new THREE.PlaneGeometry(width, height),
    new THREE.MeshBasicMaterial({ map: makeCanvasTexture(text, { fontSize, color }), transparent: true, depthWrite: false })
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
    new THREE.MeshBasicMaterial({ map: makeCanvasTexture(label, { width: 512, height: 160, fontSize: 54 }), transparent: true, depthWrite: false })
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
    new THREE.PlaneGeometry(1.68, 1.98),
    new THREE.MeshBasicMaterial({ color: 0x101e28, transparent: true, opacity: 0.96, depthWrite: false })
  );
  bg.position.z = -0.015;
  panel.add(bg);
  addPanelText(title, 0, 0.86, 1.55, 0.14, 42);
  addPanelText(statusText, 0, 0.70, 1.53, 0.10, 25, "#9ee5d1");
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

  addPanelText("MOVE · 5 cm per press", 0, -0.035, 1.45, 0.09, 27, "#a9c2cf");
  const xs = [-0.65, -0.39, -0.13, 0.13, 0.39, 0.65];
  ["X−", "X+", "Y−", "Y+", "Z−", "Z+"].forEach((label, i) =>
    addButton(label, `move:${i}`, xs[i], -0.19, 0.22, 0.14)
  );

  addPanelText("ROTATE · 15° per press", 0, -0.39, 1.45, 0.09, 27, "#a9c2cf");
  ["RX−", "RX+", "RY−", "RY+", "RZ−", "RZ+"].forEach((label, i) =>
    addButton(label, `rotate:${i}`, xs[i], -0.55, 0.22, 0.14)
  );

  addButton("SCALE −", "scale:-1", -0.38, -0.80, 0.48, 0.15);
  addButton("SCALE +", "scale:1", 0.15, -0.80, 0.48, 0.15);
  addPanelText("LEFT HAND MENU · Point + pinch to press · Pinch a nearby part to move", 0, -0.94, 1.55, 0.07, 17, "#91a6b3");
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
  else drawMainPanel();
}
function setStatus(text) {
  statusText = String(text);
  if (panelReady) redrawPanel();
  const statusEl = $("landingStatus");
  if (statusEl) statusEl.textContent = statusText;
}

function nodeGroup(node) { return node.parent ? node.parent.group : rootGroup; }
function syncMesh(node) {
  node.group.position.copy(node.position);
  node.group.quaternion.copy(node.quaternion);
  node.mesh.scale.setScalar(Math.max(0.01, 1 + Number(node.item.scaleModifier || 0) / 128));
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
  nextId = 1;
}
function choose(node) {
  selected = node;
  if (node) pendingItemID = node.item.itemID;
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
  const axis = Math.floor(index / 2);
  const amount = index % 2 === 0 ? -0.05 : 0.05;
  selected.position.setComponent(axis, selected.position.getComponent(axis) + amount);
  syncMesh(selected);
  redrawPanel();
}
function nudgeRotate(index) {
  if (!selected) { setStatus("Select an item first."); return; }
  const axisIndex = Math.floor(index / 2);
  const angle = (index % 2 === 0 ? -1 : 1) * Math.PI / 12;
  const axis = new THREE.Vector3(axisIndex === 0 ? 1 : 0, axisIndex === 1 ? 1 : 0, axisIndex === 2 ? 1 : 0);
  selected.quaternion.multiply(new THREE.Quaternion().setFromAxisAngle(axis, angle)).normalize();
  syncMesh(selected);
  redrawPanel();
}
function runAction(action) {
  if (action.startsWith("key") || action.startsWith("key:")) { handleKeyboardAction(action); return; }
  if (keyboardOpen) return;
  if (action === "newRoot") {
    if (nodes.some((n) => !n.parent)) { setStatus("A root already exists. Import a different build to replace it."); return; }
    if (!validItemID(pendingItemID)) pendingItemID = "item_crate";
    choose(createNode(makeItem(pendingItemID), null, [0, 1.1, 0.45]));
    setStatus("Root created. Point to select; pinch (hands) or squeeze (controller) near it to move.");
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
    if (!selected) { setStatus("Select an item first."); return; }
    selected.item.scaleModifier = Math.max(-127, Math.min(127, Number(selected.item.scaleModifier || 0) + Number(action.split(":")[1])));
    syncMesh(selected);
    setStatus(`Scale modifier: ${selected.item.scaleModifier}`);
  }
}

function getControllerRay(controller) {
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
function onTrigger(controller) {
  getControllerRay(controller);
  const buttonHits = raycaster.intersectObjects(uiButtons, false);
  if (buttonHits.length) {
    runAction(buttonHits[0].object.userData.action);
    return;
  }
  const node = pickNode(controller);
  if (node) {
    choose(node);
    setStatus(`Selected ${node.item.itemID}. Pinch near it with hands, or squeeze with a controller, to move it.`);
  }
}
function nearestNodeToHand(grip, maxDistance = 0.34) {
  grip.updateMatrixWorld(true);
  const handPosition = new THREE.Vector3().setFromMatrixPosition(grip.matrixWorld);
  let nearest = null;
  let bestDistance = maxDistance;
  for (const node of nodes) {
    node.group.updateMatrixWorld(true);
    const itemPosition = new THREE.Vector3().setFromMatrixPosition(node.group.matrixWorld);
    const distance = handPosition.distanceTo(itemPosition);
    if (distance < bestDistance) {
      bestDistance = distance;
      nearest = node;
    }
  }
  return nearest;
}
function beginDrag(rayController, grip) {
  // Grab the closest part to the tracked controller grip, rather than dragging
  // from the controller's aim-ray pose. This makes the part follow hand motion.
  let node = nearestNodeToHand(grip);
  if (!node && selected) {
    grip.updateMatrixWorld(true);
    selected.group.updateMatrixWorld(true);
    const handPosition = new THREE.Vector3().setFromMatrixPosition(grip.matrixWorld);
    const itemPosition = new THREE.Vector3().setFromMatrixPosition(selected.group.matrixWorld);
    if (handPosition.distanceTo(itemPosition) < 0.48) node = selected;
  }
  if (!node) {
    setStatus("Move your controller hand close to a part, then hold the grip button to pick it up.");
    return;
  }
  grip.updateMatrixWorld(true);
  node.group.updateMatrixWorld(true);
  const offset = grip.matrixWorld.clone().invert().multiply(node.group.matrixWorld);
  dragStates.set(rayController, { node, grip, offset });
  choose(node);
  setStatus(`Holding ${node.item.itemID}. Move your controller hand; release grip to place it.`);
}
function updateDrags() {
  for (const [rayController, drag] of dragStates.entries()) {
    const node = drag.node;
    if (!nodes.includes(node)) { dragStates.delete(rayController); continue; }
    drag.grip.updateMatrixWorld(true);
    const desiredWorld = tempMatrix2.copy(drag.grip.matrixWorld).multiply(drag.offset);
    const parent = node.group.parent;
    parent.updateMatrixWorld(true);
    const local = tempMatrix.copy(parent.matrixWorld).invert().multiply(desiredWorld);
    local.decompose(node.position, node.quaternion, tempScale);
    node.group.position.copy(node.position);
    node.group.quaternion.copy(node.quaternion);
  }
}
function attachPanelToLeftHand() {
  if (!leftHandGrip) return false;
  leftHandGrip.add(panel);
  // A compact wrist/palm menu, facing back toward the player.
  panel.position.set(0, 0.15, -0.09);
  panel.rotation.set(0, 0, 0);
  panel.scale.setScalar(0.32);
  panel.visible = true;
  panelReady = true;
  redrawPanel();
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
  const record = { index, controller, grip, handedness: null, inputSource: null };
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
      }
    }
    record.inputSource = null;
    dragStates.delete(controller);
  });
  controller.addEventListener("selectstart", () => onTrigger(controller));
  controller.addEventListener("squeezestart", () => beginDrag(controller, grip));
  controller.addEventListener("squeezeend", () => {
    if (dragStates.delete(controller)) setStatus("Part placed.");
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
      if (panel.parent !== leftHandGrip || !panel.visible) attachPanelToLeftHand();
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

function updateHandTracking(xrFrame) {
  if (!xrFrame || !renderer.xr.isPresenting) return;
  const session = renderer.xr.getSession();
  const referenceSpace = renderer.xr.getReferenceSpace();
  if (!session || !referenceSpace) return;

  const inputSources = Array.from(session.inputSources || []);
  const leftInput = inputSources.find((source) => source.handedness === "left" && source.hand);
  leftHandMenuActive = Boolean(leftInput);

  // Put the editor panel just above the tracked left wrist and keep its face
  // turned toward the headset, like a wrist-mounted floating display.
  if (leftInput) {
    const leftJointSpaces = getHandJointMap(leftInput);
    const wristSpace = leftJointSpaces.get("wrist");
    const wristPose = wristSpace ? xrFrame.getJointPose(wristSpace, referenceSpace) : null;
    if (wristPose) {
      const wrist = wristPose.transform.position;
      const xrCamera = renderer.xr.getCamera(camera);
      const viewerPosition = xrCamera.getWorldPosition(new THREE.Vector3());
      if (panel.parent !== scene) {
        panel.removeFromParent();
        scene.add(panel);
      }
      const wasVisible = panel.visible;
      panel.position.set(wrist.x, wrist.y + 0.14, wrist.z);
      panel.lookAt(viewerPosition);
      panel.scale.setScalar(0.32);
      panel.visible = true;
      panelReady = true;
      if (!leftHandGrip) statusText = "LEFT HAND MENU · Point and pinch buttons; pinch near a part to grab it.";
      if (!wasVisible) redrawPanel();
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
      state = { pinching: false };
      handPinchStates.set(input, state);
    }

    if (!state.pinching && distance < 0.035) {
      state.pinching = true;
      const node = nearestNodeToHand(proxy, 0.34);
      if (node) {
        node.group.updateMatrixWorld(true);
        const offset = proxy.matrixWorld.clone().invert().multiply(node.group.matrixWorld);
        handDragStates.set(input, { node, proxy, offset });
        choose(node);
        setStatus(`Pinching ${node.item.itemID}. Move your hand; release your fingers to place it.`);
      }
    } else if (state.pinching && distance > 0.065) {
      state.pinching = false;
      if (handDragStates.delete(input)) setStatus("Part placed.");
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
    const desiredWorld = tempMatrix2.copy(drag.proxy.matrixWorld).multiply(drag.offset);
    const parent = drag.node.group.parent;
    parent.updateMatrixWorld(true);
    const local = tempMatrix.copy(parent.matrixWorld).invert().multiply(desiredWorld);
    local.decompose(drag.node.position, drag.node.quaternion, tempScale);
    drag.node.group.position.copy(drag.node.position);
    drag.node.group.quaternion.copy(drag.node.quaternion);
  }
}

$("enterVR").addEventListener("click", async () => {
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
    $("landing").hidden = true;
    panel.visible = false;
    setStatus("VR started. Connecting the left-hand menu…");
    session.addEventListener("end", () => {
      panel.visible = false;
      panelReady = false;
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
renderer.setAnimationLoop((time, xrFrame) => {
  if (renderer.xr.isPresenting) {
    if (!leftHandMenuActive && !panel.visible) refreshLeftHandAttachment();
    updateHandTracking(xrFrame);
  }
  updateDrags();
  renderer.render(scene, camera);
});
setStatus(statusText);
