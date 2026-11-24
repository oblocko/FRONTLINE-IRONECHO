// Window glass with a room behind it (interior mapping). Each window is a unit plane scaled to its size
// (instance matrix scale); the fragment shader casts the view ray into a box room behind the glass
// and shades walls, floor, ceiling, furniture (or shop shelving), a ceiling light, curtains / blinds /
// a roller shutter, then lays a Fresnel sky reflection on top. Per-instance colour encodes
// r = room seed, g = light level (0 = dark), b = light temperature (0 warm .. 1 cool).
import * as THREE from 'three';

const vert = /* glsl */`
varying vec3 vP; varying vec3 vC; varying vec3 vSeed; varying vec2 vSize;
#include <common>
#include <fog_pars_vertex>
void main() {
  mat4 im = mat4(1.0);
  #ifdef USE_INSTANCING
  im = instanceMatrix;
  #endif
  vec2 sc = vec2(length(im[0].xyz), length(im[1].xyz));
  vSize = sc; vP = vec3(position.xy * sc, position.z);
  mat4 m = modelMatrix * im; mat4 mr = m; mr[0].xyz /= sc.x; mr[1].xyz /= sc.y;
  vC = (inverse(mr) * vec4(cameraPosition, 1.0)).xyz;
  vSeed = vec3(0.37, 0.0, 0.5);
  #ifdef USE_INSTANCING_COLOR
  vSeed = instanceColor;
  #endif
  vec4 mvPosition = viewMatrix * m * vec4(position, 1.0);
  gl_Position = projectionMatrix * mvPosition;
  #include <fog_vertex>
}`;

