import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";

// Visible release identification: update this tag for each published site build.
const SITE_VERSION = "ALPHA v0.9.9";
const SITE_BUILD_ID = "2026.11.01-r12";
const UI_PANEL_FONT_SCALE = 1.28;
const UI_BUTTON_FONT_SCALE = 1.22;
// Built-in selectable item catalog. Weapon/hidden entries are excluded;
// item IDs are written into the native-style invention JSON export.
const ITEM_CATALOG = [{"id":"item_ac_cola","name":"AC Cola","category":"Loot"},{"id":"item_alien_cube","name":"Alien Cube","category":"Loot"},{"id":"item_squishy_angler","name":"Angler Toy","category":"Loot"},{"id":"item_apple","name":"Apple","category":"Loot"},{"id":"item_squishy_armstrong","name":"Armstrong Toy","category":"Loot"},{"id":"item_big_cup","name":"Big Cup","category":"Loot"},{"id":"item_squishy_bighead","name":"Big Head Toy","category":"Loot"},{"id":"item_bighead_larva","name":"BigHead Larva","category":"Loot"},{"id":"item_pelican_case","name":"Black Crate","category":"Loot"},{"id":"item_ticket_machine_bulb_blue","name":"Blue Lightbulb","category":"Loot"},{"id":"item_boombox","name":"Boombox","category":"Loot"},{"id":"item_module_boost_1","name":"Boost Module: Tier 1","category":"Loot"},{"id":"item_module_boost_2","name":"Boost Module: Tier 2","category":"Loot"},{"id":"item_module_boost_3","name":"Boost Module: Tier 3","category":"Loot"},{"id":"item_brain_chunk","name":"Brain Matter","category":"Loot"},{"id":"item_server_pad","name":"Broken Tablet","category":"Loot"},{"id":"item_calculator","name":"Calculator","category":"Loot"},{"id":"item_carrot","name":"Carrot","category":"Loot"},{"id":"item_ceo_plaque","name":"CEO Plaque","category":"Loot"},{"id":"item_key_challengearena","name":"Challenge Arena Key","category":"Loot"},{"id":"item_moonrock_cheesy","name":"Cheesy Moon Rock","category":"Loot"},{"id":"item_squishy_chicken","name":"Chicken Toy","category":"Loot"},{"id":"item_ore_hell","name":"Cinder","category":"Loot"},{"id":"item_coconut_shell","name":"Coconut Shell","category":"Loot"},{"id":"item_ore_copper_m","name":"Copper Chunk","category":"Loot"},{"id":"item_cracker","name":"Cracker","category":"Loot"},{"id":"item_crate","name":"Crate","category":"Loot"},{"id":"item_squishy_cutie","name":"Cutie Toy","category":"Loot"},{"id":"item_d20","name":"D20","category":"Loot"},{"id":"item_dna_vial","name":"DNA Vial","category":"Loot"},{"id":"item_disc","name":"DVD","category":"Loot"},{"id":"item_key_factoryboss_easy","name":"Easy Factory Boss Key","category":"Loot"},{"id":"item_electrical_tape","name":"Electrical Tape","category":"Loot"},{"id":"item_toilet_paper_roll_empty","name":"Empty Toilet Paper Roll","category":"Loot"},{"id":"item_harddrive","name":"Encrypted Data","category":"Loot"},{"id":"item_eraser","name":"Eraser","category":"Loot"},{"id":"item_finger_board","name":"Finger Board","category":"Loot"},{"id":"item_special_fishing_rod_radar_part","name":"Fishing Rod Radar Part","category":"Loot"},{"id":"item_fishing_terminal_bait_button","name":"Fishing Terminal Bait Button","category":"Loot"},{"id":"item_floppy3","name":"Floppy Disc","category":"Loot"},{"id":"item_floppy5","name":"Floppy Disc","category":"Loot"},{"id":"item_gameboy","name":"Game Box","category":"Loot"},{"id":"item_squishy_giantthrower","name":"Giant Toy","category":"Loot"},{"id":"item_glitched_banana","name":"Glitchy Banana","category":"Loot"},{"id":"item_squishy_gold_angler","name":"Gold Angler Toy","category":"Loot"},{"id":"item_squishy_gold_armstrong","name":"Gold Armstrong Toy","category":"Loot"},{"id":"item_squishy_gold_bighead","name":"Gold Big Head Toy","category":"Loot"},{"id":"item_squishy_gold_chicken","name":"Gold Chicken Toy","category":"Loot"},{"id":"item_ore_gold_m","name":"Gold Chunk","category":"Loot"},{"id":"item_squishy_gold_cutie","name":"Gold Cutie Toy","category":"Loot"},{"id":"item_squishy_gold_giantthrower","name":"Gold Giant Toy","category":"Loot"},{"id":"item_squishy_gold_puppet","name":"Gold Puppet Toy","category":"Loot"},{"id":"item_squishy_gold_redgreen","name":"Gold Red Green Toy","category":"Loot"},{"id":"item_squishy_gold_segway","name":"Gold Segway Toy","category":"Loot"},{"id":"item_squishy_gold_smiley","name":"Gold Smiley Toy","category":"Loot"},{"id":"item_goldcoin","name":"Golden Coin","category":"Loot"},{"id":"item_goopfish","name":"Goopfish","category":"Loot"},{"id":"item_quest_key_graveyard","name":"Graveyard Key","category":"Loot"},{"id":"item_module_gravity_1","name":"Gravity Module","category":"Loot"},{"id":"item_key_factoryboss_hard","name":"Hard Factory Boss Key","category":"Loot"},{"id":"item_heartchocolatebox","name":"Heart Chocolate Box","category":"Loot"},{"id":"item_heart_chunk","name":"Heart Chunk","category":"Loot"},{"id":"item_module_hull_2","name":"Hull Module: Tier 2","category":"Loot"},{"id":"item_module_hull_3","name":"Hull Module: Tier 3","category":"Loot"},{"id":"item_shadowboss_key","name":"Key of the Fallen One","category":"Loot"},{"id":"item_keycard","name":"Keycard","category":"Loot"},{"id":"item_ore_copper_l","name":"Large Copper Chunk","category":"Loot"},{"id":"item_ore_gold_l","name":"Large Gold Chunk","category":"Loot"},{"id":"item_ore_silver_l","name":"Large Silver Chunk","category":"Loot"},{"id":"item_key_factoryboss_medium","name":"Medium Factory Boss Key","category":"Loot"},{"id":"item_toilet_paper_mega","name":"Mega Toilet Paper","category":"Loot"},{"id":"item_randombox_modules","name":"Module Loot Box","category":"Loot"},{"id":"item_momboss_box","name":"Mom Box","category":"Loot"},{"id":"item_moonrock","name":"Moon Rock","category":"Loot"},{"id":"item_mug","name":"Mug","category":"Loot"},{"id":"item_boombox_neon","name":"Neon Boombox","category":"Loot"},{"id":"item_nut","name":"Nut","category":"Loot"},{"id":"item_nut_drop","name":"Nut Drop","category":"Loot"},{"id":"item_orange","name":"Orange","category":"Loot"},{"id":"item_ticket_machine_bulb_orange","name":"Orange Lightbulb","category":"Loot"},{"id":"item_painters_tape","name":"Painters Tape","category":"Loot"},{"id":"item_painting_canvas","name":"Painting Canvas","category":"Loot"},{"id":"item_paperpack","name":"Paper","category":"Loot"},{"id":"item_pipe","name":"Pipe","category":"Loot"},{"id":"item_pumpkin_pie","name":"Pumpkin Pie","category":"Loot"},{"id":"item_squishy_puppet","name":"Puppet Toy","category":"Loot"},{"id":"item_rare_card","name":"Rare Trading Card","category":"Loot"},{"id":"item_flashlight_red","name":"Red Flashlight","category":"Loot"},{"id":"item_squishy_redgreen","name":"Red Green Toy","category":"Loot"},{"id":"item_rubberducky","name":"Rubber Ducky","category":"Loot"},{"id":"item_ruby","name":"Ruby","category":"Loot"},{"id":"item_scissors","name":"Scissors","category":"Loot"},{"id":"item_squishy_segway","name":"Segway Toy","category":"Loot"},{"id":"item_ore_silver_m","name":"Silver Chunk","category":"Loot"},{"id":"item_ore_copper_s","name":"Small Copper Chunk","category":"Loot"},{"id":"item_ore_gold_s","name":"Small Gold Chunk","category":"Loot"},{"id":"item_ore_silver_s","name":"Small Silver Chunk","category":"Loot"},{"id":"item_squishy_smiley","name":"Smiley Toy","category":"Loot"},{"id":"item_stapler","name":"Stapler","category":"Loot"},{"id":"item_tapedispenser","name":"Tape Dispenser","category":"Loot"},{"id":"item_toilet_paper","name":"Toilet Paper","category":"Loot"},{"id":"item_token_circus","name":"Token","category":"Loot"},{"id":"item_module_tractor_beam_1","name":"Tractor Beam Module","category":"Loot"},{"id":"item_train_whistle","name":"Train Whistle","category":"Loot"},{"id":"item_trophy","name":"Trophy","category":"Loot"},{"id":"item_turkey_leg","name":"Turkey Leg","category":"Loot"},{"id":"item_turkey_whole","name":"Turkey Whole","category":"Loot"},{"id":"item_upsidedown_loot","name":"Upsidedown Loot","category":"Loot"},{"id":"item_broom_halloween","name":"Wicked Broom","category":"Loot"},{"id":"item_wood_log","name":"Wood Log","category":"Loot"},{"id":"item_wooden_stool","name":"Wooden Stool","category":"Loot"},{"id":"item_ticket_machine_bulb_yellow","name":"Yellow Lightbulb","category":"Loot"},{"id":"item_alchemist_book","name":"Alchemist Book","category":"Toys"},{"id":"item_midipad_animal","name":"Audio Zoo 9000","category":"Toys"},{"id":"item_backrooms_floor","name":"Backrooms Carpet","category":"Toys"},{"id":"item_backrooms_ceiling","name":"Backrooms Ceiling Tiles","category":"Toys"},{"id":"item_backrooms_chair","name":"Backrooms Chair","category":"Toys"},{"id":"item_backrooms_corner_in","name":"Backrooms Inner Corner","category":"Toys"},{"id":"item_backrooms_lamp","name":"Backrooms Lamp","category":"Toys"},{"id":"item_backrooms_corner_out","name":"Backrooms Outer Corner","category":"Toys"},{"id":"item_backrooms_pillar","name":"Backrooms Pillar","category":"Toys"},{"id":"item_backrooms_wall_1m","name":"Backrooms Wall 1m","category":"Toys"},{"id":"item_backrooms_wall_2m","name":"Backrooms Wall 2m","category":"Toys"},{"id":"item_balloon","name":"Balloon","category":"Toys"},{"id":"item_clapper","name":"Clapper","category":"Toys"},{"id":"item_boombox_fishing","name":"Fishing Boombox","category":"Toys"},{"id":"item_football","name":"Football","category":"Toys"},{"id":"item_ghostie_racket","name":"Ghostie Racket","category":"Toys"},{"id":"item_ukulele_gold","name":"Golden Ukulele","category":"Toys"},{"id":"item_hawaiian_drum","name":"Hawaiian Drums","category":"Toys"},{"id":"item_balloon_heart","name":"Heart Balloon","category":"Toys"},{"id":"item_module_hull_1","name":"Hull Module: Tier 1","category":"Toys"},{"id":"item_megaphone","name":"Megaphone","category":"Toys"},{"id":"item_moonrock_friend","name":"Pet Moon Rock","category":"Toys"},{"id":"item_pogostick","name":"Pogostick","category":"Toys"},{"id":"item_repair_wrench","name":"Repair Wrench","category":"Toys"},{"id":"item_safe","name":"Safe","category":"Toys"},{"id":"item_skipole","name":"Ski Pole","category":"Toys"},{"id":"item_balloon_smiley","name":"Smiley Balloon","category":"Toys"},{"id":"item_soccer_ball","name":"Soccer Ball","category":"Toys"},{"id":"item_soccer_goalposts","name":"Soccer Goal Posts","category":"Toys"},{"id":"item_midipad","name":"Song-o-Matic 2000","category":"Toys"},{"id":"item_module_stasis_1","name":"Stasis Module","category":"Toys"},{"id":"item_stopwatch","name":"Stopwatch","category":"Toys"},{"id":"item_theremin","name":"Theremin","category":"Toys"},{"id":"item_ukulele","name":"Ukulele","category":"Toys"},{"id":"item_halloween_voodoodoll","name":"Voodoo Doll","category":"Toys"},{"id":"item_vuvuzela","name":"Vuvuzela","category":"Toys"},{"id":"item_whoopie","name":"Whoopie","category":"Toys"},{"id":"item_egg_easter_blue","name":"Blue Bunny Egg","category":"Construction"},{"id":"item_halloween_bone_hand","name":"Bone Hand","category":"Construction"},{"id":"item_steampunk_lamp","name":"Brass Lamp","category":"Construction"},{"id":"item_steampunk_wings","name":"Brass Wings","category":"Construction"},{"id":"item_halloween_brick_column","name":"Brick Column","category":"Construction"},{"id":"item_metal_rod_xmas","name":"Candy Cane Rod","category":"Construction"},{"id":"item_truss_xmas","name":"Candy Cane Truss","category":"Construction"},{"id":"item_castle_archway","name":"Castle Archway","category":"Construction"},{"id":"item_castle_awning","name":"Castle Awning","category":"Construction"},{"id":"item_castle_door","name":"Castle Door","category":"Construction"},{"id":"item_castle_roof_topper","name":"Castle Roof Topper","category":"Construction"},{"id":"item_castle_steps","name":"Castle Steps","category":"Construction"},{"id":"item_castle_tower","name":"Castle Tower","category":"Construction"},{"id":"item_castle_turret_topper","name":"Castle Turret Topper","category":"Construction"},{"id":"item_castle_wall","name":"Castle Wall","category":"Construction"},{"id":"item_halloween_ceiling_light","name":"Ceiling Lamp","category":"Construction"},{"id":"item_halloween_fence_arch","name":"Cemetery Arch","category":"Construction"},{"id":"item_halloween_chandelier","name":"Chandelier","category":"Construction"},{"id":"item_halloween_coffin","name":"Coffin","category":"Construction"},{"id":"item_steampunk_gear_big","name":"Cog (Large)","category":"Construction"},{"id":"item_steampunk_gear_small","name":"Cog (Small)","category":"Construction"},{"id":"item_halloween_ceiling","name":"Creaky Ceiling","category":"Construction"},{"id":"item_halloween_door","name":"Creaky Door","category":"Construction"},{"id":"item_halloween_floor","name":"Creaky Floorboards","category":"Construction"},{"id":"item_halloween_chicken","name":"Creepy Chicken","category":"Construction"},{"id":"item_halloween_crypt_lock","name":"Crypt Lock","category":"Construction"},{"id":"item_cube_frame","name":"Cube Frame","category":"Construction"},{"id":"item_metal_rod_curved","name":"Curved Metal Rod","category":"Construction"},{"id":"item_halloween_couch","name":"Dusty Couch","category":"Construction"},{"id":"item_metal_plate_xmas","name":"Festive Plate","category":"Construction"},{"id":"item_steampunk_lightbulb","name":"Filament Bulb","category":"Construction"},{"id":"item_halloween_fireplace","name":"Fireplace","category":"Construction"},{"id":"item_robot_arm_left_galaxy","name":"Galaxy Left Robot Arm","category":"Construction"},{"id":"item_robot_arm_right_galaxy","name":"Galaxy Right Robot Arm","category":"Construction"},{"id":"item_steampunk_gear_wheels","name":"Geared Wheels","category":"Construction"},{"id":"item_halloween_web","name":"Giant Cobweb","category":"Construction"},{"id":"item_steel_beam_xmas","name":"Gingerbread Beam","category":"Construction"},{"id":"item_eye_googly","name":"Googly Eye","category":"Construction"},{"id":"item_goop","name":"Goop","category":"Construction"},{"id":"item_halloween_doorway","name":"Haunted Doorway","category":"Construction"},{"id":"item_halloween_staircase","name":"Haunted Staircase","category":"Construction"},{"id":"item_halloween_wall","name":"Haunted Wall","category":"Construction"},{"id":"item_castle_archway_ice","name":"Ice Castle Archway","category":"Construction"},{"id":"item_castle_awning_ice","name":"Ice Castle Awning","category":"Construction"},{"id":"item_castle_door_ice","name":"Ice Castle Door","category":"Construction"},{"id":"item_castle_roof_topper_ice","name":"Ice Castle Roof Topper","category":"Construction"},{"id":"item_castle_steps_ice","name":"Ice Castle Steps","category":"Construction"},{"id":"item_castle_throne_ice","name":"Ice Castle Throne","category":"Construction"},{"id":"item_castle_tower_ice","name":"Ice Castle Tower","category":"Construction"},{"id":"item_castle_turret_topper_ice","name":"Ice Castle Turret Topper","category":"Construction"},{"id":"item_castle_wall_ice","name":"Ice Castle Wall","category":"Construction"},{"id":"item_steampunk_scaffolding","name":"Iron Scaffolding","category":"Construction"},{"id":"item_joystick","name":"Joystick","category":"Construction"},{"id":"item_joystick_inv_y","name":"Joystick (Inversed Y)","category":"Construction"},{"id":"item_robot_arm_left","name":"Left Robot Arm","category":"Construction"},{"id":"item_mannequin_head","name":"Mannequin Head","category":"Construction"},{"id":"item_mannequin_arm_left","name":"Mannequin Left Arm","category":"Construction"},{"id":"item_mannequin_leg_left","name":"Mannequin Left Leg","category":"Construction"},{"id":"item_mannequin_arm_right","name":"Mannequin Right Arm","category":"Construction"},{"id":"item_mannequin_leg_right","name":"Mannequin Right Leg","category":"Construction"},{"id":"item_mannequin_torso","name":"Mannequin Torso","category":"Construction"},{"id":"item_metal_ball","name":"Metal Ball","category":"Construction"},{"id":"item_metal_plate","name":"Metal Plate","category":"Construction"},{"id":"item_metal_rod","name":"Metal Rod","category":"Construction"},{"id":"item_metal_triangle","name":"Metal Triangle","category":"Construction"},{"id":"item_halloween_pillow","name":"Musty Pillow","category":"Construction"},{"id":"item_halloween_dresser","name":"Old Dresser","category":"Construction"},{"id":"item_steampunk_gear_open_big","name":"Open Cog (Large)","category":"Construction"},{"id":"item_steampunk_gear_open_small","name":"Open Cog (Small)","category":"Construction"},{"id":"item_metal_ball_xmas","name":"Peppermint Ball","category":"Construction"},{"id":"item_plank","name":"Plank","category":"Construction"},{"id":"item_wood_pallet_easter","name":"Polka Dot Pallet","category":"Construction"},{"id":"item_plank_easter","name":"Polka Dot Plank","category":"Construction"},{"id":"item_truss_easter","name":"Polka Dot Truss","category":"Construction"},{"id":"item_egg_easter_red","name":"Red Bunny Egg","category":"Construction"},{"id":"item_steampunk_redgreen_hand","name":"RedGreen Hand","category":"Construction"},{"id":"item_remote_controller","name":"Remote Controller","category":"Construction"},{"id":"item_robot_arm_right","name":"Right Robot Arm","category":"Construction"},{"id":"item_robot_head","name":"Robot Head","category":"Construction"},{"id":"item_plate_round","name":"Round Plate","category":"Construction"},{"id":"item_metal_plate_small","name":"Small Metal Plate","category":"Construction"},{"id":"item_metal_rod_small","name":"Small Metal Rod","category":"Construction"},{"id":"item_truss_small","name":"Small Truss","category":"Construction"},{"id":"item_steampunk_smokestack","name":"Smokestack","category":"Construction"},{"id":"item_steampunk_gear_spikes_big","name":"Spiked Cog (Large)","category":"Construction"},{"id":"item_steampunk_gear_spikes_small","name":"Spiked Cog (Small)","category":"Construction"},{"id":"item_halloween_fence","name":"Spiked Fence","category":"Construction"},{"id":"item_halloween_tree","name":"Spooky Tree","category":"Construction"},{"id":"item_pennant_spring","name":"Spring Pennants","category":"Construction"},{"id":"item_steampunk_clip","name":"Steampunk Clip","category":"Construction"},{"id":"item_steel_beam","name":"Steel Beam","category":"Construction"},{"id":"item_steampunk_coils_big","name":"Tesla Coil (Large)","category":"Construction"},{"id":"item_steampunk_coils_small","name":"Tesla Coil (Small)","category":"Construction"},{"id":"item_halloween_tomb","name":"Tomb","category":"Construction"},{"id":"item_halloween_tombstone","name":"Tombstone","category":"Construction"},{"id":"item_halloween_tombstone_tall","name":"Tombstone (Tall)","category":"Construction"},{"id":"item_truss","name":"Truss","category":"Construction"},{"id":"item_halloween_wall_light","name":"Wall Sconce","category":"Construction"},{"id":"item_wood_pallet","name":"Wood Pallet","category":"Construction"},{"id":"item_egg_easter_yellow","name":"Yellow Bunny Egg","category":"Construction"},{"id":"item_snowboard_2","name":"67 Snowboard","category":"Bags & Gadgets"},{"id":"item_snowboard","name":"AC Snowboard","category":"Bags & Gadgets"},{"id":"item_backpack_space","name":"Astronaut Backpack","category":"Bags & Gadgets"},{"id":"item_backpack","name":"Backpack","category":"Bags & Gadgets"},{"id":"item_backpack_bankrobber","name":"Bank Robber backpack","category":"Bags & Gadgets"},{"id":"item_film_boom_mic","name":"Boom Mic","category":"Bags & Gadgets"},{"id":"item_box_fan","name":"Box Fan","category":"Bags & Gadgets"},{"id":"item_broom","name":"Broom","category":"Bags & Gadgets"},{"id":"item_cardboard_box","name":"Cardboard Box","category":"Bags & Gadgets"},{"id":"item_cardboard_dragon_body","name":"Cardboard Dragon Body","category":"Bags & Gadgets"},{"id":"item_cardboard_dragon_head","name":"Cardboard Dragon Head","category":"Bags & Gadgets"},{"id":"item_grappling_hook","name":"Chain Grab","category":"Bags & Gadgets"},{"id":"item_fish_clam_hookshot","name":"Clam Hookshot","category":"Bags & Gadgets"},{"id":"item_umbrella_clover","name":"Clover Umbrella","category":"Bags & Gadgets"},{"id":"item_film_directors_tablet","name":"Directors Tablet","category":"Bags & Gadgets"},{"id":"item_disposable_camera","name":"Disposable Camera","category":"Bags & Gadgets"},{"id":"item_film_camera","name":"Film Camera","category":"Bags & Gadgets"},{"id":"item_film_light","name":"Film Light","category":"Bags & Gadgets"},{"id":"item_film_filter_brighten","name":"Filter Brighten","category":"Bags & Gadgets"},{"id":"item_film_filter_crisp","name":"Filter Crisp","category":"Bags & Gadgets"},{"id":"item_film_filter_darken","name":"Filter Darken","category":"Bags & Gadgets"},{"id":"item_film_filter_dreamy","name":"Filter Dreamy","category":"Bags & Gadgets"},{"id":"item_film_filter_grain","name":"Filter Grain","category":"Bags & Gadgets"},{"id":"item_film_filter_noir","name":"Filter Noir","category":"Bags & Gadgets"},{"id":"item_backpack_fish","name":"Fish Backpack","category":"Bags & Gadgets"},{"id":"item_snowboard_3","name":"Flaming Eye Snowboard","category":"Bags & Gadgets"},{"id":"item_flashlight","name":"Flashlight","category":"Bags & Gadgets"},{"id":"item_backpack_frog","name":"Frog Backpack","category":"Bags & Gadgets"},{"id":"item_flashlight_galaxy","name":"Galaxy Flashlight","category":"Bags & Gadgets"},{"id":"item_hookshot_galaxy","name":"Galaxy Hookshot","category":"Bags & Gadgets"},{"id":"item_hoverpad_galaxy","name":"Galaxy Hoverpad","category":"Bags & Gadgets"},{"id":"item_snowboard_galaxy","name":"Galaxy Snowboard","category":"Bags & Gadgets"},{"id":"item_film_gel_blue","name":"Gel Blue","category":"Bags & Gadgets"},{"id":"item_film_gel_green","name":"Gel Green","category":"Bags & Gadgets"},{"id":"item_film_gel_red","name":"Gel Red","category":"Bags & Gadgets"},{"id":"item_glowstick","name":"Glowstick","category":"Bags & Gadgets"},{"id":"item_backpack_gold","name":"Gold Backpack","category":"Bags & Gadgets"},{"id":"item_hookshot_gold","name":"Gold Hookshot","category":"Bags & Gadgets"},{"id":"item_quiver_heart","name":"Heart Quiver","category":"Bags & Gadgets"},{"id":"item_hermes_staff","name":"Hermes Staff","category":"Bags & Gadgets"},{"id":"item_hookshot","name":"Hookshot","category":"Bags & Gadgets"},{"id":"item_hoverpad","name":"Hoverpad","category":"Bags & Gadgets"},{"id":"item_film_interview_mic","name":"Interview Mic","category":"Bags & Gadgets"},{"id":"item_jetpack","name":"Jetpack","category":"Bags & Gadgets"},{"id":"item_lantern_cny","name":"Lantern","category":"Bags & Gadgets"},{"id":"item_backpack_large_base","name":"Large Backpack","category":"Bags & Gadgets"},{"id":"item_backpack_large_basketball","name":"Large Basketball Print Backpack","category":"Bags & Gadgets"},{"id":"item_backpack_large_clover","name":"Large Clover Print Backpack","category":"Bags & Gadgets"},{"id":"item_flashlight_mega","name":"Mega Flashlight","category":"Bags & Gadgets"},{"id":"item_backpack_monkey","name":"Monkey Backpack","category":"Bags & Gadgets"},{"id":"item_shredder","name":"Nut Shredder","category":"Bags & Gadgets"},{"id":"item_hoverboard_pink","name":"Pink Hoverboard","category":"Bags & Gadgets"},{"id":"item_plunger","name":"Plunger","category":"Bags & Gadgets"},{"id":"item_portable_safe_zone","name":"Portable Safe Zone","category":"Bags & Gadgets"},{"id":"item_portable_teleporter","name":"Portable Teleporter","category":"Bags & Gadgets"},{"id":"item_prop_scanner","name":"Prop Scanner","category":"Bags & Gadgets"},{"id":"item_hoverboard","name":"Purple Hoverboard","category":"Bags & Gadgets"},{"id":"item_quiver","name":"Quiver","category":"Bags & Gadgets"},{"id":"item_ring_buoy","name":"Ring Buoy","category":"Bags & Gadgets"},{"id":"item_robo_dino","name":"RoboDino5000","category":"Bags & Gadgets"},{"id":"item_robo_monke","name":"RoboMonke2000","category":"Bags & Gadgets"},{"id":"item_saddle","name":"Saddle","category":"Bags & Gadgets"},{"id":"item_backpack_santasack","name":"Santa Sack","category":"Bags & Gadgets"},{"id":"item_skishoe","name":"Ski Shoe (Blue)","category":"Bags & Gadgets"},{"id":"item_skishoe_2","name":"Ski Shoe (Green)","category":"Bags & Gadgets"},{"id":"item_skishoe_3","name":"Ski Shoe (Red)","category":"Bags & Gadgets"},{"id":"item_skishoe_4","name":"Ski Shoe (Yellow)","category":"Bags & Gadgets"},{"id":"item_hoverboard_sky","name":"Sky Hoverboard","category":"Bags & Gadgets"},{"id":"item_backpack_small_base","name":"Small Backpack","category":"Bags & Gadgets"},{"id":"item_snowboard_4","name":"Snow Snowboard","category":"Bags & Gadgets"},{"id":"item_snowboard_auto","name":"Special Snowboard","category":"Bags & Gadgets"},{"id":"item_umbrella_squirrel","name":"Squirrel Umbrella","category":"Bags & Gadgets"},{"id":"item_sticker_dispenser","name":"Sticker Dispenser","category":"Bags & Gadgets"},{"id":"item_tablet","name":"Tablet","category":"Bags & Gadgets"},{"id":"item_tele_pearl","name":"Tele Pearl","category":"Bags & Gadgets"},{"id":"item_trampoline","name":"Trampoline","category":"Bags & Gadgets"},{"id":"item_film_tripod","name":"Tripod","category":"Bags & Gadgets"},{"id":"item_umbrella","name":"Umbrella","category":"Bags & Gadgets"},{"id":"item_wisplantern","name":"Wisp Lantern","category":"Bags & Gadgets"},{"id":"item_fish_redacted","name":"[REDACTED]","category":"Fishing"},{"id":"item_fish_anglerfish","name":"Anglerfish","category":"Fishing"},{"id":"item_bamboo_fishing_rod","name":"Bamboo Fishing Rod","category":"Fishing"},{"id":"item_basic_fishing_rod","name":"Basic Fishing Rod","category":"Fishing"},{"id":"item_bait_beetle","name":"Beetle","category":"Fishing"},{"id":"item_fish_big_shark","name":"Big Shark","category":"Fishing"},{"id":"item_fish_boomfish","name":"Boomfish","category":"Fishing"},{"id":"item_fish_boot","name":"Boot","category":"Fishing"},{"id":"item_fish_bottled_message","name":"Bottled Message","category":"Fishing"},{"id":"item_fish_carp","name":"Carp","category":"Fishing"},{"id":"item_fish_chewna","name":"Chewna","category":"Fishing"},{"id":"item_fish_cowfish","name":"Cowfish","category":"Fishing"},{"id":"item_fish_crappie","name":"Crappie","category":"Fishing"},{"id":"item_fish_crispie","name":"Crispie","category":"Fishing"},{"id":"item_fish_cube","name":"Cursed Cubefish","category":"Fishing"},{"id":"item_fish_diamond_jade_koi","name":"Diamond Jade Koi","category":"Fishing"},{"id":"item_fish_dollar_bill","name":"Dollar Bill","category":"Fishing"},{"id":"item_fish_dragonfish","name":"Dragon Fish","category":"Fishing"},{"id":"item_bait_fly","name":"Fly","category":"Fishing"},{"id":"item_bait_glowworm","name":"Glow Worm","category":"Fishing"},{"id":"item_fish_gold_fish","name":"Gold Fish","category":"Fishing"},{"id":"item_fish_hydracarp","name":"Hydracarp","category":"Fishing"},{"id":"item_fish_irontusk","name":"Irontusk","category":"Fishing"},{"id":"item_fish_kissy","name":"Kissy","category":"Fishing"},{"id":"item_lava_fishing_rod","name":"Lava Fishing Rod","category":"Fishing"},{"id":"item_fish_license_plate","name":"License Plate","category":"Fishing"},{"id":"item_fish_magma_carp","name":"Magma Carp","category":"Fishing"},{"id":"item_bait_magmar_ball","name":"Magmar Ball","category":"Fishing"},{"id":"item_fish_teeth","name":"Meateating Spiritfish","category":"Fishing"},{"id":"item_bait_mouse_trap","name":"Mouse Trap","category":"Fishing"},{"id":"item_fish_nebula_fish","name":"Nebula","category":"Fishing"},{"id":"item_glowing_fishing_rod","name":"Neon Fishing Rod","category":"Fishing"},{"id":"item_fish_nutfish","name":"Nutfish","category":"Fishing"},{"id":"item_fish_pufferfish","name":"Pufferfish","category":"Fishing"},{"id":"item_fish_rotten_fish","name":"Rotten Fish","category":"Fishing"},{"id":"item_fish_salmon","name":"Salmon","category":"Fishing"},{"id":"item_fish_salmonster","name":"Salmonster","category":"Fishing"},{"id":"item_bait_sardine","name":"Sardine","category":"Fishing"},{"id":"item_fish_scaldfish","name":"Scaldfish","category":"Fishing"},{"id":"item_fish_seahorse","name":"Seahorse","category":"Fishing"},{"id":"item_bait_shell","name":"Shell","category":"Fishing"},{"id":"item_special_fishing_rod","name":"Special Fishing Rod","category":"Fishing"},{"id":"item_fish_spicy_salmon","name":"Spicy Salmon","category":"Fishing"},{"id":"item_bait_starfish","name":"Starfish","category":"Fishing"},{"id":"item_fish_triclops","name":"Triclops","category":"Fishing"},{"id":"item_fish_tuna","name":"Tuna","category":"Fishing"},{"id":"item_bait_wallet","name":"Wallet","category":"Fishing"},{"id":"item_fish_yellowcake","name":"Yellowcake","category":"Fishing"},{"id":"item_banana_chips","name":"Banana Chips","category":"Consumables"},{"id":"item_fungi_blue","name":"Blue Shroom","category":"Consumables"},{"id":"item_burrito","name":"Burrito","category":"Consumables"},{"id":"item_beans","name":"Can of Beans","category":"Consumables"},{"id":"item_company_ration","name":"Company Ration","category":"Consumables"},{"id":"item_company_ration_heal","name":"Company Ration","category":"Consumables"},{"id":"item_hot_cocoa","name":"Hot Chocolate","category":"Consumables"},{"id":"item_shrinking_broccoli","name":"Micro Broccoli","category":"Consumables"},{"id":"item_pineapple","name":"Pineapple","category":"Consumables"},{"id":"item_prune_juice","name":"Prune Juice","category":"Consumables"},{"id":"item_fungi_red","name":"Red Shroom","category":"Consumables"},{"id":"item_stinky_cheese","name":"Stinky Cheese","category":"Consumables"}];
const ITEM_CATEGORIES = ["Loot", "Toys", "Construction", "Bags & Gadgets", "Fishing", "Consumables"];
const ITEM_PAGE_SIZE = 8;
const UNSUPPORTED_ITEM_ID_PATTERN = /weapon|gun|pistol|rifle|shotgun|grenade|bomb|blade|sword|knife|knives|axe|arrow|ammo|bullet|cannon|launcher|spear|bow|crossbow|mine|explosive|rocket|dart|shank|machete|katana|harpoon|flamethrower|blaster|missile|blood|corpse|dead|gore|skull|blast|laser|joust|lance|murder|zombie|radiation|radioactive|uranium|toxic|poison/i;
const ITEM_CATALOG_BY_ID = new Map(ITEM_CATALOG.map((entry) => [entry.id, entry]));

