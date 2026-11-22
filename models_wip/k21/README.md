# K21 IFV — hull (work in progress, not used by the game)

Original procedural model built in `tools/k21/k21_hull.js` from the vehicle's published dimensions
(≈6.9 m long, 3.4 m wide, hull roof ≈1.9 m) and its general layout. Proportions were checked against a
reference model on Sketchfab; no geometry from that model is used.

- `k21_hull.glb` — hull only (no turret), ~29k triangles, ROK 3-colour camouflage (generated texture)
- `k21_hull_preview.png` — front 3/4, rear 3/4, side, top

Rebuild: serve the repo root (`python3 -m http.server 5182`) and run `node tools/k21/export.mjs http://localhost:5182`.
