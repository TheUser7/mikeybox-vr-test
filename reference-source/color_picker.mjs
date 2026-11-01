// Effective-color picker (owner 2026-10-22). colorHue/colorSaturation are not a paint color: the game's UberShader turns
// each part's own albedo (texture x base color x vertex color) into HSV, rotates the hue by colorHue/255 and adds
// 2*colorSaturation/127 to the saturation (GrabbableObject.HandleColorHue/SaturationChanged). So one setting gives every
// part a different result. This module samples an item's surface colors and maps every (hue, saturation) setting to the
// color that results, so the editor can show a 2D field of reachable colors instead of two abstract sliders.
// The math is the preview shader's (app.js configureAppearanceShader), in linear color like the shader.

export const HUE_MIN = 0, HUE_MAX = 255;
export const SAT_MIN = -128, SAT_MAX = 127;
export const FIELD_SIZE = 256;   // one pixel per setting: x = colorHue 0..255, y = colorSaturation 127 (top) .. -128 (bottom)

const fract = (x) => x - Math.floor(x);
const clamp01 = (x) => Math.min(1, Math.max(0, x));

// GLSL goopRgbToHsv: the branchless form, epsilons included, so grey keeps hue 0 exactly as the shader sees it.
export function rgbToHsv(r, g, b) {
  const K = [0, -1 / 3, 2 / 3, -1];
  const s1 = g >= b ? 1 : 0;
  const p = [b + (g - b) * s1, g + (b - g) * s1, K[3] + (K[0] - K[3]) * s1, K[2] + (K[1] - K[2]) * s1];
  const s2 = r >= p[0] ? 1 : 0;
  const q = [p[0] + (r - p[0]) * s2, p[1], p[3] + (p[2] - p[3]) * s2, r + (p[0] - r) * s2];
  const d = q[0] - Math.min(q[3], q[1]);
  return [Math.abs(q[2] + (q[3] - q[1]) / (6 * d + 1e-10)), d / (q[0] + 1e-10), q[0]];
}

// GLSL goopHsvToRgb: saturation is NOT clamped (the shader extrapolates past 1 and below 0).
export function hsvToRgb(h, s, v) {
  const out = [0, 0, 0];
  const offsets = [0, 2 / 3, 1 / 3];
  for (let i = 0; i < 3; i++) {
    const k = clamp01(Math.abs(fract(h + offsets[i]) * 6 - 3) - 1);
    out[i] = v * (1 + (k - 1) * s);
  }
  return out;
}

export function hueUniform(colorHue) { return Math.min(HUE_MAX, Math.max(HUE_MIN, Math.round(Number(colorHue) || 0))) / 255; }
export function saturationUniform(colorSaturation) {
  return 2 * Math.min(SAT_MAX, Math.max(SAT_MIN, Math.round(Number(colorSaturation) || 0))) / 127;
}

// The color a part with linear albedo `rgb` shows for one item setting (before lighting).
export function effectiveLinear(rgb, colorHue, colorSaturation) {
  const hue = hueUniform(colorHue), sat = saturationUniform(colorSaturation);
  if (hue === 0 && sat === 0) return [rgb[0], rgb[1], rgb[2]];
  const hsv = rgbToHsv(rgb[0], rgb[1], rgb[2]);
  return hsvToRgb(fract(hsv[0] + hue), hsv[1] + sat, hsv[2]);
}

