// THE CONTENT TEXT SCREEN (owner 2026-10-24, 2026-10-28): slurs, hate symbols and terms, sexual words and curse words in a
// build's text. Owner 2026-10-28: "every place that requires the central lag check (publishing to workshop, scheduling a
// delivery either to the prime pad or courier, voice bot spawning things or delivering packages) all need to also run a
// second check that detects builds that spell racist, profanity, hate speech, or sexually explicit words". The shared
// goop build validator runs it as the "contentText" rule (contentFindings below) at every check point.
//
// The rules are mikeybox_workshop_web/moderation/content_text_rules.py, generated into ./content_text_rules.mjs; textHits()
// and contentText() here are line-by-line ports of that file's text_hits() and content_text()
// (mikeybox_workshop_web/tests/test_content_text_parity.py runs both on the same strings and builds), so the content audit
// flags exactly what the gates refuse, plus the review-only words. The canonical copy is mikeybox_prime_web/;
// `python sync_goop_validation.py` copies it to the Workshop (src/) and the Goop Editor.
import { BENIGN_PHRASES, COMPACT_LEET, COMPACT_STEMS, CONFUSABLES, CONTENT_NODE_LIMIT, CONTENT_TEXT_KEYS, CONTENT_TEXT_LIMIT,
  DEPICTION_PREFIXES, LEET, TEXT_RULES, VOICE_RULES } from "./content_text_rules.mjs";

const compile = (rows) => rows.map(([label, source]) => [label, new RegExp(source, "iu")]);
const VOICE = compile(VOICE_RULES);
const TEXT = compile(TEXT_RULES);
const BENIGN = BENIGN_PHRASES.map((phrase) => new RegExp(phrase.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "giu"));
const translate = (text, table) => Array.from(text, (ch) => table[ch] ?? ch).join("");

/** NFKC, no format characters (zero-width joiners and spaces, soft hyphens), no accents or other combining marks, and
 * look-alike letters as Latin. Every rule reads the folded text. */
export function fold(text) {
  const s = String(text ?? "").normalize("NFKC").normalize("NFD").replace(/[\p{Cf}\p{Mn}]/gu, "").normalize("NFC");
  return translate(s, CONFUSABLES);
}

export function textHits(text) {
  let s = fold(text);
  if (!s.trim()) return [];
  for (const phrase of BENIGN) s = s.replace(phrase, " ");
  const leet = translate(s.toLowerCase(), LEET);
  const hits = [];
  for (const [label, rx] of VOICE) {
    if (rx.test(s) || rx.test(leet)) { hits.push(label); break; }
  }
  for (const [label, rx] of TEXT) {
    for (const source of [s, leet]) {
      const match = rx.exec(source);
      if (match) {
        hits.push(`${label}:${match[0].toLowerCase().replace(/[^a-z0-9]/g, "") || match[0]}`);
        break;
      }
    }
  }
  for (const token of s.toLowerCase().split(/\s+/).filter(Boolean)) {
    const compact = translate(token, COMPACT_LEET).replace(/[^a-z]/g, "");
    for (const [label, stem] of COMPACT_STEMS) {
      if (compact.includes(stem) && !hits.some((hit) => hit.includes(stem))) hits.push(`${label}:${stem}`);
    }
  }
  return [...new Set(hits)].sort();
}

// The hits that stop a build going public (review:... hits are for the audit only).
export const blocking = (hits) => hits.filter((hit) => !hit.startsWith("review:"));
// The blocking hits that name something we must not build, for a REQUEST ("build me a ..."): a request that only curses
// is still built; the abuse moderation judges the speech itself.
export const depicting = (hits) => blocking(hits).filter((hit) => DEPICTION_PREFIXES.includes(hit.split(":")[0]));

const isNode = (value) => value !== null && typeof value === "object";
/** {strings, complete}: every human-written string inside build content (workspace document names and file names,
 * labels, item text), in walk order, and complete=false when the build holds more than CONTENT_TEXT_LIMIT characters of
 * them or CONTENT_NODE_LIMIT objects (the strings then stop there). Each object's strings in key order, then its nested
 * objects and arrays in key order, depth first; arrays yield only their objects and arrays. */
