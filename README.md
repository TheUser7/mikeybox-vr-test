# Goop VR Builder — Immersive VR Edition (Dark-screen fix)

This is an experimental, Quest Browser / WebXR prototype. Editing controls are displayed inside immersive VR.

## Publish on GitHub Pages

1. Extract this ZIP.
2. Upload `index.html`, `style.css`, `app.js`, and `README.md` to the root of your GitHub repository, replacing the previous copies.
3. Commit the changes to the `main` branch.
4. Keep GitHub Pages set to **Deploy from a branch → main → /(root)**.
5. Wait for the Pages deployment to finish, then reload the site in Quest Browser. A full refresh may be needed to clear the old cached JavaScript.

## What's changed in this build

- Added an actual sky dome and unlit floor/object materials so the scene remains visible when an XR browser ignores the normal scene background or lighting.
- Moved menu placement to the first live XR animation frame, when the headset pose is available, instead of trying to position it immediately after requesting the session.
- Reset the desktop preview camera offset when entering immersive VR and restore it when leaving.
- Brightened controller pointer rays.

## Controls

- Point and press trigger to select menu controls or objects.
- Hold grip near the selected object to move and rotate it.
- Use the floating VR panel to create a root, add attached parts, delete parts, edit item IDs, move, rotate, scale, import and export JSON.

## Limitations

This is an alpha prototype. It uses placeholder cubes, not Animal Company models. Item IDs must be entered manually. The generated JSON structure has not been verified in the live game. WebXR requires an HTTPS page and a compatible browser. Quest-specific behavior still needs to be tested on the actual headset.
