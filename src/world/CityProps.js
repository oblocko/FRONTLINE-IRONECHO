// Urban asset kit (procedural, original designs): building facades with window
// grids, storefront signage, sedans/SUVs, city bus, traffic lights, bus shelter,
// lane markings and crosswalks, subway entrance canopy.
import * as THREE from 'three';
import { pbr } from '../render/TextureFactory.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const facadeCache = new Map();

// Facade texture: 4 x 4 bays (each bay = one 3 m floor x 3 m window module)
export function facadeTexture(kind = 0, seed = 1) {
  const key = `${kind}:${seed}`; if (facadeCache.has(key)) return facadeCache.get(key);
  const S = 512, c = document.createElement('canvas'); c.width = c.height = S; const g = c.getContext('2d');
  let r = seed * 9301 + 49297; const rnd = () => ((r = (r * 9301 + 49297) % 233280) / 233280);
  const walls = [['#c9c4b8', '#8d887c'], ['#9aa1a6', '#6d7378'], ['#d8d2c4', '#a39b88'], ['#7d7468', '#5a5249'], ['#b8b9b4', '#83847f']];
  const [wc, wd] = walls[kind % walls.length];
  g.fillStyle = wc; g.fillRect(0, 0, S, S);
  // grime streaks
  for (let i = 0; i < 60; i++) { g.fillStyle = `rgba(40,36,30,${rnd() * 0.08})`; g.fillRect(rnd() * S, rnd() * S, 2 + rnd() * 6, 30 + rnd() * 120); }
  const bay = S / 4;
  for (let fy = 0; fy < 4; fy++) for (let fx = 0; fx < 4; fx++) {
    const x0 = fx * bay, y0 = fy * bay;
    g.fillStyle = wd; g.fillRect(x0, y0 + bay * 0.88, bay, bay * 0.12);              // floor slab band
    const wx = x0 + bay * 0.14, wy = y0 + bay * 0.18, ww = bay * 0.72, wh = bay * 0.58;
    const state = rnd();
    const grd = g.createLinearGradient(wx, wy, wx + ww, wy + wh);
    if (state < 0.08) { grd.addColorStop(0, '#d8b070'); grd.addColorStop(1, '#a87830'); }        // lit (generator)
    else if (state < 0.16) { grd.addColorStop(0, '#0b0b0c'); grd.addColorStop(1, '#151515'); }   // broken/black
    else { grd.addColorStop(0, '#5d7486'); grd.addColorStop(0.5, '#2c3a46'); grd.addColorStop(1, '#4a5d6c'); }
    g.fillStyle = grd; g.fillRect(wx, wy, ww, wh);
    g.strokeStyle = '#3a3a3a'; g.lineWidth = 4; g.strokeRect(wx, wy, ww, wh);
    g.beginPath(); g.moveTo(wx + ww / 2, wy); g.lineTo(wx + ww / 2, wy + wh); g.stroke();
    if (kind % 2 === 0) { g.fillStyle = 'rgba(70,70,70,0.9)'; g.fillRect(wx - 4, wy + wh, ww + 8, 8); for (let k = 0; k < 6; k++) g.fillRect(wx + k * ww / 5, wy + wh - 18, 3, 18); } // balcony rail
    if (state > 0.16 && state < 0.3) { g.fillStyle = 'rgba(200,190,170,0.55)'; g.fillRect(wx + 4, wy + 4, ww * 0.3, wh - 8); } // curtain
  }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 8;
  facadeCache.set(key, t); return t;
}

export function signTexture(text, sub = '', bg = '#1d4f8a', fg = '#ffffff') {
  const c = document.createElement('canvas'); c.width = 512; c.height = 128; const g = c.getContext('2d');
  g.fillStyle = bg; g.fillRect(0, 0, 512, 128);
  g.fillStyle = fg; g.font = 'bold 64px "WenQuanYi Zen Hei", "Noto Sans KR", sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText(text, 256, sub ? 52 : 66);
  if (sub) { g.font = '24px sans-serif'; g.globalAlpha = 0.85; g.fillText(sub, 256, 104); }
  for (let i = 0; i < 300; i++) { g.fillStyle = `rgba(30,25,20,${Math.random() * 0.12})`; g.fillRect(Math.random() * 512, Math.random() * 128, 4, 3); }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}

