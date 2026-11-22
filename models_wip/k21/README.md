# K21 IFV (work in progress, not used by the game)

Original procedural model (`tools/k21/k21_hull.js` + `tools/k21/k21_turret.js`) built from the vehicle's
published dimensions (≈6.9 m long, 3.4 m wide) and reference photos. Hull proportions were checked against a
reference model on Sketchfab; no geometry from it is used.

- `k21.glb` — hull + turret, ~72k triangles. Hierarchy ready for gameplay: `turret` (yaw, ring centre) → `gun`
  (pitch at the trunnion) → `muzzle`.
- Camouflage: current ROK armour scheme after the photos — sand base, large dark-green fields, black streaks along
  the field edges, cream/black "gull" marks (generated texture, tiles seamlessly).
- `k21_preview.png` — front 3/4, rear 3/4, side, top. `k21_side_vs_reference.png` — side silhouette check.

Rebuild: serve the repo root (`python3 -m http.server 5182`) and run `node tools/k21/export.mjs http://localhost:5182`.
