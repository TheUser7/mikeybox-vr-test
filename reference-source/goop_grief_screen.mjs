// Griefing lag designs (owner 2026-10-23): the JS twin of goop_grief_screen.py for the Worker, the Goop Editor and the
// Workshop. Same signals, thresholds and wording rules; test_goop_grief_screen.py checks parity on the gallery corpus.
//   1. Overlap lag machine: hundreds of colliders sunk into each other (goop_lag_machine.mjs, calibrated 10-16).
//   2. Explosive flood: 100+ explosives loose or loaded (the 10-19 crasher was 64 launchers x 6 cluster grenades).
//   3. Intent: the title or description says it is meant to lag, crash or freeze the game or server.
//   4. Lag-item flood (owner 2026-10-24): more than 32 loose four-leaf clovers, backpacks, flashlights or bubble guns, or
//      more than 64 of them together (LAG_FAMILIES; why each family costs frame time is in goop_grief_screen.py).
//   5. Shredder flood (owner 2026-10-25): more than 32 shredders, packed in bags or loose (STORED_FAMILIES).
// lagVerdict(invention, title, description) runs every signal on one invention: the call for delivery gates.
import { assessLagMachine, unwrap, MAX_NODES, REFUSE_COLLIDER_PAIRS, REFUSE_MIN_UNITS } from "./goop_lag_machine.mjs";
import { GOOP_BUILD_POLICY as POLICY } from "./goop_build_policy.mjs";

export const GRIEF_SCREEN_VERSION = 3;
// The thresholds and item lists live in goop_build_policy.mjs (owner 2026-10-26: one policy for every check point); the
// names below stay for the modules that import them. goop_grief_screen.py keeps the same values for the report tools,
// and test_goop_grief_screen.py / test_goop_validation.py hold the two together.
export const EXPLOSIVE_IDS = new Set(POLICY.explosives.ids);
export const EXPLOSIVE_QUARANTINE = POLICY.explosives.refuse;
export const EXPLOSIVE_REVIEW = POLICY.explosives.review;
// Deliveries keep at most this many explosives of all kinds (goop_build_policy.mjs deliveryItemCaps). Ordinary gallery
// builds stay at 38 or fewer; the floods carry 64-419 (scan 2026-10-23).
export const DELIVERY_EXPLOSIVE_CAP = POLICY.deliveryItemCaps.explosives;
export const SAME_ITEM_REVIEW = POLICY.sameItemReview;
const OVERLAP_REVIEW_PAIRS = Math.floor(REFUSE_COLLIDER_PAIRS / 2);
const OVERLAP_REVIEW_UNITS = Math.floor(REFUSE_MIN_UNITS / 2);
// Families come from the game's item prefabs (clover particles and radar targets, BackpackItem triggers, LightCollider
// triggers, BubbleGun/BubbleStaff physics scripts). Only loose items count, not ones stored in bags, guns or other
// containers (owner 2026-10-24); new skins count by name prefix.
const family = (f) => ({ key: f.key, name: f.name, ids: new Set(f.ids), prefix: new RegExp(f.prefix) });
export const LAG_FAMILIES = POLICY.families.loose.map(family);
export const FAMILY_CAP = POLICY.families.cap;
export const COMBINED_FAMILY_CAP = POLICY.families.combinedCap;
// Families whose packed items count too (owner 2026-10-25), same FAMILY_CAP, outside the combined cap: a delivery throws
// a bag's contents out. 420 shredders packed into backpacks froze MIKEYBOX on 10-24 (goop_grief_screen.py has the story).
export const STORED_FAMILIES = POLICY.families.stored.map(family);

const TARGETS = String.raw`(?:the\s+)?(?:whole\s+|entire\s+)?(?:server|game|lobby|room|everyone|everybody|all|players|people|ppl|other\s+players)`;
const STRONG_INTENT = new RegExp(String.raw`\b(lag+[\s_-]*(?:machine|bag|bomb|box|gun|cannon|spam\w*|switch|stick|device|ball|nuke)s?|lagg?ers?|` +
  String.raw`(?:(?!gate)[a-z]+)?crashers?|(?:server|game|lobby|room)[\s_-]*(?:killer|breaker|destroyer|wrecker|freezer|crash\w*|lag\w*)|` +
  String.raw`(?:crash|freeze|kick|disconnect|dc|lag)\w*\s+` + TARGETS + "|" +
  String.raw`(?:cant|can'?t|cannot)\s+(?:even\s+)?leave)\b`, "gi");
