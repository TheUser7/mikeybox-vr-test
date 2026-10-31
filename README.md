# Goop VR Builder — Left-Hand Menu + Hand Tracking

Experimental Quest Browser / WebXR prototype. The editor runs in immersive VR, with the control panel following the left wrist when hand tracking is available.

## Publish on GitHub Pages

1. Extract this ZIP.
2. Upload `index.html`, `style.css`, `app.js`, and `README.md` to the root of your GitHub repository, replacing the previous copies.
3. Commit the changes to the `main` branch.
4. Keep GitHub Pages set to **Deploy from a branch → main → /(root)**.
5. Wait for the Pages deployment to finish, then reload the site in Quest Browser. A full refresh may be needed to clear cached JavaScript.

## Hand tracking controls

- Enable hand tracking on the Quest 3 and open the site in Quest Browser.
- The editor menu follows the left wrist and faces toward the headset.
- Point at a menu button with your right index finger and pinch to press it. (The menu can also be aimed at with a controller.)
- To move a part, bring your thumb and index finger close together near the part, keep them pinched, and move your hand. Open your fingers to release.
- A simple tracked hand skeleton is rendered while hand tracking is active.

## Controller fallback

- Point and press trigger to select menu controls or objects.
- Move a controller hand close to a part and hold its grip/squeeze button to grab, move and rotate it. Release to place it.

## Builder features

Create a root, add attached parts, delete parts, edit item IDs with the in-VR keyboard, nudge, rotate, scale, import and export invention JSON.

## Limitations

This is an alpha prototype. It uses placeholder cubes, not Animal Company models. Item IDs must be entered manually. The generated JSON structure has not been verified in the live game. Hand tracking depends on the Quest Browser/WebXR hand-tracking feature being available and enabled. WebXR requires an HTTPS page. Quest-specific behavior still needs testing on the physical headset.
