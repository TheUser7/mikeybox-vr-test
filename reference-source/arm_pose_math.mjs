// Preview-only arm articulation. Matrices are row-major arrays, matching the
// build-bound sidecars exported from Unity. Invention JSON is never changed.
const IDENTITY = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];

export function matrix4(value) {
  if (Array.isArray(value) && value.length === 4 && value.every(Array.isArray)) return value.flat().map(Number);
  if (Array.isArray(value) && value.length === 16) return value.map(Number);
  throw new Error("expected a 4x4 matrix");
}

export function multiply4(a, b) {
  const out = new Array(16).fill(0);
  for (let row = 0; row < 4; row++) for (let col = 0; col < 4; col++) {
    for (let k = 0; k < 4; k++) out[row * 4 + col] += a[row * 4 + k] * b[k * 4 + col];
  }
  return out;
}

export function inverseAffine4(m) {
  const a = m[0], b = m[1], c = m[2], d = m[4], e = m[5], f = m[6], g = m[8], h = m[9], i = m[10];
  const A = e * i - f * h, B = c * h - b * i, C = b * f - c * e;
  const D = f * g - d * i, E = a * i - c * g, F = c * d - a * f;
  const G = d * h - e * g, H = b * g - a * h, I = a * e - b * d;
  const det = a * A + b * D + c * G;
  if (!Number.isFinite(det) || Math.abs(det) < 1e-12) throw new Error("singular arm bind matrix");
  const o = [A / det, B / det, C / det, 0, D / det, E / det, F / det, 0, G / det, H / det, I / det, 0, 0, 0, 0, 1];
  o[3] = -(o[0] * m[3] + o[1] * m[7] + o[2] * m[11]);
  o[7] = -(o[4] * m[3] + o[5] * m[7] + o[6] * m[11]);
  o[11] = -(o[8] * m[3] + o[9] * m[7] + o[10] * m[11]);
  return o;
}

function normalizedQuat(q) {
  const norm = Math.hypot(...q);
  if (norm < 1e-12) throw new Error("zero arm pose quaternion");
  return q.map((x) => x / norm);
}

export function multiplyQuat(a, b) {
  const [x, y, z, w] = a, [u, v, t, s] = b;
  return normalizedQuat([w*u + x*s + y*t - z*v, w*v - x*t + y*s + z*u,
    w*t + x*v - y*u + z*s, w*s - x*u - y*v - z*t]);
}

export function eulerDegreesQuat(x = 0, y = 0, z = 0) {
  const r = Math.PI / 360;
  const qx = [Math.sin(x*r), 0, 0, Math.cos(x*r)];
  const qy = [0, Math.sin(y*r), 0, Math.cos(y*r)];
  const qz = [0, 0, Math.sin(z*r), Math.cos(z*r)];
  return multiplyQuat(multiplyQuat(qx, qy), qz);
}

export function composeTRS(position, quaternion, scale) {
  const [x, y, z, w] = normalizedQuat(quaternion), [sx, sy, sz] = scale;
  return [
    (1-2*(y*y+z*z))*sx, 2*(x*y-z*w)*sy, 2*(x*z+y*w)*sz, position[0],
    2*(x*y+z*w)*sx, (1-2*(x*x+z*z))*sy, 2*(y*z-x*w)*sz, position[1],
    2*(x*z-y*w)*sx, 2*(y*z+x*w)*sy, (1-2*(x*x+y*y))*sz, position[2],
    0, 0, 0, 1,
  ];
}

export function decomposeTRS(m) {
  const sx = Math.hypot(m[0], m[4], m[8]), sy = Math.hypot(m[1], m[5], m[9]), sz = Math.hypot(m[2], m[6], m[10]);
  if (Math.min(sx, sy, sz) < 1e-12) throw new Error("zero arm bone scale");
  const a = m[0]/sx, b = m[1]/sy, c = m[2]/sz, d = m[4]/sx, e = m[5]/sy,
    f = m[6]/sz, g = m[8]/sx, h = m[9]/sy, i = m[10]/sz;
  let q;
  const trace = a + e + i;
  if (trace > 0) {
    const s = Math.sqrt(trace+1)*2;
    q = [(h-f)/s, (c-g)/s, (d-b)/s, s/4];
  } else if (a > e && a > i) {
    const s = Math.sqrt(1+a-e-i)*2;
    q = [s/4, (b+d)/s, (c+g)/s, (h-f)/s];
  } else if (e > i) {
    const s = Math.sqrt(1+e-a-i)*2;
    q = [(b+d)/s, s/4, (f+h)/s, (c-g)/s];
  } else {
    const s = Math.sqrt(1+i-a-e)*2;
    q = [(c+g)/s, (f+h)/s, s/4, (d-b)/s];
  }
  return {position:[m[3],m[7],m[11]], quaternion:normalizedQuat(q), scale:[sx,sy,sz]};
}

