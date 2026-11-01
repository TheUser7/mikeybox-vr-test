// THE GOOP BUILD POLICY (owner 2026-10-26): every rule that decides whether a goop invention is safe to spawn, save or
// deliver, in one place. Owner: "we need to standardize and centralize this logic that looks at a goop invention .json and
// decides whether it is safe to spawn. This logic needs to live in one library so that it can be updated and when updated
// the changes will affect every validation point ... and only allow members of the private code or Discord moderators or
// me to bypass it."
//
// goop_build_validator.mjs applies this policy, and every check point calls it:
//   - the delivery Workers (Prime and Fab: named packages, private deliveries, legacy orders)       point "delivery"
//   - Workshop and Fabshop saves, and the Goop Editor's Validation panel                             "workshop-save", "editor"
//   - A's package bridge, the private courier and the voice bot, which are Python and call the same
//     validator through goop_validation.py -> goop_validate_cli.mjs                                  "bridge", "courier", "voice-*"
// Change a number here, run the tests, then deploy the sites and restart the Python services; every point follows.
// The lag census's estimate is the `lagScore` rule below (goop_lag_estimate.mjs, data goop_build_lag_data.mjs).
//
// The canonical copy is mikeybox_prime_web/. mikeybox_workshop_web/src/ and goop_editor/ hold byte copies, and their
// deploy scripts refuse drift (copy with `python sync_goop_validation.py`).
import { ITEM_MEASUREMENTS } from "./goop_build_item_data.mjs";

const freeze = (value) => {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const inner of Object.values(value)) freeze(inner);
  }
  return value;
};