export function srgbToLinear(c) { return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); }
export function linearToSrgb(c) {
  const x = clamp01(c);
  return x <= 0.0031308 ? x * 12.92 : 1.055 * Math.pow(x, 1 / 2.4) - 0.055;
}
export function linearToCss(rgb) {
  return "#" + rgb.map((c) => Math.round(linearToSrgb(c) * 255).toString(16).padStart(2, "0")).join("");
}
export function cssToLinear(css) {
  const m = /^#?([0-9a-f]{6})$/i.exec(String(css || "").trim());
  if (!m) return null;
  const n = parseInt(m[1], 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((c) => srgbToLinear(c / 255));
}

// Field pixel <-> setting. One pixel per value on a FIELD_SIZE canvas.
export function settingAt(x, y, width = FIELD_SIZE, height = FIELD_SIZE) {
  const hue = Math.min(HUE_MAX, Math.max(HUE_MIN, Math.floor((x / width) * 256)));
  const sat = Math.min(SAT_MAX, Math.max(SAT_MIN, SAT_MAX - Math.floor((y / height) * 256)));
  return { colorHue: hue, colorSaturation: sat };
}
export function pixelFor(colorHue, colorSaturation) {
  return { x: Math.round(Number(colorHue) || 0), y: SAT_MAX - Math.round(Number(colorSaturation) || 0) };
}

// RGBA bytes of the whole field for one base color (sRGB, ready for ImageData).
export function renderField(baseLinear) {
  const data = new Uint8ClampedArray(FIELD_SIZE * FIELD_SIZE * 4);
  for (let y = 0; y < FIELD_SIZE; y++) {
    const sat = SAT_MAX - y;
    for (let x = 0; x < FIELD_SIZE; x++) {
      const rgb = effectiveLinear(baseLinear, x, sat);
      const o = (y * FIELD_SIZE + x) * 4;
      data[o] = Math.round(linearToSrgb(rgb[0]) * 255);
      data[o + 1] = Math.round(linearToSrgb(rgb[1]) * 255);
      data[o + 2] = Math.round(linearToSrgb(rgb[2]) * 255);
      data[o + 3] = 255;
    }
  }
  return data;
}

function linearToLab(rgb) {
  const [r, g, b] = rgb.map(clamp01);
  const X = (0.4124 * r + 0.3576 * g + 0.1805 * b) / 0.95047;
  const Y = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  const Z = (0.0193 * r + 0.1192 * g + 0.9505 * b) / 1.08883;
  const f = (t) => (t > 216 / 24389 ? Math.cbrt(t) : (24389 / 27 * t + 16) / 116);
  const fx = f(X), fy = f(Y), fz = f(Z);
  return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)];
}

// The setting whose result on `baseLinear` looks closest to `targetLinear` (CIELAB distance). Ties keep the smallest
// change from (0, 0), so a reachable color is not reported with a needlessly large saturation.
export function closestSetting(baseLinear, targetLinear) {
  const want = linearToLab(targetLinear);
  let best = null;
  for (let sat = SAT_MIN; sat <= SAT_MAX; sat++) {
    for (let hue = HUE_MIN; hue <= HUE_MAX; hue++) {
      const lab = linearToLab(effectiveLinear(baseLinear, hue, sat));
      const d = (lab[0] - want[0]) ** 2 + (lab[1] - want[1]) ** 2 + (lab[2] - want[2]) ** 2;
      const effort = Math.abs(sat) + Math.min(hue, 256 - hue) / 256;
      if (!best || d < best.d - 1e-9 || (Math.abs(d - best.d) <= 1e-9 && effort < best.effort)) {
        best = { d, effort, colorHue: hue, colorSaturation: sat };
      }
    }
  }
  return { colorHue: best.colorHue, colorSaturation: best.colorSaturation, deltaE: Math.sqrt(best.d) };
}