const LAG_ONLY_TITLE = /^\W*(?:lag+s?|lagg+y+)\W*$/i;
const NEGATED_LAG = new RegExp(String.raw`\b(?:no|anti|low|zero|without|less|not|non|never|doesn'?t|does\s+not|won'?t|wont)[\s_-]*` +
  String.raw`lag\w*|\blag[\s_-]*(?:free|less|proof)\b`, "gi");
const WEAK_INTENT = new RegExp(String.raw`\b(lag\w*|crash\w*|grief\w*|troll\w*|nuke\w*|fps\s*(?:killer|drop\w*)|` +
  String.raw`destroy\s+(?:the\s+)?game)\b`, "gi");

const isObj = (v) => v !== null && typeof v === "object" && !Array.isArray(v);

function walk(root) {
  const out = [];
  const stack = [[root, false]];
  while (stack.length && out.length < MAX_NODES) {
    const [item, stored] = stack.pop();
    out.push([item, stored]);
    for (const edge of Array.isArray(item.stuckChildren) ? item.stuckChildren : []) if (isObj(edge) && isObj(edge.item)) stack.push([edge.item, stored]);
    for (const entry of [...(Array.isArray(item.children) ? item.children : []), ...(Array.isArray(item.containerContents) ? item.containerContents : [])]) {
      const inner = isObj(entry) && isObj(entry.item) ? entry.item : entry;
      if (isObj(inner) && inner.itemID) stack.push([inner, true]);
    }
  }
  return out;
}

