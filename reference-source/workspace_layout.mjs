// Editor-only placement for independent inventions. These offsets must never be
// written into a goop item's JSON pose or stuck-edge coordinates.
const DEFAULT_GAP = 0.6;

function finiteBoundsX(bound) {
  const min = Number(bound?.minX ?? bound?.min?.x);
  const max = Number(bound?.maxX ?? bound?.max?.x);
  if (!Number.isFinite(min) || !Number.isFinite(max)) return [-0.5, 0.5];
  return min <= max ? [min, max] : [max, min];
}

/**
 * Lay out independent document previews along X with a visible gap.
 *
 * Each bound is either {minX, maxX} or a THREE.Box3-like {min:{x}, max:{x}}.
 * The return value is one translation per input, in the same order. The whole
 * layout is centered, while a lone document retains its original translation.
 */
export function computeWorkspaceOffsets(bounds, options = {}) {
  if (!Array.isArray(bounds) || bounds.length === 0) return [];
  if (bounds.length === 1) return [0];

  const askedGap = Number(options.gap);
  const gap = Number.isFinite(askedGap) && askedGap >= 0 ? askedGap : DEFAULT_GAP;
  const spans = bounds.map(finiteBoundsX);
  const offsets = [];
  let nextLeft = 0;
  for (let i = 0; i < spans.length; i++) {
    const [minX, maxX] = spans[i];
    offsets.push(nextLeft - minX);
    nextLeft += maxX - minX;
    if (i + 1 < spans.length) nextLeft += gap;
  }
  const halfWidth = nextLeft / 2;
  return offsets.map((offset) => offset - halfWidth);
}
