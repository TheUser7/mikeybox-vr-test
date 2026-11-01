// Draw the editor scene the way the game draws it.
//
// The editor keeps every mesh vertex, stuck edge, NetParent frame and player anchor in
// Unity's own numbers (X right, Y up, Z forward). Unity interprets those numbers in a
// left-handed system; three.js interprets them in a right-handed one. Rendering them
// unchanged therefore shows the mirror image of the game: item-pixel text read
// backwards in game, and parts placed on an item's right appeared on its left. A live
// A:B on client D (build 25766246) projected a 109-pixel text sign through the game's
// Camera.WorldToScreenPoint and through this editor from the same root-relative camera
// pose: game x = width - editor x for every pixel, with y identical.
//
// The fix is view-only. Mirroring the camera's horizontal projection axis renders the
// left-handed view; data, JSON, undo and every pose calculation stay unchanged. Picking
// and the transform gizmo use the same projection matrix, so they follow the drawn image.
// Two consequences need compensation: the mirror reverses triangle winding on screen,
// and OrbitControls would turn and pan the opposite way to the pointer.

// Negate projection row 0 (column-major elements 0, 4, 8, 12): clip x -> -clip x.
export function mirrorProjectionX(camera) {
  const e = camera.projectionMatrix.elements;
  e[0] = -e[0]; e[4] = -e[4]; e[8] = -e[8]; e[12] = -e[12];
  camera.projectionMatrixInverse.copy(camera.projectionMatrix).invert();
  return camera;
}

// Keep the mirror through every later updateProjectionMatrix (resize, FOV changes).
export function useGameHandedCamera(camera) {
  if (camera.userData.gameHanded) return camera;
  const update = camera.updateProjectionMatrix.bind(camera);
  camera.updateProjectionMatrix = function updateProjectionMatrix() {
    update();
    mirrorProjectionX(this);
  };
  camera.userData.gameHanded = true;
  camera.updateProjectionMatrix();
  return camera;
}

// A mirrored projection turns counter-clockwise front faces clockwise on screen.
// three.js picks gl.frontFace per draw from WebGLState.setMaterial(material, frontFaceCW)
// (one call site in r165's renderBufferDirect); invert that flag so culling and
// gl_FrontFacing (used by double-sided lighting) match the mirrored view.
export function invertFrontFaceWinding(renderer) {
  const state = renderer.state;
  if (!state || typeof state.setMaterial !== "function") throw new Error("renderer state has no setMaterial");
  if (state.setMaterial.gameHanded) return renderer;
  const setMaterial = state.setMaterial;
  const mirrored = function (material, frontFaceCW) {
    return setMaterial.call(this, material, mirrored.inverted ? !frontFaceCW : frontFaceCW);
  };
  mirrored.gameHanded = true;
  mirrored.inverted = true;
  state.setMaterial = mirrored;
  return renderer;
}

// WebXR draws each eye through the headset's own projection, which the editor cannot mirror (a per-eye mirror would
// also swap the stereo disparity). The VR preview mirrors the WORLD instead (scene x -> -x). A mirrored world already
// gives every object a negative determinant, which three.js turns into the right winding by itself, so the inversion
// above must stand aside while it is shown and come back for the mirrored desktop camera.
export function setFrontFaceInversion(renderer, inverted) {
  const setMaterial = renderer?.state?.setMaterial;
  if (!setMaterial?.gameHanded) throw new Error("renderer is not game-handed");
  setMaterial.inverted = !!inverted;
  return renderer;
}

function mirroredEvent(event, element) {
  return new Proxy(event, {
    get(target, prop) {
      if (prop === "clientX" || prop === "pageX" || prop === "x" || prop === "screenX" || prop === "offsetX") {
        const rect = element.getBoundingClientRect();
        const value = Reflect.get(target, prop, target);
        if (prop === "offsetX") return rect.width - value;
        const scroll = prop === "pageX" ? (element.ownerDocument?.defaultView?.scrollX || 0) : 0;
        const screenShift = prop === "screenX" ? target.screenX - target.clientX : 0;
        const left = rect.left + scroll + screenShift;
        return 2 * left + rect.width - value;
      }
      const value = Reflect.get(target, prop, target);
      return typeof value === "function" ? value.bind(target) : value;
    },
  });
}

// OrbitControls reads pointer x positions directly from its element's events. Give it a
// view of the canvas whose events are mirrored about the canvas centre, so a rightward
// drag turns and pans the drawn scene to the right as before. Everything else (pointer
// capture, size, style, root node) is the real element.
export function mirroredPointerElement(element) {
  const wrappers = new Map();
  const keyFor = (type, listener, options) => `${type}\u0000${typeof options === "object" ? !!options?.capture : !!options}`;
  return new Proxy(element, {
    get(target, prop) {
      if (prop === "addEventListener") {
        return (type, listener, options) => {
          if (!listener) return;
          let byListener = wrappers.get(listener);
          if (!byListener) wrappers.set(listener, byListener = new Map());
          const key = keyFor(type, listener, options);
          if (byListener.has(key)) return;
          const wrapped = (event) => (typeof listener === "function" ? listener : listener.handleEvent.bind(listener))(
            event && typeof event.clientX === "number" ? mirroredEvent(event, target) : event);
          byListener.set(key, wrapped);
          target.addEventListener(type, wrapped, options);
        };
      }
      if (prop === "removeEventListener") {
        return (type, listener, options) => {
          const byListener = wrappers.get(listener);
          const key = keyFor(type, listener, options);
          const wrapped = byListener?.get(key);
          if (!wrapped) return;
          byListener.delete(key);
          target.removeEventListener(type, wrapped, options);
        };
      }
      const value = Reflect.get(target, prop, target);
      return typeof value === "function" ? value.bind(target) : value;
    },
    set(target, prop, value) { target[prop] = value; return true; },
  });
}