export function posedBoneMatrices(bones, deltaEulerByPath = {}, rotationOverrideByPath = {}) {
  const byPath = new Map(bones.map((bone) => [bone.path, bone]));
  const worldByPath = new Map(), localRotationByPath = new Map(), visiting = new Set();
  function visit(path) {
    if (worldByPath.has(path)) return worldByPath.get(path);
    if (visiting.has(path)) throw new Error(`arm skeleton cycle at ${path}`);
    const bone = byPath.get(path);
    if (!bone) throw new Error(`missing arm bone ${path}`);
    visiting.add(path);
    const bindLocal = matrix4(bone.localBindMatrix), bindWorld = matrix4(bone.worldBindMatrix);
    const {position, quaternion, scale} = decomposeTRS(bindLocal);
    const delta = deltaEulerByPath[path] || [0, 0, 0];
    const localRotation = rotationOverrideByPath[path]
      ? normalizedQuat(rotationOverrideByPath[path])
      : multiplyQuat(quaternion, eulerDegreesQuat(...delta));
    const posedLocal = composeTRS(position, localRotation, scale);
    const parentWorld = bone.parent && byPath.has(bone.parent)
      ? visit(bone.parent)
      : multiply4(bindWorld, inverseAffine4(bindLocal));
    const posedWorld = multiply4(parentWorld, posedLocal);
    worldByPath.set(path, posedWorld);
    localRotationByPath.set(path, localRotation);
    visiting.delete(path);
    return posedWorld;
  }
  for (const bone of bones) visit(bone.path);
  return {worldByPath, localRotationByPath};
}

export function posedPlayerAnchorMatrix(avatarPlacement, handBindWorld, handPosedWorld, playerAnchor) {
  const avatar = matrix4(avatarPlacement);
  return multiply4(multiply4(multiply4(multiply4(avatar, matrix4(handPosedWorld)),
    inverseAffine4(matrix4(handBindWorld))), inverseAffine4(avatar)), matrix4(playerAnchor));
}

function at3(values, index) {
  return Array.isArray(values[index]) ? values[index] : values.slice(index * 3, index * 3 + 3);
}

function influences(values, index) {
  if (Array.isArray(values[index])) return values[index];
  return values.slice(index * 4, index * 4 + 4);
}

export function skinMeshPositions(mesh, worldByPath) {
  const boneTransforms = mesh.bonePaths.map((path, index) => {
    const world = worldByPath.get(path);
    if (!world) throw new Error(`no posed arm bone ${path}`);
    return multiply4(world, matrix4(mesh.inverseBindMatrices[index]));
  });
  const positions = new Float32Array(mesh.vertexCount * 3);
  for (let v = 0; v < mesh.vertexCount; v++) {
    const point = at3(mesh.sourcePositions, v);
    const ids = influences(mesh.jointIndices, v), weights = influences(mesh.weights, v);
    let x = 0, y = 0, z = 0, total = 0;
    for (let slot = 0; slot < ids.length; slot++) {
      const weight = Number(weights[slot]) || 0;
      if (weight <= 0) continue;
      const m = boneTransforms[ids[slot]];
      if (!m) throw new Error(`bad arm skin joint ${ids[slot]}`);
      x += weight*(m[0]*point[0]+m[1]*point[1]+m[2]*point[2]+m[3]);
      y += weight*(m[4]*point[0]+m[5]*point[1]+m[6]*point[2]+m[7]);
      z += weight*(m[8]*point[0]+m[9]*point[1]+m[10]*point[2]+m[11]);
      total += weight;
    }
    // Unity's packed bone weights are quantized and are not always normalized
    // to exactly one. Preserve their exported sum to match the game bake.
    if (!Number.isFinite(total) || total <= 0 || total > 1.1) throw new Error(`invalid arm skin weights ${total} at vertex ${v}`);
    positions[3*v] = -x; // Unity native to the existing mirrored GLB vertex basis.
    positions[3*v+1] = y;
    positions[3*v+2] = z;
  }
  return positions;
}

export {IDENTITY};
