// Browser-independent layout for item-pixel inventions. Coordinates are metres in the
// selected parent's Y-up, +Z-forward frame. The saved JSON uses the ordinary stuck edges.
import { FONT } from "./font_5x7.mjs";

const finite = (value, fallback) => Number.isFinite(Number(value)) ? Number(value) : fallback;
const clamp = (value, lo, hi) => Math.min(hi, Math.max(lo, value));
const TAU = Math.PI * 2;

function planePoint(x, y, plane) {
  if (plane === "xz") return [x, 0, y];
  if (plane === "yz") return [0, y, x];
  return [x, y, 0];
}

function add(a, b) { return a.map((v, i) => v + b[i]); }
function subtract(a, b) { return a.map((v, i) => v - b[i]); }
function unit(v) {
  const length = Math.hypot(...v);
  return length > 1e-8 ? v.map((n) => n / length) : [0, 0, 1];
}

function textPoints(message, spacing, lineSpacing) {
  const lines = String(message || "").toUpperCase().split(/\r?\n/).slice(0, 8);
  const points = [];
  for (let lineIndex = 0; lineIndex < lines.length; lineIndex++) {
    const line = lines[lineIndex].slice(0, 64);
    const width = Array.from(line).reduce((n, c) => n + (c === " " ? 4 : 7), 0) - 2;
    let column = -width / 2;
    for (const c of line) {
      const glyph = FONT[c];
      if (glyph) for (let row = 0; row < 7; row++) for (let bit = 0; bit < 5; bit++) {
        if (glyph[row][bit] === "1") points.push([spacing * (column + bit),
          -lineIndex * lineSpacing + spacing * (3 - row), 0]);
      }
      column += c === " " ? 4 : 7;
    }
  }
  return points;
}

function samplePolyline(vertices, spacing, closed = false) {
  const segments = closed ? vertices.length : vertices.length - 1;
  const lengths = Array.from({ length: segments }, (_, i) => Math.hypot(...subtract(vertices[(i + 1) % vertices.length], vertices[i])));
  const total = lengths.reduce((a, b) => a + b, 0);
  const count = Math.max(closed ? 3 : 2, Math.ceil(total / spacing) + (closed ? 0 : 1));
  if (count > 512) throw new Error("Pattern would exceed 512 pixels; increase spacing.");
  const result = [];
  for (let i = 0; i < count; i++) {
    let distance = total * i / (closed ? count : count - 1);
    let seg = 0;
    while (seg < segments - 1 && distance > lengths[seg]) distance -= lengths[seg++];
    const a = vertices[seg], b = vertices[(seg + 1) % vertices.length];
    const t = lengths[seg] ? distance / lengths[seg] : 0;
    result.push(a.map((v, axis) => v + (b[axis] - v) * t));
  }
  return result;
}

function pathPoints(shape, size, spacing, height, turns, startDeg, sweepDeg) {
  if (shape === "line") return samplePolyline([[-size / 2, 0, 0], [size / 2, 0, 0]], spacing);
  if (shape === "square") return samplePolyline([[-size / 2, -size / 2, 0], [size / 2, -size / 2, 0],
    [size / 2, size / 2, 0], [-size / 2, size / 2, 0]], spacing, true);
  if (shape === "triangle") return samplePolyline([[0, size / 2, 0], [size / 2, -size / 2, 0],
    [-size / 2, -size / 2, 0]], spacing, true);
  if (shape === "grid") {
    const side = Math.floor(size / spacing) + 1;
    if (side * side > 512) throw new Error("Grid would exceed 512 pixels; increase spacing.");
    return Array.from({ length: side * side }, (_, i) => [
      (i % side - (side - 1) / 2) * spacing, (Math.floor(i / side) - (side - 1) / 2) * spacing, 0]);
  }
  const sweep = shape === "arc" ? sweepDeg * Math.PI / 180 : TAU * (shape === "circle" ? 1 : turns);
  const start = shape === "arc" ? startDeg * Math.PI / 180 : 0;
  const pathLength = shape === "helix" ? Math.hypot(Math.abs(sweep) * size, height)
    : shape === "spiral" ? Math.abs(sweep) * size * 0.58 : shape === "wave" ? size * 1.6
    : Math.abs(sweep) * size;
  const count = Math.max(shape === "circle" ? 3 : 2, Math.ceil(pathLength / spacing) + (shape === "circle" ? 0 : 1));
  if (count > 512) throw new Error("Pattern would exceed 512 pixels; increase spacing.");
  return Array.from({ length: count }, (_, i) => {
    const t = i / (shape === "circle" ? count : count - 1);
    if (shape === "wave") return [(t - 0.5) * size, Math.sin(t * TAU * turns) * height / 2, 0];
    const angle = start + sweep * t;
    const radius = shape === "spiral" ? size * t : size;
    return [Math.cos(angle) * radius, Math.sin(angle) * radius,
      shape === "helix" ? (t - 0.5) * height : 0];
  });
}