// User-supplied, authorized GLB assets already uploaded to the repository's
// /models folder. Safe props are mapped here; weapon-like assets are not loaded.
const MODEL_ASSETS = new Map([
  ["item_ac_cola", "item_ac_cola.glb"],
  ["item_alchemist_book", "item_alchemist_book.glb"],
  ["item_alien_cube", "item_alien_cube.glb"],
  ["item_apple", "item_apple.glb"],
  ["item_backpack", "item_backpack.glb"],
  ["item_backpack_bankrobber", "item_backpack_bankrobber.glb"],
  ["item_backpack_fish", "item_backpack_fish.glb"],
  ["item_backpack_frog", "item_backpack_frog.glb"],
  ["item_backpack_gold", "item_backpack_gold.glb"],
  ["item_backpack_large_base", "item_backpack_large_base.glb"],
  ["item_backpack_large_basketball", "item_backpack_large_basketball.glb"],
  ["item_backpack_large_clover", "item_backpack_large_clover.glb"],
  ["item_backpack_monkey", "item_backpack_monkey.glb"],
  ["item_backpack_santasack", "item_backpack_santasack.glb"],
  ["item_backpack_small_base", "item_backpack_small_base.glb"],
  ["item_backpack_space", "item_backpack_space.glb"],
  ["item_backrooms_ceiling", "item_backrooms_ceiling.glb"],
  ["item_backrooms_chair", "item_backrooms_chair.glb"],
  ["item_backrooms_corner_in", "item_backrooms_corner_in.glb"],
  ["item_backrooms_corner_out", "item_backrooms_corner_out.glb"],
  ["item_backrooms_floor", "item_backrooms_floor.glb"],
  ["item_backrooms_lamp", "item_backrooms_lamp.glb"],
  ["item_backrooms_pillar", "item_backrooms_pillar.glb"],
  ["item_backrooms_wall_1m", "item_backrooms_wall_1m.glb"],
  ["item_backrooms_wall_2m", "item_backrooms_wall_2m.glb"],
  ["item_bait_beetle", "item_bait_beetle.glb"],
  ["item_bait_fly", "item_bait_fly.glb"],
  ["item_bait_glowworm", "item_bait_glowworm.glb"],
  ["item_bait_magmar_ball", "item_bait_magmar_ball.glb"],
  ["item_bait_mouse_trap", "item_bait_mouse_trap.glb"],
  ["item_bait_sardine", "item_bait_sardine.glb"],
  ["item_bait_shell", "item_bait_shell.glb"],
  ["item_bait_starfish", "item_bait_starfish.glb"],
  ["item_bait_wallet", "item_bait_wallet.glb"],
  ["item_balloon", "item_balloon.glb"],
  ["item_balloon_heart", "item_balloon_heart.glb"],
  ["item_balloon_smiley", "item_balloon_smiley.glb"],
  ["item_bamboo_fishing_rod", "item_bamboo_fishing_rod.glb"],
  ["item_banana_chips", "item_banana_chips.glb"],
  ["item_basic_fishing_rod", "item_basic_fishing_rod.glb"],
  ["item_beans", "item_beans.glb"],
  ["item_big_cup", "item_big_cup.glb"],
  ["item_bighead_larva", "item_bighead_larva.glb"],
  ["item_boombox", "item_boombox.glb"],
  ["item_boombox_fishing", "item_boombox_fishing.glb"],
  ["item_boombox_neon", "item_boombox_neon.glb"],
  ["item_box_fan", "item_box_fan.glb"],
  ["item_brain_chunk", "item_brain_chunk.glb"],
  ["item_broom", "item_broom.glb"],
  ["item_broom_halloween", "item_broom_halloween.glb"],
  ["item_burrito", "item_burrito.glb"],
  ["item_calculator", "item_calculator.glb"],
  ["item_cardboard_box", "item_cardboard_box.glb"],
  ["item_cardboard_dragon_body", "item_cardboard_dragon_body.glb"],
  ["item_cardboard_dragon_head", "item_cardboard_dragon_head.glb"],
  ["item_carrot", "item_carrot.glb"],
  ["item_castle_archway", "item_castle_archway.glb"],
  ["item_castle_archway_ice", "item_castle_archway_ice.glb"],
  ["item_castle_awning", "item_castle_awning.glb"],
  ["item_castle_awning_ice", "item_castle_awning_ice.glb"],
  ["item_castle_door", "item_castle_door.glb"],
  ["item_castle_door_ice", "item_castle_door_ice.glb"],
  ["item_castle_roof_topper", "item_castle_roof_topper.glb"],
  ["item_castle_roof_topper_ice", "item_castle_roof_topper_ice.glb"],
  ["item_castle_steps", "item_castle_steps.glb"],
  ["item_castle_steps_ice", "item_castle_steps_ice.glb"],
  ["item_castle_throne_ice", "item_castle_throne_ice.glb"],
  ["item_castle_tower", "item_castle_tower.glb"],
  ["item_castle_tower_ice", "item_castle_tower_ice.glb"],
  ["item_castle_turret_topper", "item_castle_turret_topper.glb"],
  ["item_castle_turret_topper_ice", "item_castle_turret_topper_ice.glb"],
  ["item_castle_wall", "item_castle_wall.glb"],
  ["item_castle_wall_ice", "item_castle_wall_ice.glb"],
  ["item_ceo_plaque", "item_ceo_plaque.glb"],
  ["item_clapper", "item_clapper.glb"],
  ["item_coconut_shell", "item_coconut_shell.glb"],
  ["item_company_ration", "item_company_ration.glb"],
  ["item_company_ration_heal", "item_company_ration_heal.glb"],
  ["item_cracker", "item_cracker.glb"],
  ["item_crate", "item_crate.glb"],
  ["item_cube_frame", "item_cube_frame.glb"],
  ["item_d20", "item_d20.glb"],
  ["item_disc", "item_disc.glb"],
  ["item_disposable_camera", "item_disposable_camera.glb"],
  ["item_dna_vial", "item_dna_vial.glb"],
  ["item_egg_easter_blue", "item_egg_easter_blue.glb"],
  ["item_egg_easter_red", "item_egg_easter_red.glb"],
  ["item_egg_easter_yellow", "item_egg_easter_yellow.glb"],
  ["item_electrical_tape", "item_electrical_tape.glb"],
  ["item_eraser", "item_eraser.glb"],
  ["item_eye_googly", "item_eye_googly.glb"],
  ["item_film_boom_mic", "item_film_boom_mic.glb"],
  ["item_film_camera", "item_film_camera.glb"],
  ["item_film_directors_tablet", "item_film_directors_tablet.glb"],
  ["item_film_filter_brighten", "item_film_filter_brighten.glb"],
  ["item_film_filter_crisp", "item_film_filter_crisp.glb"],
  ["item_film_filter_darken", "item_film_filter_darken.glb"],
  ["item_film_filter_dreamy", "item_film_filter_dreamy.glb"],
  ["item_film_filter_grain", "item_film_filter_grain.glb"],
  ["item_film_filter_noir", "item_film_filter_noir.glb"],
  ["item_film_gel_blue", "item_film_gel_blue.glb"],
  ["item_film_gel_green", "item_film_gel_green.glb"],
  ["item_film_gel_red", "item_film_gel_red.glb"],
  ["item_film_interview_mic", "item_film_interview_mic.glb"],
  ["item_film_light", "item_film_light.glb"],
  ["item_film_tripod", "item_film_tripod.glb"],
  ["item_finger_board", "item_finger_board.glb"],
  ["item_fish_anglerfish", "item_fish_anglerfish.glb"],
  ["item_fish_big_shark", "item_fish_big_shark.glb"],
  ["item_fish_boomfish", "item_fish_boomfish.glb"],
  ["item_fish_boot", "item_fish_boot.glb"],
  ["item_fish_bottled_message", "item_fish_bottled_message.glb"],
  ["item_fish_carp", "item_fish_carp.glb"],
  ["item_fish_chewna", "item_fish_chewna.glb"],
  ["item_fish_clam_hookshot", "item_fish_clam_hookshot.glb"],
  ["item_fish_cowfish", "item_fish_cowfish.glb"],
  ["item_fish_crappie", "item_fish_crappie.glb"],
  ["item_fish_crispie", "item_fish_crispie.glb"],
  ["item_fish_cube", "item_fish_cube.glb"],
  ["item_fish_diamond_jade_koi", "item_fish_diamond_jade_koi.glb"],
  ["item_fish_dollar_bill", "item_fish_dollar_bill.glb"],
  ["item_fish_dragonfish", "item_fish_dragonfish.glb"],
  ["item_fish_gold_fish", "item_fish_gold_fish.glb"],
  ["item_fish_hydracarp", "item_fish_hydracarp.glb"],
  ["item_fish_irontusk", "item_fish_irontusk.glb"],
  ["item_fish_kissy", "item_fish_kissy.glb"],
  ["item_fish_license_plate", "item_fish_license_plate.glb"],
  ["item_fish_magma_carp", "item_fish_magma_carp.glb"],
  ["item_fish_nebula_fish", "item_fish_nebula_fish.glb"],
  ["item_fish_nutfish", "item_fish_nutfish.glb"],
  ["item_fish_pufferfish", "item_fish_pufferfish.glb"],
  ["item_fish_redacted", "item_fish_redacted.glb"],
  ["item_fish_rotten_fish", "item_fish_rotten_fish.glb"],
  ["item_fish_salmon", "item_fish_salmon.glb"],
  ["item_fish_salmonster", "item_fish_salmonster.glb"],
  ["item_fish_scaldfish", "item_fish_scaldfish.glb"],
  ["item_fish_seahorse", "item_fish_seahorse.glb"],
  ["item_fish_spicy_salmon", "item_fish_spicy_salmon.glb"],
  ["item_fish_teeth", "item_fish_teeth.glb"],
  ["item_fish_triclops", "item_fish_triclops.glb"],
  ["item_fish_tuna", "item_fish_tuna.glb"],
  ["item_fish_yellowcake", "item_fish_yellowcake.glb"],
  ["item_fishing_terminal_bait_button", "item_fishing_terminal_bait_button.glb"],
  ["item_flashlight", "item_flashlight.glb"],
  ["item_flashlight_galaxy", "item_flashlight_galaxy.glb"],
  ["item_flashlight_mega", "item_flashlight_mega.glb"],
  ["item_flashlight_red", "item_flashlight_red.glb"],
  ["item_floppy3", "item_floppy3.glb"],
  ["item_floppy5", "item_floppy5.glb"],
  ["item_football", "item_football.glb"],
  ["item_fungi_blue", "item_fungi_blue.glb"],
  ["item_fungi_red", "item_fungi_red.glb"],
  ["item_gameboy", "item_gameboy.glb"],
  ["item_ghostie_racket", "item_ghostie_racket.glb"],
  ["item_glitched_banana", "item_glitched_banana.glb"],
  ["item_glowing_fishing_rod", "item_glowing_fishing_rod.glb"],
  ["item_glowstick", "item_glowstick.glb"],
  ["item_goldcoin", "item_goldcoin.glb"],
  ["item_goop", "item_goop.glb"],
  ["item_goopfish", "item_goopfish.glb"],
  ["item_grappling_hook", "item_grappling_hook.glb"],
  ["item_halloween_bone_hand", "item_halloween_bone_hand.glb"],
  ["item_halloween_brick_column", "item_halloween_brick_column.glb"],
  ["item_halloween_ceiling", "item_halloween_ceiling.glb"],
  ["item_halloween_ceiling_light", "item_halloween_ceiling_light.glb"],
  ["item_halloween_chandelier", "item_halloween_chandelier.glb"],
  ["item_halloween_chicken", "item_halloween_chicken.glb"],
  ["item_halloween_coffin", "item_halloween_coffin.glb"],
  ["item_halloween_couch", "item_halloween_couch.glb"],
  ["item_halloween_crypt_lock", "item_halloween_crypt_lock.glb"],
  ["item_halloween_door", "item_halloween_door.glb"],
  ["item_halloween_doorway", "item_halloween_doorway.glb"],
  ["item_halloween_dresser", "item_halloween_dresser.glb"],
  ["item_halloween_fence", "item_halloween_fence.glb"],
  ["item_halloween_fence_arch", "item_halloween_fence_arch.glb"],
  ["item_halloween_fireplace", "item_halloween_fireplace.glb"],
  ["item_halloween_floor", "item_halloween_floor.glb"],
  ["item_halloween_pillow", "item_halloween_pillow.glb"],
  ["item_halloween_staircase", "item_halloween_staircase.glb"],
  ["item_halloween_tomb", "item_halloween_tomb.glb"],
  ["item_halloween_tombstone", "item_halloween_tombstone.glb"],
  ["item_halloween_tombstone_tall", "item_halloween_tombstone_tall.glb"],
  ["item_halloween_tree", "item_halloween_tree.glb"],
  ["item_halloween_voodoodoll", "item_halloween_voodoodoll.glb"],
  ["item_halloween_wall", "item_halloween_wall.glb"],
  ["item_halloween_wall_light", "item_halloween_wall_light.glb"],
  ["item_halloween_web", "item_halloween_web.glb"],
  ["item_harddrive", "item_harddrive.glb"],
  ["item_hawaiian_drum", "item_hawaiian_drum.glb"],
  ["item_heart_chunk", "item_heart_chunk.glb"],
  ["item_heartchocolatebox", "item_heartchocolatebox.glb"],
  ["item_hermes_staff", "item_hermes_staff.glb"],
  ["item_hookshot", "item_hookshot.glb"],
  ["item_hookshot_galaxy", "item_hookshot_galaxy.glb"],
  ["item_hookshot_gold", "item_hookshot_gold.glb"],
  ["item_hot_cocoa", "item_hot_cocoa.glb"],
  ["item_hoverboard", "item_hoverboard.glb"],
  ["item_hoverboard_pink", "item_hoverboard_pink.glb"],
  ["item_hoverboard_sky", "item_hoverboard_sky.glb"],
  ["item_hoverpad", "item_hoverpad.glb"],
  ["item_hoverpad_galaxy", "item_hoverpad_galaxy.glb"],
  ["item_jetpack", "item_jetpack.glb"],
  ["item_joystick", "item_joystick.glb"],
  ["item_joystick_inv_y", "item_joystick_inv_y.glb"],
  ["item_key_challengearena", "item_key_challengearena.glb"],
  ["item_key_factoryboss_easy", "item_key_factoryboss_easy.glb"],
  ["item_key_factoryboss_hard", "item_key_factoryboss_hard.glb"],
  ["item_key_factoryboss_medium", "item_key_factoryboss_medium.glb"],
  ["item_keycard", "item_keycard.glb"],
  ["item_lantern_cny", "item_lantern_cny.glb"],
  ["item_lava_fishing_rod", "item_lava_fishing_rod.glb"],
  ["item_mannequin_arm_left", "item_mannequin_arm_left.glb"],
  ["item_mannequin_arm_right", "item_mannequin_arm_right.glb"],
  ["item_mannequin_head", "item_mannequin_head.glb"],
  ["item_mannequin_leg_left", "item_mannequin_leg_left.glb"],
  ["item_mannequin_leg_right", "item_mannequin_leg_right.glb"],
  ["item_mannequin_torso", "item_mannequin_torso.glb"],
  ["item_megaphone", "item_megaphone.glb"],
  ["item_metal_ball", "item_metal_ball.glb"],
  ["item_metal_ball_xmas", "item_metal_ball_xmas.glb"],
  ["item_metal_plate", "item_metal_plate.glb"],
  ["item_metal_plate_small", "item_metal_plate_small.glb"],
  ["item_metal_plate_xmas", "item_metal_plate_xmas.glb"],
  ["item_metal_rod", "item_metal_rod.glb"],
  ["item_metal_rod_curved", "item_metal_rod_curved.glb"],
  ["item_metal_rod_small", "item_metal_rod_small.glb"],
  ["item_metal_rod_xmas", "item_metal_rod_xmas.glb"],
  ["item_metal_triangle", "item_metal_triangle.glb"],
  ["item_midipad", "item_midipad.glb"],
  ["item_midipad_animal", "item_midipad_animal.glb"],
  ["item_module_boost_1", "item_module_boost_1.glb"],
  ["item_module_boost_2", "item_module_boost_2.glb"],
  ["item_module_boost_3", "item_module_boost_3.glb"],
  ["item_module_gravity_1", "item_module_gravity_1.glb"],
  ["item_module_hull_1", "item_module_hull_1.glb"],
  ["item_module_hull_2", "item_module_hull_2.glb"],
  ["item_module_hull_3", "item_module_hull_3.glb"],
  ["item_module_stasis_1", "item_module_stasis_1.glb"],
  ["item_module_tractor_beam_1", "item_module_tractor_beam_1.glb"],
  ["item_momboss_box", "item_momboss_box.glb"],
  ["item_moonrock", "item_moonrock.glb"],
  ["item_moonrock_cheesy", "item_moonrock_cheesy.glb"],
  ["item_moonrock_friend", "item_moonrock_friend.glb"],
  ["item_mug", "item_mug.glb"],
  ["item_nut", "item_nut.glb"],
  ["item_nut_drop", "item_nut_drop.glb"],
  ["item_orange", "item_orange.glb"],
  ["item_ore_copper_l", "item_ore_copper_l.glb"],
  ["item_ore_copper_m", "item_ore_copper_m.glb"],
  ["item_ore_copper_s", "item_ore_copper_s.glb"],
  ["item_ore_gold_l", "item_ore_gold_l.glb"],
  ["item_ore_gold_m", "item_ore_gold_m.glb"],
  ["item_ore_gold_s", "item_ore_gold_s.glb"],
  ["item_ore_hell", "item_ore_hell.glb"],
  ["item_ore_silver_l", "item_ore_silver_l.glb"],
  ["item_ore_silver_m", "item_ore_silver_m.glb"],
  ["item_ore_silver_s", "item_ore_silver_s.glb"],
  ["item_painters_tape", "item_painters_tape.glb"],
  ["item_painting_canvas", "item_painting_canvas.glb"],
  ["item_paperpack", "item_paperpack.glb"],
  ["item_pelican_case", "item_pelican_case.glb"],
  ["item_pennant_spring", "item_pennant_spring.glb"],
  ["item_pineapple", "item_pineapple.glb"],
  ["item_pipe", "item_pipe.glb"],
  ["item_plank", "item_plank.glb"],
  ["item_plank_easter", "item_plank_easter.glb"],
  ["item_plate_round", "item_plate_round.glb"],
  ["item_plunger", "item_plunger.glb"],
  ["item_pogostick", "item_pogostick.glb"],
  ["item_portable_safe_zone", "item_portable_safe_zone.glb"],
  ["item_portable_teleporter", "item_portable_teleporter.glb"],
  ["item_prop_scanner", "item_prop_scanner.glb"],
  ["item_prune_juice", "item_prune_juice.glb"],
  ["item_pumpkin_pie", "item_pumpkin_pie.glb"],
  ["item_quest_key_graveyard", "item_quest_key_graveyard.glb"],
  ["item_quiver", "item_quiver.glb"],
  ["item_quiver_heart", "item_quiver_heart.glb"],
  ["item_randombox_modules", "item_randombox_modules.glb"],
  ["item_rare_card", "item_rare_card.glb"],
  ["item_remote_controller", "item_remote_controller.glb"],
  ["item_repair_wrench", "item_repair_wrench.glb"],
  ["item_ring_buoy", "item_ring_buoy.glb"],
  ["item_robo_dino", "item_robo_dino.glb"],
  ["item_robo_monke", "item_robo_monke.glb"],
  ["item_robot_arm_left", "item_robot_arm_left.glb"],
  ["item_robot_arm_left_galaxy", "item_robot_arm_left_galaxy.glb"],
  ["item_robot_arm_right", "item_robot_arm_right.glb"],
  ["item_robot_arm_right_galaxy", "item_robot_arm_right_galaxy.glb"],
  ["item_robot_head", "item_robot_head.glb"],
  ["item_rubberducky", "item_rubberducky.glb"],
  ["item_ruby", "item_ruby.glb"],
  ["item_saddle", "item_saddle.glb"],
  ["item_safe", "item_safe.glb"],
  ["item_scissors", "item_scissors.glb"],
  ["item_server_pad", "item_server_pad.glb"],
  ["item_shadowboss_key", "item_shadowboss_key.glb"],
  ["item_shredder", "item_shredder.glb"],
  ["item_shrinking_broccoli", "item_shrinking_broccoli.glb"],
  ["item_skipole", "item_skipole.glb"],
  ["item_skishoe", "item_skishoe.glb"],
  ["item_skishoe_2", "item_skishoe_2.glb"],
  ["item_skishoe_3", "item_skishoe_3.glb"],
  ["item_skishoe_4", "item_skishoe_4.glb"],
  ["item_snowboard", "item_snowboard.glb"],
  ["item_snowboard_2", "item_snowboard_2.glb"],
  ["item_snowboard_3", "item_snowboard_3.glb"],
  ["item_snowboard_4", "item_snowboard_4.glb"],
  ["item_snowboard_auto", "item_snowboard_auto.glb"],
  ["item_snowboard_galaxy", "item_snowboard_galaxy.glb"],
  ["item_soccer_ball", "item_soccer_ball.glb"],
  ["item_soccer_goalposts", "item_soccer_goalposts.glb"],
  ["item_special_fishing_rod", "item_special_fishing_rod.glb"],
  ["item_special_fishing_rod_radar_part", "item_special_fishing_rod_radar_part.glb"],
  ["item_squishy_angler", "item_squishy_angler.glb"],
  ["item_squishy_armstrong", "item_squishy_armstrong.glb"],
  ["item_squishy_bighead", "item_squishy_bighead.glb"],
  ["item_squishy_chicken", "item_squishy_chicken.glb"],
  ["item_squishy_cutie", "item_squishy_cutie.glb"],
  ["item_squishy_giantthrower", "item_squishy_giantthrower.glb"],
  ["item_squishy_gold_angler", "item_squishy_gold_angler.glb"],
  ["item_squishy_gold_armstrong", "item_squishy_gold_armstrong.glb"],
  ["item_squishy_gold_bighead", "item_squishy_gold_bighead.glb"],
  ["item_squishy_gold_chicken", "item_squishy_gold_chicken.glb"],
  ["item_squishy_gold_cutie", "item_squishy_gold_cutie.glb"],
  ["item_squishy_gold_giantthrower", "item_squishy_gold_giantthrower.glb"],
  ["item_squishy_gold_puppet", "item_squishy_gold_puppet.glb"],
  ["item_squishy_gold_redgreen", "item_squishy_gold_redgreen.glb"],
  ["item_squishy_gold_segway", "item_squishy_gold_segway.glb"],
  ["item_squishy_gold_smiley", "item_squishy_gold_smiley.glb"],
  ["item_squishy_puppet", "item_squishy_puppet.glb"],
  ["item_squishy_redgreen", "item_squishy_redgreen.glb"],
  ["item_squishy_segway", "item_squishy_segway.glb"],
  ["item_squishy_smiley", "item_squishy_smiley.glb"],
  ["item_stapler", "item_stapler.glb"],
  ["item_steampunk_clip", "item_steampunk_clip.glb"],
  ["item_steampunk_coils_big", "item_steampunk_coils_big.glb"],
  ["item_steampunk_coils_small", "item_steampunk_coils_small.glb"],
  ["item_steampunk_gear_big", "item_steampunk_gear_big.glb"],
  ["item_steampunk_gear_open_big", "item_steampunk_gear_open_big.glb"],
  ["item_steampunk_gear_open_small", "item_steampunk_gear_open_small.glb"],
  ["item_steampunk_gear_small", "item_steampunk_gear_small.glb"],
  ["item_steampunk_gear_spikes_big", "item_steampunk_gear_spikes_big.glb"],
  ["item_steampunk_gear_spikes_small", "item_steampunk_gear_spikes_small.glb"],
  ["item_steampunk_gear_wheels", "item_steampunk_gear_wheels.glb"],
  ["item_steampunk_lamp", "item_steampunk_lamp.glb"],
  ["item_steampunk_lightbulb", "item_steampunk_lightbulb.glb"],
  ["item_steampunk_redgreen_hand", "item_steampunk_redgreen_hand.glb"],
  ["item_steampunk_scaffolding", "item_steampunk_scaffolding.glb"],
  ["item_steampunk_smokestack", "item_steampunk_smokestack.glb"],
  ["item_steampunk_wings", "item_steampunk_wings.glb"],
  ["item_steel_beam", "item_steel_beam.glb"],
  ["item_steel_beam_xmas", "item_steel_beam_xmas.glb"],
  ["item_sticker_dispenser", "item_sticker_dispenser.glb"],
  ["item_stinky_cheese", "item_stinky_cheese.glb"],
  ["item_stopwatch", "item_stopwatch.glb"],
  ["item_tablet", "item_tablet.glb"],
  ["item_tapedispenser", "item_tapedispenser.glb"],
  ["item_tele_pearl", "item_tele_pearl.glb"],
  ["item_theremin", "item_theremin.glb"],
  ["item_ticket_machine_bulb_blue", "item_ticket_machine_bulb_blue.glb"],
  ["item_ticket_machine_bulb_orange", "item_ticket_machine_bulb_orange.glb"],
  ["item_ticket_machine_bulb_yellow", "item_ticket_machine_bulb_yellow.glb"],
  ["item_toilet_paper", "item_toilet_paper.glb"],
  ["item_toilet_paper_mega", "item_toilet_paper_mega.glb"],
  ["item_toilet_paper_roll_empty", "item_toilet_paper_roll_empty.glb"],
  ["item_token_circus", "item_token_circus.glb"],
  ["item_train_whistle", "item_train_whistle.glb"],
  ["item_trampoline", "item_trampoline.glb"],
  ["item_trophy", "item_trophy.glb"],
  ["item_truss", "item_truss.glb"],
  ["item_truss_easter", "item_truss_easter.glb"],
  ["item_truss_small", "item_truss_small.glb"],
  ["item_truss_xmas", "item_truss_xmas.glb"],
  ["item_turkey_leg", "item_turkey_leg.glb"],
  ["item_turkey_whole", "item_turkey_whole.glb"],
  ["item_ukulele", "item_ukulele.glb"],
  ["item_ukulele_gold", "item_ukulele_gold.glb"],
  ["item_umbrella", "item_umbrella.glb"],
  ["item_umbrella_clover", "item_umbrella_clover.glb"],
  ["item_umbrella_squirrel", "item_umbrella_squirrel.glb"],
  ["item_upsidedown_loot", "item_upsidedown_loot.glb"],
  ["item_vuvuzela", "item_vuvuzela.glb"],
  ["item_whoopie", "item_whoopie.glb"],
  ["item_wisplantern", "item_wisplantern.glb"],
  ["item_wood_log", "item_wood_log.glb"],
  ["item_wood_pallet", "item_wood_pallet.glb"],
  ["item_wood_pallet_easter", "item_wood_pallet_easter.glb"],
  ["item_wooden_stool", "item_wooden_stool.glb"]
]);
const gltfLoader = new GLTFLoader();
gltfLoader.setCrossOrigin("anonymous");
const gltfAssetPromises = new Map();
const modelLoadStates = new Map();
const MODEL_FOLDER_URL = new URL("./models/", import.meta.url);
function getModelUrl(itemID) {
  const filename = MODEL_ASSETS.get(itemID);
  return filename ? new URL(encodeURIComponent(filename), MODEL_FOLDER_URL).href : null;
}
async function loadModelTemplate(itemID) {
  const url = getModelUrl(itemID);
  if (!url) return null;
  if (!gltfAssetPromises.has(itemID)) {
    const filename = MODEL_ASSETS.get(itemID);
    modelLoadStates.set(itemID, { state: "loading", filename, url });
    const promise = (async () => {
      // Fetch first so GitHub Pages 404s and non-GLB responses are reported
      // clearly instead of being hidden inside GLTFLoader's XHR error.
      const response = await fetch(url, { cache: "no-store", mode: "same-origin" });
      if (!response.ok) throw new Error(`HTTP ${response.status} while requesting ${url}`);
      const buffer = await response.arrayBuffer();
      if (buffer.byteLength < 20) throw new Error(`File is too small to be a valid GLB (${buffer.byteLength} bytes).`);
      const magic = new DataView(buffer).getUint32(0, true);
      if (magic !== 0x46546c67) throw new Error("The URL returned a file that is not binary glTF (GLB). Check that GitHub Pages is serving the .glb file, not an HTML page.");
      const gltf = await gltfLoader.parseAsync(buffer, MODEL_FOLDER_URL.href);
      if (!gltf.scene) throw new Error("The GLB parsed but did not contain a default scene.");
      modelLoadStates.set(itemID, { state: "loaded", filename, url, bytes: buffer.byteLength });
      return gltf.scene;
    })().catch((error) => {
      modelLoadStates.set(itemID, { state: "error", filename, url, error: String(error?.message || error) });
      gltfAssetPromises.delete(itemID);
      throw error;
    });
    gltfAssetPromises.set(itemID, promise);
  }
  return gltfAssetPromises.get(itemID);
}