const frag = /* glsl */`
uniform vec3 uSky; uniform vec3 uGround; uniform float uDay; uniform float uShop;
uniform float uPad; uniform float uSill; uniform float uRoomH; uniform float uDepth;
varying vec3 vP; varying vec3 vC; varying vec3 vSeed; varying vec2 vSize;
#include <common>
#include <fog_pars_fragment>
float h1(float n) { return fract(sin(n * 12.9898 + 4.1414) * 43758.5453); }
vec3 product(float n) {
  float k = h1(n);
  return k < 0.2 ? vec3(0.75, 0.15, 0.1) : k < 0.4 ? vec3(0.9, 0.85, 0.75) : k < 0.55 ? vec3(0.15, 0.35, 0.7) : k < 0.7 ? vec3(0.9, 0.6, 0.1) : k < 0.85 ? vec3(0.2, 0.55, 0.3) : vec3(0.3, 0.3, 0.32);
}
void main() {
  vec3 p = vP; vec3 d = normalize(p - vC);
  float s = floor(vSeed.r * 997.0); float L = vSeed.g; float temp = vSeed.b;
  float hw = vSize.x * 0.5 + uPad, fl = -vSize.y * 0.5 - uSill, ce = fl + uRoomH, bk = p.z - uDepth;
  vec3 lc = mix(vec3(1.0, 0.72, 0.45), vec3(0.82, 0.92, 1.0), temp);
  vec3 col = uGround;
  if (d.z < -1e-4) {
    float dx = abs(d.x) < 1e-5 ? 1e-5 : d.x, dy = abs(d.y) < 1e-5 ? 1e-5 : d.y;
    float tx = ((dx > 0.0 ? hw : -hw) - p.x) / dx, ty = ((dy > 0.0 ? ce : fl) - p.y) / dy, tz = (bk - p.z) / d.z;
    float t = min(tx, min(ty, tz)); vec3 q = p + d * t; vec3 n; vec3 base;
    vec3 wallC = mix(vec3(0.62, 0.58, 0.5), vec3(0.5, 0.54, 0.54), h1(s + 1.0)) * (0.8 + 0.3 * h1(s + 2.0));
    float hy = q.y - fl;                      // height above the room floor
    if (t == tz) {
      n = vec3(0.0, 0.0, 1.0); base = wallC;
      if (uShop < 0.5) {
        float fx = (h1(s + 3.0) - 0.5) * hw, fw = 0.35 + h1(s + 4.0) * 0.6, fh = 0.7 + h1(s + 5.0) * 1.3;
        if (abs(q.x - fx) < fw && hy < fh) { base = mix(vec3(0.22, 0.15, 0.1), vec3(0.45, 0.42, 0.38), h1(s + 6.0)); if (abs(hy - fh) < 0.03) base *= 1.4; }
        float px = fx > 0.0 ? fx - fw - 0.6 : fx + fw + 0.6;
        if (h1(s + 7.0) > 0.35 && abs(q.x - px) < 0.32 && abs(hy - 1.6) < 0.24) base = abs(q.x - px) > 0.28 || abs(hy - 1.6) > 0.2 ? vec3(0.15) : vec3(0.35, 0.4, 0.38) * (0.5 + h1(s + 8.0));
        if (abs(hy - 0.04) < 0.05) base *= 0.6;   // skirting
      }
    } else if (t == tx) {
      n = vec3(-sign(dx), 0.0, 0.0); base = wallC * 0.9;
      if (uShop < 0.5 && hy < 0.5 && q.z < p.z - uDepth * 0.4 && h1(s + 9.0 + sign(dx)) > 0.4) base = mix(vec3(0.32, 0.28, 0.25), vec3(0.18, 0.22, 0.32), h1(s + 10.0));
      if (uShop < 0.5 && abs(q.z - (p.z - uDepth * 0.25)) < 0.45 && hy < 2.05 && h1(s + 17.0 + sign(dx)) > 0.6) base = vec3(0.4, 0.3, 0.22);   // a door
    } else if (dy > 0.0) {
      n = vec3(0.0, -1.0, 0.0); base = vec3(0.82, 0.8, 0.76);
      if (uShop > 0.5 && h1(s + 40.0) > 0.5 && abs(fract(q.z * 0.33) - 0.5) < 0.05 && abs(q.x) < hw * 0.6) base = vec3(2.2) * (0.1 + L);   // fluorescent strips
      if (uShop > 0.5 && h1(s + 40.0) < 0.5 && abs(fract(q.z * 0.4) - 0.5) < 0.03 && abs(q.x) < hw - 0.6) base = vec3(2.4) * (0.08 + L);
    } else {
      n = vec3(0.0, 1.0, 0.0);
      base = uShop > 0.5 ? mix(vec3(0.6, 0.6, 0.58), vec3(0.5, 0.5, 0.48), step(0.5, fract(q.x * 1.6) + fract(q.z * 1.6) - 0.5 * floor(fract(q.x * 1.6) * 2.0)))
                         : mix(vec3(0.38, 0.26, 0.16), vec3(0.5, 0.48, 0.44), h1(s + 11.0)) * (0.9 + 0.1 * sin(q.x * 40.0));
      if (uShop < 0.5 && h1(s + 18.0) > 0.4 && length((q.xz - vec2(0.0, p.z - uDepth * 0.55)) * vec2(0.8, 1.2)) < 0.9) base = mix(vec3(0.45, 0.2, 0.15), vec3(0.25, 0.3, 0.4), h1(s + 19.0));   // rug
    }
    float kind = h1(s + 40.0);                // shops: < 0.5 store, < 0.75 restaurant, else office / clinic
    if (uShop > 0.5) {
      if (kind < 0.5) {
        if (t != ty && hy < 2.1) {             // shelving on the back and side walls, stocked (gaps where sold out)
          float row = floor(hy / 0.42), k = fract(hy / 0.42); float a = t == tz ? q.x : q.z; float item = fract(a * 6.0);
          base = k < 0.1 ? vec3(0.42, 0.43, 0.45) : (k > 0.85 || item < 0.1) ? vec3(0.07) : mix(product(floor(a * 6.0) + row * 31.0 + s), vec3(0.45, 0.44, 0.42), 0.5) * (0.5 + 0.5 * h1(floor(a * 6.0) + row * 7.0));
          if (h1(floor(a * 1.5) + row * 3.0 + s) < 0.3 && k >= 0.1) base = vec3(0.1);
        }
      } else if (kind < 0.75) {
        if (t != ty) base = hy < 1.0 ? vec3(0.3, 0.2, 0.13) : mix(vec3(0.55, 0.42, 0.3), vec3(0.3, 0.32, 0.3), h1(s + 41.0));   // wainscot + paint
        if (t == tz && hy > 1.5 && hy < 2.2 && abs(q.x) < hw * 0.6) base = vec3(0.12, 0.1, 0.08) + 0.5 * step(0.7, fract(q.x * 2.0)) * vec3(0.6, 0.5, 0.3);   // menu boards
      } else {
        if (t != ty) base = vec3(0.7, 0.72, 0.72);
        if (t == tz && hy > 1.2 && hy < 1.8 && abs(q.x) < 1.5) base = vec3(0.2, 0.35, 0.45);   // logo panel
      }
      if (dy < 0.0 && t == ty) base = kind < 0.5 ? base : kind < 0.75 ? vec3(0.32, 0.24, 0.17) * (0.9 + 0.1 * sin(q.x * 30.0)) : vec3(0.55, 0.56, 0.55);
    }
    // free-standing pieces between the glass and the back wall: counter, shelf gondola / tables / desks
    if (uShop > 0.5 && d.z < -1e-4) {
      for (int i = 0; i < 3; i++) {
        float zc = i == 0 ? 1.6 + h1(s + 42.0) * 0.8 : i == 1 ? 3.4 : 5.0;
        float tp = -zc / d.z; if (tp >= t) continue;
        vec3 r = p + d * tp; float ry = r.y - fl;
        float top = kind < 0.5 ? (i == 0 ? 1.0 : 1.5) : kind < 0.75 ? 0.75 : 0.78;
        bool hit = ry < top;
        if (kind < 0.5) hit = hit && (i == 0 ? r.x > hw * (h1(s + 43.0) - 0.5) * 0.8 : abs(fract(r.x / 3.0 + h1(s + 44.0)) - 0.5) < 0.33);
        else hit = hit && abs(fract(r.x / 1.6 + float(i) * 0.37 + h1(s + 45.0)) - 0.5) < 0.24 && (ry > top - 0.06 || abs(fract(r.x / 1.6 + float(i) * 0.37 + h1(s + 45.0)) - 0.5) < 0.03);
        if (hit) {
          t = tp; q = r; hy = ry; n = vec3(0.0, 0.0, 1.0);
          if (kind < 0.5) { float k = fract(ry / 0.38); base = i == 0 ? vec3(0.5, 0.5, 0.52) * (ry > top - 0.05 ? 1.3 : 0.8) : (k < 0.12 ? vec3(0.4) : mix(product(floor(r.x * 6.0) + floor(ry / 0.38) * 17.0 + s + float(i)), vec3(0.45), 0.5) * (fract(r.x * 6.0) < 0.1 ? 0.2 : 0.8)); }
          else base = kind < 0.75 ? vec3(0.35, 0.24, 0.15) : vec3(0.6, 0.6, 0.58);
          break;
        }
      }
    }
    // ceiling light(s) + daylight falling in from the window + soft corner occlusion
    vec3 lamp = vec3(0.0, ce - 0.12, p.z - uDepth * 0.5); vec3 tl = lamp - q; float dist = length(tl);
    float lit = L * (0.25 + 1.4 * max(dot(n, tl / dist), 0.0) / (1.0 + dist * dist * 0.25));
    if (uShop < 0.5 && dy > 0.0) lit += L * 3.0 * exp(-dot(q.xz - lamp.xz, q.xz - lamp.xz) * 6.0);
    float day = uDay * (0.05 + 0.24 * exp(-(p.z - q.z) * 0.6)) * (dy < 0.0 && t == ty ? 1.3 : 1.0);
    float edge = min(min(hw - abs(q.x), min(hy, ce - q.y)), q.z - bk);
    float ao = 0.55 + 0.45 * smoothstep(0.0, 0.4, edge);
    col = base * (lc * lit + vec3(day)) * ao;
  }
  // curtains / blinds (homes), roller shutter (shops), at the glass
  vec2 u = vec2(p.x / vSize.x + 0.5, p.y / vSize.y + 0.5); float cs = h1(s + 12.0);
  vec3 through = lc * L * 0.75 + vec3(uDay * 0.45);
  if (uShop < 0.5) {
    if (cs < 0.5) {
      float cl = 0.1 + h1(s + 13.0) * 0.35, cr = 0.1 + h1(s + 14.0) * 0.35;
      if (u.x < cl || u.x > 1.0 - cr) { vec3 cc = mix(vec3(0.82, 0.78, 0.68), vec3(0.55, 0.3, 0.25), step(0.6, h1(s + 15.0))); col = cc * (0.75 + 0.25 * sin(u.x * vSize.x * 38.0)) * through; }
      else if (h1(s + 21.0) > 0.5) col = mix(col, vec3(0.9, 0.88, 0.82) * through, 0.55);   // sheer net
    } else if (cs < 0.78) {
      float b = 1.0 - (0.15 + h1(s + 16.0) * 0.75);
      if (u.y > b) col = mix(vec3(0.72, 0.71, 0.67), vec3(0.52, 0.52, 0.5), step(0.75, fract(u.y * vSize.y * 14.0))) * through;
    }
  } else if (cs < 0.35) {
    float b = 1.0 - (0.25 + h1(s + 16.0) * 0.75);
    if (u.y > b) col = mix(vec3(0.42, 0.43, 0.42), vec3(0.3, 0.31, 0.3), step(0.6, fract(u.y * vSize.y * 9.0))) * (uDay * 0.9 + 0.06) * (0.85 + 0.3 * h1(floor(u.x * 3.0) + s));
  }
  // glass: Fresnel reflection of the sky / street, a faint smudge
  float cosT = clamp(-d.z, 0.0, 1.0); float fr = 0.06 + uShop * 0.06 + 0.7 * pow(1.0 - cosT, 4.0);
  vec3 refl = mix(uGround, uSky, smoothstep(-0.25, 0.35, d.y)) * (0.9 + 0.2 * h1(s + 30.0));
  col = mix(col, refl, clamp(fr * (1.0 - 0.5 * min(L, 1.0)), 0.0, 1.0));
  gl_FragColor = vec4(col, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
  #include <fog_fragment>
}`;

// room: { pad, sill, height, depth } in metres around a w x h window; shop: shelving + strip lights + shutters
export function interiorMaterial({ sky = 0x9aa4ac, ground = 0x4a4844, day = 1, shop = false, pad = 0.5, sill = 0.9, height = 2.7, depth = 4 } = {}) {
  return new THREE.ShaderMaterial({
    uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, {
      uSky: { value: new THREE.Color(sky) }, uGround: { value: new THREE.Color(ground) }, uDay: { value: day }, uShop: { value: shop ? 1 : 0 },
      uPad: { value: pad }, uSill: { value: sill }, uRoomH: { value: height }, uDepth: { value: depth } }]),
    vertexShader: vert, fragmentShader: frag, fog: true, polygonOffset: true, polygonOffsetFactor: -1,
  });
}
// unit window plane (scaled per instance), pushed `z` off the wall
export const windowPlane = (z = 0.02) => new THREE.PlaneGeometry(1, 1).translate(0, 0, z);
// seed colour for an instance: seed 0..1, light level, temperature
export const roomColor = (seed, light, temp) => new THREE.Color(seed, light, temp);
