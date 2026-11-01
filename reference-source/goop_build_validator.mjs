// THE SHARED GOOP BUILD VALIDATOR (owner 2026-10-26): the one decision whether a goop invention may be spawned, saved or
// delivered, applied by every check point with the rules in goop_build_policy.mjs. The JS points import it; the Python
// services (package bridge, courier, voice bot) call it through goop_validate_cli.mjs (goop_validation.py), so there is
// one implementation. Members of the private code, Discord moderators and the owner are never refused (bypassFor); what
// the rules found is still reported, so it can be logged.
//
//   validateBuild({ inventions, names?, title?, description?, tags?, texts?, content?, point, requester }) -> verdict
//   itemSpawnLimit(itemId, { point, requester })   the most copies a plain "spawn N <item>" may make, or null for no limit
//   describeRules(point)                            the rules in plain words, for the voice bot's LLM and for help pages
//   policySnapshot()                                the policy as JSON, with each catalog item's limit, cost and family
import { GOOP_BUILD_POLICY as POLICY, ITEM_MEASUREMENTS } from "./goop_build_policy.mjs";
import { assessGrief, familyKeys, projectFindings, storedFamilyKeys } from "./goop_grief_screen.mjs";
import { unwrap } from "./goop_lag_machine.mjs";
import { lagEstimate } from "./goop_lag_estimate.mjs";
import { LAG_TABLE } from "./goop_build_lag_data.mjs";
import { VANILLA_MACHINE } from "./goop_build_vanilla_data.mjs";
import { contentFindings } from "./content_text_screen.mjs";
import { shapeFindings } from "./content_shape_screen.mjs";