const $ = (id) => document.getElementById(id);
const scene = new THREE.Scene();
const worldGroup = new THREE.Group();
scene.add(worldGroup);
// Everything that represents the environment lives under worldGroup, so
// player-scale gestures enlarge/shrink the floor, sky, measured grid and walls
// together with the build instead of leaving a fixed-looking backdrop.
const environmentGroup = new THREE.Group();
worldGroup.add(environmentGroup);
scene.background = new THREE.Color(0x9bb3c2);
// A real sky mesh is more reliable than scene.background in immersive WebXR.
// The distant environment grids below provide visible scale references against it.
const sky = new THREE.Mesh(
  new THREE.SphereGeometry(72, 40, 28),
  new THREE.MeshBasicMaterial({ color: 0x91b6cc, side: THREE.BackSide, depthWrite: false })
);
sky.renderOrder = -100;
environmentGroup.add(sky);

const camera = new THREE.PerspectiveCamera(65, innerWidth / innerHeight, 0.01, 100);
camera.position.set(0, 1.65, 2.4);
const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.NoToneMapping;
renderer.setClearColor(0x9bb3c2, 1);
renderer.xr.enabled = true;
renderer.xr.setReferenceSpaceType("local-floor");
document.body.appendChild(renderer.domElement);

worldGroup.add(new THREE.HemisphereLight(0xffffff, 0x52606b, 2.1));
const sun = new THREE.DirectionalLight(0xffffff, 2.0);
sun.position.set(4, 8, 5);
worldGroup.add(sun);
const FLOOR_SIZE = 32;
const FLOOR_HALF = FLOOR_SIZE / 2;
const floor = new THREE.Mesh(
  new THREE.PlaneGeometry(FLOOR_SIZE, FLOOR_SIZE),
  new THREE.MeshBasicMaterial({ color: 0x657a83 })
);
floor.rotation.x = -Math.PI / 2;
floor.position.y = -0.03;
environmentGroup.add(floor);
// A precise 32 × 32 meter floor with one-meter cells (32 divisions).
// The floor plane, grid, and bright boundary share exact bounds: -16 to +16 on X and Z.
const grid = new THREE.GridHelper(FLOOR_SIZE, FLOOR_SIZE, 0x526a73, 0x71858c);
grid.position.y = -0.015;
environmentGroup.add(grid);
// A bright perimeter makes the 32 × 32 floor boundary unmistakable.
const floorBoundary = new THREE.LineSegments(
  new THREE.EdgesGeometry(new THREE.PlaneGeometry(FLOOR_SIZE, FLOOR_SIZE)),
  new THREE.LineBasicMaterial({ color: 0xc8e7dc, transparent: true, opacity: 0.95, depthWrite: false })
);
floorBoundary.rotation.x = -Math.PI / 2;
floorBoundary.position.y = -0.004;
environmentGroup.add(floorBoundary);

// Four floor rings and distant vertical measurement grids make the size of
// the workspace legible even when the user has scaled far from 1:1.
for (const radius of [3, 6, 9, 12, 16]) {
  const ring = new THREE.Mesh(
    new THREE.RingGeometry(radius - 0.018, radius + 0.018, 128),
    new THREE.MeshBasicMaterial({ color: radius % 6 === 0 ? 0x9bd6cb : 0x7895a0, transparent: true, opacity: 0.48, side: THREE.DoubleSide, depthWrite: false })
  );
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = -0.008;
  environmentGroup.add(ring);
}
function makeBackdropGrid(width, height, spacing = 1, majorEvery = 5) {
  const group = new THREE.Group();
  const minorPoints = [];
  const majorPoints = [];
  const addLine = (target, x1, y1, x2, y2) => {
    target.push(new THREE.Vector3(x1, y1, 0), new THREE.Vector3(x2, y2, 0));
  };
  const epsilon = 1e-5;
  for (let x = -width / 2; x <= width / 2 + epsilon; x += spacing) {
    const target = Math.abs(x / majorEvery - Math.round(x / majorEvery)) < epsilon ? majorPoints : minorPoints;
    addLine(target, x, -height / 2, x, height / 2);
  }
  for (let y = -height / 2; y <= height / 2 + epsilon; y += spacing) {
    const target = Math.abs(y / majorEvery - Math.round(y / majorEvery)) < epsilon ? majorPoints : minorPoints;
    addLine(target, -width / 2, y, width / 2, y);
  }
  const minorGeometry = new THREE.BufferGeometry().setFromPoints(minorPoints);
  const majorGeometry = new THREE.BufferGeometry().setFromPoints(majorPoints);
  group.add(new THREE.LineSegments(minorGeometry, new THREE.LineBasicMaterial({ color: 0x526d79, transparent: true, opacity: 0.24, depthWrite: false })));
  group.add(new THREE.LineSegments(majorGeometry, new THREE.LineBasicMaterial({ color: 0x9bc3c9, transparent: true, opacity: 0.48, depthWrite: false })));
  const frame = new THREE.LineSegments(
    new THREE.EdgesGeometry(new THREE.PlaneGeometry(width, height)),
    new THREE.LineBasicMaterial({ color: 0xb5d8d8, transparent: true, opacity: 0.64, depthWrite: false })
  );
  group.add(frame);
  return group;
}
const backGrid = makeBackdropGrid(FLOOR_SIZE, 16, 1, 5);
backGrid.position.set(0, 8, -FLOOR_HALF);
environmentGroup.add(backGrid);
const frontGrid = makeBackdropGrid(FLOOR_SIZE, 16, 1, 5);
frontGrid.rotation.y = Math.PI;
frontGrid.position.set(0, 8, FLOOR_HALF);
environmentGroup.add(frontGrid);
const leftGrid = makeBackdropGrid(FLOOR_SIZE, 16, 1, 5);
leftGrid.rotation.y = Math.PI / 2;
leftGrid.position.set(-FLOOR_HALF, 8, 0);
environmentGroup.add(leftGrid);
const rightGrid = makeBackdropGrid(FLOOR_SIZE, 16, 1, 5);
rightGrid.rotation.y = -Math.PI / 2;
rightGrid.position.set(FLOOR_HALF, 8, 0);
environmentGroup.add(rightGrid);

const rootGroup = new THREE.Group();
worldGroup.add(rootGroup);
let nodes = [];
let selected = null;
const undoHistory = [];
const redoHistory = [];
const HISTORY_LIMIT = 60;
// Right-controller B toggles the transform gizmo without changing selection.
let gizmoEnabled = true;
let rightBWasPressed = false;
let nextId = 1;
let pendingItemID = "item_crate";
let itemCatalogOpen = false;
let itemCatalogCategoryIndex = 0;
let itemCatalogPage = 0;
let hierarchyOpen = false;
let hierarchyListMode = "parents";
let hierarchyPage = 0;
let catalogAddAsChild = false;
let keyboardTarget = "selected";
let keyboardDraft = "item_crate";
let keyboardOpen = false;
let snapSettingsOpen = false;
let snapValueKeyboardOpen = false;
let snapValueTarget = "position";
let snapValueDraft = "0.1";
const snapConfig = {
  positionEnabled: false,
  rotationEnabled: false,
  positionStep: 0.1,       // world units (meters)
  rotationStepDegrees: 15 // degrees
};
let statusText = "Enter VR. Select a part, then use its XYZ arrows and rotation circles.";
let statusTextMesh = null;
let audioContext = null;
let audioLoadPromise = null;
const audioBuffers = Object.create(null);
// Hover audio is edge-triggered with a short dwell debounce. XR hand rays can
// jitter between a button and empty space every frame; using the action key
// (instead of mesh identity) prevents repeated sounds from tiny tracking noise.
let hoverCandidateAction = null;
let hoverCandidateSince = 0;
let lastHoverActionPlayed = null;
let lastHoverSfxTime = 0;
const HOVER_DWELL_MS = 115;
const HOVER_EXIT_RESET_MS = 170;
const HOVER_GLOBAL_COOLDOWN_MS = 260;
let handHoveringAvailable = false;
let panelReady = false;
let menuVisible = true;
let menuPoseInitialized = false;
let leftHandGrip = null;
let leftHandMenuActive = false;
const controllerRecords = [];
let leftXWasPressed = false;
// Player locomotion: left stick walks/strafe relative to headset direction;
// right stick snaps the player's facing direction in 30-degree steps. Two
// controller grips scale and reposition the whole workspace in 3D unless an
// actual item is already held; in that case they scale the held item.
const joystickConfig = { moveSpeed: 1.65, verticalSpeed: 1.35, deadzone: 0.18, turnStepDegrees: 30, turnThreshold: 0.68, turnReleaseThreshold: 0.25 };
const joystickState = { turnArmed: true };
const dragStates = new Map();
let twoHandScaleState = null;
let scaleGestureNeedsRelease = false;
const handPinchStates = new Map();
const handDragStates = new Map();
const handPoseProxies = new Map();
const handJointMaps = new Map();
const handVisuals = new Map();
const raycaster = new THREE.Raycaster();
const uiButtons = [];
const tempMatrix = new THREE.Matrix4();
const tempMatrix2 = new THREE.Matrix4();
const tempVector = new THREE.Vector3();
const tempQuaternion = new THREE.Quaternion();
const tempScale = new THREE.Vector3();

// Camera-facing feedback makes the two-hand scale gesture obvious. The HUD is
// outside worldGroup, so it remains a stable size while the environment scales.
const scaleFeedbackCanvas = document.createElement("canvas");
scaleFeedbackCanvas.width = 768;
scaleFeedbackCanvas.height = 192;
const scaleFeedbackContext = scaleFeedbackCanvas.getContext("2d");
const scaleFeedbackTexture = new THREE.CanvasTexture(scaleFeedbackCanvas);
scaleFeedbackTexture.colorSpace = THREE.SRGBColorSpace;
const scaleFeedback = new THREE.Group();
const scaleFeedbackPanel = new THREE.Mesh(
  new THREE.PlaneGeometry(0.92, 0.23),
  new THREE.MeshBasicMaterial({ map: scaleFeedbackTexture, transparent: true, depthTest: false, depthWrite: false, toneMapped: false })
);
scaleFeedbackPanel.renderOrder = 1000;
scaleFeedback.add(scaleFeedbackPanel);
scaleFeedback.renderOrder = 1000;
scaleFeedback.visible = false;
scene.add(scaleFeedback);
let scaleFeedbackUntil = 0;
let lastScaleFeedbackKey = "";
function drawScaleFeedback(kind, value, active = true) {
  const safeValue = THREE.MathUtils.clamp(Number(value) || 1, 0.01, 100);
  const key = `${kind}:${safeValue.toFixed(3)}:${active ? "active" : "done"}`;
  if (key !== lastScaleFeedbackKey) {
    lastScaleFeedbackKey = key;
    const ctx = scaleFeedbackContext;
    ctx.clearRect(0, 0, 768, 192);
    ctx.fillStyle = "rgba(8, 20, 29, 0.94)";
    ctx.fillRect(4, 4, 760, 184);
    const isPlayerScale = kind === "PLAYER";
    ctx.strokeStyle = isPlayerScale ? "#75dcc8" : "#a8c9ff";
    ctx.lineWidth = 7;
    ctx.strokeRect(7, 7, 754, 178);
    ctx.fillStyle = "#f5fbff";
    ctx.font = "bold 42px system-ui, sans-serif";
    ctx.textAlign = "left";
    ctx.fillText(isPlayerScale ? "PLAYER SIZE" : "HELD ITEM SCALE", 34, 66);
    ctx.textAlign = "right";
    ctx.font = "bold 54px system-ui, sans-serif";
    ctx.fillText(`${safeValue.toFixed(2)}×`, 730, 70);
    ctx.fillStyle = "rgba(210, 229, 237, 0.22)";
    ctx.fillRect(34, 112, 696, 30);
    const normalized = THREE.MathUtils.clamp((Math.log(safeValue / 0.25) / Math.log(4 / 0.25)), 0, 1);
    ctx.fillStyle = isPlayerScale ? "#75dcc8" : "#a8c9ff";
    ctx.fillRect(34, 112, Math.max(10, 696 * normalized), 30);
    ctx.fillStyle = "#bfd0d9";
    ctx.textAlign = "left";
    ctx.font = isPlayerScale ? "21px system-ui, sans-serif" : "24px system-ui, sans-serif";
    const hint = active
      ? (isPlayerScale
          ? "PULL APART = GROW  ·  BRING TOGETHER = SHRINK  ·  MOVE BOTH HANDS = MOVE PLAYER IN XYZ"
          : "PULL APART TO GROW  ·  BRING TOGETHER TO SHRINK")
      : "SCALE SET  ·  RELEASE BOTH GRIPS";
    ctx.fillText(hint, 34, 169);
    scaleFeedbackTexture.needsUpdate = true;
  }
  scaleFeedback.visible = true;
  scaleFeedbackUntil = performance.now() + (active ? 700 : 1500);
}
function updateScaleFeedbackPose() {
  if (!scaleFeedback.visible) return;
  if (!renderer.xr.isPresenting) {
    scaleFeedback.visible = false;
    return;
  }
  if (!twoHandScaleState && performance.now() > scaleFeedbackUntil) {
    scaleFeedback.visible = false;
    return;
  }
  const xrCamera = renderer.xr.getCamera(camera);
  const forward = xrCamera.getWorldDirection(new THREE.Vector3());
  const viewerPosition = xrCamera.getWorldPosition(new THREE.Vector3());
  scaleFeedback.position.copy(viewerPosition).addScaledVector(forward, 1.05).add(new THREE.Vector3(0, -0.22, 0));
  scaleFeedback.quaternion.copy(xrCamera.getWorldQuaternion(new THREE.Quaternion()));
}

const panel = new THREE.Group();
panel.visible = false;
panel.scale.setScalar(0.32);
scene.add(panel);

// Legacy floating menu-toggle meshes remain disabled; the physical left X
// controller button is polled directly through the WebXR gamepad input.
const menuToggleGroup = new THREE.Group();
menuToggleGroup.visible = false;
scene.add(menuToggleGroup);
const menuToggleHit = new THREE.Mesh(
  new THREE.BoxGeometry(0.66, 0.54, 0.10),
  new THREE.MeshBasicMaterial({ color: 0x145b59, transparent: true, opacity: 0.96, depthTest: false, depthWrite: false })
);
menuToggleHit.userData.action = "toggleMenu";
menuToggleGroup.add(menuToggleHit);
const menuToggleEdge = new THREE.LineSegments(
  new THREE.EdgesGeometry(new THREE.BoxGeometry(0.66, 0.54, 0.10)),
  new THREE.LineBasicMaterial({ color: 0x83e4d0, depthTest: false })
);
menuToggleGroup.add(menuToggleEdge);
const menuToggleBarMaterial = new THREE.MeshBasicMaterial({ color: 0xf3fbff, depthTest: false });
for (const y of [0.13, 0, -0.13]) {
  const bar = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.035, 0.018), menuToggleBarMaterial);
  bar.position.set(0, y, 0.065);
  menuToggleGroup.add(bar);
}