const SHOPS = [['편의점', '24H', '#1f6f4a'], ['약국', 'PHARMACY', '#2a8a4a'], ['연서치킨', '배달 가능', '#c23a2a'], ['카페 바다', 'COFFEE', '#5a3a2a'], ['연서은행', 'BANK', '#1d3f7a'],
  ['안경원', '', '#2a4a7a'], ['분식', '김밥 · 떡볶이', '#d07a1a'], ['부동산', '', '#4a4a4a'], ['휴대폰', '5G', '#7a2a7a'], ['병원', '내과 · 소아과', '#2a6a8a'], ['세탁소', '', '#3a5a6a'], ['노래방', '', '#8a1a5a']];

export class CityKit {
  constructor(game) { this.game = game; this.scene = game.renderer.scene; this.world = game.world; this.shopIdx = 0; }

  // Solid city building (exterior only) with facade, storefront band and roof clutter.
  building({ x, z, w, d, h, kind = 0, shopSide = null, seed = 1 }) {
    const tex = facadeTexture(kind, seed);
    const mk = (rx, ry) => { const m = new THREE.MeshStandardMaterial({ map: tex.clone(), roughness: 0.85, metalness: 0.05 }); m.map.repeat.set(rx, ry); m.map.needsUpdate = true; return m; };
    const roof = pbr('concrete', { color: 0x8a8a86, key: 'cityroof' });
    const mats = [mk(d / 12, h / 12), mk(d / 12, h / 12), roof, roof, mk(w / 12, h / 12), mk(w / 12, h / 12)];
    const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mats); b.position.set(x, h / 2, z); b.castShadow = true; b.receiveShadow = true; this.scene.add(b);
    this.world.addBoxCentered(V(x, h / 2, z), V(w, h, d), { surface: 'concrete', cover: true, walkable: false });
    // parapet + rooftop units
    const par = pbr('concrete', { color: 0x9a9890, key: 'cityparapet' });
    for (const [px, pz, sx, sz] of [[0, d / 2, w, 0.3], [0, -d / 2, w, 0.3], [w / 2, 0, 0.3, d], [-w / 2, 0, 0.3, d]]) { const p = new THREE.Mesh(new THREE.BoxGeometry(sx, 1.1, sz), par); p.position.set(x + px, h + 0.55, z + pz); this.scene.add(p); }
    const unit = pbr('metal', { color: 0x9aa0a0, key: 'ac' });
    for (let i = 0; i < 3; i++) { const u = new THREE.Mesh(new THREE.BoxGeometry(2 + (seed + i) % 3, 1.5, 2), unit); u.position.set(x + ((seed * 7 + i * 13) % 10 - 5) * w / 14, h + 0.75, z + ((seed * 3 + i * 11) % 10 - 5) * d / 14); u.castShadow = true; this.scene.add(u); }
    // storefront band facing the avenue
    if (shopSide) {
      const [nx, nz] = shopSide; const len = nx ? d : w; const n = Math.max(1, Math.floor(len / 9));
      for (let i = 0; i < n; i++) {
        const off = -len / 2 + (i + 0.5) * len / n; const [name, sub, col] = SHOPS[this.shopIdx++ % SHOPS.length];
        const cx = x + nx * (w / 2 + 0.02) + (nx ? 0 : off), cz = z + nz * (d / 2 + 0.02) + (nz ? 0 : off);
        const glass = new THREE.Mesh(new THREE.PlaneGeometry(len / n - 1.2, 3.0), new THREE.MeshStandardMaterial({ color: 0x1c2328, metalness: 0.6, roughness: 0.1, emissive: 0x0a0a08 }));
        glass.position.set(cx, 1.8, cz); glass.rotation.y = Math.atan2(nx, nz); this.scene.add(glass);
        const sign = new THREE.Mesh(new THREE.BoxGeometry(len / n - 1, 1.1, 0.25), [pbr('metal'), pbr('metal'), pbr('metal'), pbr('metal'), new THREE.MeshStandardMaterial({ map: signTexture(name, sub, col), roughness: 0.6 }), pbr('metal')]);
        sign.position.set(cx + nx * 0.15, 3.9, cz + nz * 0.15); sign.rotation.y = Math.atan2(nx, nz); sign.castShadow = true; this.scene.add(sign);
      }
      // awning ledge
      const led = new THREE.Mesh(new THREE.BoxGeometry(nx ? 1.2 : w, 0.25, nx ? d : 1.2), pbr('concrete', { color: 0x777770, key: 'ledge' }));
      led.position.set(x + nx * (w / 2 + 0.6), 4.6, z + nz * (d / 2 + 0.6)); this.scene.add(led);
    }
    return b;
  }

  // Sedan / SUV (original generic shapes). rotY in radians; collider is axis-aligned (approx).
  car({ x, z, rotY = 0, color = 0x8a8f96, kind = 'sedan', wrecked = false, collide = true, dynamic = false }) {
    const g = new THREE.Group(); g.userData.dynamic = dynamic; g.position.set(x, 0, z); g.rotation.y = rotY;
    const paint = new THREE.MeshStandardMaterial({ color: wrecked ? 0x1e1c1a : color, metalness: wrecked ? 0.1 : 0.6, roughness: wrecked ? 0.95 : 0.35 });
    const glass = new THREE.MeshStandardMaterial({ color: 0x141c22, metalness: 0.4, roughness: 0.08 });
    const black = new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.9 });
    const L = kind === 'suv' ? 4.7 : 4.5, W = 1.85, H = kind === 'suv' ? 0.9 : 0.75;
    const body = new THREE.Shape(); body.moveTo(-L / 2, 0.3); body.lineTo(L / 2, 0.3); body.lineTo(L / 2, 0.75); body.lineTo(L / 2 - 0.4, 0.3 + H); body.lineTo(-L / 2 + 0.2, 0.3 + H); body.lineTo(-L / 2, 0.75);
    const bg = new THREE.ExtrudeGeometry(body, { depth: W, bevelEnabled: true, bevelSize: 0.06, bevelThickness: 0.06, bevelSegments: 2 }); bg.translate(0, 0, -W / 2); bg.rotateY(-Math.PI / 2);
    const bm = new THREE.Mesh(bg, paint); bm.castShadow = true; g.add(bm);
    const cab = new THREE.Shape(); const ch = kind === 'suv' ? 0.75 : 0.62, cl = kind === 'suv' ? 2.8 : 2.4, cz0 = kind === 'suv' ? -1.6 : -1.3;
    cab.moveTo(cz0, 0); cab.lineTo(cz0 + cl, 0); cab.lineTo(cz0 + cl - 0.7, ch); cab.lineTo(cz0 + 0.35, ch);
    const cg = new THREE.ExtrudeGeometry(cab, { depth: W - 0.2, bevelEnabled: false }); cg.translate(0, 0.3 + H, -(W - 0.2) / 2); cg.rotateY(-Math.PI / 2);
    g.add(new THREE.Mesh(cg, wrecked ? black : glass));
    const roof = new THREE.Mesh(new THREE.BoxGeometry(W - 0.15, 0.06, cl - 1.15), paint); roof.position.set(0, 0.3 + H + ch, -(cz0 + cl / 2 - 0.15)); g.add(roof);
    const wg = new THREE.CylinderGeometry(0.33, 0.33, 0.24, 14); wg.rotateZ(Math.PI / 2);
    for (const [sx, sz] of [[-1, 1.4], [1, 1.4], [-1, -1.4], [1, -1.4]]) { const wm = new THREE.Mesh(wg, black); wm.position.set(sx * (W / 2 - 0.05), 0.33, Math.sign(sz) * (L / 2 - 0.85)); g.add(wm); }
    const lamp = new THREE.MeshStandardMaterial({ color: 0xffeecc, emissive: wrecked ? 0 : 0x221a10 });
    for (const s of [-1, 1]) { const hl = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.12, 0.04), lamp); hl.position.set(s * 0.6, 0.65, L / 2 + 0.02); g.add(hl); const tl = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.12, 0.04), new THREE.MeshStandardMaterial({ color: 0x7a0a0a })); tl.position.set(s * 0.6, 0.7, -L / 2 - 0.02); g.add(tl); }
    if (wrecked) { g.rotation.z = (Math.random() - 0.5) * 0.08; }
    this.scene.add(g);
    if (collide) {
      const c = Math.abs(Math.cos(rotY)), s = Math.abs(Math.sin(rotY));
      const sx = W * c + L * s, sz = W * s + L * c;
      g.userData.collider = this.world.addBoxCentered(V(x, 0.75, z), V(sx * 0.92, 1.5, sz * 0.92), { surface: 'metal', cover: true });
    }
    return g;
  }

  bus({ x, z, rotY = 0, color = 0x2f7a4a }) {
    const g = new THREE.Group(); g.userData.dynamic = true; g.position.set(x, 0, z); g.rotation.y = rotY;
    const paint = new THREE.MeshStandardMaterial({ color, metalness: 0.4, roughness: 0.45 }), white = new THREE.MeshStandardMaterial({ color: 0xe8e8e2, metalness: 0.3, roughness: 0.5 });
    const glass = new THREE.MeshStandardMaterial({ color: 0x121a20, metalness: 0.5, roughness: 0.08 }), black = new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.9 });
    const add = (geo, m, px, py, pz) => { const o = new THREE.Mesh(geo, m); o.position.set(px, py, pz); o.castShadow = true; g.add(o); return o; };
    add(new THREE.BoxGeometry(2.5, 1.3, 11), paint, 0, 1.0, 0); add(new THREE.BoxGeometry(2.5, 1.2, 11), white, 0, 2.25, 0); add(new THREE.BoxGeometry(2.4, 0.15, 10.9), white, 0, 2.92, 0);
    for (const s of [-1, 1]) add(new THREE.BoxGeometry(0.02, 0.95, 9.6), glass, s * 1.26, 2.2, -0.3);
    add(new THREE.BoxGeometry(2.3, 1.5, 0.04), glass, 0, 2.0, 5.51);
    const door = add(new THREE.BoxGeometry(0.03, 2.0, 1.1), glass, 1.27, 1.45, 3.6);
    const wg = new THREE.CylinderGeometry(0.5, 0.5, 0.3, 16); wg.rotateZ(Math.PI / 2);
    g.userData.wheels = [];
    for (const [sx, sz] of [[-1, 3.6], [1, 3.6], [-1, -3.3], [1, -3.3]]) g.userData.wheels.push(add(wg, black, sx * 1.15, 0.5, sz));
    const sign = add(new THREE.BoxGeometry(1.6, 0.3, 0.04), new THREE.MeshBasicMaterial({ map: signTexture('대피 · 연서시청', '', '#111', '#ffb000'), toneMapped: false }), 0, 2.75, 5.53);
    this.scene.add(g); g.userData.door = door;
    return g;
  }

  trafficLight(x, z, rotY = 0) {
    const g = new THREE.Group(); g.position.set(x, 0, z); g.rotation.y = rotY;
    const m = pbr('paintedMetal', { color: 0x4a4e50, key: 'tl' });
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.12, 6, 8), m); pole.position.y = 3; g.add(pole);
    const arm = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.12, 5), m); arm.position.set(0, 5.8, 2.5); g.add(arm);
    const box = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.35, 0.3), new THREE.MeshStandardMaterial({ color: 0x1a1a1a })); box.position.set(0, 5.6, 4.6); g.add(box);
    for (let i = 0; i < 3; i++) { const l = new THREE.Mesh(new THREE.CircleGeometry(0.11, 12), new THREE.MeshStandardMaterial({ color: 0x222222 })); l.position.set(-0.35 + i * 0.35, 5.6, 4.76); g.add(l); } // dark (blackout)
    this.scene.add(g); this.world.addBoxCentered(V(x, 3, z), V(0.3, 6, 0.3), { surface: 'metal', walkable: false });
  }

  busShelter(x, z, rotY = 0) {
    const g = new THREE.Group(); g.position.set(x, 0, z); g.rotation.y = rotY;
    const m = pbr('metal', { color: 0x777a7a, key: 'shelter' });
    const glass = new THREE.MeshStandardMaterial({ color: 0x8aa0a8, transparent: true, opacity: 0.3, roughness: 0.1, side: THREE.DoubleSide });
    const roof = new THREE.Mesh(new THREE.BoxGeometry(4, 0.12, 1.8), m); roof.position.set(0, 2.6, 0); g.add(roof);
    const back = new THREE.Mesh(new THREE.PlaneGeometry(4, 2.2), glass); back.position.set(0, 1.4, -0.85); g.add(back);
    for (const s of [-1, 1]) { const p = new THREE.Mesh(new THREE.BoxGeometry(0.08, 2.6, 0.08), m); p.position.set(s * 1.95, 1.3, -0.85); g.add(p); }
    const bench = new THREE.Mesh(new THREE.BoxGeometry(3, 0.08, 0.45), m); bench.position.set(0, 0.5, -0.5); g.add(bench);
    this.scene.add(g);
  }

  // road paint: dashed lane lines and zebra crossings (thin unlit planes)
  laneLine(x, z0, z1, { dashed = true, color = 0xe8e2d0, width = 0.15, alongX = false } = {}) {
    const m = new THREE.MeshStandardMaterial({ color, roughness: 0.9, polygonOffset: true, polygonOffsetFactor: -3 });
    const len = Math.abs(z1 - z0); const step = dashed ? 6 : len; const seg = dashed ? 3 : len;
    for (let t = 0; t < len; t += step) {
      const p = new THREE.Mesh(new THREE.PlaneGeometry(width, seg), m); p.rotation.x = -Math.PI / 2;
      const c = Math.min(z0, z1) + t + seg / 2; if (alongX) { p.rotation.z = Math.PI / 2; p.position.set(c, 0.02, x); } else p.position.set(x, 0.02, c);
      this.scene.add(p);
    }
  }
  crosswalk(x, z, width, alongX = false) {
    const m = new THREE.MeshStandardMaterial({ color: 0xe6e0d0, roughness: 0.9, polygonOffset: true, polygonOffsetFactor: -3 });
    for (let i = -width / 2; i < width / 2; i += 1.2) {
      const p = new THREE.Mesh(new THREE.PlaneGeometry(0.6, 3.5), m); p.rotation.x = -Math.PI / 2;
      if (alongX) p.position.set(x, 0.021, z + i); else { p.rotation.z = Math.PI / 2; p.position.set(x + i, 0.021, z); }
      this.scene.add(p);
    }
  }
  subwayEntrance(x, z, rotY, label) {
    const g = new THREE.Group(); g.position.set(x, 0, z); g.rotation.y = rotY;
    const m = pbr('metal', { color: 0x6a7a80, key: 'subway' });
    const glass = new THREE.MeshStandardMaterial({ color: 0x6a8890, transparent: true, opacity: 0.35, roughness: 0.1, side: THREE.DoubleSide });
    const roof = new THREE.Mesh(new THREE.BoxGeometry(3.4, 0.15, 6), glass); roof.position.set(0, 2.9, 0); g.add(roof);
    for (const [px, pz] of [[-1.6, -2.9], [1.6, -2.9], [-1.6, 2.9], [1.6, 2.9]]) { const p = new THREE.Mesh(new THREE.BoxGeometry(0.1, 2.9, 0.1), m); p.position.set(px, 1.45, pz); g.add(p); }
    for (const s of [-1, 1]) { const wall = new THREE.Mesh(new THREE.BoxGeometry(0.15, 1.1, 6), pbr('concrete', { key: 'subwall' })); wall.position.set(s * 1.65, 0.55, 0); g.add(wall); }
    // stairs going down (visual) + dark opening
    const step = pbr('concrete', { color: 0x9a9a96, key: 'steps' });
    for (let i = 0; i < 8; i++) { const st = new THREE.Mesh(new THREE.BoxGeometry(3.1, 0.18, 0.6), step); st.position.set(0, -0.09 - i * 0.18, 2.4 - i * 0.6); g.add(st); }
    const hole = new THREE.Mesh(new THREE.PlaneGeometry(3.1, 6), new THREE.MeshBasicMaterial({ color: 0x050505 })); hole.rotation.x = -Math.PI / 2; hole.position.set(0, -1.5, -0.6); g.add(hole);
    const sign = new THREE.Mesh(new THREE.BoxGeometry(2.8, 0.5, 0.1), new THREE.MeshBasicMaterial({ map: signTexture(label, 'YEONSEO STN · EXIT 3', '#2a5aa8'), toneMapped: false }));
    sign.position.set(0, 3.25, 3); g.add(sign);
    this.scene.add(g);
    for (const s of [-1, 1]) { const off = new THREE.Vector3(s * 1.65, 0, 0).applyAxisAngle(V(0, 1, 0), rotY); this.world.addBoxCentered(V(x + off.x, 0.55, z + off.z), Math.abs(Math.sin(rotY)) > 0.5 ? V(6, 1.1, 0.15) : V(0.15, 1.1, 6), { surface: 'concrete' }); }
    return g;
  }
}
