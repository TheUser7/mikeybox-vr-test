# Goop VR Builder — Quest 3 prototype

This is a small standalone WebXR prototype. It does not load the original Mikeybox website or its private server files.

## Open it on Quest 3

1. Upload the contents of this folder to a static HTTPS host you control (for example, a GitHub Pages repository).
2. Open the HTTPS page in Quest Browser.
3. Press **Enter VR** and allow the browser's VR prompt.
4. Create a root using an `item_...` ID. Select it, then use **Add part** to attach children.
5. Select blocks with a controller trigger. Use the web panel to change the selected item's ID, position, or scale modifier.
6. Export JSON when finished.

## Current prototype limits

- The 3D blocks are placeholders, not the game's actual item meshes.
- Item IDs are entered manually; this build does not include the game's item catalog.
- The JSON uses the editor's native invention object shape (`itemID`, item fields, `children`, and recursive `stuckChildren` edges).
- Newly authored child edges use `subParentID: 0`, zero grab-pose offsets, and the displayed position/quaternion as the edge pose. Some prefabs use special attachment frames or grab poses, so those builds need validation in the real editor before relying on them in-game.
- No promise is made that every generated build will pass the game's own rules. Test with a simple harmless build first.
- This prototype supports one root invention per file. It does not implement all editor features, inventory/container contents, validation, undo, or Workshop.

## Hosting

Serve this folder from an HTTPS static host. WebXR immersive sessions generally require a secure context. The CDN import requires internet access when the page loads.