// World-space transform gizmo: double-ended arrows translate on X/Y/Z,
// circular rings rotate around X/Y/Z. Handles can be pinched directly.
const transformGizmo = new THREE.Group();
transformGizmo.visible = false;
// Keep the gizmo in scene space, not under worldGroup. It follows the selected
// object's world-space position, while its one-world-unit size is independent
// of the player's simulated scale and the workspace transform.
scene.add(transformGizmo);
const GIZMO_WORLD_SCALE = 1;
const gizmoHandles = [];
const gizmoPickMeshes = [];
const gizmoAxisColors = [0xff6868, 0x76e29a, 0x69aaff];
const worldAxes = [
  new THREE.Vector3(1, 0, 0),
  new THREE.Vector3(0, 1, 0),
  new THREE.Vector3(0, 0, 1)
];
function addGizmoMesh(mesh, handle) {
  mesh.userData.gizmoHandle = handle;
  transformGizmo.add(mesh);
  gizmoPickMeshes.push(mesh);
  return mesh;
}
worldAxes.forEach((axis, index) => {
  const color = gizmoAxisColors[index];
  const moveHandle = { kind: "translate", axis, axisIndex: index };

  // Visible shaft: widened so it is easy to see and target at VR scale.
  const shaft = new THREE.Mesh(
    new THREE.CylinderGeometry(0.025, 0.025, 1.12, 12),
    new THREE.MeshBasicMaterial({ color, depthTest: true })
  );
  shaft.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), axis);
  addGizmoMesh(shaft, moveHandle);

  [1, -1].forEach((direction) => {
    const tip = new THREE.Mesh(
      new THREE.ConeGeometry(0.065, 0.18, 12),
      new THREE.MeshBasicMaterial({ color, depthTest: true })
    );
    const directedAxis = axis.clone().multiplyScalar(direction);
    tip.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), directedAxis);
    tip.position.copy(directedAxis).multiplyScalar(0.64);
    addGizmoMesh(tip, moveHandle);
  });

  // Invisible long capsule-like cylinder. Controller rays can hit it even
  // when they miss the narrow visible shaft by several centimeters.
  const shaftPicker = new THREE.Mesh(
    new THREE.CylinderGeometry(0.13, 0.13, 1.55, 12),
    new THREE.MeshBasicMaterial({
      color: 0xffffff, transparent: true, opacity: 0, colorWrite: false,
      depthWrite: false, depthTest: false, side: THREE.DoubleSide
    })
  );
  shaftPicker.quaternion.copy(shaft.quaternion);
  addGizmoMesh(shaftPicker, moveHandle);

  // Larger invisible end-cap targets make the push/pull tips forgiving.
  [1, -1].forEach((direction) => {
    const capPicker = new THREE.Mesh(
      new THREE.SphereGeometry(0.16, 12, 8),
      new THREE.MeshBasicMaterial({
        color: 0xffffff, transparent: true, opacity: 0, colorWrite: false,
        depthWrite: false, depthTest: false
      })
    );
    capPicker.position.copy(axis).multiplyScalar(direction * 0.64);
    addGizmoMesh(capPicker, moveHandle);
  });

  const rotateHandle = { kind: "rotate", axis, axisIndex: index };
  const ring = new THREE.Mesh(
    new THREE.TorusGeometry(0.53, 0.019, 12, 128),
    new THREE.MeshBasicMaterial({ color, depthTest: false, side: THREE.DoubleSide })
  );
  ring.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), axis);
  ring.renderOrder = 5;
  addGizmoMesh(ring, rotateHandle);

  const ringPicker = new THREE.Mesh(
    new THREE.TorusGeometry(0.53, 0.12, 10, 96),
    new THREE.MeshBasicMaterial({
      color: 0xffffff, transparent: true, opacity: 0, colorWrite: false,
      depthWrite: false, depthTest: false, side: THREE.DoubleSide
    })
  );
  ringPicker.quaternion.copy(ring.quaternion);
  addGizmoMesh(ringPicker, rotateHandle);

  const axisLabel = new THREE.Sprite(new THREE.SpriteMaterial({
    map: makeCanvasTexture(["X", "Y", "Z"][index], { width: 128, height: 128, fontSize: 100, color: "#ffffff" }),
    transparent: true,
    depthTest: true
  }));
  axisLabel.scale.set(0.13, 0.13, 1);
  axisLabel.position.copy(axis).multiplyScalar(0.88);
  transformGizmo.add(axisLabel);
});
const gizmoCenter = new THREE.Mesh(
  new THREE.SphereGeometry(0.045, 12, 8),
  new THREE.MeshBasicMaterial({ color: 0xf5f7fa })
);
transformGizmo.add(gizmoCenter);
for (const mesh of gizmoPickMeshes) gizmoHandles.push(mesh.userData.gizmoHandle);
function updateTransformGizmo() {
  if (!selected || !nodes.includes(selected)) {
    transformGizmo.visible = false;
    return;
  }
  worldGroup.updateWorldMatrix(true, false);
  selected.group.updateWorldMatrix(true, false);

  // The gizmo is a direct child of scene, so worldGroup scale cannot affect
  // its dimensions. Follow only the selected object's world-space position;
  // keep the handles aligned to fixed world XYZ and at a constant physical size.
  const selectedWorldPosition = selected.group.getWorldPosition(new THREE.Vector3());
  // Since transformGizmo is a direct child of scene, this is the exact
  // world-space target and its scale never inherits worldGroup scaling.
  transformGizmo.position.copy(selectedWorldPosition);
  transformGizmo.quaternion.identity();
  transformGizmo.scale.setScalar(GIZMO_WORLD_SCALE);
  transformGizmo.visible = Boolean(renderer.xr.isPresenting && gizmoEnabled);
  transformGizmo.updateMatrixWorld(true);
}

function validItemID(id) {
  return /^item_[a-z0-9_-]{1,48}$/i.test(String(id || "").trim());
}
function makeItem(id) {
  return {
    itemID: id,
    jsonData: "",
    stashPos: 0,
    children: [],
    stuckChildren: [],
    grabPos: [0, 0, 0],
    grabRot: [0, 0, 0, 1],
    state: 0,
    ammo: 0,
    isBlueprint: true,
    scaleModifier: 0,
    colorHue: 0,
    colorSaturation: 0,
    jellyStrength: 0,
    stashRow: 0,
    stashCol: 0
  };
}
function colorFor(id) {
  let h = 0;
  for (const c of id) h = (h * 31 + c.charCodeAt(0)) | 0;
  return new THREE.Color().setHSL((Math.abs(h) % 360) / 360, 0.48, 0.53);
}
function makeCanvasTexture(text, options = {}) {
  const canvas = document.createElement("canvas");
  canvas.width = options.width || 512;
  canvas.height = options.height || 160;
  const ctx = canvas.getContext("2d");
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = options.color || "#f5f8fb";
  ctx.font = `${options.weight || "700"} ${options.fontSize || 52}px system-ui, sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  const maxWidth = canvas.width - 24;
  let display = String(text);
  while (ctx.measureText(display).width > maxWidth && display.length > 4) display = display.slice(0, -2) + "…";
  ctx.fillText(display, canvas.width / 2, canvas.height / 2, maxWidth);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.needsUpdate = true;
  return texture;
}
function makeAspectCanvasTexture(text, aspectRatio, fontSize = 42, color = "#f5f8fb", maxLongSide = 2048) {
  // Match the canvas aspect ratio to the exact 3D plane ratio. The previous
  // fixed 512x160 canvas stretched every label differently in the headset.
  const aspect = THREE.MathUtils.clamp(Number(aspectRatio) || 1, 0.45, 24);
  const canvas = document.createElement("canvas");
  if (aspect >= 1) {
    canvas.width = maxLongSide;
    canvas.height = Math.max(96, Math.round(maxLongSide / aspect));
  } else {
    canvas.height = maxLongSide;
    canvas.width = Math.max(96, Math.round(maxLongSide * aspect));
  }
  const ctx = canvas.getContext("2d");
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = color;
  // Preserve the old visual text size relative to the canvas height while
  // increasing raster resolution for sharper rendering at Quest viewing distance.
  const baseFontSize = Math.max(12, fontSize * (canvas.height / 160));
  let scaledFontSize = baseFontSize;
  ctx.font = `700 ${scaledFontSize}px system-ui, sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.imageSmoothingEnabled = true;
  const maxWidth = canvas.width - Math.max(16, canvas.width * 0.035);
  let display = String(text);
  // Keep the larger default lettering while gently fitting unusually long labels.
  while (ctx.measureText(display).width > maxWidth && scaledFontSize > baseFontSize * 0.82) {
    scaledFontSize *= 0.96;
    ctx.font = `700 ${scaledFontSize}px system-ui, sans-serif`;
  }
  while (ctx.measureText(display).width > maxWidth && display.length > 4) {
    display = display.slice(0, -2) + "…";
  }
  ctx.fillText(display, canvas.width / 2, canvas.height / 2, maxWidth);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.generateMipmaps = true;
  texture.anisotropy = Math.min(4, renderer.capabilities.getMaxAnisotropy());
  texture.needsUpdate = true;
  return texture;
}
function addPanelText(text, x, y, width, height, fontSize = 42, color = "#f5f8fb") {
  const mesh = new THREE.Mesh(
    new THREE.PlaneGeometry(width, height),
    new THREE.MeshBasicMaterial({
      map: makeAspectCanvasTexture(text, width / height, fontSize * UI_PANEL_FONT_SCALE, color, 2048),
      transparent: true,
      depthTest: false,
      depthWrite: false,
      toneMapped: false
    })
  );
  mesh.position.set(x, y, 0.025);
  mesh.renderOrder = 100;
  mesh.frustumCulled = false;
  panel.add(mesh);
  return mesh;
}
function addButton(label, action, x, y, width = 0.34, height = 0.15, tone = "normal") {
  const tones = {
    normal: [0x29404e, 0x6b8798],
    good: [0x176c65, 0x50c4ac],
    danger: [0x542c35, 0xb55e70],
    muted: [0x303c45, 0x71818b],
    active: [0x1b504d, 0x67dbc5]
  };
  const [base, edge] = tones[tone] || tones.normal;
  const button = new THREE.Mesh(
    new THREE.BoxGeometry(width, height, 0.045),
    new THREE.MeshBasicMaterial({ color: base })
  );
  button.position.set(x, y, 0.035);
  button.userData.action = action;
  button.add(new THREE.LineSegments(
    new THREE.EdgesGeometry(new THREE.BoxGeometry(width, height, 0.045)),
    new THREE.LineBasicMaterial({ color: edge })
  ));
  const face = new THREE.Mesh(
    new THREE.PlaneGeometry(width * 0.94, height * 0.76),
    new THREE.MeshBasicMaterial({
      map: makeAspectCanvasTexture(label, (width * 0.94) / (height * 0.76), 54 * UI_BUTTON_FONT_SCALE, "#f5f8fb", 1024),
      transparent: true,
      depthTest: false,
      depthWrite: false,
      toneMapped: false
    })
  );
  face.position.z = 0.024;
  face.renderOrder = 101;
  face.frustumCulled = false;
  button.add(face);
  panel.add(button);
  uiButtons.push(button);
  return button;
}
function clearPanel() {
  for (const child of [...panel.children]) {
    child.traverse?.((obj) => {
      if (obj.geometry) obj.geometry.dispose();
      if (obj.material) {
        const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
        for (const mat of mats) {
          if (mat.map) mat.map.dispose();
          mat.dispose();
        }
      }
    });
  }
  panel.clear();
  uiButtons.length = 0;
  statusTextMesh = null;
}
function drawPanelBackground(title) {
  const bg = new THREE.Mesh(
    new THREE.PlaneGeometry(1.68, 2.12),
    new THREE.MeshBasicMaterial({ color: 0x101e28, transparent: true, opacity: 0.96, depthWrite: false })
  );
  bg.position.z = -0.015;
  panel.add(bg);
  addPanelText(title, 0, 0.86, 1.55, 0.14, 42);
  statusTextMesh = addPanelText(statusText, 0, 0.68, 1.53, 0.09, 23, "#9ee5d1");
  addPanelText(`${SITE_VERSION} · BUILD ${SITE_BUILD_ID}`, 0, -1.025, 1.48, 0.055, 14, "#83d9c7");
}
function drawMainPanel() {
  clearPanel();
  drawPanelBackground("GOOP VR BUILDER");
  const selectedLabel = selected ? `SELECTED: ${getItemDisplayName(selected.item.itemID)}` : "SELECTED: NONE";
  addPanelText(selectedLabel, 0, 0.56, 1.52, 0.085, 23, "#d6e5ed");
  addPanelText(`NEXT ITEM: ${getItemDisplayName(pendingItemID)}`, 0, 0.45, 1.52, 0.075, 21, "#f8df9a");

  addButton("NEW ROOT", "newRoot", -0.53, 0.30, 0.48, 0.15, "good");
  addButton("ADD PART", "addPart", 0, 0.30, 0.48, 0.15, "good");
  addButton("DELETE", "delete", 0.53, 0.30, 0.48, 0.15, "danger");

  addButton("ITEMS", "openItemCatalog", -0.53, 0.09, 0.48, 0.15, "active");
  addButton("EXPORT", "export", 0, 0.09, 0.48, 0.15, "good");
  addButton("IMPORT", "import", 0.53, 0.09, 0.48, 0.15);

  if (gizmoEnabled) {
    addPanelText("GIZMO ON · FULL EDIT MODE", 0, -0.04, 1.48, 0.09, 25, "#91e3c4");
    addPanelText("ARROWS · MOVE XYZ", 0, -0.20, 1.50, 0.09, 23, "#ffcf8a");
    addPanelText("CIRCLES · ROTATE XYZ", 0, -0.34, 1.50, 0.09, 23, "#a9c2cf");
    addPanelText("HOLD ITEM + BOTH GRIPS · SCALE ITEM", 0, -0.49, 1.55, 0.07, 17, "#a9c2cf");
    addPanelText("EMPTY HANDS + BOTH GRIPS · PLAYER SIZE", 0, -0.59, 1.55, 0.07, 16, "#a9c2cf");
    addButton("SCALE −", "scale:-1", -0.38, -0.73, 0.48, 0.13);
    addButton("SCALE +", "scale:1", 0.15, -0.73, 0.48, 0.13);
  } else {
    addPanelText("GIZMO OFF · OBJECT-ONLY MODE", 0, -0.04, 1.48, 0.09, 25, "#91e3c4");
    addPanelText("HOLD ONE GRIP NEAR A PART TO PICK IT UP", 0, -0.22, 1.55, 0.08, 19, "#ffcf8a");
    addPanelText("KEEP HOLDING · GRIP WITH OTHER HAND", 0, -0.37, 1.55, 0.08, 19, "#a9c2cf");
    addPanelText("PULL APART / PUSH TOGETHER TO RESIZE", 0, -0.51, 1.55, 0.08, 19, "#a9c2cf");
    addPanelText("PLAYER SCALING + GIZMO HANDLES DISABLED", 0, -0.65, 1.58, 0.07, 15, "#dfb18b");
  }
  addButton("HIERARCHY", "openHierarchy", -0.43, -0.73, 0.68, 0.11, "active");
  addButton("SNAP SETTINGS", "snapSettings", 0.43, -0.73, 0.68, 0.11, "active");
  addButton("UNDO", "undo", -0.43, -0.92, 0.48, 0.11, undoHistory.length ? "good" : "muted");
  addButton("REDO", "redo", 0.43, -0.92, 0.48, 0.11, redoHistory.length ? "good" : "muted");
}
function getItemDisplayName(id) {
  return ITEM_CATALOG_BY_ID.get(id)?.name || String(id || "Unknown item").replace(/^item_/, "").replace(/_/g, " ");
}
function getCatalogCategoryItems() {
  const category = ITEM_CATEGORIES[itemCatalogCategoryIndex] || ITEM_CATEGORIES[0];
  return ITEM_CATALOG.filter((entry) => entry.category === category);
}
function openItemCatalog() {
  itemCatalogOpen = true;
  keyboardOpen = false;
  snapSettingsOpen = false;
  snapValueKeyboardOpen = false;
  const current = ITEM_CATALOG_BY_ID.get(pendingItemID);
  if (current) {
    itemCatalogCategoryIndex = Math.max(0, ITEM_CATEGORIES.indexOf(current.category));
    const categoryItems = getCatalogCategoryItems();
    const index = categoryItems.findIndex((entry) => entry.id === pendingItemID);
    itemCatalogPage = index >= 0 ? Math.floor(index / ITEM_PAGE_SIZE) : 0;
  } else {
    itemCatalogCategoryIndex = 0;
    itemCatalogPage = 0;
  }
  redrawPanel();
}
function drawItemCatalogPanel() {
  clearPanel();
  drawPanelBackground("CHOOSE AN ITEM");
  addPanelText(`NEXT: ${getItemDisplayName(pendingItemID)}`, 0, 0.53, 1.52, 0.085, 25, "#f8df9a");

  addButton("◀", "catalogCategoryPrev", -0.55, 0.32, 0.25, 0.13, "muted");
  addPanelText(ITEM_CATEGORIES[itemCatalogCategoryIndex], 0, 0.32, 0.88, 0.085, 22, "#9ee5d1");
  addButton("▶", "catalogCategoryNext", 0.55, 0.32, 0.25, 0.13, "muted");

  const entries = getCatalogCategoryItems();
  const pageCount = Math.max(1, Math.ceil(entries.length / ITEM_PAGE_SIZE));
  itemCatalogPage = THREE.MathUtils.clamp(itemCatalogPage, 0, pageCount - 1);
  const start = itemCatalogPage * ITEM_PAGE_SIZE;
  const visible = entries.slice(start, start + ITEM_PAGE_SIZE);
  const columns = [-0.415, 0.415];
  const rows = [0.08, -0.12, -0.32, -0.52];
  visible.forEach((entry, index) => {
    const col = index % 2;
    const row = Math.floor(index / 2);
    const modelState = modelLoadStates.get(entry.id)?.state;
    const label = MODEL_ASSETS.has(entry.id)
      ? `${entry.name} · ${modelState === "loaded" ? "3D OK" : modelState === "error" ? "3D ERROR" : "3D"}`
      : entry.name;
    addButton(label, `catalogPick:${entry.id}`, columns[col], rows[row], 0.78, 0.15, entry.id === pendingItemID ? "active" : "normal");
  });
  if (visible.length === 0) addPanelText("NO ITEMS IN THIS CATEGORY", 0, -0.25, 1.45, 0.10, 22, "#f0c6a5");

  addButton("PREV", "catalogPagePrev", -0.49, -0.72, 0.38, 0.12, "muted");
  addPanelText(`PAGE ${itemCatalogPage + 1}/${pageCount} · ${entries.length} ITEMS`, 0, -0.72, 0.70, 0.075, 17, "#d6e5ed");
  addButton("NEXT", "catalogPageNext", 0.49, -0.72, 0.38, 0.12, "muted");
  addButton("CUSTOM ID", "catalogCustomID", -0.40, -0.90, 0.68, 0.11, "active");
  addButton("BACK", "catalogBack", 0.40, -0.90, 0.68, 0.11, "muted");
}
function openHierarchy(mode = "parents") {
  hierarchyOpen = true;
  hierarchyListMode = mode;
  hierarchyPage = 0;
  itemCatalogOpen = false;
  snapSettingsOpen = false;
  keyboardOpen = false;
  snapValueKeyboardOpen = false;
  redrawPanel();
}
function getHierarchyEntries() {
  if (hierarchyListMode === "children") return selected ? selected.children : [];
  return nodes;
}
function drawHierarchyPanel() {
  clearPanel();
  drawPanelBackground("PARENT / CHILD ITEMS");
  const parentName = selected?.parent ? getItemDisplayName(selected.parent.item.itemID) : "ROOT / NONE";
  addPanelText(selected ? `CURRENT: ${getItemDisplayName(selected.item.itemID)}` : "CURRENT: NONE", 0, 0.54, 1.52, 0.08, 22, "#f8df9a");
  addPanelText(`PARENT: ${parentName} · CHILDREN: ${selected?.children.length || 0}`, 0, 0.43, 1.52, 0.07, 16, "#9ee5d1");
  addButton("ALL ITEMS", "hierarchyParents", -0.47, 0.27, 0.66, 0.12, hierarchyListMode === "parents" ? "active" : "muted");
  addButton("CHILDREN", "hierarchyChildren", 0.47, 0.27, 0.66, 0.12, hierarchyListMode === "children" ? "active" : "muted");
  const entries = getHierarchyEntries();
  const pageCount = Math.max(1, Math.ceil(entries.length / ITEM_PAGE_SIZE));
  hierarchyPage = THREE.MathUtils.clamp(hierarchyPage, 0, pageCount - 1);
  const visible = entries.slice(hierarchyPage * ITEM_PAGE_SIZE, (hierarchyPage + 1) * ITEM_PAGE_SIZE);
  const columns = [-0.415, 0.415];
  const rows = [0.06, -0.13, -0.32, -0.51];
  visible.forEach((node, index) => {
    const label = `${node === selected ? "▶ " : ""}${getItemDisplayName(node.item.itemID)}`;
    addButton(label, `hierarchySelect:${node.uid}`, columns[index % 2], rows[Math.floor(index / 2)], 0.78, 0.14, node === selected ? "active" : "normal");
  });
  if (!visible.length) addPanelText(hierarchyListMode === "children" ? "NO CHILD ITEMS YET" : "NO ITEMS YET", 0, -0.24, 1.48, 0.09, 20, "#d6e5ed");
  addButton("PREV", "hierarchyPagePrev", -0.49, -0.70, 0.38, 0.11, "muted");
  addPanelText(`PAGE ${hierarchyPage + 1}/${pageCount} · ${entries.length} ITEMS`, 0, -0.70, 0.72, 0.07, 15, "#d6e5ed");
  addButton("NEXT", "hierarchyPageNext", 0.49, -0.70, 0.38, 0.11, "muted");
  addButton("ADD CHILD", "hierarchyAddChild", -0.43, -0.87, 0.68, 0.11, "good");
  addButton("BACK", "hierarchyBack", 0.43, -0.87, 0.68, 0.11, "muted");
}
function drawSnapSettingsPanel() {
  clearPanel();
  drawPanelBackground("SNAP SETTINGS");
  addPanelText("POSITION SNAP", 0, 0.52, 1.40, 0.09, 28, "#ffcf8a");
  addButton(snapConfig.positionEnabled ? "POSITION: ON" : "POSITION: OFF", "snapPositionToggle", 0, 0.36, 0.90, 0.13, snapConfig.positionEnabled ? "active" : "muted");
  addPanelText(`GRID STEP · ${snapConfig.positionStep.toFixed(3)} m`, 0, 0.16, 1.50, 0.09, 26);
  addButton("STEP −", "positionStepDown", -0.49, -0.01, 0.38, 0.13);
  addButton("CUSTOM", "positionStepCustom", 0, -0.01, 0.38, 0.13, "active");
  addButton("STEP +", "positionStepUp", 0.49, -0.01, 0.38, 0.13);

  addPanelText("ROTATION SNAP", 0, -0.22, 1.40, 0.09, 28, "#9ecbff");
  addButton(snapConfig.rotationEnabled ? "ROTATION: ON" : "ROTATION: OFF", "snapRotationToggle", 0, -0.37, 0.90, 0.13, snapConfig.rotationEnabled ? "active" : "muted");
  addPanelText(`ANGLE STEP · ${snapConfig.rotationStepDegrees.toFixed(1)}°`, 0, -0.57, 1.50, 0.09, 25);
  addButton("ANGLE −", "rotationStepDown", -0.49, -0.71, 0.38, 0.13);
  addButton("CUSTOM", "rotationStepCustom", 0, -0.71, 0.38, 0.13, "active");
  addButton("ANGLE +", "rotationStepUp", 0.49, -0.71, 0.38, 0.13);
  addButton("TEST SFX", "testSfx", -0.42, -0.89, 0.70, 0.11, "active");
  addButton("BACK", "snapBack", 0.42, -0.89, 0.70, 0.11, "muted");
}
function drawSnapValueKeyboard() {
  clearPanel();
  drawPanelBackground(snapValueTarget === "position" ? "CUSTOM GRID STEP" : "CUSTOM ANGLE STEP");
  const suffix = snapValueTarget === "position" ? "m" : "°";
  addPanelText(`${snapValueDraft || "0"} ${suffix}`, 0, 0.51, 1.50, 0.12, 38, "#f8df9a");
  const rows = [["1", "2", "3"], ["4", "5", "6"], ["7", "8", "9"]];
  rows.forEach((row, r) => row.forEach((digit, c) => {
    addButton(digit, `snapKey:${digit}`, (c - 1) * 0.48, 0.25 - r * 0.20, 0.38, 0.15);
  }));
  addButton(".", "snapKey:.", -0.48, -0.39, 0.38, 0.15);
  addButton("0", "snapKey:0", 0, -0.39, 0.38, 0.15);
  addButton("⌫", "snapKeyBack", 0.48, -0.39, 0.38, 0.15, "muted");
  addButton("CLEAR", "snapKeyClear", -0.43, -0.67, 0.42, 0.14, "muted");
  addButton("CANCEL", "snapKeyCancel", 0, -0.67, 0.42, 0.14, "danger");
  addButton("DONE", "snapKeyDone", 0.43, -0.67, 0.42, 0.14, "good");
}
function drawKeyboardPanel() {
  clearPanel();
  drawPanelBackground("EDIT ITEM ID");
  addPanelText(keyboardDraft, 0, 0.54, 1.52, 0.13, 38, "#f8df9a");
  const chars = "abcdefghijklmnopqrstuvwxyz0123456789_-".split("");
  const cols = 8;
  chars.forEach((ch, i) => {
    const row = Math.floor(i / cols);
    const col = i % cols;
    const x = (col - (cols - 1) / 2) * 0.19;
    const y = 0.30 - row * 0.17;
    addButton(ch.toUpperCase(), `key:${ch}`, x, y, 0.17, 0.135);
  });
  addButton("BACK", "keyBack", -0.52, -0.67, 0.31, 0.15, "muted");
  addButton("CLEAR", "keyClear", -0.17, -0.67, 0.31, 0.15, "muted");
  addButton("CANCEL", "keyCancel", 0.18, -0.67, 0.31, 0.15, "danger");
  addButton("DONE", "keyDone", 0.53, -0.67, 0.31, 0.15, "good");
  addPanelText("The item_ prefix is added automatically", 0, -0.88, 1.5, 0.08, 22, "#a9c2cf");
}
function redrawPanel() {
  if (!panelReady) return;
  if (keyboardOpen) drawKeyboardPanel();
  else if (snapValueKeyboardOpen) drawSnapValueKeyboard();
  else if (itemCatalogOpen) drawItemCatalogPanel();
  else if (hierarchyOpen) drawHierarchyPanel();
  else if (snapSettingsOpen) drawSnapSettingsPanel();
  else drawMainPanel();
}
function setStatus(text) {
  const nextStatus = String(text);
  const changed = nextStatus !== statusText;
  if (changed) {
    statusText = nextStatus;

    // Status updates can be emitted continuously while the user is grabbing
    // or scaling. Rebuilding the entire wrist menu every XR frame disposes
    // and recreates every canvas texture, which looks like the text is
    // blinking on Quest Browser. Update only the existing status-line map.
    if (panelReady && statusTextMesh?.material) {
      const previousMap = statusTextMesh.material.map;
      const nextMap = makeAspectCanvasTexture(
        statusText,
        1.53 / 0.09,
        23 * UI_PANEL_FONT_SCALE,
        "#9ee5d1",
        2048
      );
      statusTextMesh.material.map = nextMap;
      statusTextMesh.material.needsUpdate = true;
      if (previousMap) previousMap.dispose();
    }
  }

  // Keep the desktop landing-page status synchronized even when the initial
  // message happens to match the already initialized in-app status string.
  const statusEl = $("landingStatus");
  if (statusEl) statusEl.textContent = statusText;
}

