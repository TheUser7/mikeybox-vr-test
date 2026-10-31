# Goop VR Builder — Gizmo Object-Only Mode, Player Locomotion & Embedded SFX

Experimental Quest 3 Browser / WebXR prototype. Editing remains inside immersive VR.

## Install on GitHub Pages

1. Extract this ZIP.
2. Replace `index.html`, `style.css`, `app.js`, and `README.md` in the root of your GitHub repository.
3. Commit the changes to `main` and wait for GitHub Pages to publish.
4. Fully refresh the website in Quest Browser. A hard refresh may be needed to clear the older JavaScript.

**No `assets` folder is required for sound playback.** The four supplied sound clips are embedded inside `app.js`, so the paths cannot break when the project is hosted below a GitHub Pages repository URL. MP3 versions of the clips are also included in `assets/` for reference.

## Player movement (controller sticks)

- **Left stick:** smooth forward/backward movement and side-to-side strafing, relative to the direction your headset faces.
- **Right stick up/down:** move the player vertically (up/down).
- **Right stick left/right:** snap-turn the player by 30 degrees per flick. Release back to center before the next turn.
- Stick movement translates/rotates the whole workspace around the headset. It does **not** move the selected part.
- Locomotion pauses while manipulating a part, using two-hand scaling, or while an in-VR text keypad is open.

## Gizmo handles

- XYZ movement shafts and arrow tips are visibly thicker.
- Invisible controller-ray hit targets extend around the entire movement shaft and tips, making them much easier to grab.
- Hand pinch hit radius for movement arrows is wider.
- Rotation ring pickers are widened as well.
- Rotation keeps the selected part's world-space center fixed.
- The gizmo is parented to the workspace and positioned in workspace-local coordinates, so it stays attached to the selected part while joystick locomotion moves the workspace. Its axes remain aligned to world XYZ.

## Hand tracking and editing

- Left wrist menu follows your left hand when hand tracking is available.
- Point with the right index finger and pinch to activate menu buttons.
- Pinch a part to move it freely.
- Pinch an enlarged XYZ arrow to move along one axis.
- Pinch a rotation ring to rotate around that axis without translating the part.
- **Two-controller scaling:** hold both side grip/squeeze buttons together. If an item is physically held, the gesture scales that item. If no item is held, pulling the controllers apart makes the virtual player appear larger and the environment smaller; bringing them together makes the player appear smaller and the environment larger. Moving both controllers together translates the virtual player through the workspace in X, Y and Z at the same time. Merely selecting an item does not trigger item scaling. Release either grip to finish.

## Snapping and sounds

Position and rotation snapping remain independently configurable in the left-hand Snap Settings panel. The four supplied clips are embedded in `app.js` and used for button hover, button click, snap-out, and snap-in. Use **TEST SFX** from Snap Settings to play all four in sequence.

## Limitations

This is an alpha prototype. It uses placeholder cubes rather than Animal Company models, and item IDs are entered manually. Exports have not been verified in the live game. WebXR requires HTTPS. I have run local syntax and package checks, but physical Quest 3 testing is still required. Two-hand scaling now refreshes WebXR controller sources every frame and polls the XR-standard squeeze button as a fallback to controller squeeze events; this is intended to make the scale gesture more reliable across Quest Browser versions.


## Wrist menu visibility and viewing angle

The wrist tablet now floats slightly forward from the left wrist, stays upright, and smoothly faces the headset so it remains readable as the wrist rolls. The editor panel can be hidden and reopened with the physical X button on the left Quest controller. The floating three-line wrist toggle has been removed. The transform gizmo can be hidden and shown with the physical B button on the right Quest controller. Press B once to enter **Object-only mode**; press B again to restore **Full edit mode**.


## Two-controller scaling

The side-grip buttons on both Quest controllers have two context-sensitive behaviors:

- **Player size and movement:** Hold both side grips when you are not holding an item. Pull the controllers apart to make the virtual player larger (the workspace and background shrink around the headset); bring them together to make the player smaller (the workspace grows). Move both grips together up/down, left/right, or forward/backward to move the player in that direction while changing size. The simulated player-size range is 0.25× to 4×. The scale pivot is the headset position, not the controller midpoint.
- **Scale a held item:** First hold/grab an item with one controller, then hold the other controller's side grip too. Pull apart to enlarge that item; bring the controllers together to shrink it. The item remains centered between the two hands while scaling. Simply selecting an item does not activate item scaling.

Object grabbing is more forgiving: the grab test measures distance to the visible object's bounds instead of requiring the controller or fingertips to reach the exact object center. The target margin is increased for both controller grips and hand pinches.

The transform gizmo is counter-scaled so it remains a consistent size in the headset as the workspace/player scale changes, while staying anchored to the selected object.

## More obvious world/background scaling

When both controller side grips are held with no item actively grabbed, the virtual player is resized relative to the headset and can be moved in 3D. Pulling the hands apart makes the player larger, so the sky dome, floor, 32 × 32 meter floor grid with one-meter cells, concentric floor measurement rings, four grid walls and build all shrink around the headset. Bringing the hands together makes the player smaller, so the environment grows. Moving both hands together up/down, left/right, or forward/backward moves the virtual player in that direction while the size gesture is active. Scaling is anchored at the headset position rather than the controller midpoint.

A camera-facing scale readout appears during the gesture and briefly after release. It shows `PLAYER SIZE` with the current player-size multiplier and a progress bar. Pulling the controllers apart increases this multiplier while the environment shrinks around the headset. When scaling an actively held item, the readout changes to `HELD ITEM SCALE` instead. The readout stays a fixed size and does not itself scale with the environment.


## Exact 32 × 32 floor and full 3D player movement

The floor is a finite 32 × 32 unit plane with 1-unit grid cells and a visible perimeter from -16 to +16 on X and Z. Four backdrop grids line up with those four edges. During world/player two-hand scaling, the midpoint between the controllers is the scale-and-translation anchor: spread/pinch to change world scale, and move both controllers together in any direction to reposition the workspace in X, Y, and Z. For regular locomotion, the left stick moves forward/back and strafes, while the right stick up/down moves vertically; right stick left/right still snap-turns.

## B button modes

- **B on (Full edit mode):** XYZ arrows and rotation rings are available. The panel's SCALE − / SCALE + buttons are visible. With no item held, both controller grips can resize and move the player through the workspace.
- **B off (Object-only mode):** the gizmo handles disappear and the manual SCALE buttons are hidden. Hold one controller's side grip close to an object to pick it up and move it by hand. Keep holding it, then hold the other controller's side grip to resize that held object: pull apart to enlarge and bring together to shrink.
- In Object-only mode, empty-hand two-grip input does not resize or move the player. It also cannot activate the hidden gizmo. While holding an object in this mode, its orientation stays fixed so the pickup gesture does not accidentally rotate it.
- The object must be grabbed first; selecting it with the trigger alone is not enough to enable two-hand item scaling.


## Gizmo size stays constant

The transform gizmo is attached directly to the scene rather than the scalable workspace. Its world-space position follows the selected item every frame, while its rotation stays aligned to world XYZ and its size remains fixed at one world unit. Player/world scaling therefore changes the environment and objects without resizing the gizmo.
