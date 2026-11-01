// WORKSHOP TAGS AND ROOT ITEMS (owner 2026-10-26: "actual tags you can select and are required in the workshop", "search
// by root ... how many items have a revolver as the root, broom, etc."). One fixed tag list; the same bytes run on the
// Workshop/Fabshop server (src/), their pages (site/) and the Prime/Fab editor (goop_editor/), drift-checked by
// tests/tags-roots.test.mjs. A shared build (public or unlisted) needs at least one tag; a private draft needs none.
// Older free-typed tags were mapped onto this list once by migrations/0010_tags_roots.sql, from TAG_ALIASES below (the
// test keeps the two in step); tags that matched nothing stay in the database but are no longer shown.

export const WORKSHOP_TAGS = Object.freeze([
  { id: "weapon", label: "Weapon", hint: "Guns, blades, launchers and anything that hits" },
  { id: "tool", label: "Tool", hint: "Grabbers, hookshots and handy gadgets" },
  { id: "vehicle", label: "Vehicle", hint: "Cars, boats and things you ride" },
  { id: "flying", label: "Flying", hint: "Planes, drones, wings and builds that launch you" },
  { id: "wearable", label: "Wearable", hint: "Suits, backpacks, hats and armor" },
  { id: "robot", label: "Robot / Mech", hint: "Robots, mechs and moving machines" },
  { id: "creature", label: "Creature", hint: "Animals, monsters and characters" },
  { id: "building", label: "Building / Scene", hint: "Houses, bases, maps and scenery" },
  { id: "decoration", label: "Decoration", hint: "Art, statues and things to look at" },
  { id: "money", label: "Money / Bags", hint: "Money bags, giveaways and trading" },
  { id: "minigame", label: "Minigame", hint: "Games and challenges to play" },
  { id: "funny", label: "Funny", hint: "Jokes, pranks and silly builds" },
  { id: "chaos", label: "Chaos", hint: "Wild, over-the-top builds" },
  { id: "realistic", label: "Realistic", hint: "Lifelike copies of real things" },
].map((tag) => Object.freeze(tag)));

export const MAX_WORKSHOP_TAGS = 5;

// The free-typed tags builders used before the list (the most common ones on 2026-10-26), each mapped to one list tag.
export const TAG_ALIASES = Object.freeze({
  weapons: "weapon", wepon: "weapon", gun: "weapon", guns: "weapon", sniper: "weapon", laser: "weapon", axe: "weapon",
  ak: "weapon", uzi: "weapon", grenade: "weapon", sword: "weapon", swords: "weapon", rifle: "weapon", shotgun: "weapon",
  pistol: "weapon", bomb: "weapon", "funny weapon": "weapon", "one shot": "weapon", "insta-kill": "weapon", killer: "weapon",
  blaster: "weapon", cannon: "weapon", minigun: "weapon", rpg: "weapon", knife: "weapon", bow: "weapon",
  tools: "tool", utility: "tool", "phys gun": "tool", physgun: "tool", hookshot: "tool", grabber: "tool", gadget: "tool",
  vehicles: "vehicle", car: "vehicle", cars: "vehicle", boat: "vehicle", tank: "vehicle", bike: "vehicle", truck: "vehicle",
  weelchair: "vehicle", wheelchair: "vehicle", train: "vehicle", ship: "vehicle",
  fly: "flying", flyer: "flying", flight: "flying", plane: "flying", planes: "flying", jet: "flying", drone: "flying",
  wings: "flying", glider: "flying", helicopter: "flying",
  wearables: "wearable", wearble: "wearable", supersuit: "wearable", suit: "wearable", backpack: "wearable",
  armor: "wearable", armour: "wearable", hat: "wearable",
  robots: "robot", mech: "robot", mechs: "robot", mechanical: "robot", ai: "robot", android: "robot",
  creatures: "creature", fnaf: "creature", animal: "creature", animals: "creature", pet: "creature", monster: "creature",
  buildings: "building", house: "building", base: "building", castle: "building", scene: "building", map: "building",
  backrooms: "building",
  decor: "decoration", statue: "decoration", art: "decoration",
  moneybags: "money", "money bag": "money", "money dupe": "money", giveaway: "money", "giveaway bag": "money",
  gamble: "money", wallet: "money", "multiple bags in 1": "money", "just sell": "money", tradeable: "money", bag: "money",
  bags: "money",
  game: "minigame", games: "minigame", "mini game": "minigame",
  fun: "funny", troll: "funny", meme: "funny", prank: "funny", silly: "funny", fling: "funny",
  choas: "chaos", "mass destruction": "chaos", destruction: "chaos",
  "hyper realistic": "realistic", realism: "realistic", real: "realistic",
});

const ORDER = new Map(WORKSHOP_TAGS.map((tag, index) => [tag.id, index]));
const BY_LABEL = new Map(WORKSHOP_TAGS.map((tag) => [tag.label.toLowerCase(), tag.id]));

export const isWorkshopTag = (id) => ORDER.has(id);
export const workshopTagLabel = (id) => WORKSHOP_TAGS[ORDER.get(id)]?.label ?? String(id ?? "");

// A list tag's id from its id, its label or an old alias, in any case; "" when it is not on the list.
export function normalizeWorkshopTag(raw) {
  const text = String(raw ?? "").trim().toLowerCase().replace(/\s+/g, " ");
  if (ORDER.has(text)) return text;
  return BY_LABEL.get(text) ?? TAG_ALIASES[text] ?? "";
}

// List tags only, once each, in list order.
export function sortWorkshopTags(ids) {
  return [...new Set((Array.isArray(ids) ? ids : []).filter(isWorkshopTag))].sort((a, b) => ORDER.get(a) - ORDER.get(b));
}

// The root items of a build: the item every other part of an invention is stuck to. A workspace has one per invention.
export function rootItemIds(kind, content) {
  const roots = kind === "workspace"
    ? (Array.isArray(content?.documents) ? content.documents.map((document) => document?.root?.itemID) : [])
    : [content?.itemID];
  return [...new Set(roots.filter((id) => typeof id === "string").map((id) => id.trim()).filter((id) => id && id.length <= 128))];
}

export const ROOT_ITEM_PATTERN = /^[A-Za-z0-9_.-]{1,128}$/;

// "item_police_baton" -> "Police baton".
export function rootItemLabel(itemId) {
  const words = String(itemId ?? "").trim().replace(/^item_/i, "").replace(/[_-]+/g, " ").trim();
  return words ? words[0].toUpperCase() + words.slice(1) : "Unknown item";
}