const SFX_FILES = {
  hover: "data:audio/mpeg;base64,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",
  click: "data:audio/mpeg;base64,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2qOTK1CggcdHS3rWWWwyNZZmTScWUWaUWZcbm1NOzlFlHGnGlHmXGJIkjRQGIPPMuNmnZrxaJxpRZZR8XlTVO15uf7NScW1xmykacWYfcaikacWUUfFo1LO8blSzxiSJKUxKSxyPyWYlcso5bKpmampmgoZivUr0EqlMNRGAoNiEbfh5WnLtUyTRTKSlScQIjAR0CHqTiW6cimati+1gVVlKU9kyUpkn0OhAMLHC6AskVUSLHFCFIIkFYkrSogqnGBIC0VFL1uKfZMsVTJNFN5P9PRU6kEkUARcEKiERyEz/86TE4T0kOKgEGbE8MnCwi3aQ6SCUQYEAgBCRVhYeSOVMQU1FMy4xMDBVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVU=",
  snapIn: "data:audio/mpeg;base64,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",
  snapOut: "data:audio/mpeg;base64,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",
 };
const htmlAudio = Object.create(null);
let audioFailures = [];
let queuedSfx = [];
let audioPrimeStarted = false;

function startDecodedSfx(name) {
  if (!audioContext || !audioBuffers[name]) return false;
  const start = () => {
    try {
      const source = audioContext.createBufferSource();
      const gain = audioContext.createGain();
      gain.gain.value = name === "hover" ? 0.7 : 0.85;
      source.buffer = audioBuffers[name];
      source.connect(gain);
      gain.connect(audioContext.destination);
      source.start(0);
    } catch (error) {
      console.warn(`WebAudio playback failed for ${name}:`, error);
      playHtmlAudio(name);
    }
  };
  if (audioContext.state === "running") start();
  else audioContext.resume().then(start).catch((error) => {
    console.warn(`AudioContext resume failed for ${name}:`, error);
    playHtmlAudio(name);
  });
  return true;
}

function playHtmlAudio(name) {
  const audio = htmlAudio[name];
  if (!audio) return false;
  try {
    audio.pause();
    audio.currentTime = 0;
    audio.muted = false;
    const result = audio.play();
    if (result && typeof result.catch === "function") {
      result.catch((error) => console.warn(`HTML audio playback blocked for ${name}:`, error));
    }
    return true;
  } catch (error) {
    console.warn(`HTML audio playback failed for ${name}:`, error);
    return false;
  }
}

function warmAudio() {
  // Create and prime audio directly from the ENTER VR click. The clips are
  // embedded in app.js, so there are no external asset requests to go missing.
  for (const [name, dataUrl] of Object.entries(SFX_FILES)) {
    if (!htmlAudio[name]) {
      const audio = new Audio(dataUrl);
      audio.preload = "auto";
      audio.playsInline = true;
      audio.volume = name === "hover" ? 0.7 : 0.85;
      htmlAudio[name] = audio;
      audio.load();
    }
  }

  const AudioCtx = window.AudioContext || window.webkitAudioContext;
  if (AudioCtx) {
    if (!audioContext) audioContext = new AudioCtx();
    // Resume synchronously from the trusted ENTER VR click to unlock Quest audio.
    audioContext.resume().catch((error) => console.warn("AudioContext resume failed:", error));
    if (!audioLoadPromise) {
      audioLoadPromise = Promise.all(Object.entries(SFX_FILES).map(async ([name, dataUrl]) => {
        try {
          const response = await fetch(dataUrl);
          if (!response.ok) throw new Error(`Could not read embedded ${name} clip`);
          const bytes = await response.arrayBuffer();
          audioBuffers[name] = await audioContext.decodeAudioData(bytes);
        } catch (error) {
          audioFailures.push(name);
          console.warn(`Could not decode ${name}; HTML audio fallback will be used.`, error);
        }
      })).then(() => {
        const pending = queuedSfx;
        queuedSfx = [];
        for (const name of pending) {
          if (audioBuffers[name] && audioContext) startDecodedSfx(name);
          else playHtmlAudio(name);
        }
      });
    }
  } else {
    audioLoadPromise = Promise.resolve();
  }

  // Prime each media element while the ENTER VR user activation is live.
  // Muted priming is inaudible; later playback is unmuted.
  if (!audioPrimeStarted) {
    audioPrimeStarted = true;
    for (const audio of Object.values(htmlAudio)) {
      audio.muted = true;
      const priming = audio.play();
      if (priming && typeof priming.then === "function") {
        priming.then(() => {
          audio.pause();
          audio.currentTime = 0;
          audio.muted = false;
        }).catch((error) => {
          audio.muted = false;
          console.warn("HTML audio could not be primed:", error);
        });
      } else {
        audio.pause();
        audio.currentTime = 0;
        audio.muted = false;
      }
    }
  }
  return audioLoadPromise;
}

function playSfx(name) {
  if (!SFX_FILES[name]) return;
  if (audioContext && audioBuffers[name]) {
    startDecodedSfx(name);
    return;
  }
  if (audioLoadPromise && audioContext) {
    // Wait for the first decode instead of mistaking a pending/rejected
    // HTMLAudio.play() promise for successful playback.
    queuedSfx.push(name);
    return;
  }
  playHtmlAudio(name);
}

function setHoveredButton(button) {
  const action = button?.userData?.action ?? null;
  const now = performance.now();

  // Start timing a new candidate. Do not play on the first noisy tracking frame.
  if (action !== hoverCandidateAction) {
    hoverCandidateAction = action;
    hoverCandidateSince = now;
    return;
  }

  // Require a sustained exit before allowing the same button to sound again.
  if (action === null) {
    if (lastHoverActionPlayed !== null && now - hoverCandidateSince >= HOVER_EXIT_RESET_MS) {
      lastHoverActionPlayed = null;
    }
    return;
  }

  // One hover sound per stable button entry, even if the hit mesh is recreated.
  if (action === lastHoverActionPlayed) return;
  if (now - hoverCandidateSince < HOVER_DWELL_MS) return;
  if (now - lastHoverSfxTime < HOVER_GLOBAL_COOLDOWN_MS) return;

  lastHoverActionPlayed = action;
  lastHoverSfxTime = now;
  playSfx("hover");
}
function roundToStep(value, step) {
  if (!Number.isFinite(step) || step <= 0) return value;
  return Math.round(value / step) * step;
}
function snapWorldPosition(position) {
  if (!snapConfig.positionEnabled) return position;
  const step = snapConfig.positionStep;
  return new THREE.Vector3(
    roundToStep(position.x, step),
    roundToStep(position.y, step),
    roundToStep(position.z, step)
  );
}
function snapLocalEuler(quaternion) {
  if (!snapConfig.rotationEnabled) return quaternion;
  const step = THREE.MathUtils.degToRad(snapConfig.rotationStepDegrees);
  const euler = new THREE.Euler().setFromQuaternion(quaternion, "XYZ");
  euler.set(roundToStep(euler.x, step), roundToStep(euler.y, step), roundToStep(euler.z, step), "XYZ");
  return new THREE.Quaternion().setFromEuler(euler).normalize();
}
function setNodeWorldPosition(node, worldPosition) {
  const parent = node.group.parent;
  parent.updateWorldMatrix(true, false);
  const inverseParent = parent.matrixWorld.clone().invert();
  node.position.copy(worldPosition.clone().applyMatrix4(inverseParent));
  syncMesh(node);
}
function applyObjectDrag(node, proxy, offset, lockedLocalQuaternion = null) {
  const desiredWorld = new THREE.Matrix4().copy(proxy.matrixWorld).multiply(offset);
  const worldPosition = new THREE.Vector3();
  const worldQuaternion = new THREE.Quaternion();
  const worldScale = new THREE.Vector3();
  desiredWorld.decompose(worldPosition, worldQuaternion, worldScale);
  const snappedWorldPosition = snapWorldPosition(worldPosition);
  desiredWorld.compose(snappedWorldPosition, worldQuaternion, worldScale);

  const parent = node.group.parent;
  parent.updateWorldMatrix(true, false);
  const local = parent.matrixWorld.clone().invert().multiply(desiredWorld);
  local.decompose(node.position, node.quaternion, new THREE.Vector3());
  // In B/gizmo-off object-only mode, a direct pickup moves the item with the
  // controller but does not twist it. Rotation is available again with B on.
  if (lockedLocalQuaternion) node.quaternion.copy(lockedLocalQuaternion);
  else if (snapConfig.rotationEnabled) node.quaternion.copy(snapLocalEuler(node.quaternion));
  node.group.position.copy(node.position);
  node.group.quaternion.copy(node.quaternion);
  updateTransformGizmo();
}
function nodeWorldQuaternion(node) {
  node.group.updateWorldMatrix(true, false);
  return node.group.getWorldQuaternion(new THREE.Quaternion());
}
function snapValueOpen(target) {
  snapValueTarget = target;
  snapValueDraft = target === "position" ? String(snapConfig.positionStep) : String(snapConfig.rotationStepDegrees);
  snapValueKeyboardOpen = true;
  redrawPanel();
}
function handleSnapValueAction(action) {
  if (action.startsWith("snapKey:")) {
    const char = action.slice(8);
    if (char !== "." || !snapValueDraft.includes(".")) {
      if (snapValueDraft.length < 9) snapValueDraft += char;
    }
  } else if (action === "snapKeyBack") {
    snapValueDraft = snapValueDraft.slice(0, -1);
  } else if (action === "snapKeyClear") {
    snapValueDraft = "";
  } else if (action === "snapKeyCancel") {
    snapValueKeyboardOpen = false;
  } else if (action === "snapKeyDone") {
    const value = Number(snapValueDraft);
    const valid = Number.isFinite(value) && (snapValueTarget === "position" ? value >= 0.001 && value <= 10 : value >= 0.1 && value <= 180);
    if (!valid) {
      setStatus(snapValueTarget === "position" ? "Grid step must be between 0.001 and 10 meters." : "Angle step must be between 0.1° and 180°.");
      return;
    }
    if (snapValueTarget === "position") snapConfig.positionStep = value;
    else snapConfig.rotationStepDegrees = value;
    snapValueKeyboardOpen = false;
    setStatus(`Custom ${snapValueTarget} snap step saved: ${value}.`);
  }
  redrawPanel();
}
function nodeGroup(node) { return node.parent ? node.parent.group : rootGroup; }