export const GOOP_BUILD_POLICY = freeze({
  version: "2026-10-31.1",
  // false is the emergency off switch: every point still reports what it finds, but nothing is refused or trimmed.
  enforce: true,

  // WHO MAY SPAWN ANYTHING (owner 2026-10-26: "members of the private code or Discord moderators or me").
  bypass: {
    // Members of the private room code, by Nakama user id: the MIKEYBOX Members and Whitelist in
    // room_moderation_known_users.json (in game only; a website visitor is known by Discord, not by game account).
    privateCodeRoom: "MIKEYBOX",
    // Discord roles in the Mikeybox server, as the Workshop/Fabshop verify them at sign-in (MODERATOR_ROLE_IDS there).
    discordRoles: [
      { id: "1522261887096717332", name: "admin", owner: true },
      { id: "1523247768737550449", name: "Discord Moderator" },
      { id: "1523247073208701130", name: "In-Game Code Moderator" },
    ],
    // The owner's own game accounts (mikeybox and Mikeybox), so the owner never depends on the member ledger.
    ownerGameUserIds: ["adbbe79a545f4efe8e0bbc0f952b582c", "a31c312ff70142a8a5ad8aa70d7f219d"],
  },

  // DESIGN RULES: what the game's stash (FromAPIV1) can hold. One 512-part budget per invention, shared by stuck parts
  // and stored contents; at most 30 contents in one container, nested at most 4 containers deep.
  structure: { maxDescendants: 512, maxContentsPerContainer: 30, maxContentsDepth: 4 },

  // LAG SCREEN (goop_grief_screen.mjs applies these; the overlap lag machine thresholds are calibrated in
  // goop_lag_machine.mjs). Explosives count whether loose or loaded (the 10-19 crasher hid them in launchers).
  explosives: {
    ids: [
      "item_anti_gravity_grenade", "item_arrow_bomb", "item_broccoli_grenade", "item_broccoli_shrink_grenade",
      "item_c4_explosive", "item_cluster_grenade", "item_dynamite", "item_dynamite_cube", "item_fish_seamine",
      "item_grenade", "item_grenade_gold", "item_impulse_grenade", "item_landmine", "item_landmine_bee",
      "item_laser_bomb", "item_love_grenade", "item_molotov", "item_pumpkin_bomb", "item_rpg_ammo", "item_rpg_ammo_egg",
      "item_rpg_ammo_shoe", "item_rpg_ammo_spear", "item_stash_grenade", "item_sticky_dynamite",
      "item_sticky_dynamite_gold", "item_tele_grenade", "item_timebomb", "item_tripwire_explosive",
    ],
    review: 33,
    refuse: 100,
  },
  sameItemReview: 200,
  // Lag-item families (owner 2026-10-24/25): more than `cap` LOOSE items of one family, or more than `combinedCap` of
  // them together, is a lag machine. Stored families count packed items too (420 shredders in bags froze MIKEYBOX).
  families: {
    cap: 32,
    combinedCap: 64,
    loose: [
      { key: "clover", name: "four-leaf clovers", ids: ["item_four_leaf_clover", "item_four_leaf_clover_gold"],
        prefix: "^item_four_leaf_clover" },
      { key: "backpack", name: "backpacks", ids: [
        "item_backpack", "item_backpack_bankrobber", "item_backpack_black", "item_backpack_dragon", "item_backpack_fish",
        "item_backpack_frog", "item_backpack_gold", "item_backpack_green", "item_backpack_large_base",
        "item_backpack_large_basketball", "item_backpack_large_clover", "item_backpack_monkey", "item_backpack_pink",
        "item_backpack_realistic", "item_backpack_santasack", "item_backpack_small_base", "item_backpack_space",
        "item_backpack_white", "item_backpack_with_flashlight", "item_safe"], prefix: "^item_backpack" },
      { key: "light", name: "flashlights and other lights", ids: [
        "item_flashlight", "item_flashlight_galaxy", "item_flashlight_mega", "item_flashlight_red",
        "item_backpack_with_flashlight", "item_glowstick", "item_lantern_cny", "item_wisplantern", "item_arrow_lightbulb",
        "item_disposable_camera"], prefix: "^item_flashlight" },
      { key: "bubble", name: "bubble and water guns", ids: [
        "item_bubble_gun", "item_bubble_staff", "item_water_gun_blue", "item_water_gun_red", "item_water_supersoaker_blue",
        "item_water_supersoaker_red", "item_water_massive_super_soaker"],
        prefix: "^(?:item_bubble_(?:gun|staff)|item_water_(?:gun|supersoaker|massive_super_soaker))" },
    ],
    stored: [
      { key: "shredder", name: "shredders, packed or loose", ids: ["item_shredder"], prefix: "^item_shredder" },
    ],
  },

  // Never spawned (claude_banned_items.json on A; A's public room also strips them). The voice bot never builds the
  // extra ones either.
  bannedItems: ["item_fish_seamine"],
  voiceBannedItems: ["item_cluster_grenade"],

  // DELIVERY CAPS (owner 2026-10-20/23): a delivery keeps at most these many copies; the rest are left out and the
  // sender is told, never refused. "explosives" counts every explosive together.
  deliveryItemCaps: { item_cluster_grenade: 32, explosives: 64 },

  // VOICE BOT BUILDS (mikeybox_voice_item_caps, 2026-08-24 prefab audit + collider survey; measurements in
  // goop_build_item_data.mjs): a part costs its collider count plus an effect premium; a generated build may cost at
  // most `loadBudget`, and no item may appear more often than its limit.
  voice: {
    generalItemLimit: 64,
    loadBudget: 128,
    rpgLimit: 8,
    unknownColliders: 2,
    costEffects: [
      { match: "^item_(?:box|war)_fan$", add: 8 },
      { match: "^item_(?:rpg|grenade|dynamite)", add: 2 },
      { match: "^item_(?:flamethrower|fish_boomfish)$", add: 4 },
    ],
    // Known room failures: 512 RPGs disconnected the room, fishing rods dropped Fusion, three fan builds drove 86 force
    // RPCs a second, umbrella and camera clusters lost hundreds of children.
    specialItemLimits: {
      item_box_fan: 16, item_war_fan: 16, item_umbrella: 32, item_disposable_camera: 16,
      item_bamboo_fishing_rod: 16, item_basic_fishing_rod: 16, item_glowing_fishing_rod: 16, item_lava_fishing_rod: 16,
      item_radioactive_fishing_rod: 16, item_special_fishing_rod: 16, item_special_fishing_rod_with_radar: 16,
      item_fish_boomfish: 16, item_railgun: 16, item_shotgun: 16, item_shotgun_blood: 16, item_grenade: 16,
      item_grenade_gold: 16, item_grenade_launcher: 16, item_dynamite: 16, item_dynamite_cube: 16,
    },
  },

  // LAG SCORE (the lag census, 2026-10-25/27): every build is scored IN USE by goop_lag_estimate.mjs from the census's
  // measurements (goop_build_lag_data.mjs, generated from goop_lag_scores.json by gen_goop_build_lag_data.py): the
  // observers' frame time, the host's main-thread stall, loaded launchers' stall on every trigger pull, and per-item copy
  // limits where one item alone measured unacceptable (review) or past the refuse levels (refuse), plus the owner's own
  // caps in the table (the flamethrower skull family refused from 256). Thresholds: review below 36 fps or a 1 s stall,
  // refuse below 20 fps or a 2 s stall (a room freeze), loaded launchers 0.5 / 1 s per pull; every real 368-513-part
  // Workshop build measured 23+ fps in use. APPROVED AND ON: owner 2026-10-27, "Yes on all those decisions" (the census's
  // proposal, relayed by the lag census session). `enabled: false` turns it back into a report only (assessment.lag).
  // QUEST 2 RULE (owner 2026-10-31: "refuse under 24fps and warn under 36 for a Quest 2 in a 10-player room"): q2Fps10
  // is a Quest 2 a few metres away in a 10-player room while the build is used (the table's `q2` block, calibrated on the
  // 10-31 Quest 2 observer pass; LAG_CENSUS_REFERENCE.md 5b and 9); review / refuse BELOW these fps. While q2Fps10 is here
  // it replaces the observerFrameMs rule; deleting the q2Fps10 line brings the observers' rule back.
  lagScore: {
    enabled: true,
    thresholds: {
      observerFrameMs: { review: 13.9, refuse: 36.1 },
      hostStallS: { review: 1.0, refuse: 2.0 },
      ammoHostStallSPerPull: { review: 0.5, refuse: 1.0 },
      q2Fps10: { review: 36.0, refuse: 24.0 },
    },
  },

  // SECURITY LEVEL (owner 2026-10-27) for everything we spawn for people: deliveries, A's bridge, the courier and the
  // voice bot (points with `security: "enforce"`). The editor previews it (`security: "preview"`, warnings); Workshop saves
  // are not limited by it. Members of the private code, Discord moderators and the owner bypass it like every rule.
  //   normal  the rules above: the lag census score, the lag screen, the design rules (and the voice bot's own limits)
  //   medium  normal plus the game's own per-item invention limits (maxCountInBlueprint), without its outright refusals
  //   safe    medium plus the rest of what the game's own invention saving machine enforces on stuck parts: at most 32
  //           attached parts besides the root, none of the items it never saves, stuck depth 32. The rules:
  //           VANILLA_INVENTION_MACHINE_RULES.md; the data: goop_build_vanilla_data.mjs.
  // Both count STUCK PARTS ONLY (owner 2026-10-30): what is stored in bags, quivers and launchers or loaded into crossbows,
  // slingshots and other holders is content, any item and any number (glitched items too), and never counts; a build
  // loaded into a holder (a content item with stuck parts of its own) is a separate stuck graph checked on its own.
  securityLevel: "normal",
  securityLevels: {
    normal: [],
    medium: ["vanillaItemCaps"],
    safe: ["vanillaItemCaps", "vanillaRefusedItems", "vanillaAttachedCap", "vanillaStuckDepth"],
  },
  // What a refused person is told when a security-level rule refuses ({level} is the level's name).
  securityRefusal: "This build goes past the game's own invention limits ({reason}), and deliveries follow those limits in {level} mode.",

  // CONTENT (owner 2026-10-28): "every place that requires the central lag check (publishing to workshop, scheduling a
  // delivery either to the prime pad or courier, voice bot spawning things or delivering packages) all need to also run a
  // second check that detects builds that spell racist, profanity, hate speech, or sexually explicit words, or builds that
  // draw inappropriate symbols like swastikas, or that try to depict pornographic images."
  //   contentText  slurs, hate symbols and terms (the swastika characters too), sexual words and curse words in the
  //                build's text: its title, description, tags, document and file names, item text and creator name, what
  //                the voice bot was asked to build and what it would spell. Rules: content_text_rules.mjs (generated from
  //                mikeybox_workshop_web/moderation/content_text_rules.py); screen: content_text_screen.mjs.
  //   contentShape what the build's items spell or draw (owner 2026-10-28: "let's use the detector together with the
  //                vision model"): words spelled out with items, read by the text rules above, and swastikas, in 2D or
  //                built in 3D. No model and no network, so it answers even when the vision check is down; the vision
  //                check below adds sexual shapes and whatever this misses. Screen: content_shape_screen.mjs (item shapes:
  //                content_shape_geometry.mjs, regenerated after each game update's model export). Not run live in the
  //                editor (a big build takes seconds); the editor's Send and Workshop saves are checked where they land.
  // Their own bypass: the owner and Discord moderators (moderation, evidence). Members of the private code bypass the lag
  // rules for their own room, but not these.
  content: { bypass: ["owner", "moderator"] },
  // The seen half (owner 2026-10-28): "an AI may look at the pictures, publishing should wait for that check, and when that
  // check is down no publishing or delivery"; the model is local ("something I could do with a local model"). The owner's
  // PC renders each build from six sides and a local vision model judges it (AC_Menu/mikeybox_content_vision.py); the
  // words it reads in the build go through the text rules above. These points wait for it and refuse when it cannot
  // answer; a Workshop publish waits as a private build until it passes. Same bypass as `content`.
  // OFF until the vision model is installed and measured on the 10-24 audit builds.
  // Measured 10-29 (AC_Menu/CONTENT_VISION_MODEL_VERDICT_20261029.md): the best local model (qwen3-vl-8b on the owner's
  // LEGACY PC) refused 5 of the audit's 13 hides and 7 of 12 synthetic penis shapes; the text rules and contentShape v2
  // (shaft between two balls) refuse 12 of the 13 with no model. The 13th is an uploaded picture. So the model looks at
  // uploaded pictures only (`look: "picture"`, whole and four zoomed quarters), where a publish already waits for it;
  // deliveries do not wait on it. `look: "build"` (with the delivery points) is the 10-28 sheet-and-picture judgment.
  // ON: owner 2026-10-29 ("Yes go ahead"), reopening the sites in safe mode before the lag census's final table.
  contentVisual: {
    enabled: true,
    look: "picture",
    points: ["workshop-publish"],
    // What a refused person is told, by what the model saw (never its own words, which could repeat a slur).
    reasons: { hate: "it shows a hate symbol", sexual: "it shows sexual content", gesture: "it shows an obscene gesture",
      slur: "its items spell words that are not allowed", profanity: "its items spell words that are not allowed",
      "slur/profanity": "its items spell words that are not allowed", other: "it shows something that is not allowed" },
    unavailableRefusal: "The content check is not running right now, so builds can't be published or delivered. Try again later.",
  },

  // CHECK POINTS: which rules each one applies, and what a refused person is told. {reason} is the first finding; a
  // content finding comes first and is told `contentRefusal` (`shapeRefusal` for a contentShape one, when the point has
  // it). The Workers, the Workshop and the editor check the design rules (`structure`) with the game's item data, using
  // the numbers above; the voice bot's builds have no such step, so its points apply them here.
  points: {
    "delivery": { rules: ["contentText", "contentShape", "lagScreen", "lagScore"], trims: true, security: "enforce",
      refusal: "This package would cause too much lag and is not allowed.",
      contentRefusal: "This package can't be delivered: {reason}, which is not allowed." },
    // A private Workshop save; "workshop-publish" is a public or unlisted one (owner 2026-10-24: inappropriate text keeps
    // a build off the public site, and a private save is still allowed; a delivery of it is checked again).
    "workshop-save": { rules: ["lagScreen", "lagScore"],
      refusal: "This build looks like it is made to lag or crash the game ({reason}). Only Discord moderators can save builds like this, even privately." },
    "workshop-publish": { rules: ["contentText", "contentShape", "lagScreen", "lagScore"],
      refusal: "This build looks like it is made to lag or crash the game ({reason}). Only Discord moderators can save builds like this, even privately.",
      contentRefusal: "This build can't be public or unlisted: {reason}, which the Workshop doesn't allow. Change the wording, or save the build as private.",
      shapeRefusal: "This build can't be public or unlisted: {reason}, which the Workshop doesn't allow. Rebuild that part, or save the build as private." },
    "editor": { rules: ["contentText", "lagScreen", "lagScore"], security: "preview",
      refusal: "This build looks like it is made to lag or crash the game ({reason}). The Workshop will not save it and deliveries refuse it; only Discord moderators can.",
      contentRefusal: "This build can't be shared or delivered: {reason}, which is not allowed." },
    "bridge": { rules: ["contentText", "contentShape", "lagScreen", "lagScore"], security: "enforce",
      refusal: "This package would cause too much lag and is not allowed.",
      contentRefusal: "This package can't be delivered: {reason}, which is not allowed." },
    "courier": { rules: ["contentText", "contentShape", "lagScreen", "lagScore"], security: "enforce",
      refusal: "this build would lag the game for everyone, so only members of the private code can receive it",
      contentRefusal: "this build can't be delivered: {reason}, which is not allowed" },
    "voice-generated": { rules: ["contentText", "contentShape", "structure", "bannedItems", "voiceBannedItems", "itemLimits", "loadBudget", "lagScreen", "lagScore"],
      security: "enforce", refusal: "I can't spawn that: {reason}. Ask for a smaller or different build.",
      securityRefusal: "I can't spawn that: {reason}. Ask for a smaller or different build.",
      contentRefusal: "I can't make that: {reason}, which isn't allowed here." },
    "voice-saved": { rules: ["contentText", "contentShape", "structure", "bannedItems", "voiceBannedItems", "rpgLimit", "lagScreen", "lagScore"],
      security: "enforce", refusal: "I can't spawn that: {reason}. Ask for a smaller or different build.",
      securityRefusal: "I can't spawn that: {reason}. Ask for a smaller or different build.",
      contentRefusal: "I can't spawn that: {reason}, which isn't allowed here." },
    "voice-random": { rules: ["contentText", "contentShape", "structure", "bannedItems", "voiceBannedItems", "rpgLimit", "loadBudget", "lagScreen", "lagScore"],
      security: "enforce", refusal: "I can't spawn that: {reason}. Ask for a smaller or different build.",
      securityRefusal: "I can't spawn that: {reason}. Ask for a smaller or different build.",
      contentRefusal: "I can't spawn that: {reason}, which isn't allowed here." },
    "voice-showcase": { rules: ["contentText", "contentShape", "lagScreen", "lagScore"], security: "enforce", refusal: "I can't spawn that: {reason}. Ask for a smaller or different build.",
      securityRefusal: "I can't spawn that: {reason}. Ask for a smaller or different build.",
      contentRefusal: "I can't spawn that: {reason}, which isn't allowed here." },
    // Text the voice bot would spell out with items (name art) and requests it would build, judged before anything is
    // built (contentText only; the build itself is checked at voice-generated).
    "voice-text": { rules: ["contentText"], textOnly: true, refusal: "",
      contentRefusal: "I can't make that: {reason}, which isn't allowed here." },
    // "spawn N <item>": the item's limit and its lag family's cap, as a count clamp (itemSpawnLimit).
    "voice-item": { rules: ["itemLimits", "familyCap"], security: "enforce", refusal: "" },
  },
});

export { ITEM_MEASUREMENTS };