/** The LAG_FAMILIES keys an itemID belongs to (the flashlight backpack is both a backpack and a light). */
export function familyKeys(itemID) {
  const id = String(itemID || "").replace(/^item_prefab\//, "");
  return LAG_FAMILIES.filter((family) => family.ids.has(id) || family.prefix.test(id)).map((family) => family.key);
}

/** The STORED_FAMILIES keys an itemID belongs to; these count whether the item is loose or packed in a container. */
export function storedFamilyKeys(itemID) {
  const id = String(itemID || "").replace(/^item_prefab\//, "");
  return STORED_FAMILIES.filter((family) => family.ids.has(id) || family.prefix.test(id)).map((family) => family.key);
}

/** One invention: parts, explosives, the biggest same-item count, lag-item families, and the overlap screen. */
export function assessGrief(invention) {
  const root = unwrap(invention);
  if (!root) return { parts: 0, explosives: 0, explosiveCounts: {}, topItem: null, topItemCount: 0, overlapPairs: 0, overlapUnits: 0,
    lagMachine: false, families: {}, familyItems: 0 };
  const items = walk(root);
  const counts = new Map();
  for (const [item] of items) { const id = String(item.itemID || ""); counts.set(id, (counts.get(id) || 0) + 1); }
  let topItem = null, topItemCount = 0;
  for (const [id, n] of counts) if (n > topItemCount) { topItem = id; topItemCount = n; }
  const explosiveCounts = Object.fromEntries([...counts].filter(([id]) => EXPLOSIVE_IDS.has(id)).sort((a, b) => b[1] - a[1]));
  const families = {};
  let familyItems = 0;
  for (const [item, stored] of items) {
    const keys = stored ? [] : familyKeys(item.itemID);
    if (keys.length) familyItems++;
    for (const key of [...keys, ...storedFamilyKeys(item.itemID)]) families[key] = (families[key] || 0) + 1;
  }
  const overlap = assessLagMachine(root);
  return { parts: items.length, explosives: Object.values(explosiveCounts).reduce((a, b) => a + b, 0), explosiveCounts,
    topItem, topItemCount, overlapPairs: overlap.colliderPairs || 0, overlapUnits: overlap.overlappingUnits || 0,
    lagMachine: !!overlap.lagMachine,
    families: Object.fromEntries([...LAG_FAMILIES, ...STORED_FAMILIES].filter((f) => families[f.key]).map((f) => [f.key, families[f.key]])),
    familyItems };
}

const countsText = (counts) => Object.entries(counts).slice(0, 4).map(([id, n]) => `${n} ${id.replace(/^item_/, "")}`).join(", ");

/** The findings for one build, split into what refuses it (quarantine) and what only asks for a look (review): its
 * documents' assessGrief() results plus its title and description. goop_build_validator.mjs reads these. */
export function projectFindings(documents, title = "", description = "") {
  const quarantine = [], review = [];
  for (const doc of documents) {
    const label = documents.length > 1 ? `${doc.name || "invention"}: ` : "";
    if (doc.lagMachine) quarantine.push(`${label}overlap lag machine (${doc.overlapPairs} collider pairs, ${doc.overlapUnits} overlapping pieces)`);
    else if (doc.overlapPairs >= OVERLAP_REVIEW_PAIRS && doc.overlapUnits >= OVERLAP_REVIEW_UNITS)
      review.push(`${label}dense overlap (${doc.overlapPairs} pairs, ${doc.overlapUnits} pieces)`);
    if (doc.explosives >= EXPLOSIVE_QUARANTINE) quarantine.push(`${label}explosive flood (${doc.explosives}: ${countsText(doc.explosiveCounts)})`);
    else if (doc.explosives >= EXPLOSIVE_REVIEW) review.push(`${label}${doc.explosives} explosives (${countsText(doc.explosiveCounts)})`);
    if (doc.topItemCount >= SAME_ITEM_REVIEW) review.push(`${label}${doc.topItemCount} x ${doc.topItem}`);
    const families = doc.families || {};
    const over = [...LAG_FAMILIES, ...STORED_FAMILIES].filter((f) => (families[f.key] || 0) > FAMILY_CAP);
    for (const f of over) quarantine.push(`${label}${families[f.key]} ${f.name} (more than ${FAMILY_CAP})`);
    if (!over.length && (doc.familyItems || 0) > COMBINED_FAMILY_CAP) {
      quarantine.push(`${label}${doc.familyItems} clovers, backpacks, lights, bubble and water guns together (more than ${COMBINED_FAMILY_CAP})`);
    }
  }
  const text = `${title || ""}\n${description || ""}`.replace(NEGATED_LAG, " ");
  const strong = [...new Set([...text.matchAll(STRONG_INTENT)].map((m) => m[0].toLowerCase()))].sort();
  if (LAG_ONLY_TITLE.test(title || "")) strong.push(`title '${title}'`);
  const weak = [...new Set([...text.matchAll(WEAK_INTENT)].map((m) => m[0].toLowerCase()))].sort();
  if (strong.length) quarantine.push("title/description: " + strong.map((w) => `'${w}'`).join(", "));
  else if (weak.length) review.push("title/description: " + weak.map((w) => `'${w}'`).join(", "));
  return { quarantine, review };
}

/** "quarantine" / "review" / "ok" for one build: its documents' assessGrief() results plus its title and description. */
export function projectVerdict(documents, title = "", description = "") {
  const { quarantine, review } = projectFindings(documents, title, description);
  return { verdict: quarantine.length ? "quarantine" : review.length ? "review" : "ok", reasons: [...quarantine, ...review] };
}

/** One invention, for delivery gates: lagDesign is true when any signal says quarantine. */
export function lagVerdict(invention, title = "", description = "") {
  const assessment = assessGrief(invention);
  const verdict = projectVerdict([assessment], title, description);
  return { lagDesign: verdict.verdict === "quarantine", verdict: verdict.verdict, reasons: verdict.reasons, assessment };
}

/** Why the Workshop will not save a build, or "". Owner 2026-10-24: only verified Discord moderators may save lag
 * designs, and only they decide where (the caller skips this for them); nobody else may save one, not even privately. */
export function saveRefusal(inventions, title = "", description = "") {
  const verdict = projectVerdict(inventions.map((invention) => assessGrief(invention)), title, description);
  return verdict.verdict === "quarantine"
    ? `This build looks like it is made to lag or crash the game (${verdict.reasons[0]}). Only Discord moderators can save builds like this, even privately.`
    : "";
}