// Match Mikeybox's native GrabbableObject.CalcPhysicalScale fallback curve.
// Prime uses prefab-specific ranges when available; its shared rules fallback is
// min=0.2 / max=2.5. This builder uses that same fallback for its scale values.
const ITEM_SCALE_RANGE_OVERRIDES = new Map([
  ["item_fish_rotten_fish", { min: 0.8, max: 1.2 }],
  ["item_fish_fishsword", { min: 0.8, max: 1.2 }]
]);
function scaleRangeForItem(itemID) {
  return ITEM_SCALE_RANGE_OVERRIDES.get(String(itemID || "")) || { min: 0.2, max: 2.5 };
}
function physicalScaleForItem(item) {
  const modifier = THREE.MathUtils.clamp(Math.round(Number(item?.scaleModifier || 0)), -128, 127);
  const { min, max } = scaleRangeForItem(item?.itemID);
  return modifier < 0
    ? 1 + (min - 1) * (-modifier / 128)
    : 1 + (max - 1) * (modifier / 127);
}
function scaleModifierForPhysicalScale(scale, itemID) {
  const { min, max } = scaleRangeForItem(itemID);
  const desired = THREE.MathUtils.clamp(Number(scale) || 1, min, max);
  if (desired < 1) return THREE.MathUtils.clamp(Math.round(-128 * (1 - desired) / (1 - min)), -128, 0);
  return THREE.MathUtils.clamp(Math.round(127 * (desired - 1) / (max - 1)), 0, 127);
}
// A small set of prefabs uses a view scale different from its physical scale.
// Prime applies this ratio when it draws stuck children; mirror it when encoding
// and decoding child display poses so those attachments stay where they appear.
const STUCK_DRAW_RATIOS = new Map([
  ["item_alienblaster", 0.4], ["item_backrooms_chair", 0.6], ["item_brain_chunk", 0.15],
  ["item_bubble_gun", 0.4], ["item_eye_googly", 0.01], ["item_flamethrower", 0.4],
  ["item_flamethrower_skull", 0.4], ["item_flamethrower_skull_blood", 0.4],
  ["item_flamethrower_skull_ruby", 0.4], ["item_glitched_banana", 10], ["item_heart_chunk", 0.15],
  ["item_hh_key", 3.816], ["item_key_challengearena", 3.816], ["item_key_factoryboss_easy", 3.816],
  ["item_key_factoryboss_hard", 3.816], ["item_key_factoryboss_medium", 3.816],
  ["item_mannequin_arm_left", 0.7], ["item_mannequin_arm_right", 0.7], ["item_mannequin_head", 0.7],
  ["item_mannequin_leg_left", 0.7], ["item_mannequin_leg_right", 0.7], ["item_mannequin_torso", 0.7],
  ["item_moonhorror_key", 3.816], ["item_mountain_key", 3.816], ["item_ore_copper_l", 0.15],
  ["item_ore_copper_m", 0.15], ["item_ore_copper_s", 0.15], ["item_ore_gold_l", 0.15],
  ["item_ore_gold_m", 0.15], ["item_ore_gold_s", 0.15], ["item_ore_hell", 0.11],
  ["item_ore_silver_l", 0.15], ["item_ore_silver_m", 0.15], ["item_ore_silver_s", 0.15],
  ["item_quest_key_graveyard", 3.816], ["item_shadowboss_key", 3], ["item_trampoline", 2],
  ["item_upsidedown_loot", 0.15], ["item_uranium_chunk_l", 0.15], ["item_uranium_chunk_m", 0.15],
  ["item_uranium_chunk_s", 0.15], ["item_volatile_brain_chunk", 0.23]
]);
function stuckDrawRatioForItem(itemID) { return STUCK_DRAW_RATIOS.get(String(itemID || "")) || 1; }
function syncMesh(node) {
  // Keep the render transform synchronized with the editor's authoritative pose.
  // Previously some transform paths changed node.position/quaternion without
  // updating node.group, so the displayed pose and exported pose diverged.
  if (node.group) {
    node.group.position.copy(node.position);
    node.group.quaternion.copy(node.quaternion).normalize();
  }
  if (node.mesh) node.mesh.scale.setScalar(physicalScaleForItem(node.item));
  const stickMount = node.group?.children?.find((child) => child.userData?.joystickStickMount);
  if (stickMount) joystickStickMountFor(node);
  if (node === selected) updateTransformGizmo();
}
function makeItemPreviewGeometry(id) {
  const category = ITEM_CATALOG_BY_ID.get(id)?.category || "Loot";
  // Lightweight placeholder geometry remains visible while a GLB is loading
  // or when this item does not yet have a supplied model.
  if (category === "Toys") return new THREE.IcosahedronGeometry(0.18, 1);
  if (category === "Construction") return new THREE.BoxGeometry(0.34, 0.23, 0.34);
  if (category === "Bags & Gadgets") return new THREE.BoxGeometry(0.24, 0.34, 0.17);
  if (category === "Fishing") {
    const geometry = new THREE.SphereGeometry(0.19, 18, 12);
    geometry.scale(1.28, 0.68, 0.68);
    return geometry;
  }
  if (category === "Consumables") return new THREE.CylinderGeometry(0.115, 0.13, 0.30, 20);
  return new THREE.DodecahedronGeometry(0.18, 0);
}
function setProxyBounds(node, box = null) {
  const oldGeometry = node.mesh.geometry;
  let center = new THREE.Vector3(0, 0.18, 0);
  let radius = 0.28;
  if (box && !box.isEmpty()) {
    const sphere = box.getBoundingSphere(new THREE.Sphere());
    center.copy(sphere.center);
    radius = Math.max(0.12, sphere.radius * 1.12);
  }
  const proxyGeometry = new THREE.SphereGeometry(radius, 16, 12);
  proxyGeometry.translate(center.x, center.y, center.z);
  node.mesh.geometry = proxyGeometry;
  oldGeometry?.dispose();
}
function clearLoadedModel(node) {
  node.modelRequestSerial = (node.modelRequestSerial || 0) + 1;
  if (node.modelRoot) {
    node.mesh.remove(node.modelRoot);
    node.modelRoot = null;
  }
  node.hasModel = false;
  if (node.previewMesh) node.previewMesh.visible = true;
  if (node.edgeMesh) node.edgeMesh.visible = true;
  setProxyBounds(node);
  if (node.labelSprite) node.labelSprite.position.y = 0.28;
}
async function loadModelForNode(node, itemID) {
  if (!MODEL_ASSETS.has(itemID)) return;
  const requestSerial = (node.modelRequestSerial || 0) + 1;
  node.modelRequestSerial = requestSerial;
  const filename = MODEL_ASSETS.get(itemID);
  try {
    const template = await loadModelTemplate(itemID);
    if (!template || !nodes.includes(node) || node.item.itemID !== itemID || node.modelRequestSerial !== requestSerial) return;

    // Clone the scene graph for each placed item. Geometry/material resources
    // are shared from the cached GLB template to keep Quest memory use modest.
    const modelRoot = template.clone(true);
    modelRoot.updateMatrixWorld(true);
    let bounds = new THREE.Box3().setFromObject(modelRoot);
    if (bounds.isEmpty()) throw new Error("The GLB contains no visible geometry.");

    const rawSize = bounds.getSize(new THREE.Vector3());
    const longestSide = Math.max(rawSize.x, rawSize.y, rawSize.z);
    if (!Number.isFinite(longestSide) || longestSide < 0.00001) throw new Error("The GLB model has invalid dimensions.");

    // Keep the GLB's authored origin, rotation and units intact. Re-centering,
    // grounding or normalizing the scene root changes the prefab pivot relative
    // to attached children, causing a different layout after native JSON export.
    modelRoot.updateMatrixWorld(true);
    bounds = new THREE.Box3().setFromObject(modelRoot);

    modelRoot.traverse((object) => {
      if (object.isMesh) {
        object.castShadow = true;
        object.receiveShadow = true;
        object.frustumCulled = true;
      }
    });

    node.mesh.add(modelRoot);
    node.modelRoot = modelRoot;
    node.hasModel = true;
    if (node.previewMesh) node.previewMesh.visible = false;
    if (node.edgeMesh) node.edgeMesh.visible = false;
    setProxyBounds(node, bounds);
    if (node.labelSprite) node.labelSprite.position.y = Math.max(0.32, bounds.max.y + 0.10);
    syncMesh(node);
    setStatus(`${getItemDisplayName(itemID)} 3D model loaded.`);
  } catch (error) {
    console.warn(`Could not load model for ${itemID} from ./models/${filename}`, error);
    if (nodes.includes(node) && node.item.itemID === itemID && node.modelRequestSerial === requestSerial) {
      const reason = String(error?.message || error).replace(/https?:\/\/\S+/g, "model URL").slice(0, 105);
      setStatus(`3D LOAD FAILED: ${getItemDisplayName(itemID)} · ${reason}`);
    }
  }
}
function makeVisual(node) {
  // The invisible proxy remains the stable selection/grab target. The visible
  // placeholder or loaded GLB is a child, so existing controller interactions
  // and item scaleModifier behavior continue to work unchanged.
  const proxy = new THREE.Mesh(
    new THREE.SphereGeometry(0.28, 16, 12),
    new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, colorWrite: false, depthWrite: false, depthTest: false })
  );
  proxy.userData.node = node;
  proxy.name = `${node.item.itemID}-grab-proxy`;
  const previewGeometry = makeItemPreviewGeometry(node.item.itemID);
  const previewMaterial = new THREE.MeshStandardMaterial({ color: colorFor(node.item.itemID), roughness: 0.72, metalness: 0.02 });
  const previewMesh = new THREE.Mesh(previewGeometry, previewMaterial);
  previewMesh.userData.node = node;
  previewMesh.castShadow = true;
  previewMesh.receiveShadow = true;
  const edges = new THREE.LineSegments(new THREE.EdgesGeometry(previewGeometry), new THREE.LineBasicMaterial({ color: 0x10202b }));
  previewMesh.add(edges);
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: makeCanvasTexture(getItemDisplayName(node.item.itemID), { width: 512, height: 96, fontSize: 38 }), transparent: false }));
  sprite.scale.set(0.98, 0.18, 1);
  sprite.position.y = 0.28;
  node.mesh = proxy;
  node.previewMesh = previewMesh;
  node.edgeMesh = edges;
  node.labelSprite = sprite;
  node.group.add(proxy);
  proxy.add(previewMesh, sprite);
  nodeGroup(node).add(node.group);
  syncMesh(node);
  loadModelForNode(node, node.item.itemID);
}
function createNode(item, parent = null, position = null) {
  const node = {
    uid: nextId++, item, parent, children: [],
    position: position ? new THREE.Vector3(...position) : new THREE.Vector3(parent ? 0.35 : 0, parent ? 0.15 : 1.1, 0),
    quaternion: new THREE.Quaternion(), group: new THREE.Group(), mesh: null,
    previewMesh: null, edgeMesh: null, labelSprite: null, modelRoot: null,
    modelRequestSerial: 0, hasModel: false,
    edgePose: { subParentID: 0, posePos: [0, 0, 0], poseRot: [0, 0, 0, 1], wasDynamicStuck: false }
  };
  node.group.name = item.itemID;
  (parent ? parent.group : rootGroup).add(node.group);
  if (parent) parent.children.push(node);
  nodes.push(node);
  makeVisual(node);
  return node;
}
function refreshNodeID(node, id) {
  clearLoadedModel(node);
  node.item.itemID = id;
  node.group.name = id;
  node.previewMesh.material.color.copy(colorFor(id));
  const oldGeometry = node.previewMesh.geometry;
  node.previewMesh.geometry = makeItemPreviewGeometry(id);
  oldGeometry?.dispose();
  if (node.edgeMesh) {
    const oldEdgeGeometry = node.edgeMesh.geometry;
    node.edgeMesh.geometry = new THREE.EdgesGeometry(node.previewMesh.geometry);
    oldEdgeGeometry?.dispose();
  }
  const oldMap = node.labelSprite.material.map;
  node.labelSprite.material.map = makeCanvasTexture(getItemDisplayName(id), { width: 512, height: 96, fontSize: 38 });
  oldMap?.dispose();
  loadModelForNode(node, id);
}
function normalizedPoseQuaternion(values, fallback = [0, 0, 0, 1]) {
  const a = Array.isArray(values) ? values : fallback;
  return new THREE.Quaternion(
    Number.isFinite(Number(a[0])) ? Number(a[0]) : fallback[0],
    Number.isFinite(Number(a[1])) ? Number(a[1]) : fallback[1],
    Number.isFinite(Number(a[2])) ? Number(a[2]) : fallback[2],
    Number.isFinite(Number(a[3])) ? Number(a[3]) : fallback[3]
  ).normalize();
}
function nativePosePosition(values) {
  const a = Array.isArray(values) ? values : [0, 0, 0];
  return new THREE.Vector3(
    Number.isFinite(Number(a[0])) ? Number(a[0]) : 0,
    Number.isFinite(Number(a[1])) ? Number(a[1]) : 0,
    Number.isFinite(Number(a[2])) ? Number(a[2]) : 0
  );
}
function joystickStickMountFor(parent) {
  if (!["item_joystick", "item_joystick_inv_y"].includes(parent.item.itemID)) return null;
  let mount = parent.group.children.find((child) => child.userData?.joystickStickMount);
  if (!mount) {
    mount = new THREE.Group();
    mount.name = "joystick_stick_mount";
    mount.userData.joystickStickMount = true;
    mount.matrixAutoUpdate = false;
    parent.group.add(mount);
  }
  const parentScale = physicalScaleForItem(parent.item);
  const framePosition = new THREE.Vector3(0, 8.261284 * 0.005, 0).multiplyScalar(parentScale);
  const frameRotation = new THREE.Quaternion(-Math.SQRT1_2, 0, 0, Math.SQRT1_2);
  mount.matrix.compose(framePosition, frameRotation, new THREE.Vector3(0.005 * parentScale, 0.005 * parentScale, 0.005 * parentScale));
  mount.matrixWorldNeedsUpdate = true;
  return mount;
}
function readJoystickPreviewStick() {
  const session = renderer.xr.getSession();
  if (!session) return [0, 0];
  let best = [0, 0];
  for (const source of session.inputSources || []) {
    const pad = source.gamepad;
    if (!pad?.axes || pad.axes.length < 2) continue;
    const axes = Array.from(pad.axes, (value) => Number.isFinite(Number(value)) ? Number(value) : 0);
    const pair = axes.length >= 4 ? 2 : 0;
    const stick = [axes[pair] || 0, -(axes[pair + 1] || 0)];
    const magnitude = Math.hypot(...stick);
    if (magnitude > Math.hypot(...best)) best = stick;
  }
  const magnitude = Math.hypot(...best);
  if (magnitude < 0.12) return [0, 0];
  return magnitude > 1 ? best.map((value) => value / magnitude) : best;
}
function isJoystickStickEditHeld() {
  if (!renderer.xr.isPresenting || !selected ||
      !["item_joystick", "item_joystick_inv_y"].includes(selected.item.itemID)) return false;
  const session = renderer.xr.getSession();
  const rightSource = Array.from(session?.inputSources || []).find(
    (source) => source.handedness === "right" && source.gamepad
  );
  // Meta Touch WebXR mapping: buttons[4] is A on the right controller.
  const aButton = rightSource?.gamepad?.buttons?.[4];
  return Boolean(aButton?.pressed || (Number(aButton?.value) || 0) >= 0.75);
}
function updateJoystickStickMotion() {
  if (!isJoystickStickEditHeld()) return;
  const parent = selected;
  const [x, y] = readJoystickPreviewStick();
  {
    if (!["item_joystick", "item_joystick_inv_y"].includes(parent.item.itemID)) return;
    const mount = joystickStickMountFor(parent);
    if (!mount) return;
    const parentScale = physicalScaleForItem(parent.item);
    const pivot = new THREE.Vector3(0, 8.261284 * 0.005, 0).multiplyScalar(parentScale);
    const frameRotation = new THREE.Quaternion(-Math.SQRT1_2, 0, 0, Math.SQRT1_2);
    const vertical = parent.item.itemID === "item_joystick_inv_y" ? -y : y;
    const localRotation = new THREE.Quaternion().setFromEuler(
      new THREE.Euler(THREE.MathUtils.degToRad(vertical * 30), THREE.MathUtils.degToRad(x * 30), 0, "YXZ")
    );
    const deltaRotation = frameRotation.clone().multiply(localRotation).multiply(frameRotation.clone().invert()).normalize();
    const deltaPosition = pivot.clone().sub(pivot.clone().applyQuaternion(deltaRotation));
    const delta = new THREE.Matrix4().compose(deltaPosition, deltaRotation, new THREE.Vector3(1, 1, 1));
    const rest = new THREE.Matrix4().compose(
      pivot, frameRotation,
      new THREE.Vector3(0.005 * parentScale, 0.005 * parentScale, 0.005 * parentScale)
    );
    mount.matrix.copy(delta.multiply(rest));
    mount.matrixWorldNeedsUpdate = true;
  }
}
function decodeNativeJoystickEdge(edge, parent, childItem) {
  const frameScale = 0.005;
  const parentScale = physicalScaleForItem(parent.item);
  const childScale = physicalScaleForItem(childItem);
  const edgePosition = nativePosePosition(edge?.pos);
  const posePosition = nativePosePosition(edge?.posePos).multiplyScalar(childScale);
  const poseRotation = normalizedPoseQuaternion(edge?.poseRot);
  const edgeRotation = normalizedPoseQuaternion(edge?.rot);
  // Parent physical scale is part of the NetParent matrix, so convert the
  // child's anchor offset into stick-local units using both scale factors.
  const localRotation = edgeRotation.multiply(poseRotation.clone().invert()).normalize();
  const localPosition = edgePosition.sub(
    posePosition.applyQuaternion(localRotation).multiplyScalar(1 / (frameScale * parentScale))
  );
  return { position: localPosition, quaternion: localRotation };
}
function decodeNativeBaseEdge(edge, parent, childItem) {
  // Prime's base NetParent (subParentID 0) is the identity frame. Edge `pos`
  // is stored in parent-item scale units, then expanded to displayed metres.
  const parentScale = physicalScaleForItem(parent.item);
  const childScale = physicalScaleForItem(childItem);
  const edgePos = nativePosePosition(edge?.pos).multiplyScalar(parentScale);
  const edgeRot = normalizedPoseQuaternion(edge?.rot);
  const posePos = nativePosePosition(edge?.posePos).multiplyScalar(childScale);
  const poseRot = normalizedPoseQuaternion(edge?.poseRot);
  const displayedRot = edgeRot.multiply(poseRot.clone().invert()).normalize();
  const baseDisplayPos = edgePos.sub(posePos.applyQuaternion(displayedRot));
  const displayedPos = baseDisplayPos.multiplyScalar(stuckDrawRatioForItem(parent.item.itemID));
  return { position: displayedPos, quaternion: displayedRot };
}
function encodeNativeBaseEdge(child, parent) {
  // Inverse of Prime's displayPoseToEdge for the base NetParent frame.
  const poseData = child.edgePose || {};
  const posePos = Array.isArray(poseData.posePos) ? poseData.posePos : [0, 0, 0];
  const poseRot = Array.isArray(poseData.poseRot) ? poseData.poseRot : [0, 0, 0, 1];
  const childScale = physicalScaleForItem(child.item);
  const parentScale = Math.max(0.0001, physicalScaleForItem(parent.item));
  // Use the visible Three.js group transform, not a stale parallel state value.
  const displayedPosition = child.group.position.clone();
  const displayedRotation = child.group.quaternion.clone().normalize();
  const drawRatio = stuckDrawRatioForItem(parent.item.itemID);
  const anchorOffset = nativePosePosition(posePos).multiplyScalar(childScale).applyQuaternion(displayedRotation);
  const edgePosition = displayedPosition.multiplyScalar(1 / drawRatio).add(anchorOffset).multiplyScalar(1 / parentScale);
  const edgeRotation = displayedRotation.multiply(normalizedPoseQuaternion(poseRot)).normalize();
  return {
    subParentID: 0,
    pos: [round(edgePosition.x), round(edgePosition.y), round(edgePosition.z)],
    rot: [round(edgeRotation.x), round(edgeRotation.y), round(edgeRotation.z), round(edgeRotation.w)],
    posePos: posePos.map(round),
    poseRot: normalizedPoseQuaternion(poseRot).toArray().map(round),
    wasDynamicStuck: Boolean(poseData.wasDynamicStuck)
  };
}
function encodeNativeJoystickEdge(child, parent) {
  // The child group is expressed in the joystick Stick NetParent transform:
  // frame position (0, 8.261284 mm), rotation -90deg X, and uniform 0.005 scale.
  // Invert the exact frame-local conversion used by the native editor.
  const poseData = child.edgePose || {};
  const posePos = Array.isArray(poseData.posePos) ? poseData.posePos : [0, 0, 0];
  const poseRot = Array.isArray(poseData.poseRot) ? poseData.poseRot : [0, 0, 0, 1];
  const childScale = physicalScaleForItem(child.item);
  const frameScale = 0.005;
  const parentScale = physicalScaleForItem(parent.item);
  const displayPosition = child.group.position.clone();
  const displayRotation = child.group.quaternion.clone().normalize();
  const anchorOffset = nativePosePosition(posePos).multiplyScalar(childScale).applyQuaternion(displayRotation);
  const edgePosition = displayPosition.add(anchorOffset.multiplyScalar(1 / (frameScale * parentScale)));
  const edgeRotation = displayRotation.multiply(normalizedPoseQuaternion(poseRot)).normalize();
  return {
    subParentID: 1,
    pos: [round(edgePosition.x), round(edgePosition.y), round(edgePosition.z)],
    rot: [round(edgeRotation.x), round(edgeRotation.y), round(edgeRotation.z), round(edgeRotation.w)],
    posePos: posePos.map(round),
    poseRot: normalizedPoseQuaternion(poseRot).toArray().map(round),
    wasDynamicStuck: Boolean(poseData.wasDynamicStuck)
  };
}
function specialEdgeIsUnchanged(child, parent) {
  const source = child.sourceSpecialEdge;
  if (!source || !child.sourceSpecialSnapshot) return false;
  const snap = child.sourceSpecialSnapshot;
  const pos = child.group.position;
  const rot = child.group.quaternion;
  const close = (a, b) => Math.abs(a - b) < 1e-6;
  return child.item.itemID === snap.childItemID &&
    Number(child.item.scaleModifier || 0) === snap.childScale &&
    parent.item.itemID === snap.parentItemID &&
    Number(parent.item.scaleModifier || 0) === snap.parentScale &&
    close(pos.x, snap.x) && close(pos.y, snap.y) && close(pos.z, snap.z) &&
    close(rot.x, snap.qx) && close(rot.y, snap.qy) &&
    close(rot.z, snap.qz) && close(rot.w, snap.qw);
}
function serializeNode(node) {
  const item = structuredClone(node.item);
  item.children = [];
  item.stuckChildren = node.children.map((child) => {
    const serializedItem = serializeNode(child);
    if (child.sourceSpecialEdge) {
      if (!specialEdgeIsUnchanged(child, node)) {
        throw new Error(`Cannot export edited ${child.item.itemID}: its special attachment frame (${child.sourceSpecialEdge.subParentID}) is not editable yet. Restore its original pose and scale to preserve the source edge, or remove/recreate it on the base frame.`);
      }
      return { ...structuredClone(child.sourceSpecialEdge), item: serializedItem };
    }
    const subParentID = Math.round(Number(child.edgePose?.subParentID) || 0);
    const encoded = subParentID === 1 && ["item_joystick", "item_joystick_inv_y"].includes(node.item.itemID)
      ? encodeNativeJoystickEdge(child, node)
      : encodeNativeBaseEdge(child, node);
    return { item: serializedItem, ...encoded };
  });
  return item;
}
function round(n) { return Math.round(n * 10000) / 10000; }
function disposeBuild() {
  for (const n of nodes) {
    n.mesh?.geometry?.dispose();
    n.mesh?.material?.dispose();
    n.previewMesh?.geometry?.dispose();
    n.previewMesh?.material?.dispose();
    n.edgeMesh?.geometry?.dispose();
    n.edgeMesh?.material?.dispose();
    if (n.labelSprite?.material?.map) n.labelSprite.material.map.dispose();
    n.labelSprite?.material?.dispose();
  }
  rootGroup.clear();
  nodes = [];
  selected = null;
  transformGizmo.visible = false;
  nextId = 1;
}
function captureHistoryState() {
  return {
    nodes: nodes.map((node) => {
      const item = structuredClone(node.item);
      item.children = [];
      item.stuckChildren = [];
      return {
        uid: node.uid, parentUid: node.parent?.uid ?? null, item,
        position: node.position.toArray(), quaternion: node.quaternion.toArray(),
        edgePose: structuredClone(node.edgePose || {}),
        sourceSpecialEdge: node.sourceSpecialEdge ? structuredClone(node.sourceSpecialEdge) : null,
        sourceSpecialSnapshot: node.sourceSpecialSnapshot ? structuredClone(node.sourceSpecialSnapshot) : null
      };
    }),
    selectedUid: selected?.uid ?? null, pendingItemID,
    worldPosition: worldGroup.position.toArray(),
    worldQuaternion: worldGroup.quaternion.toArray(), worldScale: worldGroup.scale.toArray()
  };
}
function restoreHistoryState(snapshot) {
  disposeBuild();
  const restored = new Map();
  for (const record of snapshot.nodes) {
    const parent = record.parentUid == null ? null : restored.get(record.parentUid);
    const node = createNode(structuredClone(record.item), parent, record.position);
    node.uid = record.uid;
    node.position.fromArray(record.position);
    node.quaternion.fromArray(record.quaternion);
    node.edgePose = structuredClone(record.edgePose || {});
    if (record.sourceSpecialEdge) node.sourceSpecialEdge = structuredClone(record.sourceSpecialEdge);
    if (record.sourceSpecialSnapshot) node.sourceSpecialSnapshot = structuredClone(record.sourceSpecialSnapshot);
    node.group.position.copy(node.position);
    node.group.quaternion.copy(node.quaternion);
    syncMesh(node);
    restored.set(record.uid, node);
  }
  nextId = Math.max(0, ...snapshot.nodes.map((record) => record.uid)) + 1;
  selected = restored.get(snapshot.selectedUid) || null;
  pendingItemID = snapshot.pendingItemID || "item_crate";
  worldGroup.position.fromArray(snapshot.worldPosition);
  worldGroup.quaternion.fromArray(snapshot.worldQuaternion);
  worldGroup.scale.fromArray(snapshot.worldScale);
  worldGroup.updateMatrixWorld(true);
  updateTransformGizmo();
  redrawPanel();
}
function pushUndoState() {
  undoHistory.push(captureHistoryState());
  if (undoHistory.length > HISTORY_LIMIT) undoHistory.shift();
  redoHistory.length = 0;
  if (panelReady) redrawPanel();
}
function undoEdit() {
  if (!undoHistory.length) { setStatus("Nothing to undo yet."); return; }
  redoHistory.push(captureHistoryState());
  restoreHistoryState(undoHistory.pop());
  setStatus("Undo complete.");
}
function redoEdit() {
  if (!redoHistory.length) { setStatus("Nothing to redo yet."); return; }
  undoHistory.push(captureHistoryState());
  restoreHistoryState(redoHistory.pop());
  setStatus("Redo complete.");
}
function choose(node) {
  selected = node;
  if (node) pendingItemID = node.item.itemID;
  updateTransformGizmo();
  redrawPanel();
}
function exportBuild() {
  const root = nodes.find((n) => !n.parent);
  if (!root) { setStatus("Add a root item before exporting."); return; }
  let json;
  try {
    json = JSON.stringify(serializeNode(root), null, 2);
  } catch (error) {
    setStatus(String(error?.message || error).slice(0, 220));
    return;
  }
  const blob = new Blob([json], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${root.item.itemID || "goop_build"}.json`;
  a.style.display = "none";
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1500);
  setStatus("Export requested. Check Quest Browser downloads.");
}
function importBuild(raw) {
  const root = raw?.itemID ? raw : (Array.isArray(raw?.items) ? raw.items[0] : null);
  if (!root?.itemID) throw new Error("This JSON has no root itemID.");
  if (!validItemID(root.itemID)) throw new Error("The root item ID is not in the expected item_name format.");
  disposeBuild();
  function walk(item, parent = null, edge = null) {
    if (!item || !validItemID(item.itemID)) return null;
    let position = parent ? new THREE.Vector3(0.3, 0.1, 0) : new THREE.Vector3(0, 1.1, 0);
    let rotation = new THREE.Quaternion();
    if (parent && edge) {
      const subParentID = Math.round(Number(edge.subParentID) || 0);
      if (subParentID === 0) {
        const decoded = decodeNativeBaseEdge(edge, parent, item);
        position.copy(decoded.position);
        rotation.copy(decoded.quaternion);
      } else if (subParentID === 1 && ["item_joystick", "item_joystick_inv_y"].includes(parent.item.itemID)) {
        const decoded = decodeNativeJoystickEdge(edge, parent, item);
        position.copy(decoded.position);
        rotation.copy(decoded.quaternion);
      } else {
        // Unknown attachment frames are retained verbatim and cannot be exported after edits.
        position.copy(nativePosePosition(edge.pos));
        rotation.copy(normalizedPoseQuaternion(edge.rot));
        setStatus(`Imported ${item.itemID} with unsupported attachment frame ${subParentID}; its original edge will be preserved unless edited.`);
      }
    }
    const node = createNode(structuredClone(item), parent, position.toArray());
    node.quaternion.copy(rotation);
    if (parent && Math.round(Number(edge?.subParentID) || 0) === 1 &&
        ["item_joystick", "item_joystick_inv_y"].includes(parent.item.itemID)) {
      const mount = joystickStickMountFor(parent);
      mount.add(node.group);
    }
    node.edgePose = edge ? {
      subParentID: Math.round(Number(edge.subParentID) || 0),
      posePos: Array.isArray(edge.posePos) ? edge.posePos.slice(0, 3) : [0, 0, 0],
      poseRot: Array.isArray(edge.poseRot) ? edge.poseRot.slice(0, 4) : [0, 0, 0, 1],
      wasDynamicStuck: Boolean(edge.wasDynamicStuck)
    } : { subParentID: 0, posePos: [0, 0, 0], poseRot: [0, 0, 0, 1], wasDynamicStuck: false };
    node.item.stuckChildren = [];
    node.item.children = [];
    syncMesh(node);
    const importedSubParentID = Math.round(Number(edge?.subParentID) || 0);
    const supportedJoystickFrame = importedSubParentID === 1 &&
      ["item_joystick", "item_joystick_inv_y"].includes(parent?.item.itemID);
    if (edge && importedSubParentID !== 0 && !supportedJoystickFrame) {
      node.sourceSpecialEdge = structuredClone(edge);
      node.sourceSpecialSnapshot = {
        childItemID: node.item.itemID,
        childScale: Number(node.item.scaleModifier || 0),
        parentItemID: parent?.item.itemID || "",
        parentScale: Number(parent?.item.scaleModifier || 0),
        x: node.group.position.x, y: node.group.position.y, z: node.group.position.z,
        qx: node.group.quaternion.x, qy: node.group.quaternion.y,
        qz: node.group.quaternion.z, qw: node.group.quaternion.w
      };
    }
    for (const childEdge of (item.stuckChildren || [])) if (childEdge?.item) walk(childEdge.item, node, childEdge);
    return node;
  }
  const first = walk(root);
  choose(first);
  setStatus("Imported. Select an item to keep editing in VR.");
}
function openIDKeyboard(target = "selected") {
  keyboardTarget = target;
  keyboardDraft = target === "pending" ? (pendingItemID || "item_crate") : (selected?.item.itemID || pendingItemID || "item_crate");
  if (!keyboardDraft.startsWith("item_")) keyboardDraft = "item_" + keyboardDraft;
  itemCatalogOpen = false;
  keyboardOpen = true;
  redrawPanel();
}
function handleKeyboardAction(action) {
  if (action.startsWith("key:")) {
    const ch = action.slice(4);
    if (keyboardDraft.length < 53) keyboardDraft += ch;
  } else if (action === "keyBack") {
    if (keyboardDraft.length > 5) keyboardDraft = keyboardDraft.slice(0, -1);
  } else if (action === "keyClear") {
    keyboardDraft = "item_";
  } else if (action === "keyCancel") {
    keyboardOpen = false;
  } else if (action === "keyDone") {
    if (!validItemID(keyboardDraft)) { setStatus("Use letters, numbers, _ or - after item_."); return; }
    if (UNSUPPORTED_ITEM_ID_PATTERN.test(keyboardDraft)) {
      setStatus("That ID is not available in this builder's item catalog.");
      redrawPanel();
      return;
    }
    pendingItemID = keyboardDraft;
    if (keyboardTarget === "selected" && selected) {
      pushUndoState();
      refreshNodeID(selected, keyboardDraft);
    }
    keyboardOpen = false;
    keyboardTarget = "selected";
    setStatus(`Item ID set to ${keyboardDraft}.`);
  }
  redrawPanel();
}
function nudgeMove(index) {
  if (!selected) { setStatus("Select an item first."); return; }
  pushUndoState();
  const axisIndex = Math.floor(index / 2);
  const amount = (index % 2 === 0 ? -1 : 1) * (snapConfig.positionEnabled ? snapConfig.positionStep : 0.05);
  selected.group.updateWorldMatrix(true, false);
  const worldPosition = selected.group.getWorldPosition(new THREE.Vector3());
  worldPosition.setComponent(axisIndex, worldPosition.getComponent(axisIndex) + amount);
  setNodeWorldPosition(selected, snapWorldPosition(worldPosition));
  redrawPanel();
}
function nudgeRotate(index) {
  if (!selected) { setStatus("Select an item first."); return; }
  pushUndoState();
  const axisIndex = Math.floor(index / 2);
  const sign = index % 2 === 0 ? -1 : 1;
  const requested = THREE.MathUtils.degToRad(snapConfig.rotationEnabled ? snapConfig.rotationStepDegrees : 15) * sign;
  const angle = snapConfig.rotationEnabled ? roundToStep(requested, THREE.MathUtils.degToRad(snapConfig.rotationStepDegrees)) : requested;
  const axis = worldAxes[axisIndex].clone();
  selected.group.updateWorldMatrix(true, false);
  const parent = selected.group.parent;
  parent.updateWorldMatrix(true, false);
  const parentQ = parent.getWorldQuaternion(new THREE.Quaternion());
  const worldQ = selected.group.getWorldQuaternion(new THREE.Quaternion());
  const desiredWorldQ = new THREE.Quaternion().setFromAxisAngle(axis, angle).multiply(worldQ).normalize();
  selected.quaternion.copy(parentQ.invert().multiply(desiredWorldQ).normalize());
  syncMesh(selected);
  redrawPanel();
}
function setMenuVisible(visible) {
  menuVisible = Boolean(visible);
  panel.visible = menuVisible;
  if (menuVisible && panelReady) redrawPanel();
  if (menuVisible) {
    setStatus("Editor menu opened.");
  } else {
    setStatus("Editor menu hidden. Press X on the left controller to reopen it.");
  }
}

function visibleMenuPickTargets() {
  // Menu visibility is controlled by the physical X button on the left Quest
  // controller, not by a floating wrist button in the scene.
  return menuVisible ? [...uiButtons] : [];
}

function runAction(action) {
  playSfx("click");
  if (action === "undo") { undoEdit(); return; }
  if (action === "redo") { redoEdit(); return; }
  if (action === "toggleMenu") {
    setMenuVisible(!menuVisible);
    return;
  }
  if (action.startsWith("key") || action.startsWith("key:")) { handleKeyboardAction(action); return; }
  if (action.startsWith("snapKey") || action.startsWith("snapKey:")) { handleSnapValueAction(action); return; }
  if (snapValueKeyboardOpen) return;
  if (action === "testSfx") {
    // Plays the four supplied clips in sequence so the user can verify that
    // every asset is being found and that Quest Browser audio is unlocked.
    playSfx("hover");
    setTimeout(() => playSfx("click"), 180);
    setTimeout(() => playSfx("snapOut"), 360);
    setTimeout(() => playSfx("snapIn"), 540);
    setStatus("Sound test: hover, click, snap-out, snap-in.");
    return;
  }
  if (action === "openItemCatalog") {
    catalogAddAsChild = false;
    openItemCatalog();
    return;
  }
  if (action === "openHierarchy") {
    openHierarchy(selected ? "children" : "parents");
    return;
  }
  if (action === "hierarchyParents" || action === "hierarchyChildren") {
    hierarchyListMode = action === "hierarchyParents" ? "parents" : "children";
    hierarchyPage = 0;
    redrawPanel();
    return;
  }
  if (action === "hierarchyPagePrev" || action === "hierarchyPageNext") {
    const count = Math.max(1, Math.ceil(getHierarchyEntries().length / ITEM_PAGE_SIZE));
    hierarchyPage = THREE.MathUtils.clamp(hierarchyPage + (action.endsWith("Prev") ? -1 : 1), 0, count - 1);
    redrawPanel();
    return;
  }
  if (action.startsWith("hierarchySelect:")) {
    const uid = Number(action.slice("hierarchySelect:".length));
    const node = nodes.find((entry) => entry.uid === uid);
    if (!node) { setStatus("That item is no longer in the build."); redrawPanel(); return; }
    choose(node);
    hierarchyOpen = true;
    hierarchyListMode = "children";
    hierarchyPage = 0;
    setStatus(`Viewing ${getItemDisplayName(node.item.itemID)} in the workspace. Its children are listed here.`);
    redrawPanel();
    return;
  }
  if (action === "hierarchyAddChild") {
    if (!selected) { setStatus("Choose a parent item first, then add a child."); return; }
    catalogAddAsChild = true;
    openItemCatalog();
    return;
  }
  if (action === "hierarchyBack") {
    hierarchyOpen = false;
    redrawPanel();
    return;
  }
  if (action === "catalogCategoryPrev" || action === "catalogCategoryNext") {
    const direction = action.endsWith("Prev") ? -1 : 1;
    itemCatalogCategoryIndex = (itemCatalogCategoryIndex + direction + ITEM_CATEGORIES.length) % ITEM_CATEGORIES.length;
    itemCatalogPage = 0;
    redrawPanel();
    return;
  }
  if (action === "catalogPagePrev" || action === "catalogPageNext") {
    const entries = getCatalogCategoryItems();
    const pageCount = Math.max(1, Math.ceil(entries.length / ITEM_PAGE_SIZE));
    const direction = action.endsWith("Prev") ? -1 : 1;
    itemCatalogPage = THREE.MathUtils.clamp(itemCatalogPage + direction, 0, pageCount - 1);
    redrawPanel();
    return;
  }
  if (action.startsWith("catalogPick:")) {
    const id = action.slice("catalogPick:".length);
    const entry = ITEM_CATALOG_BY_ID.get(id);
    if (!entry) {
      setStatus("That item is not in the supported item catalog.");
      return;
    }
    pendingItemID = entry.id;
    itemCatalogOpen = false;
    if (catalogAddAsChild) {
      catalogAddAsChild = false;
      if (!selected || !nodes.includes(selected)) {
        setStatus("Choose a parent item before adding a child.");
        hierarchyOpen = true;
        redrawPanel();
        return;
      }
      const parent = selected;
      pushUndoState();
      const child = createNode(makeItem(entry.id), parent, [0.35, 0.15, 0]);
      hierarchyOpen = true;
      hierarchyListMode = "children";
      hierarchyPage = Math.floor(Math.max(0, parent.children.indexOf(child)) / ITEM_PAGE_SIZE);
      choose(child);
      hierarchyOpen = true;
      hierarchyListMode = "children";
      setStatus(`Added ${entry.name} as a child of ${getItemDisplayName(parent.item.itemID)}. The 3D item is selected in the workspace.`);
      redrawPanel();
      return;
    }
    const hasModel = MODEL_ASSETS.has(entry.id);
    setStatus(hasModel
      ? `Next item: ${entry.name}. The uploaded GLB will be checked when placed.`
      : `Next item: ${entry.name}. A placeholder preview will be used until a model is added.`);
    return;
  }
  if (action === "catalogCustomID") {
    openIDKeyboard("pending");
    return;
  }
  if (action === "catalogBack") {
    itemCatalogOpen = false;
    catalogAddAsChild = false;
    redrawPanel();
    return;
  }
  if (action === "snapSettings") {
    itemCatalogOpen = false;
    hierarchyOpen = false;
    snapSettingsOpen = true;
    redrawPanel();
    return;
  }
  if (action === "snapBack") {
    snapSettingsOpen = false;
    redrawPanel();
    return;
  }
  if (action === "snapPositionToggle") {
    snapConfig.positionEnabled = !snapConfig.positionEnabled;
    playSfx(snapConfig.positionEnabled ? "snapIn" : "snapOut");
    setStatus(`Position snapping ${snapConfig.positionEnabled ? "enabled" : "disabled"}.`);
    return;
  }
  if (action === "snapRotationToggle") {
    snapConfig.rotationEnabled = !snapConfig.rotationEnabled;
    playSfx(snapConfig.rotationEnabled ? "snapIn" : "snapOut");
    setStatus(`Rotation snapping ${snapConfig.rotationEnabled ? "enabled" : "disabled"}.`);
    return;
  }
  if (action === "positionStepCustom") { snapValueOpen("position"); return; }
  if (action === "rotationStepCustom") { snapValueOpen("rotation"); return; }
  if (action === "positionStepDown" || action === "positionStepUp") {
    const factor = action.endsWith("Down") ? 0.5 : 2;
    snapConfig.positionStep = Math.max(0.001, Math.min(10, Number((snapConfig.positionStep * factor).toFixed(4))));
    redrawPanel();
    return;
  }
  if (action === "rotationStepDown" || action === "rotationStepUp") {
    const factor = action.endsWith("Down") ? 0.5 : 2;
    snapConfig.rotationStepDegrees = Math.max(0.1, Math.min(180, Number((snapConfig.rotationStepDegrees * factor).toFixed(2))));
    redrawPanel();
    return;
  }
  if (keyboardOpen) return;
  if (action === "newRoot") {
    if (nodes.some((n) => !n.parent)) { setStatus("A root already exists. Import a different build to replace it."); return; }
    if (!validItemID(pendingItemID)) pendingItemID = "item_crate";
    pushUndoState();
    choose(createNode(makeItem(pendingItemID), null, [0, 1.1, 0.45]));
    setStatus("Root created. Select it to show the XYZ movement and rotation gizmos.");
  } else if (action === "addPart") {
    if (!selected) { setStatus("Select the parent item before adding a part."); return; }
    pushUndoState();
    const child = createNode(makeItem(pendingItemID), selected, [0.35, 0.15, 0]);
    choose(child);
    setStatus("Part attached to the selected parent.");
  } else if (action === "delete") {
    if (!selected) { setStatus("Select a part first."); return; }
    if (!selected.parent) { setStatus("The root cannot be deleted. Import another build to replace it."); return; }
    pushUndoState();
    const parent = selected.parent;
    const doomed = [];
    const collect = (n) => { doomed.push(n); n.children.forEach(collect); };
    collect(selected);
    parent.children = parent.children.filter((n) => n !== selected);
    for (const n of doomed) {
      n.group.parent?.remove(n.group);
      nodes = nodes.filter((x) => x !== n);
    }
    choose(parent);
    setStatus("Selected part and its attached children deleted.");
  } else if (action === "editID") {
    openIDKeyboard();
  } else if (action === "export") {
    exportBuild();
  } else if (action === "import") {
    setStatus("Choose an invention JSON file in the Quest file picker.");
    $("fileInput").click();
  } else if (action.startsWith("move:")) {
    nudgeMove(Number(action.split(":")[1]));
  } else if (action.startsWith("rotate:")) {
    nudgeRotate(Number(action.split(":")[1]));
  } else if (action.startsWith("scale:")) {
    if (!gizmoEnabled) { setStatus("Gizmo off: pick up the item and use both controller grips to resize it."); return; }
    if (!selected) { setStatus("Select an item first."); return; }
    pushUndoState();
    selected.item.scaleModifier = Math.max(-128, Math.min(127, Number(selected.item.scaleModifier || 0) + Number(action.split(":")[1])));
    syncMesh(selected);
    setStatus(`Scale modifier: ${selected.item.scaleModifier}`);
  }
}

function closestPointOnAxisSegment(point, center, axis, minT, maxT) {
  const relative = point.clone().sub(center);
  const t = THREE.MathUtils.clamp(relative.dot(axis), minT, maxT);
  return center.clone().addScaledVector(axis, t);
}
function findGizmoHandleAtPoint(point) {
  if (!transformGizmo.visible || !selected) return null;
  transformGizmo.updateMatrixWorld(true);
  const center = transformGizmo.getWorldPosition(new THREE.Vector3());
  let best = null;
  let bestDistance = Infinity;
  for (const handle of gizmoHandles) {
    const axis = handle.axis;
    let distance;
    if (handle.kind === "translate") {
      const closest = closestPointOnAxisSegment(point, center, axis, -0.82, 0.82);
      distance = point.distanceTo(closest);
      if (distance < 0.25 && distance < bestDistance) {
        best = handle;
        bestDistance = distance;
      }
    } else {
      const relative = point.clone().sub(center);
      const axial = relative.dot(axis);
      const radial = relative.addScaledVector(axis, -axial).length();
      distance = Math.hypot(axial, radial - 0.53);
      if (distance < 0.24 && distance < bestDistance) {
        best = handle;
        bestDistance = distance;
      }
    }
  }
  return best;
}
function getRingBasis(axis) {
  if (Math.abs(axis.x) > 0.9) return [new THREE.Vector3(0, 1, 0), new THREE.Vector3(0, 0, 1)];
  if (Math.abs(axis.y) > 0.9) return [new THREE.Vector3(0, 0, 1), new THREE.Vector3(1, 0, 0)];
  return [new THREE.Vector3(1, 0, 0), new THREE.Vector3(0, 1, 0)];
}
function ringAngle(point, center, axis) {
  const [u, v] = getRingBasis(axis);
  const relative = point.clone().sub(center);
  return Math.atan2(relative.dot(v), relative.dot(u));
}
function wrapAngleDelta(angle) {
  while (angle > Math.PI) angle -= Math.PI * 2;
  while (angle < -Math.PI) angle += Math.PI * 2;
  return angle;
}
function makeGizmoDrag(node, handle, startPoint) {
  const parent = node.group.parent;
  parent.updateWorldMatrix(true, false);
  node.group.updateWorldMatrix(true, false);
  const parentWorldQuaternion = parent.getWorldQuaternion(new THREE.Quaternion());
  const inverseParentWorldQuaternion = parentWorldQuaternion.clone().invert();
  const inverseParentWorldMatrix = parent.matrixWorld.clone().invert();
  const startWorldPosition = node.group.getWorldPosition(new THREE.Vector3());
  const startWorldQuaternion = node.group.getWorldQuaternion(new THREE.Quaternion());
  const initialAngle = handle.kind === "rotate" ? ringAngle(startPoint, startWorldPosition, handle.axis) : 0;
  return {
    mode: "gizmo", node, handle,
    axis: handle.axis.clone().normalize(),
    center: startWorldPosition.clone(),
    startPoint: startPoint.clone(),
    startPosition: node.position.clone(),
    startQuaternion: node.quaternion.clone(),
    startWorldPosition: startWorldPosition.clone(),
    startWorldQuaternion,
    inverseParentWorldQuaternion,
    inverseParentWorldMatrix,
    lastAngle: initialAngle,
    accumulatedAngle: 0
  };
}
function applyGizmoDrag(drag, point) {
  if (!nodes.includes(drag.node)) return;
  if (drag.handle.kind === "translate") {
    const amount = point.clone().sub(drag.startPoint).dot(drag.axis);
    let desiredWorldPosition = drag.center.clone().addScaledVector(drag.axis, amount);
    desiredWorldPosition = snapWorldPosition(desiredWorldPosition);
    drag.node.position.copy(desiredWorldPosition.applyMatrix4(drag.inverseParentWorldMatrix));
  } else {
    // Track small per-frame angular changes instead of comparing only against
    // the original angle. This prevents angle-wrap jumps at +/-180 degrees.
    const currentAngle = ringAngle(point, drag.center, drag.axis);
    const angularDelta = wrapAngleDelta(currentAngle - drag.lastAngle);
    if (Number.isFinite(angularDelta)) drag.accumulatedAngle += angularDelta;
    drag.lastAngle = currentAngle;

    let appliedAngle = drag.accumulatedAngle;
    if (snapConfig.rotationEnabled) {
      const step = THREE.MathUtils.degToRad(snapConfig.rotationStepDegrees);
      appliedAngle = roundToStep(appliedAngle, step);
    }
    const worldDelta = new THREE.Quaternion().setFromAxisAngle(drag.axis, appliedAngle);
    const desiredWorldQuaternion = worldDelta.multiply(drag.startWorldQuaternion.clone()).normalize();
    drag.node.quaternion.copy(
      drag.inverseParentWorldQuaternion.clone().multiply(desiredWorldQuaternion).normalize()
    );

    // Hard-lock the original world-space pivot for every rotation frame.
    // The gizmo may rotate the orientation, but must never translate/orbit it.
    drag.node.position.copy(
      drag.startWorldPosition.clone().applyMatrix4(drag.inverseParentWorldMatrix)
    );
  }
  syncMesh(drag.node);
}
function beginHandGizmoDrag(input, proxy, handle) {
  if (!selected || !handle) return false;
  pushUndoState();
  const drag = makeGizmoDrag(selected, handle, proxy.position);
  drag.proxy = proxy;
  handDragStates.set(input, drag);
  const snapEnabled = handle.kind === "translate" ? snapConfig.positionEnabled : snapConfig.rotationEnabled;
  if (snapEnabled) playSfx("snapOut");
  const label = handle.kind === "translate" ? "Move axis" : "Rotation ring";
  setStatus(`${label} grabbed. Drag along the handle, then release your pinch.`);
  return true;
}
function getControllerRay(controller) {
  controller.updateMatrixWorld(true);
  tempMatrix.identity().extractRotation(controller.matrixWorld);
  raycaster.ray.origin.setFromMatrixPosition(controller.matrixWorld);
  raycaster.ray.direction.set(0, 0, -1).applyMatrix4(tempMatrix);
  raycaster.near = 0.02;
  raycaster.far = 10;
}
function pickNode(controller) {
  getControllerRay(controller);
  const hits = raycaster.intersectObjects(nodes.map((n) => n.mesh), false);
  return hits.length ? hits[0].object.userData.node : null;
}
function pickGizmoHandle(controller) {
  // Explicitly disable picking while B/object-only mode is active. Three.js
  // raycasting may still hit child meshes under a hidden parent, so relying on
  // transformGizmo.visible alone can let invisible handles steal object grabs.
  if (!gizmoEnabled || !transformGizmo.visible || !selected) return null;
  transformGizmo.updateMatrixWorld(true);
  getControllerRay(controller);
  const hits = raycaster.intersectObjects(gizmoPickMeshes, false);
  return hits.length ? hits[0] : null;
}
function onTrigger(controller) {
  getControllerRay(controller);
  const buttonHits = raycaster.intersectObjects(visibleMenuPickTargets(), false);
  if (buttonHits.length) {
    runAction(buttonHits[0].object.userData.action);
    return;
  }
  const node = pickNode(controller);
  if (node) {
    choose(node);
    setStatus(`Selected ${node.item.itemID}. Use its double arrows to move and circles to rotate.`);
  }
}
function nodeGrabSurfaceDistance(node, point) {
  if (!node?.mesh) return Infinity;
  node.mesh.updateWorldMatrix(true, false);
  const geometry = node.mesh.geometry;
  if (!geometry.boundingSphere) geometry.computeBoundingSphere();
  const sphere = geometry.boundingSphere;
  if (!sphere) return Infinity;
  const center = sphere.center.clone().applyMatrix4(node.mesh.matrixWorld);
  const worldScale = node.mesh.getWorldScale(new THREE.Vector3());
  const radius = sphere.radius * Math.max(Math.abs(worldScale.x), Math.abs(worldScale.y), Math.abs(worldScale.z));
  // Distance to the outside of the visible mesh, not just its origin. This
  // makes larger objects much easier to pick up without making tiny objects
  // require an exact centre hit.
  return Math.max(0, point.distanceTo(center) - radius);
}
function nearestNodeToHand(grip, maxSurfaceDistance = 0.38) {
  grip.updateMatrixWorld(true);
  const handPosition = new THREE.Vector3().setFromMatrixPosition(grip.matrixWorld);
  let nearest = null;
  let bestDistance = maxSurfaceDistance;
  for (const node of nodes) {
    const distance = nodeGrabSurfaceDistance(node, handPosition);
    if (distance < bestDistance) {
      bestDistance = distance;
      nearest = node;
    }
  }
  return nearest;
}
function beginDrag(rayController, grip) {
  // In full-edit mode, a visible gizmo handle has priority. In B/object-only
  // mode, never test gizmo pickers: hold grip near the actual part to grab it.
  const gizmoHit = gizmoEnabled ? pickGizmoHandle(rayController) : null;
  if (gizmoHit && selected) {
    pushUndoState();
    grip.updateMatrixWorld(true);
    const gripPosition = new THREE.Vector3().setFromMatrixPosition(grip.matrixWorld);
    const drag = makeGizmoDrag(selected, gizmoHit.object.userData.gizmoHandle, gizmoHit.point);
    drag.grip = grip;
    drag.pointerOffset = gizmoHit.point.clone().sub(gripPosition);
    dragStates.set(rayController, drag);
    const snapEnabled = drag.handle.kind === "translate" ? snapConfig.positionEnabled : snapConfig.rotationEnabled;
    if (snapEnabled) playSfx("snapOut");
    setStatus(drag.handle.kind === "translate" ? "Moving on the selected XYZ axis." : "Turning the selected rotation ring.");
    return;
  }
  // Grab the closest part to the tracked controller grip, rather than dragging
  // from the controller's aim-ray pose. This makes the part follow hand motion.
  let node = nearestNodeToHand(grip, gizmoEnabled ? 0.48 : 0.68);
  if (!node && selected) {
    grip.updateMatrixWorld(true);
    const handPosition = new THREE.Vector3().setFromMatrixPosition(grip.matrixWorld);
    if (nodeGrabSurfaceDistance(selected, handPosition) < (gizmoEnabled ? 0.60 : 0.82)) node = selected;
  }
  if (!node) {
    setStatus("Move your controller hand close to a part, then hold the grip button to pick it up.");
    return;
  }
  grip.updateMatrixWorld(true);
  node.group.updateMatrixWorld(true);
  const offset = grip.matrixWorld.clone().invert().multiply(node.group.matrixWorld);
  pushUndoState();
  dragStates.set(rayController, {
    mode: "object", node, grip, offset,
    lockedLocalQuaternion: gizmoEnabled ? null : node.quaternion.clone()
  });
  if (snapConfig.positionEnabled || snapConfig.rotationEnabled) playSfx("snapOut");
  choose(node);
  setStatus(`Holding ${node.item.itemID}. Move your controller hand; release grip to place it.`);
}
function updateDrags() {
  if (twoHandScaleState && updateTwoHandScale()) return;
  for (const [rayController, drag] of dragStates.entries()) {
    const node = drag.node;
    if (!nodes.includes(node)) { dragStates.delete(rayController); continue; }
    drag.grip.updateMatrixWorld(true);
    if (drag.mode === "gizmo") {
      const gripPosition = new THREE.Vector3().setFromMatrixPosition(drag.grip.matrixWorld);
      applyGizmoDrag(drag, gripPosition.add(drag.pointerOffset));
      continue;
    }
    applyObjectDrag(node, drag.grip, drag.offset, drag.lockedLocalQuaternion);
  }
}
function controllerGripWorldPosition(record) {
  // Controller grip poses are tracked in the XR scene, independently of the
  // movable editor workspace. Read the pose after updating its world matrix.
  record.grip.updateWorldMatrix(true, false);
  return record.grip.getWorldPosition(new THREE.Vector3());
}
function refreshControllerInputSources() {
  // Refresh from the live XR session every frame. Relying only on the
  // connected event can leave a controller's handedness/gamepad unset on
  // some Quest Browser builds.
  const sources = Array.from(renderer.xr.getSession()?.inputSources || []);
  for (const record of controllerRecords) {
    const source = sources.find((candidate) => candidate.handedness === record.handedness)
      || sources[record.index]
      || null;
    if (source) {
      record.inputSource = source;
      record.handedness = source.handedness || record.handedness;
    }
  }
}
function isControllerGripHeld(record) {
  const source = record.inputSource || record.controller.userData?.inputSource || record.grip.userData?.inputSource;
  // XR-standard WebXR gamepads expose squeeze/grip as button 1. The event
  // flag remains a fallback for runtimes that don't expose that button.
  const squeezeButton = source?.gamepad?.buttons?.[1];
  return Boolean(record.squeezePressed || squeezeButton?.pressed || (Number(squeezeButton?.value) || 0) >= 0.65);
}
function findHeldObjectDrag() {
  // Item scaling requires an active physical grab, never mere selection.
  // Prefer the selected part if both controllers happen to hold objects.
  let fallback = null;
  for (const drag of dragStates.values()) {
    if (!drag || drag.mode !== "object" || !drag.node || !nodes.includes(drag.node)) continue;
    if (drag.node === selected) return drag;
    fallback ||= drag;
  }
  return fallback;
}
function tryBeginTwoHandScale() {
  if (twoHandScaleState || scaleGestureNeedsRelease) return false;
  const leftRecord = controllerRecords.find((record) => record.handedness === "left");
  const rightRecord = controllerRecords.find((record) => record.handedness === "right");
  if (!leftRecord || !rightRecord || !isControllerGripHeld(leftRecord) || !isControllerGripHeld(rightRecord)) return false;

  const leftPosition = controllerGripWorldPosition(leftRecord);
  const rightPosition = controllerGripWorldPosition(rightRecord);
  const startDistance = leftPosition.distanceTo(rightPosition);
  if (!Number.isFinite(startDistance) || startDistance < 0.08) return false;

  const heldObjectDrag = findHeldObjectDrag();
  // With B/gizmo OFF, this becomes object-only mode: two grips must belong to
  // an object already picked up with one controller. Empty-hand grips never
  // resize or move the player/workspace in this mode.
  if (!gizmoEnabled && !heldObjectDrag) {
    setStatus("OBJECT-ONLY MODE: grab an item with one controller first, keep holding it, then squeeze the other controller to resize it. The hidden gizmo cannot intercept grabs.");
    return false;
  }

  // Both grips on an actual held object mean item scaling; with the gizmo on,
  // empty hands can still invoke player scaling.
  dragStates.delete(leftRecord.controller);
  dragStates.delete(rightRecord.controller);

  pushUndoState();
  if (heldObjectDrag) {
    const node = heldObjectDrag.node;
    node.group.updateWorldMatrix(true, false);
    const startWorldPosition = node.group.getWorldPosition(new THREE.Vector3());
    const startMidpoint = leftPosition.clone().add(rightPosition).multiplyScalar(0.5);
    const startModifier = Number(node.item.scaleModifier || 0);
    const startScale = physicalScaleForItem(node.item);
    twoHandScaleState = {
      kind: "item",
      node,
      leftRecord,
      rightRecord,
      startDistance,
      startScale,
      startWorldPosition,
      startMidpoint
    };
    setStatus("ITEM SCALE ACTIVE · Holding the object with both grips. Pull apart to enlarge; bring together to shrink.");
  } else {
    // Scale the virtual world around the headset, not around the controller
    // midpoint. This makes the user feel larger/smaller while keeping their
    // current viewing position stable. Translating both grips moves the player
    // through the workspace independently on X, Y and Z.
    worldGroup.updateWorldMatrix(true, false);
    const xrCamera = renderer.xr.getCamera(camera);
    xrCamera.updateMatrixWorld(true);
    const playerAnchorWorld = xrCamera.getWorldPosition(new THREE.Vector3());
    const playerAnchorLocal = worldGroup.worldToLocal(playerAnchorWorld.clone());
    const startMidpoint = leftPosition.clone().add(rightPosition).multiplyScalar(0.5);
    twoHandScaleState = {
      kind: "player",
      leftRecord,
      rightRecord,
      startDistance,
      startWorldScale: Math.max(0.0001, Math.abs(worldGroup.scale.x)),
      startWorldPosition: worldGroup.position.clone(),
      startWorldQuaternion: worldGroup.quaternion.clone(),
      playerAnchorWorld: playerAnchorWorld.clone(),
      playerAnchorLocal,
      // Capture the direction the player is facing so size changes can push
      // the player backward along that direction, just like ASMBL's editor.
      startViewDirection: xrCamera.getWorldDirection(new THREE.Vector3()).normalize(),
      startMidpoint: startMidpoint.clone()
    };
    setStatus("PLAYER SIZE + MOVE ACTIVE · Pull hands apart to grow; bring them together to shrink. Move both hands together in X, Y or Z to move through the workspace.");
    drawScaleFeedback("PLAYER", 1 / Math.max(0.0001, worldGroup.scale.x), true);
  }
  return true;
}
function finishTwoHandScale() {
  if (!twoHandScaleState) return;
  const finishedKind = twoHandScaleState.kind;
  const finishedScale = finishedKind === "item"
    ? physicalScaleForItem(twoHandScaleState.node?.item)
    : 1 / Math.max(0.0001, Math.abs(worldGroup.scale.x));
  twoHandScaleState = null;
  drawScaleFeedback(finishedKind === "item" ? "ITEM" : "PLAYER", finishedScale, false);
  scaleGestureNeedsRelease = true;
  for (const record of controllerRecords) dragStates.delete(record.controller);
  setStatus(finishedKind === "item"
    ? "Item scaling finished. Release both grips before another scale gesture."
    : "Player scaling finished. Release both grips before another scale gesture.");
}
function pollTwoHandScaleGesture() {
  if (!renderer.xr.isPresenting) return;
  const leftRecord = controllerRecords.find((record) => record.handedness === "left");
  const rightRecord = controllerRecords.find((record) => record.handedness === "right");
  if (!leftRecord || !rightRecord) return;

  const leftHeld = isControllerGripHeld(leftRecord);
  const rightHeld = isControllerGripHeld(rightRecord);
  const bothHeld = leftHeld && rightHeld;
  if (scaleGestureNeedsRelease) {
    if (!leftHeld && !rightHeld) scaleGestureNeedsRelease = false;
    return;
  }
  if (twoHandScaleState) {
    if (!bothHeld) finishTwoHandScale();
    else updateTwoHandScale();
  } else if (bothHeld) {
    tryBeginTwoHandScale();
  }
}
function applyPlayerScaleAndMove(state, targetScale, handTranslation) {
  // Rebuild from the gesture-start transform each frame to avoid cumulative
  // drift. Scaling is anchored at the headset/player position, then a separate
  // pushback offsets the player backward along their original facing direction.
  // The pushback is based on the absolute size change, so growing and shrinking
  // both move the player backward instead of cancelling each other out.
  worldGroup.position.copy(state.startWorldPosition);
  worldGroup.quaternion.copy(state.startWorldQuaternion);
  worldGroup.scale.setScalar(targetScale);
  worldGroup.updateMatrixWorld(true);

  const transformedPlayerAnchor = state.playerAnchorLocal.clone().applyMatrix4(worldGroup.matrixWorld);
  worldGroup.position.add(state.playerAnchorWorld.clone().sub(transformedPlayerAnchor));
  // Vertical hand movement is inverted for the player-size grab:
  // pulling both controllers up moves the player down, and vice versa.
  const playerGrabTranslation = handTranslation.clone();
  playerGrabTranslation.y *= -1;
  worldGroup.position.sub(playerGrabTranslation);

  const startPlayerScale = 1 / Math.max(0.0001, state.startWorldScale);
  const targetPlayerScale = 1 / Math.max(0.0001, targetScale);
  const pushbackDistance = Math.abs(targetPlayerScale - startPlayerScale);
  worldGroup.position.addScaledVector(state.startViewDirection, pushbackDistance);
  worldGroup.updateMatrixWorld(true);
}
function updateTwoHandScale() {
  const state = twoHandScaleState;
  if (!state) return false;
  const leftPosition = controllerGripWorldPosition(state.leftRecord);
  const rightPosition = controllerGripWorldPosition(state.rightRecord);
  const currentDistance = leftPosition.distanceTo(rightPosition);
  if (!Number.isFinite(currentDistance) || currentDistance < 0.03) return true;

  const scaleFactor = currentDistance / state.startDistance;
  if (state.kind === "player") {
    // Pulling the hands apart makes the virtual player larger, so the
    // surrounding workspace becomes smaller relative to the headset.
    const desiredWorldScale = THREE.MathUtils.clamp(state.startWorldScale / scaleFactor, 0.25, 4.0);
    const currentMidpoint = leftPosition.clone().add(rightPosition).multiplyScalar(0.5);
    const handTranslation = currentMidpoint.clone().sub(state.startMidpoint);
    const scaleChanged = Math.abs(desiredWorldScale - worldGroup.scale.x) > 0.0005;
    const playerMoved = handTranslation.lengthSq() > 0.000004;
    if (scaleChanged || playerMoved) {
      applyPlayerScaleAndMove(state, desiredWorldScale, handTranslation);
      drawScaleFeedback("PLAYER", 1 / desiredWorldScale, true);
      updateTransformGizmo();
    }
    return true;
  }

  if (!nodes.includes(state.node)) return false;
  const scaleRange = scaleRangeForItem(state.node.item.itemID);
  const desiredScale = THREE.MathUtils.clamp(state.startScale * scaleFactor, scaleRange.min, scaleRange.max);
  drawScaleFeedback("ITEM", desiredScale, true);
  const modifier = scaleModifierForPhysicalScale(desiredScale, state.node.item.itemID);
  if (modifier !== Number(state.node.item.scaleModifier || 0)) {
    state.node.item.scaleModifier = modifier;
    syncMesh(state.node);
  }
  // Keep the held item centred between the two hands while it scales.
  const currentMidpoint = leftPosition.clone().add(rightPosition).multiplyScalar(0.5);
  const desiredWorldPosition = state.startWorldPosition.clone().add(currentMidpoint.sub(state.startMidpoint));
  setNodeWorldPosition(state.node, snapWorldPosition(desiredWorldPosition));
  return true;
}

function applyStickDeadzone(value, deadzone) {
  const magnitude = Math.abs(value);
  if (magnitude <= deadzone) return 0;
  return Math.sign(value) * ((magnitude - deadzone) / (1 - deadzone));
}
function getThumbstickAxes(inputSource) {
  const gamepad = inputSource?.gamepad;
  if (!gamepad?.axes) return { x: 0, y: 0 };
  const axes = gamepad.axes;
  // xr-standard reserves axes[2]/[3] for the thumbstick when a touchpad
  // is also exposed; on simpler mappings the first pair is the stick.
  const pair = axes.length >= 4 ? 2 : 0;
  return {
    x: applyStickDeadzone(Number(axes[pair] || 0), joystickConfig.deadzone),
    y: applyStickDeadzone(Number(axes[pair + 1] || 0), joystickConfig.deadzone)
  };
}
function applyPlayerSnapTurn(xrCamera, direction) {
  const pivot = xrCamera.getWorldPosition(new THREE.Vector3());
  pivot.y = 0; // turn around the player's floor position, not head height
  const angle = THREE.MathUtils.degToRad(joystickConfig.turnStepDegrees) * direction;
  const turn = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), angle);
  worldGroup.position.sub(pivot).applyQuaternion(turn).add(pivot);
  worldGroup.quaternion.premultiply(turn).normalize();
  worldGroup.updateMatrixWorld(true);
  updateTransformGizmo();
}

function updateJoystickMovement(deltaSeconds) {
  if (!renderer.xr.isPresenting || isJoystickStickEditHeld()) return;
  // Avoid moving the workspace while a part is being manipulated or an
  // in-VR text keypad is open. Otherwise locomotion is independent of selection.
  if (dragStates.size || handDragStates.size || twoHandScaleState || controllerRecords.some((record) => record.squeezePressed) || keyboardOpen || snapValueKeyboardOpen) return;

  const session = renderer.xr.getSession();
  const sources = Array.from(session?.inputSources || []);
  const leftSource = sources.find((source) => source.handedness === "left" && source.gamepad);
  const rightSource = sources.find((source) => source.handedness === "right" && source.gamepad);
  if (!leftSource && !rightSource) return;

  const dt = THREE.MathUtils.clamp(Number(deltaSeconds) || 0, 0, 0.05);
  if (dt <= 0) return;
  const left = getThumbstickAxes(leftSource);
  const right = getThumbstickAxes(rightSource);
  const xrCamera = renderer.xr.getCamera(camera);

  // Walk forward/back and strafe in the direction the headset is facing.
  const forward = xrCamera.getWorldDirection(new THREE.Vector3());
  forward.y = 0;
  if (forward.lengthSq() > 0.0001) forward.normalize();
  const rightVector = new THREE.Vector3().crossVectors(forward, new THREE.Vector3(0, 1, 0)).normalize();
  const move = rightVector.multiplyScalar(left.x).addScaledVector(forward, -left.y);
  if (move.lengthSq() > 1) move.normalize();
  if (move.lengthSq() > 0.0001) {
    // Move the workspace opposite the desired player motion. This moves the
    // player through the scene without moving the selected part independently.
    worldGroup.position.addScaledVector(move, -joystickConfig.moveSpeed * dt * Math.max(0.25, worldGroup.scale.x));
  }

  // Right stick vertical moves the player up/down; the workspace moves in
  // the opposite direction so the headset experiences true 3D locomotion.
  const verticalInput = -right.y;
  if (Math.abs(verticalInput) > 0.0001) {
    worldGroup.position.y -= verticalInput * joystickConfig.verticalSpeed * dt * Math.max(0.25, worldGroup.scale.x);
  }

  // Right stick horizontal: one comfortable snap-turn per stick flick.
  const turnX = right.x;
  if (joystickState.turnArmed && Math.abs(turnX) >= joystickConfig.turnThreshold) {
    applyPlayerSnapTurn(xrCamera, Math.sign(turnX));
    joystickState.turnArmed = false;
  } else if (Math.abs(turnX) <= joystickConfig.turnReleaseThreshold) {
    joystickState.turnArmed = true;
  }
}

function updateMenuToggleFromPanel() {
  // The wrist-mounted menu icon is intentionally disabled. The left
  // controller's physical X button now toggles the menu instead.
  menuToggleGroup.visible = false;
}

function attachPanelToLeftHand() {
  if (!leftHandGrip) return false;
  if (panel.parent !== leftHandGrip) leftHandGrip.add(panel);
  // Place the panel just above and in front of the controller hand. Its
  // orientation is billboarded toward the headset in the XR animation loop.
  panel.position.set(0, 0.18, -0.20);
  panel.rotation.set(0, 0, 0);
  panel.scale.setScalar(0.32);
  panel.visible = menuVisible;
  panelReady = true;
  menuPoseInitialized = false;
  redrawPanel();
  updateMenuToggleFromPanel();
  return true;
}
function setupController(index) {
  const controller = renderer.xr.getController(index);       // pointing ray / buttons
  const grip = renderer.xr.getControllerGrip(index);          // tracked hand pose
  scene.add(controller);
  scene.add(grip);
  const lineGeometry = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3(0, 0, -5)]);
  const line = new THREE.Line(lineGeometry, new THREE.LineBasicMaterial({ color: 0x44ffcc }));
  line.frustumCulled = false;
  controller.add(line);
  const record = { index, controller, grip, handedness: null, inputSource: null, squeezePressed: false };
  controller.addEventListener("connected", (event) => {
    record.inputSource = event.data || null;
    record.handedness = event.data?.handedness || null;
    // When Quest hand tracking is active, the menu is positioned from the
    // actual wrist joint below. Otherwise, use the left controller grip.
    if (record.handedness === "left" && !event.data?.hand) {
      leftHandGrip = grip;
      if (renderer.xr.isPresenting && !leftHandMenuActive) {
        attachPanelToLeftHand();
        setStatus("Menu attached to your left controller hand.");
      }
    }
  });
  controller.addEventListener("disconnected", () => {
    if (leftHandGrip === grip) {
      leftHandGrip = null;
      if (!leftHandMenuActive) {
        panel.removeFromParent();
        scene.add(panel);
        panel.visible = false;
        panelReady = false;
        menuToggleGroup.visible = false;
      }
    }
    record.inputSource = null;
    record.squeezePressed = false;
    dragStates.delete(controller);
    if (twoHandScaleState && (twoHandScaleState.leftRecord === record || twoHandScaleState.rightRecord === record)) {
      twoHandScaleState = null;
      scaleGestureNeedsRelease = true;
    }
  });
  controller.addEventListener("selectstart", () => onTrigger(controller));
  controller.addEventListener("squeezestart", () => {
    record.squeezePressed = true;
    if (tryBeginTwoHandScale()) return;
    const bothControllersHeld = controllerRecords.length >= 2
      && controllerRecords.every((candidate) => isControllerGripHeld(candidate));
    if (!gizmoEnabled && bothControllersHeld) {
      if (!findHeldObjectDrag()) {
        setStatus("Gizmo off: pick up an object with one controller first, then hold the other grip to resize it.");
      }
      // Do not start player scaling or accidentally grab a second item.
      return;
    }
    beginDrag(controller, grip);
  });
  controller.addEventListener("squeezeend", () => {
    record.squeezePressed = false;
    if (twoHandScaleState && (twoHandScaleState.leftRecord === record || twoHandScaleState.rightRecord === record)) {
      finishTwoHandScale();
      if (snapConfig.positionEnabled || snapConfig.rotationEnabled) playSfx("snapIn");
      return;
    }
    const drag = dragStates.get(controller);
    if (dragStates.delete(controller)) {
      if ((drag.mode === "gizmo" && (drag.handle.kind === "translate" ? snapConfig.positionEnabled : snapConfig.rotationEnabled)) || (drag.mode !== "gizmo" && (snapConfig.positionEnabled || snapConfig.rotationEnabled))) playSfx("snapIn");
      setStatus("Part placed.");
    }
  });
  controllerRecords.push(record);
}
setupController(0);
setupController(1);

function refreshLeftHandAttachment() {
  // Controller fallback when the headset is not supplying tracked hand joints.
  for (const record of controllerRecords) {
    const source = record.inputSource || record.controller.userData?.inputSource || record.grip.userData?.inputSource;
    const handedness = record.handedness || source?.handedness;
    if (handedness === "left" && !source?.hand) {
      leftHandGrip = record.grip;
      if (panel.parent !== leftHandGrip || !panelReady) attachPanelToLeftHand();
      leftHandMenuActive = false;
      return true;
    }
  }
  return false;
}

const HAND_CHAINS = [
  ["wrist", "thumb-metacarpal", "thumb-phalanx-proximal", "thumb-phalanx-distal", "thumb-tip"],
  ["wrist", "index-finger-metacarpal", "index-finger-phalanx-proximal", "index-finger-phalanx-intermediate", "index-finger-phalanx-distal", "index-finger-tip"],
  ["wrist", "middle-finger-metacarpal", "middle-finger-phalanx-proximal", "middle-finger-phalanx-intermediate", "middle-finger-phalanx-distal", "middle-finger-tip"],
  ["wrist", "ring-finger-metacarpal", "ring-finger-phalanx-proximal", "ring-finger-phalanx-intermediate", "ring-finger-phalanx-distal", "ring-finger-tip"],
  ["wrist", "pinky-finger-metacarpal", "pinky-finger-phalanx-proximal", "pinky-finger-phalanx-intermediate", "pinky-finger-phalanx-distal", "pinky-finger-tip"]
];
const HAND_JOINT_NAMES = [...new Set(HAND_CHAINS.flat())];
function getHandJointMap(input) {
  let map = handJointMaps.get(input);
  if (!map) {
    // XRHand is iterable as [jointName, XRJointSpace] pairs.
    map = new Map(Array.from(input.hand.entries()));
    handJointMaps.set(input, map);
  }
  return map;
}
function getHandVisual(input) {
  let visual = handVisuals.get(input);
  if (visual) return visual;
  const group = new THREE.Group();
  scene.add(group);
  const jointGeometry = new THREE.SphereGeometry(1, 8, 6);
  const jointMaterial = new THREE.MeshBasicMaterial({ color: 0xf0c8aa });
  const boneGeometry = new THREE.CylinderGeometry(0.006, 0.006, 1, 6);
  const boneMaterial = new THREE.MeshBasicMaterial({ color: 0xe8bda0 });
  const joints = new Map();
  for (const name of HAND_JOINT_NAMES) {
    const mesh = new THREE.Mesh(jointGeometry, jointMaterial);
    mesh.visible = false;
    group.add(mesh);
    joints.set(name, mesh);
  }
  const bones = [];
  const seen = new Set();
  for (const chain of HAND_CHAINS) {
    for (let i = 0; i < chain.length - 1; i++) {
      const a = chain[i], b = chain[i + 1];
      const key = `${a}|${b}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const mesh = new THREE.Mesh(boneGeometry, boneMaterial);
      mesh.visible = false;
      group.add(mesh);
      bones.push({ a, b, mesh });
    }
  }
  visual = { group, joints, bones };
  handVisuals.set(input, visual);
  return visual;
}
function updateHandVisual(input, xrFrame, referenceSpace, jointSpaces) {
  const visual = getHandVisual(input);
  const positions = new Map();
  visual.group.visible = true;
  for (const name of HAND_JOINT_NAMES) {
    const space = jointSpaces.get(name);
    const pose = space ? xrFrame.getJointPose(space, referenceSpace) : null;
    const mesh = visual.joints.get(name);
    if (!pose) {
      mesh.visible = false;
      continue;
    }
    const p = pose.transform.position;
    const position = new THREE.Vector3(p.x, p.y, p.z);
    positions.set(name, position);
    mesh.position.copy(position);
    mesh.scale.setScalar(Math.max(0.0045, pose.radius || 0.007));
    mesh.visible = true;
  }
  const up = new THREE.Vector3(0, 1, 0);
  for (const bone of visual.bones) {
    const a = positions.get(bone.a), b = positions.get(bone.b);
    if (!a || !b) {
      bone.mesh.visible = false;
      continue;
    }
    const direction = new THREE.Vector3().subVectors(b, a);
    const length = direction.length();
    if (length < 0.001) {
      bone.mesh.visible = false;
      continue;
    }
    bone.mesh.position.copy(a).add(b).multiplyScalar(0.5);
    bone.mesh.quaternion.setFromUnitVectors(up, direction.normalize());
    bone.mesh.scale.set(1, length, 1);
    bone.mesh.visible = true;
  }
  return visual;
}

