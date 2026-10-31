# Goop VR Builder — Rotation Lock, Custom Snap & SFX

Experimental Quest Browser / WebXR prototype. All editing happens inside immersive VR.

## Publish on GitHub Pages

1. Extract this ZIP.
2. Upload `index.html`, `style.css`, `app.js`, `README.md`, and the entire `assets` folder to the root of your GitHub repository, replacing previous copies.
3. Commit the changes to the `main` branch.
4. Keep GitHub Pages set to **Deploy from a branch → main → /(root)**.
5. Wait for the Pages deployment to finish, then reload the site in Quest Browser. A full refresh may be needed to clear cached JavaScript.

## Transform behavior

- Selecting a part displays world-axis XYZ movement arrows and X/Y/Z rotation rings.
- Rotation rings change orientation around the part's own origin. The implementation explicitly preserves the selected part's world-space center while rotating, so the part should not translate/orbit as a side effect.
- Position snapping is a configurable world-space grid, in meters.
- Rotation snapping is a configurable angular increment, in degrees.
- Open **SNAP SETTINGS** from the left-hand menu to independently toggle position and rotation snapping.
- Use STEP − / STEP + and ANGLE − / ANGLE + for quick half/double changes, or CUSTOM to enter an exact numeric value with the in-VR keypad.
- Position step range: 0.001–10 meters. Rotation step range: 0.1–180 degrees.
- Snapping applies while moving with gizmos and while freely grabbing a part. Rotation snapping also applies to free-hand/controller object rotation.

## Hand tracking

- The editor menu follows the left wrist when hand tracking is available.
- Point at menu buttons with the right index finger and pinch to activate them.
- Pinch a part itself to freely move it.
- Pinch a colored movement arrow to translate on that world axis.
- Pinch a colored rotation ring to rotate on that axis without changing the part's world-space center.
- Release your fingers to place the part.

## Controller fallback

- Point and press trigger to select menu controls or objects.
- Point at an XYZ arrow or rotation ring and hold grip/squeeze to manipulate it.
- Hold grip near a part itself to freely move it.

## Sound effects

The four user-provided OGG files are in `assets/`:

- `UI_Hover.ogg`: menu hover changes.
- `UI_Click.ogg`: menu button activation.
- `snapOut.ogg`: starting to move away from a snapped placement or disabling a snap mode.
- `snapIn.ogg`: enabling a snap mode or releasing a snapped placement.

Audio is loaded from the relative `assets/` folder after pressing **ENTER IMMERSIVE VR**. The browser must allow audio playback.

## Limitations

This is an alpha prototype. It uses placeholder cubes, not Animal Company models. Item IDs must be entered manually. The generated JSON structure has not been verified in the live game. WebXR requires an HTTPS page. The rotation-center fix, snapping, audio playback, and hand/controller interactions still need testing on a physical Quest 3.