// Offsets for an array of whole selected subtrees. The first position is the
// existing selection, so making a ring never moves or replaces the originals.
export function generateRingCopies(options = {}) {
  const count = Number(options.count);
  const radius = Number(options.radius);
  const plane = String(options.plane || "xz").toLowerCase();
  if (!Number.isInteger(count) || count < 3 || count > 64) {
    throw new Error("Choose 3–64 total ring positions (including the original).");
  }
  if (!Number.isFinite(radius) || radius < 0.01 || radius > 20) {
    throw new Error("Choose a ring radius from 0.01 to 20 metres.");
  }
  if (!["xz", "xy", "yz"].includes(plane)) throw new Error("Choose a ring plane.");
  return Array.from({ length: count - 1 }, (_, index) => {
    const angle = TAU * (index + 1) / count;
    const radial = radius * (Math.cos(angle) - 1);
    const tangential = radius * Math.sin(angle);
    const offset = plane === "xy" ? [radial, tangential, 0]
      : plane === "yz" ? [0, radial, tangential] : [radial, 0, tangential];
    const axis = plane === "xy" ? [0, 0, 1]
      : plane === "yz" ? [1, 0, 0] : [0, -1, 0];
    return { offset, axis, angle };
  });
}

export function generatePattern(options = {}) {
  const shape = String(options.shape || "arc").toLowerCase();
  if (!["text", "arc", "line", "circle", "square", "triangle", "grid", "wave", "spiral", "helix"].includes(shape)) {
    throw new Error(`Unknown pattern: ${shape}`);
  }
  const spacing = clamp(finite(options.spacing, 0.12), 0.005, 5);
  const size = clamp(finite(options.size, 0.75), 0.01, 20);
  const height = clamp(finite(options.height, 0.8), 0, 20);
  const turns = clamp(finite(options.turns, 2), 0.25, 12);
  const startDeg = finite(options.startDeg, 180);
  const sweepDeg = clamp(finite(options.sweepDeg, -180), -1440, 1440);
  const plane = String(options.plane || "xy").toLowerCase();
  const offset = [finite(options.offsetX, 0), finite(options.offsetY, 0), finite(options.offsetZ, 0)];
  const ids = Array.isArray(options.itemIds) ? options.itemIds.filter(Boolean) : [];
  if (!ids.length) throw new Error("Choose at least one pixel item ID.");
  const raw = shape === "text" ? textPoints(options.text, spacing, Math.max(spacing * 8, height))
    : pathPoints(shape, size, spacing, height, turns, startDeg, sweepDeg);
  if (!raw.length) throw new Error("This pattern has no pixels.");
  if (raw.length > 512) throw new Error("Pattern would exceed 512 pixels; use fewer letters or larger spacing.");
  const orientation = String(options.orientation || "forward");
  return raw.map((p, i) => {
    const position = add(planePoint(...p.slice(0, 2), plane), offset);
    if (p[2] && plane === "xy") position[2] += p[2];
    else if (p[2] && plane === "xz") position[1] += p[2];
    else if (p[2]) position[0] += p[2];
    const prev = planePoint(...raw[Math.max(0, i - 1)].slice(0, 2), plane);
    const next = planePoint(...raw[Math.min(raw.length - 1, i + 1)].slice(0, 2), plane);
    const center = offset;
    let forward = [0, 0, 1];
    if (orientation === "backward") forward = [0, 0, -1];
    if (orientation === "up") forward = [0, 1, 0];
    if (orientation === "down") forward = [0, -1, 0];
    if (orientation === "tangent") forward = unit(subtract(next, prev));
    if (orientation === "outward") forward = unit(subtract(position, center));
    if (orientation === "inward") forward = unit(subtract(center, position));
    return { itemID: ids[i % ids.length], position, forward, index: i };
  });
}