export function contentText(content) {
  const out = [];
  let total = 0, nodes = 0;
  const stack = [content];
  while (stack.length) {
    const node = stack.pop();
    if (++nodes > CONTENT_NODE_LIMIT) return { strings: out, complete: false };
    const nested = [];
    if (Array.isArray(node)) {
      for (const value of node) if (isNode(value)) nested.push(value);
    } else if (isNode(node)) {
      for (const [key, value] of Object.entries(node)) {
        if (typeof value === "string") {
          if (CONTENT_TEXT_KEYS.includes(key) && value.trim()) {
            total += Array.from(value).length;   // code points, like Python's len()
            if (total > CONTENT_TEXT_LIMIT) return { strings: out, complete: false };
            out.push(value);
          }
        } else if (isNode(value)) nested.push(value);
      }
    }
    for (let i = nested.length - 1; i >= 0; i--) stack.push(nested[i]);
  }
  return { strings: out, complete: true };
}
export const contentStrings = (content) => contentText(content).strings;

const REASONS = [["slur", "a slur"], ["hate", "a hate symbol or term"], ["sexual", "sexual words"], ["crude", "sexual words"],
  ["hard-profanity", "a curse word"], ["profanity", "a curse word"], ["gesture", "an obscene gesture"]];
/** What a hit is, in words that never repeat it ("a slur", "a curse word"). */
export const reasonFor = (hit) => REASONS.find(([prefix]) => hit.startsWith(`${prefix}:`) || hit === prefix)?.[1] ?? "words that are not allowed";
const list = (items) => (items.length < 2 ? items.join("") : `${items.slice(0, -1).join(", ")} and ${items.at(-1)}`);

/** What the contentText rule finds, as reasons that never repeat the offending word ("its title contains a slur").
 * `fields` are [where, text, plural?, kind?] rows; kind "request" (what someone asked us to build) judges only what may
 * not be depicted. `contents` are build trees whose human-written strings are read whole; one past the limits is
 * refused as unreadable. Returns { refuse: [...texts], review: [...texts], hits: [...labels] }. */
export function contentFindings({ fields = [], contents = [] } = {}) {
  const refuse = [], review = [], labels = new Set();
  const inside = [];
  let complete = true;
  for (const content of contents) {
    const read = contentText(content);
    inside.push(...read.strings);
    complete &&= read.complete;
  }
  const rows = [...fields, ["the text inside it", inside.join(" | "), false]];
  for (const [where, text, plural = false, kind = ""] of rows) {
    const hits = textHits(text);
    const found = kind === "request" ? depicting(hits) : blocking(hits);
    for (const hit of hits) labels.add(hit);
    if (found.length) refuse.push(`${where} ${plural ? "contain" : "contains"} ${list([...new Set(found.map(reasonFor))])}`);
    else if (kind !== "request" && hits.some((hit) => hit.startsWith("review:"))) review.push(`${where} may contain words a moderator should look at`);
  }
  if (!complete) refuse.push(`it has more text than can be checked (at most ${CONTENT_TEXT_LIMIT} characters)`);
  return { refuse, review, hits: [...labels].sort() };
}

// The Workshop's publish message, kept for callers and tests of the 10-24 gate (the Workshop itself now asks the
// validator, point "workshop-publish"). null when the text may be public; never repeats the offending word.
export function publishTextRefusal({ title = "", description = "", tags = [], content = null } = {}) {
  const fields = [["title", title], ["description", description],
    ["tags", (Array.isArray(tags) ? tags : []).join(" ")], ["part names", contentStrings(content).join(" | ")]];
  const where = [];
  const why = new Set();
  for (const [name, value] of fields) {
    const hits = blocking(textHits(value));
    if (!hits.length) continue;
    where.push(name);
    for (const hit of hits) why.add(reasonFor(hit));
  }
  if (!where.length) return null;
  const plural = where.length > 1 || where[0] === "tags" || where[0] === "part names";
  return `This build can't be public or unlisted: its ${list(where)} ${plural ? "contain" : "contains"} ` +
    `${list([...why])}, which the Workshop doesn't allow. Change the wording, or save the build as private.`;
}
