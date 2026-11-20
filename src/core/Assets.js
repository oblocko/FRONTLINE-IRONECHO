// Runtime asset loading (glTF models under ./assets). URLs resolve against the
// page, so the same paths work in Vite dev, the Vite build and on GitHub Pages.
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

const loader = new GLTFLoader();
const cache = new Map();

export function assetURL(path) { return new URL(`assets/${path}`, document.baseURI).href; }

export function loadGLTF(path) {
  if (!cache.has(path)) cache.set(path, loader.loadAsync(assetURL(path)).catch((e) => { cache.delete(path); throw e; }));
  return cache.get(path);
}
