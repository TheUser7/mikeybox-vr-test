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
- Locomotion pauses while dragging a part or while an in-VR text keypad is open.

## Gizmo handles

- XYZ movement shafts and arrow tips are visibly thicker.
- Invisible controller-ray hit targets extend around the entire movement shaft and tips, making them much easier to grab.
- Hand pinch hit radius for movement arrows is wider.
- Rotation ring pickers are widened as well.
- Rotation keeps the selected part's world-space center fixed.

## Hand tracking and editing

- Left wrist menu follows your left hand when hand tracking is available.
- Point with the right index finger and pinch to activate menu buttons.
- Pinch a part to move it freely.
- Pinch an enlarged XYZ arrow to move along one axis.
- Pinch a rotation ring to rotate around that axis without translating the part.

## Snapping and sounds

Position and rotation snapping remain independently configurable in the left-hand Snap Settings panel. The four supplied clips are embedded in `app.js` and used for button hover, button click, snap-out, and snap-in. Use **TEST SFX** from Snap Settings to play all four in sequence.

## Limitations

This is an alpha prototype. It uses placeholder cubes rather than Animal Company models, and item IDs are entered manually. Exports have not been verified in the live game. WebXR requires HTTPS. I have run local syntax and package checks, but physical Quest 3 testing is still required.