// Deterministic PRNG so the same item always yields the same palette.
export function seededRandom(text) {
  let h = 2166136261;
  for (const ch of String(text)) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  let a = h >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Area-weighted albedo samples over plain mesh descriptors:
//   { positions: number[] (xyz, already in one shared frame), indices?: number[], uvs?: number[] (uv pairs),
//     colors?: number[] (linear rgb per vertex, itemSize 3), factor: [r,g,b] (linear),
//     texture?: { width, height, data: RGBA bytes, srgb: boolean, matrix?: 3x3 column-major (three.js uvTransform) } }
// Returns a Float64Array of linear rgb triplets.
export function sampleSurfaceColors(meshes, count, random) {
  const tris = [];
  let total = 0;
  for (const mesh of meshes) {
    const P = mesh.positions;
    const n = mesh.indices ? mesh.indices.length : P.length / 3;
    for (let t = 0; t + 2 < n; t += 3) {
      const i0 = mesh.indices ? mesh.indices[t] : t, i1 = mesh.indices ? mesh.indices[t + 1] : t + 1;
      const i2 = mesh.indices ? mesh.indices[t + 2] : t + 2;
      const ax = P[i1 * 3] - P[i0 * 3], ay = P[i1 * 3 + 1] - P[i0 * 3 + 1], az = P[i1 * 3 + 2] - P[i0 * 3 + 2];
      const bx = P[i2 * 3] - P[i0 * 3], by = P[i2 * 3 + 1] - P[i0 * 3 + 1], bz = P[i2 * 3 + 2] - P[i0 * 3 + 2];
      const cx = ay * bz - az * by, cy = az * bx - ax * bz, cz = ax * by - ay * bx;
      const area = Math.sqrt(cx * cx + cy * cy + cz * cz) / 2;
      if (!(area > 0)) continue;
      total += area;
      tris.push({ mesh, i0, i1, i2, cumulative: total });
    }
  }
  const out = new Float64Array(tris.length ? count * 3 : 0);
  if (!tris.length) return out;
  for (let s = 0; s < count; s++) {
    // stratified pick along the cumulative area, then a uniform point inside the triangle
    const target = ((s + random()) / count) * total;
    let lo = 0, hi = tris.length - 1;
    while (lo < hi) { const mid = (lo + hi) >> 1; if (tris[mid].cumulative < target) lo = mid + 1; else hi = mid; }
    const { mesh, i0, i1, i2 } = tris[lo];
    let u = random(), v = random();
    if (u + v > 1) { u = 1 - u; v = 1 - v; }
    const w = 1 - u - v;
    const rgb = [mesh.factor[0], mesh.factor[1], mesh.factor[2]];
    if (mesh.colors) {
      for (let c = 0; c < 3; c++) rgb[c] *= w * mesh.colors[i0 * 3 + c] + u * mesh.colors[i1 * 3 + c] + v * mesh.colors[i2 * 3 + c];
    }
    if (mesh.texture && mesh.uvs) {
      let tu = w * mesh.uvs[i0 * 2] + u * mesh.uvs[i1 * 2] + v * mesh.uvs[i2 * 2];
      let tv = w * mesh.uvs[i0 * 2 + 1] + u * mesh.uvs[i1 * 2 + 1] + v * mesh.uvs[i2 * 2 + 1];
      const m = mesh.texture.matrix;
      if (m) { const x = m[0] * tu + m[3] * tv + m[6]; tv = m[1] * tu + m[4] * tv + m[7]; tu = x; }
      const { width, height, data, srgb } = mesh.texture;
      const px = Math.min(width - 1, Math.floor(fract(tu) * width));
      const py = Math.min(height - 1, Math.floor(fract(tv) * height));   // glTF UV origin is the image's top-left
      const o = (py * width + px) * 4;
      for (let c = 0; c < 3; c++) rgb[c] *= srgb ? srgbToLinear(data[o + c] / 255) : data[o + c] / 255;
    }
    out[s * 3] = rgb[0]; out[s * 3 + 1] = rgb[1]; out[s * 3 + 2] = rgb[2];
  }
  return out;
}

// Group the samples into the item's main colors (k-means in sRGB, means kept in linear). Returns
// [{ linear: [r,g,b], weight }] sorted by surface share; colors under minWeight are dropped and near-equal ones merged.
export function surfacePalette(samples, { maxColors = 4, minWeight = 0.04, mergeDistance = 0.07, random = seededRandom("palette") } = {}) {
  const n = samples.length / 3;
  if (!n) return [];
  const pts = new Float64Array(n * 3);
  for (let i = 0; i < n * 3; i++) pts[i] = linearToSrgb(samples[i]);
  const dist2 = (i, c) => (pts[i * 3] - c[0]) ** 2 + (pts[i * 3 + 1] - c[1]) ** 2 + (pts[i * 3 + 2] - c[2]) ** 2;
  const k = Math.min(maxColors, n);
  const centers = [[pts[0], pts[1], pts[2]]];
  const nearest = new Float64Array(n).fill(Infinity);
  while (centers.length < k) {   // k-means++
    let sum = 0;
    for (let i = 0; i < n; i++) { nearest[i] = Math.min(nearest[i], dist2(i, centers[centers.length - 1])); sum += nearest[i]; }
    if (sum <= 0) break;
    let r = random() * sum, pick = n - 1;
    for (let i = 0; i < n; i++) { r -= nearest[i]; if (r <= 0) { pick = i; break; } }
    centers.push([pts[pick * 3], pts[pick * 3 + 1], pts[pick * 3 + 2]]);
  }
  const label = new Int32Array(n);
  for (let iter = 0; iter < 16; iter++) {
    let moved = false;
    for (let i = 0; i < n; i++) {
      let best = 0, bestD = Infinity;
      for (let c = 0; c < centers.length; c++) { const d = dist2(i, centers[c]); if (d < bestD) { bestD = d; best = c; } }
      if (label[i] !== best) { label[i] = best; moved = true; }
    }
    const sums = centers.map(() => [0, 0, 0, 0]);
    for (let i = 0; i < n; i++) { const s = sums[label[i]]; s[0] += pts[i * 3]; s[1] += pts[i * 3 + 1]; s[2] += pts[i * 3 + 2]; s[3]++; }
    sums.forEach((s, c) => { if (s[3]) centers[c] = [s[0] / s[3], s[1] / s[3], s[2] / s[3]]; });
    if (!moved && iter) break;
  }
  let groups = centers.map((center) => ({ center, linear: [0, 0, 0], count: 0 }));
  for (let i = 0; i < n; i++) {
    const g = groups[label[i]];
    g.linear[0] += samples[i * 3]; g.linear[1] += samples[i * 3 + 1]; g.linear[2] += samples[i * 3 + 2]; g.count++;
  }
  groups = groups.filter((g) => g.count).sort((a, b) => b.count - a.count);
  const merged = [];
  for (const g of groups) {
    const into = merged.find((m) => Math.hypot(m.center[0] - g.center[0], m.center[1] - g.center[1], m.center[2] - g.center[2]) < mergeDistance);
    if (into) {
      for (let c = 0; c < 3; c++) { into.linear[c] += g.linear[c]; into.center[c] = (into.center[c] * into.count + g.center[c] * g.count) / (into.count + g.count); }
      into.count += g.count;
    } else merged.push({ center: [...g.center], linear: [...g.linear], count: g.count });
  }
  const kept = merged.filter((g) => g.count / n >= minWeight);
  const keptCount = kept.reduce((s, g) => s + g.count, 0) || 1;
  return kept.sort((a, b) => b.count - a.count)
    .map((g) => ({ linear: g.linear.map((c) => c / g.count), weight: g.count / keptCount }));
}

// A plain name for a linear color, so parts read "red 45%" instead of a hex code.
export function colorName(linear) {
  const [h, s, v] = rgbToHsv(...linear.map(linearToSrgb));
  if (v < BLACK_VALUE) return "black";
  if (s < 0.16) return v > 0.85 ? "white" : "grey";
  const deg = h * 360;
  if (deg >= 15 && deg < 45 && v < 0.55) return "brown";
  if (deg < 15 || deg >= 345) return "red";
  if (deg < 45) return "orange";
  if (deg < 70) return "yellow";
  if (deg < 160) return "green";
  if (deg < 195) return "teal";
  if (deg < 255) return "blue";
  if (deg < 290) return "purple";
  return "pink";
}

// A part hue and saturation cannot visibly change: the shift keeps each part's brightness, so black stays black at every
// setting (owner 2026-10-31: the alpha blade's black blade, 69% of its surface, filled the whole field with black).
export const BLACK_VALUE = 0.16;
export function staysBlack(linear) { return rgbToHsv(...linear.map(linearToSrgb))[2] < BLACK_VALUE; }

// The color the field follows by default: the biggest part that actually has color (grey parts barely move with hue) and
// is bright enough to show it (a black part never changes; a dark one changes faintly).
export function defaultPaletteIndex(palette) {
  let best = 0, bestScore = -1;
  palette.forEach((entry, i) => {
    const [, sat, value] = rgbToHsv(...entry.linear.map(linearToSrgb));
    const visible = value < BLACK_VALUE ? 0.02 : Math.min(1, value / 0.4);
    const score = entry.weight * (0.2 + sat) * visible;
    if (score > bestScore) { bestScore = score; best = i; }
  });
  return best;
}
