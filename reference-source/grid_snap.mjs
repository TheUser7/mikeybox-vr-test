export const DEFAULT_GRID_STEP_METERS = 0.05;

export function parseGridStep(value) {
  if (String(value).trim() === "") return null;
  const step = Number(value);
  return Number.isFinite(step) && step > 0 ? step : null;
}

// TransformControls' built-in world snap only adds the parent's translation.
// Child items can have rotated parents, so snap the gizmo's actual world pose.
export function snappedWorldPosition(position, axis, step) {
  if (!Array.isArray(position) || position.length !== 3 || !parseGridStep(step)) return position;
  const handles = String(axis || "").toUpperCase();
  return position.map((coordinate, index) => {
    if (!handles.includes("XYZ"[index]) || !Number.isFinite(coordinate)) return coordinate;
    const units = coordinate / step;
    return Number.isFinite(units) ? Math.round(units) * step : coordinate;
  });
}

// A floor grid shows each snap interval when practical. At very fine steps it
// shows every Nth interval so the browser never builds thousands of lines.
export function gridVisualSpec(step, extent = 8, maxDivisions = 32) {
  if (!parseGridStep(step)) return null;
  const stride = Math.max(1, Math.ceil(extent / (step * maxDivisions)));
  if (!Number.isFinite(stride)) return null;
  const visualStep = step * stride;
  if (!Number.isFinite(visualStep) || visualStep <= 0) return null;
  const divisions = Math.max(2, Math.min(maxDivisions, 2 * Math.ceil(extent / visualStep / 2)));
  const size = visualStep * divisions;
  return Number.isFinite(size) && size <= 1e5 ? { size, divisions, visualStep } : null;
}
