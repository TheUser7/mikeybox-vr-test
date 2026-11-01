import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { TransformControls } from "three/addons/controls/TransformControls.js";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import * as RULES from "./goop_rules.mjs";
// The shared goop build validator (owner 2026-10-26): the same decision as the Workshop, the Workers and the game.
import * as VALIDATOR from "./goop_build_validator.mjs";
import { GOOP_BUILD_POLICY as BUILD_POLICY } from "./goop_build_policy.mjs";
import { generatePattern, generateRingCopies } from "./pattern_geometry.mjs";
import { planItemReplacement } from "./item_replacement.mjs";
import { planInventionImport } from "./invention_import.mjs";
import { planInventionMerge, planInventionSplit, uniqueInventionName } from "./invention_split.mjs";
import { planSelectionScale } from "./selection_scale.mjs";
import { applyColorToSelection } from "./selection_color.mjs";
import { FIELD_SIZE, closestSetting, colorName, cssToLinear, defaultPaletteIndex, effectiveLinear, linearToCss, pixelFor,
  renderField, sampleSurfaceColors, seededRandom, settingAt, staysBlack, surfacePalette } from "./color_picker.mjs";
import { editInspectorPose, isInspectorPoseField, planInspectorGroupPose, turnAboutCentre } from "./inspector_pose.mjs";
import { planBridge, defaultChildEdge, defaultParentEdge } from "./bridge_plan.mjs";
import { useGameHandedCamera, invertFrontFaceWinding, mirroredPointerElement, setFrontFaceInversion } from "./game_view.mjs";
import { SIDES, FINGERS, jointKeys, jointLabel, jointPaths, emptyGhostPose, normalizeGhostPose, posedGhostRig,
  setHeadYawPitchRoll, headYawPitchRoll, setHandOffsetAndTurn, handOffsetAndTurn, setHandTargetWorld,
  setHeadWorldRotation, rotateArmAboutJoint, mirrorGhostPose, applyPosePreset, POSE_PRESETS,
  jointRotation, setJointRotation } from "./ghost_pose.mjs";
import { DEFAULT_ANGLE_STEP_RAD, angleUnitSuffix, editQuaternionComponent, formatAngle, formatQuaternionComponent,
  fromDisplayAngle, normalizeAngleUnit, normalizeRotationDisplay, parseAngleStep, snapAngle, snapQuaternionAngle,
  toDisplayAngle } from "./angle_units.mjs";
import { EditorHistory, editorDocumentSignature } from "./editor_history.mjs";
import { captureSelectedForest, captureSelectedParts, editorClipboardShortcut } from "./editor_clipboard.mjs";
import { AUTO_MIN_DEGREES, meshEdges, squareUpTurn } from "./square_up.mjs";
import { RecoveryStore } from "./recovery_store.mjs";
import { matrix4, multiply4, inverseAffine4, multiplyQuat, posedBoneMatrices, posedPlayerAnchorMatrix, skinMeshPositions } from "./arm_pose_math.mjs";
import { DEFAULT_GRID_STEP_METERS, parseGridStep, snappedWorldPosition, gridVisualSpec } from "./grid_snap.mjs";
import { InventionWorkspace, isWorkspaceProject } from "./workspace_model.mjs";
import * as HOLDER from "./holder_pose.mjs";
import * as FILM from "./film_gear.mjs";
import * as MOTION from "./moving_parts.mjs";
import * as COM from "./center_of_mass.mjs";
import { ITEM_VALUES } from "./item_values.mjs";
import { computeWorkspaceOffsets } from "./workspace_layout.mjs";
import { float32SecondsToStateBits, stateBitsToFloat32Seconds } from "./state_bits.mjs";
import { isStateBitSet, setStateBit, parseShredderProgress } from "./state_rules.mjs";
import { appendContainedItem, fillContainedItems, getContainedContainer, getContainedItem, listDirectContents,
  parseContainedFieldValue, randomItemIDs, randomizeContainedColors, randomizeContainedSizes, removeContainedItem,
  setContainedItemField } from "./contained_item_editor.mjs";
import { decodeHandExplosive, decodeTeleGrenade, objectIdToSignedAmmo,
  parseGrenadeFuseTicks, setHandExplosivePin, setHandExplosivePaused,
  setTeleGrenadePin, setTeleGrenadeSessionTag, setTeleGrenadeTicks } from "./grenade_state.mjs";
import { MAX_WORKSHOP_TAGS, WORKSHOP_TAGS, normalizeWorkshopTag } from "./workshop_tags.mjs";
import { WorkshopApi, workshopOriginFor, workshopEditorLink, crossSiteFor, TRANSFER_MESSAGES, newTransferNonce,
  isTransferNonce, acceptTransferMessage, transferReceiveLink, sameWorkshopAccount } from "./workshop_client.mjs";
import { LiveWorkspaceClient } from "./workshop_live_client.mjs";

// Pose and scale rules are in goop_rules.mjs. Exported meshes, item roots, and stuck edges all use the game's
// Y-up/Z-forward item-local basis. The joystick stick has a rotated ancestor, so its +Z edge axis is +Y on the item.
// Captured posePos/poseRot anchors survive edits; changing scale re-encodes child edges from their displayed poses.
//  - Guns: new guns are authored LOADED (legacy ammo 999999; per-item current-build caps come from the export); "Load all guns"
//    fixes a whole file; the validator flags any gun that would spawn empty.
//  - Contents: a container's INVENTORY (backpack / quiver contents, the crossbow's held item) is the native `children`
//    array (our loader's `containerContents` is folded in on load). The Contents panel edits it.
//  - Validation panel: unknown ids (items.txt), null-itemData ids, banned ids, the 512-part total (the only blocking stash
//    rule; a stash warning only when the paced spawner's normalizer cannot make the result stash-safe), machine-save
//    caps (32 total / 16 per capped prop), contents caps (30 per container / 4 deep), bad sub-parents, offset-row
//    parents, root-scale stacking, self-moving items.
//  - Works without the local server too (static hosting): manifest / items fall back to static files, Save falls back
//    to Download. That is the first step toward hosting the editor.

const $ = (id) => document.getElementById(id);
const viewport = $("viewport");
const statusEl = $("status");

const state = {
  manifest: null,
  scaleManifest: null,
  scaleManifestWarning: "",
  entries: [],
  idsWithoutModels: [],
  knownIds: null,
  catalogById: new Map(),
  catalogMetadata: new Map(),
  bannedIds: new Set(),
  selectedEntry: null,
  objects: [],
  documents: [],
  activeDocumentId: null,
  nextDocumentId: 1,
  selected: null,
  selectedUids: new Set(),
  contentEditorRecordUid: null,
  contentPath: [],
  contentSelectedIndex: null,
  loadedScanMeta: null,
  safeZoneTimerSelectionUid: null,
  safeZoneTimerMode: null,
  selectionGroups: [],
  parentTargetUid: null,
  nextUid: 1,
  sceneEpoch: 0,
  mode: "translate",
  gridStep: DEFAULT_GRID_STEP_METERS,
  gridSnapEnabled: false,
  gridVisible: true,
  showCenterOfMass: true,   // owner 2026-10-23: each invention's balance point (center_of_mass.mjs)
  // Owner 2026-10-25: Duplicate and Paste keep a copied root in its own invention, as a part stuck to that root.
  keepCopiesInInvention: true,
  massError: "",
  // Angles (Grid/Snap > Angles): every mouse rotation snaps to the step; fields show degrees, radians or quaternions.
  angleSnapEnabled: true,
  // Turn in place (owner 2026-10-09): rotations turn each selected part about its own model centre, so it stays where it
  // sits on its parent. Off = the old pivot (a single part's origin, or the selection's centre).
  rotateInPlace: false,
  // Children stay (owner 2026-10-29): Move and Rotate (handles and typed values) move only the selected parts; the parts
  // attached under them keep their place in the world. Off = a moved part carries everything attached under it.
  childrenStay: false,
  // Square up new parts (owner 2026-10-26): a catalog item whose model sits tilted in the game (the police baton's side
  // handle) is turned so its straight lines run along X, Y and Z when it is added.
  squareUpNew: true,
  angleStepRad: DEFAULT_ANGLE_STEP_RAD,
  angleUnit: "deg",
  rotationDisplay: "euler",
  modelCache: new Map(),
  playerRigs: null,
  avatarMesh: null,
  avatarMeshScene: null,
  avatarArmSkin: null,
  avatarArmPose: null,
  armPoseRevision: 0,
  avatarPoseAppliedRevision: -1,
  robotPoseCache: new Map(),
  robotArmSkins: new Map(),
  ghostPose: emptyGhostPose(),
  ghostCrossbow: { itemID: "", slot: "handRight", scaleModifier: 0 },
  holderManifest: null,
  holderError: "",
  filmManifest: null,
  filmError: "",
  poseUi: { active: false, joint: "wrist.right", tool: "move", headTool: "turn", finger: null },
  // Owner 2026-10-21: toolbar toggles that stand in for Shift/Ctrl (add), Alt (single parts) and Shift + right-drag (box),
  // so phones, tablets and the Quest browser can do everything a keyboard can.
  selectionOptions: { add: false, single: false, box: false },
  panView: false,   // one-pointer drag pans the camera (right-drag on a mouse); for the Quest browser and touch screens
  referenceActive: false,
  referenceMoved: false,
  groupTransform: null,
  scaleEdit: null,
  serverApi: true,
  lastValidation: null
};
const editorHistory = new EditorHistory(40);
let workshopApi = null;
let workshopIdentity = null;
let workshopProject = null;
let workshopLive = null;
let crossSite = null;         // this site and its partner (Prime <-> Fabrication)
let peerWorkshopApi = null;   // the partner site's Workshop
let peerIdentity = null;
let historyRestoring = false;
let historyGroupPending = false;
let objectClipboard = null;
const RECOVERY_INTERVAL_MS = 5 * 60 * 1000;
const RECOVERY_FIRST_EDIT_DELAY_MS = 2 * 1000;
const RECOVERY_FORMAT_VERSION = 1;
const recovery = {
  store: null, sessionId: null, ready: false, latestFingerprint: null,
  lastSavedAt: 0, firstEditTimer: null, saveChain: Promise.resolve(), error: null,
  sessionHasBackup: false, pendingAfterGroup: false, initPromise: null, count: 0
};

const loader = new GLTFLoader();
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0b0d10);
const selectionPivot = new THREE.Group();
selectionPivot.name = "selection_pivot";
selectionPivot.visible = false;
scene.add(selectionPivot);

// Scene data stays in Unity's left-handed numbers; game_view.mjs draws them as the game does.
const camera = useGameHandedCamera(new THREE.PerspectiveCamera(55, 1, 0.02, 1000));
camera.position.set(2.7, 2.1, 3.4);

const renderer = invertFrontFaceWinding(new THREE.WebGLRenderer({ antialias: true }));
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
renderer.xr.enabled = true;   // only the moving-parts VR preview presents; until then nothing changes
viewport.appendChild(renderer.domElement);

const orbit = new OrbitControls(camera, mirroredPointerElement(renderer.domElement));
orbit.target.set(0, 0.35, 0);
orbit.enableDamping = true;

const transform = new TransformControls(camera, renderer.domElement);
transform.setRotationSnap(THREE.MathUtils.degToRad(15));
// Ghost posing has its own gizmo on a proxy at the chosen joint, so posing
// never moves inventions and item editing never moves the ghost.
const poseProxy = new THREE.Object3D();
poseProxy.name = "ghost_pose_proxy";
const poseGizmo = new TransformControls(camera, renderer.domElement);
poseGizmo.setSize(0.7);
poseGizmo.setSpace("local");
transform.addEventListener("dragging-changed", (event) => {
  orbit.enabled = !event.value;
  if (transform.object === referenceGorilla && !event.value) { updateGhostPreview(); observeEditorHistory(); }
  else if (transform.object !== referenceGorilla) {
    if (event.value) { beginEditorHistoryGroup(); beginGroupTransform(); }
    else { endGroupTransform(); endEditorHistoryGroup(); refreshPreview(); }
  }
});
transform.addEventListener("objectChange", () => {
  if (transform.object === referenceGorilla) {
    state.referenceMoved = true;
    syncReferenceFields();
    return;
  }
  if (state.mode === "translate" && state.gridSnapEnabled) snapTransformObjectToGrid();
  const active = transformableSelectionRecords();
  if (!active.length) return;
  if (active.length > 1 || transform.object === selectionPivot) {   // several parts, or one part turned in place
    applyGroupTransform();
    syncInspectorFromSelection();
    renderHierarchyTree();
    renderSelectionList();
    refreshPreview();
    return;
  }
  const target = active[0];
  if (state.mode === "scale") {
    const s = target.group.scale;
    const avg = Math.max(0.05, (Math.abs(s.x) + Math.abs(s.y) + Math.abs(s.z)) / 3);
    const oldScale = target.scaleModifier;
    target.scaleModifier = scalarToScaleModifier(avg * scaleModifierToScalar(target.scaleModifier, target.itemID), target.itemID);
    target.group.scale.set(1, 1, 1);
    if (target.scaleModifier !== oldScale) { markTransformDirty(target); markChildEdgesDirty(target); }
    applyObjectVisualState(target);
  } else if (state.mode === "translate" || state.mode === "rotate") {
    markTransformDirty(target);
  }
  syncInspectorFromSelection();
  renderHierarchyTree();
  renderSelectionList();
  refreshPreview();
});
scene.add(transform);
scene.add(poseProxy);
scene.add(poseGizmo);
poseGizmo.addEventListener("dragging-changed", (event) => {
  orbit.enabled = !event.value && !transform.dragging;
  if (event.value) beginEditorHistoryGroup();
  else { endEditorHistoryGroup(); syncPoseGizmo(); }
});
poseGizmo.addEventListener("objectChange", onPoseGizmoChange);

const hemi = new THREE.HemisphereLight(0xffffff, 0x384050, 1.9);
scene.add(hemi);
const key = new THREE.DirectionalLight(0xffffff, 2.2);
key.position.set(3, 5, 4);
scene.add(key);
const fill = new THREE.DirectionalLight(0x8ecaff, 0.9);
fill.position.set(-4, 2, -3);
scene.add(fill);

let grid = new THREE.GridHelper(8, 32, 0x506070, 0x242a33);
scene.add(grid);
const axes = new THREE.AxesHelper(0.6);
scene.add(axes);

const GRID_PREFERENCE_KEY = "mikeybox.goopEditor.grid.v1";

function snapTransformObjectToGrid() {
  const object = transform.object;
  if (!object || !transform.axis) return;
  const world = object.getWorldPosition(new THREE.Vector3());
  const next = snappedWorldPosition([world.x, world.y, world.z], transform.axis, state.gridStep);
  if (next[0] === world.x && next[1] === world.y && next[2] === world.z) return;
  const local = new THREE.Vector3(...next);
  if (object.parent) object.parent.worldToLocal(local);
  object.position.copy(local);
  object.updateMatrixWorld(true);
}

function refreshGridVisual() {
  const spec = gridVisualSpec(state.gridStep);
  if (!spec) { grid.visible = false; return; }
  scene.remove(grid);
  grid.geometry.dispose();
  for (const material of Array.isArray(grid.material) ? grid.material : [grid.material]) material.dispose();
  grid = new THREE.GridHelper(spec.size, spec.divisions, 0x506070, 0x242a33);
  grid.visible = state.gridVisible;
  scene.add(grid);
}

function saveGridPreference() {
  try {
    localStorage.setItem(GRID_PREFERENCE_KEY, JSON.stringify({
      step: state.gridStep, enabled: state.gridSnapEnabled, visible: state.gridVisible,
    }));
  } catch (_) { /* Private browsing can deny storage; snapping still works. */ }
}

function bindGridControls() {
  try {
    const saved = JSON.parse(localStorage.getItem(GRID_PREFERENCE_KEY) || "null");
    const step = parseGridStep(saved?.step);
    if (step !== null) state.gridStep = step;
    if (typeof saved?.enabled === "boolean") state.gridSnapEnabled = saved.enabled;
    if (typeof saved?.visible === "boolean") state.gridVisible = saved.visible;
  } catch (_) { /* Use defaults when browser storage is unavailable. */ }
  $("gridStepInput").value = String(state.gridStep);
  $("gridSnapToggle").checked = state.gridSnapEnabled;
  $("gridSnapDialogToggle").checked = state.gridSnapEnabled;
  $("gridVisibleToggle").checked = state.gridVisible;
  refreshGridVisual();
  $("gridSettingsBtn").addEventListener("click", () => $("gridDialog").showModal());
  $("gridCloseBtn").addEventListener("click", () => $("gridDialog").close());
  $("gridStepInput").addEventListener("change", (event) => {
    const step = parseGridStep(event.target.value);
    if (step === null) {
      event.target.value = String(state.gridStep);
      setStatus("Grid step must be a positive number of metres.", "bad");
      return;
    }
    state.gridStep = step;
    refreshGridVisual();
    saveGridPreference();
    setStatus(`Grid step set to ${step} m${state.gridSnapEnabled ? "; mouse moves snap to world grid" : ""}.`);
  });
  const setSnapEnabled = (enabled) => {
    $("gridSnapToggle").checked = enabled;
    $("gridSnapDialogToggle").checked = enabled;
    state.gridSnapEnabled = enabled;
    saveGridPreference();
    setStatus(enabled ? `Mouse moves snap to the ${state.gridStep} m world grid.` : "Mouse move grid snap off.");
  };
  for (const id of ["gridSnapToggle", "gridSnapDialogToggle"]) $(id).addEventListener("change", (event) => {
    setSnapEnabled(event.target.checked);
  });
  $("gridVisibleToggle").addEventListener("change", (event) => {
    state.gridVisible = event.target.checked;
    grid.visible = state.gridVisible;
    saveGridPreference();
    setStatus(state.gridVisible ? "World grid shown." : "World grid hidden; snap setting is unchanged.");
  });
}

// ---- Angles: snap step, units, and how 3D rotations are shown ----
// One setting for every mouse rotation (item Rotate handles, the pose gizmo, joint drags), like Snap to grid for moves.
const ANGLE_PREFERENCE_KEY = "mikeybox.goopEditor.angles.v1";
const KEEP_COPIES_PREFERENCE_KEY = "mikeybox.goopEditor.keepCopiesInInvention.v1";
const SQUARE_UP_PREFERENCE_KEY = "mikeybox.goopEditor.squareUpNew.v1";
const CHILDREN_STAY_PREFERENCE_KEY = "mikeybox.goopEditor.childrenStay.v1";

function saveAnglePreference() {
  try {
    localStorage.setItem(ANGLE_PREFERENCE_KEY, JSON.stringify({ enabled: state.angleSnapEnabled, stepRad: state.angleStepRad,
      unit: state.angleUnit, display: state.rotationDisplay, inPlace: state.rotateInPlace }));
  } catch (_) { /* Private browsing can deny storage; the settings still apply this session. */ }
}

function angleSnapStep() { return state.angleSnapEnabled ? state.angleStepRad : 0; }

function angleStepText() {
  return `${formatAngle(state.angleStepRad, state.angleUnit, { digits: state.angleUnit === "rad" ? 4 : 2 })}${angleUnitSuffix(state.angleUnit)}`;
}

function applyAngleSettings() {
  const step = angleSnapStep() || null;
  transform.setRotationSnap(step);
  poseGizmo.setRotationSnap(step);
  $("angleSnapToggle").checked = state.angleSnapEnabled;
  $("rotateInPlaceToggle").checked = state.rotateInPlace;
  $("angleSnapDialogToggle").checked = state.angleSnapEnabled;
  $("angleSnapStepLabel").textContent = angleStepText();
  if (document.activeElement !== $("angleStepInput")) {
    $("angleStepInput").value = formatAngle(state.angleStepRad, state.angleUnit, { digits: state.angleUnit === "rad" ? 6 : 4 });
  }
  $("angleStepUnit").textContent = state.angleUnit === "rad" ? "radians" : "degrees";
  $("angleUnitSelect").value = state.angleUnit;
  $("rotationDisplaySelect").value = state.rotationDisplay;
  syncRotationFieldUnits();
}

function setLabelText(input, text) {
  const label = input?.closest("label");
  const node = label && [...label.childNodes].find((child) => child.nodeType === Node.TEXT_NODE && child.nodeValue.trim());
  if (node) node.nodeValue = text;
}

// Field labels, steps and which rotation rows are shown follow the angle unit and rotation display.
function syncRotationFieldUnits() {
  const rad = state.angleUnit === "rad";
  const unit = rad ? " (rad)" : " °";
  for (const [id, axis] of [["rotX", "X"], ["rotY", "Y"], ["rotZ", "Z"]]) setLabelText($(id), `Rot ${axis}${unit}`);
  const quat = state.rotationDisplay === "quat";
  $("rotEulerRow").hidden = quat;
  $("rotQuatRow").hidden = !quat;
  for (const [id, name, limit] of [["ghostPoseYaw", "Yaw", 180], ["ghostPosePitch", "Pitch", 90], ["ghostPoseRoll", "Roll", 180]]) {
    setLabelText($(id), `${name}${unit}`);
    $(id).step = rad ? "0.01" : "5";
    $(id).min = String(rad ? -limit * Math.PI / 180 : -limit);
    $(id).max = String(rad ? limit * Math.PI / 180 : limit);
  }
  for (const id of ["activeDocumentYaw", "referenceYaw"]) {
    setLabelText($(id), `Yaw${unit}`);
    $(id).step = rad ? "0.01" : "1";
  }
}

function setAngleSettings(next, message = "") {
  const unitChanged = next.unit !== undefined && normalizeAngleUnit(next.unit) !== state.angleUnit;
  if (next.enabled !== undefined) state.angleSnapEnabled = !!next.enabled;
  if (next.stepRad !== undefined) state.angleStepRad = next.stepRad;
  if (next.unit !== undefined) state.angleUnit = normalizeAngleUnit(next.unit);
  if (next.display !== undefined) state.rotationDisplay = normalizeRotationDisplay(next.display);
  applyAngleSettings();
  saveAnglePreference();
  if (unitChanged || next.display !== undefined) {
    syncInspectorFromSelection();
    syncPoseFields();
    renderDocumentList();
    syncReferenceFields();
  }
  if (message) setStatus(message);
}

function bindAngleControls() {
  try {
    const saved = JSON.parse(localStorage.getItem(ANGLE_PREFERENCE_KEY) || "null");
    if (typeof saved?.enabled === "boolean") state.angleSnapEnabled = saved.enabled;
    if (Number(saved?.stepRad) > 0 && Number(saved.stepRad) <= 2 * Math.PI) state.angleStepRad = Number(saved.stepRad);
    if (saved?.unit) state.angleUnit = normalizeAngleUnit(saved.unit);
    if (saved?.display) state.rotationDisplay = normalizeRotationDisplay(saved.display);
    if (typeof saved?.inPlace === "boolean") state.rotateInPlace = saved.inPlace;
  } catch (_) { /* Use defaults when browser storage is unavailable. */ }
  applyAngleSettings();
  $("rotateInPlaceToggle").addEventListener("change", (event) => {
    state.rotateInPlace = event.target.checked;
    saveAnglePreference();
    attachTransformToSelection();
    setStatus(state.rotateInPlace
      ? "Turn in place: Rotate and the rotation fields turn each selected part about its own centre, so it stays where it is."
      : "Turn in place off: a part turns about its origin, and several parts turn about the selection's centre.");
  });
  for (const id of ["angleSnapToggle", "angleSnapDialogToggle"]) $(id).addEventListener("change", (event) => {
    setAngleSettings({ enabled: event.target.checked }, event.target.checked
      ? `Mouse rotations snap every ${angleStepText()}.` : "Angle snap off: mouse rotations are smooth.");
  });
  $("angleStepInput").addEventListener("change", (event) => {
    const step = parseAngleStep(event.target.value, state.angleUnit);
    if (step === null) {
      applyAngleSettings();
      setStatus(`Angle step must be a positive angle up to one full turn (${state.angleUnit === "rad" ? "6.2832 rad" : "360°"}).`, "bad");
      return;
    }
    setAngleSettings({ stepRad: step }, `Angle step set to ${formatAngle(step, state.angleUnit, { digits: state.angleUnit === "rad" ? 4 : 2 })}${angleUnitSuffix(state.angleUnit)}.`);
  });
  $("angleUnitSelect").addEventListener("change", (event) => {
    setAngleSettings({ unit: event.target.value }, event.target.value === "rad" ? "Angles shown in radians." : "Angles shown in degrees.");
  });
  $("rotationDisplaySelect").addEventListener("change", (event) => {
    setAngleSettings({ display: event.target.value }, event.target.value === "quat"
      ? "3D rotations shown as quaternions (x, y, z, w). Typing one component keeps it exact and rescales the others."
      : "3D rotations shown as angles.");
  });
}

const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();

// A visual-only placement reference. Avatar GLBs are mirrored on X by UnityPy's
// mesh export, while the authored attachment matrices are in native Unity space.
// Undo that mesh-only mirror before placing an avatar beside those anchors.
const ghostRig = new THREE.Group();
ghostRig.name = "ghost_player_preview";
ghostRig.visible = false;
scene.add(ghostRig);
// The optional movable, textured wearer is this same rig. Its back, hip, and
// hand copies keep using the game-derived anchors and remain selectable.
const referenceGorilla = ghostRig;
const ghostBody = new THREE.Group();
ghostRig.add(ghostBody);
const wornInvention = new THREE.Group();
ghostRig.add(wornInvention);
const ghostPlacement = { key: null, x: 1.45 };   // last solved side-by-side X and what it was solved for
// Clickable joint handles, drawn in the rig's AvatarView space on top of everything.
const poseHandles = new THREE.Group();
poseHandles.name = "ghost_pose_handles";
poseHandles.visible = false;
poseHandles.matrixAutoUpdate = false;
ghostRig.add(poseHandles);
const POSE_HANDLE_COLORS = { center: 0xffd34d, left: 0x4dd2ff, right: 0xff6fa3 };
const poseHandleGeometry = new THREE.SphereGeometry(1, 12, 8);
let wornCopy = null;
const wornCopies = new Map();
const workspaceOffsets = new Map();
const ghostLines = new THREE.Group();
scene.add(ghostLines);
const previewLinePool = [];
const ghostMaterial = new THREE.MeshBasicMaterial({ color: 0x8ddfff, transparent: true, opacity: 0.4, depthTest: false, depthWrite: false, side: THREE.DoubleSide });
const avatarMeshToGameBasis = new THREE.Matrix4().makeScale(-1, 1, 1);
const ghostLineMaterial = new THREE.LineBasicMaterial({ color: 0x68d9ff, transparent: true, opacity: 0.8, depthTest: false });
const laserLineMaterial = new THREE.LineBasicMaterial({ color: 0xff536c, transparent: true, opacity: 0.72, depthTest: false });
const ghostTargetMarker = new THREE.Mesh(new THREE.SphereGeometry(0.055, 10, 8), new THREE.MeshBasicMaterial({ color: 0xffe66c, depthTest: false }));
ghostTargetMarker.visible = false;
scene.add(ghostTargetMarker);
const GHOST_ANCHORS = {
  back: [0, 1.2, -0.23], hipLeft: [-0.3, 0.85, 0], hipRight: [0.3, 0.85, 0],
  handLeft: [-0.53, 1.13, 0.24], handRight: [0.53, 1.13, 0.24]
};
const GHOST_PROPORTIONS = {
  generic: [1, 1, 1], gorilla: [1.2, 0.94, 1.06], kitten: [0.78, 0.86, 0.86],
  shark: [0.98, 1.03, 1.08], shepherd: [0.96, 1, 0.98], trex: [1.1, 1.04, 1.13]
};

function matrixFromRows(rows) {
  if (!Array.isArray(rows) || rows.length !== 4 || rows.some((row) => !Array.isArray(row) || row.length !== 4)) return new THREE.Matrix4();
  return new THREE.Matrix4().set(...rows.flat().map(Number));
}

function selectedAvatar() {
  return state.playerRigs?.avatars?.find((avatar) => avatar.animal_id === $("ghostAnimal")?.value) || null;
}

async function loadPlayerRigs() {
  try {
    const res = await fetch("./exported_player_rigs_manifest.json", { cache: "no-cache" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const rigs = await res.json();
    if (rigs.schema !== "ac.goop-editor-player-rigs.v1" || !Array.isArray(rigs.avatars) || !rigs.avatars.length) throw new Error("invalid rig manifest");
    if (!["openxr", "standard"].every((profile) => ["handLeft", "handRight"].every((hand) =>
      Array.isArray(rigs.hand_follow_profiles?.[profile]?.[hand]?.matrix)))) {
      throw new Error("hand tracking profiles missing from current rig export");
    }
    state.playerRigs = rigs;
    const picker = $("ghostAnimal");
    picker.replaceChildren();
    for (const avatar of rigs.avatars) {
      const option = document.createElement("option");
      option.value = avatar.animal_id;
      option.textContent = avatar.animal_id.replace(/^animal_/, "").replace(/_/g, " ").replace(/\b\w/g, (x) => x.toUpperCase());
      picker.appendChild(option);
    }
    picker.value = "animal_gorilla";
    await loadAvatarMesh();
  } catch (err) {
    $("ghostRigNote").textContent = `Game avatar export unavailable (${err.message}); using the approximate silhouette.`;
  }
}

async function loadAvatarMesh() {
  const avatar = selectedAvatar();
  if (!avatar) return;
  const wanted = avatar.animal_id;
  try {
    const [gltf, armSkin] = await Promise.all([
      loader.loadAsync("./exported_player_rigs/" + encodeURIComponent(avatar.glb)),
      avatar.arm_skin?.file
        ? fetch("./exported_player_rigs/" + encodeURIComponent(avatar.arm_skin.file)).then(async (res) => {
          if (!res.ok) throw new Error(`avatar arm pose HTTP ${res.status}`);
          return res.json();
        })
        : Promise.resolve(null),
    ]);
    if (selectedAvatar()?.animal_id !== wanted) return;
    if (armSkin && (armSkin.schema !== "ac.goop-editor-arm-skin.v1" || armSkin.glbSha256 !== avatar.sha256)) {
      throw new Error(`arm pose data does not match ${wanted} mesh`);
    }
    gltf.scene.traverse((part) => {
      if (part.isMesh) {
        part.userData.gameMaterial = part.material;
        part.material = ghostMaterial;
        part.castShadow = false;
        part.receiveShadow = false;
        part.renderOrder = 10; // Keep the wearer visible even inside a bulky invention.
      }
    });
    ghostBody.clear();
    const avatarPlacement = matrixFromRows(state.playerRigs.player_anchors.avatar.matrix);
    gltf.scene.matrixAutoUpdate = false;
    gltf.scene.matrix.copy(avatarPlacement).multiply(avatarMeshToGameBasis);
    ghostBody.scale.set(1, 1, 1);
    ghostBody.add(gltf.scene);
    syncWearerMaterial();
    state.avatarMesh = wanted;
    state.avatarMeshScene = gltf.scene;
    state.avatarArmSkin = armSkin;
    state.armPoseRevision++;
    state.robotPoseCache.clear();
    for (const document of state.documents) applyDocumentPreviewPlacement(document);
    updateGhostPreview();
    syncPoseFields();
    syncPoseGizmo();
  } catch (err) {
    if (selectedAvatar()?.animal_id !== wanted) return;
    state.avatarMesh = null;
    state.avatarMeshScene = null;
    state.avatarArmSkin = null;
    state.avatarArmPose = null;
    ghostBody.clear();
    buildGhostBody();
    updateGhostPreview();
    $("ghostRigNote").textContent = `Could not load ${wanted} mesh (${err.message}).`;
  }
}

function syncWearerMaterial() {
  const textured = !!$("showGorillaReference")?.checked;
  ghostBody.traverse((part) => {
    if (!part.isMesh || !part.userData.gameMaterial) return;
    part.material = textured ? part.userData.gameMaterial : ghostMaterial;
    part.renderOrder = textured ? 0 : 10;
  });
  $("gorillaReferenceNote").textContent = textured
    ? "This one movable game avatar carries every attached invention. Its exported hand pose can differ from live controller tracking. Moving the preview never edits game JSON."
    : "Enable a movable, textured version of the same wearer used for back, hip, and hand previews.";
}

function syncReferenceFields() {
  for (const [axis, value] of [["X", referenceGorilla.position.x], ["Y", referenceGorilla.position.y], ["Z", referenceGorilla.position.z]]) {
    $("reference" + axis).value = Number(value.toFixed(3));
  }
  $("referenceYaw").value = formatAngle(referenceGorilla.rotation.y, state.angleUnit);
  $("referenceScale").value = Number(referenceGorilla.scale.x.toFixed(3));
}

function applyReferenceFields() {
  state.referenceMoved = true;
  referenceGorilla.position.set(...["X", "Y", "Z"].map((axis) => Number($("reference" + axis).value) || 0));
  referenceGorilla.rotation.y = fromDisplayAngle($("referenceYaw").value, state.angleUnit) || 0;
  const scale = clamp(Number($("referenceScale").value) || 1, 0.1, 5);
  referenceGorilla.scale.setScalar(scale);
  referenceGorilla.updateMatrixWorld(true);
  updateGhostPreview();
}

function setReferenceMoveActive(active) {
  state.referenceActive = !!(active && referenceGorilla.visible);
  $("moveGorillaReferenceBtn").classList.toggle("active", state.referenceActive);
  $("moveGorillaReferenceBtn").textContent = state.referenceActive ? "Stop moving wearer" : "Move wearer in view";
  attachTransformToSelection();
  if (state.referenceActive) setStatus("Move the wearer and all its attached previews. This does not change saved invention poses.");
}

function handFollowCorrectionMatrix(key) {
  const profile = $("handTrackingProfile")?.value === "standard" ? "standard" : "openxr";
  return matrixFromRows(state.playerRigs?.hand_follow_profiles?.[profile]?.[key]?.matrix);
}

// posed=false gives the anchor at the ghost's rest pose. Each invention's saved
// preview offset is relative to that rest anchor, so posing the ghost moves the
// worn copy without rewriting any document's preview data.
function playerAnchorMatrix(key, posed = true) {
  const real = selectedAvatar()?.player_anchors?.[key] || state.playerRigs?.player_anchors?.[key];
  if (real && !posed) {
    const anchor = matrixFromRows(real.matrix);
    return key === "handLeft" || key === "handRight" ? anchor.multiply(handFollowCorrectionMatrix(key)) : anchor;
  }
  if (real) {
    const anchor = matrixFromRows(real.matrix);
    if (key === "handLeft" || key === "handRight") {
      const side = key === "handLeft" ? "left" : "right";
      const handPath = state.avatarArmSkin?.poseControls?.[side]?.hand;
      const handBone = state.avatarArmSkin?.bones?.find((bone) => bone.path === handPath);
      // A held item follows the controller (the hand target), not the IK'd hand
      // bone: when the arm cannot reach, the game leaves the item at the target.
      const posedHand = handPath && (state.avatarArmPose?.handTargets?.[side] || state.avatarArmPose?.worldByPath.get(handPath));
      if (handBone && posedHand) {
        // Arm skin bones are AvatarView-local; the item anchor lives in the
        // player root. Conjugate the hand delta through AvatarView placement.
        const pose = posedPlayerAnchorMatrix(state.playerRigs.player_anchors.avatar.matrix,
          handBone.worldBindMatrix, posedHand, real.matrix);
        return new THREE.Matrix4().set(...pose).multiply(handFollowCorrectionMatrix(key));
      }
      return anchor.multiply(handFollowCorrectionMatrix(key));
    }
    // Back and hip attach points follow the Spine bone (SkinnedAttachmentPoint),
    // which hangs from the head: turning the head tilts worn items with the body.
    const spinePath = state.avatarArmSkin && jointPaths(state.avatarArmSkin).get("spine");
    const spineBone = spinePath && state.avatarArmSkin.bones.find((bone) => bone.path === spinePath);
    const posedSpine = spinePath && state.avatarArmPose?.worldByPath.get(spinePath);
    if (spineBone && posedSpine) {
      return new THREE.Matrix4().set(...posedPlayerAnchorMatrix(state.playerRigs.player_anchors.avatar.matrix,
        spineBone.worldBindMatrix, posedSpine, real.matrix));
    }
    return anchor;
  }
  return new THREE.Matrix4().makeTranslation(...(GHOST_ANCHORS[key] || GHOST_ANCHORS.back));
}

function applyArmSkinToScene(sceneRoot, sidecar, posed, cloneGeometry = false) {
  for (const meshData of sidecar.meshes) {
    let mesh = null;
    sceneRoot.traverse((part) => { if (!mesh && part.isMesh && part.name === meshData.glbNode) mesh = part; });
    if (!mesh) throw new Error(`arm pose mesh missing: ${meshData.glbNode}`);
    if (cloneGeometry && !mesh.userData.armPoseGeometryCloned) {
      mesh.geometry = mesh.geometry.clone();
      mesh.userData.armPoseGeometryCloned = true;
    }
    if (mesh.userData.armPoseRevision === state.armPoseRevision) continue;
    const position = mesh.geometry.getAttribute("position");
    if (!position || position.count !== meshData.vertexCount) throw new Error(`arm pose vertex count changed: ${meshData.glbNode}`);
    position.array.set(skinMeshPositions(meshData, posed.worldByPath));
    position.needsUpdate = true;
    mesh.geometry.computeVertexNormals();
    mesh.geometry.computeBoundingSphere();
    mesh.geometry.computeBoundingBox();
    mesh.userData.armPoseRevision = state.armPoseRevision;
  }
}

// Meshes without exported skin weights (head, eyes, torso, hips, tail) move
// rigidly with the bone that carries them in the AvatarView hierarchy.
const RIGID_AVATAR_BONE = { Body_Head: "Head", Body_Eye_L: "Head", Body_Eye_R: "Head",
  Body_Torso: "Spine", Body_Butt: "Spine", Body_Tail: "Spine" };

function applyRigidAvatarParts(sceneRoot, skin, posed) {
  const skinned = new Set(skin.meshes.map((mesh) => mesh.glbNode));
  const byName = new Map(skin.bones.map((bone) => [bone.path.split("/").pop(), bone]));
  sceneRoot.traverse((part) => {
    if (!part.isMesh || skinned.has(part.name)) return;
    const bone = byName.get(RIGID_AVATAR_BONE[part.name] || "Head");
    const world = bone && posed.worldByPath.get(bone.path);
    if (!world) return;
    if (!part.userData.restMatrix) part.userData.restMatrix = part.matrix.clone();
    // Native-space delta, conjugated into the X-mirrored GLB vertex basis.
    const delta = new THREE.Matrix4().set(...multiply4(world, inverseAffine4(matrix4(bone.worldBindMatrix))));
    part.matrixAutoUpdate = false;
    part.matrix.copy(avatarMeshToGameBasis).multiply(delta).multiply(avatarMeshToGameBasis).multiply(part.userData.restMatrix);
    part.matrixWorldNeedsUpdate = true;
  });
}

function applyAvatarArmPose() {
  const skin = state.avatarArmSkin;
  if (!skin || !state.avatarMeshScene) { state.avatarArmPose = null; return; }
  if (state.avatarArmPose && state.avatarPoseAppliedRevision === state.armPoseRevision) return;
  const pose = posedGhostRig(skin, state.ghostPose);
  applyArmSkinToScene(state.avatarMeshScene, skin, pose);
  applyRigidAvatarParts(state.avatarMeshScene, skin, pose);
  state.avatarArmPose = pose;
  state.avatarPoseAppliedRevision = state.armPoseRevision;
  syncPoseHandles();
}

// ---- ghost posing: joint handles, pose gizmo, and panel ----
// The player controls what the game lets a player control: the head (which
// carries the whole body) and each hand's position and rotation. Shoulder and
// elbow handles are shortcuts that swing or bend the arm by moving its hand;
// the arm is always drawn by the game's two-bone solver.
function poseJointSide(key) { return key.endsWith(".left") ? "left" : key.endsWith(".right") ? "right" : "center"; }

// Fingertip handles (index, pinky, thumb) curl a finger when dragged up or down; they show for the selected arm.
function fingerHandleKeys() {
  return SIDES.flatMap((side) => FINGERS.map((finger) => `finger.${finger}.${side}`));
}

function ensurePoseHandles() {
  if (poseHandles.children.length) return;
  for (const key of fingerHandleKeys()) {
    const handle = new THREE.Mesh(poseHandleGeometry, new THREE.MeshBasicMaterial({
      color: POSE_HANDLE_COLORS[poseJointSide(key)], depthTest: false, depthWrite: false, transparent: true, opacity: 0.85 }));
    handle.name = `pose_handle_${key}`;
    handle.userData.poseJoint = key;
    handle.userData.baseRadius = 0.013;
    handle.renderOrder = 31;
    poseHandles.add(handle);
  }
  for (const key of jointKeys()) {
    const handle = new THREE.Mesh(poseHandleGeometry, new THREE.MeshBasicMaterial({
      color: POSE_HANDLE_COLORS[poseJointSide(key)], depthTest: false, depthWrite: false, transparent: true, opacity: 0.92 }));
    handle.name = `pose_handle_${key}`;
    handle.userData.poseJoint = key;
    handle.userData.baseRadius = key === "head" ? 0.04 : key.startsWith("wrist") ? 0.03 : 0.024;
    handle.renderOrder = 30;
    poseHandles.add(handle);
  }
}

// Rest AvatarView (rig) space -> scene world.
function avatarSpaceMatrix() {
  poseHandles.matrix.copy(matrixFromRows(state.playerRigs?.player_anchors?.avatar?.matrix));
  poseHandles.matrixWorldNeedsUpdate = true;
  ghostRig.updateMatrixWorld(true);
  return poseHandles.matrixWorld.clone();
}

// A wrist handle sits on its hand target (the controller pose), which a held
// item follows even when the arm cannot reach it.
function poseJointMatrix(key) {
  const rig = state.avatarArmPose, skin = state.avatarArmSkin;
  if (!rig || !skin) return null;
  if (key.startsWith("wrist.")) return rig.handTargets?.[poseJointSide(key)] || null;
  if (key.startsWith("finger.")) {
    const [, finger, side] = key.split(".");
    return rig.worldByPath.get(jointPaths(skin).get(`${finger}3.${side}`)) || null;
  }
  return rig.worldByPath.get(jointPaths(skin).get(key)) || null;
}

function syncPoseHandles() {
  const show = !!(state.poseUi.active && state.avatarArmSkin && state.avatarArmPose && ghostRig.visible);
  poseHandles.visible = show;
  if (!show) return;
  ensurePoseHandles();
  avatarSpaceMatrix();
  const armSide = poseJointSide(state.poseUi.joint);
  for (const handle of poseHandles.children) {
    const key = handle.userData.poseJoint;
    const world = poseJointMatrix(key);
    const finger = key.startsWith("finger.");
    handle.visible = !!world && (!finger || poseJointSide(key) === armSide);
    if (!handle.visible) continue;
    handle.position.set(world[3], world[7], world[11]);
    const selected = key === state.poseUi.joint || key === state.poseUi.finger;
    handle.scale.setScalar(handle.userData.baseRadius * (selected ? 1.6 : 1));
    handle.material.color.setHex(selected ? 0xffffff : POSE_HANDLE_COLORS[poseJointSide(key)]);
  }
  poseHandles.updateMatrixWorld(true);
}

function poseGizmoMode(key = state.poseUi.joint) {
  return key.startsWith("wrist.") && state.poseUi.tool === "move" ? "translate" : "rotate";
}

function syncPoseGizmo() {
  const key = state.poseUi.joint;
  const world = state.poseUi.active && ghostRig.visible ? poseJointMatrix(key) : null;
  if (!world) { if (poseGizmo.object) poseGizmo.detach(); return; }
  if (poseGizmo.dragging) return;
  const matrix = avatarSpaceMatrix().multiply(new THREE.Matrix4().set(...world));
  matrix.decompose(poseProxy.position, poseProxy.quaternion, new THREE.Vector3());
  poseProxy.scale.set(1, 1, 1);
  poseProxy.updateMatrixWorld(true);
  if (poseGizmo.object !== poseProxy) poseGizmo.attach(poseProxy);
  poseGizmo.setMode(poseGizmoMode(key));
  poseGizmo.setSpace(poseGizmoMode(key) === "translate" ? "world" : "local");
}

let poseDragStart = null;
function beginPoseDrag() {
  poseProxy.updateMatrixWorld(true);
  poseDragStart = { pose: normalizeGhostPose(state.ghostPose), proxy: poseProxy.quaternion.clone() };
}

function onPoseGizmoChange() {
  const skin = state.avatarArmSkin, key = state.poseUi.joint;
  if (!skin || !poseGizmo.dragging || !poseDragStart) return;
  poseProxy.updateMatrixWorld(true);
  const toAvatar = avatarSpaceMatrix().invert();
  const avatarRotation = new THREE.Quaternion();
  const avatarPosition = new THREE.Vector3();
  toAvatar.clone().multiply(poseProxy.matrixWorld).decompose(avatarPosition, avatarRotation, new THREE.Vector3());
  const side = poseJointSide(key);
  if (key === "head") {
    state.ghostPose = setHeadWorldRotation(skin, state.ghostPose, avatarRotation.toArray());
  } else if (key.startsWith("wrist.")) {
    state.ghostPose = poseGizmoMode(key) === "translate"
      ? setHandTargetWorld(skin, state.ghostPose, side, avatarPosition.toArray())
      : setHandTargetWorld(skin, state.ghostPose, side, avatarPosition.toArray(), avatarRotation.toArray());
  } else {
    // Swing or bend: the world-space turn of the handle since the drag began.
    const ghostTurn = new THREE.Quaternion();
    toAvatar.decompose(new THREE.Vector3(), ghostTurn, new THREE.Vector3());
    const start = ghostTurn.clone().multiply(poseDragStart.proxy);
    const delta = avatarRotation.clone().multiply(start.invert());
    state.ghostPose = rotateArmAboutJoint(skin, poseDragStart.pose, key, delta.toArray());
  }
  ghostPoseChanged({ fromGizmo: true });
}

// Overlapping dots (a hand and its fingertips): take the one whose centre is nearest the pointer, for its size.
function poseHandleUnderPointer(event) {
  if (!poseHandles.visible) return null;
  const ray = setPointerRay(event);
  const hits = raycaster.intersectObjects(poseHandles.children.filter((handle) => handle.visible), false);
  let best = null, bestScore = Infinity;
  for (const hit of hits) {
    const centre = hit.object.getWorldPosition(new THREE.Vector3());
    const score = ray.distanceToPoint(centre) / Math.max(1e-6, hit.object.getWorldScale(new THREE.Vector3()).x);
    if (score < bestScore) { bestScore = score; best = hit.object; }
  }
  return best ? best.userData.poseJoint : null;
}

function setPointerRay(event) {
  const rect = renderer.domElement.getBoundingClientRect();
  pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
  pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
  raycaster.setFromCamera(pointer, camera);
  return raycaster.ray;
}

// Clicking a dot selects it; pressing and dragging it poses it directly (see beginJointMouseDrag).
function pickPoseHandle(event) {
  const key = poseHandleUnderPointer(event);
  if (!key) return null;
  if (key.startsWith("finger.")) {
    state.poseUi.finger = key;
    selectPoseJoint(`wrist.${poseJointSide(key)}`, { keepFinger: true });
  } else selectPoseJoint(key);
  return key;
}

// ---- direct mouse posing: press a dot and drag ----
// Hand: moves in the plane facing you (Shift: turns it). Head: turns the head and body (Shift: rolls).
// Shoulder / elbow: swings the arm around that joint toward the pointer. Fingertip: drag down to curl, up to open.
// Every turn snaps to the angle step when Snap to angle is on, counted from where the drag started.
let jointDrag = null;
const JOINT_TURN_PER_PIXEL = 0.01;

function avatarRotationQuaternion(toWorld) {
  const q = new THREE.Quaternion();
  toWorld.decompose(new THREE.Vector3(), q, new THREE.Vector3());
  return q;
}

function rowMajorPosition(m) { return new THREE.Vector3(m[3], m[7], m[11]); }
function rowMajorRotation(m) {
  const q = new THREE.Quaternion();
  new THREE.Matrix4().set(...m).decompose(new THREE.Vector3(), q, new THREE.Vector3());
  return q;
}

function beginJointMouseDrag(event, key) {
  const skin = state.avatarArmSkin, rig = state.avatarArmPose;
  if (!skin || !rig || event.button !== 0) return false;
  const toWorld = avatarSpaceMatrix();
  const paths = jointPaths(skin);
  const side = poseJointSide(key);
  const kind = key.startsWith("finger.") ? "finger" : key === "head" ? "head" : key.startsWith("wrist.") ? "hand" : "swing";
  const jointMatrix = poseJointMatrix(key);
  if (!jointMatrix) return false;
  const drag = { key, kind, side, pose: normalizeGhostPose(state.ghostPose), toWorld, fromWorld: toWorld.clone().invert(),
    avatarTurn: avatarRotationQuaternion(toWorld), start: [event.clientX, event.clientY], moved: false,
    jointWorld: rowMajorPosition(jointMatrix).applyMatrix4(toWorld) };
  if (kind === "hand" || kind === "head") {
    drag.avatarPosition = rowMajorPosition(jointMatrix);
    drag.avatarRotation = rowMajorRotation(jointMatrix);
  } else if (kind === "swing") {
    const follower = key.startsWith("shoulder.") ? rig.worldByPath.get(paths.get(`elbow.${side}`)) : rig.handTargets?.[side];
    if (!follower) return false;
    drag.followerWorld = rowMajorPosition(follower).applyMatrix4(toWorld);
  } else {
    const [, finger] = key.split(".");
    drag.finger = finger;
    drag.curl = drag.pose.fingers[side][finger];
  }
  jointDrag = drag;
  beginEditorHistoryGroup();
  orbit.enabled = false;
  renderer.domElement.style.cursor = "grabbing";
  window.addEventListener("pointermove", onJointMouseDrag);
  window.addEventListener("pointerup", endJointMouseDrag, { once: true });
  return true;
}

function viewPlaneHit(event, through) {
  const ray = setPointerRay(event);
  const normal = camera.getWorldDirection(new THREE.Vector3());
  const plane = new THREE.Plane().setFromNormalAndCoplanarPoint(normal, through);
  return ray.intersectPlane(plane, new THREE.Vector3());
}

// A world-space turn that rolls the point under the pointer along with the drag (a trackball), snapped.
function trackballTurn(event, drag) {
  const startHit = viewPlaneHit({ clientX: drag.start[0], clientY: drag.start[1] }, drag.jointWorld);
  const hit = viewPlaneHit(event, drag.jointWorld);
  if (!startHit || !hit) return null;
  const moved = hit.clone().sub(startHit);
  const pixels = Math.hypot(event.clientX - drag.start[0], event.clientY - drag.start[1]);
  if (moved.lengthSq() < 1e-12 || pixels < 1) return new THREE.Quaternion();
  const view = camera.getWorldDirection(new THREE.Vector3());
  const axis = moved.clone().normalize().cross(view).normalize();
  const angle = snapAngle(pixels * JOINT_TURN_PER_PIXEL, angleSnapStep());
  return new THREE.Quaternion().setFromAxisAngle(axis, angle);
}

function rollTurn(event, drag) {
  const view = camera.getWorldDirection(new THREE.Vector3());
  const angle = snapAngle((event.clientX - drag.start[0]) * JOINT_TURN_PER_PIXEL, angleSnapStep());
  return new THREE.Quaternion().setFromAxisAngle(view, -angle);
}

// World turn -> the rig's rest AvatarView space (where ghost_pose works).
function avatarSpaceTurn(worldTurn, drag) {
  return drag.avatarTurn.clone().invert().multiply(worldTurn).multiply(drag.avatarTurn);
}

function onJointMouseDrag(event) {
  const drag = jointDrag, skin = state.avatarArmSkin;
  if (!drag || !skin) return;
  if (!drag.moved && Math.hypot(event.clientX - drag.start[0], event.clientY - drag.start[1]) < 3) return;
  drag.moved = true;
  // Shift turns the hand / tilts the head; the Hand tool and Head tool pickers do the same without a keyboard.
  const turnHand = event.shiftKey || state.poseUi.tool === "rotate";
  const tiltHead = event.shiftKey || state.poseUi.headTool === "roll";
  if (drag.kind === "hand" && !turnHand) {
    const hit = viewPlaneHit(event, drag.jointWorld);
    if (!hit) return;
    // Position only: the hand keeps its exact turn.
    state.ghostPose = setHandTargetWorld(skin, drag.pose, drag.side, hit.applyMatrix4(drag.fromWorld).toArray());
  } else if (drag.kind === "hand" || drag.kind === "head") {
    const worldTurn = drag.kind === "head" && tiltHead ? rollTurn(event, drag) : trackballTurn(event, drag);
    if (!worldTurn) return;
    const rotation = avatarSpaceTurn(worldTurn, drag).multiply(drag.avatarRotation).normalize().toArray();
    state.ghostPose = drag.kind === "head" ? setHeadWorldRotation(skin, drag.pose, rotation)
      : setHandTargetWorld(skin, drag.pose, drag.side, drag.avatarPosition.toArray(), rotation);
  } else if (drag.kind === "swing") {
    const hit = viewPlaneHit(event, drag.followerWorld);
    if (!hit) return;
    const from = drag.followerWorld.clone().sub(drag.jointWorld).normalize();
    const to = hit.sub(drag.jointWorld).normalize();
    const worldTurn = new THREE.Quaternion().setFromUnitVectors(from, to);
    const snapped = new THREE.Quaternion(...snapQuaternionAngle(worldTurn.toArray(), angleSnapStep()));
    state.ghostPose = rotateArmAboutJoint(skin, drag.pose, drag.key, avatarSpaceTurn(snapped, drag).toArray());
  } else {
    const next = normalizeGhostPose(drag.pose);
    let curl = clamp(drag.curl + (event.clientY - drag.start[1]) / 150, 0, 1);
    if (drag.finger === "thumb") curl = curl < 0.05 ? 0 : curl < 0.55 ? 0.1 : 1;
    next.fingers[drag.side][drag.finger] = curl;
    state.ghostPose = next;
  }
  ghostPoseChanged({ fromGizmo: true });
}

function endJointMouseDrag() {
  window.removeEventListener("pointermove", onJointMouseDrag);
  const drag = jointDrag;
  jointDrag = null;
  orbit.enabled = !transform.dragging && !poseGizmo.dragging;
  poseGizmo.enabled = true;
  renderer.domElement.style.cursor = "";
  endEditorHistoryGroup();
  syncPoseGizmo();
  if (drag?.moved) {
    const what = drag.kind === "finger" ? `${drag.side} ${drag.finger}` : jointLabel(drag.key);
    const snapped = state.angleSnapEnabled && (drag.kind === "head" || drag.kind === "swing");
    setStatus(`${what} posed by mouse${snapped ? ` (turns snap every ${angleStepText()})` : ""}.`);
  }
}

// Over a dot the pose gizmo stands aside, so pressing a dot always starts a direct joint drag (a ring seen
// edge-on can cross the dot); the gizmo's arrows and rings around it still work for one-axis changes.
function updatePoseHover(event) {
  if (jointDrag || transform.dragging || poseGizmo.dragging) return;
  const key = state.poseUi.active ? poseHandleUnderPointer(event) : null;
  poseGizmo.enabled = !key;
  renderer.domElement.style.cursor = key ? "grab" : "";
}

function ghostPoseChanged({ fromGizmo = false } = {}) {
  state.armPoseRevision++;
  updateGhostPreview();
  syncPoseFields();
  if (!fromGizmo) syncPoseGizmo();
  observeEditorHistory();
}

function setGhostPose(pose, { record = true } = {}) {
  state.ghostPose = normalizeGhostPose(pose);
  state.armPoseRevision++;
  updateGhostPreview();
  syncPoseFields();
  syncPoseGizmo();
  if (record) observeEditorHistory();
}

function setPoseMode(active) {
  const wanted = !!active;
  if (wanted && !$("showGhostRig").checked && !$("showGorillaReference").checked) {
    $("showGhostRig").checked = true;
    $("showGhostRig").dispatchEvent(new Event("change"));
  }
  if (wanted && state.referenceActive) setReferenceMoveActive(false);
  state.poseUi.active = wanted;
  const button = $("ghostPoseModeBtn");
  button.setAttribute("aria-pressed", String(wanted));
  button.classList.toggle("active", wanted);
  button.textContent = wanted ? "Stop posing in viewport" : "Pose in viewport";
  if (wanted) transform.detach(); else { poseGizmo.detach(); attachTransformToSelection(); }
  updateGhostPreview();
  syncPoseHandles();
  syncPoseGizmo();
  if (wanted) setStatus(state.avatarArmSkin
    ? "Drag a dot on the ghost: a hand moves (Shift turns it), the head turns the body, a shoulder or elbow swings the arm, a fingertip curls. Turns snap to the angle step when Snap to angle is on. Held items follow."
    : "Posing needs the game avatar rig, which is still loading.", state.avatarArmSkin ? "good" : "bad");
}

function selectPoseJoint(key, { keepFinger = false } = {}) {
  if (!jointKeys().includes(key)) return;
  state.poseUi.joint = key;
  if (!keepFinger) state.poseUi.finger = null;
  // Picking a part to pose shows its handle in the viewport straight away.
  if (!state.poseUi.active) setPoseMode(true);
  syncPoseFields();
  syncPoseHandles();
  syncPoseGizmo();
}

function populatePoseControls() {
  const select = $("ghostPoseJoint");
  if (!select || select.options.length) return;
  for (const key of jointKeys()) {
    const option = document.createElement("option");
    option.value = key;
    option.textContent = jointLabel(key);
    select.appendChild(option);
  }
  const presets = $("ghostPosePreset");
  for (const preset of POSE_PRESETS) {
    const option = document.createElement("option");
    option.value = preset.id;
    option.textContent = preset.label;
    presets.appendChild(option);
  }
}

const POSE_TURN_FIELDS = ["ghostPoseYaw", "ghostPosePitch", "ghostPoseRoll"];
const POSE_MOVE_FIELDS = ["ghostPoseRight", "ghostPoseUp", "ghostPoseForward"];

const POSE_QUAT_FIELDS = ["ghostPoseQX", "ghostPoseQY", "ghostPoseQZ", "ghostPoseQW"];

// Turn fields carry degrees internally and show the chosen angle unit; move fields are centimetres.
function setPoseField(id, value) {
  const input = $(id);
  if (document.activeElement === input) return;
  input.value = POSE_TURN_FIELDS.includes(id) ? formatAngle(value * Math.PI / 180, state.angleUnit)
    : String(Math.round(value * 10) / 10);
}

function syncPoseFields() {
  const key = state.poseUi.joint;
  if (!$("ghostPoseJoint")) return;
  $("ghostPoseJoint").value = key;
  $("ghostPoseTool").value = state.poseUi.tool;
  $("ghostPoseHeadTool").value = state.poseUi.headTool;
  const side = poseJointSide(key);
  const hand = key.startsWith("wrist.");
  const arm = !hand && side !== "center";
  const quat = state.rotationDisplay === "quat" && !arm;
  $("ghostPoseMoveFields").hidden = !hand;
  $("ghostPoseTurnFields").hidden = arm || quat;
  $("ghostPoseQuatFields").hidden = !quat;
  if (quat) {
    const rotation = jointRotation(state.ghostPose, key) || [0, 0, 0, 1];
    POSE_QUAT_FIELDS.forEach((id, index) => {
      if (document.activeElement !== $(id)) $(id).value = formatQuaternionComponent(rotation[index]);
    });
  }
  $("ghostPoseResetJoint").textContent = arm ? `Reset ${side} hand` : key === "head" ? "Reset head" : `Reset ${side} hand`;
  if (key === "head") {
    headYawPitchRoll(state.ghostPose).forEach((value, index) => setPoseField(POSE_TURN_FIELDS[index], value));
  } else if (hand) {
    const { offset, turn } = handOffsetAndTurn(state.ghostPose, side);
    // Fields show the ghost's own right/up/forward in centimetres.
    offset.forEach((value, index) => setPoseField(POSE_MOVE_FIELDS[index], value * 100));
    turn.forEach((value, index) => setPoseField(POSE_TURN_FIELDS[index], value));
  }
  for (const s of SIDES) {
    for (const finger of ["index", "pinky"]) {
      const slider = $(`ghostCurl-${s}-${finger}`);
      if (document.activeElement !== slider) slider.value = String(Math.round(state.ghostPose.fingers[s][finger] * 100));
    }
    const thumb = $(`ghostCurl-${s}-thumb`);
    const value = state.ghostPose.fingers[s].thumb;
    thumb.value = value >= 0.55 ? "1" : value >= 0.05 ? "0.1" : "0";
  }
  for (const dot of document.querySelectorAll("#ghostPoseMap [data-joint]")) {
    const selected = dot.dataset.joint === key;
    dot.classList.toggle("selected", selected);
    dot.setAttribute("aria-pressed", String(selected));
  }
  $("ghostPoseJointNote").textContent = key === "head"
    ? "Head and body: drag the yellow dot to turn the head (Shift-drag rolls it), or use the rings for one axis. In game the whole avatar hangs from the head, so the torso, shoulders, and back and hip items turn with it; the hands stay where they are, like tracked controllers."
    : hand
      ? `${jointLabel(key)}: drag the dot to move the hand, Shift-drag to turn it, or use the arrows/rings (Hand tool) for one axis. Drag a fingertip dot down to curl that finger, up to open it. The arm follows with the game's solver; a held item stays in this hand.`
      : `${jointLabel(key)}: drag the dot toward where the ${key.startsWith("shoulder") ? "elbow" : "hand"} should go to ${key.startsWith("shoulder") ? "swing the arm around the shoulder" : "bend the forearm at the elbow"}, or use the ring for one axis. This moves the hand; the game's solver then draws the arm.`;
}

function applyPoseFields() {
  const key = state.poseUi.joint;
  const value = (id, lo, hi) => clamp(Number($(id).value) || 0, lo, hi);
  const degrees = (id, limit) => clamp((fromDisplayAngle($(id).value, state.angleUnit) || 0) * 180 / Math.PI, -limit, limit);
  const turn = [degrees("ghostPoseYaw", 180), degrees("ghostPosePitch", 90), degrees("ghostPoseRoll", 180)];
  if (key === "head") state.ghostPose = setHeadYawPitchRoll(state.ghostPose, turn);
  else if (key.startsWith("wrist.")) {
    const offset = POSE_MOVE_FIELDS.map((id) => value(id, -150, 150) / 100);
    state.ghostPose = setHandOffsetAndTurn(state.ghostPose, poseJointSide(key), offset, turn);
  } else return;
  ghostPoseChanged();
}

// Quaternion display: set one component of the head's or hand's turn exactly; the others rescale to stay unit length.
function applyPoseQuatField(index, input) {
  const key = state.poseUi.joint;
  const current = jointRotation(state.ghostPose, key);
  if (!current) return;
  try {
    state.ghostPose = setJointRotation(state.ghostPose, key, editQuaternionComponent(current, index, input.value));
  } catch (error) {
    syncPoseFields();
    setStatus(`Invalid quaternion value: ${error.message || error}`, "bad");
    return;
  }
  ghostPoseChanged();
}

function robotArmPose(skin) {
  if (!state.avatarArmPose) return null;
  const cached = state.robotPoseCache.get(skin.itemID);
  if (cached?.revision === state.armPoseRevision) return cached.pose;
  const overrides = {};
  const correction = skin.nativeDrive?.upperLeftCorrectionQuaternion;
  for (const bone of skin.bones) {
    if (bone.role === "base") continue;
    const playerPath = bone.path.replace(/^Base\//, "Head/");
    const playerRotation = state.avatarArmPose.localRotationByPath.get(playerPath);
    if (!playerRotation) throw new Error(`player bone missing for robot arm: ${playerPath}`);
    overrides[bone.path] = skin.side === "left" && bone.role === "upper" && correction
      ? multiplyQuat(correction, playerRotation) : playerRotation;
  }
  const pose = posedBoneMatrices(skin.bones, {}, overrides);
  state.robotPoseCache.set(skin.itemID, {revision: state.armPoseRevision, pose});
  return pose;
}

// ---- Robot arms follow the ghost's arms ----
// RobotArmItem.FixedUpdate copies the linked player's same-side arm bone local rotations (upper arm, lower arm, hand
// and fingers; the left upper arm through LEFT_BASE_ROTATION_OFFSET) onto the arm every tick. The linked player is
// whoever holds or wears the arm or its invention root (a hand, back or hip anchor's player), and the link is never
// cleared, so in game every robot arm shows its side's arm pose wherever and however it is mounted. The editor draws
// every arm that way: the editable invention, worn copies, crossbow-loaded copies and the ghost crossbow. Items stuck
// at @1-@3 hang from a per-joint mount whose matrix is the posed-minus-rest delta, so their local poses (and saved
// edges) keep their rest meaning while they follow the joint.
const ROBOT_ARM_JOINTS = [null, "shoulder", "elbow", "hand"];

function isRobotArmItem(itemID) {
  const entry = entryForItem(itemID);
  return !!(entry?.arm_skin_url || entry?.arm_skin?.url);
}

function robotArmMount(armGroup, sub) {
  let mount = armGroup.children.find((node) => node.userData.robotArmMount === sub);
  if (!mount) {
    mount = new THREE.Group();
    mount.name = `robot_arm_${ROBOT_ARM_JOINTS[sub]}`;
    mount.userData.robotArmMount = sub;
    mount.matrixAutoUpdate = false;
    armGroup.add(mount);
  }
  return mount;
}

// The object that holds a part's group (its parent's group, or a robot arm joint mount); local poses are relative to it.
function childContainer(record) {
  const parent = parentOf(record);
  if (!parent) return scene;
  const sub = Math.round(Number(record.subParentID) || 0);
  if (sub === MOTION.JOYSTICK_STICK_FRAME && MOTION.isJoystick(parent.itemID)) return joystickStickMount(parent.group);
  return sub >= 1 && sub <= 3 && isRobotArmItem(parent.itemID) ? robotArmMount(parent.group, sub) : parent.group;
}

function parentFrame(record) {
  return parentOf(record) ? childContainer(record) : null;
}

// Move a part's group into the container its parent and sub-part call for. preserveWorld keeps it where it is drawn
// (a new edge frame is solved on save); otherwise its local pose keeps its meaning.
function placeChildGroup(record, preserveWorld = false) {
  const container = childContainer(record);
  if (record.group.parent === container) return;
  if (preserveWorld && record.group.parent) {
    container.updateWorldMatrix(true, false);
    container.attach(record.group);
    record.group.scale.set(1, 1, 1);
    markTransformDirty(record);
  } else {
    container.add(record.group);
  }
}

function robotArmJointDelta(skin, pose, sub, itemID, scaleModifier) {
  const path = [null, skin.poseControls?.shoulder, skin.poseControls?.elbow, skin.poseControls?.hand][sub];
  const bone = path && skin.bones.find((row) => row.path === path);
  const posed = path && pose.worldByPath.get(path);
  if (!bone || !posed) return null;
  const delta = multiply4(posed, inverseAffine4(matrix4(bone.worldBindMatrix)));
  const scale = scaleModifierToScalar(scaleModifier, itemID);
  delta[3] *= scale; delta[7] *= scale; delta[11] *= scale;
  return new THREE.Matrix4().set(...delta);
}

// Pose one arm's mesh and joint mounts. Without a ghost pose the arm keeps its last pose (the game never unlinks).
function poseRobotArm(group, model, itemID, scaleModifier) {
  const skin = state.robotArmSkins.get(itemID);
  const pose = skin ? robotArmPose(skin) : null;
  if (!pose) return;
  // Scope skinning to this arm's model; a stuck child can be another arm variant with the same GLB node name.
  if (model) applyArmSkinToScene(model, skin, pose, true);
  for (const mount of group.children) {
    const sub = mount.userData.robotArmMount;
    if (!sub) continue;
    const delta = robotArmJointDelta(skin, pose, sub, itemID, scaleModifier);
    if (!delta) continue;
    mount.matrix.copy(delta);
    mount.matrixWorldNeedsUpdate = true;
  }
}

// Pose every robot arm under root: editable records (by uid, which their worn and crossbow copies share) and
// crossbow contents displays (marked when built).
function poseRobotArmsIn(root) {
  if (!root || !state.avatarArmPose) return;
  const records = new Map(state.objects.filter((record) => isRobotArmItem(record.itemID)).map((record) => [record.uid, record]));
  const arms = [];
  root.traverse((node) => {
    const marked = node.userData.robotArm;
    if (marked) {
      arms.push([node, node.children.find((child) => child.userData.robotArmModel), marked.itemID, marked.scaleModifier]);
      return;
    }
    const record = node.userData.uid != null ? records.get(node.userData.uid) : null;
    if (!record?.model) return;
    const model = node === record.group ? record.model : node.children[record.group.children.indexOf(record.model)];
    arms.push([node, model, record.itemID, record.scaleModifier]);
  });
  for (const [group, model, itemID, scaleModifier] of arms) {
    try { poseRobotArm(group, model, itemID, scaleModifier); }
    catch (err) { $("armPoseNote").textContent = `Robot arm pose preview unavailable: ${err.message}`; }
  }
}

// ---- Moving parts preview (owner 2026-10-16; moving_parts.mjs has the game rules) ----
// Joystick sticks tilt with a thumbstick and tripod heads pan / tilt, the way JoystickItem and TripodSwivelItem move
// them in game. Parts stuck to a joystick's stick (@1) hang from a stick mount whose matrix is the tilt delta (like a
// robot arm joint mount), so their local poses and saved edges keep their rest meaning; a tripod's mounted gear turns
// with its head. The stick and head meshes turn with them. Every pose comes from these preview controls: nothing is saved.
const motionPreview = {
  pad: [0, 0],                               // the on-screen thumbstick (drives every joystick while off centre)
  padDragging: false, hold: false, keys: new Set(), sweepStart: null,
  controllers: { left: [0, 0], right: [0, 0] },   // Gamepad API / WebXR thumbsticks, game convention (+y forward)
  controllerNames: "",
  tripod: { yaw: 0, pitch: 0 },
  displays: false,                           // a read-only display (crossbow / tripod contents) carries a moving item
  vrSupported: false, vrAsked: false,
  ui: "",
};
const motionOne = new THREE.Vector3(1, 1, 1);

function joystickStickMount(group) {
  let mount = group.children.find((node) => node.userData.joystickStickMount);
  if (!mount) {
    mount = new THREE.Group();
    mount.name = "joystick_stick_mount";
    mount.userData.joystickStickMount = true;
    mount.matrixAutoUpdate = false;
    group.add(mount);
    poseMovingGroupNow(group);
  }
  return mount;
}

// The hand holding an invention's root: its stuck joysticks read that hand's thumbstick (UpdateControllerInput).
function documentHand(documentId) {
  const attachment = state.documents.find((item) => item.id === documentId)?.preview?.attachment;
  return attachment === "left_hand" ? "handLeft" : attachment === "right_hand" ? "handRight" : null;
}

function previewStick(record) {
  if (Math.hypot(...motionPreview.pad) > 1e-6) return motionPreview.pad;
  return MOTION.stickForHand(record ? documentHand(record.documentId) : null, motionPreview.controllers);
}

function movingDeltaMatrix(itemID, scaleModifier, record) {
  const kind = MOTION.movingPartKind(itemID);
  const delta = kind === "joystick" ? MOTION.joystickDelta(itemID, scaleModifier, previewStick(record))
    : kind === "tripod" ? MOTION.tripodHeadDelta(FILM.tripodHead(), scaleModifier, motionPreview.tripod) : null;
  return delta ? new THREE.Matrix4().compose(gameArrToEditorVec(delta.pos), gameArrToEditorQuat(delta.rot), motionOne) : null;
}

function movingMeshMatcher(itemID) {
  if (MOTION.isJoystick(itemID)) return (name) => MOTION.JOYSTICK_STICK_MESH.test(name);
  const names = new Set((FILM.tripodHead()?.meshes || []).map((name) => THREE.PropertyBinding.sanitizeNodeName(name)));
  return (name) => names.has(name);
}

// node = chain^-1 * delta * chain * rest, where chain carries the node's parents (model scale, mirror, origin) up to
// the item group in which the delta is expressed.
function poseMovingMeshes(group, model, itemID, delta) {
  const matches = movingMeshMatcher(itemID);
  model.traverse((node) => {
    if (node === model || !matches(node.name)) return;
    if (!node.userData.movingRest) { node.updateMatrix(); node.userData.movingRest = node.matrix.toArray(); }
    const chain = new THREE.Matrix4();
    for (let up = node.parent; up && up !== group; up = up.parent) {
      if (up.matrixAutoUpdate) up.updateMatrix();
      chain.premultiply(up.matrix);
    }
    node.matrixAutoUpdate = false;
    node.matrix.copy(chain).invert().multiply(delta).multiply(chain).multiply(new THREE.Matrix4().fromArray(node.userData.movingRest));
    node.matrixWorldNeedsUpdate = true;
  });
}

function poseMovingGroup(group, itemID, scaleModifier, record = null) {
  const delta = movingDeltaMatrix(itemID, scaleModifier, record);
  if (!delta) return;
  for (const child of group.children) {
    if (child.userData.joystickStickMount) {
      child.matrix.copy(delta);
      child.matrixWorldNeedsUpdate = true;
    } else if (child.userData.tripodMountBase) {
      child.matrix.copy(delta).multiply(new THREE.Matrix4().fromArray(child.userData.tripodMountBase));
      child.matrixWorldNeedsUpdate = true;
    } else if (child.userData.movingPartModel) {
      poseMovingMeshes(group, child, itemID, delta);
    }
  }
}

function poseMovingGroupNow(group) {
  const uid = group?.userData?.uid;
  const record = uid != null ? state.objects.find((item) => item.uid === uid) : null;
  if (record && MOTION.movingPartKind(record.itemID)) poseMovingGroup(group, record.itemID, record.scaleModifier, record);
  else if (group?.userData?.movingPart) poseMovingGroup(group, group.userData.movingPart.itemID, group.userData.movingPart.scaleModifier);
}

// Every frame: editable records, their worn / crossbow copies (same uid) and read-only displays.
function poseMovingPartsIn(root) {
  const records = new Map();
  for (const record of state.objects) if (MOTION.movingPartKind(record.itemID)) records.set(record.uid, record);
  if (!records.size && !motionPreview.displays) return 0;
  let posed = 0;
  root.traverse((node) => {
    const record = node.userData.uid != null ? records.get(node.userData.uid) : null;
    if (record) poseMovingGroup(node, record.itemID, record.scaleModifier, record);
    else if (node.userData.movingPart) poseMovingGroup(node, node.userData.movingPart.itemID, node.userData.movingPart.scaleModifier);
    else return;
    posed++;
  });
  return posed;
}

// ---- Thumbstick input: on-screen pad, Gamepad API (desktop pads; Quest controllers if the browser exposes them), and
// WebXR controllers in the VR preview ----
const vrPreview = { session: null, saved: null, rig: null, startedAt: 0, held: {}, gizmos: null };

function readControllerSticks(now) {
  const sticks = [];
  const names = [];
  const session = vrPreview.session;
  if (session) {
    for (const source of session.inputSources) {
      if (!source.gamepad) continue;
      sticks.push(MOTION.gamepadSticks(source.gamepad, source.handedness));
      names.push(source.handedness || "controller");
      // B / Y (xr-standard button 5) leaves the VR preview; ignore a press already held when it opened.
      const pressed = !!source.gamepad.buttons?.[5]?.pressed;
      if (pressed && !vrPreview.held[source.handedness] && now - vrPreview.startedAt > 600) session.end().catch(() => {});
      vrPreview.held[source.handedness] = pressed;
    }
  } else {
    let pads = [];
    try { pads = navigator.getGamepads ? [...navigator.getGamepads()] : []; } catch (_) { pads = []; }
    for (const pad of pads) {
      if (!pad || pad.connected === false) continue;
      sticks.push(MOTION.gamepadSticks(pad));
      const hand = ["left", "right"].includes(pad.hand) ? pad.hand
        : /\bleft\b/i.test(pad.id || "") ? "left" : /\bright\b/i.test(pad.id || "") ? "right" : "";
      names.push(`${String(pad.id || "gamepad").replace(/\s*\(.*$/, "").slice(0, 32)}${hand ? ` (${hand})` : ""}`);
    }
  }
  motionPreview.controllers = MOTION.mergeSticks(sticks);
  motionPreview.controllerNames = names.join(", ");
}

function keyboardStick() {
  const k = motionPreview.keys;
  return MOTION.clampStick([(k.has("ArrowRight") ? 1 : 0) - (k.has("ArrowLeft") ? 1 : 0), (k.has("ArrowUp") ? 1 : 0) - (k.has("ArrowDown") ? 1 : 0)]);
}

function updateMotionPreview(now) {
  readControllerSticks(now);
  if (motionPreview.sweepStart != null) motionPreview.pad = MOTION.sweepStick((now - motionPreview.sweepStart) / 1000);
  else if (motionPreview.keys.size) motionPreview.pad = keyboardStick();
  poseMovingPartsIn(scene);
  syncMotionUi();
}

function setMotionPad(stick) {
  motionPreview.pad = MOTION.clampStick(stick);
  motionPreview.sweepStart = null;
}

function releaseMotionPad() {
  motionPreview.padDragging = false;
  if (!motionPreview.hold && motionPreview.sweepStart == null) motionPreview.pad = [0, 0];
}

// Back to the pose every moving part has when nobody touches it (the game's rest pose: stick centred, head at 0 / 0).
function resetMovingParts() {
  motionPreview.keys.clear();
  motionPreview.hold = false;
  motionPreview.padDragging = false;
  setMotionPad([0, 0]);
  motionPreview.tripod = { yaw: 0, pitch: 0 };
  poseMovingPartsIn(scene);
  syncMotionUi();
  const pushed = Math.hypot(...MOTION.stickForHand(null, motionPreview.controllers)) > 0;
  setStatus(pushed ? "Moving parts reset to neutral; a controller thumbstick that is still pushed keeps moving the joysticks."
    : "Moving parts reset to neutral: joystick sticks centred, tripod heads facing forward and level.", "good");
}

function padStickFromEvent(event) {
  const rect = $("motionPad").getBoundingClientRect();
  const radius = Math.max(1, Math.min(rect.width, rect.height) / 2 - 10);
  return MOTION.clampStick([(event.clientX - (rect.left + rect.width / 2)) / radius, -(event.clientY - (rect.top + rect.height / 2)) / radius]);
}

function motionCounts() {
  const counts = { joystick: 0, tripod: 0, arm: 0 };
  for (const record of state.objects) {
    const kind = MOTION.movingPartKind(record.itemID);
    if (kind) counts[kind]++;
    else if (isRobotArmItem(record.itemID)) counts.arm++;
  }
  return counts;
}

// DOM writes only when what is shown changes (this runs every frame).
function syncMotionUi() {
  const panel = $("motionPanel");
  if (!panel) return;
  const counts = motionCounts();
  const shownStick = Math.hypot(...motionPreview.pad) > 1e-6 ? motionPreview.pad
    : MOTION.stickForHand(null, motionPreview.controllers);
  const head = FILM.tripodHead();
  const key = [counts.joystick, counts.tripod, counts.arm, shownStick.map((v) => v.toFixed(2)).join(","), motionPreview.hold,
    motionPreview.sweepStart != null, motionPreview.controllerNames, motionPreview.vrSupported, !!vrPreview.session,
    motionPreview.tripod.yaw, motionPreview.tripod.pitch, head ? `${head.pitchMin}:${head.pitchMax}` : ""].join("|");
  if (key === motionPreview.ui) return;
  motionPreview.ui = key;
  // Shown only while something here moves, so it never covers the 3D view otherwise. VR support is asked for then too:
  // a browser may consult the PC's OpenXR runtime to answer, which nobody needs for an invention without moving parts.
  const moving = !!(counts.joystick || counts.tripod);
  if (moving && motionPreview.vrSupported === false && !motionPreview.vrAsked) {
    motionPreview.vrAsked = true;
    void refreshVrSupport();
  }
  panel.hidden = !moving && !vrPreview.session;
  $("motionStick").hidden = !counts.joystick;
  $("motionTripod").hidden = !counts.tripod || !head;
  $("motionArmNote").hidden = !counts.arm;
  $("motionEmptyNote").hidden = moving;
  const [x, y] = shownStick;
  $("motionKnob").style.transform = `translate(calc(-50% + ${(x * 33).toFixed(1)}px), calc(-50% + ${(-y * 33).toFixed(1)}px))`;
  $("motionStickValue").textContent = `x ${x.toFixed(2)} · y ${y.toFixed(2)} → ${(Math.abs(x) * MOTION.STICK_TILT_DEG).toFixed(0)}° / ${(Math.abs(y) * MOTION.STICK_TILT_DEG).toFixed(0)}°`;
  $("motionHold").checked = motionPreview.hold;
  $("motionSweepBtn").setAttribute("aria-pressed", String(motionPreview.sweepStart != null));
  $("motionSweepBtn").textContent = motionPreview.sweepStart != null ? "Stop sweep" : "Sweep range";
  if (head) {
    $("motionTripodPitch").min = String(head.pitchMin);
    $("motionTripodPitch").max = String(head.pitchMax);
  }
  $("motionTripodYaw").value = String(motionPreview.tripod.yaw);
  $("motionTripodPitch").value = String(motionPreview.tripod.pitch);
  $("motionTripodYawValue").textContent = `${Math.round(motionPreview.tripod.yaw)}°`;
  $("motionTripodPitchValue").textContent = `${Math.round(motionPreview.tripod.pitch)}°`;
  $("motionVrBtn").hidden = !motionPreview.vrSupported;
  $("motionVrBtn").textContent = vrPreview.session ? "Leave VR" : "View in VR";
  $("motionControllers").textContent = vrPreview.session
    ? `In VR: your thumbsticks move the joysticks (each invention follows the hand holding it; a free one follows either stick). B or Y leaves VR.`
    : motionPreview.controllerNames
      ? `Controller: ${motionPreview.controllerNames}. Its thumbsticks move the joysticks (left-hand inventions the left stick, right-hand ones the right).`
      : motionPreview.vrSupported
        ? "On a Quest, View in VR to move the joysticks with your Touch thumbsticks. A connected gamepad works here too."
        : "Drag the pad, use the arrow keys on it, or press a button on a connected gamepad to use its thumbsticks.";
}

async function refreshVrSupport() {
  let supported = false;
  try { supported = !!navigator.xr && await navigator.xr.isSessionSupported("immersive-vr"); } catch (_) { supported = false; }
  motionPreview.vrSupported = supported;
  motionPreview.ui = "";
}

// The XR world is the editor scene mirrored in X (setFrontFaceInversion explains why); start near the orbit target.
function placeVrViewer(floor) {
  const base = renderer.xr.getReferenceSpace();
  if (!base || typeof XRRigidTransform !== "function") return;
  const start = MOTION.xrViewerStart(camera.position.toArray(), orbit.target.toArray(), { floor });
  const place = new THREE.Matrix4().compose(new THREE.Vector3(...start.position),
    new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), start.yaw), motionOne).invert();
  const position = new THREE.Vector3(), rotation = new THREE.Quaternion(), scale = new THREE.Vector3();
  place.decompose(position, rotation, scale);
  renderer.xr.setReferenceSpace(base.getOffsetReferenceSpace(new XRRigidTransform(
    { x: position.x, y: position.y, z: position.z, w: 1 }, { x: rotation.x, y: rotation.y, z: rotation.z, w: rotation.w })));
}

function buildVrControllerRig() {
  const rig = new THREE.Group();
  rig.name = "vr_controller_rig";
  rig.scale.x = -1;                         // cancels the world mirror: controllers are posed in XR space
  rig.userData.previewOnly = true;
  const material = new THREE.MeshBasicMaterial({ color: 0x6fc2ff });
  const lineMaterial = new THREE.LineBasicMaterial({ color: 0x6fc2ff, transparent: true, opacity: 0.6 });
  for (const index of [0, 1]) {
    // three.js keeps one grip / ray group per controller for every session: give each its marker once.
    const grip = renderer.xr.getControllerGrip(index);
    if (!grip.children.length) grip.add(new THREE.Mesh(new THREE.SphereGeometry(0.02, 12, 8), material));
    const ray = renderer.xr.getController(index);
    if (!ray.children.length) {
      ray.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3(0, 0, -0.12)]), lineMaterial));
    }
    rig.add(grip, ray);
  }
  return rig;
}

async function toggleVrPreview() {
  if (vrPreview.session) { await vrPreview.session.end().catch(() => {}); return; }
  if (!navigator.xr) return setStatus("This browser has no WebXR, so there is no VR view here.", "bad");
  let session;
  try { session = await navigator.xr.requestSession("immersive-vr", { optionalFeatures: ["local-floor"] }); }
  catch (err) { return setStatus(`View in VR: ${err.message || err}`, "bad"); }
  vrPreview.saved = { position: camera.position.clone(), quaternion: camera.quaternion.clone(), scale: camera.scale.clone(),
    fov: camera.fov, zoom: camera.zoom, target: orbit.target.clone() };
  vrPreview.session = session;
  vrPreview.startedAt = performance.now();
  vrPreview.held = {};
  session.addEventListener("end", endVrPreview, { once: true });
  try {
    let floor = true;
    try { await session.requestReferenceSpace("local-floor"); } catch (_) { floor = false; }
    renderer.xr.setReferenceSpaceType(floor ? "local-floor" : "local");
    await renderer.xr.setSession(session);
    scene.scale.x = -1;                     // draw the game's left-handed numbers in WebXR's right-handed space
    setFrontFaceInversion(renderer, false);
    vrPreview.gizmos = [transform, poseGizmo].map((gizmo) => [gizmo, gizmo.visible]);
    for (const [gizmo] of vrPreview.gizmos) gizmo.visible = false;   // editing handles are for the desktop view
    placeVrViewer(floor);
    vrPreview.rig = buildVrControllerRig();
    scene.add(vrPreview.rig);
    motionPreview.ui = "";
    setStatus("VR preview: the invention is at real size in front of you. Thumbsticks move the joysticks; B or Y leaves.", "good");
  } catch (err) {
    setStatus(`View in VR: ${err.message || err}`, "bad");
    await session.end().catch(() => {});
  }
}

function endVrPreview() {
  const saved = vrPreview.saved;
  scene.scale.x = 1;
  setFrontFaceInversion(renderer, true);
  if (vrPreview.rig) scene.remove(vrPreview.rig);
  for (const [gizmo, visible] of vrPreview.gizmos || []) gizmo.visible = visible;
  renderer.xr.setReferenceSpace(null);
  if (saved) {
    camera.position.copy(saved.position);
    camera.quaternion.copy(saved.quaternion);
    camera.scale.copy(saved.scale);
    camera.fov = saved.fov;
    camera.zoom = saved.zoom;
    orbit.target.copy(saved.target);
  }
  Object.assign(vrPreview, { session: null, saved: null, rig: null, held: {}, gizmos: null });
  motionPreview.controllers = { left: [0, 0], right: [0, 0] };
  motionPreview.ui = "";
  resize();                                 // restores the mirrored desktop projection
  orbit.update();
}

function bindMotionControls() {
  const pad = $("motionPad");
  pad.addEventListener("pointerdown", (event) => {
    event.preventDefault();
    pad.setPointerCapture?.(event.pointerId);
    pad.focus({ preventScroll: true });
    motionPreview.padDragging = true;
    setMotionPad(padStickFromEvent(event));
  });
  pad.addEventListener("pointermove", (event) => { if (motionPreview.padDragging) setMotionPad(padStickFromEvent(event)); });
  for (const type of ["pointerup", "pointercancel", "lostpointercapture"]) pad.addEventListener(type, releaseMotionPad);
  pad.addEventListener("keydown", (event) => {
    if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(event.key)) {
      event.preventDefault();
      motionPreview.sweepStart = null;
      motionPreview.keys.add(event.key);
    } else if (event.key === " " || event.key === "Home" || event.key === "Escape") {
      event.preventDefault();
      motionPreview.keys.clear();
      setMotionPad([0, 0]);
    }
  });
  pad.addEventListener("keyup", (event) => {
    if (!motionPreview.keys.delete(event.key)) return;
    motionPreview.pad = keyboardStick();
    if (!motionPreview.keys.size && !motionPreview.hold) motionPreview.pad = [0, 0];
  });
  pad.addEventListener("blur", () => { motionPreview.keys.clear(); if (!motionPreview.hold && !motionPreview.padDragging) releaseMotionPad(); });
  $("motionHold").addEventListener("change", () => {
    motionPreview.hold = $("motionHold").checked;
    if (!motionPreview.hold) releaseMotionPad();
  });
  $("motionSweepBtn").addEventListener("click", () => {
    motionPreview.sweepStart = motionPreview.sweepStart == null ? performance.now() : null;
    if (motionPreview.sweepStart == null) releaseMotionPad();
  });
  $("motionResetBtn").addEventListener("click", resetMovingParts);
  for (const [id, field] of [["motionTripodYaw", "yaw"], ["motionTripodPitch", "pitch"]]) {
    $(id).addEventListener("input", () => {
      motionPreview.tripod = MOTION.clampTripodAim(FILM.tripodHead(), { ...motionPreview.tripod, [field]: Number($(id).value) });
    });
  }
  $("motionVrBtn").addEventListener("click", () => { void toggleVrPreview(); });
  window.addEventListener("gamepadconnected", () => { motionPreview.ui = ""; });
  // VR support is first asked for when a joystick or tripod appears (syncMotionUi); a headset plugged in later re-asks.
  navigator.xr?.addEventListener?.("devicechange", () => { if (motionPreview.vrAsked) void refreshVrSupport(); });
}

function itemAnchorMatrix(itemID, key, scaleModifier = 0) {
  const authored = state.playerRigs?.item_anchors?.[itemID]?.[key];
  if (!authored) return new THREE.Matrix4();
  const anchor = matrixFromRows(authored.matrix);
  // GetGrabbedLocation uses the attachment's rotation and position, discarding
  // any inherited prefab scale. The hookshot clam hip anchor is scaled 1.65x.
  for (let column = 0; column < 3; column++) {
    const start = column * 4;
    const length = Math.hypot(anchor.elements[start], anchor.elements[start + 1], anchor.elements[start + 2]);
    if (length > 1e-9) for (let row = 0; row < 3; row++) anchor.elements[start + row] /= length;
  }
  // The anchor translation itself is then scaled by physical item size for
  // hand, hip, and back before its rigid inverse is applied to the target.
  const scalar = scaleModifierToScalar(scaleModifier, itemID);
  anchor.elements[12] *= scalar;
  anchor.elements[13] *= scalar;
  anchor.elements[14] *= scalar;
  return anchor;
}

function defaultHandGrabOffsetMatrix(itemID, key, scaleModifier = 0) {
  const item = state.playerRigs?.item_anchors?.[itemID];
  if (!item?.usesDefaultHandGrabOffsets || (key !== "handLeft" && key !== "handRight")) {
    return new THREE.Matrix4();
  }
  const offset = state.playerRigs?.default_hand_grab_offsets?.[key];
  if (!Array.isArray(offset) || offset.length !== 3 || offset.some((value) => !Number.isFinite(value))) {
    return new THREE.Matrix4();
  }
  // GetGrabbedLocation adds the game-wide offset unchanged when a prefab grip
  // exists, then subtracts the physically scaled grip. Without a prefab grip
  // it scales the default offset instead.
  const scalar = item[key] ? 1 : scaleModifierToScalar(scaleModifier, itemID);
  return new THREE.Matrix4().makeTranslation(...offset.map((value) => value * scalar));
}

function wornRootMatrix(playerAnchor, previewOffset, defaultHandOffset, itemAnchor) {
  return playerAnchor.clone().multiply(previewOffset).multiply(defaultHandOffset).multiply(itemAnchor.clone().invert());
}

function eyePosition() {
  const avatar = selectedAvatar();
  if (avatar?.eye_local && state.avatarMesh === avatar.animal_id) {
    const avatarPlacement = matrixFromRows(state.playerRigs.player_anchors.avatar.matrix);
    return ghostRig.localToWorld(new THREE.Vector3(...avatar.eye_local).applyMatrix4(avatarMeshToGameBasis)
      .applyMatrix4(headPoseDelta()).applyMatrix4(avatarPlacement));
  }
  return ghostRig.localToWorld(new THREE.Vector3(0, 1.65, 0.16));
}

// The second-hand copy of a "Show in both hands" invention lives under its own key (wornCopyKey(id, true)).
const OTHER_HAND_SUFFIX = "#other-hand";
const OTHER_HAND = { handLeft: "handRight", handRight: "handLeft" };
function wornCopyKey(documentId, otherHand = false) { return otherHand ? documentId + OTHER_HAND_SUFFIX : documentId; }
function removeWornCopy(key) {
  const entry = wornCopies.get(key);
  if (entry) wornInvention.remove(entry.copy);
  wornCopies.delete(key);
  if (wornCopy && wornCopy === entry?.copy) wornCopy = null;
}

function syncWornInvention(document, root, playerAnchor, itemAnchor, defaultHandOffset, { otherHand = false } = {}) {
  // Keep the source graph editable; display a separate copy on the avatar.
  const sourceNodes = [];
  root.group.traverse((node) => sourceNodes.push(node));
  const signature = sourceNodes.map((node) => node.uuid).join("|");
  const key = wornCopyKey(document.id, otherHand);
  let entry = wornCopies.get(key);
  if (!entry || signature !== entry.signature) {
    if (entry) wornInvention.remove(entry.copy);
    entry = { copy: root.group.clone(true), signature };
    wornCopies.set(key, entry);
    wornInvention.add(entry.copy);
  }
  const copy = entry.copy;
  if (!otherHand) wornCopy = document.id === state.activeDocumentId ? copy : wornCopy;
  const copyNodes = [];
  copy.traverse((node) => copyNodes.push(node));
  sourceNodes.forEach((node, index) => {
    if (index === 0) return;
    copyNodePose(copyNodes[index], node);
  });
  // The other hand takes the game's own grip for that hand; the numeric preview offset belongs to the chosen hand.
  const offset = otherHand ? new THREE.Matrix4() : new THREE.Matrix4().compose(new THREE.Vector3(...document.preview.position),
    new THREE.Quaternion(...document.preview.rotation), new THREE.Vector3(1, 1, 1));
  copy.matrixAutoUpdate = false;
  copy.matrix.copy(wornRootMatrix(playerAnchor, offset, defaultHandOffset, itemAnchor));
  copy.updateMatrixWorld(true);
}

// Mirror one node's local pose onto its copy. Nodes placed by matrix (robot arm joint mounts, crossbow slots) copy it.
function copyNodePose(copy, node) {
  if (node.matrixAutoUpdate === false) {
    copy.matrixAutoUpdate = false;
    copy.matrix.copy(node.matrix);
    copy.matrixWorldNeedsUpdate = true;
  } else {
    copy.matrixAutoUpdate = true;
    copy.position.copy(node.position);
    copy.quaternion.copy(node.quaternion);
    copy.scale.copy(node.scale);
  }
  copy.visible = node.visible;
}

function wornRecordGroup(uid) {
  let found = null;
  for (const entry of wornCopies.values()) {
    entry.copy.traverse((node) => { if (node.userData?.uid === uid) found = node; });
    if (found) break;
  }
  return found;
}

// ---- Holder loading preview (crossbow, heart gun, salmon cannon) ----
// A holder draws its held item where the game holds it (holder_pose.mjs, live-verified on client D); a crossbow also pulls
// its string back. The loaded item is the crossbow's own saved contents (native children[0], drawn read-only) or
// another workspace invention whose preview attachment is this crossbow (a live copy that follows its edits). The
// ghost player can hold a ghost crossbow that inventions attached to "Ghost crossbow" load into the same way.
const CROSSBOW_ATTACHMENT = "crossbow";
const GHOST_CROSSBOW_ATTACHMENT = "ghost_crossbow";
const holderDisplays = new Map();          // crossbow record uid -> { container, signature, copy, copySignature }
const stringRestPositions = new WeakMap();  // string geometry -> rest positions
const ghostCrossbow = new THREE.Group();
ghostCrossbow.name = "ghost_crossbow";
ghostCrossbow.visible = false;
ghostRig.add(ghostCrossbow);
const ghostCrossbowState = { itemID: null, model: null, request: 0, entry: null };
// Where the ghost wears its crossbow: the game lets crossbows sit in either hand, on the back, or on either hip
// (equip config allowAttachToBack / allowAttachToHip), each with its own exported grip anchor.
const GHOST_CROSSBOW_SLOTS = ["handRight", "handLeft", "back", "hipLeft", "hipRight"];
function ghostCrossbowSlot(slot, legacyHand = null) {
  if (GHOST_CROSSBOW_SLOTS.includes(slot)) return slot;
  return legacyHand === "left" ? "handLeft" : "handRight";   // ghost states saved before slots stored only a hand
}

function recordRoute(record) {
  const route = [];
  for (let current = record, parent = parentOf(record); parent; current = parent, parent = parentOf(parent)) {
    route.unshift(parent.children.indexOf(current.uid));
  }
  return route;
}

function recordAtRoute(documentId, route) {
  let current = documentRoot(documentId);
  for (const index of Array.isArray(route) ? route : []) current = current ? recordByUid(current.children[index]) : null;
  return current || null;
}

// The crossbow record an invention is loaded into, or null (missing, not a crossbow, own document, or a cycle).
function documentHolderRecord(document) {
  if (document?.preview?.attachment !== CROSSBOW_ATTACHMENT) return null;
  const seen = new Set([document.id]);
  for (let holder = document.preview.holder; holder; ) {
    if (seen.has(holder.documentId)) return null;
    seen.add(holder.documentId);
    const next = state.documents.find((item) => item.id === holder.documentId);
    holder = next?.preview?.attachment === CROSSBOW_ATTACHMENT ? next.preview.holder : null;
  }
  const holder = document.preview.holder;
  const record = recordAtRoute(holder?.documentId, holder?.route);
  return record && HOLDER.holderEntry(record.itemID) ? record : null;
}

function heldDisplayMatrix(holderItemID, holderScaleModifier, itemID, itemScaleModifier) {
  const pose = HOLDER.heldItemPose(holderItemID, holderScaleModifier, itemID, itemScaleModifier);
  return pose ? new THREE.Matrix4().compose(gameArrToEditorVec(pose.pos), gameArrToEditorQuat(pose.rot), new THREE.Vector3(1, 1, 1)) : null;
}

// Crossbow.UpdateStringView: TRS(pull * forward) blended per vertex. `owner` is the crossbow's runtime-Root frame.
function setCrossbowStringPull(itemID, owner, model, scaleModifier, pull) {
  const holder = HOLDER.crossbowHolder(itemID);
  if (!holder || !model || !owner) return;
  const name = holder.string.path.split("/").pop();
  let mesh = null;
  model.traverse((node) => { if (!mesh && node.isMesh && (node.name === name || node.parent?.name === name)) mesh = node; });
  if (!mesh || mesh.userData.stringPull === pull) return;
  if (!stringRestPositions.has(mesh.geometry)) {
    mesh.geometry = mesh.geometry.clone();
    stringRestPositions.set(mesh.geometry, Float32Array.from(mesh.geometry.attributes.position.array));
  }
  const rest = stringRestPositions.get(mesh.geometry);
  const position = mesh.geometry.attributes.position;
  owner.updateMatrixWorld(true);
  const toOwner = owner.matrixWorld.clone().invert().multiply(mesh.matrixWorld);
  const fromOwner = new THREE.Matrix3().setFromMatrix4(toOwner).invert();
  const scalar = scaleModifierToScalar(scaleModifier, itemID);
  const vertex = new THREE.Vector3();
  const offset = new THREE.Vector3();
  for (let i = 0; i < position.count; i++) {
    vertex.fromArray(rest, i * 3).applyMatrix4(toOwner);
    const shift = HOLDER.stringVertexOffset(itemID, editorVecToGameArr(vertex)[0] / scalar, pull);
    offset.copy(gameArrToEditorVec(shift.map((value) => value * scalar))).applyMatrix3(fromOwner);
    position.setXYZ(i, rest[i * 3] + offset.x, rest[i * 3 + 1] + offset.y, rest[i * 3 + 2] + offset.z);
  }
  position.needsUpdate = true;
  mesh.geometry.computeBoundingBox();
  mesh.geometry.computeBoundingSphere();
  mesh.userData.stringPull = pull;
}

// Read-only display of a saved item graph (a crossbow's contents): same models, visual state and stuck-edge math
// as editable records, but no records, so it never enters the exported JSON.
// `options.nested`: the item is itself a holder's held item (a nested heart gun keeps nothing attached).
async function buildItemDisplay(item, isCurrent, options = {}) {
  const group = new THREE.Group();
  group.name = item.itemID;
  group.userData.previewOnly = true;
  const entry = entryForItem(item.itemID);
  let model = null;
  try { model = entry?.exists && entry.url ? await loadModel(entry) : null; } catch (_) { model = null; }
  if (!isCurrent()) return null;
  const display = { itemID: item.itemID, group, model: model || makeFallbackModel(item.itemID),
    scaleModifier: Math.round(clamp(item.scaleModifier || 0, -128, 127)),
    colorHue: Math.round(clamp(item.colorHue || 0, 0, 255)), colorSaturation: Math.round(clamp(item.colorSaturation || 0, -128, 127)),
    jellyStrength: Math.round(clamp(item.jellyStrength || 0, 0, 255)), state: nativeItemState(item.state),
    ammo: RULES.clampGunAmmo(item.itemID, item.ammo), contents: RULES.contentsOf(item) };
  group.add(display.model);
  applyObjectVisualState(display);
  const robotArm = isRobotArmItem(item.itemID);
  if (robotArm) {
    group.userData.robotArm = { itemID: item.itemID, scaleModifier: display.scaleModifier };
    display.model.userData.robotArmModel = true;
  }
  const joystick = MOTION.isJoystick(item.itemID);
  if (MOTION.movingPartKind(item.itemID)) {
    group.userData.movingPart = { itemID: item.itemID, scaleModifier: display.scaleModifier };
    display.model.userData.movingPartModel = true;
    motionPreview.displays = true;
  }
  for (const edge of Array.isArray(item.stuckChildren) ? item.stuckChildren : []) {
    if (!edge?.item?.itemID) continue;
    const child = await buildItemDisplay(edge.item, isCurrent);
    if (!child) return null;
    const pose = RULES.edgeToDrawnPose(edge, item.itemID, display.scaleModifier, edge.item.itemID,
      Math.round(clamp(edge.item.scaleModifier || 0, -128, 127)));
    if (pose) {
      child.position.copy(gameArrToEditorVec(pose.pos));
      child.quaternion.copy(gameArrToEditorQuat(pose.rot));
    }
    const sub = Math.round(Number(edge.subParentID) || 0);
    (robotArm && sub >= 1 && sub <= 3 ? robotArmMount(group, sub)
      : joystick && sub === MOTION.JOYSTICK_STICK_FRAME ? joystickStickMount(group) : group).add(child);
  }
  if (HOLDER.holderEntry(item.itemID)) {
    const plan = HOLDER.holderLoadPlan(item.itemID, display.contents, { nested: !!options.nested });
    if (plan.loaded) {
      const inner = await buildItemDisplay(plan.loaded, isCurrent, { nested: true });
      if (!inner) return null;
      inner.matrixAutoUpdate = false;
      inner.matrix.copy(heldDisplayMatrix(item.itemID, display.scaleModifier, plan.loaded.itemID,
        Math.round(clamp(plan.loaded.scaleModifier || 0, -128, 127))));
      group.add(inner);
    }
    setCrossbowStringPull(item.itemID, group, display.model, display.scaleModifier, plan.loaded ? HOLDER.stringPullDistance() : 0);
  }
  if (FILM.filmRole(item.itemID) === "tripod") {
    const mount = FILM.tripodMountPlan(display.contents);
    if (mount.mounted) {
      const inner = await buildItemDisplay(mount.mounted, isCurrent);
      if (!inner) return null;
      inner.matrixAutoUpdate = false;
      inner.matrix.copy(filmMountMatrix(display.scaleModifier, mount.mounted.itemID,
        Math.round(clamp(mount.mounted.scaleModifier || 0, -128, 127))) || new THREE.Matrix4());
      inner.userData.tripodMountBase = inner.matrix.toArray();   // the swivel head turns it (poseMovingGroup)
      group.add(inner);
    }
  }
  return group;
}

// Mirror a live invention into a holder container: rebuild when its node set changes, else copy local poses.
function syncHolderCopy(entry, source) {
  const sourceNodes = [];
  source.traverse((node) => sourceNodes.push(node));
  const signature = sourceNodes.map((node) => node.uuid).join("|");
  if (!entry.copy || entry.copySignature !== signature) {
    if (entry.copy) entry.container.remove(entry.copy);
    entry.copy = source.clone(true);
    entry.copySignature = signature;
    entry.container.add(entry.copy);
  }
  const copyNodes = [];
  entry.copy.traverse((node) => copyNodes.push(node));
  sourceNodes.forEach((node, index) => {
    if (!index) return;
    copyNodePose(copyNodes[index], node);
  });
  entry.copy.matrixAutoUpdate = false;
  entry.copy.matrix.identity();
  entry.copy.visible = true;
}

function removeHolderDisplay(uid) {
  const entry = holderDisplays.get(uid);
  if (!entry) return;
  entry.container.parent?.remove(entry.container);
  holderDisplays.delete(uid);
}

// What a holder record shows: an attached invention wins over its saved contents (the live edit).
function crossbowLoadSource(record, attachedDocument = null) {
  const sourceRoot = attachedDocument ? documentRoot(attachedDocument.id) : null;
  const nested = holderRecordIsNested(record);
  if (sourceRoot) {
    const plan = HOLDER.holderLoadPlan(record.itemID, [{ itemID: sourceRoot.itemID }], { nested });
    return { kind: "document", document: attachedDocument, root: sourceRoot, plan, loaded: plan.reason === "loaded" };
  }
  const plan = HOLDER.holderLoadPlan(record.itemID, record.contents, { nested });
  return { kind: "contents", plan, loaded: !!plan.loaded };
}

// A holder record that is itself loaded into another holder (its document's root, attached to a holder): the game
// Deserializes it nested, so a nested heart gun keeps nothing attached (HeartGun.HandleDeserialize).
function holderRecordIsNested(record) {
  const document = state.documents.find((item) => item.id === record?.documentId);
  return !!document && documentRoot(document.id) === record && !!documentHolderRecord(document);
}

function syncHolderPreviews() {
  if (!HOLDER.holderManifestInstalled()) return;
  const attached = new Map();
  for (const document of state.documents) {
    const holder = document.preview.visible ? documentHolderRecord(document) : null;
    if (holder && documentRoot(document.id) && !attached.has(holder.uid)) attached.set(holder.uid, document);
  }
  const live = new Set();
  for (const record of state.objects) {
    if (!HOLDER.holderEntry(record.itemID)) continue;
    live.add(record.uid);
    const source = crossbowLoadSource(record, attached.get(record.uid));
    const signature = !source.loaded ? "" : source.kind === "document"
      ? `doc:${source.document.id}` : `json:${record.itemID}:${JSON.stringify(source.plan.loaded)}`;
    let entry = holderDisplays.get(record.uid);
    if (entry && (entry.signature !== signature || entry.container.parent !== record.group)) {
      removeHolderDisplay(record.uid);
      entry = null;
    }
    if (source.loaded && !entry) {
      entry = { container: new THREE.Group(), signature, copy: null, copySignature: "" };
      entry.container.name = "crossbow_loaded_preview";
      entry.container.userData.previewOnly = true;
      entry.container.matrixAutoUpdate = false;
      record.group.add(entry.container);
      holderDisplays.set(record.uid, entry);
      if (source.kind === "contents") {
        const isCurrent = () => holderDisplays.get(record.uid) === entry;
        buildItemDisplay(source.plan.loaded, isCurrent, { nested: true }).then((group) => {   // the held item is a nested load
          if (group && isCurrent()) { entry.copy = group; entry.container.add(group); }
        }).catch((err) => console.warn(`crossbow contents preview: ${err.message || err}`));
      }
    }
    if (entry) {
      const loaded = source.kind === "document" ? source.root : source.plan.loaded;
      const matrix = heldDisplayMatrix(record.itemID, record.scaleModifier, loaded.itemID,
        source.kind === "document" ? loaded.scaleModifier : Math.round(clamp(loaded.scaleModifier || 0, -128, 127)));
      if (matrix) entry.container.matrix.copy(matrix);
      if (source.kind === "document") syncHolderCopy(entry, source.root.group);
    }
    setCrossbowStringPull(record.itemID, record.group, record.model, record.scaleModifier,
      source.loaded ? HOLDER.stringPullDistance() : 0);
  }
  for (const uid of [...holderDisplays.keys()]) if (!live.has(uid)) removeHolderDisplay(uid);
}

// Ghost crossbow: held in a ghost hand exactly like a worn invention whose root is the crossbow.
function syncGhostCrossbow() {
  const config = state.ghostCrossbow;
  const itemID = config?.itemID && HOLDER.crossbowHolder(config.itemID) ? config.itemID : null;
  ghostCrossbow.visible = !!itemID && ghostRig.visible;
  if (!itemID) {
    if (ghostCrossbowState.model) ghostCrossbow.remove(ghostCrossbowState.model);
    if (ghostCrossbowState.entry) ghostCrossbow.remove(ghostCrossbowState.entry.container);
    Object.assign(ghostCrossbowState, { itemID: null, model: null, entry: null, request: ghostCrossbowState.request + 1 });
    return;
  }
  const scaleModifier = Math.round(clamp(config.scaleModifier || 0, -128, 127));
  if (ghostCrossbowState.itemID !== itemID || ghostCrossbowState.scaleModifier !== scaleModifier) {
    const request = ++ghostCrossbowState.request;
    if (ghostCrossbowState.model) ghostCrossbow.remove(ghostCrossbowState.model);
    ghostCrossbowState.model = null;
    ghostCrossbowState.itemID = itemID;
    ghostCrossbowState.scaleModifier = scaleModifier;
    const entry = entryForItem(itemID);
    (entry?.exists && entry.url ? loadModel(entry) : Promise.resolve(null)).then((model) => {
      if (request !== ghostCrossbowState.request) return;
      const display = { itemID, group: ghostCrossbow, model: model || makeFallbackModel(itemID), scaleModifier,
        colorHue: 0, colorSaturation: 0, jellyStrength: 0, state: 0, ammo: 0, contents: [] };
      ghostCrossbowState.model = display.model;
      ghostCrossbow.add(display.model);
      applyObjectVisualState(display);
      syncGhostCrossbow();
    }).catch((err) => setStatus(`Ghost crossbow model failed: ${err.message || err}`, "bad"));
  }
  const key = ghostCrossbowSlot(config.slot);
  ghostCrossbow.matrixAutoUpdate = false;
  ghostCrossbow.matrix.copy(wornRootMatrix(playerAnchorMatrix(key), new THREE.Matrix4(),
    defaultHandGrabOffsetMatrix(itemID, key, scaleModifier), itemAnchorMatrix(itemID, key, scaleModifier)));
  const document = state.documents.find((item) => item.preview.visible && item.preview.attachment === GHOST_CROSSBOW_ATTACHMENT &&
    documentRoot(item.id));
  const root = document ? documentRoot(document.id) : null;
  const loaded = !!root && HOLDER.isLoadableIntoCrossbow(root.itemID) === true;
  const signature = loaded ? `${document.id}` : "";
  if (ghostCrossbowState.entry && ghostCrossbowState.entry.signature !== signature) {
    ghostCrossbow.remove(ghostCrossbowState.entry.container);
    ghostCrossbowState.entry = null;
  }
  if (loaded) {
    if (!ghostCrossbowState.entry) {
      const container = new THREE.Group();
      container.name = "ghost_crossbow_loaded";
      container.matrixAutoUpdate = false;
      ghostCrossbow.add(container);
      ghostCrossbowState.entry = { container, signature, copy: null, copySignature: "" };
    }
    ghostCrossbowState.entry.container.matrix.copy(heldDisplayMatrix(itemID, scaleModifier, root.itemID, root.scaleModifier));
    syncHolderCopy(ghostCrossbowState.entry, root.group);
  }
  setCrossbowStringPull(itemID, ghostCrossbow, ghostCrossbowState.model, scaleModifier, loaded ? HOLDER.stringPullDistance() : 0);
}

function attachmentSelectValue(document) {
  const preview = document?.preview;
  if (preview?.attachment === CROSSBOW_ATTACHMENT && preview.holder) {
    return `crossbow:${preview.holder.documentId}:${(preview.holder.route || []).join(".")}`;
  }
  return preview?.attachment || "free";
}

// True when loading `current` into a crossbow of `targetDocumentId` would load it into itself.
function crossbowAttachmentCycles(current, targetDocumentId) {
  const seen = new Set();
  for (let id = targetDocumentId; id && !seen.has(id); ) {
    if (id === current.id) return true;
    seen.add(id);
    const document = state.documents.find((item) => item.id === id);
    id = document?.preview?.attachment === CROSSBOW_ATTACHMENT ? document.preview.holder?.documentId : null;
  }
  return false;
}

function renderCrossbowAttachOptions(current) {
  const select = $("activeDocumentAttach");
  const group = $("crossbowAttachOptions");
  if (!select || !group) return;
  const ghost = select.querySelector(`option[value="${GHOST_CROSSBOW_ATTACHMENT}"]`);
  if (ghost) ghost.disabled = !HOLDER.holderManifestInstalled();
  group.textContent = "";
  if (current && HOLDER.holderManifestInstalled()) {
    for (const document of state.documents) {
      if (document.id === current.id || crossbowAttachmentCycles(current, document.id)) continue;
      for (const record of state.objects) {
        if (record.documentId !== document.id || !HOLDER.holderEntry(record.itemID)) continue;
        group.append(new Option(`${document.name} › ${displayName(record)}`, `crossbow:${document.id}:${recordRoute(record).join(".")}`));
      }
    }
    const value = attachmentSelectValue(current);
    if (value.startsWith("crossbow:") && ![...group.children].some((option) => option.value === value)) {
      group.append(new Option("Missing holder (removed or moved)", value));
    }
  }
  group.disabled = !group.children.length;
  if (!group.children.length) group.append(new Option("No crossbow, heart gun or salmon cannon in another invention", "", false, false));
  for (const option of group.children) if (!option.value) option.disabled = true;
}

function sentence(text) { const t = String(text || ""); return t ? t[0].toUpperCase() + t.slice(1) + "." : ""; }

// Items that save a held item as their children[0] and so take a whole other invention (owner 2026-10-18: everything with
// an anchor chains): crossbow, heart gun and salmon cannon (holder_pose.mjs) and the tripod's mount (film_gear.mjs). A
// crossbow, salmon cannon or tripod keeps its item even when it is itself a nested load; a heart gun does not (decompile
// 25996600: only HeartGun.HandleDeserialize checks isNestedItem; FilmGearAttachments.Deserialize never receives it).
function takesInvention(record) {
  return !!record && (!!HOLDER.holderEntry(record.itemID) || FILM.filmRole(record.itemID) === "tripod");
}
function takesInventionNoun(record) {
  return HOLDER.holderEntry(record?.itemID) ? HOLDER.holderNoun(record.itemID) : "tripod";
}
function inventionLoadPlan(record, contents) {
  if (HOLDER.holderEntry(record.itemID)) return HOLDER.holderLoadPlan(record.itemID, contents, { nested: holderRecordIsNested(record) });
  const plan = FILM.tripodMountPlan(contents);
  return { loaded: plan.mounted, reason: plan.mounted ? "loaded" : plan.reason, item: plan.item, ignored: plan.ignored };
}

// Why a holder drops `itemID` loose, in words (holderLoadPlan reason).
function holderRefusalText(record, itemID, reason) {
  const noun = HOLDER.holderNoun(record.itemID);
  if (reason === "nested") return `this ${noun} is itself loaded into another holder, and a nested heart gun keeps nothing attached; ${itemID} drops loose`;
  if (reason === "not a fish") return `a salmon cannon holds only fish; ${itemID} drops loose next to it`;
  if (reason === "unknown item") return `${itemID} is not a grabbable item in this game build; nothing is held`;
  if (reason === "not mountable") return `a tripod mounts only a camera, light or mic; ${itemID} stays off the head`;
  return `${itemID} cannot load into a ${noun} in this game build (its equip config does not allow it); the game drops it loose next to it`;
}

// Owner 2026-10-19 ("when you try to put something into a crossbow it spawns in not on the crossbow"): Put inside and Import
// inside used to save ANY item as a holder's held item with a success message, though the game spawns an item the holder
// cannot hold loose next to it (orders that day: a backpack in a crossbow spawned beside it; crates in crossbows failed).
// `path` is the Contents path of `container` under `record` ([] = the record itself). Returns the refusal sentence, or "".
function holderAddRefusalText(record, path, container, itemID) {
  // Glitched record-only items (Unknown Item) keep their own bag-only rule in addContentToSelected.
  if (!record || !container || !HOLDER.holderEntry(container.itemID) || RULES.RECORD_ONLY_ITEM_IDS.has(itemID)) return "";
  // A holder that is itself a held item is Deserialized nested (only HeartGun cares: it then keeps nothing attached).
  const parent = !path?.length ? null : path.length > 1 ? getContainedItem(record, path.slice(0, -1)) : record;
  const nested = path?.length ? RULES.containerRule(parent?.itemID)?.kind === "holder" : holderRecordIsNested(record);
  const reason = HOLDER.holderAddRefusal(container.itemID, itemID, { nested });
  if (!reason) return "";
  const noun = HOLDER.holderNoun(container.itemID);
  const hint = reason === "not a fish" ? "Load a fish instead."
    : reason === "nested" ? "Stick this heart gun onto a part of the loaded invention instead, then load it."
    : reason === "unknown item" ? "Put it in a quiver, ammo pouch, grenade launcher or bag instead."
    : `To carry it anyway, stick it onto the ${noun} (Child) or load it into a heart gun, which holds any grabbable item.`;
  return `Not loaded: ${holderRefusalText(container, itemID, reason)}.${hint ? ` ${hint}` : ""}`;   // item ids stay lower case
}

// Notes for the Properties and Contents panels about what a holder (or an attached invention) shows.
function crossbowStatusText(record) {
  if (!record || !HOLDER.holderManifestInstalled()) return "";
  if (HOLDER.holderEntry(record.itemID)) {
    const noun = HOLDER.holderNoun(record.itemID);
    const attached = state.documents.find((document) => document.preview.visible && documentHolderRecord(document) === record);
    const source = crossbowLoadSource(record, attached || null);
    if (source.kind === "document") {
      return source.loaded ? `Holding the invention "${attached.name}" (live preview). Use Load a copy to save it inside this ${noun}.`
        : `"${attached.name}" starts with ${source.root.itemID}: ${holderRefusalText(record, source.root.itemID, source.plan.reason)}.`;
    }
    const first = (record.contents || [])[0];
    if (!first) return `Empty. ${noun === "salmon cannon" ? "Load a fish" : "Load a catalog item or a copy of another invention"}.`;
    if (source.plan.reason !== "loaded") return sentence(holderRefusalText(record, first.itemID, source.plan.reason));
    return `Holds ${first.itemID}${source.plan.ignored ? `; ${source.plan.ignored} more ignored (the game holds only the first)` : ""}. Drawn where the game holds it${HOLDER.crossbowHolder(record.itemID) ? ", string pulled back" : ""}.`;
  }
  return "";
}

function crossbowValidationRows(documentId) {
  const rows = [];
  if (!HOLDER.holderManifestInstalled()) return rows;
  for (const record of state.objects) {
    if (record.documentId !== documentId || !HOLDER.holderEntry(record.itemID)) continue;
    const plan = HOLDER.holderLoadPlan(record.itemID, record.contents, { nested: holderRecordIsNested(record) });
    if (plan.item && plan.reason !== "loaded") rows.push(["warn", `${record.itemID} holds ${plan.item.itemID}: ${holderRefusalText(record, plan.item.itemID, plan.reason)}.`]);
    if (plan.ignored > 0) rows.push(["warn", `${record.itemID} has ${plan.ignored + 1} items in children; the game holds only the first.`]);
  }
  const document = state.documents.find((item) => item.id === documentId);
  const root = documentRoot(documentId);
  const holder = document ? documentHolderRecord(document) : null;
  if (root && holder && HOLDER.canHold(holder.itemID, root.itemID, { nested: holderRecordIsNested(holder) }) === false) {
    rows.push(["warn", `This invention's root ${root.itemID}: ${holderRefusalText(holder, root.itemID,
      HOLDER.holderLoadPlan(holder.itemID, [{ itemID: root.itemID }], { nested: holderRecordIsNested(holder) }).reason)}.`]);
  } else if (root && document?.preview?.attachment === GHOST_CROSSBOW_ATTACHMENT && HOLDER.isLoadableIntoCrossbow(root.itemID) === false) {
    rows.push(["warn", `This invention's root ${root.itemID} cannot be loaded into a crossbow in this game build.`]);
  }
  return rows;
}

// ---- Film gear (owner 2026-10-15; film_gear.mjs) ----
// Filters on a camera and gels on a light are stuck children the paced loader clips into slots after the build (the game
// does not save them); the panel keeps them on the exported slot poses in invention order. A tripod mounts its
// contents[0], drawn read-only on the Mount anchor like a crossbow's loaded item.
const filmMountDisplays = new Map();   // tripod record uid -> { container, signature }

function filmMatrix(pose) {
  return pose ? new THREE.Matrix4().compose(gameArrToEditorVec(pose.pos), gameArrToEditorQuat(pose.rot), new THREE.Vector3(1, 1, 1)) : null;
}

function filmMountMatrix(tripodScaleModifier, itemID, itemScaleModifier) {
  return filmMatrix(FILM.mountPose(tripodScaleModifier, itemID, itemScaleModifier, HOLDER.bottomAnchor(itemID)));
}

function removeFilmMountDisplay(uid) {
  const entry = filmMountDisplays.get(uid);
  if (!entry) return;
  entry.container.parent?.remove(entry.container);
  filmMountDisplays.delete(uid);
}

function syncFilmMountPreviews() {
  const live = new Set();
  if (FILM.filmManifestInstalled()) {
    for (const record of state.objects) {
      if (FILM.filmRole(record.itemID) !== "tripod") continue;
      const plan = FILM.tripodMountPlan(record.contents);
      if (!plan.mounted) continue;
      live.add(record.uid);
      const signature = JSON.stringify(plan.mounted);
      let entry = filmMountDisplays.get(record.uid);
      if (entry && (entry.signature !== signature || entry.container.parent !== record.group)) {
        removeFilmMountDisplay(record.uid);
        entry = null;
      }
      if (!entry) {
        entry = { container: new THREE.Group(), signature };
        entry.container.name = "tripod_mounted_preview";
        entry.container.userData.previewOnly = true;
        entry.container.matrixAutoUpdate = false;
        record.group.add(entry.container);
        filmMountDisplays.set(record.uid, entry);
        const isCurrent = () => filmMountDisplays.get(record.uid) === entry;
        buildItemDisplay(plan.mounted, isCurrent).then((group) => {
          if (group && isCurrent()) entry.container.add(group);
        }).catch((err) => console.warn(`tripod mount preview: ${err.message || err}`));
      }
      const matrix = filmMountMatrix(record.scaleModifier, plan.mounted.itemID,
        Math.round(clamp(plan.mounted.scaleModifier || 0, -128, 127)));
      if (matrix) {
        entry.container.matrix.copy(matrix);
        entry.container.userData.tripodMountBase = matrix.toArray();   // the swivel head turns it (poseMovingGroup)
        poseMovingGroupNow(record.group);
      }
    }
  }
  for (const uid of [...filmMountDisplays.keys()]) if (!live.has(uid)) removeFilmMountDisplay(uid);
}

// The receiver's direct children with their slot (or why they stay stuck), in invention order.
function filmSlotRows(receiver) {
  const children = receiver.children.map((uid) => recordByUid(uid)).filter(Boolean);
  const plan = FILM.attachmentPlan(receiver.itemID, children.map((child) => ({ itemID: child.itemID, subParentID: child.subParentID })));
  return plan.map((row) => ({ ...row, record: children[row.index] }));
}

function snapFilmParts(receiver) {
  let moved = 0;
  for (const row of filmSlotRows(receiver)) {
    if (row.slot === null || row.record.frozenEdge) continue;
    const pose = FILM.slotPose(receiver.itemID, receiver.scaleModifier, row.slot, row.record.itemID, row.record.scaleModifier,
      HOLDER.bottomAnchor(row.record.itemID));
    if (!pose) continue;
    placeChildGroup(row.record);
    row.record.group.position.copy(gameArrToEditorVec(pose.pos));
    row.record.group.quaternion.copy(gameArrToEditorQuat(pose.rot));
    row.record.group.scale.set(1, 1, 1);
    markTransformDirty(row.record);
    moved++;
  }
  return moved;
}

function removeFilmPart(record) {
  const doomed = new Set(subtreeRecords(record).map((item) => item.uid));
  const parent = parentOf(record);
  if (parent) parent.children = parent.children.filter((uid) => uid !== record.uid);
  record.group.parent?.remove(record.group);
  state.objects = state.objects.filter((item) => !doomed.has(item.uid));
  pruneSelectionGroups();
  if (doomed.has(state.parentTargetUid)) setParentTarget(rootRecord());
}

function addFilmChild(parent, itemID, scaleModifier = 0) {
  const child = makeObjectRecord(itemID, "child");
  child.documentId = parent.documentId;
  child.scaleModifier = Math.round(clamp(scaleModifier, -128, 127));
  state.objects.push(child);
  linkToParent(child, parent);
  placeChildGroup(child);
  child.hierarchyDirty = true;
  markTransformDirty(child);
  return child;
}

// Slot k of a camera / light: replace its part with `itemID` (keeping its place in the invention order), remove it
// (itemID ""), or add a new part when the slot is empty. Then every part is put back on its slot.
function setFilmSlot(receiver, slot, itemID) {
  if (!receiver || !state.objects.includes(receiver)) return;
  const rows = filmSlotRows(receiver).filter((row) => row.slot !== null);
  const current = rows.find((row) => row.slot === slot)?.record || null;
  if (current && current.itemID === itemID) return;
  if (!current && !itemID) return;
  if (itemID && !current) {
    const existing = RULES.validateInvention(buildGoopJson()).stats.nodes - 1;
    if (existing >= RULES.STASH_MAX_DESCENDANTS) return setStatus("A new part would exceed the game's 512-descendant limit.", "bad");
  }
  beginEditorHistoryGroup();
  try {
    let created = null;
    if (current) {
      const index = receiver.children.indexOf(current.uid);
      removeFilmPart(current);
      if (itemID) {
        created = addFilmChild(receiver, itemID, current.scaleModifier);
        receiver.children = receiver.children.filter((uid) => uid !== created.uid);
        receiver.children.splice(Math.max(0, index), 0, created.uid);   // same place in the invention order = same slot
      }
    } else {
      created = addFilmChild(receiver, itemID);
    }
    snapFilmParts(receiver);
    if (created) void attachModel(created);
    selectRecord(receiver);
    renderHierarchyTree();
    refreshPreview();
    const what = FILM.filmRole(receiver.itemID) === "camera" ? "filter" : "gel";
    setStatus(itemID ? `Slot ${slot + 1}: ${itemID} (clips in after the build; the game does not save ${what}s).`
      : `Removed the ${what} from slot ${slot + 1}; the others moved up a slot.`, "good");
  } finally {
    endEditorHistoryGroup();
  }
}

function filmPartLabel(itemID) {
  return state.catalogById.get(itemID)?.name || itemID.replace(/^item_film_(filter|gel)_/, "");
}

function syncFilmPanel(record, count) {
  const note = $("filmNote");
  if (!note) return;
  const slotTools = $("filmSlotTools"), mountTools = $("filmMountTools");
  slotTools.hidden = true;
  mountTools.hidden = true;
  if (!FILM.filmManifestInstalled()) {
    note.textContent = `Film gear data unavailable${state.filmError ? `: ${state.filmError}` : ""}.`;
    return;
  }
  const role = record && count === 1 ? FILM.filmRole(record.itemID) : null;
  if (!role) {
    note.textContent = "Select a film camera (filters), film light (gels), tripod (mount) or directors tablet.";
    return;
  }
  if (role === "camera" || role === "light") {
    const what = role === "camera" ? "filter" : "gel";
    const rows = filmSlotRows(record);
    const used = rows.filter((row) => row.slot !== null);
    const extra = rows.length - used.length;
    note.textContent = `${role === "camera" ? "Filters stack on the picture" : "Gels tint the light"}. The game does not save ${what}s, so they are stuck to this ${role} in the file and A's loader clips them into its ${FILM.slotCount(record.itemID)} slots after the build.` +
      (extra ? ` ${extra} more ${what}(s) stuck here stay where they are (no free slot, or on a moving part).` : "") +
      (record.frozenEdge ? " This item's own pose is locked verbatim." : "");
    const list = $("filmSlotList");
    list.textContent = "";
    const options = FILM.partIDsFor(record.itemID);
    for (let slot = 0; slot < FILM.slotCount(record.itemID); slot++) {
      const row = used.find((item) => item.slot === slot);
      if (!row && slot > used.length) break;   // slots fill in order: show the filled ones and the next free one
      const label = document.createElement("label");
      label.textContent = `Slot ${slot + 1}`;
      const select = document.createElement("select");
      select.dataset.filmSlot = String(slot);
      select.append(new Option(row ? "(remove)" : "(empty)", ""));
      for (const id of options) select.append(new Option(filmPartLabel(id), id));
      select.value = row ? row.record.itemID : "";
      select.disabled = !!row?.record.frozenEdge;
      label.append(select);
      list.append(label);
    }
    $("filmSnapBtn").disabled = !used.length;
    slotTools.hidden = false;
    return;
  }
  if (role === "tripod") {
    const plan = FILM.tripodMountPlan(record.contents);
    note.textContent = plan.mounted
      ? `Mounted: ${plan.mounted.itemID}. The game saves the mount (the tripod's first content) and puts it on the swivel head.${plan.ignored ? ` ${plan.ignored} more item(s) inside are ignored.` : ""} Filters on a mounted camera are not clipped in by the loader; stick the camera to the tripod instead if it needs filters.`
      : plan.reason === "not mountable" ? `${plan.item.itemID} is inside this tripod but cannot be mounted; the game leaves it off.`
      : "Mount a camera, light or mic on the tripod's head. It is saved as the tripod's contents.";
    const select = $("filmMountItem");
    if (select.options.length !== FILM.mountableIDs().length) {
      select.textContent = "";
      for (const id of FILM.mountableIDs()) select.append(new Option(state.catalogById.get(id)?.name || id, id));
    }
    $("filmUnmountBtn").disabled = !(record.contents || []).length;
    mountTools.hidden = false;
    return;
  }
  if (role === "tablet") {
    note.textContent = `A directors tablet shows a camera within ${FILM.TABLET_RANGE_M} m: the one with the lowest network ID (the first camera this invention spawns), or the one live recording. It is blank unless the local player operates it: held, inside an invention the player holds, or linked to a remote controller (aim, trigger). The operator steps through cameras with the stick; that choice is per player and not saved, so an invention cannot pick a tablet's camera.`;
    return;
  }
  note.textContent = `${record.itemID} is a ${role}: stick it directly on ${role === "filter" ? "an item_film_camera" : "an item_film_light"} to have it clipped into a slot after the build.`;
}

function mountOnSelectedTripod(itemID) {
  const record = state.selected;
  if (!record || FILM.filmRole(record.itemID) !== "tripod" || !FILM.isMountable(itemID)) return;
  beginEditorHistoryGroup();
  try {
    record.contents = [newEditorItem(itemID)];
    syncInspectorFromSelection();
    refreshPreview();
    setStatus(`Mounted ${itemID} on the tripod (saved as its contents).`, "good");
  } finally {
    endEditorHistoryGroup();
  }
}

// VR goggles (owner 2026-10-15): two miniature directors tablets in front of the ghost's eyes and one camera per eye,
// stuck to the Add Parent (the mech body worn by the ghost). film_gear.mjs planGoggles has the geometry.
function addVrGoggles() {
  updateGhostPreview();
  if (!FILM.filmManifestInstalled()) return setStatus(`VR goggles need the film gear data${state.filmError ? `: ${state.filmError}` : ""}.`, "bad");
  const root = rootRecord();
  if (!root || !ghostRig.visible || !wornCopy) return setStatus("Show the ghost player wearing this invention first: the goggles are fitted to its eyes.", "bad");
  const parent = parentTargetRecord() || root;
  if (parent.documentId !== state.activeDocumentId) return setStatus("Choose an Add Parent in the active invention.", "bad");
  if (parent.frozenEdge) return setStatus("The Add Parent has an unprobed pose; choose an editable parent.", "bad");
  const existing = RULES.validateInvention(buildGoopJson()).stats.nodes - 1;
  if (existing + 4 > RULES.STASH_MAX_DESCENDANTS) return setStatus("Four more parts would exceed the game's 512-descendant limit.", "bad");
  root.group.updateMatrixWorld(true);
  wornCopy.updateMatrixWorld(true);
  parent.group.updateWorldMatrix(true, false);
  // ghost (worn copy) space -> editable root space -> the parent's local frame
  const toParent = parent.group.matrixWorld.clone().invert().multiply(root.group.matrixWorld).multiply(wornCopy.matrixWorld.clone().invert());
  const eye = eyePosition().applyMatrix4(toParent);
  const avatarPlacement = matrixFromRows(state.playerRigs?.player_anchors?.avatar?.matrix);
  const headAxis = (v) => v.transformDirection(headPoseDelta()).transformDirection(avatarPlacement)
    .transformDirection(ghostRig.matrixWorld).transformDirection(toParent);
  const number = (id, fallback) => { const n = Number($(id)?.value); return Number.isFinite(n) ? n : fallback; };
  let plan;
  try {
    plan = FILM.planGoggles({
      eye: editorVecToGameArr(eye), forward: editorVecToGameArr(headAxis(new THREE.Vector3(0, 0, 1))),
      up: editorVecToGameArr(headAxis(new THREE.Vector3(0, 1, 0))),
      ipd: clamp(number("gogglesIpd", 6.4), 4, 9) / 100, fovDeg: clamp(number("gogglesFov", 90), 30, 150),
      fill: $("gogglesFill")?.value === "height" ? "height" : "width",
      tabletScaleModifier: Math.round(clamp(number("gogglesTabletScale", -128), -128, 127)),
      cameraBaseline: clamp(number("gogglesCameraSpacing", 6.4), 0, 500) / 100,
      cameraForward: clamp(number("gogglesCameraForward", 0.5), 0, 20),
    });
  } catch (err) {
    return setStatus(`VR goggles: ${err.message || err}`, "bad");
  }
  const earlierCameras = documentRecords().filter((record) => FILM.filmRole(record.itemID) === "camera").length;
  beginEditorHistoryGroup();
  try {
    const created = [];
    for (const part of plan.parts) {
      const child = addFilmChild(parent, part.itemID, part.scaleModifier);
      child.group.position.copy(gameArrToEditorVec(part.pos));
      child.group.quaternion.copy(gameArrToEditorQuat(part.rot));
      created.push(child);
    }
    for (const child of created) void attachModel(child);
    setSelection(created, created[0]);
    renderHierarchyTree();
    refreshPreview();
    const notes = [...plan.warnings];
    if (earlierCameras) notes.push(`This invention already had ${earlierCameras} camera(s); the tablets start on the first one, so step each tablet to its eye's camera in game.`);
    setStatus(`Added VR goggles on ${displayName(parent)}: left/right cameras ${(number("gogglesCameraForward", 0.5)).toFixed(2)} m ahead, tablets ${(plan.distance * 100).toFixed(1)} cm from the eyes (${Math.round(plan.coverageDeg)} degrees). In game: hold two remote controllers, link one to each tablet, then flick the right one once so the right eye shows the right camera.${notes.length ? " " + notes.join(" ") : ""}`, "good");
  } finally {
    endEditorHistoryGroup();
  }
}

function ghostPart(geometry, position, rotation = null) {
  const mesh = new THREE.Mesh(geometry, ghostMaterial);
  mesh.position.set(...position);
  if (rotation) mesh.rotation.set(...rotation);
  ghostBody.add(mesh);
  return mesh;
}

function buildGhostBody() {
  ghostPart(new THREE.CapsuleGeometry(0.31, 0.48, 6, 12), [0, 1.12, 0]);
  ghostPart(new THREE.SphereGeometry(0.25, 14, 10), [0, 1.65, 0.05]);
  ghostPart(new THREE.CapsuleGeometry(0.085, 0.5, 4, 8), [-0.46, 1.16, 0.04], [0, 0, 0.38]);
  ghostPart(new THREE.CapsuleGeometry(0.085, 0.5, 4, 8), [0.46, 1.16, 0.04], [0, 0, -0.38]);
  ghostPart(new THREE.CapsuleGeometry(0.115, 0.53, 4, 8), [-0.17, 0.42, 0]);
  ghostPart(new THREE.CapsuleGeometry(0.115, 0.53, 4, 8), [0.17, 0.42, 0]);
  ghostPart(new THREE.ConeGeometry(0.08, 0.18, 7), [-0.16, 1.91, 0]);
  ghostPart(new THREE.ConeGeometry(0.08, 0.18, 7), [0.16, 1.91, 0]);
}
buildGhostBody();

function setPreviewLine(index, from, to, material) {
  let line = previewLinePool[index];
  if (!line) {
    const geometry = new THREE.BufferGeometry();
    const positions = new THREE.BufferAttribute(new Float32Array(6), 3);
    positions.setUsage(THREE.DynamicDrawUsage);
    geometry.setAttribute("position", positions);
    line = new THREE.Line(geometry, material);
    previewLinePool.push(line);
    ghostLines.add(line);
  }
  const attribute = line.geometry.getAttribute("position");
  attribute.setXYZ(0, from.x, from.y, from.z);
  attribute.setXYZ(1, to.x, to.y, to.z);
  attribute.needsUpdate = true;
  line.material = material;
  line.visible = true;
}

// How far the posed head has turned from rest, in AvatarView space (identity at rest).
function headPoseDelta() {
  const skin = state.avatarArmSkin, rig = state.avatarArmPose;
  const path = skin && jointPaths(skin).get("head");
  const posed = path && rig?.worldByPath.get(path);
  const bone = path && skin.bones.find((item) => item.path === path);
  if (!posed || !bone) return new THREE.Matrix4();
  return new THREE.Matrix4().set(...multiply4(posed, inverseAffine4(matrix4(bone.worldBindMatrix))));
}

function sightTarget() {
  if (!ghostRig.visible) return null;
  const distance = clamp($("sightDistance")?.value || 3, 0.25, 20);
  // The player looks where the posed head faces.
  const avatarPlacement = matrixFromRows(state.playerRigs?.player_anchors?.avatar?.matrix);
  const forward = new THREE.Vector3(0, 0, 1).transformDirection(headPoseDelta()).transformDirection(avatarPlacement)
    .transformDirection(ghostRig.matrixWorld);
  return eyePosition().add(forward.multiplyScalar(distance));
}

function layoutWorkspaceInventions() {
  if (transform.dragging) return;
  const visible = state.documents.filter((document) => document.preview.visible && documentRoot(document.id));
  const groups = new Map();
  for (const document of visible) {
    const root = documentRoot(document.id);
    root.group.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(root.group);
    const oldOffset = workspaceOffsets.get(document.id) || 0;
    const center = root.group.getWorldPosition(new THREE.Vector3()).x - oldOffset;
    const bound = box.isEmpty()
      ? { minX: center - 0.2, maxX: center + 0.2 }
      : { minX: box.min.x - oldOffset, maxX: box.max.x - oldOffset };
    // Root copies are separate inventions at the same preview pose. Lay them
    // out as one stack while keeping unrelated inventions in separate lanes.
    const groupId = document.preview.layoutGroupId || document.id;
    const group = groups.get(groupId);
    if (group) {
      group.minX = Math.min(group.minX, bound.minX);
      group.maxX = Math.max(group.maxX, bound.maxX);
    } else groups.set(groupId, bound);
  }
  const groupIds = [...groups.keys()];
  const offsets = computeWorkspaceOffsets([...groups.values()], { gap: 0.7 });
  const offsetByGroup = new Map(groupIds.map((id, index) => [id, offsets[index]]));
  for (const document of state.documents) {
    const root = documentRoot(document.id);
    if (!root) continue;
    const oldOffset = workspaceOffsets.get(document.id) || 0;
    const nextOffset = document.preview.visible
      ? offsetByGroup.get(document.preview.layoutGroupId || document.id) ?? 0 : 0;
    if (Math.abs(nextOffset - oldOffset) < 1e-9) continue;
    root.group.position.x += nextOffset - oldOffset;
    root.group.updateMatrixWorld(true);
    workspaceOffsets.set(document.id, nextOffset);
    document.lastRootPose = `${root.itemID}|${document.preview.attachment}|${root.group.matrix.elements.join(",")}`;
  }
}

// Bounds of what is actually drawn. Box3.expandByObject also counts hidden objects, and a flashlight's activation
// light cue is metres long, so framing and the wearer's side-by-side placement skip both.
function expandVisibleBounds(bounds, object) {
  object.updateWorldMatrix(true, true);
  object.traverseVisible((node) => {
    if (!node.isMesh) return;
    for (let part = node; part && part !== object.parent; part = part.parent) {
      if (part.name === "activation_light_preview") return;
    }
    bounds.expandByObject(node);
  });
  return bounds;
}

function frameWorkspace() {
  updateGhostPreview();
  const bounds = new THREE.Box3();
  for (const document of state.documents) {
    if (!document.preview.visible) continue;
    const root = documentRoot(document.id);
    if (root) expandVisibleBounds(bounds, root.group);
  }
  if (ghostRig.visible) expandVisibleBounds(bounds, ghostRig);
  frameBounds(bounds);
}

// Zoom onto the ghost player (and what it wears or holds) so its pose dots are easy to grab.
function frameGhost() {
  if (!ghostRig.visible) {
    $("showGhostRig").checked = true;
    $("showGhostRig").dispatchEvent(new Event("change"));
    updateGhostPreview();
  }
  if (!ghostRig.visible) return setStatus("Add an invention to show the ghost player first.", "bad");
  ghostRig.updateMatrixWorld(true);
  const bounds = new THREE.Box3();
  for (const part of [ghostBody, wornInvention, ghostCrossbow]) if (part.visible !== false) expandVisibleBounds(bounds, part);
  if (state.avatarMeshScene) expandVisibleBounds(bounds, state.avatarMeshScene);
  frameBounds(bounds, 1.05, 0.6);
}

function frameBounds(bounds, margin = 1.15, minimumDistance = 1.5) {
  if (bounds.isEmpty()) return;
  const center = bounds.getCenter(new THREE.Vector3());
  const fovY = THREE.MathUtils.degToRad(camera.fov);
  const fovX = 2 * Math.atan(Math.tan(fovY / 2) * camera.aspect);
  const direction = camera.position.clone().sub(orbit.target);
  if (direction.lengthSq() < 1e-6) direction.set(0.6, 0.45, 0.7);
  direction.normalize();
  const right = new THREE.Vector3().crossVectors(camera.up, direction).normalize();
  if (right.lengthSq() < 1e-6) right.set(1, 0, 0);
  const up = new THREE.Vector3().crossVectors(direction, right).normalize();
  let distance = minimumDistance;
  for (const x of [bounds.min.x, bounds.max.x]) {
    for (const y of [bounds.min.y, bounds.max.y]) {
      for (const z of [bounds.min.z, bounds.max.z]) {
        const relative = new THREE.Vector3(x, y, z).sub(center);
        const towardCamera = relative.dot(direction);
        distance = Math.max(distance,
          Math.abs(relative.dot(right)) / Math.tan(fovX / 2) + towardCamera,
          Math.abs(relative.dot(up)) / Math.tan(fovY / 2) + towardCamera);
      }
    }
  }
  distance *= margin;
  orbit.target.copy(center);
  camera.position.copy(center).addScaledVector(direction, distance);
  camera.updateProjectionMatrix();
  orbit.update();
}

function updateGhostPreview() {
  const root = rootRecord();
  const referenceMode = !!$("showGorillaReference")?.checked;
  layoutWorkspaceInventions();
  syncHolderPreviews();
  syncFilmMountPreviews();
  try {
    applyAvatarArmPose();
    $("armPoseNote").textContent = state.avatarArmPose
      ? "Game-build arm skin active. Posed hands also move held inventions."
      : "Arm pose data is unavailable; the avatar remains in its exported rest pose.";
  } catch (err) {
    state.avatarArmPose = null;
    $("armPoseNote").textContent = `Arm pose preview unavailable: ${err.message}`;
  }
  const hasVisibleRoot = state.documents.some((document) => document.preview.visible && documentRoot(document.id));
  ghostRig.visible = !!(($("showGhostRig")?.checked || referenceMode) && (hasVisibleRoot || referenceMode));
  for (const line of previewLinePool) line.visible = false;
  ghostTargetMarker.visible = false;
  if (!ghostRig.visible) {
    poseRobotArmsIn(scene);
    return;
  }
  wornCopy = null;
  for (const key of [...wornCopies.keys()]) {
    const otherHand = key.endsWith(OTHER_HAND_SUFFIX);
    const id = otherHand ? key.slice(0, -OTHER_HAND_SUFFIX.length) : key;
    const document = state.documents.find((item) => item.id === id);
    if (!document?.preview.visible || !documentRoot(id) || !DOCUMENT_ATTACHMENTS[document.preview.attachment] ||
        (otherHand && !(document.preview.bothHands && OTHER_HAND[DOCUMENT_ATTACHMENTS[document.preview.attachment]]))) {
      removeWornCopy(key);
    }
  }
  const placementRoot = root || state.documents.map((document) => documentRoot(document.id)).find(Boolean);
  placementRoot?.group.updateMatrixWorld(true);
  // Keep the authored graph editable while previewing an upright wearer beside it.
  // Its eventual X position is solved from rendered bounds after the worn
  // copies are synchronized; a fixed offset overlaps large inventions.
  ghostRig.matrixAutoUpdate = true;
  if (!referenceMode || !state.referenceMoved) {
    ghostRig.position.set(0, 0, 0); // The wearer's floor does not follow edits to the item's root pose.
    ghostRig.quaternion.identity();
    ghostRig.scale.set(1, 1, 1);
  }
  if (state.playerRigs && state.avatarMesh === selectedAvatar()?.animal_id) {
    ghostBody.scale.set(1, 1, 1);
    const dynamicHandGrab = state.documents.some((document) => {
      if (!document.preview.visible || !["left_hand", "right_hand"].includes(document.preview.attachment)) return false;
      const itemID = documentRoot(document.id)?.itemID;
      return !!state.playerRigs.item_anchors?.[itemID]?.allowGrabAnywhere;
    });
    const handProfileLabel = $("handTrackingProfile")?.value === "standard" ? "standard/desktop" : "Quest/OpenXR";
    $("ghostRigNote").textContent = `${selectedAvatar().animal_id} mesh and worn/held anchors are from this game build. Each visible invention uses its own preview attachment. The ${referenceMode ? "movable textured" : "cyan"} wearer uses the ${handProfileLabel} neutral hand pose; live controller tracking can differ.${dynamicHandGrab ? " This item allows gripping at different points, so its in-game hand pose depends on where it is grabbed." : ""} Preview placement does not change the saved inventions.`;
  } else {
    const fallbackAnimal = String($("ghostAnimal")?.value || "").replace(/^animal_/, "");
    ghostBody.scale.set(...(GHOST_PROPORTIONS[fallbackAnimal] || GHOST_PROPORTIONS.generic));
  }
  for (const document of state.documents) {
    const documentItem = documentRoot(document.id);
    if (!document.preview.visible || !documentItem) continue;
    const attachment = DOCUMENT_ATTACHMENTS[document.preview.attachment];
    if (!attachment) continue;
    syncWornInvention(document, documentItem,
      playerAnchorMatrix(attachment), itemAnchorMatrix(documentItem.itemID, attachment, documentItem.scaleModifier),
      defaultHandGrabOffsetMatrix(documentItem.itemID, attachment, documentItem.scaleModifier));
    const otherHand = document.preview.bothHands ? OTHER_HAND[attachment] : null;
    if (otherHand) {
      syncWornInvention(document, documentItem,
        playerAnchorMatrix(otherHand), itemAnchorMatrix(documentItem.itemID, otherHand, documentItem.scaleModifier),
        defaultHandGrabOffsetMatrix(documentItem.itemID, otherHand, documentItem.scaleModifier), { otherHand: true });
    }
  }
  syncGhostCrossbow();
  poseRobotArmsIn(scene);
  ghostRig.updateMatrixWorld(true);
  const sourceBounds = new THREE.Box3();
  for (const document of state.documents) {
    if (document.preview.visible) {
      const source = documentRoot(document.id);
      if (source) expandVisibleBounds(sourceBounds, source.group);
    }
  }
  if (!referenceMode || !state.referenceMoved) {
    // Re-solve the side-by-side placement only when the editable inventions or what the wearer carries change.
    // Posing never slides the wearer: a dragged hand would otherwise run away from the pointer.
    const placementKey = [sourceBounds.isEmpty() ? "empty" : [...sourceBounds.min.toArray(), ...sourceBounds.max.toArray()]
      .map((value) => value.toFixed(3)).join(","), state.avatarMesh, referenceMode,
    ...state.documents.map((document) => `${document.id}:${document.preview.visible}:${document.preview.attachment}:` +
      `${document.preview.position}:${document.preview.rotation}`),
    `${state.ghostCrossbow?.itemID}:${state.ghostCrossbow?.slot}:${state.ghostCrossbow?.scaleModifier}`].join("|");
    if (placementKey === ghostPlacement.key) {
      ghostRig.position.x = ghostPlacement.x;
    } else {
      const wearerBounds = expandVisibleBounds(new THREE.Box3(), ghostRig);
      ghostRig.position.x = !sourceBounds.isEmpty() && !wearerBounds.isEmpty()
        ? Math.max(0.7, sourceBounds.max.x + 0.7 - wearerBounds.min.x) : 1.45;
      Object.assign(ghostPlacement, { key: placementKey, x: ghostRig.position.x });
    }
    ghostRig.updateMatrixWorld(true);
  }
  if (referenceMode) syncReferenceFields();
  if (!$("showSightLine")?.checked) return;
  const eye = eyePosition();
  const target = sightTarget();
  ghostTargetMarker.position.copy(target);
  ghostTargetMarker.visible = true;
  let lineIndex = 0;
  setPreviewLine(lineIndex++, eye, target, ghostLineMaterial);
  for (const record of state.objects.filter((r) => /^item_mining_laser(?:_|$)/.test(r.itemID)).slice(0, 256)) {
    const worn = wornRecordGroup(record.uid);
    if (!worn) continue;
    worn.updateMatrixWorld(true);
    const origin = worn.getWorldPosition(new THREE.Vector3());
    const direction = new THREE.Vector3(0, 0, 1).applyQuaternion(worn.getWorldQuaternion(new THREE.Quaternion()));
    setPreviewLine(lineIndex++, origin, origin.clone().addScaledVector(direction, 4), laserLineMaterial);
  }
}

function setStatus(text, kind = "") {
  statusEl.textContent = text;
  statusEl.className = "status" + (kind ? " " + kind : "");
}

function itemTemplate(itemID) {
  return RULES.newItem(itemID);
}

function newEditorItem(itemID) {
  const item = RULES.newItem(itemID);
  item.state = stateCapability(itemID)?.defaultState ?? item.state;
  return item;
}

function deepClone(v) {
  return JSON.parse(JSON.stringify(v));
}

function round(n, digits = 6) {
  const m = 10 ** digits;
  return Math.round(Number(n) * m) / m;
}

function vecArray(v) {
  return [round(v.x), round(v.y), round(v.z)];
}

function quatArray(q) {
  return [round(q.x), round(q.y), round(q.z), round(q.w)];
}

// Unity prefab meshes are exported in item-local Y-up, Z-forward coordinates, the same axes used by this Three scene.
// The former +Z-up rotation tipped every mesh while rotating joint positions separately from the actual prefab view.
const GAME_TO_EDITOR_BASIS = new THREE.Matrix4();
const EDITOR_TO_GAME_BASIS = new THREE.Matrix4().copy(GAME_TO_EDITOR_BASIS).invert();

function gameVecToEditor(v) {
  return v.clone().applyMatrix4(GAME_TO_EDITOR_BASIS);
}

function editorVecToGame(v) {
  return v.clone().applyMatrix4(EDITOR_TO_GAME_BASIS);
}

function quatThroughBasis(q, toBasis, fromBasis) {
  const rot = new THREE.Matrix4().makeRotationFromQuaternion(q);
  const converted = new THREE.Matrix4().multiplyMatrices(toBasis, rot).multiply(fromBasis);
  return new THREE.Quaternion().setFromRotationMatrix(converted).normalize();
}

function gameQuatToEditor(q) {
  return quatThroughBasis(q, GAME_TO_EDITOR_BASIS, EDITOR_TO_GAME_BASIS);
}

function editorQuatToGame(q) {
  return quatThroughBasis(q, EDITOR_TO_GAME_BASIS, GAME_TO_EDITOR_BASIS);
}

// array forms used with goop_rules (game frame arrays <-> THREE editor objects)
function gameArrToEditorVec(arr) {
  return gameVecToEditor(new THREE.Vector3(arr[0], arr[1], arr[2]));
}
function gameArrToEditorQuat(arr) {
  return gameQuatToEditor(new THREE.Quaternion(arr[0], arr[1], arr[2], arr[3]).normalize());
}
function editorVecToGameArr(v) {
  const g = editorVecToGame(v);
  return [g.x, g.y, g.z];
}
function editorQuatToGameArr(q) {
  const g = editorQuatToGame(q);
  return [g.x, g.y, g.z, g.w];
}

function vecFromArray(arr, fallback = [0, 0, 0]) {
  const src = Array.isArray(arr) ? arr : fallback;
  return new THREE.Vector3(
    finiteNumber(src[0], fallback[0] || 0),
    finiteNumber(src[1], fallback[1] || 0),
    finiteNumber(src[2], fallback[2] || 0)
  );
}

function quatFromArray(arr, fallback = [0, 0, 0, 1]) {
  const src = Array.isArray(arr) ? arr : fallback;
  const q = new THREE.Quaternion(
    finiteNumber(src[0], fallback[0] || 0),
    finiteNumber(src[1], fallback[1] || 0),
    finiteNumber(src[2], fallback[2] || 0),
    finiteNumber(src[3], fallback[3] == null ? 1 : fallback[3])
  );
  return q.lengthSq() > 0.000001 ? q.normalize() : new THREE.Quaternion();
}

function finiteNumber(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function clamp(n, lo, hi) {
  return Math.min(hi, Math.max(lo, Number.isFinite(Number(n)) ? Number(n) : 0));
}

// Per-item scale curve (prefab-specific _scaleRange; 0.2..2.5 default, overrides in goop_rules).
function scaleModifierToScalar(mod, itemID) {
  return RULES.physicalScale(mod, itemID);
}

function scalarToScaleModifier(scalar, itemID) {
  return RULES.scaleModifierForPhysicalScale(scalar, itemID);
}

// Exported GLBs keep the game's base texture, authored material color, and vertex colors.
// Apply item-wide HSV offsets after Three combines all three inputs.
// UberShader adds both offsets without clamping saturation before HSV-to-RGB;
// high saturation may clip channels after lighting (a gold whistle can turn red).
// Keep the uniforms live while the inspector sliders are dragged.
function configureAppearanceShader(mat) {
  if (mat.userData.goopAppearance) return mat.userData.goopAppearance;
  const hue = { value: 0 };
  const saturation = { value: 0 };
  mat.userData.goopAppearance = { hue, saturation };
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.goopHue = hue;
    shader.uniforms.goopSaturation = saturation;
    shader.fragmentShader = shader.fragmentShader.replace("#include <common>", `#include <common>
uniform float goopHue;
uniform float goopSaturation;
vec3 goopRgbToHsv(vec3 c) {
  vec4 K = vec4(0.0, -1.0 / 3.0, 2.0 / 3.0, -1.0);
  vec4 p = mix(vec4(c.bg, K.wz), vec4(c.gb, K.xy), step(c.b, c.g));
  vec4 q = mix(vec4(p.xyw, c.r), vec4(c.r, p.yzx), step(p.x, c.r));
  float d = q.x - min(q.w, q.y);
  return vec3(abs(q.z + (q.w - q.y) / (6.0 * d + 1e-10)), d / (q.x + 1e-10), q.x);
}
vec3 goopHsvToRgb(vec3 c) {
  vec3 p = abs(fract(c.xxx + vec3(0.0, 2.0 / 3.0, 1.0 / 3.0)) * 6.0 - 3.0);
  return c.z * mix(vec3(1.0), clamp(p - 1.0, 0.0, 1.0), c.y);
}`);
    shader.fragmentShader = shader.fragmentShader.replace("#include <color_fragment>", `#include <color_fragment>
  if (goopHue != 0.0 || goopSaturation != 0.0) {
    vec3 goopHsv = goopRgbToHsv(diffuseColor.rgb);
    goopHsv.x = fract(goopHsv.x + goopHue);
    goopHsv.y += goopSaturation;
    diffuseColor.rgb = goopHsvToRgb(goopHsv);
  }`);
  };
  mat.customProgramCacheKey = () => "goop-appearance-hsv-offset-v3";
  mat.needsUpdate = true;
  return mat.userData.goopAppearance;
}

function cloneWithMaterials(source) {
  const obj = source.clone(true);
  obj.traverse((child) => {
    if (child.isMesh) {
      child.castShadow = false;
      child.receiveShadow = false;
      if (Array.isArray(child.material)) {
        child.material = child.material.map((m) => m.clone());
      } else if (child.material) {
        child.material = child.material.clone();
      }
    }
  });
  return obj;
}

function normalizeModel(root) {
  // UnityPy's OBJ exporter mirrors mesh X, and the item GLB exporter now
  // applies prefab TRS before that mirror. Undo the mesh-only mirror here so
  // models share the native game frame used by JSON stuck poses and avatars.
  root.applyMatrix4(avatarMeshToGameBasis);
  root.updateMatrixWorld(true);
}

async function loadModel(entry) {
  if (!entry || !entry.url) return null;
  if (state.modelCache.has(entry.item_id)) return cloneWithMaterials(state.modelCache.get(entry.item_id));
  const gltf = await loader.loadAsync(entry.url);
  const root = gltf.scene || gltf.scenes[0];
  normalizeModel(root);
  const armSkinUrl = entry.arm_skin_url || entry.arm_skin?.url;
  if (armSkinUrl) {
    const response = await fetch(armSkinUrl);
    if (!response.ok) throw new Error(`robot arm pose HTTP ${response.status}`);
    const sidecar = await response.json();
    if (sidecar.schema !== "ac.goop-editor-arm-skin.v1" || sidecar.itemID !== entry.item_id ||
        sidecar.glbSha256 !== entry.sha256) throw new Error(`robot arm pose does not match ${entry.item_id}`);
    state.robotArmSkins.set(entry.item_id, sidecar);
  }
  state.modelCache.set(entry.item_id, root);
  return cloneWithMaterials(root);
}

function entryForItem(itemID) {
  return state.entries.find((entry) => entry.item_id === itemID) || null;
}

function makeObjectRecord(itemID, role = "child") {
  const group = new THREE.Group();
  group.name = itemID;
  const uid = workshopLive?.active && !historyRestoring ? randomLiveObjectUid() : state.nextUid++;
  group.userData.uid = uid;
  return {
    uid,
    documentId: state.activeDocumentId,
    role,
    itemID,
    group,
    model: null,
    modelRequestId: 0,
    parentUid: null,
    children: [],
    scaleModifier: 0,
    colorHue: 0,
    colorSaturation: 0,
    jellyStrength: 0,
    state: stateCapability(itemID)?.defaultState ?? 0,
    ammo: RULES.loadedAmmoFor(itemID),
    subParentID: 0,        // which NetParent of the PARENT this record is stuck to (0 = base)
    contents: [],          // native `children`: items INSIDE this item (backpack / quiver / crossbow slot), full item JSON
    frozenEdge: false,     // edge kept verbatim (sub-parent frame not probed)
    sourceItem: null,       // original non-hierarchy fields (jsonData, isBlueprint, grab pose, etc.)
    sourceStuck: null,
    transformDirty: false,
    hierarchyDirty: false
  };
}

async function attachModel(record, { reportError = true } = {}) {
  const requestedItemId = record.itemID;
  const requestId = ++record.modelRequestId;
  const entry = entryForItem(requestedItemId);
  let model;
  let loadError = null;
  if (!entry || !entry.exists || !entry.url) {
    model = makeFallbackModel(requestedItemId);
  } else {
    let timeout;
    try {
      model = await Promise.race([
        loadModel(entry),
        new Promise((_, reject) => { timeout = setTimeout(() => reject(new Error("model load timed out")), 20000); })
      ]);
    } catch (err) {
      model = makeFallbackModel(requestedItemId);
      loadError = err;
    } finally {
      clearTimeout(timeout);
    }
  }
  // Item-ID changes and scene clears can happen while a GLB is loading. An old
  // response must never add its mesh to the new item or resurrect a removed one.
  if (record.modelRequestId !== requestId || record.itemID !== requestedItemId || !state.objects.includes(record)) return false;
  if (record.model) record.group.remove(record.model);
  if (record.previewLight) {
    record.group.remove(record.previewLight);
    record.previewLight = null;
  }
  record.model = model;
  if (MOTION.movingPartKind(requestedItemId)) model.userData.movingPartModel = true;
  record.group.add(model);
  applyObjectVisualState(record);
  poseMovingGroupNow(record.group);
  if (record === state.selected) renderColorPicker();
  if (loadError) {
    if (reportError) setStatus(`Model fallback for ${requestedItemId}: ${loadError}`, "bad");
    else console.warn(`Model fallback for ${requestedItemId}: ${loadError}`);
  }
  return true;
}

function makeFallbackModel(itemID) {
  const geo = new THREE.BoxGeometry(0.35, 0.35, 0.35);
  const mat = new THREE.MeshStandardMaterial({ color: 0xff6d6d, roughness: 0.65 });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.name = itemID + "_fallback";
  const group = new THREE.Group();
  group.add(mesh);
  group.userData.colorFallback = true;   // a stand-in box: the item's real colors are unknown
  return group;
}

const previewBeamGeometry = new THREE.ConeGeometry(1, 1, 12, 1, true);
const previewGlowGeometry = new THREE.SphereGeometry(0.08, 10, 8);
const previewBeamMaterial = new THREE.MeshBasicMaterial({
  color: 0xfff0a0, transparent: true, opacity: 0.13,
  side: THREE.DoubleSide, depthWrite: false
});

function updateLightPreview(record, scalar) {
  const descriptor = activationCapability(record.itemID)?.previewLight;
  if (!descriptor || !Array.isArray(descriptor.position) || !Array.isArray(descriptor.direction)) return;
  if (!record.previewLight) {
    const preview = new THREE.Group();
    preview.name = "activation_light_preview";
    preview.userData.previewOnly = true;
    if (descriptor.kind === "spot") {
      const beam = new THREE.Mesh(previewBeamGeometry, previewBeamMaterial);
      beam.name = "flashlight_beam_cue";
      preview.add(beam);
    } else if (descriptor.kind === "point") {
      const glow = new THREE.Mesh(previewGlowGeometry, previewBeamMaterial);
      glow.name = "flashlight_glow_cue";
      preview.add(glow);
    }
    record.previewLight = preview;
    record.group.add(preview);
  }
  const preview = record.previewLight;
  preview.visible = !!(record.state & 1);
  const origin = new THREE.Vector3(...descriptor.position.map((v) => Number(v) || 0));
  preview.position.copy(record.model.position).addScaledVector(origin, scalar);
  const direction = new THREE.Vector3(...descriptor.direction.map((v) => Number(v) || 0));
  if (direction.lengthSq() > 1e-9) {
    preview.quaternion.setFromUnitVectors(new THREE.Vector3(0, -1, 0), direction.normalize());
  }
  const length = Math.max(0.1, Math.min(1.5, Number(descriptor.range) || 1.5)) * scalar;
  const angle = Math.max(5, Math.min(90, Number(descriptor.spotAngle) || 30));
  const radius = Math.max(0.02, Math.tan(THREE.MathUtils.degToRad(angle / 2)) * length);
  const beam = preview.children[0];
  if (beam && descriptor.kind === "spot") {
    beam.scale.set(radius, length, radius);
    beam.position.set(0, -length / 2, 0);
  } else if (beam) {
    beam.scale.setScalar(Math.max(0.1, scalar));
  }
}

function applyObjectVisualState(record) {
  if (!record.model) return;
  const scalar = scaleModifierToScalar(record.scaleModifier, record.itemID);
  // Exported GLBs use the prefab component origin, while stuck poses from
  // native Deserialize use GrabbableObject._root. Usually those coincide;
  // grimstaff's Root is 0.136 m below its component in the asset. Rebase the
  // geometry when the root is reparented so the mesh and its attachment edges
  // both land where the live game renders them.
  record.model.position.copy(gameArrToEditorVec(RULES.modelOriginCorrection(record.itemID, record.scaleModifier)));
  // Keep the UnityPy mesh X-unmirror when the physical-scale slider changes.
  // setScalar() would erase the negative X set by normalizeModel().
  record.model.scale.set(-scalar, scalar, scalar);
  updateLightPreview(record, scalar);
  record.model.traverse((child) => {
    // Current-build GLBs can contain both native visual branches. A glTF node
    // tagged by the exporter belongs to exactly one serialized activation
    // phase; the item JSON's state bit 0 selects the branch.
    if (child.userData?.activationState === 0 || child.userData?.activationState === 1) {
      child.visible = child.userData.activationState === Number(binaryItemIsActive(record));
    }
    if (child.isMesh && child.material) {
      const mats = Array.isArray(child.material) ? child.material : [child.material];
      for (const mat of mats) {
        const appearance = configureAppearanceShader(mat);
        appearance.hue.value = clamp(record.colorHue, 0, 255) / 255;
        const sat = clamp(record.colorSaturation, -128, 127);
        // GrabbableObject.HandleColorSaturationChanged passes 2 * signedByte / 127.
        appearance.saturation.value = 2 * sat / 127;
      }
    }
  });
}

const DOCUMENT_ATTACHMENTS = {
  free: null, back: "back", left_hand: "handLeft", right_hand: "handRight",
  left_hip: "hipLeft", right_hip: "hipRight"
};
const MODEL_ATTACHMENTS = {
  free: "free", back: "back", left_hand: "handLeft", right_hand: "handRight",
  left_hip: "hipLeft", right_hip: "hipRight", ghost_crossbow: "ghostCrossbow", crossbow: "crossbow"
};
const UI_ATTACHMENTS = Object.fromEntries(Object.entries(MODEL_ATTACHMENTS).map(([ui, model]) => [model, ui]));

function activeDocument() {
  return state.documents.find((document) => document.id === state.activeDocumentId) || null;
}

function activationCapability(itemID) {
  const capability = entryForItem(itemID)?.activation;
  return capability?.kind === "binary" && currentBuildStateCapability(capability) ? capability : null;
}

function binaryItemIsActive(record) {
  const capability = activationCapability(record?.itemID);
  if (!capability) return false;
  if (capability.activePredicate === "positive") return record.state > 0;
  if (capability.activePredicate === "nonzero") return record.state !== 0;
  return (record.state & 1) !== 0;
}

function stateCapability(itemID) {
  const capability = entryForItem(itemID)?.stateCapability;
  return currentBuildStateCapability(capability) ? capability : null;
}

function currentBuildStateCapability(capability) {
  return !!capability && String(capability.steamBuildId) === state.scaleManifest?.buildId &&
    capability.gameAssemblySha256 === state.scaleManifest?.gameAssemblySha256;
}

function nativeItemState(value) {
  const number = value == null ? 0 : Number(value);
  if (!Number.isInteger(number) || number < -2147483648 || number > 2147483647) {
    throw new Error("state must be a signed 32-bit integer; the game cannot store fractions, Infinity, -Infinity, or NaN here");
  }
  return number;
}

function documentForRecord(record) {
  return state.documents.find((document) => document.id === record?.documentId) || null;
}

function documentRecords(id = state.activeDocumentId) {
  return state.objects.filter((record) => record.documentId === id);
}

function documentRoot(id = state.activeDocumentId) {
  return state.objects.find((record) => record.documentId === id && record.role === "root") || null;
}

function rootRecord() { return documentRoot(); }

function randomLiveObjectUid() {
  let uid;
  do {
    const bytes = crypto.getRandomValues(new Uint32Array(2));
    uid = (bytes[0] & 0xfffff) * 0x100000000 + bytes[1];
  } while (!uid || recordByUid(uid));
  state.nextUid = Math.max(state.nextUid, uid + 1);
  return uid;
}

function nextDocumentId() {
  if (workshopLive?.active) {
    state.nextDocumentId++;
    return `doc-${crypto.randomUUID()}`;
  }
  return `doc-${state.nextDocumentId++}`;
}

function documentMetadataSignature(document) {
  return JSON.stringify({ name: document.name, filename: document.filename, preview: document.preview });
}

function createDocument({ id, name, filename, preview, dirty = false } = {}) {
  const document = {
    id: id || nextDocumentId(),
    name: name || "New invention",
    filename: filename || "goop_editor_export.json",
    preview: {
      attachment: preview?.attachment || "free",
      position: (preview?.position || [0, 0, 0]).slice(),
      rotation: (preview?.rotation || [0, 0, 0, 1]).slice(),
      visible: preview?.visible !== false,
      ...(preview?.layoutGroupId ? { layoutGroupId: preview.layoutGroupId } : {}),
      ...(preview?.attachment === "crossbow" && preview.holder ? { holder: deepClone(preview.holder) } : {})
    },
    dirty: !!dirty,
    savedSignature: null,
    savedMetaSignature: null,
    lastRootPose: null
  };
  if (state.documents.some((item) => item.id === document.id)) throw new Error(`Duplicate document: ${document.id}`);
  const ordinal = /^doc-(\d+)$/.exec(document.id);
  if (ordinal) state.nextDocumentId = Math.max(state.nextDocumentId, Number(ordinal[1]) + 1);
  state.documents.push(document);
  state.activeDocumentId = document.id;
  return document;
}

function setActiveDocument(id) {
  if (!state.documents.some((document) => document.id === id)) return;
  const old = activeDocument();
  if (old && $("filenameInput")) old.filename = $("filenameInput").value || old.filename;
  state.activeDocumentId = id;
  const root = documentRoot(id);
  state.parentTargetUid = root?.uid ?? null;
  state.selectedUids = root ? new Set([root.uid]) : new Set();
  state.selected = root;
  attachTransformToSelection();
  syncParentTargetUi();
  renderHierarchyTree();
  renderSelectionList();
  syncInspectorFromSelection();
  refreshPreview();
}

function documentAnchorMatrix(document) {
  const key = DOCUMENT_ATTACHMENTS[document?.preview?.attachment];
  return key ? playerAnchorMatrix(key, false) : new THREE.Matrix4();
}

function documentItemAnchorMatrix(document, root) {
  const key = DOCUMENT_ATTACHMENTS[document?.preview?.attachment];
  return key ? itemAnchorMatrix(root.itemID, key, root.scaleModifier) : new THREE.Matrix4();
}

function documentDefaultHandOffsetMatrix(document, root) {
  const key = DOCUMENT_ATTACHMENTS[document?.preview?.attachment];
  return key ? defaultHandGrabOffsetMatrix(root.itemID, key, root.scaleModifier) : new THREE.Matrix4();
}

function applyDocumentPreviewPlacement(document) {
  const root = documentRoot(document?.id);
  if (!root) return;
  const offset = new THREE.Matrix4().compose(
    new THREE.Vector3(...document.preview.position),
    new THREE.Quaternion(...document.preview.rotation), new THREE.Vector3(1, 1, 1));
  const pose = documentAnchorMatrix(document).multiply(offset)
    .multiply(documentDefaultHandOffsetMatrix(document, root))
    .multiply(documentItemAnchorMatrix(document, root).invert());
  const scale = new THREE.Vector3();
  pose.decompose(root.group.position, root.group.quaternion, scale);
  root.group.position.x += workspaceOffsets.get(document.id) || 0;
  root.group.visible = document.preview.visible;
  root.group.updateMatrixWorld(true);
  document.lastRootPose = `${root.itemID}|${document.preview.attachment}|${root.group.matrix.elements.join(",")}`;
}

function syncDocumentPreviewFromRoot(document) {
  const root = documentRoot(document?.id);
  if (!root) return;
  root.group.updateMatrix();
  const signature = `${root.itemID}|${document.preview.attachment}|${root.group.matrix.elements.join(",")}`;
  if (signature === document.lastRootPose) return;
  document.lastRootPose = signature;
  const unshiftedRoot = root.group.matrix.clone();
  unshiftedRoot.elements[12] -= workspaceOffsets.get(document.id) || 0;
  const offset = documentAnchorMatrix(document).invert().multiply(unshiftedRoot)
    .multiply(documentItemAnchorMatrix(document, root))
    .multiply(documentDefaultHandOffsetMatrix(document, root).invert());
  const pos = new THREE.Vector3();
  const quat = new THREE.Quaternion();
  const scale = new THREE.Vector3();
  offset.decompose(pos, quat, scale);
  const before = JSON.stringify(document.preview);
  document.preview.position = pos.toArray();
  document.preview.rotation = quat.toArray();
  document.preview.visible = root.group.visible;
  if (JSON.stringify(document.preview) !== before) document.dirty = true;
}

function renderDocumentList() {
  const list = $("documentList");
  if (!list) return;
  const restoreFocus = list.contains(document.activeElement);
  list.replaceChildren();
  let activeButton = null;
  for (const doc of state.documents) {
    const tab = document.createElement("button");
    tab.type = "button";
    tab.className = "documentTab" + (doc.id === state.activeDocumentId ? " active" : "");
    tab.setAttribute("aria-pressed", String(doc.id === state.activeDocumentId));
    const title = document.createElement("span"); title.className = "documentTabTitle"; title.textContent = doc.name;
    const meta = document.createElement("span"); meta.className = "documentTabMeta";
    const selectedCount = documentRecords(doc.id).filter((record) => state.selectedUids.has(record.uid)).length;
    meta.textContent = `${documentRoot(doc.id)?.itemID || "empty"} · ${documentRecords(doc.id).length} parts${doc.worth ? ` · ${formatMoney(doc.worth.total)}` : ""} · ${doc.preview.attachment.replace("_", " ")}${selectedCount ? ` · ${selectedCount} selected` : ""}`;
    tab.append(title, meta);
    if (doc.dirty) {
      const mark = document.createElement("span"); mark.className = "documentTabDirty"; mark.textContent = "*";
      mark.title = "Unsaved changes"; tab.append(mark);
    }
    tab.addEventListener("click", () => setActiveDocument(doc.id));
    if (doc.id === state.activeDocumentId) activeButton = tab;
    list.append(tab);
  }
  if (restoreFocus) activeButton?.focus({ preventScroll: true });
  renderMergeTargets();
  const current = activeDocument();
  const name = $("activeDocumentName");
  if (name && document.activeElement !== name) name.value = current?.name || "";
  const attach = $("activeDocumentAttach");
  if (attach) {
    renderCrossbowAttachOptions(current);
    attach.value = attachmentSelectValue(current);
  }
  const visible = $("activeDocumentVisible");
  if (visible) visible.checked = current?.preview?.visible !== false;
  const bothHands = $("activeDocumentBothHands");
  if (bothHands) {
    const handHeld = ["left_hand", "right_hand"].includes(current?.preview?.attachment);
    bothHands.checked = !!current?.preview?.bothHands;
    bothHands.disabled = !handHeld;
    $("activeDocumentBothHandsRow")?.classList.toggle("disabled", !handHeld);
    $("activeDocumentBothHandsRow").title = handHeld ? "" : "Set the preview attachment to Left hand or Right hand first.";
  }
  for (const [axis, index] of [["X", 0], ["Y", 1], ["Z", 2]]) {
    const input = $("activeDocumentOffset" + axis);
    if (input && document.activeElement !== input) input.value = Number((current?.preview?.position?.[index] || 0).toFixed(3));
  }
  const yaw = $("activeDocumentYaw");
  if (yaw && document.activeElement !== yaw) yaw.value = current
    ? formatAngle(new THREE.Euler().setFromQuaternion(new THREE.Quaternion(...current.preview.rotation), "YXZ").y, state.angleUnit) : 0;
  const filename = $("filenameInput");
  if (filename && current && document.activeElement !== filename) filename.value = current.filename;
  for (const id of ["activeDocumentLabel", "activeDocumentFileLabel"]) {
    const element = $(id);
    if (element) element.textContent = id === "activeDocumentFileLabel"
      ? `Save, download, and send: ${current?.name || "No active invention"}`
      : `Active invention: ${current?.name || "No active invention"}`;
  }
  if ($("deleteDocumentBtn")) $("deleteDocumentBtn").disabled = !current;
}

function recordByUid(uid) {
  return state.objects.find((record) => record.uid === uid) || null;
}

function selectedRecords() {
  const out = [];
  for (const uid of state.selectedUids) {
    const record = recordByUid(uid);
    if (record) out.push(record);
  }
  return out;
}

function hasSelectedAncestor(record, selectedSet) {
  let parent = parentOf(record);
  while (parent) {
    if (selectedSet.has(parent.uid)) return true;
    parent = parentOf(parent);
  }
  return false;
}

function selectedTransformRoots(records = selectedRecords()) {
  if (records.length <= 1) return records;
  const selectedSet = new Set(records.filter((record) => record.role !== "root").map((record) => record.uid));
  return records.filter((record) => record.role !== "root" && !hasSelectedAncestor(record, selectedSet));
}

function transformableSelectionRecords() {
  const records = selectedRecords();
  if (records.length <= 1) return records;
  // Native Deserialize preserves each stuck child's own world scale on attach. A graph resize
  // changes every selected modifier and world offset, including descendants and the root.
  // Moving/rotating a subtree instead acts on its top node.
  if (state.mode === "scale") return records;
  // Children stay: every selected part moves by itself, parents before their children.
  if (childrenStayActive()) return [...records].sort((a, b) => recordDepth(a) - recordDepth(b));
  // A selected root carries its descendants; other inventions remain independent.
  const selectedSet = new Set(records.map((record) => record.uid));
  return records.filter((record) => !hasSelectedAncestor(record, selectedSet));
}

function parentOf(record) {
  return record && record.parentUid != null ? recordByUid(record.parentUid) : null;
}

function recordDepth(record) {
  let depth = 0;
  for (let parent = parentOf(record); parent; parent = parentOf(parent)) depth++;
  return depth;
}

// Children stay (owner 2026-10-29: "move objects that are parents while their descendants do not move ... like disabling
// inheritance on descendants"): during a Move or Rotate, each unselected part stuck directly to a moving part is put back
// at its starting world pose, so it and everything under it hold still. A verbatim (unprobed) edge cannot be re-encoded
// from a new pose, so such a part still moves with its parent; `followed` counts them.
function childrenStayActive() { return state.childrenStay && (state.mode === "translate" || state.mode === "rotate"); }

function heldChildPoses(moving) {
  const movingSet = new Set(moving.map((record) => record.uid));
  const held = [];
  let followed = 0;
  for (const record of moving) {
    for (const uid of record.children) {
      const child = recordByUid(uid);
      if (!child || movingSet.has(child.uid)) continue;
      if (child.frozenEdge) { followed++; continue; }
      child.group.updateWorldMatrix(true, false);
      held.push({ record: child, parent: record, hold: true, depth: recordDepth(child),
        worldPos: child.group.getWorldPosition(new THREE.Vector3()), worldQuat: child.group.getWorldQuaternion(new THREE.Quaternion()) });
    }
  }
  return { held, followed };
}

function parentTargetRecord() {
  const target = recordByUid(state.parentTargetUid);
  return target?.documentId === state.activeDocumentId ? target : rootRecord();
}

function displayName(record) {
  if (!record) return "None";
  return `${record.itemID} #${record.uid}`;
}

function markTransformDirty(record) {
  if (!record) return;
  if (record.frozenEdge) return;   // a verbatim edge is never re-encoded from the display pose
  record.transformDirty = true;
  // sourceStuck also carries posePos/poseRot. A moved child needs those values to solve a new joint on save.
}

// The parent's physical scale is baked into every child's `pos` (metres / itemScale), so a parent scale change must
// re-encode its children from their displayed poses or the file would drift from what the editor shows.
function markChildEdgesDirty(record) {
  for (const uid of record.children) {
    const child = recordByUid(uid);
    if (child) markTransformDirty(child);
  }
}

function replaceItemRecord(record, nextId) {
  if (record.frozenEdge) throw new Error("This item's own stuck pose is unprobed; choose an editable item instead.");
  const childRecords = record.children.map((uid) => recordByUid(uid)).filter(Boolean);
  // Plan every edge and check container contents before changing any part of the build.
  const plan = planItemReplacement(nextId, childRecords, record.contents);
  const wasGun = RULES.isGun(record.itemID);
  record.itemID = nextId;
  record.group.name = nextId;
  // A different prefab has a different state encoding. Do not carry the old
  // item's bit pattern into it; start from this exact prefab's audited default.
  record.state = stateCapability(nextId)?.defaultState ?? 0;
  record.sourceItem = null;
  record.sourceStuck = null;
  record.frozenEdge = false;
  record.transformDirty = true;
  // Keep the same group and its transform. Descendants stay in place in the
  // workspace; their direct edges are solved against the new prefab on save.
  childRecords.forEach((child, index) => {
    child.subParentID = plan.frames[index];
    placeChildGroup(child, true);
    markTransformDirty(child);
  });
  const defaultedGunAmmo = !wasGun && RULES.isGun(nextId) && !(Number(record.ammo) > 0);
  if (defaultedGunAmmo) record.ammo = RULES.loadedAmmoFor(nextId);
  record.ammo = RULES.clampGunAmmo(nextId, record.ammo);
  void attachModel(record).then((loaded) => {
    if (loaded) refreshPreview();
  });
  return { ...plan, defaultedGunAmmo };
}

function replaceRootItem(nextId) {
  const root = rootRecord();
  if (!root) return false;
  if (root.itemID === nextId) {
    setStatus(`${nextId} is already the root. The build is unchanged.`);
    return false;
  }
  let plan;
  try {
    plan = replaceItemRecord(root, nextId);
  } catch (err) {
    setStatus(`Root unchanged: ${err.message || err}`, "bad");
    return false;
  }
  selectRecord(root);
  setStatus(plan.rehomed
    ? `${nextId} is now root; build kept. ${plan.rehomed} child edge(s) moved to base.`
    : `${nextId} is now root; build and child poses kept.`, "good");
  return true;
}

function setParentTarget(record) {
  const root = rootRecord();
  if (record && record.documentId !== state.activeDocumentId) throw new Error("Add Parent must belong to the active invention.");
  state.parentTargetUid = record ? record.uid : (root ? root.uid : null);
  syncParentTargetUi();
  renderHierarchyTree();
  // The add-parent choice is editor state, not an undo step, but an undo of the
  // next document edit should restore the choice the user had made beforehand.
  observeEditorHistory();
}

function syncParentTargetUi() {
  const target = parentTargetRecord();
  const el = $("parentTargetName");
  if (el) el.textContent = target ? displayName(target) : "None";
  const picker = $("parentTargetSelect");
  if (!picker) return;
  const records = documentRecords();
  const signature = records.map((record) => `${record.uid}:${record.parentUid}:${record.itemID}`).join(",");
  if (picker.dataset.records !== signature) {
    picker.textContent = "";
    for (const record of records) {
      const option = document.createElement("option");
      option.value = String(record.uid);
      option.textContent = `${"· ".repeat(recordTreePath(record)?.length || 0)}${displayName(record)}`;
      picker.appendChild(option);
    }
    picker.dataset.records = signature;
  }
  picker.disabled = !records.length;
  picker.value = target ? String(target.uid) : "";
}

function linkToParent(record, parent, preserveWorld = false) {
  if (!record) return;
  if (parent && record.documentId !== parent.documentId) {
    throw new Error("An invention part cannot be stuck to a different invention document.");
  }
  const oldParent = parentOf(record);
  if (oldParent) oldParent.children = oldParent.children.filter((uid) => uid !== record.uid);
  record.parentUid = parent ? parent.uid : null;
  if (parent && !parent.children.includes(record.uid)) parent.children.push(record.uid);
  const frame = parent ? childContainer(record) : null;
  if (preserveWorld) {
    // A target @1-@3 mount may have just been created by childContainer. Pose
    // it before converting coordinates; its identity rest matrix is not the
    // frame that will be drawn on the next preview update.
    if (parent && record.subParentID > 0 && isRobotArmItem(parent.itemID))
      poseRobotArm(parent.group, null, parent.itemID, parent.scaleModifier);
    if (parent) poseMovingGroupNow(parent.group);   // a joystick's stick mount is drawn tilted too
    // Object3D.attach solves the complete old-world-to-new-parent matrix. A
    // robot arm joint is a matrix-driven frame, so solving position/quaternion
    // separately can drift when switching between the two arm variants.
    (frame || scene).attach(record.group);
    record.hierarchyDirty = true;
    markTransformDirty(record);
  } else (frame || scene).add(record.group);
}

async function addObject(itemID, role) {
  if (RULES.RECORD_ONLY_ITEM_IDS.has(itemID)) {
    setStatus(`${itemID} has no prefab, so it can only go inside a backpack or quiver: select the bag, then Put inside.`, "bad");
    return;
  }
  if (role === "root" && rootRecord()) {
    replaceRootItem(itemID);
    return;
  }
  try {
    if (role === "root" || !rootRecord()) planItemReplacement(itemID);
  } catch (err) {
    setStatus(`Root not added: ${err.message || err}`, "bad");
    return;
  }
  beginEditorHistoryGroup();
  try {
  const record = makeObjectRecord(itemID, role);
  if (role === "root" || !rootRecord()) {
    if (activeDocument()) clearScene();
    const document = createDocument({ name: itemID, filename: `${itemID}.json`, dirty: true });
    record.documentId = document.id;
    record.role = "root";
    record.group.position.set(0, 0, 0);
    record.group.quaternion.identity();
    scene.add(record.group);
    state.objects.push(record);
    setParentTarget(record);
  } else {
    const parent = parentTargetRecord() || rootRecord();
    record.role = "child";
    record.documentId = parent.documentId;
    state.objects.push(record);
    linkToParent(record, parent, false);
    const siblingCount = parent ? Math.max(0, parent.children.indexOf(record.uid)) : 0;
    const angle = siblingCount * 0.7;
    const radius = 0.45 + Math.floor(siblingCount / 12) * 0.25;
    record.group.position.set(Math.cos(angle) * radius, 0.12 + (siblingCount % 4) * 0.06, Math.sin(angle) * radius);
    record.group.quaternion.identity();
    record.hierarchyDirty = true;
    markTransformDirty(record);
  }
  const sceneEpoch = state.sceneEpoch;
  await attachModel(record);
  if (state.sceneEpoch !== sceneEpoch) return;
  const alignedRobotArm = record.role === "child" && alignRobotArmWithGhost(record);
  const squared = alignedRobotArm ? null : squareUpNewPart(record);
  selectRecord(record);
  renderHierarchyTree();
  refreshPreview();
  setStatus(`${record.role === "root" ? "Root" : "Child"} added: ${itemID}${RULES.isGun(itemID) ? " (loaded)" : ""}${alignedRobotArm ? "; aligned to the ghost's same-side arm" : ""}${squared ? `; squared up (turned ${squared.degrees.toFixed(1)}° so its straight lines run along X, Y and Z; untick Square up new parts in Grid/Snap… to keep the game's tilt)` : ""}`, "good");
  } finally {
    endEditorHistoryGroup();
  }
}

function clearAllScene() {
  state.sceneEpoch++;
  transform.detach();
  wornInvention.clear();
  wornCopies.clear();
  workspaceOffsets.clear();
  wornCopy = null;
  state.groupTransform = null;
  state.scaleEdit = null;
  for (const obj of state.objects) {
    if (!parentOf(obj)) scene.remove(obj.group);
  }
  state.objects = [];
  state.documents = [];
  state.activeDocumentId = null;
  state.selected = null;
  state.selectedUids.clear();
  state.selectionGroups = [];
  state.parentTargetUid = null;
  syncInspectorFromSelection();
  syncParentTargetUi();
  renderHierarchyTree();
  renderSelectionList();
  renderSelectionGroups();
  refreshPreview();
}

function clearScene(options = {}) {
  const document = activeDocument();
  if (!document) return clearAllScene();
  if (!options.skipRecovery) queueRecoverySafetySnapshot("before clear");
  removeWornCopy(wornCopyKey(document.id));
  removeWornCopy(wornCopyKey(document.id, true));
  workspaceOffsets.delete(document.id);
  state.sceneEpoch++;
  transform.detach();
  state.groupTransform = null;
  state.scaleEdit = null;
  const removed = new Set(documentRecords(document.id).map((record) => record.uid));
  const root = documentRoot(document.id);
  if (root) scene.remove(root.group);
  state.objects = state.objects.filter((record) => !removed.has(record.uid));
  state.documents = state.documents.filter((item) => item.id !== document.id);
  state.selectedUids = new Set([...state.selectedUids].filter((uid) => !removed.has(uid)));
  const retainedSelection = selectedRecords();
  state.selectionGroups = state.selectionGroups.map((group) => ({ ...group, uids: group.uids.filter((uid) => !removed.has(uid)) }))
    .filter((group) => group.uids.length);
  state.activeDocumentId = retainedSelection[0]?.documentId || state.documents[0]?.id || null;
  state.selected = retainedSelection[0] || documentRoot();
  if (!retainedSelection.length && state.selected) state.selectedUids = new Set([state.selected.uid]);
  state.parentTargetUid = rootRecord()?.uid ?? null;
  attachTransformToSelection();
  syncInspectorFromSelection();
  syncParentTargetUi();
  renderHierarchyTree();
  renderSelectionList();
  renderSelectionGroups();
  refreshPreview();
}

function setSelection(records, primary = null) {
  const unique = [];
  const seen = new Set();
  for (const record of records || []) {
    if (!record || seen.has(record.uid) || !recordByUid(record.uid)) continue;
    seen.add(record.uid);
    unique.push(record);
  }
  state.selectedUids = new Set(unique.map((record) => record.uid));
  state.scaleEdit = null;
  if (primary && state.selectedUids.has(primary.uid)) state.selected = primary;
  else state.selected = unique[0] || null;
  if (state.contentEditorRecordUid !== (state.selected?.uid ?? null)) {
    state.contentEditorRecordUid = state.selected?.uid ?? null;
    state.contentPath = [];
    state.contentSelectedIndex = null;
  }
  if (state.selected?.documentId && state.selected.documentId !== state.activeDocumentId) {
    state.activeDocumentId = state.selected.documentId;
    state.parentTargetUid = documentRoot()?.uid ?? null;
  }
  attachTransformToSelection();
  syncInspectorFromSelection();
  renderHierarchyTree();
  renderSelectionList();
  refreshPreview();
}

function selectRecord(record, options = {}) {
  if (!record) return setSelection([], null);
  const additive = !!(options.additive || options.toggle);
  if (!additive) return setSelection([record], record);
  const records = selectedRecords();
  const selected = new Map(records.map((r) => [r.uid, r]));
  if (selected.has(record.uid)) selected.delete(record.uid);
  else selected.set(record.uid, record);
  const nextRecords = Array.from(selected.values());
  const nextPrimary = selected.has(record.uid)
    ? record
    : (state.selected && selected.has(state.selected.uid) ? state.selected : nextRecords[0] || null);
  setSelection(nextRecords, nextPrimary);
}

function removeRecordFromSelection(record) {
  if (!record || !state.selectedUids.has(record.uid)) return;
  const next = selectedRecords().filter((r) => r.uid !== record.uid);
  const primary = state.selected && state.selected.uid !== record.uid ? state.selected : next[0] || null;
  setSelection(next, primary);
}

function makePrimarySelection(record) {
  if (!record || !state.selectedUids.has(record.uid)) return;
  setSelection(selectedRecords(), record);
}

// ---- Groups (owner 2026-10-09: "group items by pressing Ctrl+G so that when you select it you move all of them") ----
// A group is a named set of parts. Clicking any grouped part, in the 3D view or the Hierarchy, selects the whole group; Alt-click
// picks just that part. When groups overlap, the most recently made or updated group that holds the part wins, so a group made
// from other groups acts as their parent and Ctrl+Shift+G (ungroup) peels one level off. Groups ride in undo history, backups,
// and workspace projects (stored by each part's place in its invention tree).
function saveSelectionGroup() {
  const input = $("groupNameInput");
  const typed = input.value.trim().replace(/\s+/g, " ").slice(0, 40);
  const uids = selectedRecords().map((record) => record.uid);
  if (!uids.length || (!typed && uids.length < 2)) {
    setStatus(typed ? "Select the parts for the group first." : "Select at least two parts to group them (Ctrl- or Shift-click adds parts).", "bad");
    return;
  }
  const same = !typed && state.selectionGroups.find((group) => group.uids.length === uids.length && uids.every((uid) => group.uids.includes(uid)));
  if (same) {
    setStatus(`These parts are already grouped as ${same.name}.`);
    return;
  }
  const name = typed || nextGroupName();
  const existing = state.selectionGroups.find((group) => group.name.toLowerCase() === name.toLowerCase());
  // an updated group becomes the newest, so it wins when a click resolves overlapping groups
  if (existing) state.selectionGroups = state.selectionGroups.filter((group) => group !== existing);
  state.selectionGroups.push({ name, uids });
  input.value = "";
  renderSelectionGroups();
  renderHierarchyTree();
  observeEditorHistory();
  setStatus(`${existing ? "Updated" : "Grouped"} ${name}: ${uids.length} part(s). Click any of them to select the whole group; Alt-click picks one part.`, "good");
}

function nextGroupName() {
  const used = new Set(state.selectionGroups.map((group) => group.name.toLowerCase()));
  let n = 1;
  while (used.has(`group ${n}`)) n++;
  return `Group ${n}`;
}

function groupRecords(group) {
  return group ? group.uids.map(recordByUid).filter(Boolean) : [];
}

// The group a click on this part selects: the newest group that holds it and still has another part.
function groupForRecord(record) {
  if (!record) return null;
  for (let i = state.selectionGroups.length - 1; i >= 0; i--) {
    const group = state.selectionGroups[i];
    if (group.uids.includes(record.uid) && groupRecords(group).length > 1) return group;
  }
  return null;
}

function syncSelectionOptionToggles() {
  for (const [id, key] of [["addSelectToggle", "add"], ["singlePartToggle", "single"], ["boxSelectToggle", "box"]]) {
    $(id).classList.toggle("active", state.selectionOptions[key]);
    $(id).setAttribute("aria-pressed", String(state.selectionOptions[key]));
  }
  // Box select owns one-finger drags: the parts list stops scrolling under the finger while it is on.
  document.body.classList.toggle("boxSelecting", state.selectionOptions.box);
}

// What a click, tap or box does: the held keys, or the toolbar's Add to selection / Single parts toggles (owner 2026-10-21,
// for touch screens and the Quest browser, which have no Shift, Ctrl or Alt to hold).
function selectionModifiers(event = {}) {
  return { additive: !!(event.shiftKey || event.ctrlKey || event.metaKey || state.selectionOptions.add),
    single: !!(event.altKey || state.selectionOptions.single) };
}

// A click on a part: its whole group unless Alt is held; Ctrl/Shift adds the group, or removes it when all of it is selected.
function pickRecord(record, event = {}) {
  const { additive, single } = selectionModifiers(event);
  const group = single ? null : groupForRecord(record);
  if (!group) return selectRecord(record, { additive });
  const members = groupRecords(group);
  if (!additive) {
    setSelection(members, record);
  } else {
    const selected = new Map(selectedRecords().map((item) => [item.uid, item]));
    const removing = members.every((item) => selected.has(item.uid));
    for (const item of members) {
      if (removing) selected.delete(item.uid);
      else selected.set(item.uid, item);
    }
    const next = Array.from(selected.values());
    const primary = removing ? (state.selected && selected.has(state.selected.uid) ? state.selected : next[0] || null) : record;
    setSelection(next, primary);
  }
  setStatus(`Selected group ${group.name}: ${members.length} part(s). Alt-click selects just one part.`);
}

// Ctrl+Shift+G: remove the group a click on the active part would select (one level); its parts stay selected.
function ungroupSelection() {
  const selected = selectedRecords();
  let group = groupForRecord(state.selected);
  for (let i = state.selectionGroups.length - 1; !group && i >= 0; i--) {
    if (selected.some((record) => state.selectionGroups[i].uids.includes(record.uid))) group = state.selectionGroups[i];
  }
  if (!group) {
    setStatus("The selected parts are not in a group.", "bad");
    return;
  }
  state.selectionGroups = state.selectionGroups.filter((item) => item !== group);
  renderSelectionGroups();
  renderHierarchyTree();
  observeEditorHistory();
  setStatus(`Ungrouped ${group.name}. Its parts stay selected.`, "good");
}

// Workspace projects store a group member by its invention and the child indexes from that invention's root (the order
// buildStuckChildrenJson writes and loadStuckChildren reads back), since part uids are not kept across a reload.
function recordTreePath(record) {
  const path = [];
  for (let node = record, parent = parentOf(node); parent; node = parent, parent = parentOf(parent)) {
    const index = parent.children.filter((uid) => recordByUid(uid)).indexOf(node.uid);
    if (index < 0) return null;
    path.unshift(index);
  }
  return path;
}

function recordAtTreePath(documentId, path) {
  let node = documentRoot(documentId);
  for (const index of path) {
    if (!node) return null;
    node = recordByUid(node.children.filter((uid) => recordByUid(uid))[index]);
  }
  return node || null;
}

function exportGroupsForProject() {
  const out = [];
  for (const group of state.selectionGroups) {
    const members = [];
    for (const record of groupRecords(group)) {
      const path = record.documentId ? recordTreePath(record) : null;
      if (path) members.push({ document: record.documentId, path });
    }
    if (members.length) out.push({ name: group.name, members });
  }
  return out;
}

function restoreProjectGroups(rawGroups) {
  state.selectionGroups = [];
  if (Array.isArray(rawGroups)) {
    for (const raw of rawGroups.slice(0, 256)) {
      if (!raw || typeof raw.name !== "string" || !Array.isArray(raw.members)) continue;
      const uids = [];
      for (const member of raw.members.slice(0, 4096)) {
        if (!member || typeof member.document !== "string" || !Array.isArray(member.path) ||
            !member.path.every((index) => Number.isInteger(index) && index >= 0)) continue;
        const record = recordAtTreePath(member.document, member.path);
        if (record && !uids.includes(record.uid)) uids.push(record.uid);
      }
      const name = raw.name.trim().replace(/\s+/g, " ").slice(0, 40) || nextGroupName();
      if (uids.length) state.selectionGroups.push({ name, uids });
    }
  }
  renderSelectionGroups();
  return state.selectionGroups.length;
}

function selectSelectionGroup(group) {
  const records = group.uids.map(recordByUid).filter(Boolean);
  if (!records.length) return;
  const primary = records.includes(state.selected) ? state.selected : records[0];
  setSelection(records, primary);
  setStatus(`Selected group ${group.name}: ${records.length} item(s).`);
}

function pruneSelectionGroups() {
  for (const group of state.selectionGroups) group.uids = group.uids.filter((uid) => !!recordByUid(uid));
  state.selectionGroups = state.selectionGroups.filter((group) => group.uids.length);
  renderSelectionGroups();
}

function renderSelectionGroups() {
  const list = $("groupList");
  if (!list) return;
  list.textContent = "";
  if (!state.selectionGroups.length) {
    const empty = document.createElement("div");
    empty.className = "selectionEmpty";
    empty.textContent = "No groups yet";
    list.appendChild(empty);
    return;
  }
  for (const group of state.selectionGroups) {
    const row = document.createElement("div");
    row.className = "groupRow";
    const select = document.createElement("button");
    select.type = "button";
    select.className = "groupSelect";
    select.textContent = `${group.name} (${group.uids.length})`;
    select.title = `Select all items in ${group.name}`;
    select.addEventListener("click", () => selectSelectionGroup(group));
    const remove = document.createElement("button");
    remove.type = "button";
    remove.className = "groupRemove";
    remove.textContent = "×";
    remove.title = `Remove group ${group.name}`;
    remove.addEventListener("click", () => {
      state.selectionGroups = state.selectionGroups.filter((item) => item !== group);
      renderSelectionGroups();
      renderHierarchyTree();
      observeEditorHistory();
    });
    row.append(select, remove);
    list.appendChild(row);
  }
}

function recordFromObject3D(obj) {
  let cur = obj;
  while (cur) {
    if (cur.userData && cur.userData.uid) {
      return recordByUid(cur.userData.uid);
    }
    cur = cur.parent;
  }
  return null;
}

function subtreeRecords(record) {
  const out = [];
  function walk(node) {
    if (!node) return;
    out.push(node);
    for (const uid of node.children) walk(recordByUid(uid));
  }
  walk(record);
  return out;
}

function selectionWorldCenter(records) {
  const box = new THREE.Box3();
  let hasBox = false;
  const fallback = new THREE.Vector3();
  let fallbackCount = 0;
  for (const record of records) {
    try {
      record.group.updateMatrixWorld(true);
      // Drawn geometry only: a hidden light cue used to pull the gizmo metres off a flashlight.
      const b = new THREE.Box3(), meshBox = new THREE.Box3();
      record.group.traverseVisible((node) => {
        if (!node.isMesh || !node.geometry || isLightCue(node)) return;
        if (!node.geometry.boundingBox) node.geometry.computeBoundingBox();
        b.union(meshBox.copy(node.geometry.boundingBox).applyMatrix4(node.matrixWorld));
      });
      if (!b.isEmpty() && Number.isFinite(b.min.x) && Number.isFinite(b.max.x)) {
        if (hasBox) box.union(b);
        else { box.copy(b); hasBox = true; }
        continue;
      }
    } catch (_) {}
    const p = new THREE.Vector3();
    try {
      record.group.getWorldPosition(p);
      fallback.add(p);
      fallbackCount++;
    } catch (_) {}
  }
  if (hasBox) return box.getCenter(new THREE.Vector3());
  if (fallbackCount) return fallback.multiplyScalar(1 / fallbackCount);
  return new THREE.Vector3();
}

// The middle of a part's own model (not its stuck children, not a light cue), in world space; its origin if it has no model.
// Measured in the part's OWN frame: a world-aligned box's centre shifts as an uneven shape turns, which would make repeated
// in-place turns creep. This point is fixed to the model, so turning about it never moves the part.
function partCentreWorld(record) {
  record.group.updateWorldMatrix(true, true);
  if (record.model) {
    const toPart = record.group.matrixWorld.clone().invert();
    const bounds = new THREE.Box3(), box = new THREE.Box3(), toPartMesh = new THREE.Matrix4();
    record.model.traverseVisible((node) => {
      if (!node.isMesh || !node.geometry) return;
      for (let part = node; part && part !== record.model.parent; part = part.parent) {
        if (part.name === "activation_light_preview") return;
      }
      if (!node.geometry.boundingBox) node.geometry.computeBoundingBox();
      bounds.union(box.copy(node.geometry.boundingBox).applyMatrix4(toPartMesh.multiplyMatrices(toPart, node.matrixWorld)));
    });
    if (!bounds.isEmpty()) return bounds.getCenter(new THREE.Vector3()).applyMatrix4(record.group.matrixWorld);
  }
  return record.group.getWorldPosition(new THREE.Vector3());
}

function turnInPlaceActive() { return state.rotateInPlace && state.mode === "rotate"; }

function positionSelectionPivot(records = transformableSelectionRecords()) {
  // turning one part in place: the handle sits on that part's centre
  // children staying: one part's handle sits on its own origin, as it does without the option
  selectionPivot.position.copy(records.length === 1 && turnInPlaceActive() ? partCentreWorld(records[0])
    : records.length === 1 && childrenStayActive() ? records[0].group.getWorldPosition(new THREE.Vector3()) : selectionWorldCenter(records));
  selectionPivot.quaternion.identity();
  selectionPivot.scale.set(1, 1, 1);
  selectionPivot.updateMatrixWorld(true);
}

function attachTransformToSelection() {
  if (state.poseUi.active) { transform.detach(); return; }   // the pose gizmo owns the viewport while posing
  if (state.referenceActive && referenceGorilla.visible) {
    transform.detach();
    transform.attach(referenceGorilla);
    transform.setMode("translate");
    return;
  }
  transform.detach();
  state.groupTransform = null;
  if (state.mode === "select") return;
  const selected = transformableSelectionRecords();
  if (state.mode === "scale" && selected.length > 1 && selected.some((r) => r.frozenEdge)) return;
  const records = selected.filter((r) => !r.frozenEdge);
  if (!records.length) return;
  if (records.length === 1 && !turnInPlaceActive() && !childrenStayActive()) {
    transform.attach(records[0].group);
  } else {
    positionSelectionPivot(records);
    transform.attach(selectionPivot);
  }
  transform.setMode(state.mode);
}

function beginGroupTransform() {
  state.scaleEdit = null;
  const selected = transformableSelectionRecords();
  if (state.mode === "scale" && selected.length > 1 && selected.some((r) => r.frozenEdge)) return;
  const records = selected.filter((r) => !r.frozenEdge);
  if (state.mode === "scale") {
    // Solve parent poses before their children against each parent's updated world pose.
    const depth = (record) => { let n = 0; for (let p = parentOf(record); p; p = parentOf(p)) n++; return n; };
    records.sort((a, b) => depth(a) - depth(b));
  }
  if (!records.length || transform.object !== selectionPivot) {
    state.groupTransform = null;
    return;
  }
  selectionPivot.updateMatrixWorld(true);
  const inPlace = turnInPlaceActive();
  const pivotStartQuat = selectionPivot.quaternion.clone();
  const pivotStart = selectionPivot.matrixWorld.clone();
  const pivotStartInv = pivotStart.clone().invert();
  const entries = records.map((record) => {
    // parents too: a stale parent matrix offset every captured pose (and so Turn in place's centres) by the same amount
    record.group.updateWorldMatrix(true, true);
    const parent = parentOf(record);
    const worldMatrix = record.group.matrixWorld.clone();
    const worldPos = new THREE.Vector3();
    const worldQuat = new THREE.Quaternion();
    const worldScale = new THREE.Vector3();
    worldMatrix.decompose(worldPos, worldQuat, worldScale);
    return {
      record,
      parent,
      parentWorldInv: parent ? parentFrame(record).matrixWorld.clone().invert() : new THREE.Matrix4(),
      worldMatrix,
      worldPos,
      worldQuat,
      centre: inPlace ? partCentreWorld(record).toArray() : null,
      scaleModifier: record.scaleModifier
    };
  });
  let followed = 0;
  if (childrenStayActive()) {
    // the unselected parts under them hold still; every pose is solved after its parent's (parents first)
    const stay = heldChildPoses(records);
    followed = stay.followed;
    for (const entry of entries) entry.depth = recordDepth(entry.record);
    entries.push(...stay.held);
    entries.sort((a, b) => a.depth - b.depth);
  }
  state.groupTransform = { mode: state.mode, pivotStartInv, pivotStartQuat, inPlace, entries, followed };
}

function applyWorldPoseToRecord(record, parent, worldPos, worldQuat) {
  const frame = parent ? parentFrame(record) : null;
  if (frame) frame.updateWorldMatrix(true, false);   // convert against the parent's current world pose, never a stale one
  const localPos = frame ? frame.worldToLocal(worldPos.clone()) : worldPos.clone();
  const parentWorldQuat = new THREE.Quaternion();
  if (frame) frame.getWorldQuaternion(parentWorldQuat);
  const localQuat = parent ? parentWorldQuat.invert().multiply(worldQuat).normalize() : worldQuat.clone().normalize();
  record.group.position.copy(localPos);
  record.group.quaternion.copy(localQuat);
  record.group.scale.set(1, 1, 1);
  markTransformDirty(record);
  record.group.updateMatrixWorld(true);
}

// Square up (owner 2026-10-26, square_up.mjs): the smallest world turn that lays a part's own straight lines (a shaft and
// a side handle) along X, Y and Z, from its drawn mesh edges. null for a round shape or a part without a model yet.
function partSquareUpTurn(record) {
  if (!record.model) return null;
  record.group.updateWorldMatrix(true, true);
  const edges = { dirs: [], lens: [] };
  record.model.traverseVisible((node) => {
    const position = node.isMesh && node.geometry?.attributes?.position;
    if (!position) return;
    for (let part = node; part && part !== record.model.parent; part = part.parent) {
      if (part.name === "activation_light_preview") return;
    }
    let positions = position.array;
    if (position.isInterleavedBufferAttribute) {
      positions = new Float32Array(position.count * 3);
      for (let i = 0; i < position.count; i++) positions.set([position.getX(i), position.getY(i), position.getZ(i)], i * 3);
    }
    meshEdges(positions, node.geometry.index ? node.geometry.index.array : null, node.matrixWorld.elements, edges);
  });
  return edges.lens.length ? squareUpTurn(edges) : null;
}

// Turn one part about its own model centre (it stays where it sits on its parent); its attached parts turn with it. A root
// turns about its own origin, so the invention's root stays where it is.
function applySquareUp(record, turn) {
  record.group.updateMatrixWorld(true);
  const worldPosition = record.group.getWorldPosition(new THREE.Vector3()).toArray();
  const next = turnAboutCentre({ worldPosition, worldQuaternion: record.group.getWorldQuaternion(new THREE.Quaternion()).toArray(),
    centre: parentOf(record) ? partCentreWorld(record).toArray() : worldPosition, rotation: turn.quaternion });
  applyWorldPoseToRecord(record, parentOf(record), new THREE.Vector3().fromArray(next.worldPosition),
    new THREE.Quaternion().fromArray(next.worldQuaternion));
}

function squareUpSelection() {
  const selected = selectedRecords();
  if (!selected.length) {
    setStatus("Select the parts to square up first.", "bad");
    return;
  }
  const depth = (record) => { let d = 0; for (let p = parentOf(record); p; p = parentOf(p)) d++; return d; };
  // Parents first: a squared part carries its selected children, which are then measured where they now are.
  const ordered = selected.slice().sort((a, b) => depth(a) - depth(b));
  const turned = [], already = [], round = [], locked = [];
  for (const record of ordered) {
    if (record.frozenEdge) { locked.push(record); continue; }
    const turn = partSquareUpTurn(record);
    if (!turn) { round.push(record); continue; }
    if (turn.degrees < 0.05) { already.push(record); continue; }
    applySquareUp(record, turn);
    turned.push(`${record.itemID} ${turn.degrees.toFixed(1)}°`);
  }
  if (selected.length > 1 || transform.object === selectionPivot) {
    positionSelectionPivot();
    attachTransformToSelection();
  }
  renderHierarchyTree();
  refreshPreview();
  syncInspectorFromSelection();
  const notes = [
    already.length ? `${already.length} already square` : "",
    round.length ? `${round.length} with no straight lines to square (round shapes)` : "",
    locked.length ? `${locked.length} locked verbatim edge(s) left as they are` : "",
  ].filter(Boolean).join("; ");
  setStatus(turned.length
    ? `Squared up ${turned.join(", ")} so their straight lines run along X, Y and Z, each about its own centre.${notes ? ` ${notes}.` : ""}`
    : `Nothing to turn: ${notes || "already square"}.`, turned.length ? "good" : "");
}

// A newly added catalog part whose model sits clearly tilted (two square lines found, at least AUTO_MIN_DEGREES off) is
// squared before it is first drawn for the author. Items that are already square, round or only one line are left alone.
function squareUpNewPart(record) {
  if (!state.squareUpNew || record.frozenEdge) return null;
  const turn = partSquareUpTurn(record);
  if (!turn || turn.kind !== "two-lines" || turn.degrees < AUTO_MIN_DEGREES) return null;
  applySquareUp(record, turn);
  return turn;
}

function setSquareUpNew(on, { persist = true } = {}) {
  state.squareUpNew = !!on;
  if ($("squareUpNewToggle")) $("squareUpNewToggle").checked = state.squareUpNew;
  if (persist) {
    try { localStorage.setItem(SQUARE_UP_PREFERENCE_KEY, JSON.stringify({ on: state.squareUpNew })); } catch (_) {}
  }
}

function bindChildrenStayControls() {
  try {
    const saved = JSON.parse(localStorage.getItem(CHILDREN_STAY_PREFERENCE_KEY) || "{}");
    if (typeof saved?.on === "boolean") state.childrenStay = saved.on;
  } catch (_) {}
  $("childrenStayToggle").checked = state.childrenStay;
  $("childrenStayToggle").addEventListener("change", (event) => {
    state.childrenStay = event.target.checked;
    try { localStorage.setItem(CHILDREN_STAY_PREFERENCE_KEY, JSON.stringify({ on: state.childrenStay })); } catch (_) {}
    attachTransformToSelection();
    setStatus(state.childrenStay
      ? "Children stay: Move and Rotate (handles and typed values) move only the selected parts. Parts attached under them stay where they are; select them too to move them."
      : "Children stay off: moving or turning a part carries everything attached under it.");
  });
}

function bindSquareUpControls() {
  try {
    const saved = JSON.parse(localStorage.getItem(SQUARE_UP_PREFERENCE_KEY) || "{}");
    if (typeof saved?.on === "boolean") state.squareUpNew = saved.on;
  } catch (_) {}
  setSquareUpNew(state.squareUpNew, { persist: false });
  $("squareUpNewToggle").addEventListener("change", () => {
    setSquareUpNew($("squareUpNewToggle").checked);
    setStatus(state.squareUpNew
      ? "Square up new parts is on: a catalog item whose model sits tilted in the game is turned so its straight lines run along X, Y and Z when you add it."
      : "Square up new parts is off: added items keep the game's own orientation. Square up still turns the selected parts.");
  });
  $("squareUpBtn").addEventListener("click", squareUpSelection);
}

function beginSelectedScaleEdit() {
  const records = selectedRecords();
  if (!state.selected || !records.length) return null;
  if (records.length > 1 && records.some((record) => record.frozenEdge)) {
    setStatus("Group scale needs editable items. Remove verbatim locked edges from the selection.", "bad");
    syncInspectorFromSelection();
    return null;
  }
  const pivot = records.length > 1 ? selectionWorldCenter(records) : null;
  const entries = records.map((record) => {
    record.group.updateMatrixWorld(true);
    return {
      record, uid: record.uid, itemID: record.itemID, scaleModifier: record.scaleModifier,
      parent: parentOf(record),
      worldPos: record.group.getWorldPosition(new THREE.Vector3()),
      worldQuat: record.group.getWorldQuaternion(new THREE.Quaternion()),
    };
  });
  // Solve the parent's new world pose before positioning a selected child.
  const depth = (record) => { let n = 0; for (let p = parentOf(record); p; p = parentOf(p)) n++; return n; };
  entries.sort((a, b) => depth(a.record) - depth(b.record));
  state.scaleEdit = { entries, pivot, primaryUid: state.selected.uid, lastModifier: state.selected.scaleModifier };
  return state.scaleEdit;
}

function applySelectedScaleModifier(value) {
  if (value === "" || !Number.isFinite(Number(value))) {
    syncInspectorFromSelection();
    return;
  }
  const edit = state.scaleEdit || beginSelectedScaleEdit();
  if (!edit) return;
  const plan = planSelectionScale(edit.entries, edit.primaryUid, value);
  if (plan.primaryModifier === edit.lastModifier) {
    syncInspectorFromSelection();
    return;
  }
  for (const entry of edit.entries) {
    if (edit.entries.length > 1) {
      const worldPos = entry.worldPos.clone().sub(edit.pivot).multiplyScalar(plan.factor).add(edit.pivot);
      applyWorldPoseToRecord(entry.record, entry.parent, worldPos, entry.worldQuat);
    }
    const oldScale = entry.record.scaleModifier;
    entry.record.scaleModifier = plan.modifiers.get(entry.uid);
    if (entry.record.scaleModifier !== oldScale) {
      markTransformDirty(entry.record);
      markChildEdgesDirty(entry.record);
    }
    applyObjectVisualState(entry.record);
  }
  edit.lastModifier = plan.primaryModifier;
  syncInspectorFromSelection();
  renderHierarchyTree();
  refreshPreview();
}

function stepSelectedScale(direction) {
  if (!state.selected) return;
  applySelectedScaleModifier(clamp(state.selected.scaleModifier + direction, -128, 127));
}

function applyGroupTransform() {
  const tx = state.groupTransform;
  if (!tx || !tx.entries.length) {
    beginGroupTransform();
    return;
  }
  selectionPivot.updateMatrixWorld(true);
  const delta = selectionPivot.matrixWorld.clone().multiply(tx.pivotStartInv);
  const worldPos = new THREE.Vector3();
  const worldQuat = new THREE.Quaternion();
  const worldScale = new THREE.Vector3();
  const groupScale = Math.max(
    0.05,
    (Math.abs(selectionPivot.scale.x) + Math.abs(selectionPivot.scale.y) + Math.abs(selectionPivot.scale.z)) / 3
  );
  for (const entry of tx.entries) {
    if (entry.hold) {
      applyWorldPoseToRecord(entry.record, entry.parent, entry.worldPos, entry.worldQuat);
    } else if (tx.mode === "scale") {
      const nextPos = entry.worldPos.clone().applyMatrix4(delta);
      applyWorldPoseToRecord(entry.record, entry.parent, nextPos, entry.worldQuat);
      const nextScale = scaleModifierToScalar(entry.scaleModifier, entry.record.itemID) * groupScale;
      const oldScale = entry.record.scaleModifier;
      entry.record.scaleModifier = scalarToScaleModifier(nextScale, entry.record.itemID);
      if (entry.record.scaleModifier !== oldScale) { markTransformDirty(entry.record); markChildEdgesDirty(entry.record); }
      applyObjectVisualState(entry.record);
    } else if (tx.inPlace && tx.mode === "rotate") {
      // the handle's turn, applied to each part about its own model centre
      const turn = selectionPivot.quaternion.clone().multiply(tx.pivotStartQuat.clone().invert()).normalize();
      const next = turnAboutCentre({ worldPosition: entry.worldPos.toArray(), worldQuaternion: entry.worldQuat.toArray(),
        centre: entry.centre, rotation: turn.toArray() });
      applyWorldPoseToRecord(entry.record, entry.parent, worldPos.fromArray(next.worldPosition), worldQuat.fromArray(next.worldQuaternion));
    } else {
      const nextWorld = delta.clone().multiply(entry.worldMatrix);
      nextWorld.decompose(worldPos, worldQuat, worldScale);
      applyWorldPoseToRecord(entry.record, entry.parent, worldPos, worldQuat);
    }
  }
}

function endGroupTransform() {
  if (!state.groupTransform) return;
  const followed = state.groupTransform.followed || 0;
  state.groupTransform = null;
  state.scaleEdit = null;
  positionSelectionPivot();
  attachTransformToSelection();
  syncInspectorFromSelection();
  renderHierarchyTree();
  renderSelectionList();
  refreshPreview();
  if (followed) setStatus(`${followed} attached part${followed === 1 ? "" : "s"} moved along anyway: ${followed === 1 ? "its" : "their"} stuck pose is kept verbatim from the file and cannot be re-saved from a new place.`, "bad");
}

async function cloneSubtree(src, parent, sceneEpoch = state.sceneEpoch) {
  const assertCurrent = () => {
    if (state.sceneEpoch !== sceneEpoch || !state.objects.includes(src) || (parent && !state.objects.includes(parent))) {
      throw new Error("The invention changed while copies were loading.");
    }
  };
  assertCurrent();
  const clone = makeObjectRecord(src.itemID, src.role === "root" ? "child" : src.role);
  clone.documentId = src.documentId;
  clone.scaleModifier = src.scaleModifier;
  clone.colorHue = src.colorHue;
  clone.colorSaturation = src.colorSaturation;
  clone.jellyStrength = src.jellyStrength;
  clone.state = src.state;
  clone.ammo = src.ammo;
  clone.subParentID = src.subParentID;
  clone.contents = deepClone(src.contents || []);
  clone.sourceItem = src.sourceItem ? deepClone(src.sourceItem) : null;
  clone.sourceStuck = src.sourceStuck ? deepClone(src.sourceStuck) : null;
  clone.group.position.copy(src.group.position);
  clone.group.quaternion.copy(src.group.quaternion);
  if (src.frozenEdge && src.sourceStuck) {
    // a verbatim edge duplicates verbatim (same stick numbers), nothing else is expressible for an unprobed frame
    clone.frozenEdge = true;
  } else {
    clone.hierarchyDirty = true;
    clone.transformDirty = true;
  }
  state.objects.push(clone);
  linkToParent(clone, parent, false);
  await attachModel(clone);
  assertCurrent();
  for (const childUid of src.children) {
    const child = recordByUid(childUid);
    if (child) await cloneSubtree(child, clone, sceneEpoch);
  }
  return clone;
}

function captureObjectClipboard(capture = captureSelectedForest) {
  // Snapshot the complete subtree for each topmost selected object. Selected
  // descendants of another selected object must not be copied twice.
  // captureSelectedParts instead takes the selected parts alone.
  const forest = capture(captureEditorSnapshot());
  for (const entry of forest.entries) {
    const source = recordByUid(entry.rootUid);
    if (!source) continue;
    source.group.updateWorldMatrix(true, false);
    const position = source.group.getWorldPosition(new THREE.Vector3());
    position.x -= workspaceOffsets.get(source.documentId) || 0;
    entry.worldPosition = position.toArray();
    entry.worldQuaternion = source.group.getWorldQuaternion(new THREE.Quaternion()).toArray();
  }
  return forest;
}

function copySelectedObjects() {
  const forest = captureObjectClipboard();
  if (!forest.entries.length) return setStatus("Select an item to copy.", "bad");
  objectClipboard = forest;
  const count = forest.entries.reduce((sum, entry) => sum + entry.nodes.length, 0);
  setStatus(`Copied ${count} item${count === 1 ? "" : "s"}. Press Paste (Ctrl+V) to place the copies; Duplicate copies and places in one step.`, "good");
}

function pasteTargetFor(entry) {
  // Paste back into the copied item's invention even if another tab is active.
  // This keeps mixed selections independent and their original poses exact.
  const sourceDocument = documentRoot(entry.sourceDocumentId) ? entry.sourceDocumentId : state.activeDocumentId;
  const targetRoot = documentRoot(sourceDocument);
  if (!targetRoot) return null;
  const originalParent = recordByUid(entry.sourceParentUid);
  if (originalParent?.documentId === sourceDocument) return originalParent;
  const activeParent = sourceDocument === state.activeDocumentId ? parentTargetRecord() : null;
  return activeParent?.documentId === sourceDocument ? activeParent : targetRoot;
}

// Keep in invention (owner 2026-10-25): a copied root sticks to its own invention's root, or to the active invention's
// root once its own invention is gone. null makes it a separate invention, as before.
function rootCopyParentFor(entry) {
  if (!state.keepCopiesInInvention) return null;
  return documentRoot(entry.sourceDocumentId) || documentRoot() || null;
}

function addClipboardNode(saved, nodesByUid, parent, documentId, created, clonesBySourceUid = null) {
  const record = makeObjectRecord(saved.itemID, parent ? "child" : "root");
  record.documentId = documentId;
  for (const field of ["scaleModifier", "colorHue", "colorSaturation", "jellyStrength", "state", "ammo", "subParentID"])
    record[field] = saved[field];
  record.contents = deepClone(saved.contents || []);
  record.sourceItem = saved.sourceItem ? deepClone(saved.sourceItem) : null;
  record.sourceStuck = saved.sourceStuck ? deepClone(saved.sourceStuck) : null;
  record.frozenEdge = !!saved.frozenEdge;
  record.hierarchyDirty = !record.frozenEdge;
  record.transformDirty = !record.frozenEdge;
  record.group.position.fromArray(saved.position);
  record.group.quaternion.fromArray(saved.quaternion);
  state.objects.push(record);
  created.push(record);
  clonesBySourceUid?.set(saved.uid, record);
  if (parent) linkToParent(record, parent, false);
  else scene.add(record.group);
  for (const uid of saved.children || []) {
    const child = nodesByUid.get(uid);
    if (child) addClipboardNode(child, nodesByUid, record, documentId, created, clonesBySourceUid);
  }
  return record;
}

function pasteObjectForest(forest, label = "Pasted") {
  if (!forest?.entries?.length) return setStatus("Copy an item in the editor first.", "bad");
  const targets = new Map();
  try {
    for (const entry of forest.entries) {
      if (entry.isDocumentRoot) {
        targets.set(entry, rootCopyParentFor(entry));
        continue;
      }
      const parent = pasteTargetFor(entry);
      if (parent && entry.nodes[0]?.frozenEdge && parent.uid !== entry.sourceParentUid)
        throw new Error("A verbatim locked edge can only be pasted under its original parent.");
      targets.set(entry, parent);
    }
  } catch (error) {
    return setStatus(`Paste failed: ${error.message || error}`, "bad");
  }
  const before = captureEditorSnapshot();
  const created = [];
  const pastedRoots = [];
  let newDocuments = 0;
  const rootsKept = [];
  beginEditorHistoryGroup();
  try {
    for (const entry of forest.entries) {
      const nodesByUid = new Map(entry.nodes.map((node) => [node.uid, node]));
      const savedRoot = nodesByUid.get(entry.rootUid);
      if (!savedRoot) throw new Error("The copied subtree has no root item.");
      let parent = targets.get(entry) || null;
      let documentId = parent?.documentId;
      const promotedRoot = !entry.isDocumentRoot && !parent;
      const keptRoot = entry.isDocumentRoot && !!parent;
      if (keptRoot) rootsKept.push(parent);
      else if (entry.isDocumentRoot || promotedRoot) {
        const sourceDoc = entry.document || {};
        const name = `${sourceDoc.name || savedRoot.itemID} copy`;
        const filename = `${(sourceDoc.filename || `${savedRoot.itemID}.json`).replace(/\.json$/i, "")}_copy.json`;
        const preview = { ...sourceDoc.preview };
        if (entry.isDocumentRoot) {
          const liveRoot = recordByUid(entry.rootUid);
          const liveSource = liveRoot?.role === "root" && liveRoot.documentId === entry.sourceDocumentId
            ? documentForRecord(liveRoot) : null;
          if (liveSource) {
            const groupId = liveSource.preview.layoutGroupId || `stack-${crypto.randomUUID()}`;
            liveSource.preview.layoutGroupId = groupId;
            preview.layoutGroupId = groupId;
          } else delete preview.layoutGroupId;
        }
        const document = createDocument({ name, filename, preview, dirty: true });
        newDocuments++;
        documentId = document.id;
      }
      // A root copy kept in its invention is a plain stuck part on that root's base: no edge of its own yet.
      const newRoot = addClipboardNode(keptRoot ? { ...savedRoot, subParentID: 0, sourceStuck: null, frozenEdge: false } : savedRoot,
        nodesByUid, parent, documentId, created);
      if (promotedRoot) {
        newRoot.sourceStuck = null;
        newRoot.frozenEdge = false;
        newRoot.subParentID = 0;
        newRoot.group.position.fromArray(entry.worldPosition);
        newRoot.group.quaternion.fromArray(entry.worldQuaternion);
      } else if (entry.isDocumentRoot && !keptRoot) {
        newRoot.group.visible = entry.document?.preview?.visible !== false;
      } else if (parent.uid !== entry.sourceParentUid) {
        // The new parent may be in another invention's workspace lane. Keep
        // the copied item's world pose relative to that invention's lane.
        const worldPosition = new THREE.Vector3(...entry.worldPosition);
        worldPosition.x += workspaceOffsets.get(parent.documentId) || 0;
        const frame = parentFrame(newRoot);
        frame.updateWorldMatrix(true, false);
        newRoot.group.position.copy(frame.worldToLocal(worldPosition));
        const parentQuat = frame.getWorldQuaternion(new THREE.Quaternion());
        newRoot.group.quaternion.copy(parentQuat.invert().multiply(new THREE.Quaternion(...entry.worldQuaternion)));
        if (keptRoot) {
          // A root duplicated onto itself sits exactly on it: save 0 and identity, not float noise.
          if (newRoot.group.position.lengthSq() < 1e-12) newRoot.group.position.set(0, 0, 0);
          if (1 - Math.abs(newRoot.group.quaternion.w) < 1e-12) newRoot.group.quaternion.identity();
        }
        newRoot.hierarchyDirty = true;
        markTransformDirty(newRoot);
      }
      pastedRoots.push(newRoot);
    }
    setSelection(pastedRoots, pastedRoots[0]);
    renderHierarchyTree();
    refreshPreview();
    const sceneEpoch = state.sceneEpoch;
    void Promise.all(created.map((record) => attachModel(record, { reportError: false }))).then(() => {
      // Loading meshes changes visual bounds but not the user's edit. A late
      // refresh must not add another Undo step after this paste group closes.
      if (state.sceneEpoch === sceneEpoch && created.some((record) => state.objects.includes(record)))
        refreshPreview({ recordHistory: false });
    }).catch((error) => setStatus(`Pasted items, but a preview model failed: ${error.message || error}`, "bad"));
    const keptNames = [...new Set(rootsKept.map((root) => `"${documentForRecord(root)?.name || displayName(root)}"`))].join(", ");
    setStatus(`${label} ${created.length} item${created.length === 1 ? "" : "s"} at the same pose${newDocuments
      ? `; created ${newDocuments} independent invention${newDocuments === 1 ? "" : "s"}` : ""}.` +
      (rootsKept.length ? ` The root copy stays in ${keptNames}, stuck to its root (Keep in invention is on; untick it to ` +
        "make a copied root a separate invention)." : "") +
      (rootsKept.some((root) => root.scaleModifier !== 0) ? " That root is resized, and the game stacks a root's size onto " +
        "its children: see the invention's validation warnings." : ""), "good");
  } catch (error) {
    restoreEditorSnapshot(before);
    setStatus(`Paste failed: ${error.message || error}`, "bad");
  } finally {
    endEditorHistoryGroup();
  }
}

function pasteCopiedObjects() { pasteObjectForest(objectClipboard); }
function duplicateSelected() {
  const forest = captureObjectClipboard();
  if (!forest.entries.length) return setStatus("Select an item to duplicate.", "bad");
  pasteObjectForest(forest, "Duplicated");
}
// Owner 2026-10-25: copy only the selected parts, none of the unselected parts under them.
function duplicateSelectedPartsOnly() {
  const forest = captureObjectClipboard(captureSelectedParts);
  if (!forest.entries.length) return setStatus("Select the parts to duplicate.", "bad");
  pasteObjectForest(forest, "Duplicated");
}

function setKeepCopiesInInvention(keep, { persist = true } = {}) {
  state.keepCopiesInInvention = !!keep;
  if ($("keepCopiesToggle")) $("keepCopiesToggle").checked = state.keepCopiesInInvention;
  if (persist) {
    try { localStorage.setItem(KEEP_COPIES_PREFERENCE_KEY, JSON.stringify({ keep: state.keepCopiesInInvention })); } catch (_) {}
  }
}

function bindKeepCopiesToggle() {
  try {
    const saved = JSON.parse(localStorage.getItem(KEEP_COPIES_PREFERENCE_KEY) || "{}");
    if (typeof saved?.keep === "boolean") state.keepCopiesInInvention = saved.keep;
  } catch (_) {}
  setKeepCopiesInInvention(state.keepCopiesInInvention, { persist: false });
  $("keepCopiesToggle").addEventListener("change", () => {
    setKeepCopiesInInvention($("keepCopiesToggle").checked);
    setStatus(state.keepCopiesInInvention
      ? "Keep in invention is on: a duplicated or pasted root becomes a part stuck to its own invention's root."
      : "Keep in invention is off: a duplicated or pasted root becomes a separate invention.");
  });
}

// Owner 2026-10-25: fold one invention into another so they save as one JSON, e.g. a part that was duplicated or split
// into its own invention by accident. The merged invention's root becomes a part stuck to the target part (the other
// invention's root by default), every part keeps where it is drawn, and the merged invention leaves the workspace.
function mergeInventionInto(sourceDocumentId, targetDocumentId, targetUid = null) {
  let plan;
  try {
    plan = planInventionMerge(state.objects, { sourceDocumentId, targetDocumentId, targetUid });
  } catch (error) {
    return setStatus(`Merge: ${error.message || error}`, "bad");
  }
  const source = state.documents.find((document) => document.id === sourceDocumentId);
  const target = state.documents.find((document) => document.id === targetDocumentId);
  const sourceRoot = recordByUid(plan.sourceRootUid);
  const attachTo = recordByUid(plan.targetUid);
  const before = captureEditorSnapshot();
  beginEditorHistoryGroup();
  try {
    transform.detach();
    state.groupTransform = null;
    state.scaleEdit = null;
    scene.updateMatrixWorld(true);
    // Workspace lanes are display offsets. Keep the pose the root has relative to its own lane, in the target's lane.
    sourceRoot.group.position.x += (workspaceOffsets.get(targetDocumentId) || 0) - (workspaceOffsets.get(sourceDocumentId) || 0);
    sourceRoot.group.visible = true;
    sourceRoot.group.updateMatrixWorld(true);
    for (const uid of plan.memberUids) recordByUid(uid).documentId = targetDocumentId;
    sourceRoot.role = "child";
    sourceRoot.subParentID = 0;
    sourceRoot.sourceStuck = null;
    sourceRoot.frozenEdge = false;
    linkToParent(sourceRoot, attachTo, true);
    sourceRoot.group.scale.set(1, 1, 1);
    removeWornCopy(wornCopyKey(sourceDocumentId));
    removeWornCopy(wornCopyKey(sourceDocumentId, true));
    workspaceOffsets.delete(sourceDocumentId);
    state.documents = state.documents.filter((document) => document.id !== sourceDocumentId);
    target.dirty = true;
    state.activeDocumentId = targetDocumentId;
    setSelection([sourceRoot], sourceRoot);
    setParentTarget(attachTo);
    renderHierarchyTree();
    renderSelectionList();
    renderSelectionGroups();
    refreshPreview();
    setStatus(`Merged "${source?.name || sourceRoot.itemID}" (${plan.memberUids.length} part${plan.memberUids.length === 1 ? "" : "s"}) ` +
      `into "${target.name}": its root ${displayName(sourceRoot)} is now stuck to ${displayName(attachTo)}. Every part stays ` +
      `where it is drawn, and "${target.name}" now saves as one JSON. Undo splits them again.` +
      (attachTo.role === "root" && attachTo.scaleModifier !== 0 ? " That root is resized, and the game stacks a root's size " +
        "onto its children: see the invention's validation warnings." : ""), "good");
  } catch (error) {
    restoreEditorSnapshot(before);
    setStatus(`Merge failed: ${error.message || error}`, "bad");
  } finally {
    endEditorHistoryGroup();
  }
}

function renderMergeTargets() {
  const select = $("mergeTargetSelect");
  if (!select) return;
  const current = activeDocument();
  const others = state.documents.filter((document) => document.id !== current?.id && documentRoot(document.id));
  const previous = select.value;
  select.replaceChildren(...others.map((document) => {
    const option = window.document.createElement("option");
    option.value = document.id;
    option.textContent = document.name;
    return option;
  }));
  if (others.some((document) => document.id === previous)) select.value = previous;
  const ready = !!current && !!documentRoot(current.id) && others.length > 0;
  select.disabled = !ready;
  $("mergeDocumentBtn").disabled = !ready;
  $("mergeDocumentBtn").title = ready
    ? `Stick the root of "${current.name}" to the root of the chosen invention and remove "${current.name}" from the workspace`
    : "Add a second invention to the workspace first.";
}

// Mirror displayed poses in the wearer's body frame, then solve them back into each
// invention's saved parent frame. Reflecting on both sides of a pose matrix keeps
// its rotation right-handed; negative item scales are not valid invention poses.
function reflectedBodyPose(sourceWorld, sourceToRig, bodyReflection, localReflection) {
  return sourceToRig.clone().invert().multiply(bodyReflection)
    .multiply(sourceToRig).multiply(sourceWorld).multiply(localReflection);
}

function mirrorSelectedAboutBody() {
  const sources = selectedRecords();
  mirrorForestAboutBody(sources, captureObjectClipboard());
}

function oppositeRobotArmItemID(record) {
  const side = state.robotArmSkins.get(record?.itemID)?.side;
  if (side !== "left" && side !== "right") return null;
  const match = /^(item_robot_arm_)(left|right)(?=_|$)/.exec(record.itemID);
  if (!match || match[2] !== side) return null;
  const opposite = `${match[1]}${side === "left" ? "right" : "left"}${record.itemID.slice(match[0].length)}`;
  const entry = entryForItem(opposite);
  return entry?.url && (entry.arm_skin_url || entry.arm_skin?.url) ? opposite : null;
}

function canMirrorCompleteArm(record) {
  return !!(record && record.role === "child" && parentOf(record) && !record.frozenEdge &&
    oppositeRobotArmItemID(record) && state.avatarArmPose && state.playerRigs?.player_anchors?.avatar?.matrix &&
    documentRoot(record.documentId));
}

async function mirrorCompleteArm() {
  const arm = state.selected;
  if (!canMirrorCompleteArm(arm))
    return setStatus("Select an editable robot arm with a matching opposite variant in the current game build.", "bad");
  const oppositeID = oppositeRobotArmItemID(arm);
  const sceneEpoch = state.sceneEpoch;
  $("mirrorCompleteArmBtn").disabled = true;
  try {
    // A build can contain only the source arm so far. Load its matching game's
    // model and pose sidecar on demand before solving the opposite shoulder.
    if (!state.robotArmSkins.has(oppositeID)) {
      setStatus(`Loading the matching ${oppositeID} model and pose…`);
      await loadModel(entryForItem(oppositeID));
    }
    if (state.sceneEpoch !== sceneEpoch || recordByUid(arm.uid) !== arm) return;
    const oppositeSide = state.robotArmSkins.get(oppositeID)?.side;
    if (oppositeSide === state.robotArmSkins.get(arm.itemID)?.side || !oppositeSide)
      throw new Error("The matching arm has no opposite-side pose data in this game build.");
    // A saved selection group may also contain decorations or another arm. This
    // action deliberately copies only the primary arm and its entire subtree.
    const snapshot = captureEditorSnapshot();
    const forest = captureSelectedForest({ ...snapshot, selectedUids: [arm.uid] });
    mirrorForestAboutBody([arm], forest, { swappedArm: { sourceUid: arm.uid, oppositeID } });
  } catch (error) {
    setStatus(`Mirror complete arm: ${error.message || error}`, "bad");
  } finally {
    $("mirrorCompleteArmBtn").disabled = !canMirrorCompleteArm(state.selected);
  }
}

function mirrorForestAboutBody(sources, forest, { swappedArm = null } = {}) {
  const roots = selectedTransformRoots(sources);
  if (!roots.length || sources.some((record) => record.role === "root")) {
    setStatus("Select child parts to mirror. The invention root stays in place.", "bad");
    return;
  }
  if (!state.playerRigs?.player_anchors?.avatar?.matrix) {
    setStatus("The wearer rig is still loading; try Mirror About Body again in a moment.", "bad");
    return;
  }
  const before = captureEditorSnapshot();
  const created = [];
  const clonesBySourceUid = new Map();
  const targets = new Map();
  let started = false;
  try {
    const mirror = new THREE.Matrix4().makeScale(-1, 1, 1);
    const body = matrixFromRows(state.playerRigs.player_anchors.avatar.matrix);
    const bodyReflection = body.clone().multiply(mirror).multiply(body.clone().invert());
    scene.updateMatrixWorld(true);
    for (const id of forest.sourceDocumentIds) {
      const document = state.documents.find((item) => item.id === id);
      const root = document && documentRoot(id);
      if (!root) throw new Error("A selected invention is no longer in the workspace.");
      const selectedRoots = roots.filter((record) => record.documentId === id);
      const extra = selectedRoots.reduce((count, record) => count + selectedSubtreeNodeCount(record), 0);
      const descendants = RULES.validateInvention(buildGoopJson(id)).stats.nodes - 1;
      if (descendants + extra > RULES.STASH_MAX_DESCENDANTS)
        throw new Error(`${document.name} would have ${descendants + extra} descendants (maximum ${RULES.STASH_MAX_DESCENDANTS}, including contents).`);
      root.group.updateWorldMatrix(true, false);
      const sourceToRig = documentWornRootInRig(document, root).multiply(root.group.matrixWorld.clone().invert());
      for (const entry of forest.entries.filter((item) => item.sourceDocumentId === id)) {
        for (const saved of entry.nodes) {
          const source = recordByUid(saved.uid);
          if (!source || source.frozenEdge)
            throw new Error("A selected subtree has a locked verbatim edge. Mirror needs editable poses throughout that subtree.");
          source.group.updateWorldMatrix(true, false);
          targets.set(saved.uid, reflectedBodyPose(source.group.matrixWorld.clone(), sourceToRig,
            bodyReflection, mirror));
        }
        if (swappedArm?.sourceUid === entry.rootUid) {
          const source = recordByUid(entry.rootUid);
          const sourceShoulder = robotArmShoulderLocalMatrix(source.itemID, source.scaleModifier);
          const oppositeShoulder = robotArmShoulderLocalMatrix(swappedArm.oppositeID, source.scaleModifier);
          if (!sourceShoulder || !oppositeShoulder)
            throw new Error("Current-build shoulder pose data is unavailable for this robot arm pair.");
          // A left/right prefab may have a different origin or shoulder bind. Reflect
          // the actual shoulder, then solve the opposite arm's root from its own
          // shoulder frame. Every descendant keeps its individually reflected pose.
          const shoulderWorld = source.group.matrixWorld.clone().multiply(sourceShoulder);
          targets.set(source.uid, reflectedBodyPose(shoulderWorld, sourceToRig,
            bodyReflection, mirror).multiply(oppositeShoulder.invert()));
        }
      }
    }
    beginEditorHistoryGroup();
    started = true;
    for (const entry of forest.entries) {
      const parent = recordByUid(entry.sourceParentUid);
      if (!parent || parent.documentId !== entry.sourceDocumentId)
        throw new Error("The original parent is no longer in its invention.");
      const nodesByUid = new Map(entry.nodes.map((node) => [node.uid, node]));
      const savedRoot = nodesByUid.get(entry.rootUid);
      if (!savedRoot) throw new Error("The selected subtree has no root item.");
      // Imported source payloads belong to the original prefab. Rebuild the
      // switched arm's native item and stuck edge while keeping child edges.
      const rootToAdd = swappedArm?.sourceUid === entry.rootUid
        ? { ...savedRoot, itemID: swappedArm.oppositeID, sourceItem: null, sourceStuck: null, frozenEdge: false }
        : savedRoot;
      addClipboardNode(rootToAdd, nodesByUid, parent,
        entry.sourceDocumentId, created, clonesBySourceUid);
    }
    for (const clone of created) if (isRobotArmItem(clone.itemID))
      poseRobotArm(clone.group, null, clone.itemID, clone.scaleModifier);
    // Parents first: each child pose is solved against its new mirrored parent,
    // including a robot arm's moving @1-@3 frame.
    for (const entry of forest.entries) for (const saved of entry.nodes) {
      const clone = clonesBySourceUid.get(saved.uid);
      const matrix = targets.get(saved.uid);
      if (!clone || !matrix) throw new Error("A mirrored part could not be placed.");
      const position = new THREE.Vector3(), rotation = new THREE.Quaternion(), scale = new THREE.Vector3();
      matrix.decompose(position, rotation, scale);
      applyWorldPoseToRecord(clone, parentOf(clone), position, rotation);
      clone.hierarchyDirty = true;
    }
    const copies = sources.map((record) => clonesBySourceUid.get(record.uid)).filter(Boolean);
    setSelection(copies, copies[0]);
    if (copies.length > 1) {
      const exact = [...state.selectionGroups].reverse().find((group) => group.uids.length === sources.length &&
        sources.every((record) => group.uids.includes(record.uid)));
      const base = (exact ? `${exact.name} mirror` : "Mirror").slice(0, 40).trim();
      let name = base, number = 2;
      while (state.selectionGroups.some((group) => group.name.toLowerCase() === name.toLowerCase()))
        name = `${base.slice(0, 40 - String(number).length - 1).trim()} ${number++}`;
      state.selectionGroups.push({ name, uids: copies.map((record) => record.uid) });
      renderSelectionGroups();
    }
    renderHierarchyTree();
    refreshPreview();
    const sceneEpoch = state.sceneEpoch;
    void Promise.all(created.map((record) => attachModel(record, { reportError: false }))).then(() => {
      if (state.sceneEpoch === sceneEpoch && created.some((record) => state.objects.includes(record)))
        refreshPreview({ recordHistory: false });
    }).catch((error) => setStatus(`Mirrored parts, but a preview model failed: ${error.message || error}`, "bad"));
    setStatus(swappedArm
      ? `Mirrored the complete arm and ${created.length - 1} attached part${created.length === 2 ? "" : "s"} onto the opposite side. The new arm is selected.`
      : `Mirrored ${created.length} part${created.length === 1 ? "" : "s"} across the wearer's centre plane. ` +
        `The copies are selected${copies.length > 1 ? " and grouped" : ""}; choose the opposite arm as Add Parent, then Reparent selected.`, "good");
  } catch (error) {
    if (started) restoreEditorSnapshot(before);
    setStatus(`${swappedArm ? "Mirror complete arm" : "Mirror About Body"}: ${error.message || error}`, "bad");
  } finally {
    if (started) endEditorHistoryGroup();
  }
}

function reparentSelectedToTarget() {
  const roots = selectedTransformRoots();
  const target = parentTargetRecord();
  if (!roots.length || roots.some((record) => record.role === "root") || !target) {
    setStatus("Select child parts and choose their new Add Parent in the Hierarchy.", "bad");
    return;
  }
  try {
    for (const record of roots) {
      if (record.documentId !== target.documentId)
        throw new Error("All selected parts and the new parent must belong to the same invention.");
      if (record.frozenEdge) throw new Error(`${displayName(record)} has a locked verbatim edge and cannot be reparented.`);
      if (subtreeRecords(record).includes(target))
        throw new Error("An item cannot be reparented to itself or one of its descendants.");
      const frame = RULES.subParentFrame(target.itemID, record.subParentID);
      if (!frame || frame.unknown)
        throw new Error(`${displayName(target)} has no editable @${record.subParentID} attachment. ` +
          "Choose a parent with that moving part, or switch this item's Attach to setting to Base first.");
      if (record.subParentID > 0 && isRobotArmItem(target.itemID) && !state.avatarArmPose)
        throw new Error("The wearer arm pose is still loading; try reparenting again in a moment.");
    }
  } catch (error) {
    setStatus(`Reparent selected: ${error.message || error}`, "bad");
    return;
  }
  const moving = roots.filter((record) => parentOf(record) !== target);
  if (!moving.length) return setStatus("All selected parts are already attached to that parent.");
  const before = captureEditorSnapshot();
  beginEditorHistoryGroup();
  try {
    scene.updateMatrixWorld(true);
    for (const record of moving) linkToParent(record, target, true);
    renderHierarchyTree();
    refreshPreview();
    setStatus(`Reparented ${moving.length} selected subtree${moving.length === 1 ? "" : "s"} to ${displayName(target)}. ` +
      "Their current poses and matching @1–@3 moving attachments are kept.", "good");
  } catch (error) {
    restoreEditorSnapshot(before);
    setStatus(`Reparent selected: ${error.message || error}`, "bad");
  } finally {
    endEditorHistoryGroup();
  }
}

// Owner 2026-10-22: move parts into a new invention in this workspace (invention_split.mjs plans it). Every part stays
// where it is drawn; changed parents re-encode their edges from the displayed pose on save, unchanged ones keep theirs.
function splitIntoNewInvention(mode) {
  const what = mode === "branch" ? "New invention from branch" : "New invention from selected parts";
  let plan;
  try {
    plan = planInventionSplit(state.objects.map((record) => ({
      uid: record.uid, parentUid: record.parentUid, documentId: record.documentId, role: record.role, itemID: record.itemID,
      subParentID: record.subParentID, frozenEdge: record.frozenEdge, children: record.children.slice()
    })), {
      mode,
      selectedUids: [...state.selectedUids],
      activeUid: state.selected?.uid ?? null,
      hasFrame: (itemID, sub) => { const frame = RULES.subParentFrame(itemID, sub); return !!frame && !frame.unknown; },
      checkRoot: (itemID) => planItemReplacement(itemID)
    });
    if (!state.avatarArmPose && plan.reparent.some((op) => op.subParentID > 0 && isRobotArmItem(recordByUid(op.parentUid)?.itemID)))
      throw new Error("The wearer arm pose is still loading; try again in a moment.");
  } catch (error) {
    setStatus(`${what}: ${error.message || error}`, "bad");
    return;
  }
  const before = captureEditorSnapshot();
  beginEditorHistoryGroup();
  try {
    scene.updateMatrixWorld(true);
    const made = [];
    for (const split of plan.inventions) {
      const root = recordByUid(split.rootUid);
      const source = documentForRecord(root);
      const document = createDocument({
        name: uniqueInventionName(root.itemID, state.documents.map((doc) => doc.name)),
        filename: `${root.itemID}.json`, dirty: true
      });
      for (const uid of split.memberUids) recordByUid(uid).documentId = document.id;
      // Promote first: a part that moves under the new root may still be its ancestor in the scene graph.
      const oldParent = parentOf(root);
      if (oldParent) oldParent.children = oldParent.children.filter((uid) => uid !== root.uid);
      root.parentUid = null;
      root.role = "root";
      root.frozenEdge = false;
      root.sourceStuck = null;
      root.subParentID = 0;
      scene.attach(root.group);
      root.group.scale.set(1, 1, 1);
      if (source) source.dirty = true;
      made.push({ root, document, laneOffset: workspaceOffsets.get(source?.id) || 0 });
    }
    for (const op of plan.reparent) {
      const record = recordByUid(op.uid);
      record.subParentID = op.subParentID;
      linkToParent(record, recordByUid(op.parentUid), true);
    }
    // A root's saved preview pose excludes its workspace lane; the new invention gets its own lane on the next layout.
    for (const { root, laneOffset } of made) {
      root.group.position.x -= laneOffset;
      root.group.updateMatrixWorld(true);
    }
    setSelection(made.map(({ root }) => root), made[0].root);
    setParentTarget(made[0].root);
    renderHierarchyTree();
    refreshPreview();
    const rehomed = plan.reparent.filter((op) => op.rehomed).length;
    const moved = new Set(plan.inventions.flatMap((split) => split.memberUids));
    const leftBehind = plan.reparent.filter((op) => !moved.has(op.uid)).length;
    const scaledRoots = made.filter(({ root }) => root.scaleModifier !== 0).length;
    const names = made.map(({ document }) => `"${document.name}"`).join(", ");
    setStatus((mode === "branch"
      ? `Made ${made.length} new invention${made.length === 1 ? "" : "s"} (${names}) from the selected branch${made.length === 1 ? "" : "es"}, ` +
        `${moved.size} part${moved.size === 1 ? "" : "s"} in all.`
      : `Moved ${moved.size} selected part${moved.size === 1 ? "" : "s"} into the new invention ${names} with ` +
        `${displayName(made[0].root)} as its root.` +
        (leftBehind ? ` ${leftBehind === 1 ? "1 part left behind now hangs" : `${leftBehind} parts left behind now hang`} from ` +
          "the nearest remaining parent." : "")) +
      (rehomed ? ` ${rehomed === 1 ? "1 part was" : `${rehomed} parts were`} moved to the base of a new parent that lacks ` +
        "the moving sub-part it was on." : "") +
      (scaledRoots ? " A new root keeps its size, and the game stacks a root's size onto its children: see the invention's " +
        "validation warnings." : "") +
      " Every part stays where it is drawn.", "good");
  } catch (error) {
    restoreEditorSnapshot(before);
    setStatus(`${what} failed: ${error.message || error}`, "bad");
  } finally {
    endEditorHistoryGroup();
  }
}

async function deleteSelected() {
  const selected = selectedRecords();
  if (!selected.length) return;
  await saveRecoveryNow("before delete").catch(() => {});
  if (selected.some((record) => !state.objects.includes(record))) return;
  const selectedRoots = selected.filter((record) => record.role === "root");
  if (selectedRoots.length) {
    for (const root of selectedRoots) {
      if (!documentForRecord(root)) continue;
      state.activeDocumentId = root.documentId;
      clearScene({ skipRecovery: true });
    }
    return;
  }
  state.sceneEpoch++;
  const roots = selectedTransformRoots(selected);
  const doomed = new Set();
  for (const record of roots) {
    for (const item of subtreeRecords(record)) doomed.add(item.uid);
  }
  for (const record of roots) {
    const parent = parentOf(record);
    if (parent) parent.children = parent.children.filter((uid) => uid !== record.uid);
    record.group.parent?.remove(record.group);
  }
  state.objects = state.objects.filter((record) => !doomed.has(record.uid));
  pruneSelectionGroups();
  if (doomed.has(state.parentTargetUid)) setParentTarget(rootRecord());
  selectRecord(rootRecord());
}

// ---- JSON out ----
function makeItemJson(record) {
  const item = record.sourceItem ? deepClone(record.sourceItem) : itemTemplate(record.itemID);
  item.itemID = record.itemID;
  item.state = nativeItemState(record.state);
  item.ammo = RULES.clampGunAmmo(record.itemID, record.ammo);
  item.scaleModifier = Math.round(clamp(record.scaleModifier, -128, 127));
  item.colorHue = Math.round(clamp(record.colorHue, 0, 255));
  item.colorSaturation = Math.round(clamp(record.colorSaturation, -128, 127));
  item.jellyStrength = Math.round(clamp(record.jellyStrength, 0, 255));
  item.children = (record.contents || []).map((c) => {
    const copy = deepClone(c);
    RULES.normalizeGameAmmoTree(copy);
    return copy;
  });
  return item;
}

function buildGoopJson(documentId = state.activeDocumentId) {
  const root = documentId === state.activeDocumentId ? rootRecord() : documentRoot(documentId);
  if (!root) return null;
  const data = makeItemJson(root);
  data.stuckChildren = buildStuckChildrenJson(root);
  return data;
}

function captureEditorSnapshot() {
  const objects = state.objects.map((record) => ({
    uid: record.uid,
    documentId: record.documentId,
    role: record.role,
    itemID: record.itemID,
    parentUid: record.parentUid,
    children: record.children.slice(),
    position: record.role === "root"
      ? [record.group.position.x - (workspaceOffsets.get(record.documentId) || 0), record.group.position.y, record.group.position.z]
      : record.group.position.toArray(),
    quaternion: record.group.quaternion.toArray(),
    scaleModifier: record.scaleModifier,
    colorHue: record.colorHue,
    colorSaturation: record.colorSaturation,
    jellyStrength: record.jellyStrength,
    state: record.state,
    ammo: record.ammo,
    subParentID: record.subParentID,
    contents: deepClone(record.contents),
    frozenEdge: record.frozenEdge,
    sourceItem: record.sourceItem ? deepClone(record.sourceItem) : null,
    sourceStuck: record.sourceStuck ? deepClone(record.sourceStuck) : null,
    transformDirty: record.transformDirty,
    hierarchyDirty: record.hierarchyDirty
  }));
  return {
    objects,
    documents: deepClone(state.documents),
    activeDocumentId: state.activeDocumentId,
    nextDocumentId: state.nextDocumentId,
    selectedUids: Array.from(state.selectedUids),
    selectedUid: state.selected?.uid ?? null,
    parentTargetUid: state.parentTargetUid,
    selectionGroups: deepClone(state.selectionGroups),
    nextUid: state.nextUid,
    ghost: exportGhostState()
  };
}

function updateHistoryButtons() {
  if (workshopLive?.active) {
    $("undoBtn").disabled = !workshopLive.canUndo;
    $("redoBtn").disabled = !workshopLive.canRedo;
    return;
  }
  $("undoBtn").disabled = historyRestoring || editorHistory.groupActive || !editorHistory.undo.length;
  $("redoBtn").disabled = historyRestoring || editorHistory.groupActive || !editorHistory.redo.length;
}

function observeEditorHistory() {
  if (historyRestoring) return;
  if (editorHistory.groupActive && editorHistory.groupChanged) {
    historyGroupPending = true;
    return;
  }
  const before = editorHistory.current?.signature;
  const snapshot = captureEditorSnapshot();
  editorHistory.observe(snapshot, editorDocumentSignature({ ...snapshot, activeDocumentId: undefined }));
  updateHistoryButtons();
  if (editorHistory.current?.signature !== before) {
    scheduleFirstRecoveryBackup();
    workshopLive?.localChanged();
  }
}

function beginEditorHistoryGroup() {
  if (!editorHistory.groupActive) historyGroupPending = false;
  editorHistory.beginGroup();
  updateHistoryButtons();
}

function endEditorHistoryGroup() {
  if (historyGroupPending) {
    const before = editorHistory.current?.signature;
    const snapshot = captureEditorSnapshot();
    editorHistory.observe(snapshot, editorDocumentSignature({ ...snapshot, activeDocumentId: undefined }));
    if (editorHistory.current?.signature !== before) scheduleFirstRecoveryBackup();
    historyGroupPending = false;
  }
  editorHistory.endGroup();
  updateHistoryButtons();
  if (!editorHistory.groupActive) workshopLive?.localChanged();
  if (!editorHistory.groupActive && recovery.pendingAfterGroup) {
    recovery.pendingAfterGroup = false;
    void saveRecoveryNow("automatic").catch(() => {});
  }
}

function restoreEditorSnapshot(snapshot) {
  historyRestoring = true;
  updateHistoryButtons();
  try {
    clearAllScene();
    state.documents = deepClone(snapshot.documents || []);
    state.activeDocumentId = snapshot.activeDocumentId ?? state.documents[0]?.id ?? null;
    state.nextDocumentId = snapshot.nextDocumentId || 1;
    const byUid = new Map();
    for (const saved of snapshot.objects) {
      const record = makeObjectRecord(saved.itemID, saved.role);
      for (const field of ["uid", "documentId", "role", "itemID", "parentUid", "scaleModifier", "colorHue",
        "colorSaturation", "jellyStrength", "state", "ammo", "subParentID", "frozenEdge",
        "transformDirty", "hierarchyDirty"]) record[field] = saved[field];
      record.children = saved.children.slice();
      record.contents = deepClone(saved.contents);
      record.sourceItem = saved.sourceItem ? deepClone(saved.sourceItem) : null;
      record.sourceStuck = saved.sourceStuck ? deepClone(saved.sourceStuck) : null;
      record.group.name = saved.itemID;
      record.group.userData.uid = saved.uid;
      record.group.position.fromArray(saved.position);
      record.group.quaternion.fromArray(saved.quaternion);
      state.objects.push(record);
      byUid.set(record.uid, record);
    }
    for (const record of state.objects) {
      const parent = byUid.get(record.parentUid);
      (parent ? childContainer(record) : scene).add(record.group);
      void attachModel(record);
    }
    state.nextUid = snapshot.nextUid;
    state.selectedUids = new Set(snapshot.selectedUids.filter((uid) => byUid.has(uid)));
    state.selected = byUid.get(snapshot.selectedUid) || null;
    state.parentTargetUid = byUid.has(snapshot.parentTargetUid) && byUid.get(snapshot.parentTargetUid).documentId === state.activeDocumentId
      ? snapshot.parentTargetUid : rootRecord()?.uid ?? null;
    state.selectionGroups = deepClone(snapshot.selectionGroups);
    attachTransformToSelection();
    syncParentTargetUi();
    syncInspectorFromSelection();
    renderHierarchyTree();
    renderSelectionList();
    renderSelectionGroups();
    refreshPreview();
    if (snapshot.ghost) {
      // Undo/redo and backup restore bring back the ghost pose and preview settings too.
      void applyGhostState(snapshot.ghost).catch((error) => setStatus(`Ghost restore failed: ${error.message || error}`, "bad"));
    }
  } finally {
    historyRestoring = false;
    updateHistoryButtons();
  }
}

function stepEditorHistory(direction) {
  // An unfinished pointer or keyboard gesture must finish before it can be
  // undone. Otherwise its delayed pointerup could write over the restored state.
  if (historyRestoring || editorHistory.groupActive) return;
  if (workshopLive?.active) {
    const sent = direction === "undo" ? workshopLive.undo() : workshopLive.redo();
    if (sent) setStatus(`${direction === "undo" ? "Undo" : "Redo"} sent to live workspace.`, "good");
    return;
  }
  const snapshot = editorHistory.step(direction);
  if (!snapshot) return;
  restoreEditorSnapshot(snapshot);
  setStatus(direction === "undo" ? "Undid the last editor change." : "Redid the editor change.", "good");
}

function buildStuckChildrenJson(parent) {
  return parent.children
    .map((uid) => recordByUid(uid))
    .filter(Boolean)
    .map((record) => {
      const item = makeItemJson(record);
      item.stuckChildren = buildStuckChildrenJson(record);
      const preserved = record.sourceStuck && (record.frozenEdge || (!record.transformDirty && !record.hierarchyDirty));
      if (preserved) {
        const s = record.sourceStuck;
        return { ...deepClone(s), item }; // untouched capture edges retain their exact numbers and extra fields
      }
      // Re-encode from the DISPLAYED pose (editor metres in the parent's unscaled frame; on a VIEW_SCALE_MISMATCH_PARENTS
      // prefab that is where the game draws the part, so the position is divided by its ratio first: drawnPoseToEdge):
      //   anchor = display + R(display) * posePos * childScale ;  anchorRot = displayRot * poseRot
      //   edge   = parentLocalToEdge(anchor, anchorRot, parent id, parent scale, subParentID)   (goop_rules)
      const sourcePose = record.sourceStuck || null;
      const posePosG = sourcePose ? RULES.vec3(sourcePose.posePos) : [0, 0, 0];
      const poseRotG = sourcePose ? RULES.quat(sourcePose.poseRot) : RULES.IDENTITY_QUAT.slice();
      const dispPosG = editorVecToGameArr(record.group.position);
      const dispRotG = editorQuatToGameArr(record.group.quaternion);
      let sub = Math.round(Number(record.subParentID) || 0);
      let edge = RULES.drawnPoseToEdge(dispPosG, dispRotG, parent.itemID, parent.scaleModifier,
        sub, record.itemID, record.scaleModifier, posePosG, poseRotG);
      if (!edge) {
        // the parent has no usable frame with that id: author on the base rather than emit a silently re-homed edge
        sub = 0;
        edge = RULES.drawnPoseToEdge(dispPosG, dispRotG, parent.itemID, parent.scaleModifier,
          0, record.itemID, record.scaleModifier, posePosG, poseRotG);
      }
      return {
        ...(sourcePose ? deepClone(sourcePose) : {}),
        item,
        subParentID: sub,
        pos: RULES.roundArr(edge.pos),
        rot: RULES.roundArr(edge.rot),
        posePos: RULES.roundArr(posePosG),
        poseRot: RULES.roundArr(poseRotG),
        wasDynamicStuck: sourcePose ? !!sourcePose.wasDynamicStuck : false
      };
    });
}

function refreshPreview({ recordHistory = true } = {}) {
  for (const document of state.documents) {
    syncDocumentPreviewFromRoot(document);
    const rootJson = buildGoopJson(document.id);
    document.worth = rootJson ? inventionValue(rootJson) : null;   // its total value (the tab and the Output panel show it)
    if (rootJson && document.savedSignature !== null) {
      document.dirty = document.dirty || JSON.stringify(rootJson) !== document.savedSignature;
    }
    if (document.savedMetaSignature !== null) {
      document.dirty = document.dirty || documentMetadataSignature(document) !== document.savedMetaSignature;
    }
  }
  const data = buildGoopJson();
  const depth = maxDepth(rootRecord());
  const records = documentRecords();
  const contentsCount = records.reduce((n, r) => n + (r.contents ? r.contents.length : 0), 0);
  $("sceneStats").textContent = data
    ? `${records.length} items, ${Math.max(0, records.length - 1)} stuck children, depth ${depth}${contentsCount ? `, ${contentsCount} inside containers` : ""} · ${state.documents.length} inventions in workspace`
    : "0 items";
  const worth = state.documents.find((document) => document.id === state.activeDocumentId)?.worth;
  $("valueStats").textContent = data && worth ? `Total value ${formatMoney(worth.total)}` +
    (worth.unknown ? ` (${worth.unknown} newer item${worth.unknown === 1 ? " has" : "s have"} no known value yet)` : "") : "";
  $("jsonPreview").textContent = data ? JSON.stringify(data, null, 2).slice(0, 6500) : "";
  renderValidation(data);
  updateGhostPreview();
  $("overlapArmBtn").disabled = !canOverlapArm(state.selected);
  $("mirrorCompleteArmBtn").disabled = !canMirrorCompleteArm(state.selected);
  $("addArmPairBtn").disabled = !canAddOverlappingArmPair();
  renderDocumentList();
  if (recordHistory) observeEditorHistory();
}

function selectedSubtreeNodeCount(record) {
  const item = makeItemJson(record);
  item.stuckChildren = buildStuckChildrenJson(record);
  let count = 0;
  RULES.forEachNode(item, () => { count++; });
  return count;
}

async function makeRingCopies() {
  const message = $("arrayMessage");
  const button = $("arrayBuildBtn");
  if (button.disabled) return;
  const sources = selectedTransformRoots().filter((record) => record.role !== "root");
  if (!sources.length) {
    message.textContent = "Select one or more child items first. The invention root cannot be duplicated.";
    return;
  }
  if (sources.some((record) => record.frozenEdge)) {
    message.textContent = "A selected edge is kept verbatim and cannot be moved into a ring.";
    return;
  }
  let rings;
  try {
    rings = generateRingCopies({ count: Number($("arrayCount").value),
      radius: Number($("arrayRadius").value), plane: $("arrayPlane").value });
    for (const id of new Set(sources.map((record) => record.documentId))) {
      const existing = RULES.validateInvention(buildGoopJson(id)).stats.nodes - 1;
      const motifNodes = sources.filter((record) => record.documentId === id)
        .reduce((count, record) => count + selectedSubtreeNodeCount(record), 0);
      const total = existing + rings.length * motifNodes;
      if (total > RULES.STASH_MAX_DESCENDANTS) {
        const name = state.documents.find((document) => document.id === id)?.name || id;
        throw new Error(`${name} would have ${total} descendants (maximum ${RULES.STASH_MAX_DESCENDANTS}, including contents).`);
      }
    }
  } catch (err) {
    message.textContent = String(err.message || err);
    return;
  }

  button.disabled = true;
  beginEditorHistoryGroup();
  const sceneEpoch = state.sceneEpoch;
  const preexisting = new Set(state.objects);
  try {
    scene.updateMatrixWorld(true);
    const snapshots = sources.map((record) => {
      const worldPos = new THREE.Vector3();
      const worldQuat = new THREE.Quaternion();
      record.group.getWorldPosition(worldPos);
      record.group.getWorldQuaternion(worldQuat);
      return { record, parent: parentOf(record), worldPos, worldQuat };
    });
    const anchor = snapshots.reduce((sum, source) => sum.add(source.worldPos),
      new THREE.Vector3()).multiplyScalar(1 / snapshots.length);
    const rotateCopies = $("arrayRotateCopies").checked;
    const copies = [];
    for (const [ringIndex, ring] of rings.entries()) {
      const spin = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(...ring.axis), ring.angle);
      const offset = new THREE.Vector3(...ring.offset);
      for (const source of snapshots) {
        const clone = await cloneSubtree(source.record, source.parent, sceneEpoch);
        const relative = source.worldPos.clone().sub(anchor);
        if (rotateCopies) relative.applyQuaternion(spin);
        const destination = anchor.clone().add(offset).add(relative);
        const facing = rotateCopies ? spin.clone().multiply(source.worldQuat) : source.worldQuat;
        applyWorldPoseToRecord(clone, source.parent, destination, facing);
        copies.push(clone);
      }
      if (ringIndex % 4 === 3) {
        message.textContent = `Placing ring position ${ringIndex + 2} / ${rings.length + 1}…`;
        await new Promise(requestAnimationFrame);
        if (state.sceneEpoch !== sceneEpoch) throw new Error("The invention changed while the ring was building.");
      }
    }
    setSelection(copies, copies[0] || null);
    $("arrayDialog").close();
    setStatus(`Added ${copies.length} item/subtree copies in a ${rings.length + 1}-position ring.`, "good");
  } catch (err) {
    // A failed model load must not leave a partially copied invention behind.
    for (const record of state.sceneEpoch === sceneEpoch ? state.objects.filter((item) => !preexisting.has(item)) : []) {
      const parent = parentOf(record);
      if (parent) parent.children = parent.children.filter((uid) => uid !== record.uid);
      record.group.parent?.remove(record.group);
    }
    if (state.sceneEpoch === sceneEpoch) {
      state.objects = state.objects.filter((record) => preexisting.has(record));
      renderHierarchyTree();
      refreshPreview();
    }
    message.textContent = String(err.message || err);
    setStatus(`Ring copies: ${message.textContent}`, "bad");
  } finally {
    button.disabled = false;
    endEditorHistoryGroup();
  }
}

function maxDepth(root) {
  if (!root) return 0;
  let depth = 0;
  function walk(record, d) {
    depth = Math.max(depth, d);
    for (const uid of record.children) {
      const child = recordByUid(uid);
      if (child) walk(child, d + 1);
    }
  }
  walk(root, 1);
  return depth;
}

// Lag machines (owner 2026-10-23): the screen the delivery Worker and the Workshop run, shown while building. An error
// here blocks Send and Workshop saving like any other validation error; the server refuses the same builds anyway.
// Owner 2026-10-24: more than 32 loose clovers, backpacks, flashlights or bubble guns is a lag design too, and only
// verified Discord moderators may save one on the Workshop, even privately.
// LAG DESIGNS (owner 2026-10-23, 2026-10-26): the shared goop build validator decides, exactly as the Workshop and the
// delivery Workers do (point "editor"); this panel words its findings with advice. Verified Discord moderators send and
// save builds as made, so for them the findings are notes, not blocks.
function lagDesignAdvice(text) {
  if (/overlap/.test(text)) return "Spread the parts apart.";
  if (/explosive/.test(text)) return `Use fewer than ${BUILD_POLICY.explosives.refuse}.`;
  const cap = /more than (\d+)/.exec(text);
  if (cap) return `Use ${cap[1]} or fewer.`;
  return /fps|host stall|copies measured|launchers/.test(text) ? "Use fewer parts, or fewer of the heavy items." : "";
}
// The build validator's live security level (owner 2026-10-27, the owner's switch on the Workshop accounts page): the panel
// previews what deliveries would refuse at it. Prime and Fab serve it at ./api/build-security; elsewhere the policy's applies.
let buildSecurityLevel;
async function refreshBuildSecurity() {
  try {
    const response = await fetch("./api/build-security", { cache: "no-store" });
    const level = response.ok ? (await response.json())?.data?.level : undefined;
    if (level && level in BUILD_POLICY.securityLevels && level !== buildSecurityLevel) {
      buildSecurityLevel = level;
      renderValidation(buildGoopJson());
    }
  } catch { /* keep the policy's level */ }
}
function addLagDesignFindings(v, data) {
  const verdict = VALIDATOR.validateBuild({ inventions: [data], point: "editor",
    requester: { moderator: Boolean(workshopIdentity?.isModerator) }, ...(buildSecurityLevel ? { securityLevel: buildSecurityLevel } : {}) });
  for (const { rule, text } of verdict.reasons) {
    const finding = text[0].toUpperCase() + text.slice(1);
    if (verdict.bypassed) v.warnings.push(`${finding}: allowed because you are a verified moderator.`);
    // The content rule (owner 2026-10-28): slurs, hate symbols and terms, sexual or crude words, curse words.
    else if (rule === "contentText") v.errors.push(`${finding}. Builds with slurs, hate symbols, sexual words or curse words ` +
      "can't be shared on the Workshop or delivered. Change the wording.");
    else v.errors.push(`${finding}. Builds like this lag or freeze other players, so deliveries refuse them and the Workshop will ` +
      `not save them, even privately. ${lagDesignAdvice(text)}`.trim());
  }
  // The lag census estimate (owner 2026-10-27): its review-level findings are warnings; switched off, it is a preview.
  // The security level (safe / medium, owner 2026-10-27) limits deliveries, not saves: the editor shows what they refuse.
  for (const { rule, text } of verdict.warnings) {
    if (rule === "lagScore") v.warnings.push(`Lag estimate: ${text} while it is used. ${lagDesignAdvice(text)}`.trim());
    else if (rule.startsWith("vanilla")) v.warnings.push(`Deliveries are in ${verdict.securityLevel} mode and would refuse this: ${text}.`);
  }
  const lag = verdict.assessment.lag;
  if (lag && !lag.enforced && lag.verdict !== "ok") {
    v.warnings.push(`Lag estimate (a preview; not enforced yet): ${lag.reasons.slice(0, 3).join("; ")}. ` +
      "Fewer parts in use, or fewer of the heavy items, lag less.");
  }
  const explosives = verdict.assessment.documents?.[0]?.explosives ?? 0;
  const cap = BUILD_POLICY.deliveryItemCaps.explosives;
  if (explosives > cap && verdict.bypass) v.warnings.push(`${explosives} explosives: delivered as made because you are a verified moderator.`);
  else if (explosives > cap && explosives < BUILD_POLICY.explosives.refuse) {
    v.warnings.push(`${explosives} explosives: a delivery keeps the first ${cap} and leaves the rest out.`);
  }
}

// ---- validation panel ----
function renderValidation(data) {
  const summary = $("validationSummary");
  const list = $("validationList");
  if (!summary || !list) return;
  list.textContent = "";
  if (!data) { summary.textContent = "No invention loaded"; state.lastValidation = null; return; }
  const v = RULES.validateInvention(data, { knownIds: state.knownIds, bannedIds: state.bannedIds });
  addLagDesignFindings(v, data);
  state.lastValidation = v;
  const st = v.stats;
  summary.textContent = `${v.errors.length} error(s), ${v.warnings.length} warning(s) -- ${st.nodes} nodes, ${st.stuckDescendants} stuck, max ${st.maxImmediate} immediate, stuck depth ${st.maxStuckDepth}, guns ${st.guns}${st.emptyGuns ? ` (${st.emptyGuns} EMPTY)` : ""}`;
  const crossbowRows = crossbowValidationRows(state.activeDocumentId);
  const film = FILM.filmNotes(data);
  const rows = v.errors.map((t) => ["err", t]).concat(v.warnings.map((t) => ["warn", t]), crossbowRows,
    film.warnings.map((t) => ["warn", t])).concat(v.infos.map((t) => ["info", t]), film.infos.map((t) => ["info", t]));
  if (crossbowRows.length) summary.textContent += ` · ${crossbowRows.length} crossbow note(s)`;
  if (!rows.length) {
    const ok = document.createElement("div");
    ok.className = "validationRow info";
    ok.textContent = "Clean: every id is known, no gun spawns empty, all caps respected.";
    list.appendChild(ok);
  }
  for (const [kind, text] of rows) {
    const row = document.createElement("div");
    row.className = "validationRow " + kind;
    row.textContent = (kind === "err" ? "ERROR: " : kind === "warn" ? "WARNING: " : "note: ") + text;
    list.appendChild(row);
  }
}

// ---- inspector ----
function frameOptionsForRecord(record) {
  const parent = parentOf(record);
  if (!parent) return [];
  return RULES.subParentFramesFor(parent.itemID);
}

function syncSafeZoneTimerControls(record, selectionCount) {
  const controls = $("safeZoneTimerControls");
  if (!controls) return;
  const isSafeZone = !!record && selectionCount === 1 && stateCapability(record.itemID)?.encoding === "float32Timer";
  controls.hidden = !isSafeZone;
  if (!isSafeZone) {
    state.safeZoneTimerSelectionUid = null;
    state.safeZoneTimerMode = null;
    return;
  }
  const seconds = stateBitsToFloat32Seconds(record.state);
  if (state.safeZoneTimerSelectionUid !== record.uid ||
      (state.safeZoneTimerMode === "infinity" && seconds !== Infinity) ||
      (state.safeZoneTimerMode === "seconds" && (!Number.isFinite(seconds) || seconds < 0 || Object.is(seconds, -0)))) {
    state.safeZoneTimerSelectionUid = record.uid;
    state.safeZoneTimerMode = seconds === Infinity ? "infinity"
      : Number.isFinite(seconds) && seconds >= 0 && !Object.is(seconds, -0) ? "seconds" : "raw";
  }
  $("safeZoneTimerMode").value = state.safeZoneTimerMode;
  $("safeZoneSeconds").disabled = state.safeZoneTimerMode !== "seconds";
  $("rawStateInput").disabled = state.safeZoneTimerMode !== "raw";
  if (document.activeElement !== $("safeZoneSeconds"))
    $("safeZoneSeconds").value = Number.isFinite(seconds) && seconds >= 0 && !Object.is(seconds, -0)
      ? String(seconds) : "";
}

function applySafeZoneTimerControl(event) {
  const record = state.selected;
  if (!record || selectedRecords().length !== 1 || stateCapability(record.itemID)?.encoding !== "float32Timer") return;
  const mode = $("safeZoneTimerMode").value;
  state.safeZoneTimerSelectionUid = record.uid;
  state.safeZoneTimerMode = mode;
  if (mode === "raw") {
    syncInspectorFromSelection();
    return;
  }
  let nextState;
  if (mode === "infinity") {
    nextState = float32SecondsToStateBits(Infinity);
  } else {
    const input = $("safeZoneSeconds");
    const raw = input.value.trim() || (event.target.id === "safeZoneTimerMode" ? "0" : "");
    if (!/^\+?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i.test(raw)) {
      setStatus("Enter a finite, nonnegative timer in seconds, or choose Infinity or Raw integer.", "bad");
      return;
    }
    const seconds = Number(raw);
    if (!Number.isFinite(seconds) || seconds < 0) {
      setStatus("Timer seconds must be finite and nonnegative; use Infinity mode for an infinite timer.", "bad");
      return;
    }
    nextState = float32SecondsToStateBits(seconds);
    if (!Number.isFinite(stateBitsToFloat32Seconds(nextState))) {
      setStatus("That many seconds overflows the game's Float32 timer; choose a smaller finite value.", "bad");
      return;
    }
  }
  record.state = nativeItemState(nextState);
  syncInspectorFromSelection();
  renderHierarchyTree();
  refreshPreview();
}

function syncStateSemanticControls(record, selectionCount) {
  const capability = record && selectionCount === 1 ? stateCapability(record.itemID) : null;
  const semantics = $("stateSemanticsNote");
  semantics.hidden = !capability;
  if (capability) {
    const fallback = capability.kind === "binary" ? "Use the on/off toggle above."
      : capability.encoding === "revolverChambers" ? "The low six state bits represent loaded chambers."
      : capability.encoding === "drawnCardMask" ? "The low six state bits represent drawn deck entries."
      : capability.encoding === "shreddedValue" ? "Shredded-value progress is a whole number from 0 to 8000."
      : "Keep the raw integer unless you know the exact game-specific encoding.";
    semantics.textContent = `${capability.component}: ${capability.note || fallback} Source: current-build static analysis; live stash and network behavior may need verification.`;
  } else {
    semantics.textContent = "";
  }

  const bitmaskControls = $("stateBitmaskControls");
  const hasBitmask = capability?.kind === "bitmask" &&
    ["revolverChambers", "drawnCardMask"].includes(capability.encoding);
  bitmaskControls.hidden = !hasBitmask;
  if (hasBitmask) {
    const isDeck = capability.encoding === "drawnCardMask";
    $("stateBitmaskLegend").textContent = isDeck ? "Deck drawn entries" : "Revolver chambers";
    $("stateBitmaskNote").textContent = isDeck
      ? "Checked means this draw entry has already been used. The raw integer above preserves all other bits."
      : "Checked means this chamber is loaded. The raw integer above preserves all other bits.";
    const slots = $("stateBitmaskSlots");
    slots.classList.toggle("deckEntries", isDeck);
    slots.replaceChildren();
    for (let index = 0; index < capability.bits; index++) {
      const label = document.createElement("label");
      const checkbox = document.createElement("input");
      checkbox.type = "checkbox";
      checkbox.dataset.stateBit = String(index);
      checkbox.checked = isStateBitSet(record.state, index);
      label.append(checkbox, isDeck
        ? `Entry ${index + 1}: ${capability.labels?.[index] || "draw"}`
        : `Chamber ${index + 1}`);
      slots.appendChild(label);
    }
  }

  const progressControls = $("stateProgressControls");
  const hasProgress = capability?.kind === "integer" && capability.encoding === "shreddedValue";
  progressControls.hidden = !hasProgress;
  if (hasProgress && document.activeElement !== $("stateProgressValue")) {
    $("stateProgressValue").value = String(record.state);
  }
}

function applyStateBitmaskControl(event) {
  const input = event.target.closest('input[data-state-bit]');
  const record = state.selected;
  if (!input || !record || selectedRecords().length !== 1) return;
  const capability = stateCapability(record.itemID);
  if (capability?.kind !== "bitmask" ||
      !["revolverChambers", "drawnCardMask"].includes(capability.encoding)) return;
  const index = Number(input.dataset.stateBit);
  if (!Number.isInteger(index) || index < 0 || index >= capability.bits) return;
  record.state = setStateBit(record.state, index, input.checked);
  syncInspectorFromSelection();
  renderHierarchyTree();
  refreshPreview();
}

function applyStateProgressControl() {
  const record = state.selected;
  if (!record || selectedRecords().length !== 1) return;
  const capability = stateCapability(record.itemID);
  if (capability?.kind !== "integer" || capability.encoding !== "shreddedValue") return;
  try {
    record.state = nativeItemState(parseShredderProgress($("stateProgressValue").value));
  } catch (error) {
    setStatus(error.message, "bad");
    $("stateProgressValue").value = String(record.state);
    return;
  }
  syncInspectorFromSelection();
  renderHierarchyTree();
  refreshPreview();
}

function syncRootGrenadeControls(record, selectionCount) {
  const host = $("rootGrenadeControls");
  if (!host) return;
  host.replaceChildren();
  const capability = record && selectionCount === 1 ? stateCapability(record.itemID) : null;
  host.hidden = !["pinPauseFuse", "sessionBound"].includes(capability?.encoding);
  if (host.hidden) return;
  const legend = document.createElement("legend");
  legend.textContent = capability.encoding === "sessionBound" ? "Telegrenade target and timer" : "Hand explosive pin and fuse";
  host.appendChild(legend);
  if (capability.encoding === "pinPauseFuse") {
    const data = decodeHandExplosive(record.state, record.ammo);
    addContentControl(host, "Pin pulled (armed)", "handPin", data.pinPulled, { checkbox: true });
    addContentControl(host, "Fuse paused", "handPaused", data.paused, { checkbox: true });
    addContentControl(host, "Remaining fuse ticks", "handFuse", Math.max(0, data.fuseTicks),
      { min: 0, max: 2147483647, step: 1 });
    contentControlNote(host, "The game does not save a player target for this grenade family. Damage attribution comes from the live holder/last holder.");
  } else {
    const data = decodeTeleGrenade(record.state, record.ammo);
    addContentControl(host, "Pin pulled (armed)", "telePin", data.pinPulled, { checkbox: true });
    addContentControl(host, "Remaining fuse ticks (0–255)", "teleTicks", data.remainingTicks,
      { min: 0, max: 255, step: 1 });
    addContentControl(host, "Room-name hash (low 16 bits)", "teleSessionTag", data.sessionTag,
      { min: 0, max: 65535, step: 1 });
    addContentControl(host, "Target NetPlayer.objectID (unsigned 32-bit)", "teleTarget", data.sourcePlayerObjectId,
      { type: "text" });
    contentControlNote(host, "The game restores the target only when the saved room-name hash matches the current room. NetPlayer.objectID is assigned when a network object spawns, not from an account ID, and may belong to someone else after a room restart. Scan an item in the current session or load an activated telegrenade to inspect its hash and target.");
  }
}

function applyRootGrenadeChange(event) {
  const record = state.selected;
  const capability = record && selectedRecords().length === 1 ? stateCapability(record.itemID) : null;
  const action = event.target.dataset.contentAction;
  if (!record || !action || !["pinPauseFuse", "sessionBound"].includes(capability?.encoding)) return;
  try {
    let nextState = nativeItemState(record.state);
    if (action === "handPin" && capability.encoding === "pinPauseFuse")
      nextState = setHandExplosivePin(nextState, event.target.checked);
    else if (action === "handPaused" && capability.encoding === "pinPauseFuse")
      nextState = setHandExplosivePaused(nextState, event.target.checked);
    else if (action === "handFuse" && capability.encoding === "pinPauseFuse")
      record.ammo = parseGrenadeFuseTicks(event.target.value);
    else if (action === "telePin" && capability.encoding === "sessionBound")
      nextState = setTeleGrenadePin(nextState, event.target.checked);
    else if (action === "teleTicks" && capability.encoding === "sessionBound")
      nextState = setTeleGrenadeTicks(nextState, event.target.value);
    else if (action === "teleSessionTag" && capability.encoding === "sessionBound")
      nextState = setTeleGrenadeSessionTag(nextState, event.target.value);
    else if (action === "teleTarget" && capability.encoding === "sessionBound")
      record.ammo = objectIdToSignedAmmo(event.target.value);
    else return;
    record.state = nextState;
  } catch (error) {
    setStatus(`Grenade: ${error.message || error}`, "bad");
    syncInspectorFromSelection();
    return;
  }
  syncInspectorFromSelection();
  refreshPreview();
}

function syncInspectorFromSelection() {
  const r = state.selected;
  const has = !!r;
  const records = selectedRecords();
  const count = records.length;
  const scaleLocked = count > 1 && records.some((record) => record.frozenEdge);
  const scaledRoot = records.some((record) => record.role === "root" && record.scaleModifier !== 0);
  $("selectionName").textContent = r ? `${r.role.toUpperCase()} ${displayName(r)}${count > 1 ? ` (+${count - 1})` : ""}` : "None";
  $("selectionParent").textContent = r ? (parentOf(r) ? displayName(parentOf(r)) : "None") : "None";
  for (const id of ["selectedItemId", "posX", "posY", "posZ", "rotX", "rotY", "rotZ", "rotQX", "rotQY", "rotQZ", "rotQW", "scaleModifier", "colorHue", "colorHueNumber", "colorSaturation", "colorSaturationNumber", "jellyStrength", "jellyStrengthNumber", "ammo", "loadedToggle", "activatedToggle", "rawStateInput", "subParentSelect", "snapToTipBtn", "snapToBaseBtn", "overlapArmBtn", "mirrorCompleteArmBtn", "clearContentsBtn", "randomizeContentColorsBtn", "randomizeContentSizes"]) {
    $(id).disabled = !has;
  }
  const onlyRoots = records.every((record) => record.role === "root");
  $("splitPartsBtn").disabled = !has || onlyRoots;
  $("splitBranchBtn").disabled = !has || onlyRoots;
  $("duplicatePartsBtn").disabled = !has;
  if (document.activeElement !== $("rawStateInput")) $("rawStateInput").value = has ? String(r.state) : "";
  const allActivatable = has && records.every((record) => !!activationCapability(record.itemID));
  const activated = $("activatedToggle");
  activated.disabled = !allActivatable;
  activated.checked = !!r && binaryItemIsActive(r); /* current game build */
  activated.indeterminate = !!allActivatable && new Set(records.map((r) => binaryItemIsActive(r))).size > 1;
  const capability = r && activationCapability(r.itemID);
  $("activationNote").textContent = !r ? "Select an item to set its starting activation phase."
    : !allActivatable ? (count > 1
      ? "Select only supported toggleable items to change their starting phase together; other item states are preserved."
      : stateCapability(r.itemID)
        ? "This item does not have a verified universal on/off state. Use its specific control below where available."
        : `This item's game-specific state (${r.state}) is preserved. Its activation behavior is not verified for editing here.`)
    : count > 1 ? `Sets the starting phase of all ${count} selected items; mixed phases show a dash. Each item keeps its own state in JSON.`
    : `${capability.offLabel || "Inactive"} = state 0; ${capability.onLabel || "Activated"} = state 1. This sets the item's starting phase in the saved JSON.`;
  syncSafeZoneTimerControls(r, count);
  syncStateSemanticControls(r, count);
  syncRootGrenadeControls(r, count);
  $("scaleModifier").disabled = !has || scaleLocked;
  $("scaleModifierNumber").disabled = !has || scaleLocked;
  $("scaleDownBtn").disabled = !has || scaleLocked || r.scaleModifier <= -128;
  $("scaleUpBtn").disabled = !has || scaleLocked || r.scaleModifier >= 127;
  const canAddJoystickLink = !!r && ["item_joystick", "item_joystick_inv_y"].includes(r.itemID) && !r.frozenEdge;
  $("joystickLinkType").disabled = !canAddJoystickLink;
  $("addJoystickLinkBtn").disabled = !canAddJoystickLink;
  syncBridgeControls();
  syncFilmPanel(r, count);
  $("poseSelectionNote").hidden = count <= 1;
  if (count > 1) $("poseSelectionNote").textContent = `X/Y/Z and rotation show the active item relative to its parent. A typed change moves or turns all ${count} selected items together, like the Move and Rotate handles; a group turns around its centre and a selected parent carries its children. Locked verbatim edges stay put.`;
  if (!r) {
    $("rootPoseNote").hidden = true;
    $("selectedItemId").value = "";
    for (const id of ["posX", "posY", "posZ", "rotX", "rotY", "rotZ", "rotQX", "rotQY", "rotQZ", "rotQW", "ammo"]) {
      $(id).value = "";
      if (isInspectorPoseField(id)) delete $(id).dataset.displayedValue;
    }
    $("scaleValue").textContent = "0";
    $("scaleModifierNumber").value = "";
    $("hueValue").textContent = "0";
    $("satValue").textContent = "0";
    $("jellyValue").textContent = "0";
    for (const id of ["colorHue", "colorHueNumber", "colorSaturation", "colorSaturationNumber", "jellyStrength", "jellyStrengthNumber"]) $(id).value = "0";
    $("colorSelectionNote").hidden = true;
    $("loadedToggle").checked = false;
    $("subParentSelect").textContent = "";
    $("subParentNote").textContent = "";
    $("scaleNote").textContent = "";
    $("ammoNote").textContent = "";
    renderContentsPanel(null);
    renderColorPicker();
    return;
  }
  $("selectedItemId").value = r.itemID;
  $("overlapArmBtn").disabled = !canOverlapArm(r);
  $("mirrorCompleteArmBtn").disabled = !canMirrorCompleteArm(r);
  // A formatted field is only a view of the precise loaded pose. Keep its
  // displayed baseline so typing the same number cannot quantize that pose.
  for (const [id, value] of [["posX", r.group.position.x], ["posY", r.group.position.y],
    ["posZ", r.group.position.z]]) {
    $(id).value = String(Number(value.toPrecision(12)));
    $(id).dataset.displayedValue = $(id).value;
  }
  const e = new THREE.Euler().setFromQuaternion(r.group.quaternion, "XYZ");
  for (const [id, value] of [["rotX", e.x], ["rotY", e.y], ["rotZ", e.z]]) {
    $(id).value = String(Number(toDisplayAngle(value, state.angleUnit).toPrecision(12)));
    $(id).dataset.displayedValue = $(id).value;
  }
  const q = r.group.quaternion;
  for (const [id, value] of [["rotQX", q.x], ["rotQY", q.y], ["rotQZ", q.z], ["rotQW", q.w]]) {
    $(id).value = formatQuaternionComponent(value);
    $(id).dataset.displayedValue = $(id).value;
  }
  $("rootPoseNote").hidden = r.role !== "root";
  $("scaleModifier").value = r.scaleModifier;
  $("scaleModifierNumber").value = r.scaleModifier;
  $("colorHue").value = r.colorHue;
  $("colorHueNumber").value = r.colorHue;
  $("colorSaturation").value = r.colorSaturation;
  $("colorSaturationNumber").value = r.colorSaturation;
  $("jellyStrength").value = r.jellyStrength;
  $("jellyStrengthNumber").value = r.jellyStrength;
  $("scaleValue").textContent = String(r.scaleModifier);
  $("hueValue").textContent = String(r.colorHue);
  $("satValue").textContent = String(r.colorSaturation);
  $("jellyValue").textContent = String(r.jellyStrength);
  $("colorSelectionNote").hidden = count <= 1;
  if (count > 1) $("colorSelectionNote").textContent = `Hue, saturation, and jelly changes apply to all ${count} selected items. The controls show the active item's current values.`;
  const phys = scaleModifierToScalar(r.scaleModifier, r.itemID);
  const range = RULES.scaleRangeFor(r.itemID);
  $("scaleNote").textContent = (scaleLocked
    ? "Group scale is unavailable while a verbatim locked edge is selected. Remove it from the selection. "
    : count > 1 ? `Resizes all ${count} selected items and their spacing together, up to each prefab's size limit. ` : "") +
    `${phys.toFixed(2)}x physical for active item (this prefab: ${range.min}x .. ${range.max}x)` +
    (scaledRoot ? " -- root scale stacks onto children for the spawner; prefer 0" : "") +
    (r.children.length && r.scaleModifier !== 0 ? " -- children's pos are re-encoded as metres / this scale" : "");
  // ammo
  const holder = RULES.containerRule(r.itemID)?.kind === "holder";
  $("ammo").value = Math.round(Number(r.ammo) || 0);
  $("ammo").min = stateCapability(r.itemID)?.encoding === "sessionBound" ? "-2147483648" : "0";
  const gunAmmoCap = RULES.gunAmmoCapability(r.itemID);
  $("ammo").max = gunAmmoCap?.max != null ? String(gunAmmoCap.max) : "";
  $("ammo").disabled = holder;
  $("loadedToggle").disabled = holder || !RULES.isGun(r.itemID);
  $("loadedToggle").checked = holder ? (r.contents || []).length > 0 : Number(r.ammo) > 0;
  $("ammoNote").textContent = holder
    ? (crossbowStatusText(r) || ((r.contents || []).length ? `This ${HOLDER.holderNoun(r.itemID)} holds ${(r.contents || [])[0].itemID}. Use Contents to change it.`
      : `This ${HOLDER.holderNoun(r.itemID)} is empty. Select an item in the catalog, then choose Load into ${HOLDER.holderNoun(r.itemID)}.`))
    : stateCapability(r.itemID)?.encoding === "sessionBound"
    ? "Telegrenade ammo stores a target NetPlayer.objectID as signed 32-bit bits. Use the unsigned target control above."
    : stateCapability(r.itemID)?.encoding === "pinPauseFuse"
    ? "Hand explosive ammo stores remaining fuse ticks, not a player ID."
    : RULES.isGun(r.itemID)
    ? (Number(r.ammo) > 0 ? `Gun: spawns loaded (ammo ${r.ammo}).` : "Gun: ammo 0 spawns EMPTY. Tick Loaded.") +
      (gunAmmoCap?.max != null ? ` This game's ammo range is ${gunAmmoCap.min}–${gunAmmoCap.max}.` : "") +
      // Minigun.AMMO_PER_ORE = 10, MAX_AMMO = 999: players refill it in game by feeding Cinder into its ammo slot.
      (r.itemID === "item_gatling_gun" ? " In game it is refilled by feeding Cinder into its ammo slot (10 ammo each)." : "")
    : (Number(r.ammo) > 0 ? "Not a known gun; ammo kept as authored." : "");
  // sub-parent
  const sel = $("subParentSelect");
  sel.textContent = "";
  const frames = frameOptionsForRecord(r);
  if (r.role === "root" || !frames.length) {
    sel.disabled = true;
    $("subParentNote").textContent = r.role === "root" ? "The root is not stuck to anything." : "";
    $("snapToTipBtn").disabled = true;
    $("snapToBaseBtn").disabled = r.role === "root";
  } else {
    for (const f of frames) {
      const opt = document.createElement("option");
      opt.value = String(f.id);
      opt.textContent = `${f.id}: ${f.name}${f.scale && f.scale !== 1 ? ` (1 unit = ${f.scale * 1000} mm)` : ""}`;
      opt.disabled = !!f.unknown && f.id !== r.subParentID;
      sel.appendChild(opt);
    }
    const cur = frames.find((f) => f.id === r.subParentID) || null;
    sel.value = String(r.subParentID);
    sel.disabled = r.frozenEdge || !frames.some((f) => f.id !== r.subParentID && !f.unknown);
    if (r.frozenEdge) {
      $("subParentNote").textContent = `Edge kept VERBATIM (sub-parent frame "${cur ? cur.name : r.subParentID}" not probed): pos/rot come straight from the loaded file and cannot be edited here.`;
    } else if (!cur) {
      $("subParentNote").textContent = `subParentID ${r.subParentID} does not exist on the parent; it will be written on the base (0).`;
    } else if (cur.id !== 0) {
      const units = cur.scale && cur.scale !== 1 ? ` (${cur.scale * 1000} mm units)` : "";
      $("subParentNote").textContent = cur.movesWithWearer
        ? `Stuck to the robot arm's ${cur.name}: it moves with that bone. Like the game, every robot arm copies the arm of whoever holds or wears it, so the editor poses it like the ghost player's same-side arm; the saved position is measured from the arm's rest pose.`
        : `Stuck to the parent's ${cur.name}: it moves with that part. Stored in the ${cur.name} frame${units}; the editor shows metres.`;
    } else {
      $("subParentNote").textContent = frames.some((f) => f.id !== 0 && !f.unknown)
        ? "Stuck to the base. Choose another editable part to make it move with that part."
        : frames.length > 1 ? "Stuck to the base. Other parts are shown for imported edges only; their frames have not been measured." : "";
    }
    $("snapToTipBtn").disabled = !(cur && cur.tipUnits) || r.frozenEdge;
    $("snapToBaseBtn").disabled = r.frozenEdge;
  }
  for (const id of ["posX", "posY", "posZ", "rotX", "rotY", "rotZ", "rotQX", "rotQY", "rotQZ", "rotQW"]) $(id).disabled = !!r.frozenEdge;
  renderContentsPanel(r);
  renderColorPicker();
}

// ---- Effective-color picker (owner 2026-10-22) ----
// Hue and saturation are offsets on each part's own albedo, so the field shows what one chosen part of the item turns
// for every setting (color_picker.mjs). Palettes are sampled from the loaded model, the same albedo the preview shades.
const colorPicker = { paletteKey: "", palette: [], partIndex: 0, fieldKey: "", fieldImage: null, dragging: false, targetGroup: false };
const colorPaletteCache = new Map();        // `${itemID}|${activation branch}` -> palette
const texturePixelCache = new WeakMap();    // texture image -> { width, height, data } (or null when unreadable)

function texturePixels(texture) {
  const image = texture?.image;
  if (!image || !image.width || !image.height) return null;
  if (texturePixelCache.has(image)) return texturePixelCache.get(image);
  const scale = Math.min(1, 256 / Math.max(image.width, image.height));
  const width = Math.max(1, Math.round(image.width * scale));
  const height = Math.max(1, Math.round(image.height * scale));
  let pixels = null;
  try {
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d", { willReadFrequently: true });
    context.drawImage(image, 0, 0, width, height);
    pixels = { width, height, data: context.getImageData(0, 0, width, height).data };
  } catch {
    pixels = null;   // an unreadable image: its parts are sampled by base color only
  }
  texturePixelCache.set(image, pixels);
  return pixels;
}

// Plain descriptors of the model's visible surfaces (the activation branch the record shows), in the model's own frame.
function colorSampleMeshes(model) {
  const meshes = [];
  model.updateMatrixWorld(true);
  const toModel = new THREE.Matrix4().copy(model.matrixWorld).invert();
  const local = new THREE.Matrix4();
  const point = new THREE.Vector3();
  model.traverseVisible((child) => {
    const geometry = child.geometry;
    if (!child.isMesh || !geometry?.attributes?.position) return;
    local.multiplyMatrices(toModel, child.matrixWorld);
    const source = geometry.attributes.position;
    const positions = new Float32Array(source.count * 3);
    for (let i = 0; i < source.count; i++) {
      point.fromBufferAttribute(source, i).applyMatrix4(local);
      positions[i * 3] = point.x; positions[i * 3 + 1] = point.y; positions[i * 3 + 2] = point.z;
    }
    const index = geometry.index ? geometry.index.array : null;
    const materials = Array.isArray(child.material) ? child.material : [child.material];
    const groups = Array.isArray(child.material) && geometry.groups.length ? geometry.groups
      : [{ start: 0, count: index ? index.length : source.count, materialIndex: 0 }];
    for (const group of groups) {
      const material = materials[group.materialIndex || 0];
      if (!material || material.visible === false) continue;
      const end = Math.min(group.start + group.count, index ? index.length : source.count);
      const indices = [];
      for (let i = group.start; i < end; i++) indices.push(index ? index[i] : i);
      const map = material.map || null;
      const uvAttribute = map ? geometry.attributes[map.channel ? `uv${map.channel}` : "uv"] : null;
      const pixels = map && uvAttribute ? texturePixels(map) : null;
      let uvs = null;
      if (pixels) {
        uvs = new Float32Array(uvAttribute.count * 2);
        for (let i = 0; i < uvAttribute.count; i++) { uvs[i * 2] = uvAttribute.getX(i); uvs[i * 2 + 1] = uvAttribute.getY(i); }
        if (map.matrixAutoUpdate) map.updateMatrix();
      }
      const colorAttribute = material.vertexColors ? geometry.attributes.color : null;
      let colors = null;
      if (colorAttribute) {
        colors = new Float32Array(colorAttribute.count * 3);
        for (let i = 0; i < colorAttribute.count; i++) {
          colors[i * 3] = colorAttribute.getX(i); colors[i * 3 + 1] = colorAttribute.getY(i); colors[i * 3 + 2] = colorAttribute.getZ(i);
        }
      }
      meshes.push({
        positions, indices, uvs, colors,
        factor: material.color ? [material.color.r, material.color.g, material.color.b] : [1, 1, 1],
        texture: pixels ? { ...pixels, srgb: map.colorSpace === THREE.SRGBColorSpace, matrix: map.matrix.elements } : null,
      });
    }
  });
  return meshes;
}

function colorPaletteKey(record) {
  return `${record.itemID}|${binaryItemIsActive(record) ? 1 : 0}`;
}

// null: no model yet or a stand-in box (colors unknown)
function itemColorPalette(record) {
  if (!record?.model || record.model.userData.colorFallback) return null;
  const key = colorPaletteKey(record);
  if (!colorPaletteCache.has(key)) {
    const samples = sampleSurfaceColors(colorSampleMeshes(record.model), 3000, seededRandom(key));
    colorPaletteCache.set(key, surfacePalette(samples, { random: seededRandom(`${key}|palette`) }));
  }
  return colorPaletteCache.get(key);
}

function colorChip(css, title) {
  const chip = document.createElement("span");
  chip.className = "colorSwatch";
  chip.style.background = css;
  if (title) chip.title = title;
  return chip;
}

function renderColorPickerParts() {
  const box = $("colorPickerParts");
  box.textContent = "";
  if (colorPicker.palette.length < 2) return;
  colorPicker.palette.forEach((entry, index) => {
    const button = document.createElement("button");
    button.type = "button";
    button.setAttribute("aria-pressed", String(index === colorPicker.partIndex));
    button.title = staysBlack(entry.linear) ? "This part is black: it stays black at every hue and saturation"
      : "Show the colors this part can turn";
    button.append(colorChip(linearToCss(entry.linear)), `${colorName(entry.linear)} ${Math.round(entry.weight * 100)}%`);
    button.addEventListener("click", () => {
      colorPicker.partIndex = index;
      renderColorPickerParts();
      renderColorPicker();
    });
    box.appendChild(button);
  });
}

function renderColorPicker() {
  const r = state.selected;
  const canvas = $("colorPickerField");
  const palette = r ? itemColorPalette(r) : null;
  const key = r && palette ? colorPaletteKey(r) : "";
  if (key !== colorPicker.paletteKey) {
    colorPicker.paletteKey = key;
    colorPicker.palette = palette || [];
    colorPicker.partIndex = colorPicker.palette.length ? defaultPaletteIndex(colorPicker.palette) : 0;
    renderColorPickerParts();
  }
  const usable = !!(r && colorPicker.palette.length);
  canvas.classList.toggle("unavailable", !usable);
  canvas.tabIndex = usable ? 0 : -1;
  $("colorPickerTarget").disabled = !usable;
  const context = canvas.getContext("2d");
  const result = $("colorPickerResult");
  result.textContent = "";
  if (!usable) {
    context.clearRect(0, 0, FIELD_SIZE, FIELD_SIZE);
    const message = !r ? "Select an item to pick its color."
      : !r.model ? "Loading the item's colors..."
      : "This item has no 3D model here, so its colors are unknown. The sliders still work.";
    $("colorPickerReadout").textContent = message;
    canvas.setAttribute("aria-label", `Resulting color field. ${message}`);
    return;
  }
  const part = colorPicker.palette[colorPicker.partIndex];
  const fieldKey = `${key}|${colorPicker.partIndex}`;
  if (fieldKey !== colorPicker.fieldKey) {
    colorPicker.fieldKey = fieldKey;
    colorPicker.fieldImage = new ImageData(renderField(part.linear), FIELD_SIZE, FIELD_SIZE);
  }
  context.putImageData(colorPicker.fieldImage, 0, 0);
  // A black part's field is black everywhere (owner 2026-10-31, the alpha blade): say why on the field itself.
  const black = staysBlack(part.linear);
  if (black) {
    context.fillStyle = "#c9ced8";
    context.textAlign = "center";
    context.font = "13px system-ui, sans-serif";
    const lines = ["This part is black, so it stays", "black at every hue and saturation.",
      colorPicker.palette.some((entry) => !staysBlack(entry.linear)) ? "Pick another part above." : "This item's colors cannot change."];
    lines.forEach((line, i) => context.fillText(line, FIELD_SIZE / 2, FIELD_SIZE / 2 - 18 + i * 18));
  }
  const { x, y } = pixelFor(r.colorHue, r.colorSaturation);
  context.lineWidth = 2;
  for (const [radius, stroke] of [[7, "#000000"], [5, "#ffffff"]]) {
    context.beginPath();
    context.arc(x + 0.5, y + 0.5, radius, 0, Math.PI * 2);
    context.strokeStyle = stroke;
    context.stroke();
  }
  const shown = linearToCss(effectiveLinear(part.linear, r.colorHue, r.colorSaturation));
  const partText = `${colorName(part.linear)} part (${Math.round(part.weight * 100)}% of the surface)`;
  const others = selectedRecords().length - 1;
  $("colorPickerReadout").textContent = (black ? "The game shifts each part's own color and keeps its brightness, so a black " +
    "part stays black whatever the hue and saturation. " : "") +
    `Hue ${r.colorHue}, saturation ${r.colorSaturation}: the ${partText} becomes ${shown}.` +
    (others > 0 ? ` The ${others} other selected item(s) get the same numbers, which shift their own colors.` : "") +
    " Glass, lights and glows on a few items do not change color in the game.";
  canvas.setAttribute("aria-label", `Resulting color field for the ${partText}: hue ${r.colorHue}, saturation ${r.colorSaturation}, ` +
    `shows ${shown}. Arrow keys change hue (left/right) and saturation (up/down).`);
  for (const entry of colorPicker.palette) {
    const row = document.createElement("span");
    row.className = "colorResult";
    const before = linearToCss(entry.linear);
    const after = linearToCss(effectiveLinear(entry.linear, r.colorHue, r.colorSaturation));
    row.title = `${colorName(entry.linear)} part, ${Math.round(entry.weight * 100)}% of the surface: ${before} -> ${after}`;
    row.append(colorChip(before), "→", colorChip(after), `${Math.round(entry.weight * 100)}%`);
    result.appendChild(row);
  }
}

function setSelectionHueSaturation(colorHue, colorSaturation) {
  const records = selectedRecords();
  const changed = new Set([...applyColorToSelection(records, "colorHue", colorHue),
    ...applyColorToSelection(records, "colorSaturation", colorSaturation)]);
  if (!changed.size) return;
  for (const record of changed) applyObjectVisualState(record);
  syncInspectorFromSelection();
  refreshPreview();
}

function pickColorFromPointer(event) {
  const rect = $("colorPickerField").getBoundingClientRect();
  if (!rect.width || !rect.height) return;
  const setting = settingAt(event.clientX - rect.left, event.clientY - rect.top, rect.width, rect.height);
  setSelectionHueSaturation(setting.colorHue, setting.colorSaturation);
}

function bindColorPicker() {
  const canvas = $("colorPickerField");
  const usable = () => !!state.selected && !canvas.classList.contains("unavailable");
  canvas.addEventListener("pointerdown", (event) => {
    if (event.button !== 0 || !usable()) return;
    event.preventDefault();
    canvas.setPointerCapture?.(event.pointerId);
    canvas.focus({ preventScroll: true });
    colorPicker.dragging = true;
    beginEditorHistoryGroup();
    pickColorFromPointer(event);
  });
  canvas.addEventListener("pointermove", (event) => { if (colorPicker.dragging) pickColorFromPointer(event); });
  for (const type of ["pointerup", "pointercancel", "lostpointercapture"]) {
    canvas.addEventListener(type, () => {
      if (!colorPicker.dragging) return;
      colorPicker.dragging = false;
      endEditorHistoryGroup();
    });
  }
  canvas.addEventListener("keydown", (event) => {
    const r = state.selected;
    const move = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, 1], ArrowDown: [0, -1] }[event.key];
    if (!move || !r || !usable()) return;
    event.preventDefault();
    const step = event.shiftKey ? 8 : 1;
    beginEditorHistoryGroup();
    // hue is a circle, so it wraps; saturation stops at its ends
    setSelectionHueSaturation((r.colorHue + move[0] * step + 256) % 256, r.colorSaturation + move[1] * step);
  });
  canvas.addEventListener("keyup", endEditorHistoryGroup);
  canvas.addEventListener("blur", endEditorHistoryGroup);
  const target = $("colorPickerTarget");
  target.addEventListener("input", () => {
    const part = colorPicker.palette[colorPicker.partIndex];
    const wanted = cssToLinear(target.value);
    if (!state.selected || !part || !wanted) return;
    if (!colorPicker.targetGroup) { colorPicker.targetGroup = true; beginEditorHistoryGroup(); }
    const best = closestSetting(part.linear, wanted);
    setSelectionHueSaturation(best.colorHue, best.colorSaturation);
    const shown = linearToCss(effectiveLinear(part.linear, best.colorHue, best.colorSaturation));
    setStatus(best.deltaE < 3 ? `Hue ${best.colorHue}, saturation ${best.colorSaturation} gives ${shown}.`
      : `The ${colorName(part.linear)} part cannot reach ${target.value} exactly (hue and saturation do not change brightness); ` +
        `closest is ${shown} at hue ${best.colorHue}, saturation ${best.colorSaturation}.`, best.deltaE < 3 ? "good" : "");
  });
  target.addEventListener("change", () => {
    if (!colorPicker.targetGroup) return;
    colorPicker.targetGroup = false;
    endEditorHistoryGroup();
  });
}

function contentEditorPath() {
  return state.contentSelectedIndex === null ? null : [...state.contentPath, state.contentSelectedIndex];
}

function addContentControl(parent, label, action, value, options = {}) {
  const wrapper = document.createElement("label");
  if (options.checkbox) wrapper.className = "checkRow";
  const input = document.createElement("input");
  input.type = options.checkbox ? "checkbox" : (options.type || "number");
  input.dataset.contentAction = action;
  if (options.checkbox) input.checked = !!value;
  else input.value = String(value);
  if (options.min != null) input.min = String(options.min);
  if (options.max != null) input.max = String(options.max);
  if (options.step != null) input.step = String(options.step);
  if (options.checkbox) wrapper.append(input, document.createTextNode(" " + label));
  else wrapper.append(document.createTextNode(label), input);
  parent.appendChild(wrapper);
  return input;
}

function contentControlNote(parent, message) {
  const note = document.createElement("div");
  note.className = "fieldNote";
  note.textContent = message;
  parent.appendChild(note);
}

function renderContentEditor(record, item) {
  const editor = $("contentEditor");
  editor.hidden = !item;
  const scanId = activeDocument()?.scanSourcePlayerObjectId;
  $("scanSourcePlayerObjectIdRow").hidden = !Number.isInteger(scanId);
  if (Number.isInteger(scanId)) $("scanSourcePlayerObjectId").textContent = String(scanId);
  if (!item) return;
  $("contentEditorLegend").textContent = `Inside: ${item.itemID}`;
  $("contentItemId").value = item.itemID;
  for (const [id, field] of [["contentScaleModifier", "scaleModifier"], ["contentColorHue", "colorHue"],
    ["contentColorSaturation", "colorSaturation"], ["contentJellyStrength", "jellyStrength"],
    ["contentRawState", "state"], ["contentAmmo", "ammo"]]) {
    if (document.activeElement !== $(id)) $(id).value = String(Number(item[field]) || 0);
  }
  const activation = activationCapability(item.itemID);
  $("contentActivatedToggle").disabled = !activation;
  $("contentActivatedToggle").checked = activation ? binaryItemIsActive(item) : false;
  $("contentActivationNote").textContent = activation
    ? `${activation.offLabel || "Inactive"} = 0; ${activation.onLabel || "Activated"} = 1. This starting phase is saved on the contained item.`
    : "This item has no verified simple on/off state. Use its item-specific controls or raw state.";
  const capability = stateCapability(item.itemID);
  $("contentStateNote").textContent = capability
    ? `${capability.component}: ${capability.note || "This game's component interprets state as shown below."}`
    : "Raw signed Int32 state is preserved. No verified item-specific interpretation for this prefab.";
  const holder = RULES.containerRule(item.itemID)?.kind === "holder";
  $("contentLoadedToggle").disabled = !RULES.isGun(item.itemID) || holder;
  $("contentLoadedToggle").checked = RULES.isGun(item.itemID) && Number(item.ammo) > 0;
  $("contentAmmoNote").textContent = capability?.encoding === "sessionBound"
    ? "Telegrenade ammo stores the target NetPlayer.objectID as raw signed 32-bit bits; use the unsigned target control above. It is not an account UUID or PlayerRef."
    : capability?.encoding === "pinPauseFuse"
      ? "Hand explosive ammo stores remaining fuse ticks, not a player target."
      : holder ? "A crossbow's held item is edited by opening its Contents above."
      : RULES.isGun(item.itemID)
        ? (RULES.gunAmmoCapability(item.itemID)?.max != null
          ? `Loaded sets ${RULES.loadedAmmoFor(item.itemID)}; valid ammo is ${RULES.gunAmmoCapability(item.itemID).min}–${RULES.gunAmmoCapability(item.itemID).max}.`
          : "Loaded applies only to known ammo guns.")
        : "Raw ammo is preserved as authored.";

  const semantic = $("contentSemanticControls");
  semantic.replaceChildren();
  semantic.hidden = true;
  if (capability?.encoding === "float32Timer") {
    semantic.hidden = false;
    const legend = document.createElement("legend"); legend.textContent = "Safe-zone remaining time"; semantic.appendChild(legend);
    const seconds = stateBitsToFloat32Seconds(nativeItemState(Number(item.state) || 0));
    addContentControl(semantic, "Seconds (Float32)", "safeSeconds", Number.isFinite(seconds) && seconds >= 0 ? seconds : "", { type: "text" });
    addContentControl(semantic, "Positive infinity (experimental)", "safeInfinity", seconds === Infinity, { checkbox: true });
    contentControlNote(semantic, "Seconds are bit-cast into raw state. Native activation is a separate live flag; this controls duration only.");
  } else if (capability?.kind === "bitmask" && ["revolverChambers", "drawnCardMask"].includes(capability.encoding)) {
    semantic.hidden = false;
    const legend = document.createElement("legend"); legend.textContent = capability.encoding === "revolverChambers" ? "Revolver chambers" : "Deck drawn entries";
    semantic.appendChild(legend);
    for (let bit = 0; bit < capability.bits; bit++)
      addContentControl(semantic, `${capability.encoding === "revolverChambers" ? "Chamber" : "Entry"} ${bit + 1}`, `bit:${bit}`,
        isStateBitSet(nativeItemState(Number(item.state) || 0), bit), { checkbox: true });
  } else if (capability?.encoding === "shreddedValue") {
    semantic.hidden = false;
    const legend = document.createElement("legend"); legend.textContent = "Shredder progress"; semantic.appendChild(legend);
    addContentControl(semantic, "Shredded value", "shredder", Number(item.state) || 0, { min: 0, max: 8000, step: 1 });
  }

  const grenade = $("contentGrenadeControls");
  grenade.replaceChildren();
  grenade.hidden = true;
  if (capability?.encoding === "pinPauseFuse") {
    grenade.hidden = false;
    const legend = document.createElement("legend"); legend.textContent = "Hand explosive pin and fuse"; grenade.appendChild(legend);
    const data = decodeHandExplosive(nativeItemState(Number(item.state) || 0), Number(item.ammo) || 0);
    addContentControl(grenade, "Pin pulled (armed)", "handPin", data.pinPulled, { checkbox: true });
    addContentControl(grenade, "Fuse paused", "handPaused", data.paused, { checkbox: true });
    addContentControl(grenade, "Remaining fuse ticks", "handFuse", Math.max(0, data.fuseTicks), { min: 0, max: 2147483647, step: 1 });
    contentControlNote(grenade, "The game does not save a player target or damage owner for this grenade family. Attribution comes from the live holder/last holder.");
  } else if (capability?.encoding === "sessionBound") {
    grenade.hidden = false;
    const legend = document.createElement("legend"); legend.textContent = "Telegrenade target and timer"; grenade.appendChild(legend);
    const data = decodeTeleGrenade(nativeItemState(Number(item.state) || 0), nativeItemState(Number(item.ammo) || 0));
    addContentControl(grenade, "Pin pulled (armed)", "telePin", data.pinPulled, { checkbox: true });
    addContentControl(grenade, "Remaining fuse ticks (0–255)", "teleTicks", data.remainingTicks, { min: 0, max: 255, step: 1 });
    addContentControl(grenade, "Room-name hash (low 16 bits)", "teleSessionTag", data.sessionTag, { min: 0, max: 65535, step: 1 });
    addContentControl(grenade, "Target NetPlayer.objectID (unsigned 32-bit)", "teleTarget", data.sourcePlayerObjectId,
      { type: "text" });
    contentControlNote(grenade, "On release from a container, native load restores this target only when the saved room-name hash matches the current room. NetPlayer.objectID is assigned on spawn and may identify a different player after a room restart. A current-session pad scan shows its owner's ID above; a captured activated telegrenade can supply its room hash and target ID.");
  }
}

// Why a stored item is "glitched" in this container, or "" (see the user guide's Glitched items section).
function glitchedContentNote(containerID, itemID) {
  const family = RULES.containerFamily(containerID);
  if (!family) return "";
  const noun = RULES.CONTAINER_FAMILY_NOUNS[family];
  if (RULES.RECORD_ONLY_ITEM_IDS.has(itemID)) return `Unknown Item: shows as "Unknown Item" and never comes out of the ${noun}.`;
  if (RULES.NON_GOOP_PREFAB_IDS.has(itemID)) return `${itemID} cannot exist as a held item; it rides in the ${noun} as a stored record.`;
  if (RULES.normallyAllowedIn(itemID, family) === false) return `Players cannot put ${itemID} in a ${noun}; this one rides in from the save.`;
  return "";
}

function renderContentsPanel(record) {
  const note = $("contentsNote");
  const list = $("contentsList");
  const addButton = $("addContentBtn");
  if (!note || !list) return;
  list.textContent = "";
  if (state.contentEditorRecordUid !== (record?.uid ?? null)) {
    state.contentEditorRecordUid = record?.uid ?? null;
    state.contentPath = [];
    state.contentSelectedIndex = null;
  }
  if (state.contentPath.length && !getContainedContainer(record, state.contentPath)) {
    state.contentPath = [];
    state.contentSelectedIndex = null;
  }
  renderCrossbowLoadTools(record);
  const container = record ? getContainedContainer(record, state.contentPath) : null;
  const rows = container ? listDirectContents(record, state.contentPath) : [];
  if (state.contentSelectedIndex !== null && !rows.some((row) => row.index === state.contentSelectedIndex))
    state.contentSelectedIndex = null;
  const rule = container ? RULES.containerRule(container.itemID) : null;
  const selectedRow = rows.find((row) => row.index === state.contentSelectedIndex) || null;
  if (addButton) {
    const crossbow = rule?.kind === "holder";
    const noun = crossbow ? HOLDER.holderNoun(container.itemID) : "";
    addButton.textContent = crossbow ? `Load into ${noun}` : "Put inside";
    // Say up front when the selected catalog item would spawn loose instead of held (the click explains it too).
    const refusal = crossbow && state.selectedEntry ? holderAddRefusalText(record, state.contentPath, container, state.selectedEntry.item_id) : "";
    addButton.title = refusal || (crossbow
      ? `Load the selected catalog item into this ${noun}'s single held-item slot`
      : "Put the selected catalog item inside the selected container (backpack, quiver, ammo pouch or grenade launcher)");
    addButton.disabled = !rule || !state.selectedEntry || rows.length >= rule.capacity;
  }
  const fillButton = $("fillContentsBtn");
  const fillRandomButton = $("fillRandomContentsBtn");
  if (fillButton && fillRandomButton) {
    const full = !rule || rows.length >= rule.capacity;
    fillButton.disabled = full || !state.selectedEntry;
    fillRandomButton.disabled = full;
    fillButton.title = state.selectedEntry && rule
      ? `Fill the ${rule.capacity - rows.length} free slot(s) of ${container.itemID} with ${state.selectedEntry.item_id}`
      : "Fill every free slot of the selected container with the item chosen in the catalog";
  }
  const inventionButton = $("loadInventionIntoHolderBtn");
  if (inventionButton) {
    // A whole invention (every stuck part) loads into the selected holder itself, never into a stored item (owner 2026-10-18).
    const holder = !!record && !state.contentPath.length && takesInvention(record);
    inventionButton.hidden = !holder;
    if (holder) inventionButton.textContent = `Load invention into ${takesInventionNoun(record)}`;
  }
  $("contentPath").textContent = record
    ? [record.itemID, ...state.contentPath.map((_, depth) => getContainedItem(record, state.contentPath.slice(0, depth + 1))?.itemID || "?")].join(" › ")
    : "";
  const canOpen = !!selectedRow && !!RULES.containerRule(selectedRow.item.itemID);
  $("contentNavigation").hidden = !record || (!state.contentPath.length && !canOpen);
  $("contentBackBtn").hidden = !state.contentPath.length;
  $("contentOpenBtn").hidden = !canOpen;
  if (!record) {
    note.textContent = "Select a container: a backpack, quiver, ammo pouch, grenade launcher, or a holder such as a crossbow or heart gun.";
    renderContentEditor(null, null);
    return;
  }
  if (!rule && !rows.length) {
    note.textContent = `${container.itemID} is not a known container. Select a backpack, quiver, ammo pouch, grenade launcher or holder.`;
    renderContentEditor(record, null);
    return;
  }
  note.textContent = rule
    ? `${rule.label}: ${rows.length} / ${rule.capacity}. Contents save their own item attributes, but no independent position or rotation.`
    : `${rows.length} item(s) inside a non-container (kept from import; the game may drop them).`;
  for (const content of rows) {
    const row = document.createElement("div");
    row.className = "contentRow" + (content.index === state.contentSelectedIndex ? " selected" : "");
    row.tabIndex = 0;
    row.setAttribute("role", "button");
    row.setAttribute("aria-label", `Edit contained ${content.item.itemID}`);
    const name = document.createElement("span");
    name.textContent = `${content.item.itemID}${Array.isArray(content.item.children) && content.item.children.length ? ` (+${content.item.children.length} inside)` : ""}`;
    const glitch = glitchedContentNote(container?.itemID, content.item.itemID);
    if (glitch) { name.textContent += " \u00b7 glitched"; name.title = glitch; }
    const del = document.createElement("button");
    del.type = "button"; del.textContent = "x"; del.title = "Take it out";
    del.addEventListener("click", (event) => {
      event.stopPropagation();
      queueRecoverySafetySnapshot("before delete");
      removeContainedItem(record, content.path);
      state.contentSelectedIndex = null;
      syncInspectorFromSelection();
      refreshPreview();
    });
    row.addEventListener("click", () => { state.contentSelectedIndex = content.index; renderContentsPanel(record); });
    row.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") { event.preventDefault(); state.contentSelectedIndex = content.index; renderContentsPanel(record); }
    });
    row.append(name, del);
    list.appendChild(row);
  }
  renderContentEditor(record, selectedRow?.item || null);
}

function applyContentInspectorChange(event) {
  const record = state.selected;
  const path = contentEditorPath();
  const item = record && path && getContainedItem(record, path);
  if (!item) return;
  const field = ({ contentScaleModifier: "scaleModifier", contentColorHue: "colorHue",
    contentColorSaturation: "colorSaturation", contentJellyStrength: "jellyStrength",
    contentRawState: "state", contentAmmo: "ammo" })[event.target.id];
  try {
    if (field) setContainedItemField(record, path, field, event.target.value);
    else if (event.target.id === "contentActivatedToggle") {
      if (!activationCapability(item.itemID)) throw new Error("This item has no verified binary activation state.");
      setContainedItemField(record, path, "state", event.target.checked ? 1 : 0);
    } else if (event.target.id === "contentLoadedToggle") {
      if (!RULES.isGun(item.itemID) || RULES.containerRule(item.itemID)?.kind === "holder")
        throw new Error("Loaded applies only to an ammo gun, not a crossbow holder.");
      setContainedItemField(record, path, "ammo", event.target.checked ? RULES.loadedAmmoFor(item.itemID) : 0);
    } else return;
  } catch (error) {
    setStatus(`Contained item: ${error.message || error}`, "bad");
    renderContentsPanel(record);
    return;
  }
  renderContentsPanel(record);
  refreshPreview();
}

function applyContentSemanticChange(event) {
  const record = state.selected;
  const path = contentEditorPath();
  const item = record && path && getContainedItem(record, path);
  const action = event.target.dataset.contentAction;
  if (!item || !action) return;
  const capability = stateCapability(item.itemID);
  if (!capability) return;
  try {
    let nextState = nativeItemState(Number(item.state) || 0);
    if (action === "safeSeconds" && capability.encoding === "float32Timer") {
      const raw = event.target.value.trim();
      if (!/^\+?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i.test(raw))
        throw new RangeError("enter nonnegative finite seconds");
      const seconds = Number(raw);
      if (!Number.isFinite(seconds) || seconds < 0) throw new RangeError("seconds must be nonnegative and finite");
      nextState = float32SecondsToStateBits(seconds);
      if (!Number.isFinite(stateBitsToFloat32Seconds(nextState))) throw new RangeError("seconds overflow Float32");
    } else if (action === "safeInfinity" && capability.encoding === "float32Timer") {
      if (!event.target.checked) return;
      nextState = float32SecondsToStateBits(Infinity);
    } else if (action.startsWith("bit:") && capability.kind === "bitmask") {
      nextState = setStateBit(nextState, Number(action.slice(4)), event.target.checked);
    } else if (action === "shredder" && capability.encoding === "shreddedValue") {
      nextState = parseShredderProgress(event.target.value);
    } else if (action === "handPin" && capability.encoding === "pinPauseFuse") {
      nextState = setHandExplosivePin(nextState, event.target.checked);
    } else if (action === "handPaused" && capability.encoding === "pinPauseFuse") {
      nextState = setHandExplosivePaused(nextState, event.target.checked);
    } else if (action === "handFuse" && capability.encoding === "pinPauseFuse") {
      setContainedItemField(record, path, "ammo", parseGrenadeFuseTicks(event.target.value));
    } else if (action === "telePin" && capability.encoding === "sessionBound") {
      nextState = setTeleGrenadePin(nextState, event.target.checked);
    } else if (action === "teleTicks" && capability.encoding === "sessionBound") {
      nextState = setTeleGrenadeTicks(nextState, event.target.value);
    } else if (action === "teleSessionTag" && capability.encoding === "sessionBound") {
      nextState = setTeleGrenadeSessionTag(nextState, event.target.value);
    } else if (action === "teleTarget" && capability.encoding === "sessionBound") {
      setContainedItemField(record, path, "ammo", objectIdToSignedAmmo(event.target.value));
    } else return;
    setContainedItemField(record, path, "state", nextState);
  } catch (error) {
    setStatus(`Contained item: ${error.message || error}`, "bad");
    renderContentsPanel(record);
    return;
  }
  renderContentsPanel(record);
  refreshPreview();
}

// Holder tools in Contents (crossbow, heart gun, salmon cannon): save a copy of another invention as this holder's held
// item, or take the held item out into its own invention (still drawn held here) to edit its parts.
function renderCrossbowLoadTools(record) {
  const tools = $("crossbowLoadTools");
  if (!tools) return;
  const crossbow = !!record && !state.contentPath.length && takesInvention(record);
  tools.hidden = !crossbow;
  if (!crossbow) return;
  const tripod = !HOLDER.holderEntry(record.itemID);
  $("crossbowLoadNote").textContent = tripod ? "" : crossbowStatusText(record);
  const select = $("crossbowLoadDocument");
  const previous = select.value;
  select.textContent = "";
  for (const document of state.documents) {
    if (document.id === record.documentId || !documentRoot(document.id)) continue;
    const root = documentRoot(document.id);
    const option = new Option(`${document.name} (${root.itemID})`, document.id);
    option.disabled = inventionLoadPlan(record, [{ itemID: root.itemID }]).reason !== "loaded";
    if (option.disabled) option.textContent += " -- cannot be loaded";
    select.append(option);
  }
  if ([...select.options].some((option) => option.value === previous && !option.disabled)) select.value = previous;
  else select.value = [...select.options].find((option) => !option.disabled)?.value || "";
  $("crossbowLoadDocumentBtn").disabled = !select.value;
  // A taken-out tripod mount has no live preview link back to the tripod (that exists for the other holders only).
  $("crossbowTakeOutBtn").disabled = tripod || !(record.contents || []).length;
}

function loadDocumentCopyIntoCrossbow() {
  const record = state.selected;
  const source = state.documents.find((document) => document.id === $("crossbowLoadDocument").value);
  if (!takesInvention(record) || !source) return setStatus("Select a crossbow, heart gun, salmon cannon or tripod and another invention to load.", "bad");
  const json = buildGoopJson(source.id);
  if (!json) return setStatus(`${source.name} is empty.`, "bad");
  const plan = inventionLoadPlan(record, [json]);
  if (plan.reason !== "loaded") return setStatus(sentence(holderRefusalText(record, json.itemID, plan.reason)), "bad");
  beginEditorHistoryGroup();
  try {
    queueRecoverySafetySnapshot("before crossbow load");
    record.contents = [deepClone(json)];
    // A live preview attached to this crossbow would hide the saved copy; free it so what you see is what saves.
    if (documentHolderRecord(source) === record) {
      source.preview.attachment = "free";
      delete source.preview.holder;
      source.dirty = true;
      applyDocumentPreviewPlacement(source);
    }
    syncInspectorFromSelection();
    refreshPreview();
  } finally {
    endEditorHistoryGroup();
  }
  setStatus(`Loaded a copy of "${source.name}" into ${record.itemID}; it is now part of this invention's JSON. "${source.name}" is still in the workspace.`, "good");
}

async function takeCrossbowContentsOutToEdit() {
  const record = state.selected;
  const item = (record?.contents || [])[0];
  if (!record || !HOLDER.holderEntry(record.itemID) || !item) return setStatus("Select a loaded crossbow, heart gun or salmon cannon first.", "bad");
  const crossbowDocument = state.documents.find((document) => document.id === record.documentId);
  beginEditorHistoryGroup();
  try {
    queueRecoverySafetySnapshot("before crossbow take-out");
    const holder = { documentId: record.documentId, route: recordRoute(record) };
    record.contents = (record.contents || []).slice(1);
    const heldWord = HOLDER.crossbowHolder(record.itemID) ? "ammo" : "held item";
    await loadJsonData(deepClone(item), { separate: true, name: `${crossbowDocument?.name || HOLDER.holderNoun(record.itemID)} ${heldWord}`.slice(0, 80),
      filename: `${item.itemID}_${HOLDER.crossbowHolder(record.itemID) ? "crossbow_ammo" : "held"}.json`,
      preview: { attachment: CROSSBOW_ATTACHMENT, holder, position: [0, 0, 0], rotation: [0, 0, 0, 1], visible: true } });
    refreshPreview();
  } finally {
    endEditorHistoryGroup();
  }
  setStatus(`Took ${item.itemID} out into its own invention. It stays drawn loaded in the crossbow while you edit it; select the crossbow and Load copy to save it back.`, "good");
}

// Why itemID cannot go into the open container, or "". Put inside and the fill buttons share it.
function contentAddRefusal(record, path, container, itemID) {
  const refusal = holderAddRefusalText(record, path, container, itemID);
  if (refusal) return refusal;
  if (RULES.RECORD_ONLY_ITEM_IDS.has(itemID)) {
    // Glitched items exist only as bag records: everything at or below a backpack/quiver is stored, never spawned.
    const chain = [record, ...path.map((_, i) => getContainedItem(record, path.slice(0, i + 1)))];
    if (!chain.some((item) => RULES.containerRule(item?.itemID)?.kind === "backpack"))
      return `${itemID} has no prefab: put it in a backpack, quiver, ammo pouch or grenade launcher (${container.itemID} spawns what it holds).`;
  }
  return "";
}

// Fill buttons (owner 2026-10-23): top the open container up to its game capacity with the selected catalog item, or
// with random items from the catalog's Category filter (each once before any repeats). One undo step either way.
function fillOpenContainer(randomFromCategory) {
  const r = state.selected;
  if (!r) return setStatus("Select a bag or other container first, then fill it.", "bad");
  const container = getContainedContainer(r, state.contentPath);
  const rule = container && RULES.containerRule(container.itemID);
  if (!rule) return setStatus(`${container?.itemID || r.itemID} is not a container (backpack / quiver / ammo pouch / grenade launcher / crossbow / heart gun / salmon cannon).`, "bad");
  const free = rule.capacity - listDirectContents(r, state.contentPath).length;
  if (free <= 0) return setStatus(`${container.itemID} is already full: ${rule.capacity} (${rule.label}). Empty it first to fill it again.`, "bad");
  let ids;
  let what;
  if (randomFromCategory) {
    const category = $("itemCategory").value;
    // "All categories" leaves out glitched contents: a tipped bag of crates or nut drops floods the room.
    const glitched = (id) => RULES.NON_GOOP_PREFAB_IDS.has(id) || RULES.RECORD_ONLY_ITEM_IDS.has(id);
    const pool = catalogEntries()
      .filter((entry) => (category ? catalogCategory(entry) === category : !glitched(entry.item_id)) &&
        !state.bannedIds.has(entry.item_id) && !contentAddRefusal(r, state.contentPath, container, entry.item_id))
      .map((entry) => entry.item_id);
    if (!pool.length) return setStatus(`No ${category || "catalog"} item fits in ${container.itemID}. Pick another Category above the item list.`, "bad");
    ids = randomItemIDs(pool, free);
    what = `random ${category ? `"${category}"` : "catalog"} item${free === 1 ? "" : "s"} (from ${pool.length})`;
  } else {
    const entry = state.selectedEntry;
    if (!entry) return setStatus("Pick an item in the catalog to fill the container with.", "bad");
    const refusal = contentAddRefusal(r, state.contentPath, container, entry.item_id);
    if (refusal) return setStatus(refusal, "bad");
    ids = [entry.item_id];
    what = `x ${entry.item_id}`;
  }
  queueRecoverySafetySnapshot("before fill");
  const added = fillContainedItems(r, state.contentPath, rule.capacity, ids, newEditorItem);
  state.contentSelectedIndex = null;
  syncInspectorFromSelection();
  refreshPreview();
  const flood = ids.some((id) => RULES.NON_GOOP_PREFAB_IDS.has(id))
    ? " Careful: a tipped open bag spawns a non-grabbable item every network tick; a quiver is safer for giveaways." : "";
  setStatus(`Put ${added.length} ${what} inside ${container.itemID}: now ${rule.capacity} / ${rule.capacity}.` +
    (randomFromCategory ? " Empty it and click again to reroll." : "") + flood, flood ? "bad" : "good");
}

function addContentToSelected() {
  const r = state.selected;
  const entry = state.selectedEntry;
  if (!r) return setStatus("Select the container first, then the item to put inside.", "bad");
  if (!entry) return setStatus("Pick an item in the list to put inside.", "bad");
  const container = getContainedContainer(r, state.contentPath);
  const rule = container && RULES.containerRule(container.itemID);
  if (!rule) return setStatus(`${container?.itemID || r.itemID} is not a container (backpack / quiver / ammo pouch / grenade launcher / crossbow / heart gun / salmon cannon).`, "bad");
  if (listDirectContents(r, state.contentPath).length >= rule.capacity)
    return setStatus(`${container.itemID} already holds ${rule.capacity} (${rule.label}).`, "bad");
  const refusal = contentAddRefusal(r, state.contentPath, container, entry.item_id);
  if (refusal) return setStatus(refusal, "bad");
  const path = appendContainedItem(r, state.contentPath, newEditorItem(entry.item_id));
  state.contentSelectedIndex = path[path.length - 1];
  syncInspectorFromSelection();
  refreshPreview();
  setStatus(rule.kind === "holder"
    ? `${entry.item_id} loaded into ${container.itemID}`
    : `${entry.item_id} put inside ${container.itemID}${RULES.isGun(entry.item_id) ? " (loaded)" : ""}`, "good");
}

function loadAllGunsInScene() {
  let n = 0;
  for (const record of state.objects) {
    if (RULES.isGun(record.itemID) && RULES.containerRule(record.itemID)?.kind !== "holder" &&
        (RULES.clampGunAmmo(record.itemID, record.ammo) !== record.ammo || !(Number(record.ammo) > 0))) {
      const current = RULES.clampGunAmmo(record.itemID, record.ammo);
      record.ammo = current > 0 ? current : RULES.loadedAmmoFor(record.itemID);
      n++;
    }
    for (const c of record.contents || []) {
      n += RULES.loadAllGuns(c);
    }
  }
  syncInspectorFromSelection();
  refreshPreview();
  setStatus(n ? `Loaded ammo in ${n} gun(s). Crossbows use their held-item slot.`
    : "Ammo guns were already loaded. Crossbows use their held-item slot.", "good");
}

function snapSelectedToTip() {
  const r = state.selected;
  const parent = parentOf(r);
  if (!r || !parent || r.frozenEdge) return;
  const frame = RULES.subParentFrame(parent.itemID, r.subParentID);
  if (!frame || !frame.tipUnits) return;
  const local = RULES.edgeToParentLocal({ subParentID: frame.id, pos: [0, 0, frame.tipUnits], rot: RULES.IDENTITY_QUAT }, parent.itemID, parent.scaleModifier);
  if (!local) return;
  r.group.position.copy(gameArrToEditorVec(local.pos));
  // A snap moves to the tip without turning the child. In particular, a new
  // joystick must stay upright to form the same stick-to-stick chain as a live capture.
  markTransformDirty(r);
  syncInspectorFromSelection();
  refreshPreview();
  setStatus(`${r.itemID} snapped to the ${frame.name.split(" ")[0]} tip; rotation kept.`, "good");
}

function snapSelectedToOrigin() {
  const r = state.selected;
  const parent = parentOf(r);
  if (!r || !parent || r.frozenEdge) return;
  const local = RULES.edgeToParentLocal({ subParentID: r.subParentID, pos: [0, 0, 0], rot: RULES.IDENTITY_QUAT }, parent.itemID, parent.scaleModifier);
  if (!local) return;
  r.group.position.copy(gameArrToEditorVec(local.pos));
  // Snap to the chosen edge origin, keeping the authored orientation.
  markTransformDirty(r);
  syncInspectorFromSelection();
  refreshPreview();
  setStatus(`${r.itemID} aligned to its parent's current attachment anchor; world origin was not used.`, "good");
}

function armSide(record) {
  const robotSide = state.robotArmSkins.get(record?.itemID)?.side;
  return robotSide || /^item_mannequin_arm_(left|right)$/.exec(record?.itemID || "")?.[1] || null;
}

function canOverlapArm(record) {
  return !!(record && parentOf(record) && !record.frozenEdge && armSide(record) && record.model &&
    state.avatarArmPose && state.avatarArmSkin && state.playerRigs && documentRoot(record.documentId));
}

function canAddOverlappingArmPair() {
  const root = documentRoot();
  return !!(root && state.playerRigs && state.avatarArmPose &&
    ["item_robot_arm_left", "item_robot_arm_right"].every((id) =>
      state.entries.some((entry) => entry.item_id === id && (entry.arm_skin_url || entry.arm_skin?.url))) &&
    RULES.validateInvention(buildGoopJson()).stats.nodes <= RULES.STASH_MAX_DESCENDANTS - 1);
}

function documentWornRootInRig(document, root) {
  const attachment = DOCUMENT_ATTACHMENTS[document.preview.attachment] || "back";
  const previewOffset = DOCUMENT_ATTACHMENTS[document.preview.attachment]
    ? new THREE.Matrix4().compose(new THREE.Vector3(...document.preview.position),
      new THREE.Quaternion(...document.preview.rotation), new THREE.Vector3(1, 1, 1))
    : new THREE.Matrix4();
  return wornRootMatrix(playerAnchorMatrix(attachment), previewOffset,
    defaultHandGrabOffsetMatrix(root.itemID, attachment, root.scaleModifier),
    itemAnchorMatrix(root.itemID, attachment, root.scaleModifier));
}

function armParentInRig(record) {
  const document = state.documents.find((item) => item.id === record.documentId);
  const root = document && documentRoot(document.id);
  if (!root || !record.group.parent) return null;
  const wornRoot = documentWornRootInRig(document, root);
  root.group.updateMatrixWorld(true);
  // The direct parent can be a robot arm's moving @1-@3 mount, not its base group.
  return wornRoot.multiply(root.group.matrixWorld.clone().invert())
    .multiply(record.group.parent.matrixWorld);
}

function robotArmShoulderLocalMatrix(itemID, scaleModifier) {
  const skin = state.robotArmSkins.get(itemID);
  const shoulder = skin && robotArmPose(skin)?.worldByPath.get(skin.poseControls?.shoulder);
  if (!shoulder) return null;
  // The mesh is scaled and offset inside the saved item group.
  const local = new THREE.Matrix4().set(...matrix4(shoulder));
  const offset = new THREE.Vector3().setFromMatrixPosition(local)
    .multiplyScalar(scaleModifierToScalar(scaleModifier, itemID))
    .add(gameArrToEditorVec(RULES.modelOriginCorrection(itemID, scaleModifier)));
  local.setPosition(offset);
  return local;
}

// New children start in the same-side avatar shoulder frame, as a robot arm driven by that player
// does in RobotArmItem.FixedUpdate. For a free invention, use a virtual Back preview to give the
// child a useful saved pose before the wearer preview is enabled; existing imported edges are untouched.
function alignRobotArmWithGhost(record) {
  if (!parentOf(record) || record.frozenEdge || !isRobotArmItem(record.itemID) ||
      !state.avatarArmPose || !state.avatarArmSkin || !state.playerRigs) return false;
  const skin = state.robotArmSkins.get(record.itemID);
  if (!skin) return false;
  const ghostShoulder = poseJointMatrix(`shoulder.${skin.side}`);
  const armLocal = robotArmShoulderLocalMatrix(record.itemID, record.scaleModifier);
  const parentInRig = armParentInRig(record);
  if (!ghostShoulder || !armLocal || !parentInRig) return false;
  // Both matrices are in their own game's native bone space. The item mesh is physically scaled
  // inside the child group; the child group's saved pose remains relative to its actual parent.
  const targetInRig = matrixFromRows(state.playerRigs.player_anchors.avatar.matrix)
    .multiply(new THREE.Matrix4().set(...matrix4(ghostShoulder)));
  const childLocal = parentInRig.invert().multiply(targetInRig).multiply(armLocal.invert());
  childLocal.decompose(record.group.position, record.group.quaternion, record.group.scale);
  markTransformDirty(record);
  return true;
}

function alignMannequinArmWithGhost(record) {
  const side = armSide(record);
  if (!/^item_mannequin_arm_(left|right)$/.test(record.itemID)) return false;
  const shoulder = poseJointMatrix(`shoulder.${side}`);
  const handPath = state.avatarArmSkin?.poseControls?.[side]?.hand;
  const hand = handPath && state.avatarArmPose?.worldByPath.get(handPath);
  const parentInRig = armParentInRig(record);
  if (!shoulder || !hand || !parentInRig) return false;
  const avatar = matrixFromRows(state.playerRigs.player_anchors.avatar.matrix);
  const shoulderInRig = avatar.clone().multiply(new THREE.Matrix4().set(...matrix4(shoulder)));
  const handInRig = avatar.multiply(new THREE.Matrix4().set(...matrix4(hand)));
  const start = new THREE.Vector3().setFromMatrixPosition(shoulderInRig);
  const z = new THREE.Vector3().setFromMatrixPosition(handInRig).sub(start);
  if (z.lengthSq() < 1e-8) return false;
  z.normalize();
  const shoulderTurn = new THREE.Quaternion();
  shoulderInRig.decompose(new THREE.Vector3(), shoulderTurn, new THREE.Vector3());
  const y = new THREE.Vector3(0, 1, 0).applyQuaternion(shoulderTurn);
  y.addScaledVector(z, -y.dot(z));
  if (y.lengthSq() < 1e-8) y.set(1, 0, 0).addScaledVector(z, -z.x);
  y.normalize();
  const x = y.clone().cross(z).normalize();
  y.crossVectors(z, x).normalize();
  const turn = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(x, y, z));
  const targetInRig = new THREE.Matrix4().compose(start, turn, new THREE.Vector3(1, 1, 1));
  const correction = gameArrToEditorVec(RULES.modelOriginCorrection(record.itemID, record.scaleModifier));
  const modelOrigin = new THREE.Matrix4().makeTranslation(correction.x, correction.y, correction.z);
  const childLocal = parentInRig.invert().multiply(targetInRig).multiply(modelOrigin.invert());
  childLocal.decompose(record.group.position, record.group.quaternion, record.group.scale);
  markTransformDirty(record);
  return true;
}

function overlapSelectedArm() {
  const record = state.selected;
  if (!canOverlapArm(record)) return setStatus("Select an editable robot or mannequin arm stuck to an invention.", "bad");
  beginEditorHistoryGroup();
  try {
    const document = state.documents.find((item) => item.id === record.documentId);
    let previewChanged = false;
    if (document.preview.attachment === "free") {
      document.preview.attachment = "back";
      document.preview.position = [0, 0, 0];
      document.preview.rotation = [0, 0, 0, 1];
      previewChanged = true;
    }
    if (!document.preview.visible) {
      document.preview.visible = true;
      previewChanged = true;
    }
    if (previewChanged) {
      applyDocumentPreviewPlacement(document);
      document.dirty = true;
    }
    const aligned = isRobotArmItem(record.itemID) ? alignRobotArmWithGhost(record)
      : alignMannequinArmWithGhost(record);
    if (!aligned) return setStatus("Current-build arm pose data is unavailable for this item.", "bad");
    $("showGhostRig").checked = true;
    syncInspectorFromSelection();
    refreshPreview();
    setStatus(isRobotArmItem(record.itemID)
      ? `${record.itemID} overlaps the ghost's ${armSide(record)} shoulder and follows that arm's pose.`
      : `${record.itemID} aims from the ghost's ${armSide(record)} shoulder toward its hand; mannequin arms stay rigid in game.`, "good");
  } finally {
    endEditorHistoryGroup();
  }
}

async function addOverlappingArmPair() {
  if (!canAddOverlappingArmPair()) return setStatus("Choose an invention root with room for two robot-arm children.", "bad");
  const parent = parentTargetRecord();
  const document = activeDocument();
  beginEditorHistoryGroup();
  try {
    document.preview.attachment = "back";
    document.preview.position = [0, 0, 0];
    document.preview.rotation = [0, 0, 0, 1];
    document.preview.visible = true;
    applyDocumentPreviewPlacement(document);
    document.dirty = true;
    $("showGhostRig").checked = true;
    for (const id of ["item_robot_arm_left", "item_robot_arm_right"]) {
      setParentTarget(parent);
      await addObject(id, "child");
    }
    refreshPreview();
    setStatus(`Added left and right robot arms to ${parent.itemID}, aligned with the ghost's arms.`, "good");
  } finally {
    endEditorHistoryGroup();
  }
}

function addAlignedJoystickLink() {
  const parent = state.selected;
  if (!parent || !["item_joystick", "item_joystick_inv_y"].includes(parent.itemID) || parent.frozenEdge) {
    return setStatus("Select an editable joystick in the Hierarchy to add a stick link.", "bad");
  }
  // Only the 512-part total refuses a link: the paced spawner regroups more than 32 children itself, and a chain deeper
  // than the stash keeps still spawns (the Validation panel warns that it cannot be saved in the stash).
  const existing = RULES.validateInvention(buildGoopJson()).stats.nodes - 1;
  if (existing >= RULES.STASH_MAX_DESCENDANTS) {
    return setStatus("A new link would exceed the game's 512-descendant limit.", "bad");
  }
  const itemID = $("joystickLinkType").value;
  if (!["item_joystick", "item_joystick_inv_y"].includes(itemID)) return;
  const pose = RULES.edgeToDrawnPose(RULES.JOYSTICK_CHAIN_EDGE,
    parent.itemID, parent.scaleModifier, itemID, 0);
  if (!pose) return setStatus("The selected joystick stick frame is unavailable.", "bad");
  const child = makeObjectRecord(itemID, "child");
  child.documentId = parent.documentId;
  state.objects.push(child);
  linkToParent(child, parent);
  child.subParentID = 1;
  placeChildGroup(child);
  child.group.position.copy(gameArrToEditorVec(pose.pos));
  child.group.quaternion.copy(gameArrToEditorQuat(pose.rot));
  child.hierarchyDirty = true;
  markTransformDirty(child);
  void attachModel(child);
  setParentTarget(child); // Repeat the action to continue the chain.
  selectRecord(child);
  setStatus(`Added upright ${itemID} on ${parent.itemID}'s moving stick. Select the new link and repeat to extend the chain.`, "good");
}

// ---- Bridge items (owner 2026-10-12) ----
// Insert an item between a part and its children (bridge_plan.mjs has the rules). "Insert bridge" adds a new bridge on
// the selected part; "Move siblings onto selected" turns an already placed part into the bridge for its siblings, so a
// joystick can sit where players reach it. Children keep where they are drawn; their edges are re-solved on save.
function bridgeChildSummaries(parent) {
  return parent.children.map((uid) => recordByUid(uid)).filter(Boolean).map((child) => ({
    uid: child.uid, subParentID: Math.round(Number(child.subParentID) || 0), frozen: !!child.frozenEdge
  }));
}

function bridgeFrameOptions(select, frames, preferred) {
  const usable = (frames || []).filter((frame) => frame && !frame.unknown);
  const keep = select.value;
  select.textContent = "";
  for (const frame of usable) {
    const opt = document.createElement("option");
    opt.value = String(frame.id);
    opt.textContent = `${frame.id}: ${frame.name}`;
    select.appendChild(opt);
  }
  const ids = usable.map((frame) => String(frame.id));
  select.value = ids.includes(String(preferred)) ? String(preferred) : (ids.includes(keep) ? keep : (ids[0] || ""));
  select.disabled = usable.length < 2;
  return usable.length > 0;
}

// Selection-driven defaults: the part's point holding most of its children, and the bridge's moving part when it has one.
function syncBridgeControls() {
  const r = state.selected;
  const single = !!r && selectedRecords().length === 1;
  const bridgeId = String($("bridgeItemId").value || "").trim();
  const known = !!bridgeId && !!state.knownIds?.has(bridgeId);
  const childEdges = r ? bridgeChildSummaries(r).map((child) => child.subParentID) : [];
  const partFrames = r ? RULES.subParentFramesFor(r.itemID) : [];
  const hasParentFrame = bridgeFrameOptions($("bridgeParentEdge"), partFrames, defaultParentEdge(partFrames, childEdges));
  const bridgeFrames = known ? RULES.subParentFramesFor(bridgeId) : [];
  const hasChildFrame = bridgeFrameOptions($("bridgeChildEdge"), bridgeFrames, defaultChildEdge(bridgeFrames));
  $("insertBridgeBtn").disabled = !single || r.frozenEdge || !r.children.length || !known || !hasParentFrame || !hasChildFrame;
  const parent = r ? parentOf(r) : null;
  const ownFrames = r ? RULES.subParentFramesFor(r.itemID) : [];
  const hasOwnFrame = bridgeFrameOptions($("adoptChildEdge"), ownFrames, defaultChildEdge(ownFrames));
  $("adoptSiblingsBtn").disabled = !single || !parent || r.frozenEdge || parent.children.length < 2 || !hasOwnFrame;
}

function bridgeStatus(plan, what) {
  const notes = [];
  if (plan.otherEdge) notes.push(`${plan.otherEdge} child${plan.otherEdge === 1 ? "" : "ren"} on other attachment points stayed`);
  if (plan.skippedFrozen) notes.push(`${plan.skippedFrozen} with a verbatim edge stayed`);
  setStatus(`${what}: ${plan.move.length} child${plan.move.length === 1 ? "" : "ren"} now on the ${plan.itemID}'s ` +
    `point ${plan.childEdge}, nothing moved in the world.${notes.length ? " " + notes.join("; ") + "." : ""}`, "good");
}

// Move each child onto the bridge's point, keeping its world pose (applyWorldPoseToRecord solves the new local pose).
function moveChildrenOntoBridge(uids, bridge, childEdge) {
  bridge.group.updateWorldMatrix(true, true);
  const moving = uids.map((uid) => recordByUid(uid)).filter(Boolean).map((child) => ({
    child,
    worldPos: child.group.getWorldPosition(new THREE.Vector3()),
    worldQuat: child.group.getWorldQuaternion(new THREE.Quaternion())
  }));
  for (const { child, worldPos, worldQuat } of moving) {
    child.subParentID = childEdge;
    linkToParent(child, bridge, false);
    applyWorldPoseToRecord(child, bridge, worldPos, worldQuat);
    child.hierarchyDirty = true;
  }
}

function insertBridgeItem() {
  const parent = state.selected;
  if (!parent || selectedRecords().length !== 1) return setStatus("Select one part to put a bridge under.", "bad");
  const itemID = String($("bridgeItemId").value || "").trim();
  const plan = planBridge({
    mode: "insert", bridgeItemID: itemID, knownIds: state.knownIds,
    parent: { itemID: parent.itemID, frozen: !!parent.frozenEdge, children: bridgeChildSummaries(parent) },
    parentEdge: Number($("bridgeParentEdge").value), childEdge: Number($("bridgeChildEdge").value),
    parentFrames: RULES.subParentFramesFor(parent.itemID), bridgeFrames: state.knownIds?.has(itemID) ? RULES.subParentFramesFor(itemID) : [],
    descendants: Math.max(0, RULES.validateInvention(buildGoopJson()).stats.nodes - 1)
  });
  if (!plan.ok) return setStatus(plan.error, "bad");
  beginEditorHistoryGroup();
  try {
    parent.group.updateWorldMatrix(true, true);
    const bridge = makeObjectRecord(plan.itemID, "child");
    bridge.documentId = parent.documentId;
    state.objects.push(bridge);
    bridge.subParentID = plan.parentEdge;
    linkToParent(bridge, parent, false);
    // At the origin of the part's chosen attachment point, as a loaded edge of all zeros would be drawn.
    const pose = RULES.edgeToDrawnPose({ subParentID: plan.parentEdge, pos: [0, 0, 0], rot: [0, 0, 0, 1] },
      parent.itemID, parent.scaleModifier, plan.itemID, bridge.scaleModifier);
    if (pose) {
      bridge.group.position.copy(gameArrToEditorVec(pose.pos));
      bridge.group.quaternion.copy(gameArrToEditorQuat(pose.rot));
    }
    bridge.hierarchyDirty = true;
    markTransformDirty(bridge);
    void attachModel(bridge);
    moveChildrenOntoBridge(plan.move, bridge, plan.childEdge);
    selectRecord(bridge);
    refreshPreview();
    bridgeStatus(plan, `Inserted ${plan.itemID} on ${displayName(parent)}'s point ${plan.parentEdge}`);
  } finally {
    endEditorHistoryGroup();
  }
}

function adoptSiblingsOntoSelected() {
  const bridge = state.selected;
  const parent = bridge ? parentOf(bridge) : null;
  if (!bridge || selectedRecords().length !== 1 || !parent) {
    return setStatus("Select one part that is stuck to another part; its siblings will move onto it.", "bad");
  }
  const plan = planBridge({
    mode: "adopt", knownIds: state.knownIds,
    parent: { itemID: parent.itemID, frozen: !!parent.frozenEdge, children: bridgeChildSummaries(parent) },
    bridge: { uid: bridge.uid, itemID: bridge.itemID, subParentID: bridge.subParentID, frozen: !!bridge.frozenEdge },
    childEdge: Number($("adoptChildEdge").value), bridgeFrames: RULES.subParentFramesFor(bridge.itemID)
  });
  if (!plan.ok) return setStatus(plan.error, "bad");
  beginEditorHistoryGroup();
  try {
    parent.group.updateWorldMatrix(true, true);
    moveChildrenOntoBridge(plan.move, bridge, plan.childEdge);
    markChildEdgesDirty(bridge);
    selectRecord(bridge);
    refreshPreview();
    bridgeStatus(plan, `${displayName(bridge)} is now the bridge for its siblings`);
  } finally {
    endEditorHistoryGroup();
  }
}

function renderSelectionList() {
  const countEl = $("selectionCount");
  const list = $("selectionList");
  if (!countEl || !list) return;
  const records = selectedRecords();
  countEl.textContent = records.length ? `${records.length} selected` : "None";
  list.textContent = "";
  if (!records.length) {
    const empty = document.createElement("div");
    empty.className = "selectionEmpty";
    empty.textContent = "No selected items";
    list.appendChild(empty);
    return;
  }
  for (const record of records) {
    const row = document.createElement("div");
    row.className = "selectionRow" + (record === state.selected ? " primary" : "");
    const name = document.createElement("span");
    name.className = "selectionItemName";
    name.textContent = record.itemID;
    const meta = document.createElement("span");
    meta.className = "treeMeta";
    meta.textContent = `#${record.uid}`;
    const remove = document.createElement("button");
    remove.type = "button";
    remove.title = "Remove from selection";
    remove.textContent = "x";
    row.append(name, meta, remove);
    row.addEventListener("click", () => makePrimarySelection(record));
    row.querySelector("button").addEventListener("click", (event) => {
      event.stopPropagation();
      removeRecordFromSelection(record);
    });
    list.appendChild(row);
  }
}

// X/Y/Z and Rot X/Y/Z show the active item's pose relative to its parent. With
// several items selected, the typed change moves or turns every independent
// editable item, the same set and pivot the Move/Rotate handle uses.
function applyInspectorPoseEdit(r, fieldId, input) {
  const primaryPose = { position: r.group.position.toArray(), quaternion: r.group.quaternion.toArray() };
  const edited = editInspectorPose({ ...primaryPose, fieldId,
    inputValue: input.value, displayedValue: input.dataset.displayedValue, angleUnit: state.angleUnit });
  if (!edited.changed) {
    syncInspectorFromSelection();
    return;
  }
  const selected = selectedRecords();
  const selectedSet = new Set(selected.map((record) => record.uid));
  // Children stay: every selected part moves by itself (parents first) and the parts under them hold still.
  const stay = state.childrenStay;
  const independent = selected.length > 1
    ? (stay ? [...selected].sort((a, b) => recordDepth(a) - recordDepth(b)) : selected.filter((record) => !hasSelectedAncestor(record, selectedSet)))
    : [r];
  const locked = independent.filter((record) => record.frozenEdge);
  const movable = independent.filter((record) => !record.frozenEdge);
  const rotationField = !(fieldId === "posX" || fieldId === "posY" || fieldId === "posZ");
  if (movable.length === 1 && movable[0] === r && !(state.rotateInPlace && rotationField) && !stay) {
    // Keep the exact typed local value and every untouched axis.
    r.group.position.fromArray(edited.position);
    r.group.quaternion.fromArray(edited.quaternion);
    markTransformDirty(r);
  } else {
    if (!movable.length) {
      syncInspectorFromSelection();
      setStatus("The active item moves with a locked verbatim ancestor. Remove that ancestor from the selection to edit this pose.", "bad");
      return;
    }
    const parent = parentOf(r);
    const parentWorldQuaternion = parent
      ? parentFrame(r).getWorldQuaternion(new THREE.Quaternion()).toArray() : [0, 0, 0, 1];
    const entries = movable.map((record) => {
      record.group.updateMatrixWorld(true);
      return {
        record, parent: parentOf(record),
        worldPosition: record.group.getWorldPosition(new THREE.Vector3()).toArray(),
        worldQuaternion: record.group.getWorldQuaternion(new THREE.Quaternion()).toArray(),
      };
    });
    const pivot = movable.length > 1 ? selectionWorldCenter(movable).toArray() : entries[0].worldPosition;
    const plan = planInspectorGroupPose({ primary: { ...primaryPose, parentWorldQuaternion },
      entries, pivot, fieldId, inputValue: input.value, displayedValue: input.dataset.displayedValue,
      angleUnit: state.angleUnit });
    const inPlace = state.rotateInPlace && plan.kind === "rotate";
    if (inPlace) {
      // Turn in place: the same world turn, each part about its own model centre
      plan.entries = movable.map((record, index) => turnAboutCentre({ worldPosition: entries[index].worldPosition,
        worldQuaternion: entries[index].worldQuaternion, centre: partCentreWorld(record).toArray(), rotation: plan.worldRotation }));
    }
    const held = stay ? heldChildPoses(movable) : { held: [], followed: 0 };
    const poses = plan.entries.map((next, index) => ({ record: entries[index].record, parent: entries[index].parent,
      depth: recordDepth(entries[index].record), worldPos: new THREE.Vector3().fromArray(next.worldPosition),
      worldQuat: new THREE.Quaternion().fromArray(next.worldQuaternion) }));
    for (const pose of [...poses, ...held.held].sort((a, b) => a.depth - b.depth)) {
      applyWorldPoseToRecord(pose.record, pose.parent, pose.worldPos, pose.worldQuat);
    }
    if (movable.includes(r) && !(stay && held.held.some((pose) => pose.parent === r))) {
      // Avoid world round-off in the value the author just typed (in place, the position is the solved one).
      if (plan.kind === "move") r.group.position.fromArray(edited.position);
      else r.group.quaternion.fromArray(edited.quaternion);
      r.group.updateMatrixWorld(true);
    }
    const what = plan.kind === "move" ? "Moved" : "Turned";
    const around = inPlace ? " in place, each about its own centre" : plan.kind === "rotate" && movable.length > 1 ? " around the selection centre" : "";
    const carried = movable.includes(r) ? "" : ` ${r.itemID} moved with its selected parent, so its own offset is unchanged.`;
    const skipped = locked.length ? ` ${locked.length} locked verbatim edge(s) stayed put.` : "";
    const stayed = stay ? ` The parts attached under ${movable.length === 1 ? "it" : "them"} stayed where they were${held.followed ? `, except ${held.followed} verbatim edge(s) that moved along` : ""}.` : "";
    setStatus(`${what} ${movable.length} selected item${movable.length === 1 ? "" : "s"}${around} by the same world change.${carried}${skipped}${stayed}`, "good");
  }
  if (selected.length > 1 || transform.object === selectionPivot) {
    positionSelectionPivot();
    attachTransformToSelection();
  }
  renderHierarchyTree();
  refreshPreview();
  syncInspectorFromSelection();
}

function applyInspectorToSelection(event) {
  const r = state.selected;
  if (!r) return;
  state.scaleEdit = null;
  const sourceId = event && event.target ? event.target.id : "";
  if (sourceId === "rawStateInput") {
    const raw = $("rawStateInput").value.trim();
    if (!/^[+-]?\d+$/.test(raw)) {
      setStatus("Raw state needs a signed whole number from -2147483648 to 2147483647; non-finite values are not representable in game JSON.", "bad");
      $("rawStateInput").value = String(r.state);
      return;
    }
    let nextState;
    try { nextState = nativeItemState(raw); }
    catch (error) {
      setStatus(error.message, "bad");
      $("rawStateInput").value = String(r.state);
      return;
    }
    for (const record of selectedRecords()) {
      record.state = nextState;
      applyObjectVisualState(record);
    }
    syncInspectorFromSelection();
    renderHierarchyTree();
    refreshPreview();
    return;
  }
  if (sourceId === "activatedToggle") {
    const records = selectedRecords();
    if (!records.length || records.some((record) => !activationCapability(record.itemID))) return;
    const nextState = $("activatedToggle").checked ? 1 : 0;
    for (const record of records) {
      record.state = nextState;
      applyObjectVisualState(record);
    }
    syncInspectorFromSelection();
    renderHierarchyTree();
    refreshPreview();
    return;
  }
  const colorField = ({ colorHue: "colorHue", colorHueNumber: "colorHue",
    colorSaturation: "colorSaturation", colorSaturationNumber: "colorSaturation",
    jellyStrength: "jellyStrength", jellyStrengthNumber: "jellyStrength" })[sourceId];
  if (colorField) {
    const changed = applyColorToSelection(selectedRecords(), colorField, event.target.value);
    if (changed.length) {
      for (const record of changed) applyObjectVisualState(record);
      syncInspectorFromSelection();
      refreshPreview();
    }
    return;
  }
  if (isInspectorPoseField(sourceId)) {
    if (r.frozenEdge) return;
    try {
      applyInspectorPoseEdit(r, sourceId, event.target);
    } catch (error) {
      syncInspectorFromSelection();
      setStatus(`Invalid pose value: ${error.message || error}`, "bad");
    }
    return;
  }
  const nextId = $("selectedItemId").value.trim();
  let defaultedGunAmmo = false;
  if (nextId && nextId !== r.itemID) {
    let plan;
    try {
      plan = replaceItemRecord(r, nextId);
    } catch (err) {
      $("selectedItemId").value = r.itemID;
      setStatus(`Item change refused: ${err.message || err}`, "bad");
      return;
    }
    defaultedGunAmmo = plan.defaultedGunAmmo;
    setStatus(plan.rehomed
      ? `${plan.rehomed} child edge(s) moved to the new item's base while keeping their displayed poses.`
      : `${nextId} selected; child edges will be re-encoded against the new prefab.`, "good");
  }
  r.colorHue = Math.round(clamp($("colorHue").value, 0, 255));
  r.colorSaturation = Math.round(clamp($("colorSaturation").value, -128, 127));
  r.jellyStrength = Math.round(clamp($("jellyStrength").value, 0, 255));
  if (sourceId === "loadedToggle") {
    r.ammo = $("loadedToggle").checked ? RULES.loadedAmmoFor(r.itemID) : 0;
  } else if (sourceId === "ammo" && !defaultedGunAmmo) {
    try {
      const encoding = stateCapability(r.itemID)?.encoding;
      r.ammo = encoding === "sessionBound"
        ? parseContainedFieldValue("ammo", $("ammo").value)
        : encoding === "pinPauseFuse"
          ? parseGrenadeFuseTicks($("ammo").value)
          : RULES.clampGunAmmo(r.itemID, Math.max(0, Math.round(Number($("ammo").value) || 0)));
    } catch (error) {
      setStatus(`Ammo: ${error.message || error}`, "bad");
      $("ammo").value = String(r.ammo);
      return;
    }
  }
  if (sourceId === "subParentSelect" && r.role !== "root" && !r.frozenEdge) {
    const parent = parentOf(r);
    const wanted = Math.round(Number($("subParentSelect").value) || 0);
    const frame = parent ? RULES.subParentFrame(parent.itemID, wanted) : null;
    if (frame && !frame.unknown) {
      if (r.subParentID !== wanted) {
        r.subParentID = wanted;
        placeChildGroup(r, true); // a robot arm joint mount: the part stays where it is drawn and follows that joint
        markTransformDirty(r);   // the displayed pose stays; the edge is re-encoded in the new frame
        setStatus(`${r.itemID} now stuck to the parent's ${frame.name}.`, "good");
      }
    } else if (frame && frame.unknown) {
      setStatus(`The ${frame.name} frame has not been probed; copy such an edge from a capture instead.`, "bad");
    }
  }
  applyObjectVisualState(r);
  syncInspectorFromSelection();
  renderHierarchyTree();
  refreshPreview();
}

// ---- catalog list ----
const SOUNDBOARD_ITEM_ID_RE = /^item_midipad(?:_|$)/;
const ITEM_CATALOG_PREFERENCE_KEY = "mikeybox.goopEditor.catalog.v1";
const itemCatalogCollator = new Intl.Collator(undefined, { numeric: true, sensitivity: "base" });
let itemCatalogView = "names";
let itemThumbnailObserver = null;
function catalogEntries() {
  const withModels = state.entries.filter((entry) => entry.exists && !entry.item_id.startsWith("item_view_"));
  return withModels.concat(state.idsWithoutModels);
}

function catalogLabel(entry) {
  return state.catalogById.get(entry.item_id)?.name || entry.item_id;
}

function catalogCategory(entry) {
  // Crates and nut drops can only ride in containers, like Unknown Item: list them together.
  if (RULES.NON_GOOP_PREFAB_IDS.has(entry.item_id)) return "Glitched contents";
  return state.catalogById.get(entry.item_id)?.category || "Uncategorized";
}

function catalogCollection(entry) {
  return state.catalogMetadata.get(entry.item_id)?.collection || "";
}

function catalogFirstSeen(entry) {
  return Number(state.catalogMetadata.get(entry.item_id)?.firstSeenTrackedBuild || 0);
}

function populateCatalogCategories() {
  const picker = $("itemCategory");
  const previous = picker.value;
  picker.replaceChildren(new Option("All categories", ""));
  for (const category of [...new Set(catalogEntries().map(catalogCategory))].sort(itemCatalogCollator.compare))
    picker.add(new Option(category, category));
  picker.value = previous;
}

function saveItemCatalogPreferences() {
  try {
    localStorage.setItem(ITEM_CATALOG_PREFERENCE_KEY, JSON.stringify({
      expanded: !$('itemList').hidden,
      sort: $('itemSort').value,
      category: $('itemCategory').value,
      view: itemCatalogView,
    }));
  } catch (_) {}
}

function setItemListExpanded(expanded) {
  $("itemList").hidden = !expanded;
  const button = $("toggleItemListBtn");
  button.setAttribute("aria-expanded", String(expanded));
  button.textContent = expanded ? "Hide list" : "Show list";
  if (!expanded) itemThumbnailObserver?.disconnect();
  else if (itemCatalogView === "thumbnails" && $("itemList").children.length) renderItemList();
  saveItemCatalogPreferences();
}

function setItemCatalogView(view, { render = true, persist = true } = {}) {
  itemCatalogView = view === "thumbnails" ? "thumbnails" : "names";
  $("itemListNamesBtn").setAttribute("aria-pressed", String(itemCatalogView === "names"));
  $("itemListThumbsBtn").setAttribute("aria-pressed", String(itemCatalogView === "thumbnails"));
  if (render) renderItemList();
  if (persist) saveItemCatalogPreferences();
}

// Item info (owner 2026-10-29, a moderator: "a little ⓘ on objects in the item_id list to tell like their value, limits,
// etc. And show the total value and weight for a build"): an item's in-game value (item_values.mjs), its weight (the
// center-of-mass data), the game's own invention limit and what deliveries and the voice bot allow, from the same policy
// the build validator applies.
const itemValueOf = (itemId) => {
  const value = ITEM_VALUES.values[String(itemId || "").toLowerCase().replace(/^item_prefab\//, "")];
  return Number.isFinite(value) ? value : null;
};
// The store price (owner 2026-10-31); null when the store doesn't sell it or it is newer than the list. The game prices what
// it doesn't sell 0 (squishies, anomalies, fruit...) or at least the wallet's 9,999,999 cap (the fishing radar parts, the
// unidentified item). 9,999 is shown as it is: 151 items have it, real weapons like the RPG and found items like keys alike.
const itemPriceOf = (itemId) => {
  const price = (ITEM_VALUES.prices || {})[String(itemId || "").toLowerCase().replace(/^item_prefab\//, "")];
  return Number.isFinite(price) && price > 0 && price < 9999999 ? price : null;
};
const formatMoney = (amount) => `$${Math.round(amount).toLocaleString()}`;
// Sort by store price or sell value (owner 2026-10-31): highest (direction 1) or lowest (-1) first; items without one go last.
function compareItemMoney(a, b, amountOf, direction) {
  const va = amountOf(a.item_id), vb = amountOf(b.item_id);
  if (va === null || vb === null) return Number(va === null) - Number(vb === null);
  return direction * (vb - va);
}
const MONEY_SORTS = { price: [itemPriceOf, 1], priceLow: [itemPriceOf, -1], value: [itemValueOf, 1], valueLow: [itemValueOf, -1] };
// A row's or tile's money text: the store price when sorting by it, then what it sells for.
function itemMoneyText(itemId, sort) {
  const value = itemValueOf(itemId);
  if (value === null) return "value not known yet";
  const price = itemPriceOf(itemId);
  const sells = `sells ${formatMoney(value)}`;
  return sort.startsWith("price") ? `${price === null ? "not in the store" : `store ${formatMoney(price)}`} · ${sells}` : sells;
}
const formatKg = (kg) => `${kg.toFixed(kg < 10 ? 2 : 1)} kg`;

function itemInfoRows(itemId) {
  const id = String(itemId || "").toLowerCase();
  const rows = [];
  const value = itemValueOf(id);
  const price = itemPriceOf(id);
  if (value !== null) rows.push(["Store price", price === null ? "the store doesn't sell it" : formatMoney(price)]);
  rows.push(["Sell value", value === null ? `not known yet (newer than the ${ITEM_VALUES.readAt} value list)` : `${formatMoney(value)}, what it sells for in the game`]);
  const massReady = !!COM.massManifestInfo();
  const row = massReady ? COM.itemMassProperties(id) : null;
  const own = row ? COM.itemOwnMass(id) : null;   // the game's own rule (an empty backpack weighs its base mass)
  rows.push(["Weight", own ? formatKg(own.mass) + (row.massRule === "backpack" ? " empty, plus what is inside it"
    : row.massRule ? ", changing with what it holds or its state" : "") + ` (${COM.watchBarPercent(own.mass)}% of the watch's weight bar in your hand)`
    : massReady ? "no weight data" : "loading item weights…"]);
  const info = VALIDATOR.itemInfo(id, buildSecurityLevel);
  rows.push(["Invention machine", info.vanillaCap === null ? "the game's machine never saves it as a stuck part" : `the game's machine saves up to ${info.vanillaCap} as stuck parts of one invention`]);
  const level = buildSecurityLevel || BUILD_POLICY.securityLevel;
  const levelRules = BUILD_POLICY.securityLevels[level] || [];
  // The level's limits count stuck parts only (owner 2026-10-30): anything may ride inside a bag or be loaded into a holder.
  const inside = "; anything may ride inside a bag or be loaded, and those don't count";
  rows.push(["Deliveries", BUILD_POLICY.bannedItems.includes(id) ? "never: it is banned"
    : levelRules.includes("vanillaRefusedItems") && info.vanillaCap === null ? `not as a stuck part in ${level} mode, which follows the game's machine${inside}`
    : levelRules.includes("vanillaItemCaps") && info.vanillaCap !== null ? `up to ${info.vanillaCap} as stuck parts in ${level} mode${inside}`
    : "no limit of its own; the build's lag score decides"]);
  rows.push(["Voice bot", BUILD_POLICY.bannedItems.includes(id) || BUILD_POLICY.voiceBannedItems.includes(id) ? "never uses it" : `up to ${info.limit} in one build`]);
  const groups = info.families.map((key) => BUILD_POLICY.families.loose.find((family) => family.key === key)?.name || key);
  if (BUILD_POLICY.explosives.ids.includes(id)) groups.unshift("explosives");
  if (groups.length) rows.push(["Counts as", [...new Set(groups)].join(", ")]);
  const notes = [RULES.isGun(id) ? "a gun" : "", RULES.containerRule(id) ? "holds items" : "",
    RULES.NON_GOOP_PREFAB_IDS.has(id) ? "not grabbable: bags and quivers only" : "", RULES.RECORD_ONLY_ITEM_IDS.has(id) ? "glitched: bags only" : ""].filter(Boolean);
  if (notes.length) rows.push(["Notes", notes.join(", ")]);
  return rows;
}

function openItemInfo(itemId) {
  $("itemInfoTitle").textContent = state.catalogById.get(itemId)?.name || itemId;
  $("itemInfoId").textContent = itemId;
  const list = $("itemInfoList");
  list.textContent = "";
  for (const [label, text] of itemInfoRows(itemId)) {
    const term = document.createElement("dt");
    term.textContent = label;
    const detail = document.createElement("dd");
    detail.textContent = text;
    list.append(term, detail);
  }
  $("itemInfoDialog").showModal();
}

function itemInfoButton(itemId, inTile) {
  // A tile is itself a button, so its ⓘ is a span; a list row gets a real button.
  const button = document.createElement(inTile ? "span" : "button");
  button.className = "itemInfoBtn";
  button.textContent = "ⓘ";
  button.title = `${itemId}: value, weight and limits`;
  button.setAttribute("aria-label", `${itemId}: value, weight and limits`);
  if (inTile) button.setAttribute("role", "button");
  else button.type = "button";
  button.addEventListener("click", (event) => { event.stopPropagation(); openItemInfo(itemId); });
  button.addEventListener("dblclick", (event) => event.stopPropagation());
  return button;
}

// A build's total value: every item in it, the ones stuck on it and the ones stored inside bags and launchers (the game
// adds a bag's contents to its sell value). `unknown` counts items newer than the value list.
function inventionValue(root) {
  const out = { total: 0, unknown: 0 };
  const visit = (node) => {
    if (!node || typeof node !== "object" || !node.itemID) return;
    const value = itemValueOf(node.itemID);
    if (value === null) out.unknown++;
    else out.total += value;
    for (const edge of Array.isArray(node.stuckChildren) ? node.stuckChildren : []) visit(edge?.item);
    for (const entry of [...(Array.isArray(node.children) ? node.children : []), ...(Array.isArray(node.containerContents) ? node.containerContents : [])]) {
      visit(entry?.item ?? entry);
    }
  };
  visit(root);
  return out;
}

function renderItemList() {
  itemThumbnailObserver?.disconnect();
  itemThumbnailObserver = null;
  const q = $("itemSearch").value.trim().toLowerCase();
  const category = $("itemCategory").value;
  const sort = $("itemSort").value;
  const list = $("itemList");
  list.textContent = "";
  if (itemCatalogView === "thumbnails") list.classList.add("thumbnails");
  else list.classList.remove("thumbnails");
  if (itemCatalogView === "thumbnails" && typeof IntersectionObserver === "function") {
    const observer = new IntersectionObserver((observations) => {
      for (const observation of observations) {
        if (!observation.isIntersecting) continue;
        const image = observation.target;
        observer.unobserve(image);
        if (image.isConnected) image.src = image.dataset.src;
      }
    }, { root: list, rootMargin: "120px 0px" });
    itemThumbnailObserver = observer;
  }
  let selectedRow = null;
  const visible = catalogEntries()
    .filter((entry) => {
      if (category && catalogCategory(entry) !== category) return false;
      if (!q) return true;
      if (entry.item_id.toLowerCase().includes(q)) return true;
      if (SOUNDBOARD_ITEM_ID_RE.test(entry.item_id) && "soundboard sound board".includes(q)) return true;
      if (catalogCollection(entry).toLowerCase().includes(q)) return true;
      const cat = state.catalogById.get(entry.item_id);
      return !!(cat && ((cat.name || "").toLowerCase().includes(q) || (cat.category || "").toLowerCase().includes(q)));
    })
    .sort((a, b) => sort === "name"
      ? itemCatalogCollator.compare(catalogLabel(a), catalogLabel(b)) || itemCatalogCollator.compare(a.item_id, b.item_id)
      : sort === "category"
        ? itemCatalogCollator.compare(catalogCategory(a), catalogCategory(b)) || itemCatalogCollator.compare(catalogLabel(a), catalogLabel(b)) || itemCatalogCollator.compare(a.item_id, b.item_id)
        : sort === "collection"
          ? Number(!catalogCollection(a)) - Number(!catalogCollection(b)) ||
            itemCatalogCollator.compare(catalogCollection(a), catalogCollection(b)) ||
            itemCatalogCollator.compare(catalogLabel(a), catalogLabel(b)) || itemCatalogCollator.compare(a.item_id, b.item_id)
        : sort === "firstSeen"
          ? catalogFirstSeen(b) - catalogFirstSeen(a) ||
            itemCatalogCollator.compare(catalogLabel(a), catalogLabel(b)) || itemCatalogCollator.compare(a.item_id, b.item_id)
        : MONEY_SORTS[sort]
          ? compareItemMoney(a, b, ...MONEY_SORTS[sort]) ||
            itemCatalogCollator.compare(catalogLabel(a), catalogLabel(b)) || itemCatalogCollator.compare(a.item_id, b.item_id)
        : itemCatalogCollator.compare(a.item_id, b.item_id));
  const fragment = typeof document.createDocumentFragment === "function" ? document.createDocumentFragment() : list;
  const thumbnailImages = [];
  for (const entry of visible) {
    const isTile = itemCatalogView === "thumbnails";
    const row = document.createElement(isTile ? "button" : "div");
    row.className = (isTile ? "itemTile" : "itemRow") +
      (state.selectedEntry === entry ? " selected" : "") + (entry.exists ? "" : " noModel");
    if (state.selectedEntry === entry) selectedRow = row;
    const cat = state.catalogById.get(entry.item_id);
    // The 3D model's size ("tri" read as trillions, a moderator 2026-10-30).
    const meta = entry.exists ? `${Number(entry.triangle_count || 0).toLocaleString()} triangles` : "no model";
    const badges = [RULES.isGun(entry.item_id) ? "gun" : "", RULES.containerRule(entry.item_id) ? "holds items" : "", RULES.NON_GOOP_PREFAB_IDS.has(entry.item_id) ? "no goop" : "", RULES.RECORD_ONLY_ITEM_IDS.has(entry.item_id) ? "glitched: bags only" : "", SOUNDBOARD_ITEM_ID_RE.test(entry.item_id) ? "soundboard" : ""].filter(Boolean);
    const collection = catalogCollection(entry);
    const firstSeen = catalogFirstSeen(entry);
    const value = itemValueOf(entry.item_id);
    if (isTile) {
      row.type = "button";
      row.dataset.itemId = entry.item_id;
      row.setAttribute("aria-pressed", String(state.selectedEntry === entry));
      const description = [entry.item_id, cat?.name, value === null ? "" : itemMoneyText(entry.item_id, "price"), meta, ...badges, collection,
        firstSeen ? `tracked since ${firstSeen}` : ""].filter(Boolean).join(", ");
      row.setAttribute("aria-label", description);
      row.title = description;
      const visual = document.createElement("span");
      visual.className = "itemTileVisual";
      const fallback = document.createElement("span");
      fallback.className = "itemTileFallback";
      fallback.textContent = entry.exists ? "Loading preview" : "No model";
      visual.appendChild(fallback);
      if (entry.exists) {
        const image = document.createElement("img");
        image.className = "itemTileImage";
        image.alt = "";
        image.loading = "lazy";
        image.decoding = "async";
        image.dataset.src = `./item_thumbnails/${encodeURIComponent(entry.item_id)}.webp?v=${String(entry.sha256 || "").slice(0, 16)}`;
        image.addEventListener("load", () => { fallback.hidden = true; });
        image.addEventListener("error", () => {
          image.hidden = true;
          fallback.textContent = "No preview";
          fallback.hidden = false;
        });
        visual.appendChild(image);
        if (itemThumbnailObserver) thumbnailImages.push(image);
        else image.src = image.dataset.src;
      }
      const idText = document.createElement("span");
      idText.className = "itemTileId";
      idText.textContent = entry.item_id;
      const nameText = document.createElement("span");
      nameText.className = "itemTileName";
      nameText.textContent = cat?.name || meta;
      const tagText = document.createElement("span");
      tagText.className = "itemTileTags" + (badges.includes("no goop") ? " noGoopBadge" : "");
      // Sorted by store price or sell value, each tile says it (a list row always shows it).
      tagText.textContent = MONEY_SORTS[sort] ? [itemMoneyText(entry.item_id, sort), ...badges].join(" · ")
        : badges.join(" · ") || meta;
      row.append(visual, idText, nameText, tagText, itemInfoButton(entry.item_id, true));
    } else {
      const label = document.createElement("div");
      label.append(document.createTextNode(entry.item_id));
      for (const badgeText of badges) {
        const badge = document.createElement("span");
        badge.className = badgeText === "no goop" ? "noGoopBadge" : "treeMeta";
        badge.textContent = ` ${badgeText}`;
        label.append(badge);
      }
      label.append(itemInfoButton(entry.item_id, false));
      const detail = document.createElement("div");
      detail.className = "itemMeta";
      detail.textContent = `${cat && cat.name ? cat.name + " / " : ""}${value === null ? "" : `${itemMoneyText(entry.item_id, sort)} · `}${meta}` +
        (collection ? ` · ${collection}` : "") + (firstSeen ? ` · tracked since ${firstSeen}` : "");
      row.append(label, detail);
    }
    row.addEventListener("click", () => {
      state.selectedEntry = entry;
      if (selectedRow !== row) {
        if (selectedRow) {
          selectedRow.classList.remove("selected");
          if (isTile) selectedRow.setAttribute("aria-pressed", "false");
        }
        row.classList.add("selected");
        if (isTile) row.setAttribute("aria-pressed", "true");
        selectedRow = row;
      }
      renderContentsPanel(state.selected);
      if (RULES.RECORD_ONLY_ITEM_IDS.has(entry.item_id)) {
        setStatus(`${entry.item_id} is a glitched item: it has no prefab, so it can only go inside a backpack or quiver (select the bag, then Put inside). The bag shows it as "Unknown Item" with the placeholder thumbnail, and taking it out leaves it in the bag.`);
      } else if (RULES.NON_GOOP_PREFAB_IDS.has(entry.item_id)) {
        setStatus(`${entry.item_id} is not grabbable: it cannot be a part of a build, but it can go inside a bag or quiver (Put inside). In game, each pull from a quiver spawns one real ${entry.item_id} and removes it; a bag spawns a new one every take-out and keeps it, and a tipped open bag spawns one every network tick (a room flood), so use a quiver for giveaways.`, "bad");
      } else {
        setStatus(`Selected ${entry.item_id}${entry.exists ? "" : " (no exported model; shown as a box)"}`);
      }
    });
    row.addEventListener("dblclick", () => addObject(entry.item_id, rootRecord() ? "child" : "root"));
    fragment.appendChild(row);
  }
  if (fragment !== list) list.appendChild(fragment);
  if (itemThumbnailObserver) for (const image of thumbnailImages) itemThumbnailObserver.observe(image);
}

function renderHierarchyTree() {
  const list = $("hierarchyTree");
  if (!list) return;
  list.textContent = "";
  const root = rootRecord();
  const rootAction = $("addRootBtn");
  rootAction.textContent = root ? "Replace root" : "Set root";
  rootAction.title = root
    ? "Replace the root with the selected catalog item; keep children, contents and displayed poses"
    : "Use the selected catalog item as the invention root";
  $("rootActionNote").textContent = root
    ? "Choose another item, then Replace root. Attached parts and contents stay."
    : "Choose an item, then Set root.";
  if (!root) {
    const empty = document.createElement("div");
    empty.className = "treeEmpty";
    empty.textContent = "No invention loaded";
    list.appendChild(empty);
    syncParentTargetUi();
    return;
  }
  function addRow(record, depth) {
    const row = document.createElement("div");
    row.className = "treeRow" +
      (state.selectedUids.has(record.uid) ? " selected" : "") +
      (record === state.selected ? " primary" : "") +
      (record.uid === state.parentTargetUid ? " parentTarget" : "");
    row.style.paddingLeft = `${8 + depth * 14}px`;
    row.dataset.uid = String(record.uid);
    const marker = record.children.length ? "v" : "-";
    const addSpan = (cls, value) => {
      const span = document.createElement("span");
      span.className = cls;
      span.textContent = value;
      row.appendChild(span);
    };
    addSpan("treeMarker", marker);
    addSpan("treeName", record.itemID);
    if (record.role !== "root" && record.subParentID !== 0) addSpan("treeBadge stick", `@${record.subParentID}`);
    if (record.frozenEdge) addSpan("treeBadge frozen", "verbatim");
    if (record.contents && record.contents.length) addSpan("treeBadge", `${record.contents.length} inside`);
    if (RULES.isGun(record.itemID) && !(Number(record.ammo) > 0)) addSpan("treeBadge frozen", "empty");
    const group = groupForRecord(record);
    if (group) {
      addSpan("treeBadge group", group.name.length > 14 ? `${group.name.slice(0, 13)}…` : group.name);
      row.lastChild.title = `In group ${group.name}: a click selects the whole group, Alt-click selects just this part`;
    }
    addSpan("treeMeta", `#${record.uid}`);
    row.addEventListener("click", (event) => pickRecord(record, event));
    row.addEventListener("dblclick", (event) => {
      event.stopPropagation();
      setParentTarget(record);
    });
    list.appendChild(row);
    for (const uid of record.children) {
      const child = recordByUid(uid);
      if (child) addRow(child, depth + 1);
    }
  }
  addRow(root, 0);
  syncParentTargetUi();
}

// ---- save / load ----
async function saveToServer() {
  const document = activeDocument();
  const data = buildGoopJson();
  if (!data) return setStatus("Nothing to save", "bad");
  if (state.lastValidation && state.lastValidation.errors.length) {
    setStatus(`Saving with ${state.lastValidation.errors.length} validation error(s); see the Validation panel.`, "bad");
  }
  if (!state.serverApi) return downloadJson();
  const res = await fetch("./api/save", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ filename: $("filenameInput").value, data })
  });
  const body = await res.json();
  if (!res.ok || !body.ok) return setStatus(body.error || "Save failed", "bad");
  if (document && activeDocument() === document) {
    document.filename = body.filename || $("filenameInput").value;
    document.savedSignature = JSON.stringify(data);
    document.dirty = document.savedMetaSignature === null ||
      documentMetadataSignature(document) !== document.savedMetaSignature;
    renderDocumentList();
  }
  setStatus(`Saved ${body.filename} to goop_captures`, "good");
}

function downloadJson() {
  const activeDoc = activeDocument();
  const data = buildGoopJson();
  if (!data) return setStatus("Nothing to download", "bad");
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = $("filenameInput").value || "goop_editor_export.json";
  a.click();
  URL.revokeObjectURL(a.href);
  if (activeDoc) {
    activeDoc.filename = a.download;
    activeDoc.savedSignature = JSON.stringify(data);
    activeDoc.dirty = activeDoc.savedMetaSignature === null ||
      documentMetadataSignature(activeDoc) !== activeDoc.savedMetaSignature;
    renderDocumentList();
  }
}

// The ghost player's preview state travels with workspace projects, Workshop
// shares, undo history, and local backups. Which invention is on which
// attachment point is each document's own preview data.
const GHOST_STATE_SCHEMA = "goop-editor.ghost-state.v1";

function exportGhostState() {
  const moved = !!state.referenceMoved;
  return {
    schema: GHOST_STATE_SCHEMA,
    visible: !!$("showGhostRig")?.checked,
    animal: String($("ghostAnimal")?.value || ""),
    handTracking: $("handTrackingProfile")?.value === "standard" ? "standard" : "openxr",
    textured: !!$("showGorillaReference")?.checked,
    wearer: moved ? {
      position: ghostRig.position.toArray().map((value) => Number(value.toFixed(5))),
      yawDegrees: Number(THREE.MathUtils.radToDeg(ghostRig.rotation.y).toFixed(3)),
      scale: Number(ghostRig.scale.x.toFixed(4)),
    } : null,
    sightLine: { visible: !!$("showSightLine")?.checked, distance: clamp(Number($("sightDistance")?.value) || 3, 0.25, 20) },
    pose: normalizeGhostPose(state.ghostPose),
    crossbow: state.ghostCrossbow.itemID ? { itemID: state.ghostCrossbow.itemID, slot: ghostCrossbowSlot(state.ghostCrossbow.slot),
      scaleModifier: state.ghostCrossbow.scaleModifier } : null,
  };
}

async function applyGhostState(raw, { record = false } = {}) {
  if (!raw || raw.schema !== GHOST_STATE_SCHEMA) return false;
  const animal = String(raw.animal || "");
  if (animal && animal !== $("ghostAnimal").value &&
      [...$("ghostAnimal").options].some((option) => option.value === animal)) {
    $("ghostAnimal").value = animal;
    await loadAvatarMesh();
  }
  $("handTrackingProfile").value = raw.handTracking === "standard" ? "standard" : "openxr";
  $("showGhostRig").checked = !!raw.visible;
  $("showGorillaReference").checked = !!raw.textured;
  $("showSightLine").checked = raw.sightLine?.visible !== false;
  $("sightDistance").value = String(clamp(Number(raw.sightLine?.distance) || 3, 0.25, 20));
  const wearer = raw.wearer;
  if (raw.textured && wearer && Array.isArray(wearer.position) && wearer.position.every(Number.isFinite)) {
    state.referenceMoved = true;
    ghostRig.position.fromArray(wearer.position);
    ghostRig.rotation.set(0, THREE.MathUtils.degToRad(Number(wearer.yawDegrees) || 0), 0);
    ghostRig.scale.setScalar(clamp(Number(wearer.scale) || 1, 0.1, 5));
    ghostRig.updateMatrixWorld(true);
    syncReferenceFields();
  } else {
    state.referenceMoved = false;
  }
  syncWearerMaterial();
  for (const document of state.documents) applyDocumentPreviewPlacement(document);
  state.ghostPose = normalizeGhostPose(raw.pose);
  state.armPoseRevision++;
  const crossbow = raw.crossbow && typeof raw.crossbow === "object" ? raw.crossbow : null;
  state.ghostCrossbow = {
    itemID: crossbow && HOLDER.crossbowHolder(crossbow.itemID) ? String(crossbow.itemID) : "",
    slot: ghostCrossbowSlot(crossbow?.slot, crossbow?.hand),
    scaleModifier: Math.round(clamp(Number(crossbow?.scaleModifier) || 0, -128, 127)),
  };
  syncGhostCrossbowFields();
  updateGhostPreview();
  syncPoseFields();
  syncPoseGizmo();
  if (record) observeEditorHistory();
  return true;
}

function exportWorkspaceProject() {
  const model = new InventionWorkspace();
  for (const document of state.documents) {
    const root = buildGoopJson(document.id);
    if (!root) continue;
    syncDocumentPreviewFromRoot(document);
    model.addDocument({ id: document.id, name: document.name, root, dirty: document.dirty,
      preview: { ...document.preview, attachment: MODEL_ATTACHMENTS[document.preview.attachment] || "free" },
      activate: document.id === state.activeDocumentId });
  }
  const project = model.exportProject();
  for (const item of project.documents) item.filename = state.documents.find((document) => document.id === item.id)?.filename;
  project.ghost = exportGhostState();
  project.groups = exportGroupsForProject();
  return project;
}

function downloadWorkspaceProject() {
  const project = exportWorkspaceProject();
  if (!project.documents.length) return setStatus("Add an invention before saving a workspace.", "bad");
  for (const item of project.documents) item.dirty = false;
  const blob = new Blob([JSON.stringify(project, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "mikeybox_body_arms.workspace.json";
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  for (const document of state.documents) {
    const root = buildGoopJson(document.id);
    if (!root) continue;
    document.savedSignature = JSON.stringify(root);
    document.savedMetaSignature = documentMetadataSignature(document);
    document.dirty = false;
  }
  renderDocumentList();
  setStatus(`Saved workspace project with ${project.documents.length} separate inventions.`, "good");
}

// Browser-local recovery is separate from the downloadable game JSON and from
// the in-memory Undo stack. Store the editor snapshot as well as a portable
// workspace project so a future editor version can still recover its items.
function recoverySessionId() {
  const key = "mikeybox_goop_recovery_session_v1";
  let id = "";
  try { id = sessionStorage.getItem(key) || ""; } catch (_) {}
  if (!/^[a-f0-9-]{36}$/.test(id)) {
    id = crypto.randomUUID();
    try { sessionStorage.setItem(key, id); } catch (_) {}
  }
  return id;
}

function updateRecoveryButton(count = recovery.count || 0) {
  recovery.count = count;
  const button = $("recoveryBtn");
  if (!button) return;
  button.textContent = count ? `Backups (${count})` : "Backups";
  button.classList.toggle("recoveryError", Boolean(recovery.error));
  button.title = recovery.error
    ? `Local backups unavailable: ${recovery.error.message || recovery.error}`
    : `${count} local workspace backup${count === 1 ? "" : "s"} on this browser`;
}

function recoveryFailure(error) {
  recovery.error = error instanceof Error ? error : new Error(String(error));
  updateRecoveryButton();
  if ($("recoveryDialog")?.open) $("recoveryStatus").textContent = recovery.error.message;
  return recovery.error;
}

async function recoveryFingerprint(snapshot) {
  const canonical = editorDocumentSignature({ ...snapshot, activeDocumentId: undefined });
  const bytes = new TextEncoder().encode(canonical);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), (value) => value.toString(16).padStart(2, "0")).join("");
}

function saveRecoveryNow(reason = "manual") {
  if (editorHistory.groupActive && ["automatic", "leaving", "first edit", "manual"].includes(reason)) {
    recovery.pendingAfterGroup = true;
    return Promise.resolve(null);
  }
  if (!state.documents.length || !state.objects.some((record) => record.role === "root")) {
    return Promise.resolve(null);
  }
  // Capture before the first await, including for Delete and Clear. Their
  // following synchronous mutation must not change what this backup contains.
  let project, snapshot;
  try {
    project = exportWorkspaceProject();
    snapshot = captureEditorSnapshot();
    snapshot.recoveryFormatVersion = RECOVERY_FORMAT_VERSION;
    snapshot.recoveryBuildId = String(state.scaleManifest?.buildId || "");
  } catch (error) { return Promise.reject(recoveryFailure(error)); }
  if (!project.documents.length) return Promise.resolve(null);
  const label = `${project.documents.length} invention${project.documents.length === 1 ? "" : "s"}: ${
    state.documents.map((document) => document.name).join(", ")}`.slice(0, 240);
  const createdAt = Date.now();
  const work = recovery.saveChain.catch(() => {}).then(async () => {
    if (recovery.initPromise) await recovery.initPromise;
    if (!recovery.store) throw recovery.error || new Error("Local backups are unavailable in this browser.");
    const fingerprint = await recoveryFingerprint(snapshot);
    if (fingerprint === recovery.latestFingerprint) return null;
    const saved = await recovery.store.save({ sessionId: recovery.sessionId, createdAt,
      reason, label, snapshot, project, fingerprint });
    recovery.latestFingerprint = fingerprint;
    recovery.lastSavedAt = createdAt;
    recovery.sessionHasBackup = true;
    recovery.error = null;
    if (recovery.firstEditTimer) { clearTimeout(recovery.firstEditTimer); recovery.firstEditTimer = null; }
    const list = await recovery.store.list();
    updateRecoveryButton(list.length);
    if ($("recoveryDialog")?.open) void renderRecoveryList();
    return saved;
  });
  recovery.saveChain = work.catch(() => {});
  return work.catch((error) => { throw recoveryFailure(error); });
}

function queueRecoverySafetySnapshot(reason) {
  if (state.documents.length) void saveRecoveryNow(reason).catch(() => {});
}

function scheduleFirstRecoveryBackup() {
  if (recovery.sessionHasBackup || recovery.firstEditTimer || !state.documents.length) return;
  recovery.firstEditTimer = setTimeout(() => {
    recovery.firstEditTimer = null;
    if (historyRestoring || editorHistory.groupActive) return scheduleFirstRecoveryBackup();
    void saveRecoveryNow("first edit").catch(() => {});
  }, RECOVERY_FIRST_EDIT_DELAY_MS);
}

const RECOVERY_REASONS = {
  automatic: "Automatic", "first edit": "First edit", manual: "Saved now",
  "before delete": "Before delete", "before clear": "Before clear",
  "before restore": "Before restore", restored: "Restored workspace", leaving: "Leaving page"
};

async function renderRecoveryList() {
  const listEl = $("recoveryList");
  listEl.replaceChildren();
  if (recovery.initPromise) await recovery.initPromise;
  if (!recovery.store) {
    $("recoveryStatus").textContent = recovery.error?.message || "Local backups are unavailable in this browser.";
    return [];
  }
  try {
    const rows = await recovery.store.list();
    recovery.latestFingerprint = rows[0]?.fingerprint || null;
    recovery.error = null;
    updateRecoveryButton(rows.length);
    $("recoveryStatus").textContent = rows.length
      ? `${rows.length} of 20 backups saved on this browser.`
      : "No backups yet. Add an invention, then use Save backup now or keep editing.";
    for (const item of rows) {
      const row = document.createElement("div"); row.className = "recoveryRow";
      const title = document.createElement("div"); title.className = "recoveryRowTitle";
      title.textContent = item.label;
      const meta = document.createElement("span"); meta.className = "recoveryRowMeta";
      const when = new Date(item.createdAt).toLocaleString();
      meta.textContent = `${when} · ${RECOVERY_REASONS[item.reason] || item.reason}`;
      title.append(meta);
      const restore = document.createElement("button");
      restore.type = "button"; restore.className = "recoveryRestoreBtn";
      restore.dataset.snapshotId = String(item.id);
      restore.textContent = "Restore";
      restore.setAttribute("aria-label", `Restore ${item.label} from ${when}`);
      restore.addEventListener("click", () => { void restoreRecoveryBackup(item.id); });
      const remove = document.createElement("button");
      remove.type = "button"; remove.className = "recoveryDeleteBtn";
      remove.dataset.snapshotId = String(item.id);
      remove.textContent = "Remove";
      remove.setAttribute("aria-label", `Remove backup ${item.label} from ${when}`);
      remove.addEventListener("click", async () => {
        remove.disabled = true;
        try { await recovery.store.remove(item.id); await renderRecoveryList(); }
        catch (error) { recoveryFailure(error); remove.disabled = false; }
      });
      row.append(title, restore, remove);
      listEl.append(row);
    }
    return rows;
  } catch (error) {
    recoveryFailure(error);
    return [];
  }
}

function validRecoverySnapshot(snapshot) {
  return snapshot?.recoveryFormatVersion === RECOVERY_FORMAT_VERSION &&
    Array.isArray(snapshot.documents) && Array.isArray(snapshot.objects) &&
    Array.isArray(snapshot.selectedUids) && Array.isArray(snapshot.selectionGroups) &&
    Number.isSafeInteger(snapshot.nextUid) && Number.isSafeInteger(snapshot.nextDocumentId) &&
    snapshot.objects.every((record) => record && Number.isSafeInteger(record.uid) &&
      Array.isArray(record.children) && Array.isArray(record.position) &&
      record.position.length === 3 && Array.isArray(record.quaternion) &&
      record.quaternion.length === 4);
}

function restoreRecoverySelectionGroups(snapshot) {
  if (!validRecoverySnapshot(snapshot)) return;
  const oldRecords = new Map(snapshot.objects.map((record) => [record.uid, record]));
  const mapped = new Map();
  const mapSubtree = (oldRecord, newRecord) => {
    if (!oldRecord || !newRecord || oldRecord.itemID !== newRecord.itemID) return;
    mapped.set(oldRecord.uid, newRecord.uid);
    for (let i = 0; i < oldRecord.children.length; i++) {
      mapSubtree(oldRecords.get(oldRecord.children[i]), recordByUid(newRecord.children[i]));
    }
  };
  for (const document of snapshot.documents) {
    const oldRoot = snapshot.objects.find((record) => record.role === "root" && record.documentId === document.id);
    mapSubtree(oldRoot, documentRoot(document.id));
  }
  state.selectionGroups = snapshot.selectionGroups.filter((group) => group && Array.isArray(group.uids))
    .map((group) => ({ ...group, uids: group.uids.map((uid) => mapped.get(uid)).filter(Number.isSafeInteger) }))
    .filter((group) => group.uids.length);
  renderSelectionGroups();
}

async function restoreRecoveryBackup(id) {
  if (editorHistory.groupActive) {
    $("recoveryStatus").textContent = "Wait for the current import or model load to finish, then restore.";
    return;
  }
  const buttons = $("recoveryList").querySelectorAll("button");
  for (const button of buttons) button.disabled = true;
  try {
    const saved = await recovery.store.get(id);
    if (!saved) throw new Error("That backup is no longer available.");
    const useSnapshot = validRecoverySnapshot(saved.snapshot) &&
      saved.snapshot.recoveryBuildId === String(state.scaleManifest?.buildId || "");
    if (!useSnapshot && !isWorkspaceProject(saved.project)) {
      throw new Error("This backup has no compatible workspace data to restore.");
    }
    if (state.documents.length) await saveRecoveryNow("before restore");
    if (useSnapshot) {
      clearWorkshopAssociation();
      restoreEditorSnapshot(saved.snapshot);
      observeEditorHistory();
    } else {
      await loadWorkspaceProject(saved.project);
      restoreRecoverySelectionGroups(saved.snapshot);
    }
    await saveRecoveryNow("restored");
    $("recoveryDialog").close();
    setStatus(`Restored ${saved.label}${useSnapshot ? "" : " through the current workspace importer"}.`, "good");
  } catch (error) {
    $("recoveryStatus").textContent = `Restore failed: ${error.message || error}`;
    for (const button of buttons) button.disabled = false;
  }
}

async function showRecoveryDialog() {
  const dialog = $("recoveryDialog");
  if (!dialog.open) dialog.showModal();
  await renderRecoveryList();
}

async function initRecovery() {
  recovery.sessionId = recoverySessionId();
  try {
    recovery.store = new RecoveryStore();
    let rows;
    for (let attempt = 0; attempt < 3; attempt++) {
      try { rows = await recovery.store.list(); break; }
      catch (error) {
        if (attempt === 2) throw error;
        await new Promise((resolve) => setTimeout(resolve, 150 * (attempt + 1)));
      }
    }
    recovery.latestFingerprint = rows[0]?.fingerprint || null;
    recovery.lastSavedAt = rows[0]?.createdAt || 0;
    recovery.error = null;
    recovery.ready = true;
    updateRecoveryButton(rows.length);
  } catch (error) {
    recoveryFailure(error);
    // A reload can interrupt the first IndexedDB open while the old page is
    // closing. Keep the store so opening Backups or the next save can retry.
    if (!recovery.store) return;
  } finally {
    $("recoveryBtn").disabled = false;
    if ($("recoveryDialog")?.open) void renderRecoveryList();
  }
  setInterval(() => { void saveRecoveryNow("automatic").catch(() => {}); }, RECOVERY_INTERVAL_MS);
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) void saveRecoveryNow("leaving").catch(() => {});
    else if (state.documents.length && Date.now() - recovery.lastSavedAt >= RECOVERY_INTERVAL_MS)
      void saveRecoveryNow("automatic").catch(() => {});
  });
  window.addEventListener("pagehide", () => { void saveRecoveryNow("leaving").catch(() => {}); });
}

function stuckRouteForRecord(record) {
  const route = [];
  let current = record;
  while (current && current !== rootRecord()) {
    const parent = parentOf(current);
    if (!parent) throw new Error("The selected import target is not in this invention.");
    const index = parent.children.indexOf(current.uid);
    if (index < 0) throw new Error("The selected import target has changed; select it again.");
    route.unshift(index);
    current = parent;
  }
  if (!current) throw new Error("Add a root item before importing.");
  return route;
}

function updateImportTargetNote() {
  const mode = $("importMode").value;
  const target = mode === "inside" ? state.selected : parentTargetRecord();
  const rule = target && RULES.containerRule(target.itemID);
  $("importTargetNote").textContent = mode === "attach"
    ? (target ? `Attach imported roots under Add Parent: ${displayName(target)}. They will be editable stuck items.`
      : "Add a root item first, then choose an Add Parent.")
    : (rule ? `Put full inventions inside ${displayName(target)} (${(target.contents || []).length} / ${rule.capacity} slots used). Contents have no editable pose until taken out.`
      : "Select a backpack, quiver, or crossbow in the Hierarchy before importing inside it.");
}

function assertImportTargetCurrent(epoch, target, targetItemId) {
  if (state.sceneEpoch !== epoch || !state.objects.includes(target) || target.itemID !== targetItemId) {
    throw new Error("The invention or import target changed while files were loading. Reopen Import inventions and try again.");
  }
}

async function importInventionFiles(event) {
  event.preventDefault();
  const message = $("importMessage");
  const button = $("importSubmitBtn");
  if (button.disabled) return;
  button.disabled = true;
  beginEditorHistoryGroup();
  const closeButton = $("importCloseBtn");
  closeButton.disabled = true;
  const mode = $("importMode").value;
  const target = mode === "inside" ? state.selected : parentTargetRecord();
  const epoch = state.sceneEpoch;
  const targetItemId = target?.itemID;
  const files = Array.from($("importFileInput").files || []);
  try {
    let data;
    try {
      if (!target) throw new Error("Choose an import target first.");
      if (mode === "attach" && target.frozenEdge) throw new Error("This Add Parent has an unprobed pose; choose an editable parent.");
      if (!files.length || files.length > 32) throw new Error("Choose 1–32 invention JSON files.");
      data = [];
      for (const file of files) {
        if (file.size > 4 * 1024 * 1024) throw new Error(`${file.name} exceeds the 4 MB file limit.`);
        const invention = RULES.unwrapInvention(JSON.parse(await file.text()));
        assertImportTargetCurrent(epoch, target, targetItemId);
        if (!invention) throw new Error(`${file.name} has no invention root itemID.`);
        data.push(invention);
      }
      planInventionImport(buildGoopJson(), stuckRouteForRecord(target), data, mode,
        { knownIds: state.knownIds, bannedIds: state.bannedIds,
          holderRefusal: (holderItemID, itemID) => holderAddRefusalText(target, [], target, itemID) });
    } catch (err) {
      message.textContent = String(err.message || err);
      setStatus(`Import refused: ${message.textContent}`, "bad");
      return;
    }

    const oldContents = (target.contents || []).slice();
    const created = [];
    const assertCurrent = () => assertImportTargetCurrent(epoch, target, targetItemId);
    try {
      assertCurrent();
      if (mode === "inside") {
        target.contents = oldContents.concat(data.map((item) => deepClone(item)));
        syncInspectorFromSelection();
        refreshPreview();
      } else {
        const added = [];
        for (const [index, item] of data.entries()) {
          assertCurrent();
          const record = makeObjectRecord(item.itemID, "child");
          record.documentId = target.documentId;
          applyItemFields(record, item);
          record.group.position.set(0.35 + index * 0.25, 0.1, 0);
          record.group.quaternion.identity();
          record.hierarchyDirty = true;
          record.transformDirty = true;
          state.objects.push(record);
          created.push(record);
          linkToParent(record, target, false);
          await attachModel(record);
          assertCurrent();
          await loadStuckChildren(record, Array.isArray(item.stuckChildren) ? item.stuckChildren : [], assertCurrent, created);
          added.push(record);
        }
        setSelection(added, added[0]);
      }
      $("importDialog").close();
      $("importFileInput").value = "";
      setStatus(`Imported ${data.length} invention(s) ${mode === "inside" ? `inside ${displayName(target)}` : `under ${displayName(target)}`}.`, "good");
    } catch (err) {
      if (state.objects.includes(target)) target.contents = oldContents;
      const createdSet = new Set(created);
      for (const record of created) {
        const parent = parentOf(record);
        if (parent) parent.children = parent.children.filter((uid) => uid !== record.uid);
        record.group.parent?.remove(record.group);
      }
      state.objects = state.objects.filter((record) => !createdSet.has(record));
      syncInspectorFromSelection();
      renderHierarchyTree();
      refreshPreview();
      message.textContent = String(err.message || err);
      setStatus(`Import failed: ${message.textContent}`, "bad");
    }
  } finally {
    button.disabled = false;
    closeButton.disabled = false;
    endEditorHistoryGroup();
  }
}

function clearWorkshopAssociation() {
  if (workshopLive?.active) leaveWorkshopLive("Loaded different local content.");
  workshopProject = null;
  $("workshopShareSection").hidden = true;
  $("workshopProjectTitle").value = "";
  $("workshopDescription").value = "";
  setWorkshopTags([]);
  $("workshopVisibility").value = "public";
}

async function loadJsonData(raw, options = {}) {
  if (isWorkspaceProject(raw)) throw new Error("This is a workspace project. Use Load workspace project.");
  const data = RULES.unwrapInvention(raw);
  if (!data) throw new Error("JSON does not have a root itemID (or a legacy {items:[...]} wrapper with one)");
  RULES.forEachNode(data, (item) => nativeItemState(item.state));
  if (!options.fromWorkshop && (!options.separate || (workshopProject && workshopProject.kind !== "workspace")))
    clearWorkshopAssociation();
  beginEditorHistoryGroup();
  try {
  const previous = !options.separate ? activeDocument() : null;
  const previousIndex = previous ? state.documents.indexOf(previous) : -1;
  const oldPreview = previous?.preview;
  if (previous) {
    await saveRecoveryNow("before clear").catch(() => {});
    clearScene({ skipRecovery: true });
  }
  const document = createDocument({ id: options.id, name: options.name || options.filename?.replace(/\.json$/i, "") || data.itemID,
    filename: options.filename || `${data.itemID}.json`,
    preview: options.preview || oldPreview || { attachment: "free", position: [0, 0, 0], rotation: [0, 0, 0, 1], visible: true },
    dirty: options.dirty ?? false });
  document.scanSourcePlayerObjectId = Number.isInteger(options.sourcePlayerObjectId) &&
    options.sourcePlayerObjectId >= 0 && options.sourcePlayerObjectId <= 4294967295
    ? options.sourcePlayerObjectId : null;
  if (previousIndex >= 0 && previousIndex < state.documents.length - 1) {
    state.documents.splice(state.documents.indexOf(document), 1);
    state.documents.splice(previousIndex, 0, document);
  }
  const sceneEpoch = state.sceneEpoch;
  const assertCurrent = () => {
    if (state.sceneEpoch !== sceneEpoch) throw new Error("The invention changed while the file was loading.");
  };
  const root = makeObjectRecord(data.itemID, "root");
  applyItemFields(root, data);
  scene.add(root.group);
  state.objects.push(root);
  applyDocumentPreviewPlacement(document);
  const stuckChildren = Array.isArray(data.stuckChildren) ? data.stuckChildren : [];
  if (!stuckChildren.length && options.deferModel === true) {
    if (state.activeDocumentId === document.id) {
      setParentTarget(root);
      selectRecord(root);
    }
    document.savedSignature = JSON.stringify(buildGoopJson(document.id));
    if (!document.dirty) document.savedMetaSignature = documentMetadataSignature(document);
    refreshPreview();
    void attachModel(root, { reportError: false }).then((attached) => {
      if (attached && state.objects.includes(root)) refreshPreview();
    }).catch((error) => {
      if (state.objects.includes(root)) setStatus(`Model failed for ${root.itemID}: ${error.message || error}`, "bad");
    });
    return;
  }
  await attachModel(root);
  assertCurrent();
  await loadStuckChildren(root, stuckChildren, assertCurrent);
  assertCurrent();
  if (state.activeDocumentId === document.id && state.selected?.documentId !== document.id) {
    setParentTarget(root);
    selectRecord(root);
  }
  document.savedSignature = JSON.stringify(buildGoopJson(document.id));
  if (!document.dirty) document.savedMetaSignature = documentMetadataSignature(document);
  refreshPreview();
  } finally {
    endEditorHistoryGroup();
  }
}

async function loadWorkspaceProject(raw, { fromWorkshop = false } = {}) {
  const workspace = InventionWorkspace.fromProject(raw);
  if (!fromWorkshop) clearWorkshopAssociation();
  beginEditorHistoryGroup();
  try {
    await saveRecoveryNow("before restore").catch(() => {});
    clearAllScene();
    for (const modelDoc of workspace.listDocuments()) {
      const original = raw.documents.find((document) => document.id === modelDoc.id);
      await loadJsonData(workspace.exportDocument(modelDoc.id), {
        separate: true, id: modelDoc.id, name: modelDoc.name,
        filename: original?.filename || `${modelDoc.name.replace(/[^a-z0-9_-]+/gi, "_")}.json`,
        preview: { ...modelDoc.preview, attachment: UI_ATTACHMENTS[modelDoc.preview.attachment] || "free" },
        dirty: modelDoc.dirty
      });
    }
    const groupsRestored = restoreProjectGroups(raw?.groups);
    if (workspace.activeDocumentId) setActiveDocument(workspace.activeDocumentId);
    renderHierarchyTree();
    const ghostRestored = await applyGhostState(raw?.ghost);
    setStatus(`Loaded workspace with ${state.documents.length} separate inventions${groupsRestored ? `, ${groupsRestored} group(s)` : ""}${ghostRestored ? " and its ghost player pose" : ""}.`, "good");
  } finally {
    endEditorHistoryGroup();
  }
}

async function loadStuckChildren(parent, stuckChildren, assertCurrent = null, created = null) {
  for (const child of stuckChildren) {
    if (assertCurrent) assertCurrent();
    if (!child || !child.item || !child.item.itemID) continue;
    const record = makeObjectRecord(child.item.itemID, "child");
    record.documentId = parent.documentId;
    applyItemFields(record, child.item);
    const { item: _sourceChild, ...edgeFields } = child;
    record.sourceStuck = deepClone(edgeFields);
    applyStuckDisplayTransform(record, child, parent);
    record.transformDirty = false;
    record.hierarchyDirty = false;
    state.objects.push(record);
    if (created) created.push(record);
    linkToParent(record, parent, false);
    await attachModel(record);
    if (assertCurrent) assertCurrent();
    await loadStuckChildren(record, Array.isArray(child.item.stuckChildren) ? child.item.stuckChildren : [], assertCurrent, created);
  }
}

// Edge (game, parent sub-frame units) -> displayed pose (editor, parent-local metres):
//   local  = edgeToParentLocal(edge, parent id, parent scale)        (goop_rules: frame + itemScale)
//   dispRot = localRot * poseRot^-1 ;  dispPos = localPos - R(dispRot) * posePos * childScale
//   on a VIEW_SCALE_MISMATCH_PARENTS prefab dispPos *= its ratio: where the game draws the part (edgeToDrawnPose)
function applyStuckDisplayTransform(record, stuck, parent) {
  const sub = Math.round(Number(stuck && stuck.subParentID) || 0);
  record.subParentID = sub;
  const display = parent ? RULES.edgeToDrawnPose(stuck || {}, parent.itemID, parent.scaleModifier,
    record.itemID, record.scaleModifier) : null;
  if (!display) {
    record.frozenEdge = true;
    record.group.position.set(0, 0, 0);
    record.group.quaternion.identity();
    return;
  }
  record.frozenEdge = false;
  record.group.position.copy(gameArrToEditorVec(display.pos));
  record.group.quaternion.copy(gameArrToEditorQuat(display.rot));
}

function applyItemFields(record, item) {
  const { children: _contents, stuckChildren: _stuck, containerContents: _legacyContents, ...itemFields } = item;
  record.sourceItem = deepClone(itemFields);
  record.scaleModifier = Math.round(clamp(item.scaleModifier || 0, -128, 127));
  record.colorHue = Math.round(clamp(item.colorHue || 0, 0, 255));
  record.colorSaturation = Math.round(clamp(item.colorSaturation || 0, -128, 127));
  record.jellyStrength = Math.round(clamp(item.jellyStrength || 0, 0, 255));
  record.state = nativeItemState(item.state);
  record.ammo = RULES.clampGunAmmo(item.itemID, item.ammo);
  record.contents = RULES.contentsOf(item).map((c) => {
    const copy = deepClone(c);
    RULES.normalizeGameAmmoTree(copy);
    return copy;
  });
}

function setMode(mode) {
  if (state.referenceActive) setReferenceMoveActive(false);
  state.mode = mode;
  // TransformControls accepts translate, rotate, or scale; selection mode has no gizmo.
  if (mode !== "select") transform.setMode(mode);
  for (const [id, value] of [["moveBtn", "translate"], ["rotateBtn", "rotate"], ["scaleBtn", "scale"]]) {
    $(id).classList.toggle("active", value === mode);
  }
  $("selectBtn").classList.toggle("active", mode === "select");
  attachTransformToSelection();
  if ((mode === "translate" || mode === "rotate") && rootRecord() && state.selectedUids.has(rootRecord().uid)) {
    setStatus("Root placement moves the whole invention in this editor. The game chooses its world pose when spawned; saved child offsets stay the same.");
  }
}

async function openCapture(file) {
  if (!file) return;
  try {
    const res = await fetch("./api/load?file=" + encodeURIComponent(file));
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    await loadJsonData(data, { filename: file.split("/").pop() });
    setStatus(`Opened ${file}`, "good");
  } catch (err) {
    setStatus(`Open failed: ${err}`, "bad");
  }
}

function showContentsHelp() {
  setStatus("Click an item in Contents to edit its scale, color, state and ammo. Open a contained backpack/crossbow to edit its own contents. Fill with selected / Random from category fill the free slots. Inventory items have no independent pose. Telegrenade ammo is a target NetPlayer.objectID; ordinary hand-grenade ammo is fuse ticks. Caps: 30 per container, 4 containers deep.");
}

function bindSidebarTabs() {
  const tabs = [...document.querySelectorAll(".sidebarTabs [role='tab']")];
  const panels = tabs.map((tab) => $(tab.getAttribute("aria-controls")));
  const activate = (activeTab, moveFocus = false) => {
    tabs.forEach((tab, index) => {
      const selected = tab === activeTab;
      tab.setAttribute("aria-selected", String(selected));
      tab.tabIndex = selected ? 0 : -1;
      panels[index].hidden = !selected;
    });
    if (moveFocus) activeTab.focus();
  };
  tabs.forEach((tab, index) => {
    tab.addEventListener("click", () => activate(tab));
    tab.addEventListener("keydown", (event) => {
      let nextIndex;
      switch (event.key) {
        case "ArrowRight": nextIndex = (index + 1) % tabs.length; break;
        case "ArrowLeft": nextIndex = (index - 1 + tabs.length) % tabs.length; break;
        case "Home": nextIndex = 0; break;
        case "End": nextIndex = tabs.length - 1; break;
        default: return;
      }
      event.preventDefault();
      activate(tabs[nextIndex], true);
    });
  });
  activate(tabs[0]);
}

// Scene tool tabs (owner 2026-10-26, Quest browser: Scale gizmo, Delete, Undo, Redo and Clear were cut off at the end of
// their rows). When the groups would need more than two rows (or one group does not fit at all), the toolbar shows one
// group at a time under Transform / Pick / Snap / Edit; Properties, Undo, Redo and Delete always stay visible. The choice
// is made from each group's natural width, so it does not flip back and forth, and the open tab is remembered.
const TOOL_TAB_KEY = "mikeybox_editor_tool_tab_v1";
const TOOLBAR_MAX_ROWS = 2;
let layoutSceneToolbar = () => {};

function bindToolbarTabs() {
  const toolbar = $("sceneToolbar");
  const tabs = [...toolbar.querySelectorAll('[role="tab"][data-tool-tab]')];
  const groups = [...toolbar.querySelectorAll(".toolGroup[data-tool-group]")];
  const tabGroups = groups.filter((group) => group.dataset.toolGroup !== "always");
  let active = "transform";
  try { active = localStorage.getItem(TOOL_TAB_KEY) || active; } catch (_) {}
  if (!tabs.some((tab) => tab.dataset.toolTab === active)) active = "transform";

  const showTab = (name, { focus = false, persist = true } = {}) => {
    active = name;
    for (const tab of tabs) {
      const on = tab.dataset.toolTab === name;
      tab.setAttribute("aria-selected", String(on));
      tab.tabIndex = on ? 0 : -1;
      if (on && focus) tab.focus();
    }
    for (const group of tabGroups) group.classList.toggle("activeToolGroup", group.dataset.toolGroup === name);
    if (persist) { try { localStorage.setItem(TOOL_TAB_KEY, name); } catch (_) {} }
  };
  const setTabbed = (on) => {
    toolbar.classList.toggle("tabbed", on);
    for (const group of tabGroups) {
      if (on) { group.setAttribute("role", "tabpanel"); group.setAttribute("aria-labelledby", `toolTab${group.dataset.toolGroup[0].toUpperCase()}${group.dataset.toolGroup.slice(1)}`); }
      else { group.removeAttribute("role"); group.removeAttribute("aria-labelledby"); }
    }
  };
  // How many rows the untabbed groups need at the toolbar's current width (flex-wrap of whole groups).
  const rowsNeeded = () => {
    toolbar.classList.add("measuringTools");
    const style = getComputedStyle(toolbar);
    const available = toolbar.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight);
    const gap = parseFloat(style.columnGap) || 10;
    const widths = groups.map((group) => group.getBoundingClientRect().width).filter((width) => width > 0);
    toolbar.classList.remove("measuringTools");
    if (!(available > 0)) return 0;
    let rows = 0, x = 0;
    for (const width of widths) {
      if (width > available + 0.5) return Infinity;
      if (!rows || x + gap + width > available + 0.5) { rows++; x = width; } else x += gap + width;
    }
    return rows;
  };
  layoutSceneToolbar = () => {
    const inCenter = !document.body.classList.contains("compactLayout") && toolbar.parentElement?.matches("main.center");
    if (!inCenter) { setTabbed(false); return; }
    toolbar.classList.remove("tabbed");   // measure with the untabbed gaps; nothing paints before setTabbed
    setTabbed(rowsNeeded() > TOOLBAR_MAX_ROWS);
  };

  for (const tab of tabs) tab.addEventListener("click", () => showTab(tab.dataset.toolTab));
  toolbar.querySelector(".toolbarTabs").addEventListener("keydown", (event) => {
    const index = tabs.findIndex((tab) => tab.dataset.toolTab === active);
    const next = { ArrowRight: index + 1, ArrowLeft: index - 1, Home: 0, End: tabs.length - 1 }[event.key];
    if (next === undefined) return;
    event.preventDefault();
    showTab(tabs[(next + tabs.length) % tabs.length].dataset.toolTab, { focus: true });
  });
  showTab(active, { persist: false });
  const center = document.querySelector("main.center");
  if (typeof ResizeObserver === "function" && center) new ResizeObserver(() => layoutSceneToolbar()).observe(center);
  else window.addEventListener("resize", () => layoutSceneToolbar());
  document.fonts?.ready?.then(() => layoutSceneToolbar()).catch(() => {});
}

function bindUi() {
  bindToolbarTabs();
  bindGridControls();
  bindAngleControls();
  bindSquareUpControls();
  bindChildrenStayControls();
  bindCenterOfMassControls();
  bindKeepCopiesToggle();
  bindSidebarTabs();
  const menuButton = $("editorMenuBtn");
  const layoutModeButton = $("layoutModeBtn");
  const menuPanel = $("editorMenuPanel");
  const fileActions = menuPanel.querySelector(".fileActions");
  const workspaceFileActions = menuPanel.querySelector(".workspaceFileActions");
  const sceneToolbar = menuPanel.querySelector(".toolbar");
  const center = document.querySelector("main.center");
  const setMenuOpen = (open) => {
    menuPanel.hidden = !open;
    menuButton.setAttribute("aria-expanded", String(open));
    menuButton.setAttribute("aria-label", open ? "Close editor menu" : "Open editor menu");
  };
  const layoutPreferenceKey = "mikeybox_editor_layout_v1";
  const setLayoutMode = (compact, persist = true) => {
    setMenuOpen(false);
    if (compact) {
      menuPanel.querySelector(".editorMenuHeading").after(fileActions, workspaceFileActions);
      menuPanel.append(sceneToolbar);
    } else {
      menuPanel.before(fileActions, workspaceFileActions);
      center.prepend(sceneToolbar);
    }
    document.body.classList.toggle("compactLayout", compact);
    layoutSceneToolbar();
    layoutModeButton.textContent = compact ? "Classic view" : "Compact view";
    layoutModeButton.setAttribute("aria-pressed", String(compact));
    layoutModeButton.title = compact ? "Show file actions and scene tools without opening the menu" : "Keep file actions and scene tools inside the menu";
    if (persist) {
      try { localStorage.setItem(layoutPreferenceKey, compact ? "compact" : "classic"); } catch (_) {}
    }
  };
  let compactLayout = false;
  try { compactLayout = localStorage.getItem(layoutPreferenceKey) === "compact"; } catch (_) {}
  setLayoutMode(compactLayout, false);
  layoutModeButton.addEventListener("click", () => setLayoutMode(!document.body.classList.contains("compactLayout")));
  menuButton.addEventListener("click", () => setMenuOpen(menuPanel.hidden));
  document.addEventListener("pointerdown", (event) => {
    if (!menuPanel.hidden && !menuButton.contains(event.target) && !menuPanel.contains(event.target)) setMenuOpen(false);
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !menuPanel.hidden) {
      setMenuOpen(false);
      menuButton.focus();
    }
  });
  $("newDocumentBtn").addEventListener("click", () => {
    const selectedID = state.selectedEntry?.item_id || "item_frying_pan";
    // A glitched item cannot be a root: start a backpack that already holds it.
    const glitched = RULES.RECORD_ONLY_ITEM_IDS.has(selectedID);
    const itemID = glitched ? "item_backpack" : selectedID;
    const item = newEditorItem(itemID);
    if (glitched) item.children = [newEditorItem(selectedID)];
    void loadJsonData(item, { separate: true, name: `Invention ${state.documents.length + 1}`,
      filename: `${itemID}.json`, dirty: true, deferModel: true }).then(() => setStatus(glitched
        ? `Added a backpack holding ${selectedID} (shows as "Unknown Item" in the bag).` : `Added a separate ${itemID} invention.`, "good"))
      .catch((error) => setStatus(`New invention failed: ${error.message || error}`, "bad"));
  });
  async function addWearablePreset(parts, label) {
    try {
      const firstDocumentIndex = state.documents.length;
      for (const [itemID, name, attachment] of parts) {
        await loadJsonData(newEditorItem(itemID), { separate: true, name, filename: `${name.toLowerCase().replace(/ /g, "_")}.json`,
          preview: { attachment, position: [0, 0, 0], rotation: [0, 0, 0, 1], visible: true }, dirty: true });
      }
      $("showGhostRig").checked = true;
      updateGhostPreview();
      setActiveDocument(state.documents[firstDocumentIndex].id);
      frameWorkspace();
      setStatus(`${label} added as ${parts.length} separate inventions. Select each before saving or sending it.`, "good");
    } catch (error) { setStatus(`${label} setup failed: ${error.message || error}`, "bad"); }
  }
  $("newBodyArmsBtn").addEventListener("click", () => {
    void addWearablePreset([
      ["item_backpack", "Body", "back"],
      ["item_robot_arm_left", "Left arm", "left_hand"],
      ["item_robot_arm_right", "Right arm", "right_hand"]
    ], "Body and arms");
  });
  $("newFullSuitBtn").addEventListener("click", () => {
    void addWearablePreset([
      ["item_backpack", "Body", "back"],
      ["item_hookshot", "Left hip", "left_hip"],
      ["item_hookshot", "Right hip", "right_hip"],
      ["item_robot_arm_left", "Left arm", "left_hand"],
      ["item_robot_arm_right", "Right arm", "right_hand"]
    ], "Full suit");
  });
  $("frameAllBtn")?.addEventListener("click", frameWorkspace);
  $("ghostPoseFrameBtn").addEventListener("click", frameGhost);
  const clearActiveDocumentSafely = async () => {
    await saveRecoveryNow("before clear").catch(() => {});
    clearScene({ skipRecovery: true });
  };
  $("deleteDocumentBtn").addEventListener("click", () => { void clearActiveDocumentSafely(); });
  $("workspaceSaveBtn").addEventListener("click", downloadWorkspaceProject);
  $("recoveryBtn").addEventListener("click", () => { void showRecoveryDialog(); });
  $("recoveryCloseBtn").addEventListener("click", () => $("recoveryDialog").close());
  $("recoverySaveNowBtn").addEventListener("click", async () => {
    const button = $("recoverySaveNowBtn");
    button.disabled = true;
    try {
      const saved = await saveRecoveryNow("manual");
      await renderRecoveryList();
      $("recoveryStatus").textContent = saved
        ? `Saved a backup at ${new Date(saved.createdAt).toLocaleTimeString()}.`
        : state.documents.length ? "The latest backup already matches this workspace." : "Add an invention before saving a backup.";
    } catch (error) { $("recoveryStatus").textContent = error.message || String(error); }
    finally { button.disabled = false; }
  });
  $("workspaceLoadInput").addEventListener("change", async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    try { await loadWorkspaceProject(JSON.parse(await file.text())); }
    catch (error) { setStatus(`Workspace load failed: ${error.message || error}`, "bad"); }
    event.target.value = "";
  });
  $("loadSeparateInput").addEventListener("change", async (event) => {
    const files = [...(event.target.files || [])];
    try {
      for (const file of files) {
        const raw = JSON.parse(await file.text());
        if (isWorkspaceProject(raw)) throw new Error(`${file.name} is a workspace project. Use Load workspace project.`);
        await loadJsonData(raw, { separate: true, name: file.name.replace(/\.json$/i, ""), filename: file.name });
      }
      if (files.length) setStatus(`Loaded ${files.length} separate invention(s).`, "good");
    } catch (error) { setStatus(`Load separate failed: ${error.message || error}`, "bad"); }
    event.target.value = "";
  });
  $("activeDocumentName").addEventListener("change", (event) => {
    const current = activeDocument();
    if (!current) return;
    current.name = String(event.target.value).trim().slice(0, 80) || current.name;
    current.dirty = true;
    refreshPreview();
  });
  $("activeDocumentBothHands").addEventListener("change", (event) => {
    const current = activeDocument();
    if (!current) return;
    if (event.target.checked) current.preview.bothHands = true;
    else delete current.preview.bothHands;
    current.dirty = true;
    if (event.target.checked && !["left_hand", "right_hand"].includes(current.preview.attachment))
      setStatus("Show in both hands applies once the preview attachment is Left hand or Right hand.");
    refreshPreview();
  });
  $("activeDocumentAttach").addEventListener("change", (event) => {
    if (state.referenceActive) setReferenceMoveActive(false);
    const current = activeDocument();
    if (!current) return;
    const crossbow = /^crossbow:([A-Za-z0-9_-]+):([0-9.]*)$/.exec(String(event.target.value));
    if (crossbow) {
      current.preview.attachment = CROSSBOW_ATTACHMENT;
      current.preview.holder = { documentId: crossbow[1], route: crossbow[2] ? crossbow[2].split(".").map(Number) : [] };
    } else {
      current.preview.attachment = event.target.value;
      delete current.preview.holder;
    }
    current.preview.position = [0, 0, 0];
    current.preview.rotation = [0, 0, 0, 1];
    applyDocumentPreviewPlacement(current);
    current.dirty = true;
    refreshPreview();
  });
  const resetPreviewPlacement = (all) => {
    const documents = all ? state.documents : [activeDocument()].filter(Boolean);
    for (const current of documents) {
      current.preview.position = [0, 0, 0];
      current.preview.rotation = [0, 0, 0, 1];
      applyDocumentPreviewPlacement(current);
      current.dirty = true;
    }
    if (!documents.length) return;
    refreshPreview();
    frameWorkspace();
    setStatus(`Reset ${all ? "all invention" : "active invention"} preview placement${all ? "s" : ""}. Saved child joints were unchanged.`, "good");
  };
  $("resetPreviewPlacementBtn").addEventListener("click", () => resetPreviewPlacement(false));
  $("resetAllPreviewPlacementsBtn").addEventListener("click", () => resetPreviewPlacement(true));
  $("activeDocumentVisible").addEventListener("change", (event) => {
    const current = activeDocument();
    if (!current) return;
    current.preview.visible = event.target.checked;
    applyDocumentPreviewPlacement(current);
    current.dirty = true;
    refreshPreview();
  });
  const changePreviewOffset = () => {
    const current = activeDocument();
    if (!current) return;
    current.preview.position = ["X", "Y", "Z"].map((axis) => Number($("activeDocumentOffset" + axis).value) || 0);
    const euler = new THREE.Euler().setFromQuaternion(new THREE.Quaternion(...current.preview.rotation), "YXZ");
    euler.y = fromDisplayAngle($("activeDocumentYaw").value, state.angleUnit) || 0;
    current.preview.rotation = new THREE.Quaternion().setFromEuler(euler).toArray();
    applyDocumentPreviewPlacement(current);
    current.dirty = true;
    refreshPreview();
  };
  for (const id of ["activeDocumentOffsetX", "activeDocumentOffsetY", "activeDocumentOffsetZ", "activeDocumentYaw"])
    $(id).addEventListener("change", changePreviewOffset);
  $("filenameInput").addEventListener("change", (event) => {
    const current = activeDocument();
    if (current) current.filename = event.target.value;
  });
  const inspectorPanel = $("inspectorPanel");
  const inspectorToggle = $("inspectorToggleBtn");
  const setInspectorOpen = (open) => {
    inspectorPanel.classList.toggle("inspectorOpen", open);
    inspectorToggle.setAttribute("aria-expanded", String(open));
  };
  inspectorToggle.addEventListener("click", () => setInspectorOpen(!inspectorPanel.classList.contains("inspectorOpen")));
  // Load another whole invention into the selected holder: one candidate loads at once, several open the picker.
  $("loadInventionIntoHolderBtn").addEventListener("click", () => {
    const record = state.selected;
    if (!takesInvention(record)) return setStatus("Select a heart gun, crossbow, salmon cannon or tripod first.", "bad");
    state.contentPath = [];
    renderContentsPanel(record);
    const select = $("crossbowLoadDocument");
    const options = [...select.options].filter((option) => option.value && !option.disabled);
    if (options.length === 1) {
      select.value = options[0].value;
      loadDocumentCopyIntoCrossbow();
      return;
    }
    setInspectorOpen(true);
    $("crossbowLoadTools").scrollIntoView({ block: "center" });
    select.focus();
    setStatus(options.length
      ? `Pick the invention to load into this ${takesInventionNoun(record)}, then Load copy. To chain heart guns, stick the next heart gun onto a part of that invention.`
      : "Make the invention to load as its own invention first (New invention), then load it here.", options.length ? "" : "bad");
  });
  $("inspectorCloseBtn").addEventListener("click", () => setInspectorOpen(false));
  window.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && inspectorPanel.classList.contains("inspectorOpen")) setInspectorOpen(false);
  });
  $("itemSearch").addEventListener("input", () => {
    if ($("itemSearch").value && $("itemList").hidden) setItemListExpanded(true);
    renderItemList();
  });
  $("itemSort").addEventListener("change", () => {
    renderItemList();
    saveItemCatalogPreferences();
  });
  $("itemCategory").addEventListener("change", () => {
    renderItemList();
    saveItemCatalogPreferences();
  });
  $("toggleItemListBtn").addEventListener("click", () => setItemListExpanded($("itemList").hidden));
  $("itemListNamesBtn").addEventListener("click", () => setItemCatalogView("names"));
  $("itemListThumbsBtn").addEventListener("click", () => setItemCatalogView("thumbnails"));
  $("addRootBtn").addEventListener("click", () => {
    if (state.selectedEntry) void addObject(state.selectedEntry.item_id, "root");
    else setStatus("Choose an item in the catalog first.", "bad");
  });
  $("addChildBtn").addEventListener("click", () => {
    if (state.selectedEntry) addObject(state.selectedEntry.item_id, rootRecord() ? "child" : "root");
  });
  $("addContentBtn").addEventListener("click", addContentToSelected);
  $("crossbowLoadDocument").addEventListener("change", () => { $("crossbowLoadDocumentBtn").disabled = !$("crossbowLoadDocument").value; });
  $("crossbowLoadDocumentBtn").addEventListener("click", loadDocumentCopyIntoCrossbow);
  $("crossbowTakeOutBtn").addEventListener("click", () => {
    takeCrossbowContentsOutToEdit().catch((err) => setStatus(`Take out failed: ${err.message || err}`, "bad"));
  });
  $("contentBackBtn").addEventListener("click", () => {
    if (!state.contentPath.length) return;
    state.contentSelectedIndex = state.contentPath.pop();
    renderContentsPanel(state.selected);
  });
  $("contentOpenBtn").addEventListener("click", () => {
    const record = state.selected;
    const path = contentEditorPath();
    const item = record && path && getContainedItem(record, path);
    if (!item || !RULES.containerRule(item.itemID)) return;
    state.contentPath = path;
    state.contentSelectedIndex = null;
    renderContentsPanel(record);
  });
  for (const id of ["contentScaleModifier", "contentColorHue", "contentColorSaturation",
    "contentJellyStrength", "contentRawState", "contentAmmo", "contentActivatedToggle", "contentLoadedToggle"])
    $(id).addEventListener("change", applyContentInspectorChange);
  $("contentSemanticControls").addEventListener("change", applyContentSemanticChange);
  $("contentGrenadeControls").addEventListener("change", applyContentSemanticChange);
  $("rootGrenadeControls").addEventListener("change", applyRootGrenadeChange);
  $("loadGunsBtn").addEventListener("click", loadAllGunsInScene);
  $("clearContentsBtn").addEventListener("click", () => {
    if (!state.selected) return;
    const container = getContainedContainer(state.selected, state.contentPath);
    if (!container) return;
    queueRecoverySafetySnapshot("before clear");
    if (state.contentPath.length) container.children = [];
    else container.contents = [];
    state.contentSelectedIndex = null;
    syncInspectorFromSelection();
    refreshPreview();
  });
  $("fillContentsBtn").addEventListener("click", () => fillOpenContainer(false));
  $("fillRandomContentsBtn").addEventListener("click", () => fillOpenContainer(true));
  $("randomizeContentColorsBtn").addEventListener("click", () => {
    if (!state.selected) return;
    const container = getContainedContainer(state.selected, state.contentPath);
    if (!container || !listDirectContents(state.selected, state.contentPath).length)
      return setStatus("Select a bag or container with items inside first.", "bad");
    const sizes = $("randomizeContentSizes").checked;
    queueRecoverySafetySnapshot(sizes ? "before random colors and sizes" : "before random colors");
    const count = randomizeContainedColors(state.selected, state.contentPath);
    if (sizes) randomizeContainedSizes(state.selected, state.contentPath);
    syncInspectorFromSelection();
    refreshPreview();
    setStatus(`Gave ${count} item${count === 1 ? "" : "s"} inside ${container.itemID} a random hue and saturation${sizes ? " and size" : ""}. Click again to reroll.`, "good");
  });
  $("contentsHelpBtn").addEventListener("click", showContentsHelp);
  $("snapToTipBtn").addEventListener("click", snapSelectedToTip);
  $("snapToBaseBtn").addEventListener("click", snapSelectedToOrigin);
  $("overlapArmBtn").addEventListener("click", overlapSelectedArm);
  $("addArmPairBtn").addEventListener("click", () => void addOverlappingArmPair());
  $("addJoystickLinkBtn").addEventListener("click", addAlignedJoystickLink);
  $("insertBridgeBtn").addEventListener("click", insertBridgeItem);
  $("adoptSiblingsBtn").addEventListener("click", adoptSiblingsOntoSelected);
  for (const id of ["bridgeItemId"]) {
    $(id).addEventListener("input", syncBridgeControls);
    $(id).addEventListener("change", syncBridgeControls);
  }
  $("selectBtn").addEventListener("click", () => setMode("select"));
  $("moveBtn").addEventListener("click", () => setMode("translate"));
  $("rotateBtn").addEventListener("click", () => setMode("rotate"));
  $("scaleBtn").addEventListener("click", () => setMode("scale"));
  $("duplicateBtn").addEventListener("click", duplicateSelected);
  // Owner 2026-10-21: buttons for what only Ctrl+C / Ctrl+V did, and toggles for Shift/Ctrl, Alt and Shift + right-drag.
  $("copyBtn").addEventListener("click", copySelectedObjects);
  $("pasteBtn").addEventListener("click", pasteCopiedObjects);
  for (const [id, key, onText] of [
    ["addSelectToggle", "add", "Add to selection is on: each tap adds a part (or its whole group) to the selection, or takes it out again."],
    ["singlePartToggle", "single", "Single parts is on: taps and boxes pick single parts instead of their whole group."],
    ["boxSelectToggle", "box", "Box select is on: drag across the 3D view or the parts list to select everything inside the box. The camera stays still until you turn it off."],
  ]) {
    $(id).addEventListener("click", () => {
      state.selectionOptions[key] = !state.selectionOptions[key];
      syncSelectionOptionToggles();
      setStatus(state.selectionOptions[key] ? onText : `${$(id).textContent} is off.`);
    });
  }
  $("panViewToggle").addEventListener("click", () => {
    state.panView = !state.panView;
    orbit.mouseButtons.LEFT = state.panView ? THREE.MOUSE.PAN : THREE.MOUSE.ROTATE;
    orbit.touches.ONE = state.panView ? THREE.TOUCH.PAN : THREE.TOUCH.ROTATE;
    $("panViewToggle").classList.toggle("active", state.panView);
    $("panViewToggle").setAttribute("aria-pressed", String(state.panView));
    setStatus(state.panView ? "Pan view is on: drag to slide the camera. Turn it off to orbit again." : "Pan view is off: drag to orbit.");
  });
  $("arrayBtn").addEventListener("click", () => { $("arrayMessage").textContent = ""; $("arrayDialog").showModal(); });
  $("arrayCloseBtn").addEventListener("click", () => $("arrayDialog").close());
  $("arrayForm").addEventListener("submit", (event) => { event.preventDefault(); void makeRingCopies(); });
  $("patternBtn").addEventListener("click", () => { $("patternMessage").textContent = ""; $("patternDialog").showModal(); });
  $("patternCloseBtn").addEventListener("click", () => $("patternDialog").close());
  $("patternShape").addEventListener("change", () => {
    $("patternTextRow").hidden = $("patternShape").value !== "text";
  });
  $("patternTextRow").hidden = $("patternShape").value !== "text";
  $("patternForm").addEventListener("submit", (event) => { event.preventDefault(); buildPatternFromForm(); });
  $("deleteBtn").addEventListener("click", deleteSelected);
  $("undoBtn").addEventListener("click", () => stepEditorHistory("undo"));
  $("redoBtn").addEventListener("click", () => stepEditorHistory("redo"));
  $("clearBtn").addEventListener("click", () => { void clearActiveDocumentSafely(); });
  $("selectSubtreeBtn").addEventListener("click", () => {
    if (state.selected) setSelection(subtreeRecords(state.selected), state.selected);
  });
  $("selectAllBtn").addEventListener("click", () => setSelection(state.objects.slice(), state.selected || rootRecord()));
  $("clearSelectionBtn").addEventListener("click", () => selectRecord(null));
  $("saveGroupBtn").addEventListener("click", saveSelectionGroup);
  $("mirrorCompleteArmBtn").addEventListener("click", mirrorCompleteArm);
  $("mirrorBodyBtn").addEventListener("click", mirrorSelectedAboutBody);
  $("reparentSelectedBtn").addEventListener("click", reparentSelectedToTarget);
  $("splitPartsBtn").addEventListener("click", () => splitIntoNewInvention("parts"));
  $("splitBranchBtn").addEventListener("click", () => splitIntoNewInvention("branch"));
  $("duplicatePartsBtn").addEventListener("click", duplicateSelectedPartsOnly);
  $("mergeDocumentBtn").addEventListener("click", () => mergeInventionInto(state.activeDocumentId, $("mergeTargetSelect").value));
  $("groupNameInput").addEventListener("keydown", (event) => {
    if (event.key === "Enter") { event.preventDefault(); saveSelectionGroup(); }
  });
  renderSelectionGroups();
  $("convergeSelectedBtn").addEventListener("click", convergeSelectedOrigins);
  $("aimLasersBtn").addEventListener("click", aimSelectedLasers);
  $("addVrGogglesBtn").addEventListener("click", addVrGoggles);
  bindMotionControls();
  bindColorPicker();
  $("filmSlotList").addEventListener("change", (event) => {
    const slot = Number(event.target?.dataset?.filmSlot);
    if (Number.isInteger(slot) && state.selected) setFilmSlot(state.selected, slot, event.target.value);
  });
  $("filmSnapBtn").addEventListener("click", () => {
    const record = state.selected;
    if (!record) return;
    beginEditorHistoryGroup();
    try {
      const moved = snapFilmParts(record);
      refreshPreview();
      setStatus(`Put ${moved} part(s) back on their slots.`, "good");
    } finally {
      endEditorHistoryGroup();
    }
  });
  $("filmMountBtn").addEventListener("click", () => mountOnSelectedTripod($("filmMountItem").value));
  $("filmUnmountBtn").addEventListener("click", () => {
    const record = state.selected;
    if (!record || FILM.filmRole(record.itemID) !== "tripod") return;
    beginEditorHistoryGroup();
    try {
      record.contents = [];
      syncInspectorFromSelection();
      refreshPreview();
      setStatus("Removed the tripod's mounted item.", "good");
    } finally {
      endEditorHistoryGroup();
    }
  });
  populatePoseControls();
  $("ghostPoseModeBtn").addEventListener("click", () => setPoseMode(!state.poseUi.active));
  $("ghostPoseJoint").addEventListener("change", (event) => selectPoseJoint(event.target.value));
  $("ghostPoseTool").addEventListener("change", (event) => {
    state.poseUi.tool = event.target.value === "rotate" ? "rotate" : "move";
    syncPoseFields();
    syncPoseGizmo();
  });
  $("ghostPoseHeadTool").addEventListener("change", (event) => {
    state.poseUi.headTool = event.target.value === "roll" ? "roll" : "turn";
    syncPoseFields();
  });
  for (const dot of document.querySelectorAll("#ghostPoseMap [data-joint]")) {
    dot.addEventListener("click", () => selectPoseJoint(dot.dataset.joint));
    dot.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") { event.preventDefault(); selectPoseJoint(dot.dataset.joint); }
    });
  }
  for (const id of [...POSE_TURN_FIELDS, ...POSE_MOVE_FIELDS]) {
    $(id).addEventListener("focus", beginEditorHistoryGroup);
    $(id).addEventListener("blur", endEditorHistoryGroup);
    $(id).addEventListener("change", applyPoseFields);
  }
  POSE_QUAT_FIELDS.forEach((id, index) => {
    $(id).addEventListener("focus", beginEditorHistoryGroup);
    $(id).addEventListener("blur", endEditorHistoryGroup);
    $(id).addEventListener("change", (event) => applyPoseQuatField(index, event.target));
  });
  poseGizmo.addEventListener("mouseDown", beginPoseDrag);
  $("ghostPoseResetJoint").addEventListener("click", () => {
    const key = state.poseUi.joint;
    state.ghostPose = key === "head" ? setHeadYawPitchRoll(state.ghostPose, [0, 0, 0])
      : setHandOffsetAndTurn(state.ghostPose, poseJointSide(key), [0, 0, 0], [0, 0, 0]);
    ghostPoseChanged();
  });
  const setFinger = (side, finger, value) => {
    const next = normalizeGhostPose(state.ghostPose);
    next.fingers[side][finger] = clamp(value, 0, 1);
    state.ghostPose = next;
    ghostPoseChanged();
  };
  for (const side of SIDES) {
    for (const finger of ["index", "pinky"]) {
      const slider = $(`ghostCurl-${side}-${finger}`);
      slider.addEventListener("pointerdown", beginEditorHistoryGroup);
      slider.addEventListener("change", endEditorHistoryGroup);
      slider.addEventListener("input", () => setFinger(side, finger, Number(slider.value) / 100));
    }
    $(`ghostCurl-${side}-thumb`).addEventListener("change", (event) => setFinger(side, "thumb", Number(event.target.value)));
    for (const [action, amount] of [["Fist", 1], ["Open", 0]]) {
      $(`ghostCurl${action}-${side}`).addEventListener("click", () => {
        const next = normalizeGhostPose(state.ghostPose);
        next.fingers[side] = { index: amount, pinky: amount, thumb: amount };
        state.ghostPose = next;
        ghostPoseChanged();
      });
    }
  }
  $("ghostPosePresetBtn").addEventListener("click", () => {
    if (!state.avatarArmSkin) return setStatus("Posing needs the game avatar rig, which is still loading.", "bad");
    const preset = POSE_PRESETS.find((item) => item.id === $("ghostPosePreset").value);
    state.ghostPose = applyPosePreset(state.avatarArmSkin, state.ghostPose, $("ghostPosePreset").value);
    ghostPoseChanged();
    setStatus(`Ghost pose: ${preset?.label || "preset"}. Held items follow the hands.`, "good");
  });
  for (const [id, from] of [["ghostPoseMirrorLR", "left"], ["ghostPoseMirrorRL", "right"]]) {
    $(id).addEventListener("click", () => { state.ghostPose = mirrorGhostPose(state.ghostPose, from); ghostPoseChanged(); });
  }
  $("ghostPoseResetAll").addEventListener("click", () => { state.ghostPose = emptyGhostPose(); ghostPoseChanged(); });
  syncPoseFields();
  try {
    if (localStorage.getItem("mikeybox_hand_tracking_profile") === "standard") $("handTrackingProfile").value = "standard";
  } catch (_) {}
  $("handTrackingProfile").addEventListener("change", () => {
    try { localStorage.setItem("mikeybox_hand_tracking_profile", $("handTrackingProfile").value); } catch (_) {}
    for (const document of state.documents) applyDocumentPreviewPlacement(document);
    updateGhostPreview();
  });
  for (const id of ["showGhostRig", "ghostAnimal", "showSightLine", "sightDistance"]) {
    $(id).addEventListener("input", updateGhostPreview);
    $(id).addEventListener("change", updateGhostPreview);
  }
  // Ghost preview settings are saved state: record each change as its own step.
  for (const id of ["showGhostRig", "showSightLine", "sightDistance", "showGorillaReference", "handTrackingProfile"]) {
    $(id).addEventListener("change", () => observeEditorHistory());
  }
  for (const id of ["referenceX", "referenceY", "referenceZ", "referenceYaw", "referenceScale"]) {
    $(id).addEventListener("change", () => observeEditorHistory());
  }
  $("showGhostRig").addEventListener("change", () => {
    if (!$("showGhostRig").checked && $("showGorillaReference").checked) {
      $("showGorillaReference").checked = false;
      setReferenceMoveActive(false);
      state.referenceMoved = false;
      syncWearerMaterial();
      updateGhostPreview();
    }
  });
  $("ghostAnimal").addEventListener("change", () => { void loadAvatarMesh().then(() => observeEditorHistory()); });
  const onGhostCrossbowChange = () => {
    state.ghostCrossbow = {
      itemID: HOLDER.crossbowHolder($("ghostCrossbowItem").value) ? $("ghostCrossbowItem").value : "",
      slot: ghostCrossbowSlot($("ghostCrossbowSlot").value),
      scaleModifier: Math.round(clamp(Number($("ghostCrossbowScale").value) || 0, -128, 127)),
    };
    $("ghostCrossbowScale").value = String(state.ghostCrossbow.scaleModifier);
    if (state.ghostCrossbow.itemID && !$("showGhostRig").checked) $("showGhostRig").checked = true;
    updateGhostPreview();
    observeEditorHistory();
  };
  for (const id of ["ghostCrossbowItem", "ghostCrossbowSlot", "ghostCrossbowScale"]) $(id).addEventListener("change", onGhostCrossbowChange);
  $("showGorillaReference").addEventListener("change", () => {
    if ($("showGorillaReference").checked) {
      $("showGhostRig").checked = true;
      state.referenceMoved = false;
      if ([...$("ghostAnimal").options].some((option) => option.value === "animal_gorilla") &&
          $("ghostAnimal").value !== "animal_gorilla") {
        $("ghostAnimal").value = "animal_gorilla";
        void loadAvatarMesh();
      }
    } else {
      setReferenceMoveActive(false);
      state.referenceMoved = false;
    }
    syncWearerMaterial();
    updateGhostPreview();
  });
  $("moveGorillaReferenceBtn").addEventListener("click", () => {
    if (!$("showGorillaReference").checked) {
      $("showGorillaReference").checked = true;
      $("showGorillaReference").dispatchEvent(new Event("change"));
    }
    setReferenceMoveActive(!state.referenceActive);
  });
  for (const id of ["referenceX", "referenceY", "referenceZ", "referenceYaw", "referenceScale"]) {
    $(id).addEventListener("input", applyReferenceFields);
    $(id).addEventListener("change", applyReferenceFields);
  }
  syncReferenceFields();
  $("saveBtn").addEventListener("click", saveToServer);
  $("downloadBtn").addEventListener("click", downloadJson);
  const sendBtn = $("sendToGameBtn");
  if (sendBtn) { sendBtn.addEventListener("click", sendToGame); if (window.PRIME_API_BASE !== undefined) sendBtn.hidden = false; }
  const botBtn = $("sendToBotBtn");
  if (botBtn) { botBtn.addEventListener("click", () => { prefillPlayerName("packageDisplayName"); renderPackageLagCheck(); $("packageDialog").showModal(); void refreshPrivateCourierReadiness(); }); if (window.PACKAGE_API_BASE) botBtn.hidden = false; }
  const privateDeliveryOption = $("privateDeliveryOption");
  privateDeliveryOption.hidden = window.PRIME_PRIVATE_DELIVERY_ENABLED !== true || !window.PACKAGE_API_BASE;
  privateDeliveryOption.disabled = true;
  if (privateDeliveryOption.hidden) $("packageDeliveryMode").value = "named";
  $("packageDeliveryMode").addEventListener("change", syncPackageDeliveryMode);
  syncPackageDeliveryMode();
  const scanBtn = $("loadFromBotBtn");
  if (scanBtn) { scanBtn.addEventListener("click", () => { prefillPlayerName("scanDisplayName"); $("scanDialog").showModal(); }); if (window.PACKAGE_API_BASE) scanBtn.hidden = false; }
  const pickupBtn = $("privatePickupBtn");
  if (pickupBtn) {
    pickupBtn.hidden = window.PRIME_PICKUP_ENABLED !== true || !window.PACKAGE_API_BASE;
    pickupBtn.disabled = true;
    pickupBtn.addEventListener("click", () => { prefillPlayerName("pickupDisplayName"); $("privatePickupDialog").showModal(); void refreshPrivateCourierReadiness(); });
    $("privatePickupCloseBtn").addEventListener("click", () => $("privatePickupDialog").close());
    $("privatePickupForm").addEventListener("submit", createPrivatePickup);
  }
  if (!privateDeliveryOption.hidden || (pickupBtn && !pickupBtn.hidden)) {
    // init() runs while app.js is still evaluating, before the readiness counter further down is declared; calling it
    // here threw "Cannot access 'privateCourierReadinessGeneration' before initialization", so wait one task.
    setTimeout(() => void refreshPrivateCourierReadiness(), 0);
    // Owner 2026-10-28 (Cloudflare bill): poll only a visible tab, not behind the site-closed screen, and only for an
    // account that may see the courier; once a minute (the dialogs still ask when they open).
    const pollCourier = () => !document.hidden && !document.getElementById("mbx-closed") && canSeeCourier();
    setInterval(() => { if (pollCourier()) void refreshPrivateCourierReadiness(); }, 60000);
    document.addEventListener("visibilitychange", () => {
      if (pollCourier()) void refreshPrivateCourierReadiness();
    });
  }
  if (window.MIKEYBOX_SITE?.voiceBotEnabled === false) {
    if (botBtn) { botBtn.textContent = "Send to Fabrication pad"; botBtn.title = "Queue a package for the Prime pad in the Fabrication room"; }
    $("packageTitle").textContent = "Send to Fabrication pad";
    if (scanBtn) { scanBtn.textContent = "Load from Fabrication pad"; scanBtn.title = "Load your latest item scanned by the Prime pad"; }
    $("scanTitle").textContent = "Load from Fabrication pad";
    $("scanInstructions").textContent = "Place an item on the Prime pad and tap its four drums in your chosen PIN order. Enter those four digits (1 to 4) here. Each new scan replaces your earlier scan; scans expire after 25 minutes.";
  }
  $("packageCloseBtn").addEventListener("click", () => $("packageDialog").close());
  $("itemInfoCloseBtn").addEventListener("click", () => $("itemInfoDialog").close());
  $("packageForm").addEventListener("submit", sendToMikeyboxBot);
  $("scanCloseBtn").addEventListener("click", () => $("scanDialog").close());
  $("scanForm").addEventListener("submit", listMikeyboxScans);
  for (const id of ["packageDisplayName", "scanDisplayName"]) {
    $(id).addEventListener("change", () => rememberPlayerName($(id).value));
  }
  $("capturePicker").addEventListener("change", (event) => { openCapture(event.target.value); event.target.value = ""; });
  $("setParentBtn").addEventListener("click", () => {
    if (state.selected) setParentTarget(state.selected);
  });
  $("useRootParentBtn").addEventListener("click", () => setParentTarget(rootRecord()));
  $("parentTargetSelect").addEventListener("change", (event) => {
    const record = recordByUid(Number(event.target.value));
    if (record) setParentTarget(record);
  });
  $("importBtn").addEventListener("click", () => {
    $("importMessage").textContent = "";
    updateImportTargetNote();
    $("importDialog").showModal();
  });
  $("importMode").addEventListener("change", updateImportTargetNote);
  $("importCloseBtn").addEventListener("click", () => $("importDialog").close());
  $("importDialog").addEventListener("cancel", (event) => {
    if ($("importSubmitBtn").disabled) event.preventDefault();
  });
  $("importForm").addEventListener("submit", (event) => { void importInventionFiles(event); });
  $("loadFileInput").addEventListener("change", async (event) => {
    const file = event.target.files && event.target.files[0];
    if (!file) return;
    try {
      const data = JSON.parse(await file.text());
      await loadJsonData(data, { filename: file.name });
      setStatus(`Loaded ${file.name}`, "good");
    } catch (err) {
      setStatus(`Load failed: ${err}`, "bad");
    }
  });
  $("selectedItemId").addEventListener("change", applyInspectorToSelection);
  for (const id of ["posX", "posY", "posZ", "rotX", "rotY", "rotZ", "rotQX", "rotQY", "rotQZ", "rotQW"]) {
    $(id).addEventListener("change", applyInspectorToSelection);
  }
  for (const id of ["colorHue", "colorSaturation", "jellyStrength", "ammo"]) {
    $(id).addEventListener("input", applyInspectorToSelection);
  }
  for (const id of ["colorHueNumber", "colorSaturationNumber", "jellyStrengthNumber"]) {
    $(id).addEventListener("change", applyInspectorToSelection);
  }
  // A typed coordinate/ammo edit may emit one input event per keystroke. Keep
  // that focus session as a single user action in the document history.
  for (const id of ["selectedItemId", "posX", "posY", "posZ", "rotX", "rotY", "rotZ", "rotQX", "rotQY", "rotQZ", "rotQW",
    "ammo", "scaleModifierNumber", "colorHueNumber", "colorSaturationNumber", "jellyStrengthNumber"]) {
    $(id).addEventListener("focus", beginEditorHistoryGroup);
    $(id).addEventListener("blur", endEditorHistoryGroup);
  }
  for (const id of ["scaleModifier", "colorHue", "colorSaturation", "jellyStrength"]) {
    const slider = $(id);
    slider.addEventListener("pointerdown", beginEditorHistoryGroup);
    slider.addEventListener("pointerup", endEditorHistoryGroup);
    slider.addEventListener("pointercancel", endEditorHistoryGroup);
    slider.addEventListener("blur", endEditorHistoryGroup);
    slider.addEventListener("change", endEditorHistoryGroup);
    slider.addEventListener("keydown", (event) => {
      if (["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Home", "End", "PageUp", "PageDown"].includes(event.key)) beginEditorHistoryGroup();
    });
    slider.addEventListener("keyup", endEditorHistoryGroup);
  }
  $("scaleModifier").addEventListener("input", (event) => applySelectedScaleModifier(event.target.value));
  $("scaleModifierNumber").addEventListener("change", (event) => applySelectedScaleModifier(event.target.value));
  $("scaleDownBtn").addEventListener("click", () => stepSelectedScale(-1));
  $("scaleUpBtn").addEventListener("click", () => stepSelectedScale(1));
  $("loadedToggle").addEventListener("change", applyInspectorToSelection);
  $("activatedToggle").addEventListener("change", applyInspectorToSelection);
  $("rawStateInput").addEventListener("change", applyInspectorToSelection);
  $("rawStateInput").addEventListener("focus", beginEditorHistoryGroup);
  $("rawStateInput").addEventListener("blur", endEditorHistoryGroup);
  $("safeZoneTimerMode").addEventListener("change", applySafeZoneTimerControl);
  $("safeZoneSeconds").addEventListener("change", applySafeZoneTimerControl);
  $("safeZoneSeconds").addEventListener("focus", beginEditorHistoryGroup);
  $("safeZoneSeconds").addEventListener("blur", endEditorHistoryGroup);
  $("stateBitmaskSlots").addEventListener("change", applyStateBitmaskControl);
  $("stateProgressValue").addEventListener("change", applyStateProgressControl);
  $("stateProgressValue").addEventListener("focus", beginEditorHistoryGroup);
  $("stateProgressValue").addEventListener("blur", endEditorHistoryGroup);
  $("subParentSelect").addEventListener("change", applyInspectorToSelection);
  renderer.domElement.addEventListener("pointerdown", onPointerDown);
  renderer.domElement.addEventListener("pointermove", updatePoseHover);
  viewport.addEventListener("pointerdown", (event) => beginSelectionMarquee(event, "viewport"), true);
  $("hierarchyTree").addEventListener("pointerdown", (event) => beginSelectionMarquee(event, "hierarchy"), true);
  for (const element of [renderer.domElement, $("hierarchyTree")]) {
    element.addEventListener("contextmenu", (event) => event.preventDefault());
  }
  window.addEventListener("pointermove", moveSelectionMarquee);
  window.addEventListener("pointerup", finishSelectionMarquee);
  window.addEventListener("pointercancel", cancelSelectionMarquee);
  window.addEventListener("keydown", (event) => {
    if ((event.ctrlKey || event.metaKey) && !event.altKey && event.key.toLowerCase() === "z") {
      const target = event.target;
      const nativeTextUndo = target?.isContentEditable ||
        (target?.tagName === "INPUT" && target.type !== "range") || target?.tagName === "TEXTAREA";
      if (!nativeTextUndo) {
        event.preventDefault();
        stepEditorHistory(event.shiftKey ? "redo" : "undo");
      }
      return;
    }
    if ((event.ctrlKey || event.metaKey) && !event.altKey && event.key.toLowerCase() === "g") {
      // Ctrl+G groups the selection (the Group name box may hold a name); Ctrl+Shift+G ungroups. Overrides the browser's Find next.
      const target = event.target;
      const typing = target && target.id !== "groupNameInput" &&
        (["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName) || target.isContentEditable);
      if (!typing) {
        event.preventDefault();
        if (!event.repeat) {
          if (event.shiftKey) ungroupSelection();
          else saveSelectionGroup();
        }
      }
      return;
    }
    const clipboardAction = editorClipboardShortcut(event);
    if (clipboardAction) {
      event.preventDefault();
      if (event.repeat) return;
      if (clipboardAction === "copy") copySelectedObjects();
      else if (clipboardAction === "paste") pasteCopiedObjects();
      else duplicateSelected();
      return;
    }
    if (event.target && ["INPUT", "TEXTAREA", "SELECT"].includes(event.target.tagName)) return;
    if (event.target?.isContentEditable || event.target?.closest?.("[contenteditable]")) return;
    if (event.ctrlKey || event.metaKey || event.altKey) return;
    if (event.key === "w") setMode("translate");
    if (event.key === "e") setMode("rotate");
    if (event.key === "r") setMode("scale");
    if (event.key === "Escape") selectRecord(null);
    if (event.key === "Delete") deleteSelected();
    if (event.key.toLowerCase() === "d") duplicateSelected();
    if (event.key.toLowerCase() === "p" && state.selected) setParentTarget(state.selected);
  });
}

// A click selects only what is drawn. three.js raycasts hidden objects too, so a flashlight's light cue -- a beam cone up
// to 1.5 m x the item's scale long and as wide, hidden while the light is off -- caught clicks meant for parts behind it
// (report 2026-10-24: "I'm not touching the bulk light at all but it keeps selecting it"). The cue is a visual hint even
// when lit, never the item.
function isLightCue(object) {
  for (let node = object; node; node = node.parent) if (node.name === "activation_light_preview") return true;
  return false;
}
function pickableHit(hit) {
  return shownInScene(hit.object) && !isLightCue(hit.object);
}

function onPointerDown(event) {
  if (event.button !== 0 || transform.dragging || (transform.object && transform.axis)) return;
  if (poseGizmo.dragging || (poseGizmo.enabled && poseGizmo.object && poseGizmo.axis)) return;
  if (state.poseUi.active) {
    const key = pickPoseHandle(event);
    if (key) { beginJointMouseDrag(event, key); return; }
  }
  const rect = renderer.domElement.getBoundingClientRect();
  pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
  pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
  raycaster.setFromCamera(pointer, camera);
  const roots = state.objects.map((o) => o.group);
  if (ghostRig.visible) roots.push(wornInvention, ghostCrossbow);
  const hits = raycaster.intersectObjects(roots, true).filter(pickableHit);
  if (!hits.length) return;
  const record = recordFromObject3D(hits[0].object);
  let fromWornPreview = false;
  for (let node = hits[0].object; node; node = node.parent) {
    if (node === wornInvention) { fromWornPreview = true; break; }
  }
  const { additive } = selectionModifiers(event);
  if (record && !additive && state.selectedUids.size === 1 && state.selectedUids.has(record.uid)) return;
  if (record) {
    if (state.referenceActive) setReferenceMoveActive(false);
    pickRecord(record, event);
    if (fromWornPreview) setStatus(`Selected ${record.itemID} on the wearer preview. Edit its properties here or use the gizmo on the original invention.`);
  }
}

// ---- Shift + right-drag selection in the viewport and Hierarchy ----
let activeMarquee = null;

function dragClientRect(x1, y1, x2, y2) {
  return { left: Math.min(x1, x2), top: Math.min(y1, y2),
    right: Math.max(x1, x2), bottom: Math.max(y1, y2) };
}

function intersectClientRects(a, b) {
  const rect = { left: Math.max(a.left, b.left), top: Math.max(a.top, b.top),
    right: Math.min(a.right, b.right), bottom: Math.min(a.bottom, b.bottom) };
  return rect.left <= rect.right && rect.top <= rect.bottom ? rect : null;
}

function projectedRecordRect(record, canvasRect) {
  record.group.updateWorldMatrix(true, true);
  const box = record.model ? new THREE.Box3().setFromObject(record.model) : null;
  const points = [];
  if (box && !box.isEmpty()) {
    for (const x of [box.min.x, box.max.x]) for (const y of [box.min.y, box.max.y]) {
      for (const z of [box.min.z, box.max.z]) points.push(new THREE.Vector3(x, y, z));
    }
  } else {
    points.push(record.group.getWorldPosition(new THREE.Vector3()));
  }
  let left = Infinity, top = Infinity, right = -Infinity, bottom = -Infinity;
  for (const point of points) {
    const eye = point.clone().applyMatrix4(camera.matrixWorldInverse);
    if (eye.z >= -camera.near) continue;
    const projected = point.project(camera);
    const x = canvasRect.left + (projected.x + 1) * canvasRect.width / 2;
    const y = canvasRect.top + (1 - projected.y) * canvasRect.height / 2;
    left = Math.min(left, x); top = Math.min(top, y);
    right = Math.max(right, x); bottom = Math.max(bottom, y);
  }
  if (!Number.isFinite(left)) return null;
  const pad = box && !box.isEmpty() ? 0 : 7;
  return { left: left - pad, top: top - pad, right: right + pad, bottom: bottom + pad };
}

function recordsInMarquee(rect, surface) {
  const area = surface === "viewport" ? renderer.domElement : $("hierarchyTree");
  const clipped = intersectClientRects(rect, area.getBoundingClientRect());
  if (!clipped) return [];
  if (surface === "hierarchy") {
    return Array.from(area.querySelectorAll(".treeRow"))
      .filter((row) => intersectClientRects(clipped, row.getBoundingClientRect()))
      .map((row) => recordByUid(Number(row.dataset.uid))).filter(Boolean);
  }
  camera.updateMatrixWorld(true);
  const canvasRect = renderer.domElement.getBoundingClientRect();
  return state.objects.filter((record) => {
    const bounds = projectedRecordRect(record, canvasRect);
    return bounds && intersectClientRects(clipped, bounds);
  });
}

function paintSelectionMarquee() {
  const gesture = activeMarquee;
  if (!gesture) return;
  const area = gesture.surface === "viewport" ? renderer.domElement : $("hierarchyTree");
  const raw = dragClientRect(gesture.startX, gesture.startY, gesture.endX, gesture.endY);
  const rect = intersectClientRects(raw, area.getBoundingClientRect()) || raw;
  Object.assign(gesture.overlay.style, {
    left: `${rect.left}px`, top: `${rect.top}px`,
    width: `${Math.max(0, rect.right - rect.left)}px`,
    height: `${Math.max(0, rect.bottom - rect.top)}px`
  });
}

function beginSelectionMarquee(event, surface) {
  // Shift + right-drag, or (Box select on) a plain drag with a finger, a pen, a Quest pointer or the left button.
  const boxToggle = state.selectionOptions.box && event.button === 0 && event.isPrimary !== false;
  if (!((event.button === 2 && event.shiftKey) || boxToggle) || activeMarquee) return;
  if (surface === "viewport" && event.target !== renderer.domElement) return;
  event.preventDefault();
  event.stopPropagation(); // Keep OrbitControls from starting a pan or orbit, and the 3D view from picking.
  const overlay = document.createElement("div");
  overlay.className = "selectionMarquee";
  document.body.appendChild(overlay);
  activeMarquee = { pointerId: event.pointerId, surface, overlay, boxToggle,
    startX: event.clientX, startY: event.clientY, endX: event.clientX, endY: event.clientY };
  paintSelectionMarquee();
}

function moveSelectionMarquee(event) {
  if (!activeMarquee || event.pointerId !== activeMarquee.pointerId) return;
  activeMarquee.endX = event.clientX;
  activeMarquee.endY = event.clientY;
  paintSelectionMarquee();
}

function cancelSelectionMarquee(event) {
  if (!activeMarquee || event.pointerId !== activeMarquee.pointerId) return;
  activeMarquee.overlay.remove();
  activeMarquee = null;
}

function finishSelectionMarquee(event) {
  const gesture = activeMarquee;
  if (!gesture || event.pointerId !== gesture.pointerId) return;
  gesture.overlay.remove();
  activeMarquee = null;
  if (Math.abs(event.clientX - gesture.startX) < 4 && Math.abs(event.clientY - gesture.startY) < 4) {
    // With Box select on, a tap in the 3D view still picks the part under it (a tap in the parts list clicks its row).
    if (gesture.boxToggle && gesture.surface === "viewport") onPointerDown(event);
    return;
  }
  const hits = recordsInMarquee(dragClientRect(gesture.startX, gesture.startY,
    event.clientX, event.clientY), gesture.surface);
  if (!hits.length) return;
  const records = selectedRecords();
  const seen = new Set(records.map((record) => record.uid));
  // a touched grouped part brings its whole group, like a click (hold Alt, or turn on Single parts, to take only the touched parts)
  const { single } = selectionModifiers(event);
  const touched = [];
  for (const record of hits) {
    const group = single ? null : groupForRecord(record);
    touched.push(...(group ? groupRecords(group) : [record]));
  }
  for (const record of touched) if (!seen.has(record.uid)) { records.push(record); seen.add(record.uid); }
  const primary = state.selected && seen.has(state.selected.uid) ? state.selected : hits[0];
  setSelection(records, primary);
}

async function buildPatternFromForm() {
  const message = $("patternMessage");
  const button = $("patternBuildBtn");
  if (button.disabled) return;
  button.disabled = true;
  beginEditorHistoryGroup();
  const sceneEpoch = state.sceneEpoch;
  const preexisting = new Set(state.objects);
  message.textContent = "Building item pattern…";
  try {
    const parent = parentTargetRecord();
    if (!parent) throw new Error("Add a root item first, then build the pattern under it.");
    if (parent.frozenEdge) throw new Error("Choose an editable Add Parent; this edge is preserved verbatim.");
    const itemIds = $("patternItemIds").value.split(/[\s,]+/).map((id) => id.trim()).filter(Boolean);
    // Banned items are allowed (owner 2026-10-18): only A's public room leaves them out.
    const unknown = itemIds.filter((id) => !state.knownIds?.has(id));
    if (unknown.length) throw new Error(`Unknown pixel item ID: ${unknown[0]}`);
    const placements = generatePattern({
      shape: $("patternShape").value, plane: $("patternPlane").value,
      text: $("patternText").value, itemIds,
      size: $("patternSize").value, spacing: $("patternSpacing").value,
      height: $("patternHeight").value, turns: $("patternTurns").value,
      startDeg: $("patternStart").value, sweepDeg: $("patternSweep").value,
      offsetX: $("patternX").value, offsetY: $("patternY").value, offsetZ: $("patternZ").value,
      orientation: $("patternFacing").value
    });
    const existing = RULES.validateInvention(buildGoopJson()).stats.nodes - 1;
    if (existing + placements.length > 512) {
      throw new Error(`This would have ${existing + placements.length} descendants (maximum 512, including contents).`);
    }
    const scaleModifier = Math.round(Math.max(-128, Math.min(127, Number($("patternScale").value) || 0)));
    const endInput = $("patternScaleEnd").value.trim();
    const endScaleModifier = endInput === "" ? scaleModifier
      : Math.round(Math.max(-128, Math.min(127, Number(endInput) || 0)));
    const roll = new THREE.Euler(
      THREE.MathUtils.degToRad(Number($("patternRotX").value) || 0),
      THREE.MathUtils.degToRad(Number($("patternRotY").value) || 0),
      THREE.MathUtils.degToRad(Number($("patternRotZ").value) || 0), "XYZ");
    const rollQuaternion = new THREE.Quaternion().setFromEuler(roll);
    const forwardBasis = new THREE.Vector3(0, 0, 1);
    const records = [];
    for (let i = 0; i < placements.length; i++) {
      if (state.sceneEpoch !== sceneEpoch) throw new Error("The invention changed while the pattern was building.");
      const point = placements[i];
      const record = makeObjectRecord(point.itemID, "child");
      record.documentId = parent.documentId;
      record.group.position.set(...point.position);
      record.group.quaternion.setFromUnitVectors(forwardBasis, new THREE.Vector3(...point.forward));
      record.group.quaternion.multiply(rollQuaternion);
      record.scaleModifier = Math.round(scaleModifier + (endScaleModifier - scaleModifier)
        * i / Math.max(1, placements.length - 1));
      if ($("patternRainbow").checked) {
        record.colorHue = Math.round(i * 255 / Math.max(1, placements.length - 1));
        record.colorSaturation = 100;
      }
      record.hierarchyDirty = true;
      record.transformDirty = true;
      state.objects.push(record);
      linkToParent(record, parent, false);
      records.push(record);
      await attachModel(record);
      if (i % 16 === 15) {
        message.textContent = `Building ${i + 1} / ${placements.length} pixels…`;
        await new Promise(requestAnimationFrame);
      }
    }
    if (state.sceneEpoch !== sceneEpoch) throw new Error("The invention changed while the pattern was building.");
    setSelection(records, records[0]);
    $("patternDialog").close();
    setStatus(`Built ${records.length} item pixels under ${displayName(parent)}.`, "good");
  } catch (err) {
    if (state.sceneEpoch === sceneEpoch) {
      for (const record of state.objects.filter((item) => !preexisting.has(item))) {
        const parent = parentOf(record);
        if (parent) parent.children = parent.children.filter((uid) => uid !== record.uid);
        record.group.parent?.remove(record.group);
      }
      state.objects = state.objects.filter((record) => preexisting.has(record));
      renderHierarchyTree();
      refreshPreview();
    }
    message.textContent = String(err.message || err);
    setStatus(`Pattern: ${message.textContent}`, "bad");
  } finally {
    button.disabled = false;
    endEditorHistoryGroup();
  }
}

function resize() {
  const w = viewport.clientWidth || 1;
  const h = viewport.clientHeight || 1;
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  renderer.setSize(w, h, false);
}

// ---- Center of mass (owner 2026-10-23; center_of_mass.mjs has the game rules) ----
// Every invention in the workspace shows where the game balances its weight: the checkered ball is the center of
// mass of the whole invention and the dashed line drops from it to the floor. Parts stuck to a joystick's stick or a
// robot arm joint add no weight in game, so they never move it. Preview only: nothing here is saved.
const COM_PREFERENCE_KEY = "mikeybox.goopEditor.centerOfMass.v1";
const COM_READOUT_INTERVAL_MS = 250;
const comMarkers = new Map();   // invention (document) id -> marker group
let comCheckerTexture = null;
let comReadoutAt = 0;

async function loadMassProperties() {
  try {
    const response = await fetch("./mass_properties.json", { cache: "no-cache" });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    COM.installMassManifest(await response.json());
    state.massError = "";
  } catch (err) {
    state.massError = `Center of mass unavailable (item weights did not load: ${err.message})`;
  }
}

// The classic center-of-mass symbol: a ball in alternating black and white octants.
function comTexture() {
  if (comCheckerTexture) return comCheckerTexture;
  const canvas = window.document.createElement("canvas");
  canvas.width = 64;
  canvas.height = 32;
  const ctx = canvas.getContext("2d");
  for (let x = 0; x < 4; x++) for (let y = 0; y < 2; y++) {
    ctx.fillStyle = (x + y) % 2 ? "#111111" : "#f4f4f4";
    ctx.fillRect(x * 16, y * 16, 16, 16);
  }
  comCheckerTexture = new THREE.CanvasTexture(canvas);
  comCheckerTexture.colorSpace = THREE.SRGBColorSpace;
  comCheckerTexture.magFilter = THREE.NearestFilter;
  return comCheckerTexture;
}

function comMarker(documentId) {
  let marker = comMarkers.get(documentId);
  if (marker) return marker;
  marker = new THREE.Group();
  marker.name = "center_of_mass_marker";
  marker.userData.previewOnly = true;
  // Drawn on top of the parts so the balance point stays visible inside a build.
  const ball = new THREE.Mesh(new THREE.SphereGeometry(1, 24, 16),
    new THREE.MeshBasicMaterial({ map: comTexture(), depthTest: false, depthWrite: false, transparent: true }));
  ball.name = "center_of_mass_ball";
  ball.renderOrder = 1000;
  const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3(0, -1, 0)]),
    new THREE.LineDashedMaterial({ color: 0xffd34d, dashSize: 0.04, gapSize: 0.03, depthTest: false, depthWrite: false,
      transparent: true, opacity: 0.9 }));
  line.name = "center_of_mass_plumb_line";
  line.renderOrder = 999;
  marker.add(ball, line);
  marker.userData.ball = ball;
  marker.userData.line = line;
  scene.add(marker);
  comMarkers.set(documentId, marker);
  return marker;
}

function shownInScene(object) {
  for (let node = object; node; node = node.parent) if (!node.visible) return false;
  return true;
}

const comAccess = {
  childrenOf: (record) => record.children.map(recordByUid).filter(Boolean),
  attachmentOf: (record) => record.subParentID,
  contentsOf: (record) => record.contents,
  scaleOf: (record) => scaleModifierToScalar(record.scaleModifier, record.itemID),
  // A record's group is its item's runtime root frame (models are rebased inside it), the frame the game applies
  // the prefab center of mass in.
  toWorld: (record, local) => {
    const point = record.group.localToWorld(gameArrToEditorVec(local));
    return [point.x, point.y, point.z];
  },
};

function setCenterOfMassVisible(visible, { persist = true } = {}) {
  state.showCenterOfMass = !!visible;
  $("comToggle").setAttribute("aria-pressed", String(state.showCenterOfMass));
  if (!state.showCenterOfMass) for (const marker of comMarkers.values()) marker.visible = false;
  if (persist) {
    try { localStorage.setItem(COM_PREFERENCE_KEY, JSON.stringify({ visible: state.showCenterOfMass })); } catch (_) {}
  }
  comReadoutAt = 0;
}

function bindCenterOfMassControls() {
  try {
    const saved = JSON.parse(localStorage.getItem(COM_PREFERENCE_KEY) || "{}");
    if (typeof saved?.visible === "boolean") state.showCenterOfMass = saved.visible;
  } catch (_) {}
  setCenterOfMassVisible(state.showCenterOfMass, { persist: false });
  $("comToggle").addEventListener("click", () => {
    setCenterOfMassVisible(!state.showCenterOfMass);
    setStatus(state.showCenterOfMass ? "Center of mass shown for every invention." : "Center of mass hidden.");
  });
}

// Runs after each render, so every record's world matrix is current; the markers move on the next frame.
function updateCenterOfMassMarkers(now) {
  const ready = !!COM.massManifestInfo();
  const live = new Set();
  let active = null;
  if (ready && (state.showCenterOfMass || now >= comReadoutAt)) {
    for (const invention of state.documents) {
      const root = documentRoot(invention.id);
      if (!root || !shownInScene(root.group)) continue;
      const result = COM.inventionCenterOfMass(root, comAccess);
      if (invention.id === state.activeDocumentId) active = { root, result };
      if (!state.showCenterOfMass || !result.center) continue;
      const marker = comMarker(invention.id);
      live.add(invention.id);
      marker.visible = true;
      marker.position.set(...result.center);
      const size = Math.max(0.01, camera.position.distanceTo(marker.position) * 0.024);   // about the same size on screen
      marker.userData.ball.scale.setScalar(size);
      const line = marker.userData.line;
      line.geometry.setFromPoints([new THREE.Vector3(), new THREE.Vector3(0, -result.center[1], 0)]);
      line.computeLineDistances();
    }
  }
  for (const [id, marker] of comMarkers) {
    if (live.has(id)) continue;
    marker.visible = false;
    if (!state.documents.some((invention) => invention.id === id)) {
      scene.remove(marker);
      marker.userData.ball.geometry.dispose();
      marker.userData.ball.material.dispose();
      marker.userData.line.geometry.dispose();
      marker.userData.line.material.dispose();
      comMarkers.delete(id);
    }
  }
  if (now < comReadoutAt) return;
  comReadoutAt = now + COM_READOUT_INTERVAL_MS;
  let text = state.massError || (ready ? "" : "Loading item weights…");
  if (ready && active?.result.center) {
    const local = active.root.group.worldToLocal(new THREE.Vector3(...active.result.center));
    const offset = editorVecToGameArr(local).map((value) => (Math.abs(value) < 0.005 ? 0 : value).toFixed(2)).join(", ");
    text = `${COM.centerOfMassSummary(active.result)} · balance point ${offset} m from the root item's origin`;
  } else if (ready) text = active ? COM.centerOfMassSummary(active.result) : "";
  if ($("massStats").textContent !== text) $("massStats").textContent = text;
}

// Driven by renderer.setAnimationLoop: the browser's frames on screen, the headset's frames in the VR preview.
function animate(time) {
  const presenting = renderer.xr.isPresenting;
  if (!presenting) orbit.update();
  if (!presenting && state.poseUi.active) { syncPoseHandles(); syncPoseGizmo(); }   // the wearer can be re-laid-out or moved
  const now = Number.isFinite(time) ? time : performance.now();
  updateMotionPreview(now);
  renderer.render(scene, camera);
  updateCenterOfMassMarkers(now);
}

async function fetchJsonWithFallback(primary, fallback) {
  try {
    const res = await fetch(primary, { cache: "no-cache" });
    if (res.ok) return { data: await res.json(), viaApi: true };
  } catch (_) {}
  if (!fallback) return { data: null, viaApi: false };
  try {
    const res = await fetch(fallback, { cache: "no-cache" });
    if (res.ok) return { data: await res.json(), viaApi: false };
  } catch (_) {}
  return { data: null, viaApi: false };
}

async function loadCatalog() {
  // items.txt (spawnable ids), the display catalog, the banned list. Static fallback for hosted builds.
  const { data, viaApi } = await fetchJsonWithFallback("./api/items", "./items.json");
  if (!viaApi && data == null) {
    try {
      const txt = await fetch("./items.txt").then((r) => (r.ok ? r.text() : ""));
      const ids = txt.split(/\r?\n/).map((s) => s.trim()).filter((s) => s && !s.startsWith("#"));
      if (ids.length) state.knownIds = new Set(ids);
    } catch (_) {}
    return;
  }
  if (data && Array.isArray(data.ids) && data.ids.length) state.knownIds = new Set(data.ids);
  if (data && Array.isArray(data.catalog)) for (const c of data.catalog) if (c && c.id) state.catalogById.set(c.id, c);
  if (data && Array.isArray(data.banned)) state.bannedIds = new Set(data.banned.filter((x) => typeof x === "string"));
}

async function loadCatalogMetadata() {
  // Independent of /api/items, which supplies names/categories but does not
  // know the game prefab path or retained build snapshot provenance.
  let response;
  try { response = await fetch("./catalog_metadata.json", { cache: "no-cache" }); }
  catch (_) { return; }
  if (!response.ok) return;
  const manifest = await response.json();
  const records = manifest.items;
  if (manifest.schema !== "ac.goop-editor-catalog-metadata.v1" ||
      String(manifest.steamBuildId) !== state.scaleManifest?.buildId ||
      manifest.gameAssemblySha256 !== state.scaleManifest?.gameAssemblySha256 ||
      manifest.resourcesSha256 !== state.scaleManifest?.resourcesSha256 ||
      manifest.itemCount !== state.knownIds?.size ||
      !records || Object.keys(records).length !== state.knownIds.size ||
      [...state.knownIds].some((id) => !records[id]?.firstSeenTrackedBuild)) {
    throw new Error("game-derived catalog metadata is stale or incomplete");
  }
  state.catalogMetadata = new Map(Object.entries(records));
  for (const value of ["collection", "firstSeen"])
    $("itemSort").querySelector(`option[value="${value}"]`).disabled = false;
}

async function loadGameScaleRanges() {
  const response = await fetch("./scale_ranges.json", { cache: "no-cache" });
  if (!response.ok) throw new Error(`game scale manifest: HTTP ${response.status}`);
  const manifest = await response.json();
  const count = RULES.installScaleRangeManifest(manifest);
  state.scaleManifest = { buildId: String(manifest.steamBuildId || ""),
    gameAssemblySha256: String(manifest.gameAssemblySha256 || ""),
    resourcesSha256: String(manifest.resourcesSha256 || ""), count };
}

async function loadGameNetParentFrames() {
  if (!state.knownIds?.size || !state.scaleManifest?.buildId) throw new Error("item catalog or game scale manifest missing");
  const response = await fetch("./netparent_frames.json", { cache: "no-cache" });
  if (!response.ok) throw new Error(`game NetParent frame manifest: HTTP ${response.status}`);
  const manifest = await response.json();
  const count = RULES.installNetParentFrameManifest(manifest, {
    steamBuildId: state.scaleManifest.buildId,
    gameAssemblySha256: state.scaleManifest.gameAssemblySha256,
    resourcesSha256: state.scaleManifest.resourcesSha256,
    itemIDs: state.knownIds,
  });
  state.netParentManifest = { buildId: String(manifest.steamBuildId), count };
}

// Crossbow slots, loadable items and string pull for this build. Without it the editor still works; crossbows
// just show their contents as a list instead of loaded.
async function loadHolderAnchors() {
  try {
    const response = await fetch("./holder_anchors.json", { cache: "no-cache" });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const raw = await response.json();
    state.holderManifest = HOLDER.installHolderManifest(raw, {
      steamBuildId: state.scaleManifest.buildId, gameAssemblySha256: state.scaleManifest.gameAssemblySha256,
      resourcesSha256: state.scaleManifest.resourcesSha256, itemIDs: state.knownIds });
    // Glitched items: where the game lets a player put each item (bag, quiver, ammo pouch, grenade launcher).
    try { RULES.installEquipAllowFlags(raw.items); } catch (flagErr) { RULES.clearEquipAllowFlags(); console.warn(`Glitched-item flags unavailable: ${flagErr.message || flagErr}`); }
    state.holderError = "";
  } catch (err) {
    RULES.clearEquipAllowFlags();
    HOLDER.clearHolderManifest();
    state.holderManifest = null;
    state.holderError = String(err.message || err);
    console.warn(`Crossbow loading preview unavailable: ${state.holderError}`);
  }
  const select = $("ghostCrossbowItem");
  for (const id of HOLDER.crossbowIDs()) select.append(new Option(state.catalogById.get(id)?.name || id, id));
  $("ghostCrossbowControls").disabled = !state.holderManifest;
  if (!state.holderManifest) $("ghostCrossbowNote").textContent = `Crossbow loading preview unavailable: ${state.holderError}`;
}

// Film gear slots, tripod mount and tablet screen for this build. Without it filters / gels / mounts stay plain parts.
async function loadFilmGear() {
  try {
    const response = await fetch("./film_gear_anchors.json", { cache: "no-cache" });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    state.filmManifest = FILM.installFilmManifest(await response.json(), {
      steamBuildId: state.scaleManifest.buildId, gameAssemblySha256: state.scaleManifest.gameAssemblySha256,
      resourcesSha256: state.scaleManifest.resourcesSha256, itemIDs: state.knownIds });
    state.filmError = "";
  } catch (err) {
    FILM.clearFilmManifest();
    state.filmManifest = null;
    state.filmError = String(err.message || err);
    console.warn(`Film gear tools unavailable: ${state.filmError}`);
  }
  $("addVrGogglesBtn").disabled = !state.filmManifest;
}

function syncGhostCrossbowFields() {
  const config = state.ghostCrossbow;
  $("ghostCrossbowItem").value = config.itemID && [...$("ghostCrossbowItem").options].some((option) => option.value === config.itemID)
    ? config.itemID : "";
  $("ghostCrossbowSlot").value = ghostCrossbowSlot(config.slot);
  $("ghostCrossbowScale").value = String(config.scaleModifier || 0);
}

async function init() {
  bindUi();
  setMode("translate");
  resize();
  window.addEventListener("resize", resize);
  const m = await fetchJsonWithFallback("./api/manifest", "./exported_item_models_manifest.json");
  state.serverApi = m.viaApi;
  $("capturePicker").hidden = !state.serverApi;
  const manifest = m.data || { entries: [] };
  if (!m.viaApi) {
    // static hosting: model urls are relative to the page
    manifest.entries = (manifest.entries || []).map((e) => (e.exists && e.glb ? {
      ...e, url: "./exported_item_models/" + String(e.glb).split(/[\\/]/).pop() +
        (e.sha256 ? `?v=${String(e.sha256).slice(0, 16)}` : "")
    } : e));
  }
  state.manifest = manifest;
  state.entries = (manifest.entries || []).filter((entry) => entry.exists && entry.url);
  await loadGameScaleRanges();
  await loadCatalog();
  RULES.installGunAmmoCapabilities(manifest.entries || [], {
    steamBuildId: state.scaleManifest.buildId, gameAssemblySha256: state.scaleManifest.gameAssemblySha256,
    itemIDs: state.knownIds,
  });
  await loadCatalogMetadata();
  await loadGameNetParentFrames();
  await loadMassProperties();
  await loadHolderAnchors();
  await loadFilmGear();
  await loadPlayerRigs();
  const modelled = new Set(state.entries.map((e) => e.item_id));
  state.idsWithoutModels = state.knownIds ? Array.from(state.knownIds).filter((id) => !modelled.has(id)).sort().map((id) => ({ item_id: id, exists: false })) : [];
  // Glitched contents (owner 2026-10-18): catalog items with no prefab ride in bags only (RULES.RECORD_ONLY_ITEMS).
  for (const item of RULES.RECORD_ONLY_ITEMS) {
    if (state.knownIds?.has(item.id) || modelled.has(item.id)) continue;
    state.catalogById.set(item.id, { id: item.id, name: item.name, category: item.category });
    state.idsWithoutModels.push({ item_id: item.id, exists: false, recordOnly: true });
  }
  populateCatalogCategories();
  try {
    const preferences = JSON.parse(localStorage.getItem(ITEM_CATALOG_PREFERENCE_KEY) || "{}");
    if (["id", "name", "category", "price", "priceLow", "value", "valueLow", "collection", "firstSeen"].includes(preferences.sort) &&
        !$("itemSort").querySelector(`option[value="${preferences.sort}"]`)?.disabled)
      $("itemSort").value = preferences.sort;
    if ([...$("itemCategory").options].some((option) => option.value === preferences.category)) $("itemCategory").value = preferences.category;
    setItemCatalogView(preferences.view, { render: false, persist: false });
    setItemListExpanded(preferences.expanded !== false);
  } catch (_) {
    setItemCatalogView("names", { render: false, persist: false });
    setItemListExpanded(true);
  }
  const dl = $("itemIdOptions");
  if (dl && state.knownIds) for (const id of Array.from(state.knownIds).sort()) { const o = document.createElement("option"); o.value = id; dl.appendChild(o); }
  state.selectedEntry = state.entries.find((entry) => entry.item_id === "item_frying_pan") || state.entries[0] || null;
  $("manifestStats").textContent = `${manifest.exported_count || state.entries.length} models, ${state.knownIds.size} spawnable ids, ${state.scaleManifest.count} game scale ranges, ${state.netParentManifest.count} NetParent frame sets${state.serverApi ? "" : " (static mode: Save = Download)"}`;
  if (state.serverApi) {
    try {
      const caps = await fetch("./api/captures").then((r) => r.json());
      const picker = $("capturePicker");
      for (const f of caps.files || []) { const o = document.createElement("option"); o.value = f; o.textContent = f; picker.appendChild(o); }
    } catch (_) {}
  }
  renderItemList();
  renderHierarchyTree();
  renderSelectionList();
  refreshPreview();
  renderer.setAnimationLoop(animate);
  setStatus("Ready. Double-click an item to add it; guns are added loaded.");
  recovery.initPromise = initRecovery();
  await initWorkshopIntegration();
  await loadPrivatePickupFromLink();
}

init().catch((err) => setStatus(`Startup failed: ${err}`, "bad"));

// Workshop projects are durable, versioned copies. The local recovery stack
// continues to protect edits made before a project has been published.
function workshopMessage(message, bad = false) {
  $("workshopStatus").textContent = message;
  $("workshopStatus").style.color = bad ? "var(--bad)" : "var(--good)";
}

// Game delivery pass. Owner 2026-10-17: a Discord-verified moderator signed into the Workshop gets five times the package send
// limits. Owner 2026-10-25 (Discord gate): every Verified member of the Mikeybox Discord gets one too, and with the gate on the
// package Worker refuses packages, private deliveries and pickups without it. The pass comes from the Workshop and rides on
// every send; the Worker decides what it allows.
let primeSendPass = null;
let workshopMember = null;
async function deliveryPassHeader() {
  try {
    if (!workshopApi) return {};
    // About to send without a pass: re-read the Workshop first, the account may have signed in (or been Verified) since.
    if (!workshopIdentity || (!workshopIdentity.isModerator && !workshopMember?.canDeliver)) await refreshWorkshopIdentity();
    if (!workshopIdentity || (!workshopIdentity.isModerator && !workshopMember?.canDeliver)) return {};
    if (!primeSendPass || primeSendPass.expiresAt - Date.now() < 60000) primeSendPass = await workshopApi.sendPass();
    return primeSendPass?.pass ? { "x-mikeybox-pass": primeSendPass.pass } : {};
  } catch (_) { primeSendPass = null; return {}; }
}
// The pass for a courier readiness check (owner 2026-10-28: only signed-in Verified members and moderators are told the
// courier's state; a script polled it to snipe the courier). Unlike deliveryPassHeader it never re-reads the Workshop,
// so a signed-out tab's polls add no Workshop requests.
async function readinessPassHeader() {
  try {
    if (!workshopApi || !workshopIdentity || (!workshopIdentity.isModerator && !workshopMember?.canDeliver)) return {};
    if (!primeSendPass || primeSendPass.expiresAt - Date.now() < 60000) primeSendPass = await workshopApi.sendPass();
    return primeSendPass?.pass ? { "x-mikeybox-pass": primeSendPass.pass } : {};
  } catch (_) { primeSendPass = null; return {}; }
}
// Owner 2026-10-29: with the Discord delivery gate off, anyone may send; the delivery readiness answer then comes without
// "sign_in_required" or discordRequired, and the courier is polled for signed-out visitors too.
let privateDeliveryOpenToAll = false;
const canSeeCourier = () => privateDeliveryOpenToAll ||
  Boolean(workshopIdentity && (workshopIdentity.isModerator || workshopMember?.canDeliver));

// A delivery the package Worker refused for want of a Verified Discord login: its message plus a sign-in button (owner
// 2026-10-25: the old dark-blue link was unreadable on the dark dialog). It opens Discord sign-in in a new tab.
function showDiscordRequired(message, body) {
  // A signed-in account without the Verified role sends no pass, so the site answers as if signed out: say the real reason.
  const text = discordMemberDenied()
    ? "Your Discord account does not have the Verified role yet, so it cannot send builds to the game. Get it in #verify in the Mikeybox Discord, then sign in again (or use a new code)."
    : body.error || "Sign in with Discord to send inventions to the game.";
  const parts = [document.createTextNode(`${text} `)];
  if (workshopApi) {
    const code = document.createElement("button");
    code.type = "button";
    code.className = "discordCodeBtn";
    code.textContent = "Use a code";
    code.addEventListener("click", openDiscordCodeDialog);
    parts.push(document.createElement("br"), discordLoginLink(workshopIdentity ? "Sign in with Discord again" : "Log in with Discord"), " ", code);
  }
  message.replaceChildren(...parts);
  setStatus(text, "bad");
}

function discordLoginLink(text) {
  const link = document.createElement("a");
  link.className = "discordLoginBtn";
  link.href = workshopApi.loginUrl("/");
  link.target = "_blank";
  link.rel = "noopener";
  link.textContent = text;
  return link;
}

// Top-bar Discord account (owner 2026-10-25): a sign-in button while signed out (or not yet confirmed as a Verified member
// when the Discord gate is on), and the signed-in name once the Workshop knows the account.
function discordMemberDenied() {
  return !!workshopIdentity && !!workshopMember?.gate && !!workshopMember.checked &&
    !workshopMember.canWrite && !workshopMember.canDeliver;
}

function renderDiscordAccount() {
  const login = $("discordLoginBtn"), chip = $("discordAccountChip");
  if (!workshopApi) { login.hidden = true; chip.hidden = true; return; }
  const needLogin = !workshopIdentity || (!!workshopMember?.gate && !workshopMember.checked) || discordMemberDenied();
  login.href = workshopApi.loginUrl("/");
  login.textContent = workshopIdentity ? "Sign in with Discord again" : "Log in with Discord";
  login.hidden = !needLogin;
  $("discordCodeBtn").hidden = !needLogin;
  chip.textContent = workshopIdentity ? `Discord: ${workshopIdentity.displayName || "signed in"}` : "";
  chip.title = chip.textContent;
  chip.hidden = !workshopIdentity;
}

async function refreshWorkshopIdentity() {
  if (!workshopApi) return null;
  const result = await workshopApi.me();
  const wasModerator = !!workshopIdentity?.isModerator;
  if (workshopIdentity?.id !== result?.user?.id) primeSendPass = null;   // a pass names one Discord account
  workshopIdentity = result?.user || null;
  workshopMember = result?.member || null;
  if (wasModerator !== !!workshopIdentity?.isModerator) renderValidation(buildGoopJson());   // moderator lag-design notes
  const gate = !!workshopMember?.gate;
  $("workshopIdentity").textContent = !workshopIdentity
    ? (gate ? "Not signed in yet. Sign in with Discord to save builds or send them to the game (for Verified members of the Mikeybox Discord); browsing needs no sign-in. Can't sign in to Discord in this browser? Press Use a code."
      : "Sign in once with Discord to save or collaborate. Browsing needs no sign-in.")
    : !gate ? `Signed in as ${workshopIdentity.displayName || "Discord user"}. This device will stay signed in.`
      : !workshopMember.checked ? `Signed in as ${workshopIdentity.displayName || "Discord user"}. Sign in with Discord again to confirm you are a Verified member of the Mikeybox Discord.`
        : workshopMember.canWrite || workshopMember.canDeliver ? `Signed in as ${workshopIdentity.displayName || "Discord user"}, a Verified member of the Mikeybox Discord.`
          : `Signed in as ${workshopIdentity.displayName || "Discord user"}, but this Discord account does not have the Verified role yet. Get it in #verify in the Mikeybox Discord, then sign in again (or use a new code) to save or send builds.`;
  // Owner 2026-10-25: a signed-in account without the Verified role keeps the sign-in buttons, so it can sign in again
  // after #verify (its roles are read at sign-in).
  $("workshopSignInBtn").hidden = Boolean(workshopIdentity) && (!gate || workshopMember.checked) && !discordMemberDenied();
  $("workshopCodeBtn").hidden = $("workshopSignInBtn").hidden;
  renderDiscordAccount();
  return workshopIdentity;
}

// Owner 2026-10-25 ("some ... can't log into discord from their web browser"): sign in with the one-time code the Mikeybox
// Discord bot gives in #website-login or with /login. The code carries the member's Discord roles, so it also confirms a
// Verified member.
function openDiscordCodeDialog() {
  if (!workshopApi) return;
  $("discordCodeSite").textContent = new URL(workshopApi.origin).host;
  $("discordCodeMessage").textContent = "";
  $("discordCodeMessage").className = "";
  $("discordCodeInput").value = "";
  $("discordCodeDialog").showModal();
  $("discordCodeInput").focus();
}

async function submitDiscordCode(event) {
  event.preventDefault();
  const message = $("discordCodeMessage");
  const code = $("discordCodeInput").value.replace(/[\s-]/g, "");
  if (!/^\d{8}$/.test(code)) {
    message.className = "bad";
    message.textContent = "Enter the 8-digit code from Discord.";
    return;
  }
  const button = $("discordCodeSubmitBtn");
  button.disabled = true;
  message.className = "";
  message.textContent = "Signing in…";
  try {
    await workshopApi.redeemCode(code);
    primeSendPass = null;
    await refreshWorkshopIdentity();
    if (!workshopIdentity) throw new Error("The code was accepted, but this browser did not keep the sign-in. Allow cookies for this site and try again.");
    $("discordCodeDialog").close();
    setStatus(`Signed in as ${workshopIdentity.displayName || "Discord user"}.`, "good");
  } catch (error) {
    message.className = "bad";
    message.textContent = error.message || String(error);
  } finally {
    button.disabled = false;
  }
}

// A shared build needs a picture (owner 2026-10-26), so a large view retries smaller until it fits the 600 KiB limit.
function workshopThumbnail() {
  try {
    renderer.render(scene, camera);
    for (const [width, quality] of [[640, 0.72], [640, 0.5], [480, 0.5], [320, 0.5]]) {
      const image = document.createElement("canvas");
      image.width = width; image.height = Math.round(width * 9 / 16);
      image.getContext("2d").drawImage(renderer.domElement, 0, 0, image.width, image.height);
      const dataUrl = image.toDataURL("image/webp", quality);
      if (dataUrl.length <= 800000) return dataUrl;
    }
  } catch (_) { /* no picture; the Workshop refuses to share without one */ }
  return undefined;
}

// Workshop tags (owner 2026-10-26: "actual tags you can select and are required in the workshop"): the fixed list in
// workshop_tags.mjs, the same one the Workshop and Fabshop check.
function renderWorkshopTagPicker() {
  const box = $("workshopTagOptions");
  box.replaceChildren(...WORKSHOP_TAGS.map((tag) => {
    const label = document.createElement("label");
    const input = Object.assign(document.createElement("input"), { type: "checkbox", name: "workshopTag", value: tag.id });
    const text = Object.assign(document.createElement("span"), { textContent: tag.label });
    label.title = tag.hint;
    label.append(input, text);
    return label;
  }));
  box.addEventListener("change", syncWorkshopTagPicker);
  $("workshopVisibility").addEventListener("change", syncWorkshopTagPicker);
  syncWorkshopTagPicker();
}

function workshopPayload() {
  const kind = $("workshopKind").value;
  const content = kind === "workspace" ? exportWorkspaceProject() : buildGoopJson();
  if (!content || (kind === "workspace" && !content.documents.length)) throw new Error("Add an invention root before saving.");
  if (state.lastValidation?.errors?.length) throw new Error("Fix the Validation panel errors before saving.");
  const title = $("workshopProjectTitle").value.trim();
  if (!title) throw new Error("Enter a title.");
  const tags = workshopPickedTags();
  // "museum" (owner 2026-10-30) is a public build saved into the Workshop's Museum, where only moderators send it to the
  // game; "public" keeps (or takes) it out of the Museum.
  const choice = $("workshopVisibility").value;
  const visibility = choice === "museum" ? "public" : choice;
  const museum = choice === "museum" ? { museum: true } : choice === "public" ? { museum: false } : {};
  // Sharing needs a tag and a picture (owner 2026-10-26); a private draft needs neither. The Workshop checks it too.
  if (visibility !== "private" && !tags.length) throw new Error("Pick at least one tag before you share this build. A private draft does not need one.");
  const thumbnailDataUrl = workshopThumbnail();
  if (visibility !== "private" && !thumbnailDataUrl) {
    throw new Error("The editor could not take a picture of this build to share. Try again, or save it as a private draft.");
  }
  return {
    title, description: $("workshopDescription").value.trim(),
    visibility, ...museum, tags, kind, content, sourceBuildId: String(state.scaleManifest?.buildId || ""), thumbnailDataUrl,
  };
}

const workshopTagInputs = () => [...$("workshopTagOptions").querySelectorAll('input[name="workshopTag"]')];
function workshopPickedTags() { return workshopTagInputs().filter((input) => input.checked).map((input) => input.value); }
// A loaded build's tags; an older typed tag shows as its list tag.
function setWorkshopTags(tags) {
  const picked = new Set((Array.isArray(tags) ? tags : []).map(normalizeWorkshopTag).filter(Boolean));
  for (const input of workshopTagInputs()) input.checked = picked.has(input.value);
  syncWorkshopTagPicker();
}
function syncWorkshopTagPicker() {
  const count = workshopPickedTags().length;
  for (const input of workshopTagInputs()) input.disabled = !input.checked && count >= MAX_WORKSHOP_TAGS;
  $("workshopTagNeed").textContent = $("workshopVisibility").value === "private"
    ? `optional for a private draft; up to ${MAX_WORKSHOP_TAGS}` : `pick 1 to ${MAX_WORKSHOP_TAGS}; needed to share`;
}

// The Workshop site that holds a project: this site's own Workshop, or the partner site's when the user has linked
// both sign-ins and opened one of those builds.
function apiFor(project) {
  return project?.site === "peer" && peerWorkshopApi ? peerWorkshopApi : workshopApi;
}

function workshopSiteName(site) {
  return site === "peer" ? crossSite?.peer.name || "the other site" : crossSite?.self.name || "this site";
}

async function saveWorkshopProject({ copy = false } = {}) {
  if (!workshopApi) return;
  const button = $("workshopSaveBtn");
  button.disabled = true;
  try {
    if (!(await refreshWorkshopIdentity())) {
      workshopMessage("Sign in with Discord, then return here and save again.", true);
      return;
    }
    if (workshopLive && !copy) {
      if (!workshopLive.active) throw new Error("Live editing stopped after a conflict. Rejoin before saving this project, or save a separate copy.");
      if (!workshopLive.ready) throw new Error("Wait for the live workspace to reconnect before saving.");
      workshopLive.flush();
      if (workshopLive.pending || workshopLive.hasUnsentChanges()) {
        throw new Error("Live edits are still syncing. Try saving again in a moment.");
      }
    }
    const payload = workshopPayload();
    const updating = !copy && workshopProject?.id && workshopProject.kind === payload.kind && workshopProject.canEdit !== false;
    const site = updating ? workshopProject.site || "home" : "home";
    const api = site === "peer" ? peerWorkshopApi : workshopApi;
    if (site === "peer" && (!(await refreshPeerIdentity()) || !workshopLinked())) {
      throw new Error(`To save back to ${workshopSiteName("peer")}, link your ${workshopSiteName("home")} and ${workshopSiteName("peer")} accounts (signed in to both with the same Discord account), or use Save as a new build to keep a copy here.`);
    }
    const data = updating
      ? await api.update(workshopProject.id, { ...payload, expectedRevision: workshopProject.revision,
        ...(workshopLive?.active ? { liveRevision: workshopLive.revision } : {}) })
      : await workshopApi.create(payload);
    const project = data?.project;
    if (!project?.id) throw new Error("Workshop did not return a project ID.");
    workshopProject = { id: project.id, kind: project.kind || payload.kind,
      revision: project.revision ?? project.currentRevision ?? 1, canEdit: true, site };
    if (!updating && workshopLive?.active) leaveWorkshopLive("Saved a separate project. Live editing ended for the old one.");
    $("workshopShareSection").hidden = false;
    const where = site === "peer" ? ` on ${workshopSiteName("peer")} Workshop` : "";
    // Owner 2026-10-28: a shared save waits private for the content check.
    const review = project.contentReview?.status === "pending" ? project.contentReview : null;
    workshopMessage(data?.liveRevisionConflict
      ? `Saved ${project.title || payload.title}${where}; newer live edits are still unsaved. Save again after they sync.`
      : review ? `${updating ? "Updated" : "Saved"} ${project.title || payload.title}${where}. It becomes ${review.requestedVisibility === "unlisted" ? "unlisted" : project.museum ? "public in the Museum" : "public"} as soon as the content check passes it.`
      : `${updating ? "Updated" : "Saved"} ${project.title || payload.title}${where} ${project.museum && project.visibility === "public" ? "in the Museum" : `as ${project.visibility || payload.visibility}`}.`);
    setStatus(`Workshop project saved: ${project.title || payload.title}${where}`, "good");
    void refreshWorkshopList();
  } catch (error) {
    workshopMessage(`Workshop save failed: ${error.message || error}`, true);
  } finally { button.disabled = false; }
}

// site: "home" (this site's Workshop) or "peer" (the partner site's). A partner build opens as an editable original only
// while the accounts are linked; otherwise it opens as a copy that saves as a new build here.
async function loadWorkshopProject(projectId, { fromLink = false, site = "home", asCopy = false } = {}) {
  const api = site === "peer" ? peerWorkshopApi : workshopApi;
  if (!api) return;
  if (site === "peer" && !workshopLinked()) asCopy = true;
  const [detail, saved] = await Promise.all([api.project(projectId), api.content(projectId)]);
  const project = detail?.project;
  if (!project || !saved?.content) throw new Error("Workshop project content is unavailable.");
  const existingRoots = state.documents.some((document) => documentRoot(document.id));
  const from = site === "peer" ? `${workshopSiteName("peer")} Workshop` : "Workshop";
  if (saved.kind === "workspace") {
    if (existingRoots && !window.confirm(`Replace this editor workspace with the ${from} project? A local recovery backup will be saved first.`)) return;
    if (workshopLive?.active) leaveWorkshopLive("Switched Workshop projects.");
    await loadWorkspaceProject(saved.content, { fromWorkshop: !asCopy });
    workshopProject = asCopy ? null : { id: project.id, kind: "workspace", revision: saved.revision,
      canEdit: Boolean(project.canEdit ?? project.isOwner), site };
  } else {
    if (workshopLive?.active) leaveWorkshopLive("Switched Workshop projects.");
    await loadJsonData(saved.content, { separate: true,
      name: project.title || saved.content.itemID,
      filename: `${(project.title || saved.content.itemID).replace(/[^a-z0-9_-]+/gi, "_")}.json` });
    // A copied public invention is a new local edit, not an update to the author's listing.
    workshopProject = existingRoots || asCopy ? null : { id: project.id, kind: "goop", revision: saved.revision,
      canEdit: Boolean(project.canEdit ?? project.isOwner), site };
  }
  $("workshopProjectTitle").value = project.title || "";
  $("workshopDescription").value = project.description || "";
  // retain unlisted mode, and a public Museum build stays in the Museum
  $("workshopVisibility").value = project.museum && project.visibility === "public" ? "museum" : project.visibility || "private";
  setWorkshopTags(project.tags);
  $("workshopKind").value = saved.kind;
  $("workshopShareSection").hidden = !workshopProject?.canEdit;
  workshopMessage(asCopy
    ? `Opened a copy of ${project.title || project.id} from ${from}. Saving makes a new build on ${workshopSiteName("home")}.`
    : `Opened ${project.title || project.id} from ${from}.`);
  if (!fromLink) setStatus(`Opened Workshop project: ${project.title || project.id}${site === "peer" ? ` (${workshopSiteName("peer")})` : ""}`, "good");
}

function workshopProjectRow(project, { site = "home", asCopy = false, label = "" } = {}) {
  const row = document.createElement("div"); row.className = "workshopProjectRow";
  row.dataset.site = site; row.dataset.projectId = project.id;
  const details = document.createElement("div");
  const name = document.createElement("strong"); name.textContent = project.title || "Untitled";
  const meta = document.createElement("small");
  meta.textContent = `${label ? `${label} · ` : ""}${project.visibility || "public"}${project.museum ? " · Museum" : ""} · ${project.kind || "goop"} · revision ${project.revision ?? project.currentRevision ?? 1}`;
  details.append(name, meta);
  const open = document.createElement("button"); open.type = "button"; open.textContent = asCopy ? "Open a copy" : "Open";
  open.addEventListener("click", async () => {
    open.disabled = true;
    try { await loadWorkshopProject(project.id, { site, asCopy }); }
    catch (error) { workshopMessage(`Open failed: ${error.message || error}`, true); }
    finally { open.disabled = false; }
  });
  row.append(details, open);
  // Builds you created can be deleted from the Workshop (coauthor-shared rows have canDelete false; the server enforces it).
  if (project.canDelete && !asCopy) {
    const remove = document.createElement("button"); remove.type = "button"; remove.textContent = "Delete";
    remove.className = "danger"; remove.title = "Permanently delete this build from the Workshop";
    remove.addEventListener("click", () => deleteWorkshopProject(project, site, remove));
    row.append(remove);
  }
  return row;
}

async function deleteWorkshopProject(project, site, button) {
  const name = project.title || "Untitled";
  if (!window.confirm(`Delete "${name}" from the ${workshopSiteName(site)} Workshop permanently? Its saved revisions are deleted too. ` +
      "Copies other people remixed stay theirs. The build in this editor is not affected.")) return;
  button.disabled = true;
  try {
    await (site === "peer" && peerWorkshopApi ? peerWorkshopApi : workshopApi).deleteProject(project.id);
    if (workshopProject?.id === project.id && (workshopProject.site || "home") === site) clearWorkshopAssociation();
    workshopMessage(`Deleted "${name}" from the Workshop.`);
    await refreshWorkshopList();
  } catch (error) {
    workshopMessage(`Delete failed: ${error.message || error}`, true);
    button.disabled = false;
  }
}

async function refreshWorkshopList() {
  if (!workshopApi) return;
  const list = $("workshopMyList");
  list.replaceChildren();
  if (!workshopIdentity) list.textContent = "Sign in to see your builds.";
  else {
    // Linked accounts list both sites' builds together, each saved back to its own site.
    const linked = workshopLinked();
    const sources = [["home", workshopApi], ...(linked ? [["peer", peerWorkshopApi]] : [])];
    const results = await Promise.all(sources.map(([site, api]) => api.list({ scope: "mine" })
      .then((data) => ({ site, data }), (error) => ({ site, error }))));
    for (const { site, data, error } of results) {
      if (error) {
        const note = document.createElement("p"); note.className = "fieldNote";
        note.textContent = `Could not load ${workshopSiteName(site)} builds: ${error.message || error}`;
        list.append(note);
        continue;
      }
      for (const project of data?.items || []) list.append(workshopProjectRow(project, { site, label: linked ? workshopSiteName(site) : "" }));
    }
    if (!list.childElementCount) list.textContent = "No Workshop builds yet.";
  }
  await refreshCrossSiteList();
}

async function createWorkshopInvite() {
  if (!workshopProject?.id || !workshopApi) return;
  try {
    const data = await apiFor(workshopProject).createInvite(workshopProject.id);
    const url = data?.inviteUrl || data?.url;
    if (!url) throw new Error("No invite link was returned.");
    $("workshopInviteOutput").textContent = `Editor invite: ${url}`;
    try { await navigator.clipboard.writeText(url); workshopMessage("Editor invite copied to clipboard."); }
    catch { workshopMessage("Editor invite shown below. Copy it to share."); }
  } catch (error) { workshopMessage(`Invite failed: ${error.message || error}`, true); }
}

function leaveWorkshopLive(message = "Left live editing.") {
  workshopLive?.stop(message);
  workshopLive = null;
  $("workshopLiveBtn").textContent = "Join live editing";
  $("workshopLivePresence").textContent = "Waiting for editors to join.";
  updateHistoryButtons();
}

async function toggleWorkshopLive() {
  const button = $("workshopLiveBtn");
  if (workshopLive?.active) { leaveWorkshopLive(); return; }
  if (!workshopApi || !workshopProject?.id || !workshopProject.canEdit) {
    workshopMessage("Save your own workspace or accept an editor invite before joining live editing.", true);
    return;
  }
  if (workshopProject.kind !== "workspace") {
    workshopMessage("Choose Whole workspace and save it to Workshop to edit together live.", true);
    return;
  }
  const signedIn = workshopProject.site === "peer" ? await refreshPeerIdentity() : await refreshWorkshopIdentity();
  if (!signedIn) {
    workshopMessage(`Sign in with Discord to edit together${workshopProject.site === "peer" ? ` on ${workshopSiteName("peer")}` : ""}.`, true);
    return;
  }
  button.disabled = true;
  try {
    await saveRecoveryNow("before live join");
    workshopLive = new LiveWorkspaceClient({
      url: apiFor(workshopProject).realtimeUrl(workshopProject.id),
      getSnapshot: captureEditorSnapshot,
      applySnapshot: (snapshot) => {
        restoreEditorSnapshot(snapshot);
        editorHistory.observe(snapshot, editorDocumentSignature({ ...snapshot, activeDocumentId: undefined }));
      },
      onStatus: (message) => { $("workshopLiveStatus").textContent = message; },
      onPresence: (users) => {
        const names = users.map((user) => user.displayName || "Editor");
        $("workshopLivePresence").textContent = names.length
          ? `${names.length} live editor${names.length === 1 ? "" : "s"}: ${names.join(", ")}`
          : "Waiting for editors to join.";
      },
      onHistory: updateHistoryButtons,
    });
    workshopLive.connect();
    button.textContent = "Leave live editing";
    updateHistoryButtons();
  } catch (error) {
    workshopLive?.stop();
    workshopLive = null;
    workshopMessage(`Could not join live editing: ${error.message || error}`, true);
  } finally { button.disabled = false; }
}

// ---- Prime <-> Fabrication: copies through the partner Workshop, direct send, linked accounts ----
// Works the same in both directions: each editor's partner is the other site (crossSiteFor in workshop_client.mjs).
const WORKSHOP_LINK_KEY = "mikeybox.goopEditor.linkedWorkshop.v1";

function crossSiteMessage(message, bad = false) {
  $("crossSiteStatus").textContent = message;
  $("crossSiteStatus").style.color = bad ? "var(--bad)" : "var(--good)";
}

function readWorkshopLink() {
  try {
    const link = JSON.parse(localStorage.getItem(WORKSHOP_LINK_KEY) || "null");
    return link && link.peer === crossSite?.peer.key ? link : null;
  } catch (_) { return null; }
}

function writeWorkshopLink(link) {
  try { link ? localStorage.setItem(WORKSHOP_LINK_KEY, JSON.stringify(link)) : localStorage.removeItem(WORKSHOP_LINK_KEY); }
  catch (_) {}
}

// Linked only while both sign-ins are the same Discord account the user linked.
function workshopLinked() {
  const link = readWorkshopLink();
  return !!link && sameWorkshopAccount(workshopIdentity, peerIdentity) && link.providerUserId === workshopIdentity.providerUserId;
}

async function refreshPeerIdentity() {
  if (!peerWorkshopApi) return null;
  try {
    peerIdentity = (await peerWorkshopApi.me())?.user || null;
  } catch (error) {
    peerIdentity = null;
    crossSiteMessage(`${crossSite.peer.name} Workshop is unreachable: ${error.message || error}`, true);
  }
  renderCrossSite();
  return peerIdentity;
}

function renderCrossSite() {
  if (!crossSite) return;
  const self = crossSite.self.name, peer = crossSite.peer.name;
  $("crossSiteIdentity").textContent = peerIdentity
    ? `Signed in to ${peer} Workshop as ${peerIdentity.displayName || "Discord user"}.`
    : `Not signed in to ${peer} Workshop. Sign in there to copy builds to it or to link accounts; sending to the ${peer} editor needs no sign-in.`;
  $("crossSiteSignInBtn").hidden = Boolean(peerIdentity);
  const toggle = $("crossSiteLinkToggle");
  const link = readWorkshopLink();
  toggle.checked = workshopLinked();
  toggle.disabled = !(workshopIdentity && peerIdentity) && !link;
  $("crossSiteLinkNote").textContent = workshopLinked()
    ? `Linked: My builds lists your ${self} and ${peer} builds together, and saving updates each build on its own site.`
    : link && workshopIdentity && peerIdentity && !sameWorkshopAccount(workshopIdentity, peerIdentity)
      ? `Paused: ${self} and ${peer} are signed in with different Discord accounts. Sign in to both with the account you linked.`
      : link
        ? `Linked in this browser; sign in to both Workshops to use it.`
        : `Sign in to both Workshops with the same Discord account, then link them to see and save both sites' builds here.`;
}

async function refreshCrossSiteList() {
  const list = $("crossSiteList");
  list.replaceChildren();
  // Linked builds already appear in My builds; otherwise offer copies of the user's builds on the partner site.
  if (!peerWorkshopApi || !peerIdentity || workshopLinked()) { list.hidden = true; return; }
  list.hidden = false;
  try {
    const data = await peerWorkshopApi.list({ scope: "mine" });
    const heading = document.createElement("p"); heading.className = "fieldNote";
    heading.textContent = `Your builds on ${crossSite.peer.name}:`;
    list.append(heading);
    for (const project of data?.items || []) list.append(workshopProjectRow(project, { site: "peer", asCopy: true, label: crossSite.peer.name }));
    if (list.childElementCount === 1) heading.textContent = `No builds on ${crossSite.peer.name} yet.`;
  } catch (error) { list.textContent = `Could not load ${crossSite.peer.name} builds: ${error.message || error}`; }
}

async function setWorkshopLinked(wanted) {
  if (!wanted) {
    writeWorkshopLink(null);
    crossSiteMessage(`Unlinked. ${crossSite.peer.name} builds open as copies again.`);
  } else {
    await refreshWorkshopIdentity().catch(() => null);
    await refreshPeerIdentity();
    if (!workshopIdentity || !peerIdentity) {
      crossSiteMessage(`Sign in to both ${crossSite.self.name} and ${crossSite.peer.name} Workshops first.`, true);
    } else if (!sameWorkshopAccount(workshopIdentity, peerIdentity)) {
      crossSiteMessage(`These are different Discord accounts (${workshopIdentity.displayName || "?"} here, ${peerIdentity.displayName || "?"} on ${crossSite.peer.name}). Sign in to both with the same account to link them.`, true);
    } else {
      writeWorkshopLink({ peer: crossSite.peer.key, providerUserId: workshopIdentity.providerUserId, linkedAt: new Date().toISOString() });
      crossSiteMessage(`Linked ${crossSite.self.name} and ${crossSite.peer.name}. My builds now shows both sites.`);
    }
  }
  renderCrossSite();
  await refreshWorkshopList();
}

async function copyToPeerWorkshop() {
  const button = $("crossSiteCopyBtn");
  button.disabled = true;
  try {
    if (!(await refreshPeerIdentity())) {
      crossSiteMessage(`Sign in to ${crossSite.peer.name} Workshop first, then copy again.`, true);
      return;
    }
    // A copy for the partner Workshop takes its own visibility there, never this site's Museum choice.
    const { museum: _museum, ...shared } = workshopPayload();
    const payload = { ...shared, visibility: $("crossSiteVisibility").value };
    const project = (await peerWorkshopApi.create(payload))?.project;
    if (!project?.id) throw new Error(`${crossSite.peer.name} Workshop did not return a project ID.`);
    const output = $("crossSiteOutput");
    output.replaceChildren();
    const anchor = document.createElement("a");
    anchor.href = workshopEditorLink(crossSite.peer.editorOrigin, project.id);
    anchor.target = "_blank"; anchor.rel = "noopener";
    anchor.textContent = `Open it in the ${crossSite.peer.name} editor`;
    output.append(`Copied to ${crossSite.peer.name} Workshop as ${project.visibility || payload.visibility}. `, anchor);
    crossSiteMessage(`Copied ${project.title || payload.title} to ${crossSite.peer.name} Workshop.`);
    setStatus(`Shared a copy to ${crossSite.peer.name}: ${project.title || payload.title}`, "good");
    await refreshWorkshopList();
  } catch (error) {
    crossSiteMessage(`Copy to ${crossSite.peer.name} failed: ${error.message || error}`, true);
  } finally { button.disabled = false; }
}

// Direct send: open the partner editor and hand it this whole workspace through window messages. Nothing is stored
// online; the partner editor asks before importing it.
async function sendToPeerEditor() {
  let project;
  try {
    project = exportWorkspaceProject();
    if (!project?.documents?.length) throw new Error("Add an invention root before sending.");
  } catch (error) { crossSiteMessage(`Send failed: ${error.message || error}`, true); return; }
  const peer = crossSite.peer.name, origin = crossSite.peer.editorOrigin;
  const nonce = newTransferNonce();
  // Keep the opener (no "noopener"): the partner editor answers through it.
  const target = window.open(transferReceiveLink(origin, nonce, crossSite.self.key), "_blank");
  if (!target) { crossSiteMessage(`Allow pop-ups for this site to open the ${peer} editor, then send again.`, true); return; }
  crossSiteMessage(`Opening the ${peer} editor…`);
  await new Promise((resolve) => {
    let timer = setTimeout(() => finish(`The ${peer} editor did not answer. It may not have the sharing update yet; you can still use Share a copy.`, true), 60000);
    function finish(text, bad = false) {
      clearTimeout(timer);
      window.removeEventListener("message", onMessage);
      crossSiteMessage(text, bad);
      resolve();
    }
    function onMessage(event) {
      if (acceptTransferMessage(event, { origin, source: target, type: TRANSFER_MESSAGES.ready, nonce })) {
        clearTimeout(timer);
        timer = setTimeout(() => finish(`No answer from the ${peer} editor. Check its tab.`, true), 15 * 60000);
        target.postMessage({ type: TRANSFER_MESSAGES.transfer, nonce, from: crossSite.self.name, project }, origin);
        crossSiteMessage(`Sent. Waiting for you to accept it in the ${peer} editor…`);
      } else if (acceptTransferMessage(event, { origin, source: target, type: TRANSFER_MESSAGES.received, nonce })) {
        finish(event.data.accepted ? `The ${peer} editor imported the workspace.` : `The ${peer} editor did not import the workspace.`, !event.data.accepted);
      }
    }
    window.addEventListener("message", onMessage);
  });
}

function askTransferChoice(message, canAdd) {
  const dialog = $("transferDialog");
  $("transferTitle").textContent = `Workspace from ${crossSite.peer.name}`;
  $("transferMessage").textContent = message;
  $("transferAddBtn").hidden = !canAdd;
  $("transferReplaceBtn").textContent = canAdd ? "Replace my workspace" : "Open it";
  return new Promise((resolve) => {
    const done = (choice) => {
      for (const [id, handler] of handlers) $(id).removeEventListener("click", handler);
      dialog.removeEventListener("cancel", onCancel);
      if (dialog.open) dialog.close();
      resolve(choice);
    };
    const handlers = [["transferAddBtn", () => done("add")], ["transferReplaceBtn", () => done("replace")], ["transferCancelBtn", () => done("cancel")]];
    const onCancel = (event) => { event.preventDefault(); done("cancel"); };
    for (const [id, handler] of handlers) $(id).addEventListener("click", handler);
    dialog.addEventListener("cancel", onCancel);
    dialog.showModal();
  });
}

// Adds each invention of a workspace project as a separate invention, keeping everything already open.
async function addWorkspaceDocuments(raw) {
  const workspace = InventionWorkspace.fromProject(raw);
  const documents = workspace.listDocuments();
  beginEditorHistoryGroup();
  try {
    for (const modelDoc of documents) {
      await loadJsonData(workspace.exportDocument(modelDoc.id), {
        separate: true, name: modelDoc.name, filename: `${modelDoc.name.replace(/[^a-z0-9_-]+/gi, "_")}.json`,
        preview: { ...modelDoc.preview, attachment: UI_ATTACHMENTS[modelDoc.preview.attachment] || "free" }, dirty: true,
      });
    }
  } finally { endEditorHistoryGroup(); }
  return documents.length;
}

// Receiving side of direct send (?receiveWorkspace=<nonce>): ask the partner editor that opened this tab for the
// workspace, check it, and import it only if the user agrees.
async function receivePeerWorkspace() {
  const here = new URL(window.location.href);
  const nonce = here.searchParams.get("receiveWorkspace");
  if (nonce === null) return;
  here.searchParams.delete("receiveWorkspace");
  here.searchParams.delete("from");
  try { history.replaceState(null, "", here.toString()); } catch (_) {}   // the code is single-use
  const opener = window.opener;
  if (!crossSite || !isTransferNonce(nonce) || !opener) {
    setStatus("This workspace transfer link is no longer active. Send the workspace again from the other editor.", "bad");
    return;
  }
  const origin = crossSite.peer.editorOrigin, peer = crossSite.peer.name;
  setStatus(`Receiving a workspace from the ${peer} editor…`);
  const message = await new Promise((resolve) => {
    const timer = setTimeout(() => finish(null), 30000);
    function finish(value) { clearTimeout(timer); window.removeEventListener("message", onMessage); resolve(value); }
    function onMessage(event) {
      if (acceptTransferMessage(event, { origin, source: opener, type: TRANSFER_MESSAGES.transfer, nonce })) finish(event.data);
    }
    window.addEventListener("message", onMessage);
    try { opener.postMessage({ type: TRANSFER_MESSAGES.ready, nonce }, origin); }   // only the partner editor can hear it
    catch (_) { finish(null); }
  });
  const reply = (accepted) => { try { opener.postMessage({ type: TRANSFER_MESSAGES.received, nonce, accepted }, origin); } catch (_) {} };
  if (!message) { setStatus(`No workspace arrived from the ${peer} editor. Send it again from there.`, "bad"); return; }
  let documents;
  try { documents = InventionWorkspace.fromProject(message.project).listDocuments(); }
  catch (error) {
    reply(false);
    setStatus(`The workspace from ${peer} could not be read: ${error.message || error}`, "bad");
    return;
  }
  const names = documents.map((document) => document.name).filter(Boolean).slice(0, 5).join(", ");
  const hasWork = state.documents.some((document) => documentRoot(document.id));
  const choice = await askTransferChoice(
    `The ${peer} editor sent a workspace with ${documents.length} invention${documents.length === 1 ? "" : "s"}${names ? ` (${names})` : ""}.` +
    (hasWork ? " Add them to your workspace, or replace it? A local backup is saved first." : ""), hasWork);
  try {
    if (choice === "replace") {
      await loadWorkspaceProject(message.project);
      setStatus(`Opened the workspace from ${peer}.`, "good");
    } else if (choice === "add") {
      await saveRecoveryNow("before adding a workspace from the partner site").catch(() => {});
      const added = await addWorkspaceDocuments(message.project);
      setStatus(`Added ${added} invention${added === 1 ? "" : "s"} from ${peer}.`, "good");
    } else setStatus(`Did not import the workspace from ${peer}.`);
    reply(choice !== "cancel");
  } catch (error) {
    reply(false);
    setStatus(`Import from ${peer} failed: ${error.message || error}`, "bad");
  }
}

function initCrossSite() {
  crossSite = crossSiteFor(window.location.hostname, { site: window.EDITOR_SITE || "", workshopOrigin: window.WORKSHOP_BASE || "",
    peerWorkshopOrigin: window.WORKSHOP_PEER_BASE || "", peerEditorOrigin: window.EDITOR_PEER_ORIGIN || "" });
  if (!crossSite) return;
  peerWorkshopApi = new WorkshopApi(crossSite.peer.workshopOrigin);
  const peer = crossSite.peer.name;
  $("crossSiteSection").hidden = false;
  $("crossSiteTitle").textContent = `Share with ${peer}`;
  $("crossSiteSignInBtn").textContent = `Sign in to ${peer} Workshop`;
  $("crossSiteSendBtn").textContent = `Send to ${peer} editor`;
  $("crossSiteSendNote").textContent = `Send opens the ${peer} editor in a new tab and hands it this whole workspace. No sign-in, nothing stored online; the ${peer} editor asks before importing it.`;
  $("crossSiteCopyBtn").textContent = `Share a copy to ${peer} Workshop`;
  $("crossSiteLinkLabel").textContent = `Link my ${crossSite.self.name} and ${peer} Workshop accounts`;
  $("crossSiteSignInBtn").addEventListener("click", () => {
    const tab = window.open(peerWorkshopApi.loginUrl("/"), "_blank", "noopener");
    if (!tab) crossSiteMessage(`Allow a new tab for ${peer} sign-in, then return to the editor.`, true);
  });
  $("crossSiteSendBtn").addEventListener("click", () => { void sendToPeerEditor(); });
  $("crossSiteCopyBtn").addEventListener("click", () => { void copyToPeerWorkshop(); });
  $("crossSiteLinkToggle").addEventListener("change", (event) => { void setWorkshopLinked(event.target.checked); });
  renderCrossSite();
}

async function initWorkshopIntegration() {
  const origin = workshopOriginFor(window.location.hostname, window.WORKSHOP_BASE || "");
  if (!origin) { $("workshopBtn").hidden = true; return; }
  workshopApi = new WorkshopApi(origin);
  renderWorkshopTagPicker();
  void refreshBuildSecurity();
  window.addEventListener("focus", () => { void refreshBuildSecurity(); });
  initCrossSite();
  // Show the top-bar sign-in now, then re-read the account when the user comes back from the Discord sign-in tab.
  renderDiscordAccount();
  void refreshWorkshopIdentity().catch(() => {});
  window.addEventListener("focus", () => { if (!$("discordLoginBtn").hidden) void refreshWorkshopIdentity().catch(() => {}); });
  const refreshAll = async () => {
    await refreshWorkshopIdentity();
    await refreshPeerIdentity();
    await refreshWorkshopList();
  };
  $("workshopBtn").addEventListener("click", async () => {
    $("workshopDialog").showModal();
    if (!$("workshopProjectTitle").value) $("workshopProjectTitle").value = activeDocument()?.name || "My invention";
    try { await refreshAll(); }
    catch (error) { workshopMessage(`Workshop is unavailable: ${error.message || error}`, true); }
  });
  $("workshopSignInBtn").addEventListener("click", () => {
    const tab = window.open(workshopApi.loginUrl("/"), "_blank", "noopener");
    if (!tab) workshopMessage("Allow a new tab for Discord sign-in, then return to the editor.", true);
  });
  $("workshopCodeBtn").addEventListener("click", openDiscordCodeDialog);
  $("discordCodeBtn").addEventListener("click", openDiscordCodeDialog);
  $("discordCodeForm").addEventListener("submit", (event) => { void submitDiscordCode(event); });
  $("discordCodeCloseBtn").addEventListener("click", () => $("discordCodeDialog").close());
  $("workshopBrowseBtn").addEventListener("click", () => window.open(workshopApi.origin, "_blank", "noopener"));
  $("workshopForm").addEventListener("submit", (event) => { event.preventDefault(); void saveWorkshopProject(); });
  $("workshopSaveCopyBtn").addEventListener("click", () => { void saveWorkshopProject({ copy: true }); });
  $("workshopRefreshBtn").addEventListener("click", () => { void refreshAll().catch(() => {}); });
  $("crossSiteRefreshBtn").addEventListener("click", () => { void refreshAll().catch(() => {}); });
  $("workshopInviteBtn").addEventListener("click", () => { void createWorkshopInvite(); });
  $("workshopLiveBtn").addEventListener("click", () => { void toggleWorkshopLive(); });
  $("workshopCloseBtn").addEventListener("click", () => $("workshopDialog").close());
  window.addEventListener("focus", () => { if ($("workshopDialog").open) void refreshAll().catch(() => {}); });
  const fromLink = new URL(window.location.href).searchParams.get("workshopProject");
  if (fromLink) {
    try {
      await loadWorkshopProject(fromLink, { fromLink: true });
      if (new URL(window.location.href).searchParams.get("live") === "1") {
        if (workshopProject?.canEdit) await toggleWorkshopLive();
        else setStatus("This Workshop project is read-only for your account. Ask for an editor invite to join live editing.", "bad");
      }
    }
    catch (error) { setStatus(`Workshop open failed: ${error.message || error}`, "bad"); }
  }
  await receivePeerWorkspace();
}

// ---- Mikeybox Prime "Send To Game" (flag-gated on window.PRIME_API_BASE; the editor works fully without it) ----
function recentPlayerNames() {
  try {
    const names = JSON.parse(localStorage.getItem("mikeybox_recent_player_names") || "[]");
    return Array.isArray(names) ? names.filter((name) => typeof name === "string" && name.length <= 32).slice(0, 8) : [];
  } catch (_) { return []; }
}

function renderRecentPlayerNames(names = recentPlayerNames()) {
  const list = $("recentPlayerNames");
  list.replaceChildren();
  for (const name of names) {
    const option = document.createElement("option");
    option.value = name;
    list.appendChild(option);
  }
}

function prefillPlayerName(inputId) {
  const names = recentPlayerNames();
  renderRecentPlayerNames(names);
  if (!$(inputId).value && names.length) $(inputId).value = names[0];
}

function rememberPlayerName(name) {
  const normalized = String(name || "").normalize("NFKC").trim().replace(/\s+/g, " ");
  if (!normalized || normalized.length > 32) return;
  const names = [normalized, ...recentPlayerNames().filter((item) => item.toLowerCase() !== normalized.toLowerCase())].slice(0, 8);
  try { localStorage.setItem("mikeybox_recent_player_names", JSON.stringify(names)); } catch (_) {}
  renderRecentPlayerNames(names);
}

// MY ORDERS (owner 2026-10-23): every send is remembered in this browser, with the PIN chosen for a pad package, so
// order.html can list waiting and past orders without the player typing an order id. order.html reads the same key.
function rememberPrimeOrder(entry) {
  const key = "prime_order_history";
  try {
    const list = JSON.parse(localStorage.getItem(key) || "[]");
    const kept = (Array.isArray(list) ? list : []).filter((e) => e && e.requestId !== entry.requestId);
    kept.unshift({ ...entry, at: Date.now() });
    localStorage.setItem(key, JSON.stringify(kept.slice(0, 60)));
  } catch (_) {}
}

function primeBrowserToken() {
  const key = "prime_browser_token";
  const valid = (value) => /^[a-zA-Z0-9_-]{16,128}$/.test(value || "");
  if (valid(window.__primeBrowserToken)) return window.__primeBrowserToken;
  let stored = "";
  try { stored = localStorage.getItem(key) || ""; } catch (_) {}
  if (!valid(stored)) try { stored = sessionStorage.getItem(key) || ""; } catch (_) {}
  if (!valid(stored)) {
    const bytes = crypto.getRandomValues(new Uint8Array(24));
    stored = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
  }
  window.__primeBrowserToken = stored;
  try { localStorage.setItem(key, stored); } catch (_) {
    try { sessionStorage.setItem(key, stored); } catch (_) {}
  }
  return stored;
}

function convergeSelectedOrigins() {
  const records = selectedTransformRoots().filter((record) => record.role !== "root" && !record.frozenEdge);
  if (records.length < 2) return setStatus("Select at least two independent child items to meet at one point.", "bad");
  const positions = records.map((record) => record.group.getWorldPosition(new THREE.Vector3()));
  const target = positions.reduce((sum, position) => sum.add(position), new THREE.Vector3()).multiplyScalar(1 / positions.length);
  for (const record of records) {
    const rotation = record.group.getWorldQuaternion(new THREE.Quaternion());
    applyWorldPoseToRecord(record, parentOf(record), target, rotation);
  }
  attachTransformToSelection();
  syncInspectorFromSelection();
  refreshPreview();
  setStatus(`${records.length} child origins met at their shared centre. Their parents and rotations were unchanged.`, "good");
}

function aimSelectedLasers() {
  updateGhostPreview();
  const previewTarget = sightTarget();
  if (!previewTarget || !wornCopy) return setStatus("Enable the ghost player preview first.", "bad");
  const root = rootRecord();
  root.group.updateMatrixWorld(true);
  wornCopy.updateMatrixWorld(true);
  const target = previewTarget.applyMatrix4(wornCopy.matrixWorld.clone().invert()).applyMatrix4(root.group.matrixWorld);
  const records = selectedRecords().filter((record) => /^item_mining_laser(?:_|$)/.test(record.itemID) && !record.frozenEdge);
  if (!records.length) return setStatus("Select one or more mining lasers to aim.", "bad");
  for (const record of records) {
    const position = record.group.getWorldPosition(new THREE.Vector3());
    const direction = target.clone().sub(position);
    if (direction.lengthSq() < 0.000001) continue;
    const rotation = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), direction.normalize());
    applyWorldPoseToRecord(record, parentOf(record), position, rotation);
  }
  attachTransformToSelection();
  syncInspectorFromSelection();
  refreshPreview();
  setStatus(`Aimed ${records.length} mining laser(s) at the look target.`, "good");
}
async function sendToGame() {
  const base = window.PRIME_API_BASE;
  if (base === undefined) return setStatus("Send To Game is not configured on this host.", "bad");
  const data = buildGoopJson();
  if (!data) return setStatus("Nothing to send.", "bad");
  if (state.lastValidation && state.lastValidation.errors.length) return setStatus(`Fix ${state.lastValidation.errors.length} validation error(s) before sending; see the Validation panel.`, "bad");
  setStatus("Sending to Mikeybox Prime...");
  try {
    const res = await fetch(base + "/api/orders", { method: "POST", headers: { "content-type": "application/json", "x-prime-browser": primeBrowserToken() }, body: JSON.stringify({ invention: data }) });
    const body = await res.json();
    if (!res.ok) return setStatus("Send failed: " + (body.error || res.status) + (body.details ? " -- " + body.details.join("; ") : ""), "bad");
    setStatus(`Sent. Wait in room ${body.code}. ETA ${Math.max(1, Math.round((body.etaSeconds || 0) / 60))} min. Opening your order page...`, "good");
    const url = "order.html?order=" + encodeURIComponent(body.requestId) + "&cancel=" + encodeURIComponent(body.cancelToken);
    try { window.open(url, "_blank"); } catch {}
  } catch (err) {
    setStatus("Send failed: " + err, "bad");
  }
}

function privateCourierMessage(readiness) {
  if (readiness?.ready === true) return `Private courier ready (${readiness.availableJobs} room${readiness.availableJobs === 1 ? "" : "s"} available).`;
  if (readiness?.reason === "courier_busy") return "Private courier is busy. Please try again shortly.";
  if (readiness?.reason === "api_unreachable") return "Cannot check the private courier from this connection. The courier may still be online; try refreshing or switching networks.";
  if (readiness?.reason === "courier_mode_unavailable") return "Private courier is temporarily unavailable for this request. Please try again shortly.";
  if (readiness?.reason === "needs_attention") return "Private courier is paused while an earlier request is reviewed. Please try again later.";
  if (readiness?.reason === "sign_in_required") return "Sign in with Discord as a Verified member to see the private courier.";
  if (readiness?.reason === "slow_down") return "Checking the courier too often. Wait a minute.";
  return "Private courier is offline. Private rooms can be requested when it is ready.";
}

async function privateCourierReadiness(mode) {
  const base = String(window.PACKAGE_API_BASE || "").replace(/\/$/, "");
  if (!base) return { ready: false, reason: "courier_offline", availableJobs: 0 };
  try {
    const response = await fetch(`${base}/api/courier/readiness?mode=${mode}`, { cache: "no-store", headers: await readinessPassHeader() });
    const body = await response.json();
    if (mode === "delivery") privateDeliveryOpenToAll = body?.reason !== "sign_in_required" && body?.discordRequired !== true;
    if (!response.ok && body?.reason !== "slow_down") throw new Error(`HTTP ${response.status}`);
    if (body?.ready === true && Number.isInteger(body.availableJobs) && body.availableJobs > 0)
      return { ready: true, availableJobs: body.availableJobs, reason: "ready",
        humanCheck: typeof body.humanCheck?.siteKey === "string" ? { siteKey: body.humanCheck.siteKey } : null };
    return { ready: false, reason: body?.reason || "courier_offline", availableJobs: 0 };
  } catch {
    // A failed fetch or unreadable response does not establish that the courier
    // itself is offline. Keep scheduling closed, but report the connection issue.
    return { ready: false, reason: "api_unreachable", availableJobs: 0 };
  }
}

// Owner 2026-10-18: private courier requests carry a Cloudflare Turnstile token so a script cannot grab rooms. The
// Worker's readiness answer names the public site key; without one (check switched off) nothing loads. The widget
// stays invisible unless Cloudflare needs the visitor to tick a box.
let turnstileLoader = null;
function loadTurnstile() {
  if (window.turnstile) return Promise.resolve(window.turnstile);
  if (!turnstileLoader) turnstileLoader = new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
    script.async = true;
    script.onload = () => window.turnstile ? resolve(window.turnstile) : reject(new Error("the human check did not load"));
    script.onerror = () => { turnstileLoader = null; reject(new Error("the human check could not load; check your connection or content blocker")); };
    document.head.appendChild(script);
  });
  return turnstileLoader;
}

// A named package send has no courier readiness of its own; the readiness answer still names the site key.
async function humanCheckConfig() {
  const base = String(window.PACKAGE_API_BASE || "").replace(/\/$/, "");
  try {
    const body = await (await fetch(`${base}/api/courier/readiness`, { cache: "no-store", headers: await readinessPassHeader() })).json();
    return { humanCheck: typeof body?.humanCheck?.siteKey === "string" ? { siteKey: body.humanCheck.siteKey } : null };
  } catch { return { humanCheck: null }; }
}

const humanCheckWidgets = new Map();
async function humanCheckToken(readiness, action, beforeId) {
  const siteKey = readiness?.humanCheck?.siteKey;
  if (!siteKey) return "";
  const turnstile = await loadTurnstile();
  const boxId = beforeId + "HumanCheck";
  let wrap = document.getElementById(boxId);
  if (!wrap) {
    wrap = document.createElement("div");
    wrap.id = boxId;
    wrap.style.margin = "8px 0";
    const note = document.createElement("div");
    note.className = "muted";
    note.style.fontSize = "12px";
    note.textContent = "Human check by Cloudflare: if a box appears below, tick it to continue.";
    wrap.append(note, document.createElement("div"));
    ($(beforeId).closest(".actions") || $(beforeId)).insertAdjacentElement("beforebegin", wrap);
  }
  const box = wrap.lastElementChild;
  // Tokens are single use: every request renders a fresh widget.
  if (humanCheckWidgets.has(boxId)) { try { turnstile.remove(humanCheckWidgets.get(boxId)); } catch (_) {} }
  box.replaceChildren();
  wrap.scrollIntoView({ block: "nearest" });
  // Owner 2026-10-19: players got stuck on "Checking you're human" -- an invisible widget's checkbox went unnoticed.
  // The widget is always shown, asks clearly when it needs a tick, and every outcome ends the wait with a message.
  return new Promise((resolve, reject) => {
    let settled = false;
    const done = (fn, value) => { if (!settled) { settled = true; clearTimeout(timer); fn(value); } };
    const fail = (text) => done(reject, new Error(text));
    const timer = setTimeout(() => fail("the human check did not finish; tick the Cloudflare box if you see one, or refresh and try again"), 90000);
    try {
      humanCheckWidgets.set(boxId, turnstile.render(box, { sitekey: siteKey, action, appearance: "always",
        callback: (value) => done(resolve, value),
        "before-interactive-callback": () => { wrap.firstElementChild.textContent = "Tick the Cloudflare box below to prove you're human."; wrap.scrollIntoView({ block: "nearest" }); },
        "expired-callback": () => fail("the human check expired; please try again"),
        "timeout-callback": () => fail("the human check timed out; please try again and tick the box when it appears"),
        "unsupported-callback": () => fail("this browser can't run Cloudflare's human check; try another browser"),
        "error-callback": () => { fail("the human check failed; refresh the page and try again"); return true; } }));
    } catch (_) { fail("the human check could not start; refresh the page and try again"); }
  });
}

function showPrivateCourierReadiness(mode, readiness) {
  const available = readiness?.ready === true;
  if (mode === "delivery") {
    const option = $("privateDeliveryOption");
    if (!option.hidden) option.disabled = !available;
    const status = $("privateDeliveryAvailability");
    status.hidden = option.hidden;
    if (!status.hidden) status.textContent = privateCourierMessage(readiness);
    if (!available && $("packageDeliveryMode").value === "private") {
      $("packageDeliveryMode").value = "named";
      syncPackageDeliveryMode();
    }
  } else {
    const button = $("privatePickupBtn");
    if (!button.hidden) button.disabled = !available;
    const status = $("privatePickupAvailability");
    status.textContent = privateCourierMessage(readiness);
  }
}

let privateCourierReadinessGeneration = 0;
async function refreshPrivateCourierReadiness() {
  const generation = ++privateCourierReadinessGeneration;
  const modes = [];
  if (window.PRIME_PRIVATE_DELIVERY_ENABLED === true && window.PACKAGE_API_BASE) modes.push("delivery");
  if (window.PRIME_PICKUP_ENABLED === true && window.PACKAGE_API_BASE) modes.push("pickup");
  await Promise.all(modes.map(async (mode) => {
    const readiness = await privateCourierReadiness(mode);
    if (generation === privateCourierReadinessGeneration) showPrivateCourierReadiness(mode, readiness);
  }));
}

// THE LAG CHECK WHERE A DELIVERY IS SCHEDULED (owner 2026-10-31: "the lag score and threshold and verdict would also need to be
// shown in the editor at the moment when they try to schedule a delivery"): the shared validator's lag report of the active
// invention, each score beside its limits; the Workshop shows the same report on the build's card and page.
const LAG_CHECK_TITLES = { refuse: "Fails the lag check", review: "Lag warning", ok: "Passes the lag check" };
function renderPackageLagCheck() {
  const box = $("packageLagCheck");
  if (!box) return;
  box.textContent = "";
  const invention = buildGoopJson();
  let report = null;
  try { report = invention ? VALIDATOR.lagReport([invention]) : null; } catch (err) { console.warn("lag report failed", err); }
  box.className = report ? `lagCheck ${report.verdict}` : "lagCheck";
  if (!report) return;
  const add = (tag, text, parent = box) => { const node = document.createElement(tag); if (text !== undefined) node.textContent = text; parent.appendChild(node); return node; };
  add("strong", LAG_CHECK_TITLES[report.verdict] || "Lag check");
  const moderator = Boolean(workshopIdentity?.isModerator);
  add("p", report.verdict === "refuse"
    ? (moderator ? "Deliveries refuse this build for everyone else; you can send it as a verified Discord moderator."
      : "Deliveries refuse this build. Use fewer parts in use, or fewer of the heavy items, until every score is inside its limit.")
    : report.verdict === "review" ? "Allowed, but close to the limits: players on a Quest 2 may lag while it is used." : "It is inside every limit.");
  const table = add("table");
  const head = add("tr", undefined, add("thead", undefined, table));
  for (const text of ["Lag score", "This build", "Warning", "Refused"]) add("th", text, head);
  const body = add("tbody", undefined, table);
  for (const m of report.measures) {
    const row = add("tr", undefined, body);
    row.className = m.state;
    const word = m.lowerIsWorse ? "under" : "from";
    add("td", m.label, row);
    add("td", `${Number(m.value).toFixed(1)} ${m.unit}`, row);
    add("td", `${word} ${m.review} ${m.unit}`, row);
    add("td", `${word} ${m.refuse} ${m.unit}`, row);
  }
  const findings = [...report.otherReasons.map((text) => ["refuse", text]), ...report.otherWarnings.map((text) => ["review", text])];
  if (findings.length) {
    const list = add("ul");
    // The lag screen's note on many copies of one item reads "201 x item_plank"; said in words.
    for (const [kind, text] of findings.slice(0, 6)) {
      add("li", text.replace(/^(.*: )?(\d+) x (item_[a-z0-9_]+)$/i, "$1$2 copies of one item ($3)"), list).className = kind;
    }
  }
}

async function sendToMikeyboxBot(event) {
  event.preventDefault();
  const base = String(window.PACKAGE_API_BASE || "").replace(/\/$/, "");
  const message = $("packageMessage");
  const button = $("packageSubmitBtn");
  const displayName = $("packageDisplayName").value.normalize("NFKC").trim().replace(/\s+/g, " ");
  if (!base || !displayName || displayName.length > 32) { message.textContent = "Enter your full account display name."; return; }
  const privateDelivery = $("packageDeliveryMode").value === "private";
  const pin = $("packagePin").value.trim();
  const scanClaimCode = $("privateDeliveryClaimCode").value.trim();
  if (!privateDelivery && pin && !/^[1-4]{4}$/.test(pin)) { message.textContent = "Use four digits from 1 to 4, or leave the PIN empty."; return; }
  if (privateDelivery && scanClaimCode && !/^([1-4]{4}|[0-9]{8})$/.test(scanClaimCode)) {
    message.textContent = "Use a current Prime pad PIN or voice scan code, or leave the optional field empty.";
    return;
  }
  let readiness = null;
  if (privateDelivery) {
    readiness = await privateCourierReadiness("delivery");
    showPrivateCourierReadiness("delivery", readiness);
    if (!readiness.ready) { message.textContent = privateCourierMessage(readiness); return; }
  }
  const invention = buildGoopJson();
  if (!invention) { message.textContent = "Add a root item first."; return; }
  if (state.lastValidation?.errors?.length) { message.textContent = "Fix the errors in the Validation panel first."; return; }
  button.disabled = true;
  message.textContent = privateDelivery ? "Checking you're human..." : "Sending package...";
  try {
    message.textContent = "Checking you're human...";
    const turnstileToken = privateDelivery ? await humanCheckToken(readiness, "private_delivery", "packageSubmitBtn") :
      await humanCheckToken(await humanCheckConfig(), "package_send", "packageSubmitBtn");
    if (!privateDelivery) message.textContent = "Sending package...";
    if (privateDelivery) message.textContent = "Requesting a private delivery room...";
    const res = await fetch(base + (privateDelivery ? "/api/private-deliveries" : "/api/packages"), { method: "POST", headers: {
      "content-type": "application/json", "x-prime-browser": primeBrowserToken(), ...(await deliveryPassHeader()),
    }, body: JSON.stringify(privateDelivery ? { displayName, scanClaimCode, invention, ...(turnstileToken ? { turnstileToken } : {}) } :
      { displayName, pin, invention, ...(turnstileToken ? { turnstileToken } : {}) }) });
    const body = await res.json();
    if (!res.ok && body.discordRequired) { showDiscordRequired(message, body); return; }
    if (!res.ok && privateDelivery && body.appealUrl) {
      const appeal = document.createElement("a");
      appeal.href = body.appealUrl;
      appeal.target = "_blank";
      appeal.rel = "noopener noreferrer";
      appeal.textContent = "Appeal in the owner's Discord";
      message.replaceChildren(document.createTextNode((body.error || "Private delivery unavailable") + " "), appeal);
      setStatus(body.error || "Private delivery unavailable", "bad");
      return;
    }
    if (!res.ok) throw new Error(body.error + (body.details ? ": " + body.details.join("; ") : ""));
    rememberPlayerName(displayName);
    if (privateDelivery) {
      try { localStorage.setItem("prime_cancel_" + body.requestId, body.cancelToken); } catch (_) {}
      rememberPrimeOrder({ kind: "delivery", requestId: body.requestId, displayName: body.displayName,
        rootItem: String(invention.itemID || "") });
      const url = "order.html?mode=private&order=" + encodeURIComponent(body.requestId);
      $("privateDeliveryClaimCode").value = "";
      message.replaceChildren(document.createTextNode("Open the delivery status page. The room code appears after the courier confirms it is waiting alone. Keep the code private and join with the game account whose full name you entered. Your identity and ban status are checked before delivery. "));
      const link = document.createElement("a");
      link.href = url;
      link.textContent = "Track or cancel this delivery";
      message.append(link);
      // Per-delivery item caps (owner 2026-10-20): the Worker says what it left out (e.g. cluster grenades past 32).
      if (body.itemCapNotice) message.append(document.createTextNode(" " + body.itemCapNotice));
      setStatus(`Private delivery requested for ${body.displayName}. ${body.itemCapNotice ? body.itemCapNotice + " " : ""}Package validation is pending; wait for the room-ready status, then join before the countdown on the status page runs out.`, "good");
      try { window.open(url, "_blank", "noopener"); } catch (_) {}
      return;
    }
    // roomLabel: how this site names its room. Fabrication never shows its room code (owner 2026-10-09: it is secret).
    const room = window.MIKEYBOX_SITE?.roomLabel || window.MIKEYBOX_SITE?.roomCode || "MIKEYBOX";
    const voice = window.MIKEYBOX_SITE?.voiceBotEnabled !== false;
    message.textContent = pin ?
      `Package sent for ${body.displayName}. Join ${room} and enter PIN ${pin} on the empty Prime pad.${voice ? ` You can also say “Mikeybox deliver my package PIN ${pin}”.` : ""}` :
      `No-PIN package sent for ${body.displayName}. Join ${room}, hit one Prime pad drum, and wait.${voice ? " You can also say “Mikeybox deliver my package”." : ""}`;
    if (body.itemCapNotice) message.textContent += " " + body.itemCapNotice;
    if (body.requestId) {
      rememberPrimeOrder({ kind: "package", requestId: body.requestId, displayName: body.displayName, pin: pin || "",
        rootItem: String(invention.itemID || "") });
      const orders = document.createElement("a");
      orders.href = "order.html";
      orders.target = "_blank";
      orders.rel = "noopener";
      orders.textContent = "See all my orders";
      message.append(" ", orders);
    }
    setStatus(`Package sent for ${body.displayName}.${body.itemCapNotice ? " " + body.itemCapNotice : ""} ${pin ? "Use your PIN" : "Use a single drum hit"} in ${room}.`, "good");
  } catch (err) { message.textContent = `Send failed: ${err.message || err}`; setStatus(message.textContent, "bad"); }
  finally { button.disabled = false; }
}

function syncPackageDeliveryMode() {
  const privateDelivery = $("packageDeliveryMode").value === "private";
  $("packagePinLabel").hidden = privateDelivery;
  $("privateDeliveryClaimLabel").hidden = !privateDelivery;
  $("privateDeliveryHint").hidden = !privateDelivery;
  $("packagePin").disabled = privateDelivery;
  $("privateDeliveryClaimCode").disabled = !privateDelivery;
  $("privateDeliveryClaimCode").required = false;
}

async function scanApi(path, body) {
  const base = String(window.PACKAGE_API_BASE || "").replace(/\/$/, "");
  const response = await fetch(base + path, { method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify(body) });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || `HTTP ${response.status}`);
  return result;
}

async function createPrivatePickup(event) {
  event.preventDefault();
  if (window.PRIME_PICKUP_ENABLED !== true) return;
  const displayName = $("pickupDisplayName").value.normalize("NFKC").trim().replace(/\s+/g, " ");
  const scanClaimCode = $("pickupClaimCode").value.trim();
  const message = $("privatePickupMessage");
  if (!displayName || (scanClaimCode && !/^([1-4]{4}|[0-9]{8})$/.test(scanClaimCode))) {
    message.textContent = "Enter your full current game account name; use a valid Prime scan code or leave it empty.";
    return;
  }
  const readiness = await privateCourierReadiness("pickup");
  showPrivateCourierReadiness("pickup", readiness);
  if (!readiness.ready) { message.textContent = privateCourierMessage(readiness); return; }
  $("privatePickupSubmitBtn").disabled = true;
  message.textContent = "Checking you're human…";
  try {
    const turnstileToken = await humanCheckToken(readiness, "private_pickup", "privatePickupSubmitBtn");
    message.textContent = "Preparing a private pickup…";
    const base = String(window.PACKAGE_API_BASE || "").replace(/\/$/, "");
    const response = await fetch(base + "/api/private-pickups", { method: "POST",
      headers: { "content-type": "application/json", "x-prime-browser": primeBrowserToken(), ...(await deliveryPassHeader()) },
      body: JSON.stringify({ displayName, scanClaimCode, ...(turnstileToken ? { turnstileToken } : {}) }) });
    const result = await response.json();
    if (!response.ok && result.discordRequired) { showDiscordRequired(message, result); return; }
    if (!response.ok && result.appealUrl) {
      const appeal = document.createElement("a");
      appeal.href = result.appealUrl;
      appeal.target = "_blank";
      appeal.rel = "noopener noreferrer";
      appeal.textContent = "Appeal in the owner's Discord";
      message.replaceChildren(document.createTextNode((result.error || "Private pickup unavailable") + " "), appeal);
      setStatus(result.error || "Private pickup unavailable", "bad");
      return;
    }
    if (!response.ok) throw new Error(result.error || `HTTP ${response.status}`);
    if (!/^[a-f0-9]{24}$/.test(result.requestId || "") || !/^[a-f0-9]{64}$/.test(result.claimSecret || ""))
      throw new Error("pickup service returned an invalid claim");
    localStorage.setItem("prime_pickup_claim_" + result.requestId, result.claimSecret);
    rememberPrimeOrder({ kind: "pickup", requestId: result.requestId, displayName });
    $("pickupClaimCode").value = "";
    rememberPlayerName(displayName);
    const statusUrl = new URL("./order.html", window.location.href);
    statusUrl.searchParams.set("mode", "pickup");
    statusUrl.searchParams.set("order", result.requestId);
    const link = document.createElement("a");
    link.href = statusUrl.href;
    link.textContent = "Open private pickup status";
    message.replaceChildren("Pickup requested. ", link, ". Wait for the room code before joining.");
    try { window.open(statusUrl.href, "_blank", "noopener"); } catch (_) {}
    setStatus("Private pickup requested; wait for an empty-room code, then join before the countdown on the status page runs out.", "good");
  } catch (error) {
    message.textContent = `Pickup failed: ${error.message || error}`;
  } finally { $("privatePickupSubmitBtn").disabled = false; }
}

async function loadPrivatePickupFromLink() {
  if (window.PRIME_PICKUP_ENABLED !== true) return;
  const params = new URL(window.location.href).searchParams;
  const requestId = params.get("pickup") || "";
  const slotKey = params.get("slot") || "";
  if (!/^[a-f0-9]{24}$/.test(requestId) || !/^(leftHand|rightHand|leftHip|rightHip|back|heldExtra)$/.test(slotKey)) return;
  const claimSecret = localStorage.getItem("prime_pickup_claim_" + requestId) || "";
  if (!/^[a-f0-9]{64}$/.test(claimSecret)) {
    setStatus("This pickup belongs to the browser that requested it. Open its status page there.", "bad");
    return;
  }
  const base = String(window.PACKAGE_API_BASE || "").replace(/\/$/, "");
  try {
    const response = await fetch(`${base}/api/private-pickups/${requestId}/items/${slotKey}`, {
      headers: { "x-prime-browser": primeBrowserToken(), "x-prime-pickup-claim": claimSecret },
      cache: "no-store" });
    const item = await response.json();
    if (!response.ok) throw new Error(item.error || `HTTP ${response.status}`);
    await loadJsonData(item.invention, { separate: true,
      filename: `pickup_${slotKey}_${item.invention.itemID}.json`, dirty: true });
    params.delete("pickup"); params.delete("slot");
    history.replaceState(null, "", `${location.pathname}${params.toString() ? "?" + params : ""}${location.hash}`);
    setStatus(`Loaded ${item.label || slotKey} from private pickup as an editable invention.`, "good");
  } catch (error) {
    setStatus(`Private pickup import failed: ${error.message || error}`, "bad");
  }
}

async function listMikeyboxScans(event) {
  event.preventDefault();
  const displayName = $("scanDisplayName").value.normalize("NFKC").trim().replace(/\s+/g, " ");
  const claimCode = $("scanClaimCode").value.trim();
  const message = $("scanMessage");
  const list = $("scanList");
  list.replaceChildren();
  if (!displayName || !/^([1-4]{4}|[0-9]{8})$/.test(claimCode)) {
    message.textContent = "Enter your full account name and a four-digit Prime pad PIN or eight-digit voice scan code.";
    return;
  }
  $("scanListBtn").disabled = true;
  message.textContent = "Finding your latest scan...";
  try {
    const result = await scanApi("/api/scans/list", { displayName, claimCode });
    rememberPlayerName(displayName);
    const sourceId = Number.isInteger(result.sourcePlayerObjectId) ? result.sourcePlayerObjectId : null;
    message.textContent = result.captures.length
      ? `Choose one item to open in the editor.${sourceId === null ? "" : ` Scanned player NetPlayer.objectID: ${sourceId}.`}`
      : "Your latest scan found no held or worn items. The earlier scan was cleared.";
    for (const capture of result.captures) {
      const button = document.createElement("button");
      button.type = "button";
      button.textContent = `${capture.label}: ${capture.itemID}`;
      button.addEventListener("click", async () => {
        button.disabled = true;
        try {
          const loaded = await scanApi("/api/scans/load", { displayName, claimCode, slotKey: capture.slotKey });
          await loadJsonData(loaded.invention, { filename: `scan_${capture.slotKey}_${loaded.invention.itemID}.json`,
            sourcePlayerObjectId: loaded.sourcePlayerObjectId });
          $("scanDialog").close();
          setStatus(`Loaded ${capture.label} from Mikeybox scan${Number.isInteger(loaded.sourcePlayerObjectId)
            ? `; scanned player NetPlayer.objectID ${loaded.sourcePlayerObjectId}` : ""}`, "good");
        } catch (err) { message.textContent = `Load failed: ${err.message || err}`; }
        finally { button.disabled = false; }
      });
      list.append(button);
    }
  } catch (err) { message.textContent = `Scan lookup failed: ${err.message || err}`; }
  finally { $("scanListBtn").disabled = false; }
}

// Automation / test hook (also what a "Send To Game" button will call): the current invention as the loader-ready JSON.
window.__goopEditor = { state, camera, orbit, renderer, scene, ghostRig, poseProxy, poseGizmo, transform, setGhostPose, setPoseMode,
  selectPoseJoint, exportGhostState, applyGhostState, playerAnchorMatrix, wornRecordGroup, buildGoopJson, exportWorkspaceProject, refreshPreview,
  recordByUid, loadJsonData, loadWorkspaceProject, setActiveDocument, saveRecoveryNow, RULES, mergeInventionInto, setKeepCopiesInInvention, workspaceOffsets,
  HOLDER, holderDisplays, ghostCrossbow, documentHolderRecord, recordRoute, syncHolderPreviews, selectRecord,
  poseHandleUnderPointer, FILM, filmMountDisplays, setFilmSlot, snapFilmParts, addVrGoggles, setParentTarget, eyePosition,
  editorVecToGameArr, gameArrToEditorVec, MOTION, motionPreview, poseMovingPartsIn, resetMovingParts, vrPreview };