export const POLICY_VERSION = POLICY.version;
const isObj = (value) => value !== null && typeof value === "object" && !Array.isArray(value);
const lower = (id) => String(id ?? "").trim().toLowerCase();
const nice = (id) => lower(id).replace(/^item_prefab\//, "").replace(/^item_/, "").replace(/_/g, " ");

/** A Nakama user id as 32 lowercase hex, or "" (mobile Fusion ids carry a suffix after the 36-character UUID). */
export function compactUserId(value) {
  let text = String(value ?? "").trim().toLowerCase();
  if (text.length >= 36 && text[8] === "-") text = text.slice(0, 36);
  text = text.replace(/[^0-9a-f]/g, "");
  return text.length === 32 ? text : "";
}

const ROLES = new Map(POLICY.bypass.discordRoles.map((role) => [role.id, role]));
const OWNER_GAME_IDS = new Set(POLICY.bypass.ownerGameUserIds);
/** Who may skip the rules: "owner", "moderator", "member" or "" (owner 2026-10-26: "members of the private code or Discord
 * moderators or me"). A check point passes only what it has proven: `moderator` (a verified Discord moderator session,
 * send pass or moderator-sent package), `member` (a Nakama user id it found in the MIKEYBOX ledger), `gameUserId` (a
 * proven Nakama user id; the owner's accounts are in the policy) or `discordRoleIds` (verified roles). */
export function bypassFor(requester = {}) {
  const roles = Array.isArray(requester?.discordRoleIds) ? requester.discordRoleIds.map(String) : [];
  if (requester?.owner === true || roles.some((id) => ROLES.get(id)?.owner) || OWNER_GAME_IDS.has(compactUserId(requester?.gameUserId))) {
    return "owner";
  }
  if (requester?.moderator === true || roles.some((id) => ROLES.has(id))) return "moderator";
  if (requester?.member === true) return "member";
  return "";
}

const EFFECTS = POLICY.voice.costEffects.map((effect) => ({ re: new RegExp(effect.match), add: effect.add }));
/** A part's load cost for voice builds: its prefab's colliders plus an effect premium (fans, explosives, flames). */
export function itemCost(itemId) {
  const id = lower(itemId);
  const colliders = Math.max(1, ITEM_MEASUREMENTS[id]?.[1] ?? POLICY.voice.unknownColliders);
  return colliders + EFFECTS.reduce((sum, effect) => sum + (effect.re.test(id) ? effect.add : 0), 0);
}
/** The most copies of one item a voice build may hold: its measured limit, its hard limit and the load budget. */
export function itemLimit(itemId) {
  const id = lower(itemId);
  const voice = POLICY.voice;
  const measured = ITEM_MEASUREMENTS[id]?.[0] ?? voice.generalItemLimit;
  const hard = id.startsWith("item_rpg") ? voice.rpgLimit : voice.specialItemLimits[id] ?? voice.generalItemLimit;
  return Math.min(measured, hard, Math.max(1, Math.floor(voice.loadBudget / itemCost(id))));
}

// Every part of one invention: stuck parts, held children and stored contents, with the design-rule measurements.
function inspect(root) {
  const counts = new Map();
  const stats = { parts: 0, maxContents: 0, maxContentsDepth: 0, overfull: [] };
  const stack = [[root, 0]];
  while (stack.length) {
    const [item, contentsDepth] = stack.pop();
    if (!isObj(item)) continue;
    if (++stats.parts > 20000) break;   // a walk guard; the 512 rule failed long before
    const id = lower(item.itemID);
    if (id) counts.set(id, (counts.get(id) ?? 0) + 1);
    for (const edge of Array.isArray(item.stuckChildren) ? item.stuckChildren : []) if (isObj(edge?.item)) stack.push([edge.item, contentsDepth]);
    const contents = [...(Array.isArray(item.children) ? item.children : []), ...(Array.isArray(item.containerContents) ? item.containerContents : [])]
      .map((entry) => (isObj(entry?.item) ? entry.item : entry)).filter((inner) => isObj(inner) && inner.itemID);
    if (contents.length) {
      stats.maxContentsDepth = Math.max(stats.maxContentsDepth, contentsDepth + 1);
      if (contents.length > stats.maxContents) stats.maxContents = contents.length;
      if (contents.length > POLICY.structure.maxContentsPerContainer) stats.overfull.push([id, contents.length]);
    }
    for (const inner of contents) stack.push([inner, contentsDepth + 1]);
  }
  return { counts, stats };
}

// THE GAME'S OWN INVENTION SAVING MACHINE (owner 2026-10-27; VANILLA_INVENTION_MACHINE_RULES.md) for the safe and medium
// security levels, on STUCK PARTS ONLY (owner 2026-10-30: the 32 "only applies to how many objects are part of the stuck
// object graph as directly stuck parts", not "contents of containers or items loaded into things like crossbows and
// slingshots", and "container contents should allow any item ID without restrictions"). Whatever is stored in a container
// or loaded into a holder is content: any item, any number, glitched ones included. A content item with stuck parts of its
// own (a whole build loaded into a crossbow) starts a separate stuck graph, checked on its own like an invention ("a
// separate but safe mode compliant stuck object graph"); the loaded item itself stays content. Ids are compared without
// "item_prefab/"; goop is never saved and never counted.
const V = VANILLA_MACHINE;
const vid = (id) => lower(id).replace(/^item_prefab\//, "");
/** The game's own cap on one item in an invention, or null when the machine never saves it (or it has no config). */
export const vanillaCap = (itemId) => V.caps[vid(itemId)] ?? null;
const stuckOf = (item) => (Array.isArray(item.stuckChildren) ? item.stuckChildren : []).map((edge) => edge?.item).filter(isObj);
const contentsOf = (item) => [...(Array.isArray(item.children) ? item.children : []), ...(Array.isArray(item.containerContents) ? item.containerContents : [])]
  .map((entry) => (isObj(entry?.item) ? entry.item : entry)).filter((inner) => isObj(inner) && inner.itemID);
// Every stuck graph, the invention's first: { where, counts (parts by id, its root included), attached, maxStuckDepth }.
function inspectVanilla(root) {
  const graphs = [];
  const pending = [[root, ""]];
  let guard = 0;
  while (pending.length && guard < 20000) {
    const [top, holder] = pending.shift();
    const graph = { where: holder ? `the build inside a ${nice(holder)}: ` : "", counts: new Map(), attached: 0, maxStuckDepth: 0 };
    const stack = [[top, 0]];
    while (stack.length && ++guard < 20000) {
      const [item, depth] = stack.pop();
      const id = vid(item.itemID);
      // A loaded build's own root is the content item, so only its stuck parts count.
      if (id && id !== "item_goop" && (depth > 0 || !holder)) graph.counts.set(id, (graph.counts.get(id) ?? 0) + 1);
      if (depth > 0 && id !== "item_goop") graph.attached++;
      graph.maxStuckDepth = Math.max(graph.maxStuckDepth, depth);
      for (const part of stuckOf(item)) stack.push([part, depth + 1]);
      const stored = contentsOf(item).map((inner) => [inner, id]);
      while (stored.length && ++guard < 20000) {
        const [inner, container] = stored.pop();
        if (stuckOf(inner).length) pending.push([inner, container]);
        else for (const deeper of contentsOf(inner)) stored.push([deeper, vid(inner.itemID)]);
      }
    }
    graphs.push(graph);
  }
  return graphs;
}
const perGraph = (doc, find) => doc.vanilla.flatMap((graph) => find(graph).map((text) => graph.where + text));
const SECURITY_RULES = {
  vanillaItemCaps: (doc) => perGraph(doc, (graph) => [...graph.counts].filter(([id, n]) => vanillaCap(id) !== null && n > vanillaCap(id))
    .sort((a, b) => b[1] - a[1]).map(([id, n]) => `${n} ${nice(id)} (the game allows ${vanillaCap(id)} in one invention)`)).slice(0, 3),
  vanillaRefusedItems: (doc) => perGraph(doc, (graph) => {
    const refused = [...graph.counts].filter(([id]) => vanillaCap(id) === null);
    return refused.length ? [`it has ${refused.slice(0, 3).map(([id, n]) => `${n} ${nice(id)}`).join(", ")}${refused.length > 3 ? " and more" : ""}, which the game's invention machine never saves`] : [];
  }).slice(0, 3),
  vanillaAttachedCap: (doc) => perGraph(doc, (graph) => (graph.attached > V.maxAttached ? [`${graph.attached} attached parts (the game's invention machine holds ${V.maxAttached} besides the root)`] : [])).slice(0, 3),
  vanillaStuckDepth: (doc) => perGraph(doc, (graph) => (graph.maxStuckDepth > V.maxStuckDepth ? [`parts stuck ${graph.maxStuckDepth} deep (the game keeps ${V.maxStuckDepth})`] : [])).slice(0, 3),
};
/** The security level's rules at a check point: enforced, previewed (the editor) or none. `level` defaults to the
 * policy's; a caller may ask about another one (tests, a preview of what a stricter level would refuse). */
function securityRules(profile, level = POLICY.securityLevel) {
  if (!profile.security || !POLICY.enforce) return { rules: [], mode: "", level };
  if (!(level in POLICY.securityLevels)) throw new Error(`unknown security level "${level}"`);
  return { rules: POLICY.securityLevels[level], mode: profile.security, level };
}

/** The lag census estimate for one invention while it is used (goop_lag_estimate.mjs), with the policy's thresholds. */
export const lagEstimateOf = (root) => lagEstimate(root, LAG_TABLE, POLICY.lagScore.thresholds);
/** What the lag score rule adds to a verdict: its refuse-level findings refuse, its review-level ones are warnings. Only
 * when the policy turns it on; until then the estimate is reported, not applied. */
export function lagScoreFindings(estimate, enabled = POLICY.lagScore.enabled) {
  return enabled && estimate ? { refuse: estimate.refuseReasons, review: estimate.reviewReasons } : { refuse: [], review: [] };
}
const lagSummary = (estimate) => estimate && { observerFrameMs: estimate.observerFrameMs, observerFps: estimate.observerFps,
  q2Fps10: estimate.q2Fps10, hostStallS: estimate.hostStallS, ammoHostStallSPerPull: estimate.ammoHostStallSPerPull, verdict: estimate.verdict,
  reasons: estimate.reasons, top: estimate.top };

const RULES = {
  structure(doc) {
    const out = [];
    const { maxDescendants, maxContentsPerContainer, maxContentsDepth } = POLICY.structure;
    if (doc.stats.parts - 1 > maxDescendants) out.push(`${doc.stats.parts - 1} parts besides the root (an invention holds at most ${maxDescendants})`);
    for (const [id, n] of doc.stats.overfull.slice(0, 2)) out.push(`${n} things stored in one ${nice(id)} (at most ${maxContentsPerContainer})`);
    if (doc.stats.maxContentsDepth > maxContentsDepth) out.push(`containers nested ${doc.stats.maxContentsDepth} deep (at most ${maxContentsDepth})`);
    return out;
  },
  bannedItems: (doc) => banned(doc, POLICY.bannedItems),
  voiceBannedItems: (doc) => banned(doc, POLICY.voiceBannedItems),
  itemLimits(doc) {
    const out = [];
    for (const [id, n] of [...doc.counts].sort((a, b) => b[1] - a[1])) {
      const limit = itemLimit(id);
      if (n > limit) out.push(`${n} ${nice(id)} (at most ${limit} at once)`);
    }
    return out.slice(0, 3);
  },
  rpgLimit(doc) {
    return [...doc.counts].filter(([id, n]) => id.startsWith("item_rpg") && n > POLICY.voice.rpgLimit)
      .map(([id, n]) => `${n} ${nice(id)} (at most ${POLICY.voice.rpgLimit} at once)`);
  },
  loadBudget(doc) {
    let units = 0;
    for (const [id, n] of doc.counts) units += n * itemCost(id);
    doc.loadUnits = units;
    return units > POLICY.voice.loadBudget ? [`too many costly parts (${units} load units, at most ${POLICY.voice.loadBudget})`] : [];
  },
};
function banned(doc, list) {
  const found = list.filter((id) => doc.counts.has(id));
  return found.length ? [`it has ${found.map((id) => `${doc.counts.get(id)} ${nice(id)}`).join(" and ")}, which ${found.length === 1 ? "is" : "are"} banned`] : [];
}

// CONTENT (owner 2026-10-28; policy `content`): the text a build carries or was asked for, judged by the content text
// rules. `texts` are extra labelled strings a check point knows: { field: "creator name" | "request" | "spelled text" |
// "file name" | ..., text, kind? }; kind "request" (what someone asked us to build) refuses only what may not be
// depicted, not plain cursing. `content` is the whole saved document when it holds more than the inventions (a Workshop
// workspace's document and file names); otherwise the inventions are read.
const CONTENT_BYPASS = new Set(POLICY.content.bypass);
// The content rules: text (contentText) and what the items spell or draw (contentShape, content_shape_screen.mjs).
const CONTENT_RULES = new Set(["contentText", "contentShape"]);
const FIELD_LABELS = { "creator name": ["the creator's name", false], request: ["the request", false],
  "spelled text": ["the text it spells", false], "file name": ["its file name", false], name: ["its name", false] };
function contentRule({ roots, names, title, description, tags, texts, content }) {
  const fields = [["its title", title], ["its description", description],
    ["its tags", (Array.isArray(tags) ? tags : []).map(String).join(" "), true]];
  // A workspace's document names are inside `content` already.
  if (content === undefined) fields.push(["its names", (Array.isArray(names) ? names : []).filter((n) => typeof n === "string").join(" | "), true]);
  for (const entry of Array.isArray(texts) ? texts : []) {
    if (!isObj(entry) || typeof entry.text !== "string") continue;
    const [where, plural] = FIELD_LABELS[entry.field] ?? [`its ${String(entry.field || "text").slice(0, 40)}`, false];
    fields.push([where, entry.text, plural, entry.kind === "request" ? "request" : ""]);
  }
  return contentFindings({ fields, contents: content !== undefined ? [content] : roots });
}

/** Whether these inventions may be spawned, saved or delivered at `point` (a key of goop_build_policy.mjs points). A
 * workspace passes one invention per document (and their names); a delivery passes one. */
export function validateBuild({ inventions = [], names = [], title = "", description = "", tags = [], texts = [], content,
  point, requester = {}, securityLevel = POLICY.securityLevel } = {}) {
  const profile = POLICY.points[point];
  if (!profile) throw new Error(`unknown goop build check point "${point}"`);
  const rules = new Set(profile.rules);
  const security = securityRules(profile, securityLevel);
  const reasons = [], warnings = [];
  const add = (list, rule, texts) => { for (const text of texts) list.push({ rule, text }); };
  const roots = (Array.isArray(inventions) ? inventions : [inventions]).map((invention) => unwrap(invention));
  const label = (index) => (roots.length > 1 ? `${names[index] || `invention ${index + 1}`}: ` : "");
  const docs = [];
  let contentFound = null, shapeFound = null;
  if (rules.has("contentText")) {
    contentFound = contentRule({ roots: roots.filter(Boolean), names, title, description, tags, texts, content });
    add(reasons, "contentText", contentFound.refuse);
    add(warnings, "contentText", contentFound.review);
  }
  if (rules.has("contentShape") && !profile.textOnly) {
    shapeFound = shapeFindings(roots.filter(Boolean));
    add(reasons, "contentShape", shapeFound.refuse);
  }
  if (profile.textOnly) roots.length = 0;
  roots.forEach((root, index) => {
    if (!root) { add(reasons, "structure", [`${label(index)}not a goop invention (no root itemID)`]); return; }
    const doc = { ...inspect(root), loadUnits: null };
    for (const rule of ["structure", "bannedItems", "voiceBannedItems", "itemLimits", "rpgLimit", "loadBudget"]) {
      if (rules.has(rule)) add(reasons, rule, RULES[rule](doc).map((text) => label(index) + text));
    }
    doc.lag = rules.has("lagScore") ? lagEstimateOf(root) : null;
    const lagFound = lagScoreFindings(doc.lag);
    add(reasons, "lagScore", lagFound.refuse.map((text) => label(index) + text));
    add(warnings, "lagScore", lagFound.review.map((text) => label(index) + text));
    if (security.rules.length) {
      doc.vanilla = inspectVanilla(root);
      for (const rule of security.rules) add(security.mode === "enforce" ? reasons : warnings, rule, SECURITY_RULES[rule](doc).map((text) => label(index) + text));
    }
    doc.grief = rules.has("lagScreen") ? { ...assessGrief(root), name: names[index] } : null;
    docs.push(doc);
  });
  if (!roots.length && !profile.textOnly) add(reasons, "structure", ["there is no invention to check"]);
  if (rules.has("lagScreen")) {
    const findings = projectFindings(docs.map((doc) => doc.grief).filter(Boolean), title, description);
    add(reasons, "lagScreen", findings.quarantine);
    add(warnings, "lagScreen", findings.review);
  }
  const bypass = bypassFor(requester);
  // The content rules have their own, narrower bypass (policy `content.bypass`): members of the private code skip the lag
  // rules, not the content rules.
  const passes = (reason) => Boolean(bypass) && (!CONTENT_RULES.has(reason.rule) || CONTENT_BYPASS.has(bypass));
  const standing = reasons.filter((reason) => !passes(reason));
  const allowed = !POLICY.enforce || standing.length === 0;
  const first = standing[0];
  const template = !first ? "" : first.rule === "contentShape" ? profile.shapeRefusal ?? profile.contentRefusal ?? profile.refusal
    : first.rule === "contentText" ? profile.contentRefusal ?? profile.refusal
    : first.rule in SECURITY_RULES ? profile.securityRefusal ?? POLICY.securityRefusal : profile.refusal;
  return {
    policyVersion: POLICY.version, point,
    allowed,                                 // false: refuse, and tell the person `refusal`
    enforced: POLICY.enforce,
    bypass,                                  // "owner" | "moderator" | "member" | ""
    bypassed: reasons.length > 0 && standing.length === 0,   // allowed only because of who asked (log it)
    refusal: allowed ? "" : template.replace("{reason}", first.text).replace("{level}", security.level),
    refusedBy: allowed ? "" : first.rule,     // the rule `refusal` speaks for ("contentText", "contentShape", "lagScore", ...)
    // A content rule refused (or would, for someone who may bypass it): callers that apply the bypass themselves
    // (A's package bridge, the courier) let only `content.bypass` through then.
    contentRefused: reasons.some((reason) => CONTENT_RULES.has(reason.rule)),
    securityLevel: security.mode ? security.level : "",
    reasons, warnings,
    // What a delivery keeps at most, per item or "explosives" (Worker applyItemCaps); none for those who bypass.
    trims: profile.trims && POLICY.enforce && !bypass ? { ...POLICY.deliveryItemCaps } : {},
    assessment: {
      // The content rules' labels ("slur:racial", "hate:nazi", "review:sexual:...", "shape:swastika"), and where the shape
      // screen saw them (masked words, swastika grids), for moderators' logs only.
      content: (contentFound || shapeFound) && { hits: [...(contentFound?.hits ?? []), ...(shapeFound?.hits ?? [])],
        ...(shapeFound?.findings.length ? { shapes: shapeFound.findings } : {}) },
      parts: docs.reduce((sum, doc) => sum + doc.stats.parts, 0),
      loadUnits: docs.some((doc) => doc.loadUnits !== null) ? docs.reduce((sum, doc) => sum + (doc.loadUnits ?? 0), 0) : null,
      // The lag census estimate of the worst invention, applied only when the policy turns the lag score on.
      lag: docs.some((doc) => doc.lag) ? { enforced: POLICY.lagScore.enabled, ...lagSummary(docs.filter((doc) => doc.lag)
        .reduce((worst, doc) => (doc.lag.observerFrameMs + doc.lag.hostStallS * 10 > worst.observerFrameMs + worst.hostStallS * 10 ? doc.lag : worst),
          docs.find((doc) => doc.lag).lag)) } : null,
      documents: docs.map((doc) => ({ ...(doc.grief && { explosives: doc.grief.explosives, families: doc.grief.families,
        overlapPairs: doc.grief.overlapPairs, lagMachine: doc.grief.lagMachine }), ...(doc.lag && { lag: lagSummary(doc.lag) }) })),
    },
  };
}

// THE LAG REPORT (owner 2026-10-31: builds that fail the lag check "highlighted in red on the workshop and have a warning
// saying why ... the actual lag score we gave the build ... the threshold to be shown beside the score, so people can see how
// far past the limit their build is", also "shown in the editor at the moment when they try to schedule a delivery"). The
// lag rules everyone is held to (point "workshop-save": the lag score and the lag screen, nobody bypassing), each score
// beside its limits. A workspace counts its worst invention. severity: the worst score against its refuse limit, at least 1
// when refused and under 1 when not; rank: severity x 1000 rounded (the Workshop's lag sort).
const BASE_FRAME_MS = 1000 / 72;
const LAG_MEASURES = [
  { key: "q2Fps10", label: "Quest 2 in a 10-player room", unit: "fps", lowerIsWorse: true },
  // The observers' rule applies only while the policy has no Quest 2 limit (deleting the q2Fps10 line brings it back).
  { key: "observerFps", limits: "observerFrameMs", label: "Players watching", unit: "fps", lowerIsWorse: true },
  { key: "hostStallS", label: "Host freeze", unit: "s" },
  { key: "ammoHostStallSPerPull", label: "Host freeze on every trigger pull", unit: "s", onlyWhenUsed: true },
];
function lagMeasures(lag, thresholds) {
  const out = [];
  for (const m of LAG_MEASURES) {
    let limit = thresholds[m.limits ?? m.key];
    if (!limit || (m.key === "observerFps" && thresholds.q2Fps10 && lag.q2Fps10 !== null)) continue;
    // The observers' limits are frame times over the 72 Hz frame: as fps they read the way the score does.
    if (m.limits === "observerFrameMs") limit = { review: 1000 / (BASE_FRAME_MS + limit.review), refuse: 1000 / (BASE_FRAME_MS + limit.refuse) };
    const value = Number(lag[m.key]);
    if (!Number.isFinite(value) || (m.onlyWhenUsed && value <= 0)) continue;
    const state = m.lowerIsWorse ? (value < limit.refuse ? "refuse" : value < limit.review ? "review" : "ok")
      : (value >= limit.refuse ? "refuse" : value >= limit.review ? "review" : "ok");
    const ratio = m.lowerIsWorse ? (value > 0 ? limit.refuse / value : 99) : value / limit.refuse;
    out.push({ key: m.key, label: m.label, unit: m.unit, value, review: Math.round(limit.review * 10) / 10,
      refuse: Math.round(limit.refuse * 10) / 10, lowerIsWorse: Boolean(m.lowerIsWorse), state, ratio: Math.round(ratio * 1000) / 1000 });
  }
  return out;
}
// The version a stored lag report was made under (2026-10-31): the policy's version and a fingerprint of the lag table,
// so new census data re-checks stored reports even when the policy's version stays (FNV-1a of the table's JSON, computed
// once, on first use).
let cachedLagCheckVersion = null;
export function lagCheckVersion() {
  if (cachedLagCheckVersion === null) {
    const text = JSON.stringify(LAG_TABLE);
    let hash = 0x811c9dc5;
    for (let i = 0; i < text.length; i++) hash = Math.imul(hash ^ text.charCodeAt(i), 0x01000193) >>> 0;
    cachedLagCheckVersion = `${POLICY.version}+${hash.toString(16).padStart(8, "0")}`;
  }
  return cachedLagCheckVersion;
}

// A finding that only words a measure above (the measures show it with its limits); the rest are other lag findings.
const MEASURE_FINDING = /^(?:[^:]*: )?(?:a Quest 2 in a \d+-player room ~|observers ~|host stall ~|loaded launchers stall the host ~)/;
/** The lag check of one build: {verdict ok|review|refuse, severity, rank, measures [{label, value, unit, review, refuse,
 * lowerIsWorse, state}], reasons, warnings, otherReasons, otherWarnings (findings that are not a measure), invention (a
 * workspace's worst), policyVersion, enforced}, or null when there is no invention to check. */
export function lagReport(inventions, names = []) {
  const list = (Array.isArray(inventions) ? inventions : [inventions]).filter((invention) => isObj(invention));
  if (!list.length) return null;
  const verdict = validateBuild({ inventions: list, names, point: "workshop-save" });
  const docs = verdict.assessment.documents;
  let worst = null;
  docs.forEach((doc, index) => {
    if (!doc.lag) return;
    const measures = lagMeasures(doc.lag, POLICY.lagScore.thresholds);
    const ratio = Math.max(0, ...measures.map((m) => m.ratio));
    if (!worst || ratio > worst.ratio) worst = { index, measures, ratio };
  });
  if (!worst) return null;
  const lagRule = (reason) => reason.rule === "lagScore" || reason.rule === "lagScreen";
  const reasons = verdict.reasons.filter(lagRule).map((reason) => reason.text);
  const warnings = verdict.warnings.filter(lagRule).map((reason) => reason.text);
  const result = reasons.length ? "refuse" : warnings.length ? "review" : "ok";
  const severity = result === "refuse" ? Math.max(1, worst.ratio) : Math.min(0.999, worst.ratio);
  return { verdict: result, severity: Math.round(severity * 1000) / 1000, rank: Math.round(severity * 1000),
    invention: list.length > 1 ? String(names[worst.index] || `invention ${worst.index + 1}`) : null,
    measures: worst.measures, reasons, warnings, otherReasons: reasons.filter((text) => !MEASURE_FINDING.test(text)),
    otherWarnings: warnings.filter((text) => !MEASURE_FINDING.test(text)), policyVersion: POLICY.version, enforced: POLICY.lagScore.enabled };
}

/** The most copies of one item a plain "spawn N <item>" may make at `point`, or null when nothing limits it (a bypass). */
export function itemSpawnLimit(itemId, { point = "voice-item", requester = {}, securityLevel = POLICY.securityLevel } = {}) {
  if (!POLICY.enforce || bypassFor(requester)) return null;
  const rules = new Set(POLICY.points[point]?.rules ?? []);
  let limit = Infinity;
  if (rules.has("itemLimits")) limit = Math.min(limit, itemLimit(itemId));
  if (rules.has("familyCap") && (familyKeys(itemId).length || storedFamilyKeys(itemId).length)) limit = Math.min(limit, POLICY.families.cap);
  // Medium and safe: no more of one item than the game's own invention machine allows (owner 2026-10-27).
  if (securityRules(POLICY.points[point] ?? {}, securityLevel).rules.includes("vanillaItemCaps") && vanillaCap(itemId) !== null) limit = Math.min(limit, vanillaCap(itemId));
  return Number.isFinite(limit) ? limit : null;
}

/** The rules at `point` in plain words (help pages; `compact` for the voice bot's LLM prompt, which lists only the
 * hard per-item limits instead of every measured one). */
export function describeRules(point, { compact = false, securityLevel = POLICY.securityLevel } = {}) {
  const rules = new Set(POLICY.points[point]?.rules ?? []);
  const lines = [`Build rules (policy ${POLICY.version}). Members of the private code ${POLICY.bypass.privateCodeRoom}, Discord moderators and the owner are exempt${rules.has("contentText") && !CONTENT_BYPASS.has("member") ? "; members of the private code are not exempt from the first rule" : ""}.`];
  if (rules.has("contentText")) lines.push("- Nothing offensive: no slurs, hate symbols or terms (no swastikas or other Nazi symbols), sexual words or sexual shapes, or curse words, whether in its name and text or spelled out or drawn with items. Refuse such requests.");
  if (rules.has("structure")) lines.push(`- At most ${POLICY.structure.maxDescendants} parts in one invention besides its root, at most ${POLICY.structure.maxContentsPerContainer} things stored in one container, containers nested at most ${POLICY.structure.maxContentsDepth} deep.`);
  const bannedIds = [...(rules.has("bannedItems") ? POLICY.bannedItems : []), ...(rules.has("voiceBannedItems") ? POLICY.voiceBannedItems : [])];
  if (bannedIds.length) lines.push(`- Never use: ${bannedIds.map(nice).join(", ")}.`);
  if (rules.has("lagScreen")) {
    const familyNames = POLICY.families.loose.map((f) => f.name).join(", ");
    lines.push(`- Fewer than ${POLICY.explosives.refuse} explosives (grenades, dynamite, mines, RPG ammo and the like), counting ones loaded in launchers or bags.`);
    lines.push(`- At most ${POLICY.families.cap} loose ${familyNames} each, and at most ${POLICY.families.combinedCap} of them together; at most ${POLICY.families.cap} shredders, even packed in bags.`);
    lines.push("- No piles of parts sunk inside each other (an overlap lag machine), and no title or description about lagging or crashing the game.");
  }
  if (rules.has("itemLimits") || rules.has("rpgLimit")) {
    lines.push(`- RPGs: at most ${POLICY.voice.rpgLimit} of each kind.`);
  }
  if (rules.has("itemLimits")) {
    const byLimit = new Map();
    const listed = compact ? Object.keys(POLICY.voice.specialItemLimits) : [...Object.keys(ITEM_MEASUREMENTS), ...Object.keys(POLICY.voice.specialItemLimits)];
    for (const id of new Set(listed)) {
      const limit = itemLimit(id);
      if (limit < POLICY.voice.generalItemLimit && !id.startsWith("item_rpg")) byLimit.set(limit, [...(byLimit.get(limit) ?? []), nice(id)]);
    }
    lines.push(`- Most items: at most ${POLICY.voice.generalItemLimit} copies of one item.`);
    for (const [limit, items] of [...byLimit].sort((a, b) => a[0] - b[0])) lines.push(`- At most ${limit} of each: ${items.sort().join(", ")}.`);
    if (compact) lines.push("- Other heavy items (many colliders, rigidbodies or effects) allow fewer copies too; the host refuses a build past them.");
  }
  if (rules.has("loadBudget")) lines.push(`- The whole build may cost at most ${POLICY.voice.loadBudget} load units: each part costs its colliders (most cost 1 to 3), fans 8 more, explosives and RPGs 2 more.`);
  const security = securityRules(POLICY.points[point] ?? {}, securityLevel);
  if (security.mode === "enforce" && security.rules.includes("vanillaItemCaps")) {
    lines.push(`- Security level ${security.level}: no more of one item than the game's own invention machine allows (32 for most items; fewer for many, e.g. ${["item_rpg", "item_alienblaster", "item_ammo_pouch", "item_broom"].filter((id) => vanillaCap(id) !== null).map((id) => `${nice(id)} ${vanillaCap(id)}`).join(", ")}), counting stuck parts only.`);
  }
  if (security.mode === "enforce" && security.rules.includes("vanillaAttachedCap")) {
    lines.push(`- Only what the game's own invention machine saves, counting stuck parts only: at most ${V.maxAttached} attached parts besides the root; no fish, ores, fishing rods, bait, quest items or other items it never saves.`);
    lines.push("- Anything may be stored in bags, quivers and launchers or loaded into crossbows and other holders, any item and any number, and none of it counts; a build loaded into a holder follows the same rules on its own.");
  }
  if (rules.has("lagScore") && POLICY.lagScore.enabled) {
    const th = POLICY.lagScore.thresholds;
    const players = th.q2Fps10 ? `a Quest 2 player in a ${LAG_TABLE.q2?.room?.players ?? 10}-player room at ${th.q2Fps10.refuse} fps or better`
      : `other players above ${Math.round(1000 / (1000 / 72 + th.observerFrameMs.refuse))} fps`;
    lines.push(`- While it is used (trigger pulled), it must keep ${players} and must not stall the host for ${th.hostStallS.refuse} s; loaded grenade launchers must not stall it ${th.ammoHostStallSPerPull.refuse} s per pull. Part count matters most: about 512 parts in use is the limit for ordinary items, and some items (castle roof toppers, cube frames, RPGs, tripwires) allow far fewer.`);
  }
  return lines.join("\n");
}

/** One item's voice limit, load cost and lag families. */
export const itemInfo = (itemId, securityLevel = POLICY.securityLevel) => ({ limit: itemLimit(itemId), cost: itemCost(itemId),
  families: [...familyKeys(lower(itemId)), ...storedFamilyKeys(lower(itemId))], spawnLimit: itemSpawnLimit(itemId, { securityLevel }),
  vanillaCap: vanillaCap(itemId) });

/** The policy as plain JSON for the Python services, with every known item's voice limit, cost and lag families, at the
 * live security level they pass (build_security.mjs; the policy's when none). */
export function policySnapshot(securityLevel = POLICY.securityLevel) {
  const ids = new Set([...Object.keys(ITEM_MEASUREMENTS), ...Object.keys(POLICY.voice.specialItemLimits), ...POLICY.explosives.ids, ...Object.keys(V.caps), ...V.refused,
    ...POLICY.families.loose.flatMap((f) => f.ids), ...POLICY.families.stored.flatMap((f) => f.ids)]);
  const items = {};
  for (const id of [...ids].sort()) items[id] = itemInfo(id, securityLevel);
  // A voice build's whole size under the security level: the game's machine holds the root and 32 attached parts in safe mode.
  const security = { level: securityLevel, maxBuildParts: securityRules(POLICY.points["voice-generated"], securityLevel).rules.includes("vanillaAttachedCap") ? V.maxAttached + 1 : null };
  return { ...JSON.parse(JSON.stringify(POLICY)), items, security };
}
