# Goop VR Builder — Player Locomotion, Easy Gizmo Handles & Embedded SFX

Experimental Quest 3 Browser / WebXR prototype. Editing remains inside immersive VR.

## Install on GitHub Pages

1. Extract this ZIP.
2. Replace `index.html`, `style.css`, `app.js`, and `README.md` in the root of your GitHub repository.
3. Commit the changes to `main` and wait for GitHub Pages to publish.
4. Fully refresh the website in Quest Browser. A hard refresh may be needed to clear the older JavaScript.

**No `assets` folder is required for sound playback.** The four supplied sound clips are embedded inside `app.js`, so the paths cannot break when the project is hosted below a GitHub Pages repository URL. MP3 versions of the clips are also included in `assets/` for reference.

## Player movement (controller sticks)

- **Left stick:** smooth player locomotion. Push forward/back to walk relative to the direction your headset faces; push left/right to strafe.
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
- **Two-controller scaling:** hold the two side grip/squeeze buttons (one on each controller) at the same time. If one controller is already holding an actual item, pulling apart enlarges that held item and bringing the controllers together shrinks it; the item follows the midpoint between the hands. If no item is being held, the same gesture scales the workspace around the viewer. Merely selecting an item does not trigger item scaling. Release either grip to finish. The app polls the WebXR squeeze state and waits until both grips are released before starting another gesture.

## Snapping and sounds

Position and rotation snapping remain independently configurable in the left-hand Snap Settings panel. The four supplied clips are embedded in `app.js` and used for button hover, button click, snap-out, and snap-in. Use **TEST SFX** from Snap Settings to play all four in sequence.

## Limitations

This is an alpha prototype. It uses placeholder cubes rather than Animal Company models, and item IDs are entered manually. Exports have not been verified in the live game. WebXR requires HTTPS. I have run local syntax and package checks, but physical Quest 3 testing is still required. Two-hand scaling now refreshes WebXR controller sources every frame and polls the XR-standard squeeze button as a fallback to controller squeeze events; this is intended to make the scale gesture more reliable across Quest Browser versions.


## Wrist menu visibility and viewing angle

The wrist tablet now floats slightly forward from the left wrist, stays upright, and smoothly faces the headset so it remains readable as the wrist rolls. The editor panel can be hidden and reopened with the physical X button on the left Quest controller. The floating three-line wrist toggle has been removed.


## Two-controller scaling

The side-grip buttons on both Quest controllers have two context-sensitive behaviors:

- **Scale the world/player:** Hold both side grips when you are not holding an item. Pull the controllers apart to enlarge the workspace around your headset; bring them together to shrink it. The viewer position is kept fixed while the world scales. The supported range is 0.25× to 4×.
- **Scale a held item:** First hold/grab an item with one controller, then hold the other controller's side grip too. Pull apart to enlarge that item; bring the controllers together to shrink it. The item remains centered between the two hands while scaling. Simply selecting an item does not activate item scaling.

Object grabbing is more forgiving: the grab test measures distance to the visible object's bounds instead of requiring the controller or fingertips to reach the exact object center. The target margin is increased for both controller grips and hand pinches.

The transform gizmo is counter-scaled so it remains a consistent size in the headset as the workspace/player scale changes, while staying anchored to the selected object.
