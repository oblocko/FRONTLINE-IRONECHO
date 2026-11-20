import { Game } from './core/Game.js';

function webglOK() {
  try { const c = document.createElement('canvas'); return !!c.getContext('webgl2'); } catch { return false; }
}

if (!webglOK()) {
  // keep the static description page visible and explain why the game can't start here
  const about = document.getElementById('about');
  if (about) about.style.display = 'block';
  if (about) about.insertAdjacentHTML('afterbegin', '<p class="notice"><strong>이 브라우저에서는 WebGL 2를 사용할 수 없어 게임을 실행할 수 없습니다.</strong> 최신 Chrome · Edge · Firefox에서 하드웨어 가속을 켠 뒤 다시 열어 주세요.</p>');
} else {
  document.getElementById('about')?.remove();
  const game = new Game();
  game.boot().catch((e) => { console.error(e); });
}