function pickHandMenuButton(input, xrFrame, referenceSpace, jointSpaces) {
  if (!input || !xrFrame || !referenceSpace) return null;
  const baseSpace = jointSpaces.get("index-finger-metacarpal");
  const tipSpace = jointSpaces.get("index-finger-tip");
  if (!baseSpace || !tipSpace) return null;
  const basePose = xrFrame.getJointPose(baseSpace, referenceSpace);
  const tipPose = xrFrame.getJointPose(tipSpace, referenceSpace);
  if (!basePose || !tipPose) return null;
  const base = basePose.transform.position;
  const tip = tipPose.transform.position;
  const origin = new THREE.Vector3(tip.x, tip.y, tip.z);
  const direction = new THREE.Vector3(tip.x - base.x, tip.y - base.y, tip.z - base.z);
  if (direction.lengthSq() < 0.000001) return null;
  raycaster.set(origin, direction.normalize());
  raycaster.near = 0.005;
  raycaster.far = 2.0;
  const hits = raycaster.intersectObjects(visibleMenuPickTargets(), false);
  return hits.length ? hits[0].object : null;
}
function updateHandTracking(xrFrame) {
  if (!xrFrame || !renderer.xr.isPresenting) return;
  const session = renderer.xr.getSession();
  const referenceSpace = renderer.xr.getReferenceSpace();
  if (!session || !referenceSpace) return;

  const inputSources = Array.from(session.inputSources || []);
  const leftInput = inputSources.find((source) => source.handedness === "left" && source.hand);
  const rightInput = inputSources.find((source) => source.handedness === "right" && source.hand);
  leftHandMenuActive = Boolean(leftInput);
  handHoveringAvailable = Boolean(rightInput);
  if (rightInput) {
    const rightJoints = getHandJointMap(rightInput);
    setHoveredButton(pickHandMenuButton(rightInput, xrFrame, referenceSpace, rightJoints));
  } else {
    setHoveredButton(null);
  }

  // Put the editor panel just above the tracked left wrist and keep its face
  // turned toward the headset, like a wrist-mounted floating display.
  if (leftInput) {
    const leftJointSpaces = getHandJointMap(leftInput);
    const wristSpace = leftJointSpaces.get("wrist");
    const wristPose = wristSpace ? xrFrame.getJointPose(wristSpace, referenceSpace) : null;
    if (wristPose) {
      const wrist = new THREE.Vector3(wristPose.transform.position.x, wristPose.transform.position.y, wristPose.transform.position.z);
      const xrCamera = renderer.xr.getCamera(camera);
      const viewerPosition = xrCamera.getWorldPosition(new THREE.Vector3());
      const toViewer = viewerPosition.clone().sub(wrist).normalize();
      // Float the tablet a little forward from the wrist and above the palm,
      // then keep it upright and facing the headset regardless of wrist roll.
      const targetPosition = wrist.add(new THREE.Vector3(0, 0.17, 0)).addScaledVector(toViewer, 0.16);
      if (panel.parent !== scene) {
        panel.removeFromParent();
        scene.add(panel);
        menuPoseInitialized = false;
      }
      const wasVisible = panel.visible;
      if (!menuPoseInitialized) {
        panel.position.copy(targetPosition);
        menuPoseInitialized = true;
      } else {
        panel.position.lerp(targetPosition, 0.34);
      }
      panel.up.set(0, 1, 0);
      const oldQuaternion = panel.quaternion.clone();
      panel.lookAt(viewerPosition);
      const facingQuaternion = panel.quaternion.clone();
      panel.quaternion.copy(oldQuaternion).slerp(facingQuaternion, 0.38);
      panel.scale.setScalar(0.32);
      panel.visible = menuVisible;
      panelReady = true;
      if (!leftHandGrip && statusText !== "LEFT MENU · PRESS X ON LEFT CONTROLLER TO HIDE/SHOW.") {
        setStatus("LEFT MENU · PRESS X ON LEFT CONTROLLER TO HIDE/SHOW.");
      }
      if (!wasVisible && menuVisible) redrawPanel();
      updateMenuToggleFromPanel();
    }
  } else if (!leftHandGrip) {
    // Keep the menu visible at its last tracked position during brief tracking
    // dropouts; it will resume following the wrist when tracking returns.
  }

  // Thumb-index pinch is the hand equivalent of holding a controller grip.
  // Hysteresis prevents tiny tracking changes from repeatedly grabbing/releasing.
  const activeHandSources = new Set();
  for (const input of inputSources) {
    if (!input.hand) continue;
    activeHandSources.add(input);
    const jointSpaces = getHandJointMap(input);
    updateHandVisual(input, xrFrame, referenceSpace, jointSpaces);
    const thumbSpace = jointSpaces.get("thumb-tip");
    const indexSpace = jointSpaces.get("index-finger-tip");
    const wristSpace = jointSpaces.get("wrist");
    if (!thumbSpace || !indexSpace || !wristSpace) continue;
    const thumbPose = xrFrame.getJointPose(thumbSpace, referenceSpace);
    const indexPose = xrFrame.getJointPose(indexSpace, referenceSpace);
    const wristPose = xrFrame.getJointPose(wristSpace, referenceSpace);
    if (!thumbPose || !indexPose || !wristPose) continue;

    const a = thumbPose.transform.position;
    const b = indexPose.transform.position;
    const distance = Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
    let proxy = handPoseProxies.get(input);
    if (!proxy) {
      proxy = new THREE.Group();
      scene.add(proxy);
      handPoseProxies.set(input, proxy);
    }
    proxy.position.set((a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2);
    const wristRotation = wristPose.transform.orientation;
    proxy.quaternion.set(wristRotation.x, wristRotation.y, wristRotation.z, wristRotation.w);
    proxy.updateMatrixWorld(true);

    let state = handPinchStates.get(input);
    if (!state) {
      state = { pinching: false, uiPressed: false };
      handPinchStates.set(input, state);
    }

    if (!state.pinching && distance < 0.035) {
      state.pinching = true;
      const menuButton = pickHandMenuButton(input, xrFrame, referenceSpace, jointSpaces);
      if (menuButton) {
        state.uiPressed = true;
        runAction(menuButton.userData.action);
      } else {
        const handle = findGizmoHandleAtPoint(proxy.position);
        if (handle && selected) {
          beginHandGizmoDrag(input, proxy, handle);
        } else {
        const node = nearestNodeToHand(proxy, 0.42);
        if (node) {
          pushUndoState();
          node.group.updateMatrixWorld(true);
          const offset = proxy.matrixWorld.clone().invert().multiply(node.group.matrixWorld);
          handDragStates.set(input, {
            mode: "object", node, proxy, offset,
            lockedLocalQuaternion: gizmoEnabled ? null : node.quaternion.clone()
          });
          if (snapConfig.positionEnabled || snapConfig.rotationEnabled) playSfx("snapOut");
          choose(node);
          setStatus(`Pinching ${node.item.itemID}. Move your hand; release your fingers to place it.`);
        }
        }
      }
    } else if (state.pinching && distance > 0.065) {
      state.pinching = false;
      const endedDrag = handDragStates.get(input);
      if (handDragStates.delete(input)) {
        if ((endedDrag.mode === "gizmo" && (endedDrag.handle.kind === "translate" ? snapConfig.positionEnabled : snapConfig.rotationEnabled)) || (endedDrag.mode !== "gizmo" && (snapConfig.positionEnabled || snapConfig.rotationEnabled))) playSfx("snapIn");
        setStatus("Part placed.");
      }
      state.uiPressed = false;
    }
  }

  for (const [input, visual] of handVisuals.entries()) {
    if (!activeHandSources.has(input)) visual.group.visible = false;
  }
  for (const input of handPinchStates.keys()) {
    if (!activeHandSources.has(input)) {
      handPinchStates.delete(input);
      handDragStates.delete(input);
    }
  }

  // Apply all active hand drags using the midpoint between thumb and index finger.
  for (const [input, drag] of handDragStates.entries()) {
    if (!nodes.includes(drag.node)) {
      handDragStates.delete(input);
      continue;
    }
    drag.proxy.updateMatrixWorld(true);
    if (drag.mode === "gizmo") {
      applyGizmoDrag(drag, drag.proxy.position);
      continue;
    }
    applyObjectDrag(drag.node, drag.proxy, drag.offset, drag.lockedLocalQuaternion);
  }
}

function updateLeftControllerXToggle() {
  if (!renderer.xr.isPresenting) {
    leftXWasPressed = false;
    return;
  }
  const session = renderer.xr.getSession();
  const leftSource = Array.from(session?.inputSources || []).find(
    (source) => source.handedness === "left" && source.gamepad
  );
  // Oculus/Meta Touch WebXR mapping: buttons[4] is X on the left
  // controller (A on the right). Use an edge so holding X does not flicker
  // the menu open and closed every frame.
  const xButton = leftSource?.gamepad?.buttons?.[4];
  const pressed = Boolean(xButton?.pressed || (Number(xButton?.value) || 0) >= 0.75);
  if (pressed && !leftXWasPressed) {
    setMenuVisible(!menuVisible);
  }
  leftXWasPressed = pressed;
}

function updateRightControllerBGizmoToggle() {
  if (!renderer.xr.isPresenting) {
    rightBWasPressed = false;
    return;
  }
  const session = renderer.xr.getSession();
  const rightSource = Array.from(session?.inputSources || []).find(
    (source) => source.handedness === "right" && source.gamepad
  );
  // Meta Touch WebXR mapping: buttons[5] is B on the right controller
  // (Y on the left). Edge-trigger it so holding B does not flicker the gizmo.
  const bButton = rightSource?.gamepad?.buttons?.[5];
  const pressed = Boolean(bButton?.pressed || (Number(bButton?.value) || 0) >= 0.75);
  if (pressed && !rightBWasPressed) {
    gizmoEnabled = !gizmoEnabled;
    if (!gizmoEnabled) {
      // Cancel any in-progress gizmo drag before hiding its handles. Object
      // grabs remain untouched, so B never drops a part being held directly.
      for (const [controller, drag] of dragStates.entries()) {
        if (drag.mode === "gizmo") dragStates.delete(controller);
      }
      for (const [input, drag] of handDragStates.entries()) {
        if (drag.mode === "gizmo") handDragStates.delete(input);
      }
      transformGizmo.visible = false;
      setStatus("Object-only mode: pick up an item with one grip; hold both grips to shrink or enlarge it. Player scaling is disabled.");
    } else {
      updateTransformGizmo();
      setStatus("Full edit mode: XYZ movement, rotation, item scaling and player scaling are available.");
    }
    redrawPanel();
  }
  rightBWasPressed = pressed;
}

function updateControllerHover() {
  if (handHoveringAvailable) return;
  let hovered = null;
  for (const record of controllerRecords) {
    record.controller.updateMatrixWorld(true);
    getControllerRay(record.controller);
    const hits = raycaster.intersectObjects(visibleMenuPickTargets(), false);
    if (hits.length) { hovered = hits[0].object; break; }
  }
  setHoveredButton(hovered);
}

$("enterVR").addEventListener("click", async () => {
  warmAudio();
  if (!navigator.xr) {
    setStatus("WebXR is unavailable. Open this HTTPS page in Quest Browser.");
    return;
  }
  try {
    const supported = await navigator.xr.isSessionSupported("immersive-vr");
    if (!supported) throw new Error("Immersive VR is not supported in this browser.");
    const session = await navigator.xr.requestSession("immersive-vr", {
      optionalFeatures: ["local-floor", "bounded-floor", "hand-tracking"]
    });
    // The desktop preview camera has an offset; clear it so the headset pose
    // is the only camera transform while rendering inside WebXR.
    camera.position.set(0, 0, 0);
    camera.quaternion.identity();
    camera.updateMatrixWorld(true);
    await renderer.xr.setSession(session);
    // The initial button click warms audio; resume once more after the XR
    // session is active because some Quest Browser versions suspend it.
    if (audioContext) audioContext.resume().catch((error) => console.warn("XR audio resume failed:", error));
    updateTransformGizmo();
    $("landing").hidden = true;
    panel.visible = false;
    menuToggleGroup.visible = false;
    menuVisible = true;
    menuPoseInitialized = false;
    panelReady = false;
    leftXWasPressed = false;
    rightBWasPressed = false;
    gizmoEnabled = true;
    setStatus("VR started. X toggles the menu; B toggles the gizmo.");
    session.addEventListener("end", () => {
      panel.visible = false;
      menuToggleGroup.visible = false;
      panelReady = false;
      menuVisible = true;
      menuPoseInitialized = false;
      leftXWasPressed = false;
      rightBWasPressed = false;
      gizmoEnabled = true;
      snapSettingsOpen = false;
      snapValueKeyboardOpen = false;
      transformGizmo.visible = false;
      scaleFeedback.visible = false;
      joystickState.turnArmed = true;
      twoHandScaleState = null;
      for (const record of controllerRecords) record.squeezePressed = false;
      leftHandGrip = null;
      leftHandMenuActive = false;
      handPinchStates.clear();
      handDragStates.clear();
      handJointMaps.clear();
      for (const proxy of handPoseProxies.values()) proxy.removeFromParent();
      handPoseProxies.clear();
      for (const visual of handVisuals.values()) visual.group.removeFromParent();
      handVisuals.clear();
      panel.removeFromParent();
      scene.add(panel);
      camera.position.set(0, 1.65, 2.4);
      camera.quaternion.identity();
      camera.updateMatrixWorld(true);
      $("landing").hidden = false;
      setStatus("VR session ended. Your current build is still in this page.");
    });
  } catch (error) {
    setStatus(error?.message || "Could not start the VR session.");
  }
});

$("fileInput").addEventListener("change", async (event) => {
  const file = event.target.files?.[0];
  if (!file) return;
  try {
    importBuild(JSON.parse(await file.text()));
  } catch (error) {
    setStatus(error?.message || "Could not import that JSON file.");
  }
  event.target.value = "";
});

addEventListener("resize", () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});
let previousFrameTime = 0;
renderer.setAnimationLoop((time, xrFrame) => {
  const deltaSeconds = previousFrameTime ? Math.min((time - previousFrameTime) / 1000, 0.05) : 0;
  previousFrameTime = time;
  if (renderer.xr.isPresenting) {
    refreshControllerInputSources();
    pollTwoHandScaleGesture();
    if (!leftHandMenuActive && !panelReady) refreshLeftHandAttachment();
    updateHandTracking(xrFrame);
    if (!leftHandMenuActive && leftHandGrip && panel.parent === leftHandGrip && panelReady) {
      const xrCamera = renderer.xr.getCamera(camera);
      const viewerPosition = xrCamera.getWorldPosition(new THREE.Vector3());
      panel.up.set(0, 1, 0);
      panel.lookAt(viewerPosition);
      panel.visible = menuVisible;
      updateMenuToggleFromPanel();
    }
    updateLeftControllerXToggle();
    updateRightControllerBGizmoToggle();
    updateControllerHover();
  } else {
    menuToggleGroup.visible = false;
  }
  updateDrags();
  if (renderer.xr.isPresenting) {
    updateJoystickStickMotion();
    updateJoystickMovement(deltaSeconds);
    updateTransformGizmo();
    updateScaleFeedbackPose();
  } else {
    scaleFeedback.visible = false;
  }
  renderer.render(scene, camera);
});
setStatus(statusText);
