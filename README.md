# Goop VR Builder — immersive editor alpha

A small browser-based WebXR prototype intended for Meta Quest Browser. **All build editing happens inside the immersive VR session.** The normal webpage only has an Enter VR button and setup instructions.

## Publish with GitHub Pages

1. Create a GitHub repository.
2. Upload the contents of this folder (`index.html`, `style.css`, `app.js`) to the repository root.
3. Open **Settings → Pages**.
4. Select **Deploy from a branch**, choose `main` and `/(root)`, then save.
5. Open the generated `https://YOUR-USERNAME.github.io/REPOSITORY/` address in Quest Browser.
6. Press **Enter Immersive VR** and allow the VR session.

## VR controls

- **Trigger on a menu button:** activate it.
- **Trigger on a block:** select that item.
- **Hold grip near the selected block:** grab it. Move and rotate your controller to move and rotate the block; release grip to place it.
- **New Root / Add Part / Delete:** manage the build hierarchy.
- **Edit ID:** opens an in-world keyboard. It automatically adds the `item_` prefix.
- **Move buttons:** nudge the selected item by 5 cm along its parent-local X/Y/Z axes.
- **Rotate buttons:** rotate the selected item by 15 degrees around its parent-local X/Y/Z axes.
- **Scale buttons:** change its `scaleModifier` by one.
- **Export:** requests a JSON download from Quest Browser.
- **Import:** opens the browser's file picker for an existing invention JSON file.
- **Re-center Menu:** puts the floating control panel in front of the headset's current view.

## Current alpha limitations

- Blocks are placeholder cubes with the item ID displayed above them. Real game models and the game's item catalog are not included.
- Item IDs are entered manually; this prototype does not verify that an ID exists in the game.
- Exact prefab attachment frames, grab poses, special item behavior, and full game-side validation are not implemented.
- Import/export follows the native-style structure used by the prototype source analysis, but files have not been verified against every version of the original editor or game. Keep backups of inventions.
- Quest Browser behavior for file-picker import and download prompts can vary. The headset/browser may show a system file dialog or download notification outside the 3D scene.

Use only model assets and game data you have permission to use. This project is an independent prototype and is not affiliated with the game or the original editor.
